#!/usr/bin/env python3
"""Map parent-tetrahedron rendering points to a midpoint-refined Vm basis.

API
---
refine_render_mapping(source_ids, barycentric_weights, unique_edges,
                      original_node_count, *, tolerance=2e-7)
    -> (refined_source_ids, refined_weights)

Inputs have shapes (R, 4), (R, 4), and (E, 2). Each edge midpoint has global
source ID original_node_count + its row index in unique_edges. Edge row order
and endpoint orientation may be arbitrary, but edges must be unique.

The eight child tetrahedra use the central octahedron diagonal 01--23. Source
IDs in positive-weight parent slots must be valid electrical node IDs, already
split at the AV interface. Zero-weight slots may contain repeated IDs, padding,
or invalid IDs; they are never used to invent a tetrahedron. Exact parent
vertices/edges/faces are mapped on their own refined boundary simplices.

The returned weights interpolate *Vm at refined nodes*. Interpolating AT/APD
and then evaluating an AP at a rendering point would be a different operation.
All four returned IDs are valid, including the zero-weight padding slots.
"""
from __future__ import annotations

import argparse
import itertools
import json
import numpy as np

EDGE_PAIRS = np.array(list(itertools.combinations(range(4), 2)), dtype=np.int64)
PARENT_BARYCENTRIC_NODES = np.vstack([
    np.eye(4), np.eye(4)[EDGE_PAIRS].mean(axis=1),
])
RED_CHILDREN = np.array([
    [0, 4, 5, 6], [1, 4, 7, 8], [2, 5, 7, 9], [3, 6, 8, 9],
    [4, 5, 6, 9], [4, 5, 7, 9], [4, 6, 8, 9], [4, 7, 8, 9],
], dtype=np.int64)
CHILD_BARYCENTRIC_INVERSES = np.linalg.inv(PARENT_BARYCENTRIC_NODES[RED_CHILDREN])


def refine_render_mapping(source_ids, barycentric_weights, unique_edges,
                          original_node_count, *, tolerance=2e-7):
    """Return four refined source IDs and interpolation weights per point.

    Duplicate positive-weight IDs are combined before mapping. Negative
    weights within ``tolerance`` are clipped to zero, and row sums must already
    be within ``tolerance`` of one before roundoff normalization. Missing
    required electrical edges raise ValueError rather than bridging domains.
    No geometry or source arrays are changed in place.
    """
    ids = np.asarray(source_ids)
    weights = np.asarray(barycentric_weights, dtype=np.float64)
    edges = np.asarray(unique_edges)
    n = int(original_node_count)
    if n != original_node_count or n <= 0 or n > 3_000_000_000:
        raise ValueError("original_node_count must be a positive supported integer")
    if not np.isfinite(tolerance) or tolerance <= 0:
        raise ValueError("tolerance must be finite and positive")
    if ids.ndim != 2 or ids.shape[1] != 4 or weights.shape != ids.shape:
        raise ValueError("source_ids and barycentric_weights must both have shape (R, 4)")
    if ids.dtype.kind not in "iu" or edges.dtype.kind not in "iu":
        raise ValueError("Source and edge IDs must use an integer dtype")
    if edges.ndim != 2 or edges.shape[1] != 2:
        raise ValueError("unique_edges must have shape (E, 2)")
    if not np.all(np.isfinite(weights)) or np.any(weights < -tolerance):
        raise ValueError("Invalid barycentric weights")
    row_sums = weights.sum(axis=1)
    if np.any(np.abs(row_sums - 1) > tolerance):
        raise ValueError("Parent barycentric weights must sum to one")
    positive = weights > 0
    if np.any((ids[positive] < 0) | (ids[positive] >= n)):
        raise ValueError("A positive-weight source ID is outside the original electrical mesh")
    if np.any((edges < 0) | (edges >= n)) or np.any(edges[:, 0] == edges[:, 1]):
        raise ValueError("Edges must join distinct original electrical nodes")
    weights = np.maximum(weights, 0)
    weights /= weights.sum(axis=1)[:, None]
    lower = np.minimum(edges[:, 0], edges[:, 1]).astype(np.int64)
    upper = np.maximum(edges[:, 0], edges[:, 1]).astype(np.int64)
    edge_keys = lower * n + upper
    already_sorted = bool(np.all(edge_keys[1:] > edge_keys[:-1]))
    order = None if already_sorted else np.argsort(edge_keys)
    sorted_keys = edge_keys if already_sorted else edge_keys[order]
    if np.any(sorted_keys[1:] == sorted_keys[:-1]):
        raise ValueError("unique_edges contains duplicate unoriented edges")
    dtype = np.int32 if n + len(edges) <= np.iinfo(np.int32).max else np.int64
    result_ids = np.empty(ids.shape, dtype=dtype)
    result_weights = np.zeros(weights.shape, dtype=np.float64)
    requested_edges = {}

    def midpoint(a, b):
        a, b = min(a, b), max(a, b)
        key = a * n + b
        if key not in requested_edges:
            position = int(np.searchsorted(sorted_keys, key))
            if position == len(sorted_keys) or int(sorted_keys[position]) != key:
                raise ValueError(f"Required electrical edge ({a}, {b}) is absent; check parent mapping / AV split")
            requested_edges[key] = n + (position if order is None else int(order[position]))
        return requested_edges[key]

    for row in range(len(ids)):
        combined = {}
        for node, weight in zip(ids[row], weights[row]):
            if weight > 0:
                node = int(node)
                combined[node] = combined.get(node, 0.0) + float(weight)
        nodes = list(combined)
        lam = np.array(list(combined.values()))
        count = len(nodes)
        # Padding IDs stay valid even when callers index all four slots.
        result_ids[row] = nodes[0]
        if count == 1:
            result_weights[row, 0] = 1.0
            continue
        if count == 2:
            mid = midpoint(*nodes)
            if lam[1] <= .5:
                active_ids, active_weights = [nodes[0], mid], [1 - 2*lam[1], 2*lam[1]]
            else:
                active_ids, active_weights = [mid, nodes[1]], [2*lam[0], 1 - 2*lam[0]]
        elif count == 3:
            corner = int(np.argmax(lam))
            if lam[corner] >= .5:
                other = [i for i in range(3) if i != corner]
                active_ids = [nodes[corner], midpoint(nodes[corner], nodes[other[0]]),
                              midpoint(nodes[corner], nodes[other[1]])]
                active_weights = [2*lam[corner]-1, 2*lam[other[0]], 2*lam[other[1]]]
            else:
                active_ids = [midpoint(nodes[0],nodes[1]), midpoint(nodes[0],nodes[2]),
                              midpoint(nodes[1],nodes[2])]
                active_weights = [1-2*lam[2], 1-2*lam[1], 1-2*lam[0]]
        else:
            child_weights = np.einsum("i,cij->cj", lam, CHILD_BARYCENTRIC_INVERSES)
            valid = np.flatnonzero((child_weights.min(axis=1) >= -tolerance) &
                                  (child_weights.max(axis=1) <= 1+tolerance))
            if not len(valid):
                raise ValueError(f"Render point {row} is outside the midpoint-refined parent")
            child = int(valid[0])
            local_ids = nodes + [midpoint(nodes[i], nodes[j]) for i,j in EDGE_PAIRS]
            active_ids = np.array(local_ids)[RED_CHILDREN[child]]
            active_weights = child_weights[child]
        k = len(active_ids)
        result_ids[row, :k] = active_ids
        rw = np.clip(active_weights, 0, 1)
        result_weights[row, :k] = rw / np.sum(rw)
    return result_ids, result_weights


def self_test(seed=617):
    """Independent Cartesian reconstruction, nonlinear Vm, and padding tests."""
    rng = np.random.default_rng(seed)
    # Well-conditioned parent tetrahedra with unrelated per-node physiology.
    nparents = 30
    points = []
    for _ in range(nparents):
        q, _ = np.linalg.qr(rng.normal(size=(3,3)))
        a = q @ np.diag(rng.uniform(.6,3.,3))
        points.extend(rng.normal(size=3)+np.vstack([np.zeros(3),a]))
    points = np.array(points)
    n = len(points)
    tets = np.arange(n).reshape(-1,4)
    edges = np.concatenate([tet[EDGE_PAIRS] for tet in tets])
    # Deliberately scramble global edge order/orientation to test indexing.
    rng.shuffle(edges)
    edges[::3] = edges[::3,::-1]
    refined_points = np.vstack([points,points[edges].mean(axis=1)])
    times = rng.uniform(50,270,n)
    apd = rng.uniform(250,350,n)
    refined_times = np.r_[times,times[edges].mean(axis=1)]
    refined_apd = np.r_[apd,apd[edges].mean(axis=1)]
    vm = -85+110/(1+np.exp(-(201-refined_times)/3))
    parents, weights, parent_indices = [], [], []
    for ti,tet in enumerate(tets):
        interior = rng.dirichlet(np.ones(4),size=200)
        face = rng.dirichlet(np.ones(3),size=12)
        for w in np.vstack([interior,np.eye(4),np.eye(4)[EDGE_PAIRS].mean(1),
                            np.column_stack([face,np.zeros(len(face))])]):
            parents.append(tet);weights.append(w);parent_indices.append(ti)
    parents,weights=np.array(parents),np.array(weights)
    mapped,mw=refine_render_mapping(parents,weights,edges,n)
    exact_position=np.einsum("ri,rij->rj",weights,points[parents])
    got_position=np.einsum("ri,rij->rj",mw,refined_points[mapped])
    position_error=float(np.max(np.abs(exact_position-got_position)))
    at_error=float(np.max(np.abs(np.sum(weights*times[parents],axis=1)-np.sum(mw*refined_times[mapped],axis=1))))
    apd_error=float(np.max(np.abs(np.sum(weights*apd[parents],axis=1)-np.sum(mw*refined_apd[mapped],axis=1))))
    partition_error=float(np.max(np.abs(mw.sum(1)-1)))
    # Independent child search uses Cartesian geometry, not barycentric
    # transforms from the implementation. Its Vm is arbitrary/non-affine.
    lookup={tuple(sorted(e)):n+i for i,e in enumerate(edges.tolist())}
    exact_vm=[]
    for row,ti in enumerate(parent_indices):
        tet=tets[ti]
        local=list(tet)+[lookup[tuple(sorted(tet[pair]))] for pair in EDGE_PAIRS]
        for child in RED_CHILDREN:
            ci=np.array(local)[child]
            basis=np.column_stack([np.ones(4),refined_points[ci]])
            cw=np.r_[1.,exact_position[row]]@np.linalg.inv(basis)
            if min(cw)>-1e-9 and max(cw)<1+1e-9:
                exact_vm.append(float(cw@vm[ci]));break
        else:
            raise AssertionError("Cartesian reference found no child")
    vm_error=float(np.max(np.abs(np.array(exact_vm)-np.sum(mw*vm[mapped],axis=1))))
    # Render preparation uses zero/invalid IDs in unused slots. Duplicate
    # active IDs must aggregate before resolving the edge midpoint.
    cases=np.array([[4,-1,-1,-1],[4,5,-1,n+999],[4,4,5,4],[4,5,6,-1]])
    cw=np.array([[1,0,0,0],[.23,.77,0,0],[.2,.3,.5,0],[.2,.3,.5,0]])
    mi,mw2=refine_render_mapping(cases,cw,edges,n)
    clean=np.maximum(cases,0);clean[cw==0]=4
    expected=np.sum(cw[:,:,None]*points[clean],axis=1)
    padding_error=float(np.max(abs(expected-np.sum(mw2[:,:,None]*refined_points[mi],axis=1))))
    assert mi[0,0]==4 and mw2[0,0]==1 and np.count_nonzero(mw2[0])==1
    assert mi[2,np.argmax(mw2[2])]==lookup[(4,5)] and max(mw2[2])==1
    absent_edge_rejected=False
    try:
        refine_render_mapping(np.array([[0,4,-1,-1]]),np.array([[.5,.5,0,0]]),edges,n)
    except ValueError:
        absent_edge_rejected=True
    assert absent_edge_rejected
    assert partition_error<1e-12 and position_error<1e-12
    assert at_error<1e-10 and apd_error<1e-10 and vm_error<1e-9 and padding_error<1e-12
    return {"randomParents":nparents,"renderPoints":len(parents),
            "partitionUnityMaxError":partition_error,"positionMaxError":position_error,
            "activationMaxErrorMs":at_error,"apdMaxErrorMs":apd_error,
            "nonlinearVmChildBasisMaxErrorMv":vm_error,"paddingPositionMaxError":padding_error,
            "vertexExact":True,"duplicateIdMidpointExact":True,
            "absentElectricalEdgeRejected":absent_edge_rejected,
            "edgeOrdering":"Scrambled rows and endpoint orientation tested"}


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test",action="store_true",help="Run independent numerical verification (also the default)")
    parser.parse_args()
    print(json.dumps(self_test(),indent=2))

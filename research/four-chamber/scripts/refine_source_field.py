#!/usr/bin/env python3
"""Denser Vm sampling on a fixed activation/torso model.

Split each tetrahedron into eight through its six edge midpoints, interpolate
activation time and AP duration, then evaluate the nonlinear action potential.
The original element's conductivity and reciprocal-field gradient are held
fixed. This is source-field refinement, not a new propagation or torso solve.
The integrated weights are .25 times each original corner's weight and .75
times the sum of the parent local weights of an edge's two endpoints. This
follows by integrating the four subdivided boundary triangles on each face.
"""
from pathlib import Path
import argparse
import hashlib
import itertools
import json
import numpy as np
from build_torso_operator import prepare_torso

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-source/four-chamber'
PAIRS = list(itertools.combinations(range(4), 2))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def electrical_geometry(geo):
    t, tag, points = geo['tetrahedra'], geo['tags'], geo['points']
    vent, atrial = np.unique(t[tag < 3]), np.unique(t[tag > 2])
    vm = np.full(len(points), -1, np.int32)
    am = vm.copy()
    vm[vent] = np.arange(len(vent))
    am[atrial] = len(vent) + np.arange(len(atrial))
    ids = np.r_[vent, atrial]
    tet = np.where((tag < 3)[:, None], vm[t], am[t])
    return points[ids].astype(float), tet, ids, len(vent)


def lead_weights(electrode_weights):
    ra, la, ll = [electrode_weights[:, :, k] for k in range(3)]
    wct = (ra + la + ll) / 3
    return np.stack([la-ra, ll-ra, ll-la, ra-(la+ll)/2,
        la-(ra+ll)/2, ll-(ra+la)/2,
        *[electrode_weights[:, :, k]-wct for k in range(3, 9)]], axis=-1)


def midpoint_weights(points, tet, tags, fibers, edges, conductivity,
                     native_weights=None):
    """Return one 12-lead source row per unique electrically insulated edge."""
    torso, gradient, info = prepare_torso()
    n = len(points)
    encoded = edges[:, 0].astype(np.int64) * n + edges[:, 1]
    assert np.all(encoded[1:] > encoded[:-1])
    result = np.zeros((len(edges), 12))
    for start in range(0, len(tet), 40000):
        end = min(start + 40000, len(tet))
        tt = tet[start:end]
        pp = points[tt]
        A = pp[:, 1:] - pp[:, 0, None]
        volume = np.abs(np.linalg.det(A)) / 6
        G = np.empty((len(tt), 4, 3))
        G[:, 1:] = np.linalg.inv(A).transpose(0, 2, 1)
        G[:, 0] = -G[:, 1:].sum(axis=1)
        f = fibers[start:end].astype(float)
        f /= np.linalg.norm(f, axis=1)[:, None]
        atrial = tags[start:end] > 2
        sl = np.where(atrial, conductivity['atrialIsotropic'],
                      conductivity['ventricularLongitudinal'])
        st = np.where(atrial, conductivity['atrialIsotropic'],
                      conductivity['ventricularTransverse'])
        elements = torso.find_simplex(pp.mean(axis=1))
        assert np.all(elements >= 0)
        kernel = gradient[elements]
        flux = st[:, None, None]*kernel + (sl-st)[:, None, None]*f[:, None, :] * np.sum(f[:, None, :]*kernel, axis=2)[:, :, None]
        local_e = -volume[:, None, None]*np.einsum('tik,tek->tie', G, flux)
        local = lead_weights(local_e)
        for i, j in PAIRS:
            a, b = np.minimum(tt[:, i], tt[:, j]), np.maximum(tt[:, i], tt[:, j])
            key = a.astype(np.int64)*n+b
            ix = np.searchsorted(encoded, key)
            assert np.array_equal(encoded[ix], key)
            for lead in range(12):
                np.add.at(result[:, lead], ix, .75*(local[:, i, lead]+local[:, j, lead]))
        if start % 200000 == 0:
            print(f'Midpoint source operator {end:,}/{len(tet):,} tetrahedra', flush=True)
    checks = {'midpointNodes': len(edges), 'originalNodes': n,
              'combinedFieldSites': n+len(edges),
              'equivalentRefinedTetrahedra': 8*len(tet)}
    if native_weights is not None:
        checks['constantVmNullErrorMv'] = float(np.max(np.abs(.25*native_weights.sum(0)+result.sum(0)))*110)
        midpoint = (points[edges[:, 0]]+points[edges[:, 1]])/2
        checks['affineVmIntegralMaxError'] = float(np.max(np.abs(
            .25*points.T@native_weights + midpoint.T@result - points.T@native_weights)))
        assert checks['constantVmNullErrorMv'] < 1e-8
        assert checks['affineVmIntegralMaxError'] < 1e-9
    return result, checks


def main(output):
    geo = np.load(SRC/'rodero-myocardium.npz')
    cache = np.load(SRC/'operators-cache.npz')
    p, tet, ids, nv = electrical_geometry(geo)
    metadata = json.loads(str(cache['operatorInfo']))
    w, checks = midpoint_weights(p, tet, geo['tags'], geo['fibers'],
        cache['edges'], metadata['sourceConductivitySm'], cache['W'])
    provenance = {'method': __doc__, 'checks': checks,
        'sourceCacheSha256': sha(SRC/'operators-cache.npz'),
        'scriptSha256': sha(__file__), 'geometrySha256': sha(SRC/'rodero-myocardium.npz')}
    output.parent.mkdir(exist_ok=True, parents=True)
    np.savez_compressed(output, W=w, edges=cache['edges'],
                        originalWeightFactor=.25, metadata=json.dumps(provenance))
    print(json.dumps({'output': str(output), **checks}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    main(parser.parse_args().output)

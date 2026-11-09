#!/usr/bin/env python3
"""Finite homogeneous torso lead fields for the educational four-chamber model.

The torso is an explicitly representative ellipsoid, not a patient CT torso.
Linear tetrahedral FEM solves K Z = b with insulating natural boundary conditions
except for unit-current point electrodes. A common return electrode and one
potential gauge are arbitrary: both cancel in the differential ECG leads.

Public contract: ``tess, gradientZ, metadata = prepare_torso()``. ``gradientZ``
has shape [body_tetrahedron, electrode, xyz] in electrode order from metadata.
Cached nodal potentials have physical units ohms. Returned gradients are their
physical gradients (ohms/mm) DIVIDED BY 1000, so the caller may use myocardial
conductivity in S/m together with mm geometry:

    local = -volume_mm3 * G_per_mm dot sigma_i_S_per_m dot gradientZ

This conversion is applied exactly once; there is no ECG amplitude fitting.
"""
from pathlib import Path
import hashlib
import json
import time
import numpy as np
from scipy.spatial import Delaunay, cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import splu
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-source' / 'four-chamber'
CACHE = SRC / 'torso-operator.npz'
VALIDATION = SRC / 'torso-validation.json'
VERSION = 4
CENTER_MM = np.array([0., 0., -60.])
RADII_MM = np.array([170., 110., 300.])
SPACING_MM = 8.
SIGMA_SM = .20
GRADIENT_CONVERSION = .001
ELECTRODE_DIRECTIONS = {
    'RA': [-150., -25., 160.], 'LA': [150., -25., 160.],
    'LL': [80., -20., -290.],
    'C1': [-25., -130., 20.], 'C2': [10., -130., 20.],
    'C3': [40., -125., 5.], 'C4': [65., -110., -10.],
    'C5': [105., -70., -10.], 'C6': [130., -15., -10.],
}
ELECTRODE_NAMES = list(ELECTRODE_DIRECTIONS)
QHULL_OPTIONS = 'Qbb Qc Qz Q12'


def emit(message):
    print(message, flush=True)


def configuration():
    return {
        'version': VERSION, 'centerMm': CENTER_MM.tolist(),
        'implementationSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'heartGeometrySha256': hashlib.sha256((SRC / 'rodero-myocardium.npz').read_bytes()).hexdigest(),
        'radiiMm': RADII_MM.tolist(), 'nominalSpacingMm': SPACING_MM,
        'conductivitySm': SIGMA_SM,
        'electrodeDirectionsMm': ELECTRODE_DIRECTIONS,
        'qhullOptions': QHULL_OPTIONS,
        'interiorJitterFraction': .025, 'surfaceAngularJitterFraction': .035,
        'randomSeed': 49017,
        'returnedGradientConversion': GRADIENT_CONVERSION,
        'linearSolver': 'SuperLU, MMD_AT_PLUS_A, symmetric mode, diagonal pivot threshold 0, one BLAS thread',
    }


def config_hash():
    return hashlib.sha256(json.dumps(configuration(), sort_keys=True).encode()).hexdigest()


def ellipsoid_points(center, radii, spacing):
    """Cartesian interior plus approximately 8-mm UV boundary samples.

    A tiny reproducible interior perturbation avoids co-spherical Cartesian
    degeneracies; the boundary remains on the declared analytic ellipsoid.
    """
    axes = [np.arange(-r + spacing / 2, r, spacing) for r in radii]
    grid = np.stack(np.meshgrid(*axes, indexing='ij'), axis=-1).reshape(-1, 3)
    # Keep an interior shell gap so near-surface grid points do not create
    # needlessly thin tetrahedra next to the independently sampled boundary.
    limit = 1 - .35 * spacing / np.min(radii)
    grid = grid[np.sum((grid / radii) ** 2, axis=1) < limit ** 2]
    rng = np.random.default_rng(49017)
    grid += rng.uniform(-.025 * spacing, .025 * spacing, grid.shape)
    ntheta = int(np.ceil(np.pi * np.max(radii) / spacing))
    boundary = [[0., 0., radii[2]]]
    for i in range(1, ntheta):
        theta = np.pi * i / ntheta
        a, b = radii[:2] * np.sin(theta)
        # Ramanujan circumference estimate for the latitude ellipse.
        perimeter = np.pi * (3 * (a + b) - np.sqrt((3 * a + b) * (a + 3 * b)))
        count = max(8, int(np.ceil(perimeter / spacing)))
        phi = (np.arange(count) + .5 * (i % 2) + rng.uniform(-.035, .035, count)) * 2 * np.pi / count
        # Perfect latitude rings create coplanar zero-volume tetrahedra in
        # Qhull. Perturb angles, not radii: every boundary node remains exactly
        # on the declared ellipsoid and no Qhull-only coordinate jitter is used.
        theta_node = theta + rng.uniform(-.035, .035, count) * np.pi / ntheta
        boundary.extend(np.column_stack([radii[0] * np.sin(theta_node) * np.cos(phi),
                                         radii[1] * np.sin(theta_node) * np.sin(phi),
                                         radii[2] * np.cos(theta_node)]).tolist())
    boundary.append([0., 0., -radii[2]])
    boundary = np.array(boundary, dtype=np.float64)
    points = np.vstack([grid, boundary]) + center
    boundary_ids = np.arange(len(grid), len(points), dtype=np.int32)
    return points, boundary_ids


def basis(tess):
    tet = tess.simplices
    pp = tess.points[tet]
    a = pp[:, 1:] - pp[:, 0, None]
    det = np.linalg.det(a)
    volume = np.abs(det) / 6
    if not np.all(volume > 1e-10):
        raise ValueError('Degenerate torso tetrahedron')
    g = np.zeros((len(tet), 4, 3), dtype=np.float64)
    g[:, 1:] = np.linalg.inv(a).transpose(0, 2, 1)
    g[:, 0] = -g[:, 1:].sum(axis=1)
    return g, volume


def stiffness(tess, g, volume, conductivity_sm):
    sigma_smm = conductivity_sm / 1000
    ke = sigma_smm * volume[:, None, None] * np.einsum('tik,tjk->tij', g, g)
    rows = np.broadcast_to(tess.simplices[:, :, None], ke.shape).ravel()
    cols = np.broadcast_to(tess.simplices[:, None, :], ke.shape).ravel()
    k = coo_matrix((ke.ravel(), (rows, cols)), shape=(len(tess.points),) * 2).tocsr()
    k.sum_duplicates()
    return k


def solve_fields(k, electrode_ids, reference_id, ground_id):
    n = k.shape[0]
    rhs = np.zeros((n, len(electrode_ids)), dtype=np.float64)
    rhs[electrode_ids, np.arange(len(electrode_ids))] = 1.
    rhs[reference_id, :] -= 1.
    free = np.flatnonzero(np.arange(n) != ground_id)
    emit(f'Factoring torso FEM: {n:,} nodes, {k.nnz:,} sparse entries')
    z = np.zeros_like(rhs)
    # The grounded FEM stiffness is symmetric positive definite. Preserving
    # its symmetric ordering avoids unnecessary numerical row pivots/fill.
    # One BLAS thread is much faster for SuperLU's small frontal operations.
    with threadpool_limits(limits=1, user_api='blas'):
        factor = splu(k[free][:, free].tocsc(), permc_spec='MMD_AT_PLUS_A',
                      diag_pivot_thresh=0., options={'SymmetricMode': True})
        z[free] = factor.solve(rhs[free])
    residual = k @ z - rhs
    energy = np.sum(z * (k @ z), axis=0)
    validation = {
        'netInjectedCurrentA': rhs.sum(axis=0).tolist(),
        'linearResidualMaxA': float(np.max(np.abs(residual))),
        'linearRelativeResidualL2': (np.linalg.norm(residual, axis=0) /
                                     np.linalg.norm(rhs, axis=0)).tolist(),
        'positiveEnergyOhm': energy.tolist(),
        'energyIdentityMaxOhm': float(np.max(np.abs(energy - np.sum(z * rhs, axis=0)))),
        'constantPotentialStiffnessResidualS': float(np.max(np.abs(k @ np.ones(n)))),
        'symmetryMaxS': float(np.max(np.abs((k - k.T).data))) if (k - k.T).nnz else 0.,
    }
    if validation['linearResidualMaxA'] > 1e-7:
        raise AssertionError('Torso current balance / linear solve residual failed')
    if not np.all(energy > 0):
        raise AssertionError('Nonpositive reciprocal-field energy')
    return z, validation


def gradient_from_nodal(tess, g, nodal):
    return np.einsum('tki,tkj->tij', nodal[tess.simplices], g)


def sphere_check(spacing=8., enforce_accuracy=True):
    """Independent analytic check: opposed point electrodes on a sphere.

    At its center, |grad Z| = 3/(2*pi*sigma*R^2), along the positive electrode.
    The corresponding insulating-sphere dipole potential is exactly 3 times
    the infinite-conductor result at the same boundary radius.
    """
    radius = 90.
    points, boundary_ids = ellipsoid_points(np.zeros(3), np.full(3, radius), spacing)
    tess = Delaunay(points, qhull_options=QHULL_OPTIONS)
    g, volume = basis(tess)
    k = stiffness(tess, g, volume, SIGMA_SM)
    positive = int(boundary_ids[0]); negative = int(boundary_ids[-1])
    ground = int(np.argmin(np.linalg.norm(points, axis=1)))
    z, val = solve_fields(k, np.array([positive]), negative, ground)
    grad = gradient_from_nodal(tess, g, z)[:, 0]
    centroids = points[tess.simplices].mean(axis=1)
    central = np.linalg.norm(centroids, axis=1) < 8.
    actual = np.average(grad[central], axis=0, weights=volume[central])
    expected = np.array([0., 0., 3 / (2 * np.pi * (SIGMA_SM / 1000) * radius ** 2)])
    error = float(np.linalg.norm(actual - expected) / np.linalg.norm(expected))
    result = {
        'description': 'Opposed unit electrodes on an insulating sphere; analytic central reciprocal gradient is 3 times the infinite-conductor value.',
        'radiusMm': radius, 'spacingMm': spacing, 'nodes': len(points),
        'expectedGradientOhmPerMm': expected.tolist(),
        'measuredCentralGradientOhmPerMm': actual.tolist(),
        'relativeVectorError': error,
        'positiveElectrodeDirectionCorrect': bool(actual[2] > 0),
        'linearResidualMaxA': val['linearResidualMaxA'],
    }
    if (enforce_accuracy and error > .06) or actual[2] <= 0:
        raise AssertionError(f'Analytic insulating-sphere check failed: {result}')
    return result


def heart_inside(tess):
    geometry = SRC / 'rodero-myocardium.npz'
    if not geometry.exists():
        raise FileNotFoundError('Myocardial geometry is required for torso containment validation')
    heart = np.load(geometry)
    points, tet = heart['points'], heart['tetrahedra']
    count = 0
    minimum = np.inf
    for start in range(0, len(tet), 100000):
        centroids = points[tet[start:start + 100000]].mean(axis=1)
        hit = tess.find_simplex(centroids)
        count += int(np.count_nonzero(hit >= 0))
        minimum = min(minimum, float(np.min(1 - np.sum(((centroids - CENTER_MM) / RADII_MM) ** 2, axis=1))))
    point_level = np.sum(((points - CENTER_MM) / RADII_MM) ** 2, axis=1)
    result = {
        'heartCentroidCount': int(len(tet)), 'heartCentroidsInside': count,
        'heartInsideFraction': count / len(tet),
        'heartMaxAnalyticEllipsoidLevel': float(point_level.max()),
        'minimumCentroidEllipsoidMargin': minimum,
    }
    if count != len(tet):
        raise AssertionError(f'Heart source centroids outside torso: {len(tet) - count}')
    return result


def prepare_torso(force=False):
    """Return Delaunay, conversion-adjusted reciprocal gradients, metadata."""
    started = time.perf_counter()
    checksum = config_hash()
    if CACHE.exists() and not force:
        cached = np.load(CACHE, allow_pickle=False)
        if str(cached['configHash']) == checksum:
            points = cached['points'].astype(np.float64)
            nodal = cached['nodalPotentials'].astype(np.float64)
            meta = json.loads(str(cached['metadata']))
            # Retriangulate and recompute gradients together: never combine a
            # regenerated tetrahedron order with cached element gradients.
            tess = Delaunay(points, qhull_options=QHULL_OPTIONS)
            g, _ = basis(tess)
            gradient_z = gradient_from_nodal(tess, g, nodal) * GRADIENT_CONVERSION
            emit(f'Loaded torso fields: {len(points):,} nodes, {len(tess.simplices):,} tetrahedra')
            return tess, gradient_z, meta
    points, boundary_ids = ellipsoid_points(CENTER_MM, RADII_MM, SPACING_MM)
    emit(f'Triangulating ellipsoidal torso: {len(points):,} nodes')
    tess = Delaunay(points, qhull_options=QHULL_OPTIONS)
    g, volume = basis(tess)
    k = stiffness(tess, g, volume, SIGMA_SM)
    targets = np.array([ELECTRODE_DIRECTIONS[name] for name in ELECTRODE_NAMES])
    relative = (targets - CENTER_MM) / RADII_MM
    projected = CENTER_MM + (targets - CENTER_MM) / np.linalg.norm(relative, axis=1)[:, None]
    tree = cKDTree(points[boundary_ids])
    surface_distance, local_ids = tree.query(projected)
    electrode_ids = boundary_ids[local_ids]
    # Common return on the posterior torso. Its field cancels algebraically
    # in every standard lead's zero-sum electrode combination.
    reference_target = CENTER_MM + np.array([0., RADII_MM[1], 0.])
    reference_id = int(boundary_ids[tree.query(reference_target)[1]])
    ground_id = int(np.argmin(np.linalg.norm(points - CENTER_MM, axis=1)))
    if len(np.unique(np.r_[electrode_ids, reference_id])) != len(ELECTRODE_NAMES) + 1:
        raise AssertionError('Two virtual electrodes mapped to the same torso node')
    nodal, validation = solve_fields(k, electrode_ids, reference_id, ground_id)
    del k
    validation.update(heart_inside(tess))
    validation['sphereAnalyticCoarseCheck'] = sphere_check(spacing=12., enforce_accuracy=False)
    validation['sphereAnalyticCheck'] = sphere_check(spacing=8.)
    validation['sphereRefinementDecreasesError'] = (validation['sphereAnalyticCheck']['relativeVectorError'] <
                                                  validation['sphereAnalyticCoarseCheck']['relativeVectorError'])
    if not validation['sphereRefinementDecreasesError']:
        raise AssertionError('Analytic sphere gradient does not improve with refinement')
    validation['uniformBasisGradientMaxPerMm'] = float(np.max(np.abs(g.sum(axis=1))))
    validation['tetraVolumeMm3Range'] = [float(volume.min()), float(volume.max())]
    analytic_volume = 4 * np.pi / 3 * np.prod(RADII_MM)
    validation['meshVolumeMm3'] = float(volume.sum())
    validation['analyticEllipsoidVolumeMm3'] = float(analytic_volume)
    validation['relativeVolumeError'] = float(abs(volume.sum() - analytic_volume) / analytic_volume)
    meta = {
        **configuration(), 'configHash': checksum,
        'name': 'Finite homogeneous ellipsoidal torso · reciprocal linear-tetrahedral FEM',
        'nodeCount': len(points), 'tetrahedronCount': len(tess.simplices),
        'boundaryNodeCount': len(boundary_ids), 'electrodeNames': ELECTRODE_NAMES,
        'projectedElectrodesMm': {n: projected[i].tolist() for i, n in enumerate(ELECTRODE_NAMES)},
        'electrodePositionsMm': {n: points[electrode_ids[i]].tolist() for i, n in enumerate(ELECTRODE_NAMES)},
        'electrodeNodeIds': electrode_ids.tolist(),
        'electrodeProjectionDiscretizationErrorMm': surface_distance.tolist(),
        'commonReferenceNode': reference_id, 'commonReferencePositionMm': points[reference_id].tolist(),
        'groundNode': ground_id,
        'assemblyConductivitySPerMm': SIGMA_SM / 1000,
        'cachedNodalPotentialUnits': 'ohm for +1 A electrode injection and −1 A common return',
        'returnedGradientConvention': 'Physical gradient in ohm/mm multiplied by 0.001; use with myocardial conductivity in S/m, basis gradients in 1/mm and element volumes in mm³. Do not apply a second /1000.',
        'sourceIntegral': 'Vlead = − integral(grad Zlead · sigma_i · grad Vm) dV',
        'methodReference': {'citation': 'Pezzuto et al. (2017), Evaluation of a Rapid Anisotropic Model for ECG Simulation.',
                            'url': 'https://doi.org/10.3389/fphys.2017.00265',
                            'scope': 'Lead-field method reference; the paper does not validate this separate implementation or representative torso.'},
        'boundary': 'Natural insulating Neumann condition except electrode point-current loads; one nodal gauge fixes the additive constant.',
        'limitations': ['Representative analytic torso geometry, not a patient-derived torso.',
                       'One homogeneous isotropic body conductivity; no lung, blood-pool, skeletal or adipose compartments.',
                       'Virtual electrode positions projected to the torso surface; not measured clinical electrode positions.',
                       'Point electrodes are mesh-localized; reciprocal gradients are evaluated well inside the body, away from electrode singularities.',
                       'No ECG amplitude fitting, post-hoc gain or waveform-template fitting.'],
        'validation': validation,
        'runtimeSeconds': time.perf_counter() - started,
    }
    SRC.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(CACHE, points=points, boundaryNodeIds=boundary_ids,
                        nodalPotentials=nodal, metadata=json.dumps(meta), configHash=checksum)
    VALIDATION.write_text(json.dumps(meta, indent=2) + '\n')
    emit(f'Saved torso operator in {meta["runtimeSeconds"]:.1f} s')
    gradient_z = gradient_from_nodal(tess, g, nodal) * GRADIENT_CONVERSION
    return tess, gradient_z, meta


if __name__ == '__main__':
    mesh, gradient, metadata = prepare_torso()
    print(json.dumps({'nodes': len(mesh.points), 'tetrahedra': len(mesh.simplices),
                      'gradientShape': list(gradient.shape),
                      'heartInsideFraction': metadata['validation']['heartInsideFraction'],
                      'sphereError': metadata['validation']['sphereAnalyticCheck']['relativeVectorError'],
                      'maxResidualA': metadata['validation']['linearResidualMaxA']}, indent=2))

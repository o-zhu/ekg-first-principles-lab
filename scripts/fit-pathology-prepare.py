#!/usr/bin/env python3
"""Rebuild the anatomical operators used by the pathology fitting experiment.

The imported Module 1 package is treated as an immutable source release.  Its
scripts run only inside an ignored, isolated working directory.  Heavy caches
are reproducible and never shipped to the browser.  Original mesh acquisition
is checksum verified by the upstream preparation script.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import zipfile

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data-source/pathology-fitting'
WORK = BASE / 'model-work'
CACHE = BASE / 'cache'
SRC = WORK / 'data-source/four-chamber'
RELEASE = ROOT / 'dist/cardiac-voltage/data/heart-model-reproducible-source.zip'
RV_FACTORS = np.array([.45, .60, .80, 1., 1.20])


def emit(s):
    print(s, flush=True)


def run(*args):
    env = {**os.environ, 'OPENBLAS_NUM_THREADS': '2', 'OMP_NUM_THREADS': '2'}
    subprocess.run([sys.executable, *args], cwd=WORK, env=env, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--midpoint', action='store_true', help='Also rebuild the dense source-field operator')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    if not (WORK / 'scripts/build_four_chamber_model.py').exists():
        with zipfile.ZipFile(RELEASE) as z:
            for entry in z.infolist():
                target = WORK / entry.filename
                if not target.resolve().is_relative_to(WORK.resolve()):
                    raise ValueError('Unsafe archive member: ' + entry.filename)
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(z.read(entry))
    if not (SRC / 'rodero-myocardium.npz').exists():
        run('data-source/four-chamber/prepare_rodero_input.py')
    if not (SRC / 'operators-cache.npz').exists():
        run('scripts/build_four_chamber_model.py', '--operators-only')

    sys.path.insert(0, str(WORK / 'scripts'))
    from appendage_anatomy import load_extended_anatomy
    from refine_source_field import electrical_geometry, midpoint_weights
    geo, appendage = load_extended_anatomy(SRC)
    p, tet, ids, nv = electrical_geometry(geo)
    n = len(p)
    tags = geo['tags']
    chamber = np.zeros(n, np.int8)
    for k in range(1, 5):
        chamber[np.unique(tet[tags == k])] = k
    rho = np.clip(geo['rho'][ids], 0, 1)
    z = np.clip(geo['z'][ids], 0, 1)
    phi = geo['phi'][ids]
    c = np.load(SRC / 'operators-cache.npz')
    W, edges, travel = c['W'], c['edges'], c['travel']
    seeds = json.loads(str(c['seeds']))
    info = json.loads(str(c['operatorInfo']))
    templates = json.loads((ROOT / 'dist/cardiac-voltage/data/heart-model.json').read_text())
    provenance = {'sourceReleaseSha256': hashlib.sha256(RELEASE.read_bytes()).hexdigest(),
                  'operatorFingerprint': str(c['cacheFingerprint']),
                  'nativeNodes': n, 'ventricularNodes': nv, 'elements': len(tet),
                  'sourceIntegral': info['sourceIntegral'],
                  'constantVmNullErrorMv': float(np.max(np.abs(W.sum(0))) * 110),
                  'originalInputVerified': json.loads((SRC / 'rodero-input-validation.json').read_text()),
                  'rvTravelFactors': RV_FACTORS.tolist(),
                  'rvTravelMeaning': 'Factor multiplying all native right-ventricular graph speeds; edge factor is linearly blended at the LV/RV interface. Direct RV delivery sites are removed in every complete-RBBB candidate.'}
    assert provenance['constantVmNullErrorMv'] < 1e-8
    arrays = dict(points=p, chamber=chamber, rho=rho, z=z, phi=phi, W=W,
                  activation=c['activation'], edges=edges, travel=travel,
                  nodalVolume=c['nodalVolume'], ventricularCount=nv,
                  seeds=json.dumps(seeds), info=json.dumps(info))
    if not (CACHE / 'anatomy.npz').exists():
        np.savez_compressed(CACHE / 'anatomy.npz', **arrays)

    vm = (edges[:, 0] < nv) & (edges[:, 1] < nv)
    e, tr = edges[vm], travel[vm]
    rows, cols = np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]]
    if not (CACHE / 'ventricular-distances.npz').exists():
        graph = coo_matrix((np.r_[tr, tr], (rows, cols)), shape=(nv, nv)).tocsr()
        emit('Computing the 15 native delivery-site travel maps')
        ds = np.asarray(dijkstra(graph, directed=False, indices=[s['node'] for s in seeds[:15]]), np.float32)
        np.savez_compressed(CACHE / 'ventricular-distances.npz', D=ds)
    rv_edge = ((chamber[e[:, 0]] == 2).astype(float) + (chamber[e[:, 1]] == 2)) / 2
    for factor in RV_FACTORS:
        dest = CACHE / f'rbbb-distances-{factor:.2f}.npz'
        if dest.exists():
            continue
        begin = time.time()
        local = tr * (1 + (1 / factor - 1) * rv_edge)
        graph = coo_matrix((np.r_[local, local], (rows, cols)), shape=(nv, nv)).tocsr()
        ds = np.asarray(dijkstra(graph, directed=False, indices=[s['node'] for s in seeds[:9]]), np.float32)
        np.savez_compressed(dest, D=ds, rvFactor=factor)
        emit(f'RBBB RV speed factor {factor:.2f}: {time.time() - begin:.1f} s')

    if args.midpoint:
        dest = CACHE / 'midpoint-weights.npy'
        if not dest.exists():
            emit('Constructing exact fixed-parent midpoint source operator')
            w, checks = midpoint_weights(p, tet, tags, geo['fibers'], edges,
                                          info['sourceConductivitySm'], W)
            np.save(dest, w)
            (CACHE / 'midpoint-checks.json').write_text(json.dumps(checks, indent=2) + '\n')
        provenance['midpointChecks'] = json.loads((CACHE / 'midpoint-checks.json').read_text())
    (BASE / 'operator-provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    emit('Pathology operators ready; immutable Module 1 files were not modified.')


if __name__ == '__main__':
    main()

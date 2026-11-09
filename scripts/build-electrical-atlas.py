#!/usr/bin/env python3
"""Project the unchanged Module 1 reference field onto the teaching anatomy.

This is a chamber-wise coordinate transfer, NOT a patient registration or an
inverse ECG solution. The exact CT source remains available in Module 1 and in
the fitted-case viewer. Separate inner/outer fields preserve a through-wall
gradient when sectioned BodyParts3D muscle is displayed.
"""
from pathlib import Path
import hashlib
import json
import struct
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'dist/cardiac-voltage/data/heart-model.json'
OUT = ROOT / 'dist/data'
N = 21


def glb_positions(path):
    raw = path.read_bytes()
    size = struct.unpack_from('<I', raw, 12)[0]
    g = json.loads(raw[20:20 + size])
    binary_offset = 28 + size
    result = {}
    for mesh in g['meshes']:
        accessor = g['accessors'][mesh['primitives'][0]['attributes']['POSITION']]
        view = g['bufferViews'][accessor['bufferView']]
        assert accessor['componentType'] == 5126
        # The supplied GLBs interleave positions with normals. Honor byteStride.
        p = np.ndarray((accessor['count'], 3), dtype='<f4', buffer=raw,
                       offset=binary_offset + view.get('byteOffset', 0) + accessor.get('byteOffset', 0),
                       strides=(view.get('byteStride', 12), 4)).copy()
        result[mesh['name']] = p
    return result


def bounds(points):
    return np.quantile(points, [.005, .995], axis=0)


def sample(points, values, queries):
    distance, ids = cKDTree(points).query(queries, k=8)
    weight = 1 / np.maximum(distance, .009) ** 2
    weight /= weight.sum(axis=1, keepdims=True)
    return np.sum(values[ids] * weight, axis=1)


def main():
    model = json.loads(SOURCE.read_text())
    p = np.asarray(model['geometry']['positions']).reshape(-1, 3)
    # Native model: +X left, +Y posterior, +Z superior.
    p = p[:, [0, 2, 1]] * [1, 1, -1]
    chamber = np.asarray(model['nodes']['chamber'])
    depth = np.asarray(model['nodes']['transmuralCoordinate'])
    activation = np.asarray(model['nodes']['activationMs']) / 1000
    apd = np.asarray(model['variants']['heterogeneous']['apd90Ms']) / 1000
    target = glb_positions(ROOT / 'dist/models/heart.glb')
    lv = np.asarray(json.loads((ROOT / 'dist/models/heart-regions.json').read_text())['lvWeights']) / 255
    target_regions = {1: target['ventricular-wall'][lv > .65],
                      2: target['ventricular-wall'][lv < .35],
                      3: target['left-atrium'], 4: target['right-atrium']}
    axis = np.linspace(0, 1, N)
    queries = np.stack(np.meshgrid(axis, axis, axis, indexing='ij'), -1).reshape(-1, 3)
    grids, chambers = [], {}
    for c in [1, 2, 3, 4]:
        source_bounds = bounds(p[chamber == c])
        target_bounds = bounds(target_regions[c])
        canonical = (p - source_bounds[0]) / (source_bounds[1] - source_bounds[0])
        layers = []
        for outside in [False, True]:
            selected = (chamber == c) & (depth > .70 if outside else depth < .30)
            if selected.sum() < 20:
                selected = chamber == c
            layers.append((sample(canonical[selected], activation[selected], queries),
                           sample(canonical[selected], apd[selected], queries)))
        inner_at, inner_apd = layers[0]
        outer_at, outer_apd = layers[1]
        # Nearest neighbors on different geometries cannot establish a measured
        # transmural pair. Retain the reference endocardial pattern and bound
        # the outward latency to a teaching 8–35 ms (not a measured local delay).
        if c < 3:
            outer_at = inner_at + np.clip(outer_at - inner_at, .008, .035)
        grid = np.stack([inner_at, outer_at, inner_apd, outer_apd], axis=-1)
        grids.append(grid.astype('<f4'))
        chambers[str(c)] = {'name': {1: 'LV', 2: 'RV', 3: 'LA', 4: 'RA'}[c],
                            'offsetFloats': (c - 1) * N**3 * 4,
                            'sourceBounds': source_bounds.round(7).tolist(),
                            'targetBounds': target_bounds.round(7).tolist(),
                            'sourceNodeCount': int((chamber == c).sum())}
    data = np.concatenate(grids)
    OUT.mkdir(exist_ok=True)
    binary = OUT / 'electrical-atlas.f32'
    binary.write_bytes(data.tobytes())
    templates = {}
    age_start, age_end, size = -.012, 1.0, 2048
    ages = np.linspace(age_start, age_end, size)
    for name, t in model['templates'].items():
        times = (np.arange(len(t['normalized'])) * t['dtMs'] - t['activationMs']) / 1000
        values = np.interp(ages, times, t['normalized'], left=0, right=0)
        templates[name] = {'restMv': t['restMv'], 'peakMv': t['peakMv'],
                           'apd90': t['apd90Ms'] / 1000,
                           'warpAnchor': t.get('warpAnchorMs', 0) / 1000,
                           'normalized': values.round(7).tolist()}
    meta = {'schemaVersion': 1, 'gridSize': N, 'binaryFile': binary.name,
            'binarySha256': hashlib.sha256(binary.read_bytes()).hexdigest(),
            'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'sourceModel': '../cardiac-voltage/data/heart-model.json',
            'chambers': chambers, 'templateAgeStart': age_start,
            'templateAgeEnd': age_end, 'templates': templates,
            'reference': {
                'atrialStart': model['activationSummary']['atrialRangeMs'][0] / 1000,
                'atrialSpan': np.ptp(model['activationSummary']['atrialRangeMs']) / 1000,
                'ventricularStart': model['activationSummary']['ventricularRangeMs'][0] / 1000,
                'ventricularSpan': model['activationSummary']['ventricularActivationDurationMs'] / 1000,
                'ventricularRecovery90End': float(np.max((activation + apd)[chamber < 3]) -
                                                   model['activationSummary']['ventricularRangeMs'][0] / 1000)},
            'method': 'Chamber-wise axis-aligned normalized coordinate transfer; inverse-distance interpolation of eight CT reference neighbors, separate inner and outer fields, followed by trilinear atlas sampling. Inner-to-outer delay is bounded to 8–35 ms in this teaching projection. Current ECG fiducials set overall activation/recovery duration.',
            'scope': 'Mapped reference timing on a different anatomical surface. This is not a patient registration, measured activation map, solved tissue PDE, or a forward ECG generator. Fitted-case CT surfaces use their original native field instead.',
            'voltageScale': 'Ventricular recovery shape comes from the imported pooled human optical template; absolute −85/+25 mV and a 2 ms intrinsic 10–90% upstroke are assumptions. Optical fluorescence did not measure these absolute voltages; scattering and filtering broaden the measured rise. Atrial shape is the imported Courtemanche model, not a measured atrial optical waveform.',
            'measurementContext': 'Relative optical fluorescence pooled from two isolated human LV endocardial wedge preparations. This is not an in-vivo whole-heart voltage recording. Local activation and APD fields are calibrated model outputs transferred to a different reference anatomy.',
            'sources': model['sources'][:6]}
    (OUT / 'electrical-atlas.json').write_text(json.dumps(meta, separators=(',', ':'), allow_nan=False))
    print(f'Wrote {binary.name}: {binary.stat().st_size:,} bytes; {len(data):,} atlas sites; finite={np.isfinite(data).all()}')


if __name__ == '__main__':
    main()

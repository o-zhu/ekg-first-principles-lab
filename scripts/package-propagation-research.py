#!/usr/bin/env python3
"""Package the compact, reproducible propagation research source.

Run only after fitting, final exports, reports and validation have finished.
The default output is dist/data/pathology-fits/propagation-research.zip.
--dry-run validates and inventories inputs without creating an archive.
Only an explicit allowlist is included; heavy caches, downloaded anatomy,
the immutable Module 1 release and full browser cases remain separate.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import os
import stat
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist/data/pathology-fits/propagation-research.zip'
CASE_IDS = ('ptbxl-03155', 'acs-00004')
RELEASE = 'dist/cardiac-voltage/data/heart-model-reproducible-source.zip'
RELEASE_SHA256 = 'b766a5484c291ce1d1498ea789043484e72af8a5336df8ed4e5fd13c4a0199eb'
MODEL = 'dist/cardiac-voltage/data/heart-model.json'
MODEL_SHA256 = 'b560a70554fcccbd89e69d35a96cb5d80c0e583f427a4f61a36c17f7451d63fb'
MANIFEST = 'data-source/pathology-fitting/research-package-manifest.json'
ZIP_LIMIT = 25 * 1024**2

REQUIRED = (
    'package.json',
    'scripts/package-propagation-research.py',
    'scripts/prepare_pathology_targets.py',
    'scripts/build-electrical-atlas.py',
    'scripts/fit-pathology-verify-browser.mjs',
    'scripts/check-electrical-field.mjs',
    'scripts/check-electrical-events.mjs',
    'scripts/check-conduction-continuity.mjs',
    'scripts/build-conduction-coupling.py',
    'scripts/conduction-source-geometry.mjs',
    'scripts/select-conduction-inner-wall.mjs',
    'scripts/finalize-conduction-geometry.mjs',
    'scripts/check-conduction-render.mjs',
    'scripts/check-conduction-event-transitions.mjs',
    'scripts/check-clinical-chart-scale.mjs',
    'data-source/conduction-inner-wall-faces.json',
    'data-source/conduction-render-audit.json',
    'scripts/check-electrical-gpu.py',
    'scripts/electrical-gpu-fixture.mjs',
    'scripts/check-fitted-surface-gpu.py',
    'scripts/electrical-validation-report.json',
    'scripts/fitted-surface-validation-report.json',
    'data-source/pathology-fitting/REPRODUCE.md',
    'data-source/pathology-fitting/README.md',
    'dist/data/pathology-fits/FORWARD_FIT_METHODS.md',
    'dist/data/pathology-fits/TARGET_METHODS.md',
    'dist/data/pathology-fits/INDEPENDENT_REVIEW.md',
    'dist/data/pathology-fits/PHYSIOLOGY_REFINEMENT.md',
    'dist/data/pathology-fits/CONDUCTION_CONTINUITY.md',
    'dist/data/pathology-fits/PATHWAY_MUSCLE_SYNCHRONIZATION.md',
    'dist/data/pathology-fits/targets-v1.json',
    'dist/data/pathology-fits/manifest.json',
    'dist/data/pathology-fits/source/03155_hr.dat',
    'dist/data/pathology-fits/source/03155_hr.hea',
    'dist/data/pathology-fits/source/PTBXL-SHA256SUMS-selected.txt',
    'dist/data/pathology-fits/source/ptbxl-plus-03155-automated-features.json',
    'dist/data/electrical-atlas.json',
    'dist/data/electrical-atlas.f32',
    'dist/data/conduction-coupling.json',
    'dist/data/clinical-ecgs.json',
    'dist/data/clinical-stemi.json',
    'dist/data/clinical-extra.json',
    'dist/data/clinical-mobitz2.json',
    'dist/data/clinical-tachyarrhythmias.json',
    'dist/data/clinical-torsades.json',
    'dist/electrical-field.js',
    'dist/electrical-ui.js',
    'dist/electrical-ui.css',
    'dist/fit-model.js',
    'dist/fit-surface.js',
    'dist/fit-ap-panel.js',
    'dist/fit-explorer.js',
    'dist/fit-explorer.css',
    'dist/fit-chart.js',
    'dist/scenes.js',
    'dist/soft-renderer.js',
    'dist/cutaway.js',
    'dist/cardiac-motion.js',
    'dist/conduction-system.js',
    'dist/conduction-timing.js',
    'dist/conduction-coupling.js',
    'dist/conduction-event.js',
    'dist/clinical-chart-scale.js',
    'dist/charts.js',
    'dist/lab.js',
    'dist/refinements.css',
    'dist/ecg.js',
    'dist/recovery-model.js',
    'dist/action-potentials.js',
    'dist/action-potential-chart.js',
    'dist/pathology-model.js',
    'dist/clinical-adapter.js',
    'dist/condition-profiles.js',
    'dist/recorded-arrhythmias.js',
    'dist/vendor/three.module.js',
    'dist/vendor/three.core.js',
    'dist/vendor/GLTFLoader.js',
    'dist/vendor/OrbitControls.js',
    'dist/vendor/BufferGeometryUtils.js',
    'dist/vendor/THREE-LICENSE.txt',
    'dist/models/heart.glb',
    'dist/models/heart-medium.glb',
    'dist/models/heart-regions.json',
    'dist/models/heart-regions-medium.json',
    'dist/models/heart-manifest.json',
    'dist/models/ATTRIBUTION.md',
    'dist/models/credits.json',
)
PATTERNS = (
    'scripts/fit-pathology-*.py',
    'data-source/pathology-fitting/*.json',
    'data-source/pathology-fitting/figures/*.png',
    'dist/data/pathology-fits/review/*.png',
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + '\n').encode()


def read_input(relative):
    path = ROOT / relative
    if not path.is_file() or path.is_symlink() or not path.resolve().is_relative_to(ROOT):
        raise ValueError('Missing, symlinked or nonlocal package input: ' + relative)
    return path.read_bytes()


def collect_inputs():
    names = set(REQUIRED)
    for pattern in PATTERNS:
        names.update(p.relative_to(ROOT).as_posix() for p in ROOT.glob(pattern) if p.is_file())
    # Exclude a previous generated manifest if the archive has been extracted
    # over this checkout. Its replacement is computed from the present files.
    names.discard(MANIFEST)
    payload = {}
    for name in sorted(names):
        if any(p in {'cache', 'model-work', '__pycache__', 'source-downloads', 'cases'} for p in Path(name).parts):
            raise ValueError('A nonportable/generated directory entered the allowlist: ' + name)
        content = read_input(name)
        if len(content) > 8 * 1024**2:
            raise ValueError('Unexpectedly large compact-package member: ' + name)
        if name.endswith('.json'):
            json.loads(content)
        payload[name] = content
    if not any(name.startswith('scripts/fit-pathology-model.') for name in payload):
        raise ValueError('The source-model fitting script is absent')
    return payload


def companion_files(payload):
    external = {}
    for name, expected in [(RELEASE, RELEASE_SHA256), (MODEL, MODEL_SHA256)]:
        data = read_input(name)
        if digest(data) != expected:
            raise ValueError('Immutable Module 1 source checksum changed: ' + name)
        external[name] = {'bytes': len(data), 'sha256': expected,
                          'websitePath': name.removeprefix('dist/')}
    manifest = json.loads(payload['dist/data/pathology-fits/manifest.json'])
    entries = {item['recordId']: item for item in manifest['cases']}
    for identifier in CASE_IDS:
        name = f'dist/data/pathology-fits/cases/{identifier}.json'
        data = read_input(name)
        case = json.loads(data)
        native_path = f'data-source/pathology-fitting/fit-{identifier}-native.json'
        native = json.loads(payload[native_path])
        if case.get('provisional') is not False or not case.get('evaluatorVerification'):
            raise ValueError('Finish the final verified export before packaging: ' + name)
        numerical_winner = native['selectedApproachId']
        teaching_default = native.get('teachingDefaultApproachId')
        if teaching_default is None:
            teaching_default = numerical_winner
        native_ids = {a['id'] for a in native['approaches']}
        case_ids = {a['id'] for a in case['approaches']}
        if numerical_winner not in native_ids or teaching_default not in native_ids:
            raise ValueError('Native numerical winner or teaching default is absent from the candidate set: ' + identifier)
        if case_ids != native_ids:
            raise ValueError('Final case does not contain the current candidate set: ' + identifier)
        if case['selectedApproachId'] != teaching_default or case['selectedApproachId'] != entries[identifier]['selectedApproachId']:
            raise ValueError('Final case/manifest/native teaching selection is out of date: ' + identifier)
        if 'bestNumericalApproachId' in case and case['bestNumericalApproachId'] != numerical_winner:
            raise ValueError('Final case numerical-winner metadata is out of date: ' + identifier)
        if case['provenance']['sourceReleaseSha256'] != RELEASE_SHA256:
            raise ValueError('Case uses a different original source release: ' + identifier)
        external[name] = {'bytes': len(data), 'sha256': digest(data),
                          'websitePath': name.removeprefix('dist/'),
                          'selectedApproachId': case['selectedApproachId'],
                          'bestNumericalApproachId': numerical_winner}
    return external


def archive_bytes(payload):
    """Stable member order, timestamps, permissions and DEFLATE settings."""
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.comment = b'Start with data-source/pathology-fitting/REPRODUCE.md'
        for name in sorted(payload):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, payload[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return stream.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='Check and inventory inputs without writing a ZIP')
    parser.add_argument('--output', type=Path, default=OUTPUT, help='Optional alternative ZIP destination')
    args = parser.parse_args()
    payload = collect_inputs()
    external = companion_files(payload)
    manifest = {
        'schemaVersion': 1,
        'readme': 'data-source/pathology-fitting/REPRODUCE.md',
        'paths': 'All members are relative to the outer research/repository root.',
        'files': {name: {'bytes': len(data), 'sha256': digest(data)} for name, data in payload.items()},
        'separateCompanions': external,
        'excluded': ['Giant operator/travel caches', 'Raw CT archive and VTK downloads',
                     'Expanded original model working tree', 'Full fitted browser-case exports',
                     'Original immutable Module 1 source ZIP and its full model JSON'],
        'determinism': 'Identical input bytes produce identical ZIP bytes with the same Python/zlib implementation. No current timestamp, absolute path or checkout commit ID is embedded.',
        'scientificScope': 'Reproducible constrained source-model experiments on generic anatomy; not patient-specific recovered physiology.',
    }
    payload[MANIFEST] = json_bytes(manifest)
    summary = {'mode': 'dry-run' if args.dry_run else 'written',
               'memberCount': len(payload), 'uncompressedBytes': sum(map(len, payload.values())),
               'companionRecords': list(CASE_IDS), 'finalCaseChecksPassed': True}
    if args.dry_run:
        print(json.dumps(summary, indent=2))
        return
    content = archive_bytes(payload)
    if len(content) > ZIP_LIMIT:
        raise ValueError('Research ZIP exceeds the 25 MiB single-asset packaging limit')
    # Refuse a mixed snapshot if a still-running fitter changed a source or
    # companion while it was being packaged. The builder itself changes no
    # scientific results, inputs, reports or original source files.
    for name, data in payload.items():
        if name != MANIFEST and digest(read_input(name)) != digest(data):
            raise ValueError('Input changed during packaging; wait for the fitter: ' + name)
    for name, metadata in external.items():
        if digest(read_input(name)) != metadata['sha256']:
            raise ValueError('Companion changed during packaging; wait for the fitter: ' + name)
    output = args.output.resolve()
    if output in {(ROOT / name).resolve() for name in [*payload, *external]}:
        raise ValueError('Output must not replace a source or companion file')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, prefix='propagation-research-', suffix='.tmp', delete=False) as f:
            temporary = Path(f.name)
            f.write(content)
        os.replace(temporary, output)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    summary.update(zipBytes=len(content), sha256=digest(content), output=str(output))
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()

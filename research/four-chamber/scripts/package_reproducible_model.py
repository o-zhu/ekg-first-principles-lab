#!/usr/bin/env python3
"""Package the four-chamber model with pinned retrieval for its large CT input."""
from pathlib import Path
import json
import hashlib
import zipfile
import os
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / 'dist/data/heart-model-reproducible-source.zip'
selected = [
    'scripts/build_four_chamber_model.py',
    'scripts/build_torso_operator.py',
    'scripts/audit_four_chamber_model.py',
    'scripts/package_reproducible_model.py',
    'scripts/appendage_anatomy.py',
    'scripts/refine_source_field.py',
    'scripts/refine_render_mapping.py',
    'scripts/lead_ii_calibration.py',
    'scripts/generate_tt06_templates.py',
    'scripts/build_pooled_optical_template.py',
    'scripts/report_lead_ii_calibration.py',
    'scripts/write_model_documentation.py',
    'data-source/heart-model/donor1-ap-template-1ms.json',
    'data-source/heart-model/donor1-metadata.json',
    'dist/data/FOUR_CHAMBER_METHODS.md',
    'dist/data/heart-model.json',
    'dist/heart-data.js',
    'dist/data/ptb-healthy-reference.json',
    'dist/data/four-chamber-geometry-attribution.txt',
    'dist/data/whole-heart-independent-audit.json',
    'dist/data/qrs-activation-refinement.json',
    'dist/data/qrs-refinement-comparison.png',
    'dist/data/lead-ii-fit-study.json',
    'dist/data/lead-ii-fit-comparison.png',
    'dist/data/LEAD_II_CALIBRATION.md',
    'dist/data/lead-ii-calibration.json',
    'dist/data/left-atrial-appendage.json',
    'dist/data/selected-human-ventricular-template.json',
    'dist/data/pooled-human-ventricular-template.json',
]
# Small published optical exports permit exact checks when the unquantized
# pooled template is regenerated from its pinned original MAT recordings.
for donor in [1,2]:
    meta_path=ROOT/f'dist/data/human/donor{donor}-metadata.json'
    meta=json.loads(meta_path.read_text())
    selected.append(str(meta_path.relative_to(ROOT)))
    selected += ['dist/data/human/'+meta[k] for k in ['voltage_file','mask_file','timing_file']]
source = ROOT / 'data-source/four-chamber'
for path in sorted(source.rglob('*')):
    if not path.is_file() or '__pycache__' in path.parts or 'source-downloads' in path.parts or any(part.startswith('.') for part in path.relative_to(source).parts):
        continue
    if path.name in {'rodero-myocardium.npz', 'operators-cache.npz', 'torso-operator.npz', 'midpoint-source-operator.npz', 'average.vtk', 'average.tar.gz'} or path.name.endswith('-optimization-cache.npz'):
        continue
    if path.name.startswith('rodero-myocardium.npz.part') or path.name=='rodero-myocardium-parts.json':
        continue
    selected.append(str(path.relative_to(ROOT)))

readme = '''# Reproduce the four-chamber cardiac voltage model

Read `dist/data/FOUR_CHAMBER_METHODS.md` for equations, sources and limitations,
and `data-source/four-chamber/README.md` for detailed reproduction instructions.

The original CT archive and its approximately 50 MB myocardial NPZ are omitted
from this compact package. The retrieval script downloads the exact public
Zenodo archive, checks its hashes, and reproduces all retained arrays with
canonical per-array checks. Source credit and licenses are retained.

From the extracted package root:

```sh
python data-source/four-chamber/prepare_rodero_input.py
python scripts/build_torso_operator.py
python scripts/build_four_chamber_model.py
python scripts/audit_four_chamber_model.py
python scripts/report_lead_ii_calibration.py
python scripts/write_model_documentation.py
```

Dependencies: Python 3, NumPy, SciPy, VTK, threadpoolctl, and Matplotlib for the
comparison report. VTK is needed for
the original anatomical input and optional surface preparation. The retained
display mesh was generated with VTK 9.3.1. The torso field is regenerated from its pinned geometry and implementation.
Rebuilding its verified operator took about 21 seconds in the retained runtime.
Any subsequently generated cache is checked against implementation and input
fingerprints before reuse.

The complete myocardial source operator is rebuilt from the extended anatomy,
including all 1,562,432 tetrahedra and the inferred left atrial appendage.
The refined source integral evaluates 2,400,926 cellular voltage samples,
using the equivalent of 12,499,456 sub-tetrahedra. It requires several GB of
memory. The published JSON and numerical audit are included for comparison,
not as substitutes for the calculation. This is an educational graph-activation
/ prescribed-AP / finite volume-conductor model, not a clinical validation or
an ionic tissue PDE.

To reproduce the original atrial template and measured ECG summary, see
`data-source/four-chamber/references/README.md`. The healthy-control ECG is
used as a calibration target. Activation timing/speeds, effective source
conductivities, and the AP-duration field have been fitted to lead II.
The selected recovery shape comes from an equally weighted pool of two human
optical donors. No measured ECG samples are inserted into the calculated ECG,
and no final ECG smoothing or shape warping is applied. See
`dist/data/LEAD_II_CALIBRATION.md` and `lead-ii-fit-study.json` for the alternatives,
raw-mV errors, parameter bounds, and unoptimized other-lead comparisons.
This is calibration, not a patient-specific or independent clinical validation.

After rebuilding the model, run `python scripts/audit_four_chamber_model.py`
to independently check the full-source signals, source weights, timing fields,
and shipped JavaScript playback against the generated data. Node.js is needed
for the JavaScript playback checks.
'''

manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in selected}
# Publish only a complete, checked ZIP; readers must never see an open archive.
with tempfile.NamedTemporaryFile(prefix='.heart-source-', suffix='.zip.tmp',
                                 dir=DESTINATION.parent, delete=False) as tmp:
    temporary = Path(tmp.name)
try:
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        archive.writestr('README.md', readme)
        archive.writestr('SHA256.json', json.dumps(manifest, indent=2) + '\n')
        for name in selected:
            archive.write(ROOT / name, name)
    with zipfile.ZipFile(temporary) as archive:
        assert archive.testzip() is None
        for name, expected in manifest.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == expected, name
    os.replace(temporary, DESTINATION)
finally:
    temporary.unlink(missing_ok=True)
print(json.dumps({'archive': str(DESTINATION), 'bytes': DESTINATION.stat().st_size,
                  'files': len(selected) + 2, 'sha256': hashlib.sha256(DESTINATION.read_bytes()).hexdigest()}))

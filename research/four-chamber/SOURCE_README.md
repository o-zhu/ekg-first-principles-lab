# Reproduce the four-chamber cardiac voltage model

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

# Reproduce the ECG propagation research

**Public source release note:** this is a retained description of the original research package. Its ZIP contains historical application files. Extract it only into an empty, isolated research directory, never over the current EKG Lab checkout. Use [the current reproducibility guide](../../docs/REPRODUCIBILITY.md) for the supported entry point and missing-source limits.

This archive contains the target-preparation, anatomical forward-fitting,
teaching-atlas and verification code used by the ECG lab, together with the
recorded inputs, retained fit histories and numerical reports. It preserves
repository-relative paths. It is a research source package, not a standalone
copy of the complete website.

The fitted maps are constrained explanations on a generic heart and torso.
They are not measured patient activation maps. Reproducing the calculations
does not validate their physiological uniqueness. Read the full methods and
limitations in `dist/data/pathology-fits/FORWARD_FIT_METHODS.md`, the recording
provenance in `TARGET_METHODS.md`, and the independent review in
`INDEPENDENT_REVIEW.md` in that same directory.

## 1. Extract into the correct directory

For a fresh reproduction, create an empty folder, extract
`propagation-research.zip` into it, and use that folder as the working
directory. Its immediate children will include `scripts/`, `dist/`,
`data-source/` and `package.json`. Keep this research directory separate from
an existing source checkout. Do not extract this archive inside `dist/` or
over the current public repository.

For example, with the downloaded ZIP in the parent directory:

```sh
mkdir ecg-propagation-research
unzip propagation-research.zip -d ecg-propagation-research
cd ecg-propagation-research
```

The generated
`data-source/pathology-fitting/research-package-manifest.json` records every
included file's byte count and SHA-256. It also pins the separate companion
downloads. Check the package before modifying or regenerating its outputs:

```sh
python - <<'PY'
from pathlib import Path
import hashlib, json
manifest = json.loads(Path('data-source/pathology-fitting/research-package-manifest.json').read_text())
for name, info in manifest['files'].items():
    data = Path(name).read_bytes()
    assert len(data) == info['bytes'], name
    assert hashlib.sha256(data).hexdigest() == info['sha256'], name
print('All packaged files match their manifest.')
PY
```

## 2. Restore the unchanged Module 1 companion

Download the original source release from the same website, using its path
`cardiac-voltage/data/heart-model-reproducible-source.zip`, and save it at:

```text
dist/cardiac-voltage/data/heart-model-reproducible-source.zip
```

The release must have SHA-256:

```text
b766a5484c291ce1d1498ea789043484e72af8a5336df8ed4e5fd13c4a0199eb
```

The archive already contains the exact reference `heart-model.json`. Restore
that member under the website's Module 1 path with the following command:

```sh
python - <<'PY'
from pathlib import Path
import hashlib, zipfile
release = Path('dist/cardiac-voltage/data/heart-model-reproducible-source.zip')
assert hashlib.sha256(release.read_bytes()).hexdigest() == 'b766a5484c291ce1d1498ea789043484e72af8a5336df8ed4e5fd13c4a0199eb'
with zipfile.ZipFile(release) as archive:
    model = archive.read('dist/data/heart-model.json')
assert hashlib.sha256(model).hexdigest() == 'b560a70554fcccbd89e69d35a96cb5d80c0e583f427a4f61a36c17f7451d63fb'
target = Path('dist/cardiac-voltage/data/heart-model.json')
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(model)
print('Restored the unchanged Module 1 reference model.')
PY
```

Do not extract the entire original release over this research directory. The
fitting bootstrap extracts it into the isolated directory
`data-source/pathology-fitting/model-work/` and executes its original scripts
there. The original Module 1 package and website files remain unchanged.

### Pinned anatomical source

The bootstrap retrieves the original Rodero population-average CT anatomy from
[Zenodo record 4593739](https://zenodo.org/records/4593739), using
`https://zenodo.org/api/records/4593739/files/average.tar.gz/content`.
The original archive contains 58,167,648 bytes; its SHA-256 is
`d787d6470c8a4a6c7bfb808c55e44e35a7bc18f5888847e2b24380beae2703ee`
and its MD5 is `992f31e20c1aa73c10c5d9a6b6ac903a`. The original VTK SHA-256 is
`b8e013832ccf9262d677ad3d6f140a76de6bb0a2d9734132ec9924a29eba8356`.
The upstream preparation script verifies the archive, VTK and canonical
retained arrays. Source and license details are retained in the original
release and `operator-provenance.json`.

The separate BodyParts3D heart assets included here are the teaching surfaces
needed by atlas generation and conduction checks. Their attribution is in
`dist/models/ATTRIBUTION.md` and `dist/models/heart-manifest.json`. Their
chamber-coordinate transfer is distinct from the native CT source model used
to fit ECGs.

## 3. Install the recorded dependencies

The retained run used Python **3.12.14**, Node.js **24.22.1**, NumPy **2.3.5**,
SciPy **1.17.0**, VTK **9.3.1**, threadpoolctl **3.6.0**, Matplotlib **3.10.8**
and Pillow **12.3.0**. Create a Python environment and install those package
versions:

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install numpy==2.3.5 scipy==1.17.0 vtk==9.3.1 threadpoolctl==3.6.0 matplotlib==3.10.8 Pillow==12.3.0
node --version
```

Use Node.js 24.22.1 for the recorded JavaScript environment. The verification
scripts use Node built-ins and the bundled Three.js files; no `npm install`
is required. VTK is required to reconstruct the original myocardial input.
The retained appendage and render mapping are reused; regeneration of those
optional upstream anatomical assets has additional instructions in the
original source release, including its pinned TetGen dependency.

For comparable CPU behavior, set the numerical thread counts before the
Python runs:

```sh
export OPENBLAS_NUM_THREADS=2
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
```

The optional GPU parity checks need an installed surfaceless EGL/OpenGL ES
runtime exposing `libEGL.so.1` and `libGL.so.1`. They use Python `ctypes` and
do not install a browser or Python graphics package. The retained checks ran
with OpenGL ES 3.2 / Mesa 25.2.8; a missing runtime produces an explicit skip.
Software and floating-point differences across platforms can change a
nonlinear optimizer's trajectory. The package pins inputs, code and versions;
it does not promise identical optimized parameters on every numerical stack.

## 4. Quick verification without rerunning the optimizer

Download both final case JSON files from the website and preserve these local
paths:

```text
dist/data/pathology-fits/cases/ptbxl-03155.json
dist/data/pathology-fits/cases/acs-00004.json
```

They are excluded from the compact research ZIP because they are separate
website downloads. The package manifest pins their sizes, SHA-256 hashes and
selected approach IDs. After restoring the Module 1 companion and both cases,
verify all four companion hashes:

```sh
python - <<'PY'
from pathlib import Path
import hashlib, json
manifest = json.loads(Path('data-source/pathology-fitting/research-package-manifest.json').read_text())
for name, info in manifest['separateCompanions'].items():
    data = Path(name).read_bytes()
    assert len(data) == info['bytes'], name
    assert hashlib.sha256(data).hexdigest() == info['sha256'], name
print('All separate companion files match this research package.')
PY
node scripts/fit-pathology-verify-browser.mjs
node scripts/check-electrical-field.mjs
node scripts/check-electrical-events.mjs
node scripts/check-conduction-render.mjs
node scripts/check-conduction-event-transitions.mjs --coupled
node scripts/check-conduction-event-transitions.mjs
node scripts/check-clinical-chart-scale.mjs
```

The first check evaluates the actual browser source/render Vm functions
against independently exported Python fixtures and checks lead identities.
The field check verifies atlas integrity, local AT/APD relationships,
transmural ordering and working-cell trace consistency. The event check
exercises AV block, independent atrial/ventricular clocks, absent ventricular
events, escape/PVC pathway behavior and available versus unavailable maps.

With the optional EGL runtime installed:

```sh
python scripts/check-electrical-gpu.py
python scripts/check-fitted-surface-gpu.py
```

These compile and execute the actual shader expressions. They verify numeric
CPU/GPU agreement, signed gold/cyan front colors and clipping, within their
reported tolerances. Browser layout and visual usability remain separate
checks. The saved validation JSON records the checks performed for the
published version; running the scripts performs fresh checks.

## 5. Recreate the recorded targets

The target-preparation script uses the included calibrated source bundles and
the original PTB-XL 500 Hz WFDB pair. It does not use the 100 Hz teaching strip
as the RBBB fitting target.

```sh
python scripts/prepare_pathology_targets.py
```

This regenerates `targets-v1.json`, accepted-beat NPZ files, calibrated source
JSON files, target methods and review plots. `--no-plots` omits review figures.
The default run needs no record download because the required original
PTB-XL pair, checksum selection, external feature row and source bundles are
included. `--download` allows retrieval of missing PTB-XL source/checksum and
PTB-XL+ feature files; it is not a general ACS archive downloader.

The fixed recording identities are:

| Target | Pinned source | Input and verification |
| --- | --- | --- |
| Complete RBBB | [PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/), `records500/03000/03155_hr` | Original `03155_hr.dat` and `.hea`; published SHA-256 entries, initial values and channel checksums are verified. |
| External timing cross-check | [PTB-XL+ 1.0.1](https://physionet.org/content/ptb-xl-plus/1.0.1/), ECG ID 3155 | Retained 12SL, Uni-G and ECGDeli feature rows; automated measurements, not expert delineation. |
| Anterior STEMI example | [ACS Figshare version 1](https://doi.org/10.6084/m9.figshare.29925314.v1), `row_data/00004.dat` | Preserved calibrated 500 Hz samples round-trip to the recorded original DAT SHA-256. Source labels include STEMI and proximal LAD occlusion. |
| Additional inferior target | Same ACS version, `row_data/18206.dat` | Prepared and quality checked; no corresponding fitted propagation case is claimed. |

The ACS release's original ECG and metadata downloads are
`https://ndownloader.figshare.com/files/62951395` and
`https://ndownloader.figshare.com/files/62951134`. Original source headers have
invalid checksum/initial-value fields; those defects are disclosed in the
retained provenance. The preparation uses the preserved original DAT hashes
and calibrated samples, not those defective header fields. The source
license, locator, source labels and record hashes are retained in the target
data and methods notes. Angiographic culprit labels are not simultaneous
measurements of local electrical injury.

Targets retain raw-mV calibration, a single common QRS alignment per beat and
a constant pre-QRS PR reference. No independent P/QRS/T time warp or
amplitude normalization is applied. The 1 ms display grid interpolates the
original 500 Hz samples. Training/held-out beat partitions and exclusions are
retained in the data; held-out beats come from the same short recording.

## 6. Rebuild the model and repeat the full search

Use a separate extraction if you want to retain the supplied reference
reports unchanged. The following commands regenerate derived files and fit
histories. The anatomy/operator cache is deliberately absent from the ZIP.
Reconstruction and the many source/pose optimization runs require several
gigabytes of RAM and disk and are substantially more expensive than the
quick checks above.

First restore the Module 1 companion, install dependencies, prepare targets,
and build the native and midpoint source operators:

```sh
python scripts/prepare_pathology_targets.py
python scripts/fit-pathology-prepare.py --midpoint
python scripts/fit-pathology-model.py --case ptbxl-03155
python scripts/fit-pathology-model.py --case acs-00004
python scripts/fit-pathology-pose.py --basis
```

Then run the comparison families in this order for each recording:

```sh
for record in ptbxl-03155 acs-00004
do
    python scripts/fit-pathology-pose.py --case "$record"
    python scripts/fit-pathology-alternatives.py --case "$record"
    python scripts/fit-pathology-distributed.py --case "$record"
    python scripts/fit-pathology-pose-refine.py --case "$record"
done
python scripts/fit-pathology-conservative.py
```

The final command is a no-argument, ACS-00004-only recovery-prior comparison.
It retains alternatives with a more modest LV/RV recovery prior and different
regional injury-APD initializations. Those bounds are declared model priors,
not universal physiological ranges or a measured ischemia stage. The final
source code and fit history encode the published default-selection rule;
the alternative fits remain available for comparison.
In the native history, `selectedApproachId` retains the numerical winner.
When present, `teachingDefaultApproachId` chooses the initial educational
display. The exported case and manifest use that teaching default, while
the case's `bestNumericalApproachId` preserves the numerical winner.

Export the verified fields and traces only after all fitting has finished:

```sh
python scripts/fit-pathology-export.py --case ptbxl-03155
python scripts/fit-pathology-export.py --case acs-00004
python scripts/fit-pathology-figures.py --case ptbxl-03155 --native
python scripts/fit-pathology-figures.py --case acs-00004 --native
python scripts/fit-pathology-figures.py --case ptbxl-03155
python scripts/fit-pathology-figures.py --case acs-00004
python scripts/fit-pathology-report.py
node scripts/fit-pathology-verify-browser.mjs
```

Do not use `--preview` for final verification. The default exporter directly
recomputes the selected dense source signal and emits source/render Vm
fixtures. `--reuse-verified` is a metadata-refresh optimization for an already
verified, exactly matching result; it is unnecessary for a fresh reproduction.
The report script rewrites the scientific methods/results and runtime-version
report. Full browser cases retain each approach's field and predicted ECG,
measured median/IQR, training and held-out comparisons, residuals, morphology
metrics, numerical checks and the stated limitations.

## 7. Rebuild the separate teaching atlas

```sh
python scripts/build-electrical-atlas.py
node scripts/check-electrical-field.mjs
node scripts/check-electrical-events.mjs
```

This maps the unchanged Module 1 CT reference timing/APD to the separate
BodyParts3D teaching anatomy, chamber by chamber. It produces
`dist/data/electrical-atlas.json` and `.f32`. It is an educational coordinate
transfer, not a recovered patient activation map or a forward ECG solver.
The local membrane-voltage field, working-cell traces and cutaway use the
same evaluator. The dedicated fitted-case viewer uses its native CT source
field instead of this atlas.

### Coupled conducting-tree and muscle activation (version 13)

The active teaching model also loads `dist/data/conduction-coupling.json`.
It supplies a connected conducting tree, explicit muscle junctions on the
visible endocardial vertices, atrial surface paths, and myocardial first
arrivals on connected anatomical edges. It replaces the separate transferred
activation field while retaining the atlas's recovery-time constraint through
a local APD adjustment. The original CT fitted cases remain separate.

```sh
python scripts/build-conduction-coupling.py
node scripts/check-conduction-continuity.mjs --coupled
node scripts/check-conduction-render.mjs --write
node scripts/check-conduction-event-transitions.mjs --coupled
node scripts/check-electrical-field.mjs
python scripts/check-electrical-gpu.py
```

The builder invokes `scripts/conduction-source-geometry.mjs`, uses the
included anatomical GLBs and pinned inner-wall face selection, and writes the
coupled asset. `data-source/conduction-inner-wall-faces.json` pins the source
mesh hash and selected triangle IDs. This selection is a reference-anatomy
modeling input, not a patient segmentation. Exact coincident vertices are
welded before propagation so material and normal seams do not create false
electrical boundaries.

`node scripts/select-conduction-inner-wall.mjs` independently regenerates and
checks the pinned face selection; add `--write` to replace it. The builder
calls `scripts/finalize-conduction-geometry.mjs` to pin guide and local-probe
locations against the actual runtime curves. No temporary external geometry
file is required.

`scripts/check-conduction-render.mjs` samples the actual prepared triangle
attributes at all recruiting junctions, evaluates the moving pulses, checks
cut-face sampling, and checks the declared bundle-block septal connections.
Its report records the asset hash and distinguishes the full WebGL anatomy
from the reduced software anatomy. The modeled junction delay is separate
from the reported interpolation error. Read
`dist/data/pathology-fits/PATHWAY_MUSCLE_SYNCHRONIZATION.md` for the intended
physiological relationship and the remaining approximations.

## 8. Available website downloads

Website paths below are relative to the site's root. They map to the same
paths prefixed by `dist/` in this research directory. Access follows the
website's sharing settings; use its browser download when sign-in is needed.

| Website path | Purpose |
| --- | --- |
| `data/pathology-fits/propagation-research.zip` | This compact research source package and reproduction guide. |
| `cardiac-voltage/data/heart-model-reproducible-source.zip` | Original immutable Module 1 source release; required bootstrap companion. |
| `cardiac-voltage/data/heart-model.json` | Exact native CT render mesh, source mapping and AP templates. |
| `data/pathology-fits/cases/ptbxl-03155.json` | Final complete-RBBB case, all retained approaches and verification fixtures. |
| `data/pathology-fits/cases/acs-00004.json` | Final anterior-STEMI case, all retained approaches and verification fixtures. |
| `data/pathology-fits/targets-v1.json` | Aligned, calibrated target medians, partitions, variability and provenance. |
| `data/pathology-fits/ptbxl-03155-beats.npz` | Accepted native-grid beats for RBBB. |
| `data/pathology-fits/acs-00004-beats.npz` | Accepted native-grid beats for the anterior STEMI example. |
| `data/pathology-fits/acs-18206-beats.npz` | Accepted native-grid beats for the additional inferior STEMI target. |
| `data/pathology-fits/source/03155_hr.dat` and `.hea` | Original PTB-XL 500 Hz WFDB pair. |
| `data/pathology-fits/source/ptbxl-03155-500hz.json` | Original calibrated RBBB signals. |
| `data/pathology-fits/source/acs-00004-500hz.json` | Original calibrated anterior STEMI signals. |
| `data/pathology-fits/source/acs-18206-500hz.json` | Original calibrated inferior STEMI signals. |
| `data/pathology-fits/FORWARD_FIT_METHODS.md` | Forward model, search families, numerical results and limitations. |
| `data/pathology-fits/TARGET_METHODS.md` | Source acquisition, calibration, alignment and quality review. |
| `data/pathology-fits/INDEPENDENT_REVIEW.md` | Independent clinical/data/model review. |
| `data/electrical-atlas.json` and `.f32` | Mapped teaching-atlas metadata and binary timing field. |
| `data/conduction-coupling.json` | Shared pathway, muscle junctions, and anatomical surface arrival fields. |
| `data/pathology-fits/PATHWAY_MUSCLE_SYNCHRONIZATION.md` | Version 13 synchronization methods, chart changes, and validation limits. |

The large anatomy downloads, expanded upstream working tree and computed
operators/travel caches are regenerated locally. They are not public browser
assets and are not included in this ZIP. Source-specific attribution and
licenses are preserved in the bundled records, original release, model
attribution files and Three.js license; the package does not replace those
terms with a new common license.

## 9. Rebuild the compact download

After final fits, exports, figures, reports and verification are complete:

```sh
python scripts/package-propagation-research.py --dry-run
python scripts/package-propagation-research.py
```

The builder writes `dist/data/pathology-fits/propagation-research.zip` and
prints its size and SHA-256. It checks the immutable release/model hashes,
final case status, manifest/native teaching-default agreement, numerical-winner
metadata and candidate-set agreement. It rejects inputs changed during packaging and uses an explicit
allowlist to omit heavy caches, downloaded anatomy and full fitted-case
exports. Sorted member paths, fixed timestamps/permissions and fixed DEFLATE
settings make repeated builds byte-identical with the same inputs and
Python/zlib implementation. Every included source file also has an
independent SHA-256 in the archive manifest.


## 10. Reproduce the AP-shape and ST/T-focused sensitivity extension

After the ACS commands in section 6 through `fit-pathology-conservative.py`,
run these additional commands in this order:

```sh
python scripts/fit-pathology-plateau.py
python scripts/fit-pathology-early-plateau.py
python scripts/fit-pathology-activation-pareto.py
python scripts/fit-pathology-finalize-shapes.py
python scripts/fit-pathology-waveform-audit.py
python scripts/fit-pathology-export.py --case acs-00004
python scripts/fit-pathology-report.py
node scripts/fit-pathology-verify-browser.mjs
```

These scripts operate only on ACS-00004. RBBB, the recording targets, the
training/held-out split, the generic anatomy, the finite-torso lead fields,
and the Module 1 import are unchanged. They use the exact existing `pose2`
operator and existing delivery sites. The last fitting script refits their
timings within the original bounds; it adds no new source locations.

`fit-pathology-plateau.py` first saves the previous native history as
`fit-acs-00004-pre-plateau.json`, then tests two initialization signs and
regional/general rational AP-shape families. The rational time transform
changes plateau triangularity while preserving the first 4 ms and APD90.
Its residual weights are QRS 1.2, ST 3, late recovery 2 and other times 1,
after the existing training-derived lead balancing. Weights multiply
residuals and are therefore squared in the least-squares objective.

`fit-pathology-early-plateau.py` tests three starts of a stronger monotone
early-plateau suppression. The prescribed transition ends at 30 ms; an
endpoint-preserving Hermite tail keeps APD90 and the return-to-rest time.
It then fits onset, common speed, common ventricular gain and injury delay,
followed by a QRS-balanced comparison. The main phase weights are QRS 1.2,
ST 4 and late recovery 3; the QRS-balanced comparison uses 2.5, 3 and 2.
These are explicitly different training objectives from the original
whole-window search. No per-lead gain or finished-ECG correction is fitted.

`fit-pathology-activation-pareto.py` performs one final QRS-only refit of the
already existing delivery timings from the ST/T-focused basin. All candidate
training and held-out metrics use the same declared analysis windows. The
new `lateRecovery` summary always uses 180–480 ms after the QRS anchor;
when exported it is recomputed for every retained candidate and the
training-versus-held-out repeatability comparison. A separate descriptive
terminal-T minimum uses 250–480 ms and is not a new fitting target.

`fit-pathology-finalize-shapes.py` keeps the previous teaching default
`recovery-prior-shortened` and numerical winner. It retains two new full
browser comparisons: `plateau-regional`, a failed rational-shape improvement,
and `early-plateau-coupled`, labeled as an ST/T-focused regional-prolongation
tradeoff. The latter's early-plateau fraction converged to 1, so its useful
change comes from the recovery field rather than early plateau depression.
The extension coefficient reaches the explicitly broadened −140 ms injury
shortening bound. This is an uncalibrated sensitivity bound, not a measured
human ischemic APD response or inferred patient disease stage. Actual local
APD distributions and clipping are reported.

All five initialization outcomes remain under
`plateauCandidateInitializations` and `earlyPlateauCandidateInitializations`
in the native history. The additional general-shape, QRS-balanced and
activation-rescue outcomes remain under `plateauRetiredComparisons` with
parameters, native traces and errors. Every optimizer call count, bound,
start, fitted parameter set and objective remains in `history`.
`plateauSearchConclusion` records the default-preservation decision. Only
training data guided fitting and candidate retention; held-out beats are a
within-record reproducibility check.

`fit-pathology-waveform-audit.py` verifies 55 duration/shape combinations, checks the actual neighboring-cycle tail at the next source peak, and saves independent Python/JavaScript waveform fixtures in `ap-shape-waveform-audit.json`. This includes rejected early-plateau fractions, so checking the retained identity case alone cannot conceal an implementation error.

The new phase-focused comparison has `directVerify: true`; the exporter
recomputes its ECG over all 2,400,926 sites at every displayed millisecond,
in addition to the selected default's direct check. It emits independent
Python source/render fixtures for every retained shape family, and the
JavaScript verification script checks those against the actual browser
`FittedField` evaluator. Missing optional shape arrays mean the original
unchanged AP evaluator. The shape parameters and modified curves describe
phenomenological source sensitivities; the package does not claim to have
identified patient ion concentrations or channel conductances.


## Shared-path continuity and paired local voltage inspection

Run `node scripts/check-conduction-continuity.mjs` to check the geometric and temporal parent/child handoffs on the shipped anatomy. The method, baseline reproduction and blocked-side scope are documented in `dist/data/pathology-fits/CONDUCTION_CONTINUITY.md`. Run the existing `check-electrical-events.mjs` and `check-electrical-field.mjs` checks to confirm independent event clocks and shared working-cell voltages.

The fitted-example interface adds `fit-ap-panel.js` alongside `fit-explorer.js`, `fit-chart.js` and the matching styles. It samples `FittedField.voltageAtNode` at two rendered anatomical points and plots both modeled membrane potentials and their difference. The local pair difference is not itself an ECG lead voltage. Approximate AT/APD readouts interpolate source parameters; they are not threshold measurements on the displayed blended trace. Sample locations stay fixed across model changes; an explicit Reset pair chooses suggested locations for the current candidate. The RBBB suggested pair uses an LV point and an RV cut-face point at the 85th percentile of that field's cut-face activation times; the STEMI pair uses a low-injury reference point and the highest-weight injury point on the visible LV cut face. These are chosen teaching examples, not regional averages.

Browser checks of the final interface cover tissue picking, probe persistence across experiments, reset, synchronized chart/keyboard seeking, and desktop/375-pixel layouts. The shared conduction lesson's cutaway and rising/falling-voltage legend were also inspected. These are interface checks; numerical model checks and physiological limits are reported separately above.

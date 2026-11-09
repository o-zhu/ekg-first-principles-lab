# Reproducibility and verification

EKG Lab is a static application with editable JavaScript modules in `dist/`.
There is no compilation step, application server, database, API key, or runtime
package installation. The finished model outputs are distributed with the
release assets. Running the website does **not** require numerical fitting.

This document separates three tasks: running the retained implementation,
checking the retained results, and optionally regenerating research outputs.
The last task has additional dependencies and known source gaps.

## Run the finished application

Use Node.js 24; `.nvmrc` pins the checked environment to 24.22.1. Python 3 is
used by the checksum-verifying asset installer. From the repository root:

```sh
npm run setup:assets
npm start
```

Open <http://127.0.0.1:8000>. `npm start` serves `dist/` using Node built-ins;
it does not require `npm install`. Do not open `dist/index.html` as a `file:`
URL, because modules and data loading need HTTP. A conventional static server
also works:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

For a development environment that needs an externally reachable preview,
explicitly choose the bind address and port:

```sh
npm start -- --host 0.0.0.0 --port 8000
```

The default server binds to loopback and only serves `dist/`. It is a local
development convenience, not a production hosting service. The large runtime
assets belong in the paths restored by the installer; moving them independently
will break relative fetches. The nested `dist/cardiac-voltage/` lesson is part
of the application and should stay at that location.

## Install and run the checks

The website has no npm runtime dependencies. The two DOM regression scripts
use pinned development dependencies, `jsdom` and `css-tree`:

```sh
npm ci --ignore-scripts
npm test
```

`npm test` runs 16 checks, including both the coupled-conduction and fallback
paths. It needs the runtime assets installed above. It checks the retained
source without changing model parameters, fitting results, or recordings.
Use `npm test -- --verbose` to see each successful check's detailed output.
Failure details are always printed.

| Command | Scope | Additional inputs |
| --- | --- | --- |
| `npm run test:code` | Electrolyte model, playback/gain functions, lead-label layout, post-interaction scene work, and Module 1 DOM behavior | npm development dependencies; no release data download |
| `npm test` | The five source checks plus clinical scaling, conduction, electrical fields, fitted playback, recordings, and full application DOM navigation | Runtime release assets |
| `npm run assets:verify` | Sizes and hashes of the distributed runtime assets | Runtime release assets |
| `npm run test:numerical` | Runtime reference audit, all 24 fitted cases, and Python/JavaScript membrane-voltage parity | Runtime assets, optional research assets, Python with NumPy |
| `npm run test:recordings` | Recorded-arrhythmia sample identity and event adaptation | Runtime release assets |

The GitHub Actions workflow deliberately runs `test:code`, which works from a
source-only checkout. It does not download large clinical/model assets on each
pull request. Passing CI therefore does not imply that the complete asset
bundle or the full numerical suite was checked on that pull request.

For numerical parity without fitting:

```sh
npm run setup:research
python3 -m venv .venv
. .venv/bin/activate
python -m pip install numpy==2.3.5
npm run test:numerical
```

On Windows, activate `.venv\Scripts\activate` and use the Python executable
available in that environment. The numerical runner uses `python3` by default;
set the `PYTHON` environment variable if it has a different name. It writes
temporary reports outside the checkout, prints the results, and removes the
temporary files. To retain a report, run its underlying script with an explicit
output path:

```sh
python3 dist/research/verification/audit_runtime_assets.py --output /tmp/ekg-runtime.json
node dist/research/verification/audit_fitted_cases.mjs dist /tmp/ekg-fits.json
python3 dist/research/verification/check_vm_parity.py --output /tmp/ekg-vm-parity.json
```

Choose an appropriate writable output directory on your operating system. Do
not overwrite the bundled historical reports merely to record a new run.

### What these checks establish

The suites execute production mathematical functions and event handlers;
their assertions cover exact sample preservation, declared physiological
constraints, calibrated plot geometry, synchronization, label collisions and
stability, finite-record behavior, and reduced DOM work after 3D interaction.
The full case audit checks that the published case fields and their declared
coverage are internally consistent. The parity audit compares the shipped
JavaScript voltage evaluator with the retained Python forward calculation.

DOM tests stub canvas/WebGL and frame scheduling. Scene tests use explicit
geometry and DOM fixtures. They are **not** measurements of real browser FPS,
actual pixel layout, accessibility in every assistive technology, or behavior
on every device. Check the site in a browser after UI or graphics changes,
including rotation followed by playback, small-screen layouts, lead toggles,
case switching, action-potential exploration, and the fitted/original views.
`dist/research/verification/BROWSER_CHECKS.md` describes earlier manual coverage;
its date and limitations remain part of that historical record.

Numerical agreement is an implementation check, not evidence that the inferred
activation pattern is unique or is a patient-specific ground truth. The
scientific limitations in the application and fit-method documents apply.

## Optional research environment

The retained regeneration run records Python **3.12.14**. Install its numerical
dependencies separately from the website tooling:

```sh
python3.12 -m venv .venv-research
. .venv-research/bin/activate
python -m pip install -r requirements-research.txt
```

`requirements-research.txt` pins the recorded NumPy, SciPy, threadpoolctl, VTK,
Matplotlib, and Pillow versions. This is a version-pinned dependency list,
not a platform-independent binary lock or a promise of identical optimizer
trajectories. The runtime's tested Node version is recorded in `.nvmrc`.
The original environments are also retained under
`dist/research/regenerated-fits/environment.json` and
`data-source/pathology-fitting/software-versions.json`.

The native four-chamber model has 340,582 source nodes and 2,400,926 voltage
quadrature sites. Operator reconstruction can use several gigabytes of memory.
Full fitting can take substantially longer than verification. The preparation
wrapper fixes numerical thread counts, but OS, compiler, BLAS, and floating-point
differences can still change an optimization trajectory.

Optional shader checks need a surfaceless EGL/OpenGL runtime with
`libEGL.so.1` and `libGL.so.1`:

```sh
python scripts/check-electrical-gpu.py
python scripts/check-fitted-surface-gpu.py
```

Read their output: unavailable graphics runtimes may be reported as skipped.
These checks compile/evaluate shader expressions; they do not replace browser
visual inspection.

## Research source and supported regeneration paths

`npm run setup:research` restores the optional research archives and retained
intermediates at their original relative paths. The two source archives are:

- `dist/cardiac-voltage/data/heart-model-reproducible-source.zip`: the original
  CT four-chamber geometry preparation, torso operator, calibration,
  action-potential templates, and reference-model scripts.
- `dist/data/pathology-fits/propagation-research.zip`: pathology target
  preparation, fitting experiments, source recordings, retained fit histories,
  teaching-atlas scripts, and numerical checks.

These archives retain older snapshots of some application files. **Extract
them only into an isolated research directory.** Do not extract an entire
archive over the current repository or `dist/`; that would replace newer UI
source with historical copies. The current `reproduce.py` wrapper performs
isolated extraction and validates archive paths.

| Output or asset | Retained processing source | Reproduction boundary |
| --- | --- | --- |
| CT four-chamber model and torso operator | `scripts/build_four_chamber_model.py`, `build_torso_operator.py`, `refine_source_field.py`, and `data-source/four-chamber/prepare_rodero_input.py` inside the four-chamber archive | Retrieves the checksum-pinned Rodero archive from Zenodo. Large raw anatomy/operator caches are not Git source files. |
| Original detailed RBBB and anterior STEMI experiments | Top-level `scripts/fit-pathology-*.py`, target/import scripts, optional retained intermediates, and the propagation archive | Follow the archived experiment sequence and declared selection criteria; these are larger searches than the later 22-case reconstruction. |
| The other 22 clinical fits | `dist/research/regenerated-fits/reproduce.py` and `scripts/regenerate_all_cases.py` beside it | Reconstructs bounded candidate searches from saved recordings and the native operator; it is a documented regenerated release, not a byte-for-byte recovery of a lost earlier package. |
| Electrical teaching atlas and conduction coupling | `scripts/build-electrical-atlas.py`, `build-conduction-coupling.py`, and the accompanying geometry scripts | Requires their recorded anatomy/model inputs. The BodyParts3D display field and native CT fitted field are distinct. |
| Optional channel and pharmacology structures | `scripts/prepare-channel-structures.py` and `dist/scripts/build-pharmacology-structures.py` | Uses documented public structural inputs; the pharmacology script accepts a raw source directory. |
| Optical donor movies, masks, and timing maps | Processing is described in `dist/cardiac-voltage/data/human/README.md` and donor metadata | **`process_human_optical.py` is missing from the recovered source.** The finished outputs are included, but their exact preprocessing cannot currently be rerun from a retained script. |
| Initial PTB-XL collection and Mobitz II excerpt imports | Finished clinical JSON, source-record metadata, and `dist/data/DATA-SOURCES.txt` / the Mobitz provenance files | **Dedicated original import scripts for these initial collections were not recovered.** Later STEMI, tachyarrhythmia, and torsades import scripts are present. Retained sample checks and target-preparation scripts do not replace the missing original import implementation. |
| BodyParts3D base heart/chest/skin GLBs and lower-detail variants | Source hashes, selections, transformations, and reduction method are retained in `dist/models/*manifest.json` and `low-models.json` | **The original conversion and level-of-detail generation scripts are missing.** The complete runtime models are included. |
| BodyParts3D junction additions | `scripts/prepare-heart-junctions.py` | The script is present; it expects the original `research-anatomy/isa_BP3D_4.0_obj_99.zip`, which is not bundled. Its source URL and hash are in the heart manifest. |

The missing scripts above are explicit source gaps. Descriptions and hashes
help audit an asset, but do not substitute for the missing implementation.
No new fitting or replacement generator is needed to run the published site.

### Regenerate the 22 reconstructed clinical cases

The current wrapper is the preferred entry point. Use a **disposable copy** of
the installed site because regeneration writes case outputs into its `--site`
directory:

```sh
cp -a dist ../ekg-lab-regeneration-site
python3 dist/research/regenerated-fits/reproduce.py \
  --site ../ekg-lab-regeneration-site \
  --work-dir ../ekg-lab-regeneration-work
```

Choose a new work directory outside the checkout. `--case CASE_ID` can limit
the run to one of the 22 reconstructed cases; use `--help` for the exact
arguments. The retained RBBB and anterior STEMI experiments use their separate
historical workflow. Read
`dist/research/regenerated-fits/README.md` before starting a regeneration.

The raw Rodero input is fetched from the public pinned source and verified
against the original archive, VTK, and canonical-array checks. Reconstruction
reuses the retained render/appendage assets. Regenerating those optional
upstream anatomical refinements has further dependencies, including the
pinned TetGen version described in the original four-chamber source package.

Other detailed workflows and scientific context remain in
`data-source/pathology-fitting/REPRODUCE.md`, `FORWARD_FIT_METHODS.md`,
`TARGET_METHODS.md`, and `REGENERATED_FIT_METHODS.md` under
`dist/data/pathology-fits/`. Treat older package dates, saved outputs, and
statements about past runs as historical evidence, not as a new verification.

## Asset integrity and redistribution

Use the release asset manifest and `npm run assets:verify` to check the
installed files before modifying data. The repository's MIT license covers
original code and documentation as explained in `LICENSE` and
`THIRD_PARTY_NOTICES.md`; externally sourced data, anatomy, fonts, models, and
vendored software keep their own licenses. Input identifiers and scientific
source references remain attached to their datasets. Do not apply the code
license to third-party assets or silently replace a fitted dataset after
verification.

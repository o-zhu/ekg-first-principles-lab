# Reproduce the calibrated four-chamber source model

This directory supports Module 4 of Cardiac Voltage. The current model combines
CT-derived anatomy, an explicitly reconstructed LAA, pooled human optical AP
recovery, a published atrial AP, calibrated propagation/source parameters, and
a finite-body forward ECG calculation. See `dist/data/FOUR_CHAMBER_METHODS.md`
for complete equations, evidence, assumptions, and fit interpretation.

## Rebuild the published model

From the extracted project root, with Python 3, NumPy, SciPy, VTK, and
threadpoolctl available:

```sh
python data-source/four-chamber/prepare_rodero_input.py
python scripts/build_torso_operator.py
python scripts/build_four_chamber_model.py
python scripts/audit_four_chamber_model.py
```

Node.js is required by the audit's JavaScript playback checks. The full field
calculation requires several GB of memory. It evaluates 1,001 time samples,
three cellular scenarios, all twelve leads, and source-sampling alternatives.
To regenerate the comparison report and figure, install Matplotlib and run
`python scripts/report_lead_ii_calibration.py`. The current methods notes can
then be regenerated with `python scripts/write_model_documentation.py`.
The retained extension/rendering/template assets are sufficient; neither
TetGen nor a new optical-data download is required for this main rebuild.

The complete repository has verified byte parts for `rodero-myocardium.npz`.
The compact source ZIP omits those large parts; the preparation script instead
retrieves the exact public source archive and verifies MD5/SHA256 and all
eleven canonical arrays. Original source:
https://zenodo.org/api/records/4593739/files/average.tar.gz/content

The 58,167,648-byte archive has MD5
`992f31e20c1aa73c10c5d9a6b6ac903a`. Only the regular `average.vtk` member is
streamed to a controlled path. Source paths, symlinks, permissions, and ownership
are never applied through archive extraction. The canonical myocardial NPZ has
SHA256 `fcaf2e84123ace36721056535b5db566a2c84abdcb6c69c7a7054f1541d6ec7c`.

## Reconstructing the appendage and rendering

`scripts/appendage_anatomy.py` loads the canonical anatomy, appends the retained
`laa-extension.npz`, and returns the complete arrays without changing original
source indices/coordinates. The exact native ostium is retained in
`laa-ostium-interface.npz`, with original tag provenance in its companion JSON.

To regenerate the assumed extension and the display geometry, install
`tetgen==0.8.4` and use VTK 9.3.1, then run:

```sh
python scripts/appendage_anatomy.py --render
```

The source seam is preserved; geometry beyond it is explicitly inferred.
Different mesher versions may produce different valid interior/render nodes.
Loading the retained, hash-checked extension reproduces the published model
without relying on a new meshing run. Both pulmonary-vein and mitral interfaces
are unchanged. The renderer uses `rodero-appendage-render.npz`, not the older
`rodero-render.npz` retained for historical comparisons.

## AP templates and their original data

The selected default is `selected-human-ventricular-template.json`, pointing to
the conditioned equal-donor empirical recovery in
`pooled-human-ventricular-template.json`. The latter contains source hashes,
unconditioned and conditioned evidence, donor weighting, and alternative shape
fits. It does not use ECG samples to construct the AP shape.

To recreate it, obtain the two exact MAT files from
https://zenodo.org/records/3986725 and run:

```sh
python scripts/build_pooled_optical_template.py --raw-dir /path/to/raw-mat-files
```

Required files are `Patient1_CL1000.mat` and `Patient2_CL1000.mat`; their hashes
are in the pooled JSON and optical metadata. The retained optical display
exports allow the script to verify byte-for-byte agreement after quantization
and exact activation-map agreement. The measured movies are not changed by
the shape-pooling alignment.

`references/README.md` describes the Courtemanche atrial template and raw PTB
reference extraction. The native TT06 endo/epi alternatives are reproducible
with `scripts/generate_tt06_templates.py`; that script fetches checksummed
official PMR equations. The PMR exposure's license is unspecified, so the
downloaded generated source is not redistributed. Numerical outputs and our
retrieval/solver wrapper are retained.

## Calibration and numerical refinement

`lead-ii-calibration.json` freezes the selected delivery sites/times, speeds,
effective source conductivities, APD field, template choice, and fit bounds.
The PTB ECG is explicitly a fitting target. A closer lead-II match is not an
independent clinical validation or a unique recovery of donor physiology.

`calibration-search/` retains bounded search scripts, original candidate
parameters, and experiment outputs. See its README and the consolidated
`dist/data/lead-ii-fit-study.json`. The previous published traces and exact
commit/model hash are retained in `lead-ii-fit-baseline.json`.

`refine_source_field.py` integrates the midpoint-refined cellular field with
the original activation graph and parent torso gradients held fixed.
`refine_render_mapping.py` maps the browser surface to the same eight-child
tetrahedral basis. Its `--self-test` checks affine fields and nonlinear Vm
against an independently located child basis.

There are three generated, ignored caches: `torso-operator.npz`,
`operators-cache.npz`, and `midpoint-source-operator.npz`. Their fingerprints
include declared geometry, implementation/configuration, calibration, and
refinement inputs. A filename alone never establishes cache validity.

The independent audit checks the final serialized APs and signals, all twelve
lead identities, constant-field cancellation, AV insulation, source geometry,
source/refinement weights, and shipped browser evaluator. It uses the retained
torso field rather than rerunning its complete FEM solve, and is explicitly a
numerical-consistency audit.

## Attribution

Rodero et al. 2021, https://doi.org/10.1371/journal.pcbi.1008851 and
https://zenodo.org/records/4593739 (CC BY 4.0). Human optical recordings:
Smirnov et al. 2020, https://zenodo.org/records/3986725 (CC0). PTB ECG:
https://physionet.org/content/ptbdb/1.0.0/ (Open Data Commons Attribution).
The original geometry credit and modification notice are in
`RODERO_ATTRIBUTION.txt`; exact input hashes are embedded in the generated data.

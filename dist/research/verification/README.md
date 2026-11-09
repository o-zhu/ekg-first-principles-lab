# Independent export verification

These checks verify the recovered website's runtime assets, fitted-case data
contracts, and agreement between its JavaScript membrane-voltage evaluator and
the original Python forward-model action-potential function. They do not
establish that a fitted propagation field is the patient's true activation map.

## Recorded results

The frozen 24-case export was checked on 2026-10-30:

| Check | Result |
| --- | --- |
| Runtime dependencies | All 144 identified runtime files present |
| Optical voltage data | Both donors' voltage, beat, mask, and timing sizes agree with metadata |
| Electrical atlas | SHA-256 agrees with its published metadata |
| Case coverage | All 24 manifest cases represented |
| Source fields | Required arrays have 20,957 entries and finite values |
| Original recording channels | Every case retains the original channel names and native sampling-rate metadata |
| Source and rendered voltages | Finite at the sampled times; within the broad screening range of −150 to +80 mV |
| Waveform metrics | Stored training/held-out RMSE agrees with recomputation within 0.00002 mV |
| Limb-lead algebra | Predicted derived leads agree within 0.000005 mV |
| Python/JavaScript source parity | 478,776 comparisons; maximum absolute difference 3.35 × 10⁻¹² mV |
| Python/JavaScript rendered-node parity | 144,400 comparisons; maximum absolute difference 2.80 × 10⁻¹² mV |

The JSON reports retain case and evaluator hashes, per-approach results, and
the sampling details. Reports describe the files identified by those hashes.

## Run from the website directory

```bash
python3 research/verification/audit_runtime_assets.py --output research/verification/runtime-asset-audit.json
node research/verification/audit_fitted_cases.mjs
python3 research/verification/check_vm_parity.py
```

All scripts default to the project root relative to their installed location.
The runtime and parity scripts also accept `--root PATH` and `--output PATH`.
The fitted-case script accepts positional `PROJECT_ROOT` and `REPORT_PATH`
arguments. Every audit exits with a nonzero status if its assertions fail.

The runtime audit uses Python's standard library. The case audit uses Node.js.
The parity audit uses Python with NumPy and invokes the accompanying
`emit_vm_fixture.mjs` script through Node.js. It reads the original `q_at`
function directly from the bundled `propagation-research.zip`; no source
download, model fitting, or operator cache is required. `--fit-script PATH`
can select an extracted copy of that original Python script instead.

The recorded environment was Python 3.12.14, NumPy 2.3.5, and Node.js 24.22.1.

## Scope and limitations

Runtime discovery combines code references with known dynamic model/data
paths and the final fit manifest. Research archives, preview copies, and
dependency folders are excluded from the runtime scan. This is an asset
inventory, not a substitute for interactive browser verification.

The case audit samples all displayed source and surface nodes at uniform and
event-related times. It checks field lengths, event-stream maps, available
channels, waveform lengths, finite values, stored metrics, and lead identities.
Its voltage range is deliberately broad; passing it is not proof that every
local waveform or conduction hypothesis is physiologically realistic.
Unchanged case results are reused only when the verifier, evaluator, base
model, clinical recordings, and case-content hashes also match.

The parity audit independently evaluates the Python action-potential function
at representative source sites and renders nodes using the exported weights.
It includes ordinary periodic fields, both plateau-shape families, and
chamber/region-specific event schedules. It checks that the browser shows the
same hypothesis the source evaluator defines. It does not rerun the full
2.4-million-site torso operator; separate all-source checks are preserved in
each regenerated case's `numericalVerification` metadata.

Manual review additionally confirmed that VF/torsades spectral initialization
uses only the training segment and that the PVC atrial event stream excludes
the ectopic anchor. Atrial timing priors are nominal model delays; sampling
the native activation map can shift the earliest represented activation by a
few milliseconds. The SVT atrial offset is also cycle/phase ambiguous and must
not be interpreted as a measured PR interval. Parameter-boundary flags and
poor waveform agreement remain visible in the exported cases.

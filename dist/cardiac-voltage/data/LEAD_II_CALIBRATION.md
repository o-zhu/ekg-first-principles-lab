# Lead II: calibration methods and limits

The updated signal is a full spatial forward calculation from prescribed local
membrane action potentials. It uses **2,400,926 source-field
sites**, including tetrahedral edge midpoints, on the connected four-chamber
geometry with its inferred left atrial appendage. The 15 specified ventricular
delivery locations, their timing, conduction speeds, effective source
conductivities, and spatial APD field were calibrated to lead II from the
measured PTB healthy-control record `patient104/s0306lre`.

This target was used in parameter selection. Improved agreement is calibration
performance, not an independent validation of the inferred physiology. Anatomy,
optical recordings, and ECG come from different people.

## Quantitative comparison

The comparison uses raw mV. The optimization clock and both model traces receive
the same 30 ms translation; the fixed target R anchor is 261 ms. The full JSON
also reports a separate R-aligned comparison using a rigid time translation.
Neither comparison scales amplitudes or stretches time.

| Comparison | Previous RMSE, mV | Updated RMSE, mV | Reduction |
|---|---:|---:|---:|
| 700-ms window | 0.14970 | 0.03476 | 76.8% |
| P wave | 0.12147 | 0.01430 | 88.2% |
| QRS | 0.29830 | 0.04593 | 84.6% |
| ST / T | 0.07255 | 0.03737 | 48.5% |

The selected R maximum is 1.1423 mV at
262 ms; the T maximum is
0.3957 mV at 527 ms.
The measured reference has a 1.15375 mV R maximum and a 0.4035 mV T maximum.
The largest secondary positive QRS peak has a prominence of
0.00000 mV under the
declared 0.01 mV detection threshold. This descriptive metric is not a clinical
diagnostic criterion.

## What produced the improvement

Increasing source-field resolution alone had little effect on the preceding
signal: the controlled midpoint refinement changed whole-beat RMS voltage by
about 0.00108 mV and left QRS fitting error essentially unchanged. It improves
integration of the specified membrane field; it does not add biological data or
solve a more complete propagation model.

The main QRS improvement came from coordinating ventricular delivery. The
preceding model allowed a late basal RV contribution to create a separate R
shoulder. Fitting bounded timing at the existing 12 locations helped; adding
three modeled basal RV delivery locations helped more. The source model uses
the earliest arrival from any site, so 13 of the 15 specified sites have
nonempty earliest-arrival territories. Two sites are superseded by other
fronts. This illustrates why an ECG fit cannot uniquely identify a Purkinje
network.

The recovery template now pools **2,948 accepted optical sites from two human
donor LV wedges**: 2,493 sites from donor 1 and 455 from donor 2. Sites were
aligned by activation and normalized APD for shape estimation, then pooled
within each donor and given equal donor weight. These are optically sampled
tissue sites, not independent individual-cell recordings. The selected direct
pooled recovery shape was derived without ECG information. Its local duration
field was subsequently fitted to the ECG; no whole-heart measured APD map is
claimed. The intrinsic 2 ms upstroke and −85/+25 mV membrane scale remain
explicit assumptions because optical fluorescence does not calibrate either.

The direct pooled recovery gave a closer T wave than a smooth Richards fit to
the same optical pool. Published TT06 endocardial ionic output was also tested
with its native voltage scale and rapid upstroke. It gave a steeper terminal
recovery and did not improve the chosen fit. A further APD50 time-warp fit
required a large distortion of the native ionic shape and was rejected as the
default. All these alternatives are retained in the numerical study.

## Explored alternatives

These are staged experiments, not a factorial comparison: some stages add
atrial fitting or the appendage, while others isolate source-field sampling or
an AP family. The complete parameters, source clock, traces, and disposition
are in `lead-ii-fit-study.json` and `calibration-search/`.

| Method | Whole-window RMSE, mV | QRS RMSE, mV | Interpretation |
|---|---:|---:|---|
| Previous published model | 0.1497 | 0.2983 | Baseline |
| Denser source-field evaluation | 0.1497 | 0.2983 | Numerical improvement; essentially no morphology-fit gain |
| Unrestricted four-region fit | 0.1177 | 0.1197 | Rejected: regional chronology deviated too far from the mapping assumptions |
| Four regions with timing constraints | 0.1010 | 0.1241 | Improved fit; residual R shoulders |
| Twelve individually timed delivery sites | 0.0608 | 0.0718 | Improved fit; terminal QRS shoulders remain |
| Faster endocardial propagation | 0.0914 | 0.1245 | Not selected: a larger QRS error |
| Fifteen coordinated delivery sites | 0.0556 | 0.0458 | Selected activation family |
| Single-pixel optical duration fit | 0.0494 | 0.0711 | Improved recovery timing; single-pixel slope variation remains |
| Published TT06 ionic AP family | 0.0556 | 0.0739 | Independent AP-family comparison; steeper terminal recovery |
| TT06 with fitted APD50 shape | 0.0458 | 0.0744 | Rejected as default: the fitted APD50/APD90 ratio reached 0.68, far from native 0.906 |
| Phenomenological smooth recovery | 0.0446 | 0.0705 | Exploratory comparison; less directly tied to the recorded AP shape |
| Equal-donor pooled AP: Richards fit | 0.0401 | 0.0435 | Valid data-derived alternative; its T wave is broader and lower than the target |
| Equal-donor pooled AP: direct recovery | 0.0345 | 0.0451 | Selected AP family; the AP shape was derived without ECG information |
| Selected full-source model | 0.0348 | 0.0459 | Default displayed simulation |

## Parameter and validation limits

The effective ventricular source conductivities are
0.26838 S/m longitudinally and
0.06709 S/m transversely. The isotropic
atrial value is 0.02645 S/m. These are fitted source
parameters, not measured conductivities from either donor. They are independent
of the graph travel speeds in this reduced model; this is not a coupled ionic
tissue PDE.

The selected ventricular APD90 median is
331.49 ms. The RV offset reaches its
−35 ms fit bound, so it should be treated as uncertain. The torso remains a
homogeneous ellipsoid with virtual electrodes. Fine anatomy, blood and lung
conductivity compartments, and mechanical contraction are not represented.

The measured reference retains a late positive post-T offset. A perfect fit to
that tail was not imposed as persistent myocardial depolarization. Small
remaining ST and P-wave differences should be interpreted alongside the source
and measurement assumptions.

Only lead II was optimized. The table below exposes what happened to the other
leads under the same model and the same reference R clock. It is not an
independent clinical validation; all leads come from the same reference person.
**10 of the 11 non-target leads have a larger
whole-window error after this lead-II calibration.** The improved fit therefore
does not establish a generally more accurate 12-lead heart model.

| Lead | Previous whole-window RMSE, mV | Updated RMSE, mV | Role |
|---|---:|---:|---|
| I | 0.1404 | 0.3420 | Not fitted |
| II | 0.1497 | 0.0348 | Fit target |
| III | 0.1578 | 0.3410 | Not fitted |
| aVR | 0.1221 | 0.1733 | Not fitted |
| aVL | 0.1288 | 0.3406 | Not fitted |
| aVF | 0.1370 | 0.1719 | Not fitted |
| V1 | 0.4908 | 0.6304 | Not fitted |
| V2 | 0.3912 | 0.5411 | Not fitted |
| V3 | 0.2370 | 0.4984 | Not fitted |
| V4 | 0.3004 | 0.5140 | Not fitted |
| V5 | 0.3138 | 0.2749 | Not fitted |
| V6 | 0.4342 | 0.5115 | Not fitted |

## Reproduction and provenance

`scripts/build_four_chamber_model.py` rebuilds the selected model from
`lead-ii-calibration.json`, the pooled template, anatomy, and torso inputs.
`scripts/report_lead_ii_calibration.py` creates this report from its exact output.
`scripts/audit_four_chamber_model.py` independently checks the source field,
forward integration, source mapping, timing, and browser AP evaluation. The
historical bounded searches and rejected alternatives are retained in
`data-source/four-chamber/calibration-search/` with their input requirements.

- Model SHA-256: `b560a70554fcccbd89e69d35a96cb5d80c0e583f427a4f61a36c17f7451d63fb`
- Calibration SHA-256: `528a0338c37b30dc18083691ca3dc9e6ee8c01862c08242c1609b544500d86ba`
- Selected AP template SHA-256: `9f9b547db11e366a81794bafeab24d4f0c284b6d1920c6f835c930e9b14fc562`

Primary sources: [PTB ECG](https://physionet.org/content/ptbdb/1.0.0/patient104/),
[Smirnov human optical data](https://zenodo.org/records/3986725),
[Rodero anatomy](https://doi.org/10.1371/journal.pcbi.1008851),
[Durrer human activation](https://pubmed.ncbi.nlm.nih.gov/5482907/),
[Cranford delivery sensitivity](https://pubmed.ncbi.nlm.nih.gov/29549620/), and
[TT06 ionic implementation](https://models.cellml.org/e/80d).

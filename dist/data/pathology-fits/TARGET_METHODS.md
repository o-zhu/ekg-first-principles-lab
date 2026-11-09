# Real ECG targets for the propagation-fitting study

These artifacts contain **measured surface ECGs and derived representative beats**. They do not contain measured activation or recovery maps. The separate fitting experiment asks how closely a constrained anatomical forward model can explain these recordings. A plausible fit cannot uniquely recover the patient's conduction pathways, ischemic region, action potentials, torso conductivity, or anatomy.

## Recordings and provenance

| Target | Original source | Source labels | Source resolution | License |
|---|---|---|---|---|
| `ptbxl-03155` | [PTB-XL 1.0.3](https://physionet.org/content/ptb-xl/1.0.3/), `records500/03000/03155_hr` | CRBBB with 100% confidence; sinus rhythm with unspecified confidence; human-validated metadata | 12 simultaneous leads, 10 seconds, 500 Hz | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `acs-00004` | [ACS ECG dataset, Figshare v1](https://doi.org/10.6084/m9.figshare.29925314), `row_data/00004` | STEMI, AMI, OMI, proximal LAD occlusion | 12 simultaneous leads, 10 seconds, 500 Hz | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `acs-18206` | Same ACS dataset, `row_data/18206` | STEMI, AMI, OMI, proximal RCA occlusion | 12 simultaneous leads, 10 seconds, 500 Hz | CC0 1.0 |

The implemented fitting study targets RBBB 03155 and anterior STEMI 00004. Inferior STEMI 18206 is an additional prepared target for inspection and future extension; this preparation alone does not provide an inferred electrical map for it. A fitted inferior case would require its own appropriate regional prior and explicit model evaluation.

The app's RBBB example and this fitting study both use the matching **original 500 Hz edition**, acquired from PhysioNet. The previously bundled 100 Hz edition remains in the separate downloadable `clinical-ecgs.json` collection. The target preparation verifies all 12 WFDB initial values and modulo-65536 channel checksums. `source/03155_hr.hea` and `.dat` retain their original paired filenames.

Both files also match the entries in PhysioNet's published `SHA256SUMS.txt`; the two exact manifest lines are retained in `source/PTBXL-SHA256SUMS-selected.txt`. Attribution: Patrick Wagner, Nils Strodthoff, Ralf-Dieter Bousseljot, Wojciech Samek, and Tobias Schaeffter, PTB-XL version 1.0.3 (2022), [doi:10.13026/kfzx-aw45](https://doi.org/10.13026/kfzx-aw45); original publication Wagner et al. (2020), Scientific Data 7, 154, [doi:10.1038/s41597-020-0495-6](https://doi.org/10.1038/s41597-020-0495-6). This project derives and references representative beats; the original calibrated samples remain available.

The ACS data were already bundled as calibrated native 500 Hz samples. Reconstituting interleaved 16-bit ADC samples from those mV values exactly reproduces each previously preserved original DAT SHA-256. The original ACS WFDB header checksum/initial-value fields are defective: they contain channel extrema rather than valid WFDB integrity values. This defect remains disclosed; we do not relabel the header checks as passed. The prior import verified the archive CRC32. See the [source paper](https://www.nature.com/articles/s41597-026-07278-0) and the original dataset for acquisition and clinical-label details.

“Anterior” and “inferior” are teaching interpretations of the lead patterns and associated coronary labels. The source does not independently adjudicate those wall territories. ECG-to-angiography intervals were 661 minutes for ACS 00004 and 62 minutes for ACS 18206, so the artery labels must not be presented as simultaneous electrical mapping.

### Original DAT SHA-256

```text
PTB-XL 03155, 500 Hz
f4e1237086b89b6ebce48639f6b3116cb19e8b160f0898d3e7692a7bd448fef9

ACS 00004
cc4bce91daf218f4c0d521ebe88947b6f670653e7656a4bed25fa269994b9bed

ACS 18206
d67c7a15300b56813906480b6789eaac5c958f0b41f9ebe6b7fa07177a4d7f5c
```

Calibrated original waveforms are available in `source/<target>-500hz.json`. They retain every sample in the original 10-second recording, including excluded and incomplete beats. They receive no additional filter, baseline subtraction, resampling, amplitude normalization, or cropping.

## Detection, alignment, and reference voltage

1. Convert ADC samples to mV using gain 1000 and ADC baseline zero. Check the calibration and source integrity before analysis.
2. Detect candidate QRS complexes using RMS first-difference energy over the eight independent channels I, II, V1–V6. A 40 ms moving average, 450 ms minimum separation, and prominence equal to 25% of the detector's 99th percentile operate **only on the detector**. They do not filter the ECG used for fitting.
3. Refine each candidate to the lead-I R maximum within ±80 ms. Align all 12 leads using that same integer-sample anchor. In RBBB, V1's terminal R′ is not independently aligned with the earlier lead-I R wave.
4. Extract −250 through +650 ms around the anchor at native 2 ms spacing. No P wave, QRS, or T wave is separately stretched or shifted. Actual RR intervals remain unchanged.
5. Subtract one constant per lead per beat: the median voltage in the reviewed PR segment. This creates a stated ECG reference; it does not recover the absolute extracellular DC potential. No high-pass filter or within-beat trend subtraction is added.

| Target | Declared PR window relative to R | Native sample offsets included | Native samples | Analysis window | Median RR |
|---|---:|---:|---:|---:|---:|
| RBBB 03155 | −80 to −60 ms | −80, −78, …, −60 ms | 11 | −240 to +620 ms | 1042 ms |
| Anterior STEMI 00004 | −95 to −65 ms | −94, −92, …, −66 ms | 15 | −230 to +520 ms | 859 ms |
| Inferior STEMI 18206 | −95 to −65 ms | −94, −92, …, −66 ms | 15 | −230 to +520 ms | 1004 ms |

The 901-point common time grid has 1 ms spacing and is **linear interpolation of the native 500 Hz representative waveforms**. It adds no temporal resolution. The JSON also includes all 451 native 2 ms samples. The NPZ files retain every complete native beat, its constant reference, and train/held-out membership.

A common, simultaneous alignment preserves interlead timing. This matters because independently aligning each lead can create a different physiological sequence. The time-coherent approach is supported by the original [ARIC median-beat study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6400224/). Representative-beat construction also has limits: genuine beat variability can be clinically meaningful, as shown in [Kors et al., 1992](https://pubmed.ncbi.nlm.nih.gov/1402511/). Original data are therefore retained alongside the median and spread.

## Quality screening and exact beat membership

A preliminary pointwise median is constructed from all complete, baseline-referenced beats. Over −50 to +150 ms, a complete beat is rejected if either:

- Its pooled independent-lead QRS correlation with the preliminary median is below 0.95.
- Any independent lead's QRS RMS deviation exceeds 25% of that lead's template QRS peak-to-peak range; the range has a 0.1 mV floor.

This fixed rule is shared by all three targets. No beat is rejected on ST level alone. A discordant beat may reflect artifact or physiology; the method does not adjudicate which. Exclusion reasons and all source anchors are recorded in the JSON.

| Target | Detected | Complete | Accepted | Training | Held out | Exclusions |
|---|---:|---:|---:|---:|---:|---|
| RBBB 03155 | 10 | 9 | 9 | 5 | 4 | R at 9.628 s: incomplete final window |
| Anterior STEMI 00004 | 11 | 11 | 10 | 5 | 5 | R at 8.444 s: V3 QRS normalized RMS deviation 0.308, above 0.25 threshold |
| Inferior STEMI 18206 | 10 | 9 | 9 | 5 | 4 | R at 9.924 s: incomplete final window |

Training and held-out sets alternate chronologically **after** acceptance:

```text
RBBB 03155
train:   0.270, 2.362, 4.448, 6.508, 8.590 s
heldout: 1.320, 3.406, 5.478, 7.548 s

Anterior STEMI 00004
train:   0.776, 2.436, 4.128, 5.856, 7.566 s
heldout: 1.594, 3.272, 4.990, 6.702, 9.324 s

Inferior STEMI 18206
train:   0.666, 2.644, 4.598, 6.658, 8.818 s
heldout: 1.644, 3.600, 5.602, 7.710 s
```

The training median is the only waveform that fitting and model selection should optimize. The held-out median describes reproducibility on other beats in the **same short recording**, not generalization to other patients. Shared deterministic quality screening and visual landmark review occur before splitting, so this is not a wholly independent clinical validation pipeline.

The display median uses all accepted beats. Its band is the pointwise 25th–75th percentile across those beats. This is **between-beat spread**, not a confidence interval on a patient's anatomy or the fitted parameters.

## Repeatability and baseline sensitivity

The values below compare the separate training and held-out **measured medians**, over the target analysis windows and the eight independent leads. They are not errors of the anatomical model.

| Target | Training-versus-held-out RMS difference | Pooled correlation | Maximum median-reference shift when PR window moves ±10 ms |
|---|---:|---:|---:|
| RBBB 03155 | 0.0234 mV | 0.9897 | 0.007 mV |
| Anterior STEMI 00004 | 0.0304 mV | 0.9944 | 0.006 mV |
| Inferior STEMI 18206 | 0.0419 mV | 0.9931 | 0.010 mV |

The JSON also reports per-lead repeatability, baseline variation between beats, within-window median absolute deviation, and the change from a pre-P reference at −250 to −230 ms. These quantities contain physiological variation, noise, drift, and possible P-tail or P-onset uncertainty. They are sensitivity checks, not independent estimates of absolute DC baseline or a statistical confidence interval.

The pre-P-versus-PR median-reference differences reach 0.031 mV, 0.051 mV, and 0.072 mV across leads in the three respective recordings. These are larger than shifting the PR window by ±10 ms, so the small PR-shift values must not be presented as total baseline uncertainty. For example, the anterior V2 reference differs by 0.036 mV and inferior lead III by 0.034 mV; the corresponding ST elevations remain positive and substantially larger than those reference differences.

The baseline choice preserves clear pathological ST patterns. At the reviewed J+60 ms location, a 10 ms local average gives anterior V2 +0.363 mV and V3 +0.335 mV; inferior lead III +0.279 mV and aVF +0.251 mV. These are descriptive levels relative to the chosen PR reference. They are not new diagnostic adjudications. The exact J point is approximate and has a ±10 ms review uncertainty.

No high-pass detrending is added because filter phase and cutoff choices can distort ST shifts. See the [AHA technology statement](https://doi.org/10.1016/j.jacc.2007.01.024) and the original [filter-distortion experiment](https://pmc.ncbi.nlm.nih.gov/articles/PMC3388307/). The [AHA ST/T statement](https://doi.org/10.1016/j.jacc.2008.12.014) explains that ST levels are defined relative to TP or PR and that acquisition filtering can remove the absolute DC reference. Source devices may already have applied acquisition filters; our processing cannot undo or reconstruct those unknown effects.

## Approximate timing annotations

These annotations come from visual review of the simultaneous native median plots. They are model-initialization hints, **not cardiologist source annotations or validated interval measurements**.

| Target | P onset / offset | QRS onset / offset | Approximate QRS duration | T offset |
|---|---:|---:|---:|---:|
| RBBB 03155 | −230 / −90 ms | −40 / +100 ms | 140 ms | Broad late recovery display endpoint +560 ms, ±130 ms |
| Anterior STEMI 00004 | −220 / −95 ms | −40 / +50 ms | 90 ms | +450 ms, ±40 ms |
| Inferior STEMI 18206 | −220 / −95 ms | −40 / +56 ms | 96 ms | +400 ms, ±40 ms |

QRS endpoints have ±10 ms review uncertainty. P and T boundaries are less certain; broad T/U transitions and ST-T fusion can prevent an unambiguous endpoint. The actual waveform is never altered to enforce these landmarks.

### External automated cross-check of RBBB 03155

After the target waveforms and analysis windows were frozen, the same record was checked against three published automated feature sets in [PTB-XL+ 1.0.1](https://physionet.org/content/ptb-xl-plus/1.0.1/). This adds an external check without replacing the source waveform, selected beats, or model fitting windows.

| Automatic method | QRS duration | PR interval | QT interval | Mean RR |
|---|---:|---:|---:|---:|
| 12SL | 138 ms | 180 ms | 476 ms | 1038 ms |
| Uni-G | 142 ms | 182 ms | 486 ms | 1039 ms |
| ECGDeli | 159 ms | 287 ms | 626 ms | 1042 ms |

The commercial methods corroborate the approximate 140 ms QRS and roughly 180–190 ms PR. The algorithms disagree substantially on late T-wave delineation, and ECGDeli also differs on P onset. These values are **automatic measurements, not expert ground truth**. They do not justify labeling this record as long-QT from our broad display endpoint. RBBB's listed +560 ms endpoint means the late recovery portion retained for the visualization; its uncertainty was widened to ±130 ms to disclose the ambiguity. Neither the measured samples nor the frozen analysis windows changed.

The complete published rows are saved in `source/ptbxl-plus-03155-automated-features.json`; compact measurements and their provenance appear in `externalAutomaticDelineation` in the target JSON. Attribution: Strodthoff et al., PTB-XL+ version 1.0.1 (2023), [doi:10.13026/g6h6-7g88](https://doi.org/10.13026/g6h6-7g88), and the [Scientific Data publication](https://www.nature.com/articles/s41597-023-02153-8). The source license is CC BY 4.0.

The anterior recording has a shortest RR of 818 ms. With a P onset around −220 ms, the next P wave can begin around +598 ms in the wide display window. The fitting window ends at +520 ms, so it does not score that neighboring P as part of the indexed beat. The JSON explicitly records this possibility.

## Lead definitions and fitting interpretation

I, II, and V1–V6 provide the eight independent channels. For a forward prediction:

```text
III = II − I
aVR = −(I + II) / 2
aVL = I − II / 2
aVF = II − I / 2
Vn = chest electrode n − (RA + LA + LL) / 3
```

The right-leg electrode is not the reference voltage of a recorded ECG lead. Source limb and chest lead definitions remain those of the recording system.

The measured 12-lead median retains all measured channels. Because a pointwise median is nonlinear, its derived limb leads need not satisfy the equations exactly even if each original beat does. The small algebra residual is reported instead of silently replacing measured channels with synthetic ones. Model scoring should avoid double-counting the four dependent limb leads.

For RBBB, human mapping provides a reasonable prior of relatively preserved left-sided activation followed by late right-ventricular activation, often latest at the basal RV. It does not establish this patient's map. [Ramanathan et al., 2004](https://www.nature.com/articles/nm1011) reconstructed one RBBB example using 224 surface electrodes and subject-specific CT, substantially more information than an ordinary 12-lead ECG. [Kawasuji and Iwa, 1978](https://pubmed.ncbi.nlm.nih.gov/731842/) showed that different causes of an RBBB pattern can produce different activation sequences.

For STEMI, spatial differences in resting membrane potential and action-potential plateau/excursion can both contribute to the observed ST-versus-baseline difference. See the original multiscale study [Ionic mechanisms of ST segment elevation during acute myocardial infarction](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/). A baseline-referenced surface trace cannot uniquely separate a diastolic baseline shift from a systolic plateau change. Any chosen allocation between them is a stated model prior, not a fitted biological measurement.

## Reproduce and inspect

From the repository root:

```bash
python scripts/prepare_pathology_targets.py
```

Use `--download` only if the cached original PTB-XL 500 Hz files are absent. The script needs NumPy and SciPy; Matplotlib produces the review figures. `--no-plots` regenerates only the numerical artifacts.

Outputs:

- `targets-v1.json`: common-grid and native-grid medians, IQR, training/held-out targets, beat membership, timing hints, quality metrics, source references and caveats.
- `<target>-beats.npz`: complete original and baseline-referenced native beat arrays, full original recording, source sample anchors, acceptance and split indices.
- `source/<target>-500hz.json`: original calibrated waveform, untouched by median preparation.
- `source/03155_hr.hea` and `.dat`: original WFDB RBBB pair.
- `source/ptbxl-plus-03155-automated-features.json`: optional external automatic interval cross-check for the same RBBB record, with complete published feature rows and attribution.
- `review/<target>.png`: all accepted native beats, median, between-beat spread, PR reference, and excluded complete beat.

Numerical checks verify finite values, dimensions, no train/held-out overlap, 1 ms interpolation consistency with every native 2 ms sample, ordered IQR bounds, and source integrity. The review figures were inspected for preserved P/QRS/ST-T morphology and the anterior V3 exclusion.

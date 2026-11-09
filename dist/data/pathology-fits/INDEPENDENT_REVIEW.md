# Independent review of the recorded-ECG fitting experiment

This review is separate from the fitter's optimization code. It evaluates whether the stated conclusions follow from the measured targets, the model family, and the errors. It covers the frozen final direct-source exports for both RBBB 03155 and anterior STEMI 00004, including the prior-informed STEMI teaching default, the retained numerical minimum, and the additional ST/T-focused regional-recovery experiment. Earlier native-anatomy results remain below as a comparison. The additional waveform/recovery pass was independently reviewed on 29 October 2026.

**Assessment:** the implementation provides a reproducible, physically coupled explanatory fit, with authentic source recordings and inspectable residuals. It captures useful parts of the RBBB and anterior injury patterns. The default traces remain partial matches, particularly the STEMI QRS and terminal T morphology. A new optional regional-prolongation experiment reproduces the previously missing negative terminal T components and improves ST/T error, but worsens QRS and whole-window error and reaches a broad, uncalibrated recovery bound. It is an informative tradeoff rather than a replacement default. The results support an educational model comparison; they do not establish patient-specific electrical maps or independently validated regional action-potential properties.

## Final exported results

The final study compares 10 published candidates for RBBB and 15 for STEMI, including their unblocked-conduction comparisons. The recorded optimization histories contain 3,214 and 9,245 forward evaluations respectively. They test branch blocking, regional recovery, alternative injury extent, bounded rigid heart pose, faster endocardial conduction, broader assumed LV delivery support, an additional alternation of pose and source fitting, a more conservative STEMI recovery prior, two additional waveform-shape families, and ST/T-focused recovery/activation alternatives. The earlier publication had 13 STEMI candidates and 7,517 evaluations. Faster endocardial variants did not win.

For RBBB, `alternating-pose-source` is both the teaching default and the minimum training-error candidate. For STEMI, `alternating-pose-source` remains the **best numerical match**, while `recovery-prior-shortened` is the **teaching default**. The latter retains the best numerical candidate's pose and activation topology but uses tighter recovery priors to avoid presenting an extreme, unmeasured RV recovery field as the main example. This is an explicit modeling judgment, not evidence that the default recovers the patient's true physiology. The case file identifies the two choices separately with `selectedApproachId` and `bestNumericalApproachId`.

All errors below are in mV, use the same eight independent leads, and have been independently recomputed from the **published final arrays**. The measured-repeatability column compares training and held-out measured medians over the identical scoring windows. It is not a clinical tolerance or a noise-only uncertainty estimate.

| Target and phase | Training model RMS | Held-out model RMS | Measured split-median RMS |
|---|---:|---:|---:|
| RBBB, complete analysis window | 0.0841 | 0.0860 | 0.0233 |
| RBBB, P | 0.0297 | 0.0293 | 0.0099 |
| RBBB, QRS | 0.1786 | 0.1786 | 0.0264 |
| RBBB, ST/T | 0.0405 | 0.0464 | 0.0253 |
| RBBB, ST | 0.0351 | 0.0382 | 0.0175 |
| Anterior STEMI teaching default, complete analysis window | 0.1804 | 0.1764 | 0.0302 |
| Anterior STEMI teaching default, P | 0.0247 | 0.0292 | 0.0213 |
| Anterior STEMI teaching default, QRS | 0.4067 | 0.3950 | 0.0419 |
| Anterior STEMI teaching default, ST/T | 0.1186 | 0.1174 | 0.0307 |
| Anterior STEMI teaching default, ST | 0.0971 | 0.1105 | 0.0271 |

The whole-window held-out RMS falls from 0.1554 to 0.0860 mV for RBBB and from 0.2382 to 0.1764 mV for the STEMI teaching default relative to the corresponding unblocked-conduction comparison. Those are approximately 44.7% and 25.9% reductions in this error metric, **not percentages of physiological or diagnostic accuracy**. The retained STEMI numerical minimum has a held-out RMS of 0.1746 mV, a 26.7% reduction from its comparison. Training and held-out results are similar; the substantial remaining errors are predominantly model-family/anatomy mismatch rather than evidence that the fit merely memorized random beat noise.

### Additional STEMI waveform and recovery experiments

Two source-waveform families were tested upstream of the torso calculation. A rational, monotonic age warp changes the middle plateau while preserving the rapid upstroke and APD90. A second family permits a stronger, smooth early plateau depression, also preserving the upstroke and APD90, with a monotonic tail that returns to rest at the original endpoint. The mathematical construction, primary evidence, and limits are documented in [PHYSIOLOGY_REFINEMENT.md](PHYSIOLOGY_REFINEMENT.md). Neither family inserts a fitted ST or T component directly into the ECG.

The retained rational-shape candidate, `plateau-regional`, provides only a small phase tradeoff. Its held-out errors are 0.179317 mV for the whole window, 0.406072 mV for QRS, 0.115076 mV for ST/T, and 0.107593 mV for ST. It still does not reproduce the negative terminal T waves and does not justify replacing the default. Its injury gamma parameter reaches 0.45, although the smooth injury mask means actual source gamma values range from approximately 0.520 to 1.

The second search discovers a more substantial **regional-prolongation** hypothesis, published as `early-plateau-coupled` with the visible label **“ST/T-focused regional prolongation · QRS tradeoff.”** Crucially, the fitted early-plateau fraction returns to **1 at every source site**, so the retained candidate does not use early plateau suppression. The result is not evidence that an epicardial dome-loss mechanism was recovered. Its improvement comes from changes in regional recovery, voltage excursion, and activation parameters under a stronger ST/T objective.

The objective multiplies normalized QRS, ST, and late-recovery residuals by 1.2, 4, and 3, respectively. Their squared-loss multipliers are 1.44, 16, and 9. Lead normalization uses only the training QRS RMS with a 0.2 mV floor; it does not change published ECG amplitudes. The late-recovery interval, +180 through +480 ms, is now computed for **every** candidate and the measured split-median comparison. All original scoring windows are unchanged.

| Phase | Default, training RMS | ST/T alternative, training RMS | Default, held-out RMS | ST/T alternative, held-out RMS | Measured split-median RMS |
|---|---:|---:|---:|---:|---:|
| Complete analysis window | 0.180449 | 0.192817 | 0.176447 | 0.187163 | 0.030249 |
| QRS | 0.406695 | 0.473773 | 0.394993 | 0.461056 | 0.041858 |
| ST/T | 0.118577 | 0.081948 | 0.117385 | 0.076153 | 0.030653 |
| ST | 0.097050 | 0.061377 | 0.110505 | 0.061643 | 0.027072 |
| Late recovery, +180..480 ms | 0.126527 | 0.085379 | 0.123159 | 0.078255 | 0.032810 |

Thus the alternative reduces held-out ST error by **44.2%**, ST/T error by **35.1%**, and late-recovery error by **36.5%**. It increases whole-window error by **6.1%** and QRS error by **16.7%**. These percentages describe error changes under explicit windows, not physiological accuracy. The unchanged conservative default and original whole-window numerical minimum remain available.

The improvement is visibly meaningful in the missing negative T components. The table uses the same +270..440 ms review interval as the earlier morphology check, measured on the frozen published arrays. It is a descriptive waveform comparison, not a new expert T-wave annotation.

| Lead | Default T minimum | ST/T alternative T minimum / time | Recorded T minimum / time |
|---|---:|---:|---:|
| V1 | +0.010 mV | −0.199 mV / 329 ms | −0.126 mV / 324 ms |
| V2 | +0.010 mV | −0.237 mV / 329 ms | −0.265 mV / 328 ms |
| V3 | +0.009 mV | −0.204 mV / 329 ms | −0.349 mV / 328 ms |
| V4 | +0.008 mV | −0.142 mV / 332 ms | −0.225 mV / 330 ms |

At J+60 ms, the alternative produces V1–V4 levels of +0.211/+0.299/+0.310/+0.276 mV, compared with recorded +0.186/+0.364/+0.335/+0.217 mV. V2/V3 ST amplitudes improve, while V4 is too elevated. Its V2 terminal T amplitude and timing are fairly close, but V1 is too negative and V3/V4 remain insufficiently negative. QRS morphology is still a substantial mismatch. Matching these particular ST/T features does not constitute a high-fidelity reconstruction of the entire recording.

#### Actual source durations, bounds, and interpretation

The new alternative reaches the signed injury-duration coefficient of −140 ms under the shortening-positive convention, corresponding to a possible **140 ms prolongation before multiplication by the smooth injury weight**. This is a broadened sensitivity bound, not a measured human ischemic response. Other limits reached include an apicobasal coefficient of +60 ms, LV cosine coefficient of +35 ms, RV offset of −35 ms, and approximately zero additional injury activation delay. The inherited pose remains at the previous y-rotation and z-translation limits. These boundary hits show pressure against the chosen low-dimensional model family.

Independent recomputation from the full native source parameters confirms:

| Modeled source region | APD90 minimum | Median | Maximum |
|---|---:|---:|---:|
| Entire LV | 240.3 ms | 317.0 ms | 432.4 ms |
| LV injury core, smooth weight >0.5 | 296.5 ms | 390.0 ms | 432.4 ms |
| Entire RV | 229.9 ms | 274.1 ms | 310.1 ms |

The injury core's 5th–95th percentile APD90 range is 336.8–422.8 ms. Its boundary is a model-defined mask, not a measured infarct border. No native nodes are clipped at 120 or 480 ms. The dense refinement averages source parameters and cannot create values beyond those native extrema. No residual previous-cycle waveform remains at the next local peak at this record's 859 ms RR. These numerical checks exclude clipping and beat-tail artifacts; they do not validate the inferred duration field biologically.

The primary evidence supports investigating regional shape and recovery changes, but not interpreting this large fitted prolongation as the patient's mechanism. In human intraoperative recordings, [Redwood et al. (1996)](https://pubmed.ncbi.nlm.nih.gov/8962564/) observed modest, time-dependent early APD changes, while [Sutton et al. (2000)](https://pubmed.ncbi.nlm.nih.gov/10995401/) demonstrated that AP duration can shorten while refractoriness lengthens during ischemia. Refractory-period prolongation therefore cannot directly validate an APD-prolongation hypothesis. The optical template, assumed millivolt scale, reference anatomy, torso conductivity, injury mask, and 60:40 resting/peak attribution remain separate modeling assumptions.

#### Independent checks of the additional pass

- `targets-v1.json` is byte-identical to the prior publication (`6ebbe877`), with SHA-256 `e7b28c8e9558e1c5543a597381881c66e336e60c951e53b37c2d7f3b857ad7a9`. The displayed observed, training, and held-out arrays exactly equal those frozen targets. Beat acceptance, memberships, and constant PR references are unchanged.
- All 25 published candidates have 901 finite samples in all 12 leads. Independent recomputation of every published training and held-out independent-lead phase RMS differs by at most 3.28×10⁻⁸ mV. A further 3,640 individual-lead and all-lead RMS comparisons differ by at most 1.28×10⁻⁷ mV, consistent with trace rounding. Limb-lead identities agree within approximately 10⁻⁶ mV.
- Top-level fields, waveforms, parameters, pose, source summary, and metrics exactly match the declared teaching default. The original whole-window training-error minimum still agrees with `bestNumericalApproachId`; the new alternative is not silently substituted for it.
- The ST/T alternative is directly computed from all 2,400,926 source sites at 1 ms intervals. Its finer histogram approximation differs from that direct trace by 0.0000871 mV RMS and 0.000786 mV maximum. These differences are far smaller than its clinical-pattern residuals.
- Independent sweeps of 24 rational-shape and 25 early-plateau waveforms preserved assigned APD90 and normalized voltage bounds and found no newly introduced upward phase. The early family also preserves the original return-to-rest endpoint. A large early negative slope means falling membrane voltage, not necessarily completion of recovery.
- An independent browser-evaluator run checked 504 Python source/render fixtures across the RBBB default, STEMI default, and both new families. Maximum disagreement was 1.42×10⁻¹⁴ mV. Every published candidate's displayed voltage and slope fields remained finite at six sampled times.

The fitting routines and numerical ranking use training waveforms. However, development has repeatedly inspected same-record held-out summaries, and shared quality screening and landmark review already precede the split. The held-out comparison should consequently be described as **within-record repeatability**, not a blinded or external validation result. It does not establish unseen-patient performance or resolve the inverse problem's nonuniqueness.

The new paired-action-potential panel uses the same `voltageAtNode` evaluator as the fitted field, keeps selected anatomical samples fixed between experiments, and explicitly labels A−B as a local membrane-voltage difference rather than a lead voltage. Its approximate AT/APD90 readouts interpolate source timings; they are not thresholds remeasured on the displayed blended waveform. This makes the effect of alternative source hypotheses inspectable without suggesting that two selected cells alone generate the surface ECG.

### STEMI recovery-prior tradeoff

The more conservative default raises whole-window training RMS from 0.178953 to 0.180449 mV, an increase of **0.84%**. That aggregate change conceals a larger ST-specific tradeoff:

| STEMI phase | Numerical minimum, held-out RMS | Teaching default, held-out RMS | Measured split-median RMS |
|---|---:|---:|---:|
| Complete analysis window | 0.174565 | 0.176447 | 0.030249 |
| P | 0.029238 | 0.029238 | 0.021333 |
| QRS | 0.391132 | 0.394993 | 0.041858 |
| ST/T | 0.115808 | 0.117385 | 0.030653 |
| ST | 0.085500 | 0.110505 | 0.027072 |

The held-out ST-only RMS increases by approximately **29%**, so it would be misleading to say that every aspect of the fit changes by less than 1%. The default is appropriate as a more restrained physiological illustration only if the measured overlay, phase errors, numerical alternative, and explicit prior choice remain available. It does not reproduce clinical ST amplitudes accurately.

### RBBB morphology: useful features with remaining errors

The model's terminal V1 R′ is +1.116 mV at +43 ms, compared with +1.183 mV at +48 ms in the measured median. Its V6 terminal S is −0.403 mV at +26 ms, compared with −0.415 mV at +28 ms. These are meaningful successes for the branch-block mechanism.

The lead-I terminal S is too negative and late: −0.530 mV at +64 ms versus −0.417 mV at +44 ms. The early R amplitudes in I/V5/V6 are too small; the initial V1 S is too deep; and V2 still has a spurious late positive component. Some P-wave and late recovery shapes are also mismatched. A successful V1 R′ alone must not be presented as a close match of the entire 12-lead example.

### Anterior STEMI morphology: regional ST trend with substantial residual error

At the approximate J+60 ms location, the default, numerical alternative, and measured median have these local mean values:

| Lead | Teaching default | Numerical minimum | Recorded median |
|---|---:|---:|---:|
| V1 | +0.096 mV | +0.148 mV | +0.186 mV |
| V2 | +0.162 mV | +0.228 mV | +0.364 mV |
| V3 | +0.198 mV | +0.255 mV | +0.335 mV |
| V4 | +0.200 mV | +0.237 mV | +0.217 mV |

Both candidates reproduce the direction of anterior ST elevation and part of its regional pattern. They underestimate V2/V3 elevation and introduce too much elevation in V5. The conservative default underestimates V1–V3 more strongly. These differences exceed the small PR-window-shift sensitivity and should remain visible in the overlay and residual.

Other morphology mismatches are substantial and remain visible in both candidates. For the numerical minimum, the V2 QRS minimum is −1.10 mV versus −1.985 mV recorded, and the V5 R maximum is +0.975 mV versus +1.947 mV. The default does not resolve these early QRS errors. Neither candidate reproduces the measured terminal negative T components in V2–V4. Over +270 to +440 ms, the numerical minimum remains about +0.009 mV at its minimum while the measured minima are approximately −0.265, −0.349 and −0.225 mV. Consequently, the complete STEMI trace cannot be described as reconstructed at high fidelity, even though its source mechanism and positive ST trend are instructive.

### Parameter limits and inverse uncertainty

The final RBBB pose reaches the x-translation bound at −18 mm. Both final STEMI candidates reach the y-rotation bound at +25° and z-translation bound at +18 mm. The STEMI numerical minimum's RV APD offset approaches the −100 ms bound, with modeled RV APD90 values around **139–190 ms**, even though the injury mask is in the LV. This unmeasured, extreme RV recovery field prompted the more conservative teaching default.

The default constrains the RV offset to −35..+40 ms, the global APD parameter to 240..380 ms, the transmural gradient to 0..80 ms, the apicobasal gradient to −50..+60 ms, and each LV angular gradient to ±35 ms. Its actual RV APD90 values range from **195.7 to 260.5 ms**, with median **230.7 ms**; the 5th and 95th percentiles are 207.0 and 253.1 ms. Its RV offset still approaches the new lower bound at −35 ms. These are declared modeling priors, not validated normal limits or measurements from this patient.

Human studies support caution about inventing a very large RV–LV recovery difference: [Ramanathan et al. (2006)](https://pubmed.ncbi.nlm.nih.gov/16606830/) reported a mean activation–recovery interval of 235 ms in seven healthy adults and an average LV–RV difference of 32 ms, while [Orini et al. (2013)](https://pubmed.ncbi.nlm.nih.gov/23284948/) found a smaller difference in a different preparation. Activation–recovery intervals are proxies for local APD, and neither study establishes this STEMI patient's values. [Stoks et al. (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11226755/) further show marked variation in activation and recovery maps across people despite similar surface ECGs. These findings motivate conservative priors and uncertainty disclosure; they do not uniquely choose a source map.

The default and numerical minimum still drive smooth injury width and mask-depth parameters to bounds. In particular, `lesionDepth = 1.35` is a dimensionless parameter of a sigmoid mask, **not a literal 135% transmural depth**. The final default's signed injury APD-change parameter is approximately −2.6 ms, corresponding to slight prolongation under the model's convention, whereas the numerical minimum uses approximately 89 ms of shortening. The suffix in `recovery-prior-shortened` describes the optimizer's starting point, not a recovered biological conclusion. Two opposing initializations converged almost identically under the conservative bounds. This illustrates how strongly the inferred recovery properties depend on the prior, despite similar whole-trace errors.

Neither selected source field contains nodes clipped at the implemented 120 or 480 ms APD limits. That absence of clipping does not establish biological validity. The pre-conservative STEMI candidate comparison within 25% of the best training RMS already showed source-site APD differences as large as about 162 ms. Candidate spread is a finite sensitivity experiment, not a posterior confidence interval, and omits alternative anatomies and many untested physiologies. All pose, injury, and recovery choices remain hypotheses rather than measurements of coronary injury thickness, an unaffected RV, or the patient's heart orientation.

The external automated RBBB timing check also matters: 12SL/Uni-G report QT intervals of 476/486 ms while ECGDeli reports 626 ms. The late recovery display endpoint is not a validated QT boundary. See `TARGET_METHODS.md` for the full provenance and interpretation.

### Independent numerical checks

For both final files in `cases/`, this review checked that:

- `provisional` is false and direct all-source Vm products are marked complete.
- Each published ECG has 901 finite values in each of 12 leads.
- The observed arrays are exactly the frozen measured target medians.
- Every reported held-out phase RMS agrees with an independent recomputation from the published arrays to within 1e−6 mV.
- The predicted limb-lead equations hold to approximately 1e−6 mV (0.001 µV), consistent with output rounding.
- Top-level ECG, field, pose, parameters, metrics, and source summary agree with the declared teaching default. The numerical minimum is retained as a separate complete candidate.
- `bestNumericalApproachId` identifies the minimum training RMS among the published pathology candidates. `selectedApproachId` may instead identify the explicitly prior-informed teaching default. Held-out error does not fit or select source parameters.

The selected trace is computed from 2,400,926 source sites. The earlier source-histogram approximation differs from the direct result by 0.0000765 mV RMS for RBBB and 0.0000853 mV RMS for the STEMI teaching default. The maximum differences are 0.000937 and 0.000642 mV respectively. The retained STEMI numerical minimum has an RMS difference of 0.0000948 mV and maximum difference of 0.000832 mV. These discrepancies are far smaller than the remaining morphology errors. The RBBB native-to-dense source RMS difference is approximately 0.00105 mV. Source-field output rounding also has a sub-0.001 mV effect on the displayed membrane voltages in the supplied verification.

This separates **numerical consistency** from **physiological correctness**: the selected 3D field and ECG computation are tightly coupled, while the chosen generic anatomy and simplified electrophysiology remain incomplete explanations of the real recordings.

## What the experiment can support

The experiment changes upstream activation times, regional action-potential duration, local voltage excursion, and a small number of anatomical or source-scale parameters, then computes ECGs through a common lead-field operator. It does not insert observed ECG fragments into the output. This is a meaningful test of a candidate mechanism's capacity to explain a simultaneous multilead recording.

Its strongest supported conclusion is **“this candidate propagation and recovery model produces a trace with these measured residuals.”** A better fit does not establish the patient's actual activation map, ion concentrations, injury depth, coronary territory, torso conductivity, or anatomy. The target has eight independent channels and the simulated cardiac source has hundreds of thousands of degrees of freedom before strong priors reduce it.

RBBB priors can reasonably remove direct right-bundle delivery and retain left-sided delivery with delayed right-ventricular activation. Human direct mapping and ECGI support this family, while also showing variation among causes of RBBB. STEMI priors can reasonably introduce spatial differences in resting potential, AP excursion, and recovery. The surface trace does not uniquely identify which biological combination produced them.

## Review requirements communicated to the fitter

1. **Use training data for all model and start selection.** Held-out medians are other beats from the same 10-second record. They test repeatability within the recording, not unseen-patient generalization. Quality screening and manual landmark review are shared preprocessing.
2. **Report phase and individual-lead errors.** A pooled correlation or whole-beat RMS can conceal an incorrect terminal QRS, wrong R/S transition, or wrong ST polarity. Retain actual mV errors alongside correlation.
3. **Compare like time windows.** Measured training-versus-held-out repeatability is a useful reference only when recomputed over the same windows and lead set used to report model error. The target preparation's wider analysis windows and the first fit's phase-derived windows differed slightly.
4. **Keep calibrated voltages intact.** The target uses only a constant PR reference. Predicted traces may use a common effective source scale but no lead-specific gain. A fitted effective scale is not an independent measurement of conductivity.
5. **Show baseline sensitivity accurately.** Moving the PR window ±10 ms changes median reference values by at most 0.006 mV in the anterior case, but using a short pre-P reference changes some leads by up to 0.051 mV. The smaller number is not total baseline uncertainty.
6. **Report bounds and clipping.** Parameters at limits and nodes with APD clipped to the model range identify pressure against the assumed model family. Such parameters should not receive a biological interpretation as if independently measured.
7. **Name the comparison model accurately.** The “healthy prior” is an unblocked-conduction model whose onset, source gain and recovery family have been adjusted to the target. It is not a recorded healthy control or a wholly unfit independent prediction.
8. **Disclose the resting/plateau allocation.** The stated 60:40 split of injury-related resting-potential elevation and peak reduction is an illustrative prior. PR-referenced data identify their combined effect on voltage excursion much more directly than the split.
9. **Keep source/native/refined numerical checks.** A spatially refined model, a first-order pose approximation, and an exact recomputation can yield different outputs. The final claimed residual must belong to the exact model shipped and visualized.

## First native-anatomy results: useful mechanisms, important residual errors

The first experiment's selected candidates were evaluated against the held-out median:

| Target | Whole-beat RMS | QRS RMS | ST/T RMS | What visual review found |
|---|---:|---:|---:|---|
| RBBB 03155 | 0.122 mV | 0.267 mV | 0.042 mV | Late V1 R′ and broad I/V6 terminal S were present, but V2–V4 gained an erroneous late positive component and early lateral R waves were too small. |
| Anterior STEMI 00004 | 0.222 mV | 0.516 mV | 0.114 mV | The positive anterior ST trend was present, but deep V1–V3 negative QRS components, R/S transition, larger limb/lateral R waves, and terminal negative T components remained poorly represented. |

These first-round errors were considerably larger than the measured split-median repeatability. Baseline-window uncertainty cannot explain the large QRS polarity and amplitude errors. The figures therefore support trying other constrained model families, including a bounded rigid heart pose with a recomputed physical lead field, instead of attributing the mismatch to recording noise.

The initial anterior fit also placed several injury-region parameters near bounds and drove injury-related APD shortening close to zero. It must not be narrated as demonstrating that shortening was recovered from the recording. The candidate with the lowest whole-beat training RMS did not have the lowest ST-only error; that tradeoff should remain visible or a phase-balanced training selection criterion should be declared before later comparisons.

## Morphology checkpoints for later review

These values come from the measured all-beat median; they are useful visual checkpoints, not independently adjudicated clinical criteria.

- RBBB terminal V1 R′ reaches +1.183 mV at +48 ms; the earlier V1 r is +0.359 mV at −12 ms.
- RBBB terminal I S reaches −0.417 mV at +44 ms; V6 S reaches −0.415 mV at +28 ms.
- In the anterior case, reviewed J levels in V1/V2/V3/V4 are +0.133/+0.255/+0.184/+0.133 mV. J+60 ms levels are +0.185/+0.363/+0.335/+0.216 mV.
- V1–V3 QRS negative dominance and the later negative T components in V2–V4 are part of the recorded morphology. Matching only a positive ST offset does not match the entire STEMI example.

## Recovery-family experiment and interpretation

Mandatory APD shortening can be too narrow a hypothesis across stages of ischemia or infarction. Separately labeled candidates allowing a bounded signed regional APD response were therefore tested. The conservative candidates allowed −100..+120 ms under the shortening-positive convention. These tests remained model comparisons and did not infer the patient's ischemic stage or fully reproduce the terminal negative T morphology.

Primary studies relevant to this possibility include [Shaw and Rudy's ionic ischemia model](https://pubmed.ncbi.nlm.nih.gov/9349389/), [Mandel et al.'s experimental recovery/T-wave study](https://pubmed.ncbi.nlm.nih.gov/11712287/), [simulation of ischemia and infarction with altered AP durations](https://pubmed.ncbi.nlm.nih.gov/668062/), [human early balloon-occlusion QT changes](https://pubmed.ncbi.nlm.nih.gov/17394962/), and [whole-rabbit-heart metabolic-inhibition measurements](https://pmc.ncbi.nlm.nih.gov/articles/PMC6095129/). They describe different species, preparations and stages; none identifies this patient's local APD field.

The first native results above are retained as historical comparison results. Later pose, broader delivery and recovery experiments produced the final results documented at the start of this review. The frozen teaching defaults, numerical alternatives, remaining morphology errors, baseline uncertainty, and physiological-prior tradeoff should accompany the completed educational study.

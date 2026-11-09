# Anatomical forward fitting of recorded ECGs

## What was achieved, and what remains uncertain

Two real 500 Hz, twelve-lead ECG recordings were reduced to aligned median beats, then fitted with a generative electrical source model on a generic four-chamber CT heart. The selected displayed waveform is recomputed from the same local membrane-voltage fields that color the native CT model. Measured samples were never inserted into the model waveform, and its P, QRS, ST and T components were not independently warped or scaled.

The result is an exploratory, constrained explanation of the recording. It is **not a patient-specific reconstruction or a validated digital twin**. The actual subject's heart/torso geometry, electrode positions, invasive activation map, Purkinje system and membrane recordings are unavailable. Substantial morphology residuals remain, especially in the anterior STEMI QRS. The website exposes those residuals, alternative models and held-out-beat errors instead of presenting the inferred map as ground truth.

The main requested examples are complete RBBB (PTB-XL 03155) and anterior STEMI (ACS 00004, source label associated with a proximal LAD culprit). A third inferior STEMI ensemble (ACS 18206) was prepared and quality checked, but no matching inverse source fit is claimed for it. The two requested fits received the computational effort.

## Recorded targets and validation split

The original 500 Hz recordings, calibration, SHA-256 checks, source labels, licenses and beat exclusions are documented in [TARGET_METHODS.md](TARGET_METHODS.md) and [targets-v1.json](targets-v1.json). Beats retain their measured voltage scale. Alignment uses one QRS anchor per complete beat; there is no separate P/QRS/T time warp. Each lead receives only a constant reference from a reviewed pre-QRS PR segment; no ST-removing high-pass filter or amplitude normalization is applied. Median and interquartile envelopes are computed after this alignment. A 1 ms display grid interpolates the 2 ms recorded samples and does not increase measured resolution.

Accepted beats are alternated into training and held-out partitions. Optimization and candidate selection use the training median only. Held-out beats are from the same short recording: this tests within-record reproducibility, not independent clinical validation. The observed training-versus-held-out difference is reported on exactly the same scoring windows as model error. Beat IQR is descriptive variability, not a confidence interval for a recovered activation map.

| Recording | Accepted beats | Training / held out | Analysis window, ms from QRS anchor | PR reference window, ms | RR, ms |
|---|---:|---:|---|---|---:|
| ptbxl-03155 | 9 | 5 / 4 | [-240, 620] | [-80, -60] | 1042 |
| acs-00004 | 10 | 5 / 5 | [-230, 520] | [-95, -65] | 859 |

The same RBBB recording has external automated PTB-XL+ measurements: QRS 138/142/159 ms and RR 1038/1039/1042 ms across three systems. PR 180/182/287 ms and QT 476/486/626 ms disagree substantially. Those measurements corroborate a wide QRS and approximate rate, but do not resolve the late T/U endpoint or establish a QT diagnosis. The reviewed central fiducials and fitting windows were kept fixed; their uncertainty is explicit. Source: [PTB-XL+1.0.1](https://physionet.org/content/ptb-xl-plus/1.0.1/).

## Forward model

The immutable imported Module 1 source release supplies a Rodero population-average CT heart with 340,582 electrically distinct nodes and 1,562,432 myocardial tetrahedra. Atrial and ventricular interface nodes are electrically separated. One left-atrial appendage portion is an explicitly reconstructed anatomical extension. The mesh is generic, not an image of either ECG subject. Geometry source: [Rodero et al., PLOS Computational Biology2021](https://doi.org/10.1371/journal.pcbi.1008851), [Zenodo anatomy release](https://zenodo.org/records/4593739).

Activation follows anisotropic shortest-path travel through myocardium with a fast endocardial layer and assumed delivery locations. This is a reduced eikonal-like graph model, not a coupled monodomain/bidomain ionic propagation simulation or an explicit recovered Purkinje tree. Related rapid anisotropic/lead-field methods are described in [Pezzuto et al.](https://pubmed.ncbi.nlm.nih.gov/28512434/). Atrial onset, travel speed and effective source gain are adjusted separately, retaining the sinus-region/left-atrial entry assumptions of the imported model.

For each source site i, the prescribed local voltage is

    Vm_i(t) = rest_i + amplitude_i × Σ q(t − activation_i − k × RR, APD_i)

where k=−1,0,+1 includes neighboring-cycle tails. Ventricular q uses the imported equal-donor pooled human optical recovery template; the rapid intrinsic upstroke and −85/+25 mV scale are explicit assumptions. Optical fluorescence is not a patient membrane-voltage measurement. The atrial template is a human atrial ionic-model AP. The first 4 ms of cell age are unwarped; later template age is 4+(age −4)×(templateAPD90−4)/(localAPD90−4). Recovery therefore follows local activation plus local AP duration, rather than a globally reversed animation. Template source: [human ventricular optical recordings](https://zenodo.org/records/3986725).

The finite homogeneous ellipsoidal torso has 50,932 nodes and 327,148 tetrahedra, insulating outer boundary and conductivity 0.20 S/m. Nine fixed virtual electrodes produce the twelve standard lead differences. Reciprocal FEM lead fields evaluate

    V_lead(t) = −∫ grad(Z_lead) · sigma_i · grad(Vm(t)) dV.

Every signed source weight is retained. A spatially uniform membrane voltage cancels. Adding all myocardial edge midpoints produces 2,400,926 source-voltage sites, equivalent to 12,499,456 fixed-parent source sub-tetrahedra. Activation and AP parameters are interpolated to those sites before evaluating the nonlinear AP. This refines source quadrature; it does not refine the activation graph or prove tissue-PDE/torso convergence.

The browser receives the 20,957 source sites needed to interpolate 20,436 native render vertices. It evaluates Vm at those source sites first, then applies the original four-source interpolation weights. It does not average activation/APD first, paste a recorded trace onto an unrelated animation or retime the model separately from its ECG.

## Pathology mechanisms

**RBBB.** All direct right-ventricular delivery sites are removed. Activation reaches the RV through the connected ventricular graph from LV delivery sites. Five right-ventricular travel-speed factors 0.45,0.60,0.80,1.00,1.20 were compared. Regional LV delivery delays, a common propagation-speed factor and APD gradients were then fitted. The mechanism follows the blocked-right-branch/retrograde-activation principle demonstrated in [Gillette et al.,2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9539798/), while our graph and torso are simpler than that study's model.

**Anterior STEMI.** A smooth anterior/apical LV region changes local membrane rest, AP excursion, AP duration and activation delay before source integration. Regional AP excursion is reduced by injuryMv×regionWeight; for illustration, 60% of that lost excursion is assigned to resting depolarization and 40% to peak/plateau depression. After subtracting a constant PR reference, these two contributions are not independently identified by the surface ECG. This fixed 60:40 split is a prior, not a fitted ion concentration or measured patient voltage. The mechanism is motivated by [ionic/bidomain investigations of ST elevation](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/), which demonstrate the importance of resting, plateau and reference-potential gradients.

The initial regional APD hypothesis allowed shortening. A separately labeled alternative permits a signed APD response: negative injuryShortening means prolongation. This broadens the hypothesis without assuming the clinical ischemia stage. Initial QT/APD prolongation followed by other recovery responses has been observed under specific experimental conditions, including [human balloon occlusion](https://pubmed.ncbi.nlm.nih.gov/17394962/) and [metabolic-inhibition experiments](https://pmc.ncbi.nlm.nih.gov/articles/PMC6095129/). These studies do not identify the APD change in this recording.

The ACS angiographic culprit is a later source association, not simultaneous validation of an electrical injury map. Fitted region size or APD changes must not be called a confirmed infarct boundary or recovered ischemia stage. The lesionDepth input is a dimensionless sigmoid boundary/extent parameter; a value above 1 saturates modeled wall involvement and does not mean more than 100% anatomical transmural depth.

## Search strategy and comparison families

The loss uses eight independent channels—I, II and V1–V6. The other four limb leads are algebraically derived and are not counted again. Optimization weights are 1/max(training QRS RMS, 0.20 mV) per independent lead; this balances fitting influence but never rescales the displayed traces. Whole-wave optimization additionally weights QRS residuals 1.6 and the STEMI ST window 2.0. Only one common ventricular effective source gain and one common atrial gain are allowed; there are no independent lead gains or arbitrary finished-waveform corrections. Weak parameter-shift penalties and explicit bounds regularize timing/gradient choices.

The comparison families were:

1. An unblocked, target-aligned healthy source prior, with target-adjusted onset, common gains and recovery parameters. This is a comparison model, not an independent healthy recording.
2. A pathology mechanism with restricted regional support: blocked RV delivery for RBBB; fixed anterior injury for STEMI.
3. More flexible source timing/recovery or injury extent, with multiple starts and RV-speed alternatives.
4. Rigid heart-pose nuisance fitting. The complete heart and its fiber-conductivity tensors move within the unchanged finite torso and fixed electrodes. Bounds are ±25° per rotation axis and ±18 mm per translation axis. Small-perturbation operators guide the search; the proposed pose receives a freshly assembled exact source operator and source-parameter refit. Separately median-PR-referenced derivative columns are only a search approximation, so exact rebuilding is essential.
5. Faster endocardial-layer alternatives at 2.5 and 3.5 mm/ms before the fitted common speed/RV factors. These were retained as negative comparisons when they worsened the fit.
6. Broader LV delivery support: twelve extra assumed endocardial junction locations at six angular sectors and two apicobasal levels, with 8–50 ms delays. Complete RBBB still has zero direct RV delivery. Better matching does not validate those locations; it increases model flexibility.
7. One final alternating pose/source refinement using local operator derivatives around the current pose, the same bounds, an exact new source operator and a new source fit. This adds no new pose degrees of freedom.
8. A conservative recovery-prior comparison for STEMI. The numerical winner drove the RV offset to approximately −100 ms, producing RV APD90 about 139–190 ms despite the modeled injury being in the LV. The additional prior restricts the RV offset to −35..+40 ms, global APD parameter to 240..380 ms, transmural contrast to 0..80 ms, apicobasal contrast to −50..+60 ms and angular contrasts to ±35 ms. Two injury-APD initializations (shortening and prolongation) test local-search dependence while geometry and activation topology remain fixed.

The conservative recovery prior is a modeling choice, not a universal normal range or this patient's measured APD. [Ramanathan et al.2006](https://pubmed.ncbi.nlm.nih.gov/16606830/) found a modest average LV/RV epicardial activation–recovery interval difference in seven healthy adults; [Orini et al.2013](https://pubmed.ncbi.nlm.nih.gov/23284948/) reported a modest average difference in recovery proxies during rate acceleration. ARI/proxies are not direct cellular APD measurements. A larger [2024 ECGI study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11226755/) found marked between-person activation/recovery variability and similar population-average LV/RV recovery times. Recovery time and APD are distinct quantities; these studies justify caution, not a uniquely established recovery map.

All source parameters and multistarts use training data only. The numerical ranking minimizes unweighted raw-mV error across the eight independent channels over the declared whole-beat window, stored as bestNumericalApproachId. A better aggregate QRS-dominated fit can have a worse ST/T subwindow; separate phase errors remain visible. For STEMI, selectedApproachId deliberately chooses the conservative-prior teaching default after reviewing its small training-error tradeoff. The numerical winner is preserved and clearly labeled. Held-out beats do not determine the fit or the prior. Neither selection establishes a global inverse optimum or patient physiology.

### Independent AP-shape and phase-focused recovery experiments

Two further source-level waveform families were tested because a fixed optical shape ties the early plateau too tightly to recovery duration. Neither family adds an offset or basis function to the finished ECG. The rapid upstroke through 4 ms and the actual local 90% recovery crossing remain fixed.

The first family applies a positive rational template-age warp. With `u=(age−4)/(APD90−4)`, the normalized template age is `u/(gamma+(1−gamma)u)` until APD90 and `1+gamma×(u−1)` afterwards. Gamma 1 is the original shape; smaller gamma depresses the middle plateau and makes the waveform more triangular. Two injury-duration starts, an injury-only shape refinement, and a broader reference/injury shape sensitivity were tested. Their explicit training residual weights are QRS 1.2, ST 3 and late recovery 2. The bounded rational family produced only a small ST/T improvement while worsening aggregate/QRS error. It is retained as a negative comparison.

The second family permits stronger early plateau suppression. A smooth monotone transition from 4 to 30 ms multiplies the portion of normalized Vm above 0.1, leaving the upstroke and APD90 intact. A monotone Hermite template-age tail matches the reduced slope at APD90 and ends at the original return-to-rest time. There is no artificial second upstroke, tail jump or extended rest endpoint. This family models a prescribed dome-suppression-like sensitivity; it does not reproduce a literal notch-and-dome, phase 2 re-entry or ion-channel kinetics. Three initializations, a coupled onset/speed/common-gain/injury-delay refinement, a QRS-balanced comparison and one final existing-delivery-timing refit were explored.

The main new objective multiplies residuals by QRS 1.2, ST 4, late recovery 3 and other times 1, after the existing training-derived lead balancing; these multipliers are squared in least squares. The QRS-balanced comparison uses 2.5,3 and 2. The new late-recovery report window is 180–480 ms and is evaluated for every retained model and target repeatability. These objectives intentionally emphasize ST/T more strongly than the original search; their raw-mV whole/QRS/ST/T tradeoffs are shown, rather than ranking unlike losses as though they were identical.

The strongest phase-focused result converged back to early-plateau fraction 1. Its useful new negative terminal T therefore comes from a distinct regional recovery hypothesis, **not support for early plateau suppression**. The injury-APD extension reaches the broadened 140 ms sensitivity bound. This is a large, uncalibrated modeling choice; it is not a patient measurement or an established acute-ischemia response. Actual local APD distributions and clipping are reported below. The old conservative teaching default and whole-error numerical winner remain preserved.

Experimental evidence motivates testing shape and recovery separately, not fitting a unique ionic mechanism: [Di Diego and Antzelevitch2003](https://pubmed.ncbi.nlm.nih.gov/14716579/) describes ischemic ST/T mechanisms in a canine wedge, and [whole-heart ionic simulations](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/) examine regional effects of ischemic current changes. Human data also constrain the interpretation: [Redwood et al.1996](https://pubmed.ncbi.nlm.nih.gov/8962564/) observed modest initial monophasic-AP prolongation under a specific brief-ischemia protocol; [Sutton et al.2000](https://pubmed.ncbi.nlm.nih.gov/10995401/) found that AP duration shortened while effective refractory period lengthened during global ischemia. Refractoriness and APD cannot be substituted for one another. None of these studies calibrates the fitted 140 ms regional extension in ACS 00004.

Every initialization and optimizer stage remains in the native history. Only two representative new full-field comparisons are exported to the browser; additional outcomes retain parameters, native ECGs and metrics in the compact research package. See the REPRODUCE.md included in the [research source package](propagation-research.zip) for the exact command order and selection-freezing step.


## Results: Complete RBBB · PTB-XL 03155

Selected: **alternating-pose-source**. All values below are raw millivolts and use the declared phase windows.
| Approach | Training whole RMSE | Held-out whole RMSE | Held-out QRS RMSE | Held-out ST/T RMSE |
|---|---:|---:|---:|---:|
| healthy-prior | 0.1516 | 0.1554 | 0.3390 | 0.0656 |
| blocked-rv | 0.1312 | 0.1348 | 0.2977 | 0.0492 |
| distributed-rv-0.60 | 0.1175 | 0.1206 | 0.2668 | 0.0420 |
| distributed-rv-0.80 | 0.1197 | 0.1230 | 0.2723 | 0.0424 |
| posed-anatomy | 0.0927 | 0.0954 | 0.2032 | 0.0454 |
| fast-endo-2.5 | 0.1114 | 0.1140 | 0.2509 | 0.0424 |
| fast-endo-3.5 | 0.1203 | 0.1227 | 0.2725 | 0.0412 |
| distributed-support-1 | 0.0904 | 0.0926 | 0.1963 | 0.0452 |
| distributed-support-2 | 0.0927 | 0.0954 | 0.2032 | 0.0454 |
| alternating-pose-source | 0.0841 | 0.0860 | 0.1786 | 0.0464 |

The observed training-versus-held-out median difference is **0.0233 mV** over the same whole window and **0.0264 mV** in QRS. Model errors substantially above this floor remain structural model mismatch, not an explanation based only on noisy examples.

| Lead | Held-out whole RMSE | Held-out QRS RMSE | Modeled J +60 ms (mV) | Observed J +60 ms (mV) |
|---|---:|---:|---:|---:|
| I | 0.0764 | 0.1686 | +0.010 | -0.031 |
| II | 0.0590 | 0.1114 | +0.008 | -0.024 |
| V1 | 0.1193 | 0.2519 | -0.022 | -0.061 |
| V2 | 0.1422 | 0.2967 | -0.006 | -0.037 |
| V3 | 0.0674 | 0.1326 | +0.007 | -0.030 |
| V4 | 0.0515 | 0.0988 | +0.014 | -0.020 |
| V5 | 0.0595 | 0.1216 | +0.015 | -0.010 |
| V6 | 0.0685 | 0.1440 | +0.013 | -0.039 |

### Terminal QRS features

| RBBB feature | Modeled amplitude / time | Observed amplitude / time |
|---|---|---|
| Terminal V1 R′ | +1.116 mV / 43 ms | +1.183 mV / 48 ms |
| Early V1 r | +0.477 mV / -15 ms | +0.359 mV / -12 ms |
| Terminal lead I S | -0.530 mV / 64 ms | -0.417 mV / 44 ms |
| Terminal V6 S | -0.403 mV / 26 ms | -0.415 mV / 28 ms |

Fitted effective ventricular source gain: 0.408; common propagation factor: 1.386. Median RV activation occurs 42.1 ms after median LV activation. The APD clipping fractions at 120/480 ms are 0.00000/0.00000. These are model inputs/outputs, not independent patient measurements.
The displayed RV APD90 range is 333.2–455.8 ms. This checks the actual field, not only the additive RV offset parameter; spatial gradients can otherwise compensate for an apparently tighter offset.
The modeled rigid pose uses xyz Euler angles [-12.87, -24.04, -2.54] degrees and translation [-18.0, -4.51, 13.51]mm around the specified native center. Bound hits: `[{"parameter": "translationMm.x", "value": -18.0, "bounds": [-18, 18]}]`. Camera rotation is separate from this modeled pose.

The selected published waveform uses direct all-site Vm products at 1 ms spacing. Its search histogram differs from that direct result by **0.000076 mV RMS** across independent leads (maximum absolute difference 0.000937 mV). The browser field's five-decimal serialization produced at most 0.000488 mV Vm discrepancy on the exported verification samples. Source and render fixtures are included for the independent JavaScript evaluator check.

Download [matched case data](cases/ptbxl-03155.json). The file includes every retained approach's own source field and waveform, original/median/held-out traces, IQR, residuals, phase and per-lead errors, ST/terminal-QRS features, numerical checks, parameter bounds and finite-candidate sensitivity summaries.

## Results: Anterior STEMI pattern · ACS 00004

Selected: **recovery-prior-shortened**. All values below are raw millivolts and use the declared phase windows.

This is the **prior-informed teaching default**. The best numerical match is **alternating-pose-source**. On the declared analysis window, training RMSE changes from 0.178953 to 0.180449 mV (0.84% increase). The full top-level field, waveform, parameters, metrics and source summary refer to the teaching default. The alternative numerical winner retains its own directly verified field and waveform.

**The small aggregate penalty hides a larger local ST tradeoff.** V2 at J +60 ms is 0.162 mV in the teaching default, 0.364 mV recorded and 0.228 mV in the numerical winner. Held-out ST-window RMSE is 0.110505 mV versus 0.085500 mV. Neither model fully reproduces this STEMI; the prior improves interpretability, not every signal feature.

### A useful ST/T improvement with a clear QRS tradeoff

The new phase-focused regional-prolongation comparison is directly recomputed from its own source field. The early-plateau fraction returned to 1; this is a different recovery hypothesis, not a successful estimate of early dome suppression. It remains an optional comparison.
| Model | Training whole | Held-out whole | Held-out QRS | Held-out ST | Held-out ST/T | Held-out late recovery |
|---|---:|---:|---:|---:|---:|---:|
| Teaching default · modest RV recovery prior | 0.180449 | 0.176447 | 0.394993 | 0.110505 | 0.117385 | 0.123159 |
| ST/T-focused regional prolongation · QRS tradeoff | 0.192817 | 0.187163 | 0.461056 | 0.061643 | 0.076153 | 0.078255 |

Relative to the unchanged teaching default, held-out ST RMSE falls 44.2% and ST/T RMSE falls 35.1%. Whole-beat error rises 6.1% and QRS error rises 16.7%. Those losses prevent an unqualified claim of a better overall reconstruction.
The phase-focused V2 J +60 ms estimate is 0.299 mV against 0.364 mV recorded. Its terminal negative T is substantially closer in timing and polarity, while important amplitude differences remain across other leads.

| Lead | Original default late-window minimum | New phase-focused minimum | Recorded minimum |
|---|---:|---:|---:|
| V1 | +0.007 mV at 480 ms | -0.199 mV at 329 ms | -0.126 mV at 324 ms |
| V2 | +0.006 mV at 480 ms | -0.237 mV at 329 ms | -0.265 mV at 328 ms |
| V3 | +0.006 mV at 480 ms | -0.204 mV at 329 ms | -0.349 mV at 328 ms |
| V4 | +0.005 mV at 480 ms | -0.142 mV at 332 ms | -0.225 mV at 330 ms |

These are descriptive minima in 250–480 ms, not expert T-peak annotations or a fitting target added after seeing the held-out data. In the new hypothesis, actual native LV APD90 spans 240.3–432.4 ms and RV APD90 spans 229.9–310.1 ms; clipping fractions at 120/480 ms are 0.00000/0.00000.
The modeled injury core (smooth lesion weight>0.5) has median APD90 390.0 ms, range 296.5–432.4 ms. This long regional recovery is an explicit, nonunique sensitivity hypothesis. It is not an identified infarct border or measured patient APD.
The phase comparison's all-site search-histogram versus direct-product disagreement is 0.000087 mV RMS (maximum 0.000786 mV). Its source/render evaluator fixtures are checked independently in JavaScript.
| Approach | Training whole RMSE | Held-out whole RMSE | Held-out QRS RMSE | Held-out ST/T RMSE |
|---|---:|---:|---:|---:|
| healthy-prior | 0.2413 | 0.2382 | 0.5717 | 0.1197 |
| fixed-injury | 0.2380 | 0.2334 | 0.5680 | 0.1069 |
| variable-injury-1 | 0.2218 | 0.2182 | 0.5213 | 0.1122 |
| variable-injury-2 | 0.2203 | 0.2171 | 0.5167 | 0.1139 |
| variable-injury-3 | 0.2223 | 0.2188 | 0.5174 | 0.1188 |
| posed-anatomy | 0.1870 | 0.1828 | 0.4162 | 0.1156 |
| fast-endo-2.5 | 0.2155 | 0.2116 | 0.4958 | 0.1203 |
| fast-endo-3.5 | 0.2197 | 0.2158 | 0.5068 | 0.1214 |
| distributed-support-1 | 0.1839 | 0.1794 | 0.4065 | 0.1152 |
| distributed-support-2 | 0.1858 | 0.1813 | 0.4121 | 0.1151 |
| alternating-pose-source | 0.1790 | 0.1746 | 0.3911 | 0.1158 |
| recovery-prior-prolonged | 0.1804 | 0.1764 | 0.3950 | 0.1174 |
| recovery-prior-shortened | 0.1804 | 0.1764 | 0.3950 | 0.1174 |
| plateau-regional | 0.1835 | 0.1793 | 0.4061 | 0.1151 |
| early-plateau-coupled | 0.1928 | 0.1872 | 0.4611 | 0.0762 |

The observed training-versus-held-out median difference is **0.0302 mV** over the same whole window and **0.0419 mV** in QRS. Model errors substantially above this floor remain structural model mismatch, not an explanation based only on noisy examples.

| Lead | Held-out whole RMSE | Held-out QRS RMSE | Modeled J +60 ms (mV) | Observed J +60 ms (mV) |
|---|---:|---:|---:|---:|
| I | 0.0879 | 0.1955 | +0.027 | -0.014 |
| II | 0.0963 | 0.1408 | +0.017 | +0.010 |
| V1 | 0.2325 | 0.5576 | +0.096 | +0.186 |
| V2 | 0.2915 | 0.6760 | +0.162 | +0.364 |
| V3 | 0.1378 | 0.1930 | +0.198 | +0.335 |
| V4 | 0.1498 | 0.3394 | +0.200 | +0.217 |
| V5 | 0.1824 | 0.4337 | +0.134 | +0.049 |
| V6 | 0.1353 | 0.2859 | +0.062 | +0.007 |

Fitted effective ventricular source gain: 0.803; common propagation factor: 1.082. Median RV activation occurs 6.5 ms after median LV activation. The APD clipping fractions at 120/480 ms are 0.00000/0.00000. These are model inputs/outputs, not independent patient measurements.
The displayed RV APD90 range is 195.7–260.5 ms. This checks the actual field, not only the additive RV offset parameter; spatial gradients can otherwise compensate for an apparently tighter offset.
The selected AP excursion-loss coefficient is 31.42 mV, regional APD-shortening parameter -2.64 ms (negative would mean prolongation), and regional activation-delay coefficient 30.19 ms. Their inferred values changed across source/pose families; none establishes a uniquely identified cellular injury mechanism.
The modeled rigid pose uses xyz Euler angles [-16.47, 25.0, 7.45] degrees and translation [-13.84, 16.53, 18.0]mm around the specified native center. Bound hits: `[{"parameter": "rotationDeg.y", "value": 25.0, "bounds": [-25, 25]}, {"parameter": "translationMm.z", "value": 18.0, "bounds": [-18, 18]}]`. Camera rotation is separate from this modeled pose.

The selected published waveform uses direct all-site Vm products at 1 ms spacing. Its search histogram differs from that direct result by **0.000085 mV RMS** across independent leads (maximum absolute difference 0.000642 mV). The browser field's five-decimal serialization produced at most 0.000489 mV Vm discrepancy on the exported verification samples. Source and render fixtures are included for the independent JavaScript evaluator check.

Download [matched case data](cases/acs-00004.json). The file includes every retained approach's own source field and waveform, original/median/held-out traces, IQR, residuals, phase and per-lead errors, ST/terminal-QRS features, numerical checks, parameter bounds and finite-candidate sensitivity summaries.

## Numerical verification and limits

The zero-pose operator independently rebuilt by the pose code agrees with the imported native operator to a maximum source-weight difference 6.10 × 10⁻²⁰ (relative RMS 9.25 × 10⁻¹⁶). Uniform-Vm cancellation is checked for every native/dense posed operator. All twelve predicted leads satisfy their algebraic relations by construction. The selected trace is directly recomputed from every dense source site, not merely accepted because the search approximation looked good.

The selected display fields and source ECG have one time origin and one AP evaluator. Source/render Vm test fixtures permit a cross-language check at 0.0001 mV tolerance, including every retained new shape family. The retained numerical winner and ST/T-focused comparison have their own direct checks where flagged; other comparisons retain the disclosed all-site AT/APD or AT/APD/shape histogram approximation. Neither dense quadrature nor floating-point agreement validates the physiology or anatomical assumptions.

Parameter-at-bound flags across the entire search history are labeled as historical; selected pose bounds are listed separately. Sensitivity summaries use explored pathology candidates within 25% of the best training RMSE. Their parameter/activation/APD spread is not a confidence interval and understates uncertainty from untested anatomy, conductivities, ion-channel dynamics and electrode placement. More flexible models can fit the same recording with different local fields.

The homogeneous torso omits lung, blood and other conductivity heterogeneity. The model has no patient-specific imaging, invasive activation map, ionic excitation/conduction coupling, scar or electromechanical feedback. Regional injury activation delay is phenomenological. Vessel deformation and the separate illustrative anatomy are not part of this inverse electrical solve. A good visual resemblance cannot establish the patient’s real circuit.

## Reproduce the experiment

From the repository root, with Python, NumPy, SciPy, VTK, Matplotlib and threadpoolctl installed:

```bash
python scripts/prepare_pathology_targets.py
python scripts/fit-pathology-prepare.py --midpoint
python scripts/fit-pathology-pose.py --basis
python scripts/fit-pathology-model.py --case ptbxl-03155
python scripts/fit-pathology-pose.py --case ptbxl-03155
python scripts/fit-pathology-alternatives.py --case ptbxl-03155
python scripts/fit-pathology-distributed.py --case ptbxl-03155
python scripts/fit-pathology-pose-refine.py --case ptbxl-03155
python scripts/fit-pathology-export.py --case ptbxl-03155
```

Repeat the case-specific commands for acs-00004, then run fit-pathology-conservative.py. For the new sensitivity extension run fit-pathology-plateau.py, fit-pathology-early-plateau.py, fit-pathology-activation-pareto.py and fit-pathology-finalize-shapes.py in that order before its final export. The finalizer preserves the earlier teaching default and records the new phase tradeoff. Finish with fit-pathology-report.py and fit-pathology-verify-browser.mjs. The exact command sequence is in the research package's REPRODUCE.md; target download/preparation requirements are in TARGET_METHODS.md. The anatomy preparation script downloads the checksum-pinned public 58 MB archive and verifies eleven canonical arrays. The immutable Module 1 source ZIP is extracted only into an isolated work directory. Rebuildable mesh/operator caches are ignored by Git; provenance, scripts, target records, parameter histories, comparison outputs and final browser artifacts are retained. No imported Module 1 files were changed.

The full native search history is saved in data-source/pathology-fitting/fit-RECORD-native.json; numerical summaries are in verification-RECORD.json. The published case JSON files are the complete reviewable deliverable. This report is generated from those final files, not manually transcribed from progress logs.


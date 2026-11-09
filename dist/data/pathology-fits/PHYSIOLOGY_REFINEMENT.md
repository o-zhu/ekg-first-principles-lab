# Physiological basis for the second fitting pass

## Why action-potential shape is an appropriate next experiment

The first anterior-STEMI fit used one ventricular recovery template, with regional changes in activation time, voltage excursion, resting voltage, and action-potential duration (APD). It reproduced an anterior elevation pattern but underestimated important ST amplitudes and missed terminal negative T components. The least-restricted fit also shortened modeled right-ventricular recovery substantially. This does not establish that the patient's RV actually had such short action potentials; it may indicate that the restricted waveform family was compensating for missing regional shape differences.

The next experiment therefore changes a regional **membrane-voltage waveform before the torso forward calculation**. It does not add an ST or T component directly to the finished ECG. Plateau morphology and the final recovery endpoint are allowed to vary separately within declared bounds. A second, ST/T-prioritized fitting objective tests whether whole-window error has hidden a different, clinically important ST/T tradeoff. Automated parameter fitting and numerical ranking use training beats. Development has repeatedly inspected the same-record held-out summaries, so their errors describe within-record repeatability rather than blinded or external validation.

This is a phenomenological model comparison. None of the studies below calibrates the new shape parameter for this patient or makes the inferred map unique.

## Primary evidence and its limits

### Di Diego and Antzelevitch, 2003: simultaneous cellular and ECG observations

[Cellular basis for ST-segment changes observed during ischemia](https://pubmed.ncbi.nlm.nih.gov/14716579/) — *Journal of Electrocardiology* 36 Suppl:1–5; [doi:10.1016/j.jelectrocard.2003.09.001](https://doi.org/10.1016/j.jelectrocard.2003.09.001).

This isolated canine right-ventricular wedge study recorded epicardial/endocardial action potentials, intramural electrograms, and a pseudo-ECG during interruption of coronary flow. It identified two distinct patterns: epicardial action-potential dome loss with ST elevation, and substantially delayed transmural conduction in which the apparent elevated ST was partly a prolonged R wave. Later reversal of the recovery gradient accompanied T-wave inversion. These observations support treating plateau morphology, activation delay, and recovery order as separable mechanisms. They do not establish one obligatory sequence for a human anterior infarction or justify assigning the same ionic changes to every STEMI.

### Okada and colleagues, 2020: multiscale ionic and torso simulation

[Ionic mechanisms of ST segment elevation in electrocardiogram during acute myocardial infarction](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/) — *Journal of Physiological Sciences* 70:36; [doi:10.1186/s12576-020-00760-3](https://doi.org/10.1186/s12576-020-00760-3).

The study linked ionic-cell changes to a three-dimensional heart/torso ECG. Under moderate modeled ischemia, different epicardial and endocardial sensitivities of sodium and ATP-sensitive potassium currents produced a transmural voltage gradient and ST elevation. Under more severe ischemia, gradients at the boundary of injured and noninjured tissue remained sufficient even when action potentials were suppressed across the wall. Its reference-potential analysis also separates diastolic baseline displacement from systolic changes. This supports regional and transmural waveform experiments upstream of the ECG; it does not justify fitting arbitrary independent lead offsets or claiming that a reduced waveform model identifies specific ion-channel conductances.

### Mandel and colleagues, 1968: recovery changes depend on stage and location

[Analysis of T-wave abnormalities associated with myocardial infarction using a theoretic model](https://pubmed.ncbi.nlm.nih.gov/11712287/) — *Circulation* 38:178–188; [doi:10.1161/01.CIR.38.1.178](https://doi.org/10.1161/01.CIR.38.1.178).

After coronary ligation in dogs, this study measured functional refractory periods at epicardial, intramural, and endocardial sites, then used a repolarization model to derive T waves. Refractory periods shortened during acute ischemia but were longer in ischemic than nonischemic sites 24–72 hours later. The modeled ECG consequence depended on the region and lead. This supports testing a signed regional recovery-duration response instead of requiring shortening in every pathological example. Functional refractory period is not identical to APD; the historical experiment does not determine the stage, local durations, or treatment history of the present source recording.

### Redwood and colleagues, 1996: direct human AP responses are time dependent

[Effect of magnesium on the monophasic action potential during early ischemia in the in vivo human heart](https://pubmed.ncbi.nlm.nih.gov/8962564/) — *Journal of the American College of Cardiology* 28:1765–1769; [doi:10.1016/S0735-1097(96)00373-7](https://doi.org/10.1016/S0735-1097(96)00373-7).

This randomized study recorded epicardial monophasic action potentials during two minutes of normothermic global ischemia in 20 coronary-surgery patients. In the placebo group, mean APD90 initially increased from 282 to 294 ms at one minute and returned close to baseline at two minutes. The response differed with magnesium, and plateau configuration varied across patients. This is direct human evidence that timing, treatment, and waveform morphology matter. It supports testing more than obligatory shortening, but the observed modest initial prolongation does not validate the model's much broader 140 ms regional-prolongation bound or identify this source record's ischemic stage.

### Sutton and colleagues, 2000: refractoriness and APD can move in opposite directions

[Repolarisation and refractoriness during early ischaemia in humans](https://pubmed.ncbi.nlm.nih.gov/10995401/) — *Heart* 84:365–369; [doi:10.1136/heart.84.4.365](https://doi.org/10.1136/heart.84.4.365).

In 26 coronary-surgery patients, the investigators recorded epicardial monophasic AP duration and effective refractory period during three minutes of global ischemia. Mean AP duration shortened from 256 to 189 ms while refractory periods increased; their initially close relation deteriorated within a minute. This directly demonstrates why a prolonged refractory period cannot be equated with a prolonged action potential during ischemia. It limits the interpretation of historical refractory-period-based models such as Mandel's and of the present fitted recovery field. The current simulator does not separately model sodium-channel recovery or postrepolarization refractoriness.

### Kappadan and colleagues, 2025/2026: mechanical preparation changes the observed AP response

[Differential response to acute ischemia between isolated contracting hearts and hearts perfused with excitation-contraction uncouplers](https://pmc.ncbi.nlm.nih.gov/articles/PMC7618377/) — online November 2025, *American Journal of Physiology–Heart and Circulatory Physiology* 330:H75–H88; [doi:10.1152/ajpheart.00169.2025](https://doi.org/10.1152/ajpheart.00169.2025).

In isolated rabbit hearts, optical mapping after regional coronary ligation showed action-potential shortening and more triangular morphology. These changes appeared earlier in contracting hearts than in blebbistatin-treated, noncontracting hearts. The study cautions that optical templates measured under motion suppression have preparation-dependent physiology. It supports exploring waveform morphology beyond a single rescaled template, while arguing against treating an optical waveform as a universal in-vivo action potential. It does not provide patient-specific numerical bounds for the shape parameter used here.

## Proposed monotonic shape family

Let `a` be cell age after local activation, `D` the assigned APD90, and `D0` the reference template APD90. The rapid upstroke is retained through the existing 4 ms anchor. For later ages, define

```text
u = (a − 4) / (D − 4)
w(u, γ) = u / [γ + (1 − γ)u]        for 0 < u ≤ 1
w(u, γ) = 1 + γ(u − 1)             for u > 1
template age = 4 + w(u, γ)(D0 − 4)
```

For positive `γ`, the mapping is strictly increasing. `γ = 1` gives the existing duration warp. Smaller values move through the template earlier during the plateau; larger values retain the plateau longer. The mapping fixes `u = 0` and `u = 1`, and its derivative agrees on either side of `u = 1`. It therefore retains the template's rapid upstroke and the assigned 90% recovery endpoint while changing intermediate recovery landmarks. Because the time map is monotonic, it cannot introduce an additional extremum that is absent from the template.

The actual shipped reference template reaches its normalized peak at the 4 ms anchor and remains near its peak afterward. Its recovery shape comes from pooled relative optical measurements in two human LV endocardial wedge preparations; its millivolt amplitude and intrinsic rapid upstroke are separately assumed. The new parameter is a **dimensionless phenomenological shape prior**, not a measured current, ion concentration, or ischemia severity scale.

The first recommended comparison fixes the uninjured reference shape and permits regional plateau depression. A broader comparison can allow a modest global template adjustment and a wider regional shape range, explicitly labeled as extra model flexibility. Bounds must be reported as modeling assumptions rather than physiological normal ranges. An injured region that is relatively less depolarized early but remains depolarized after surrounding tissue has recovered can, in principle, produce a positive ST component followed by a differently signed terminal recovery component. That is a forward-model implication to test, not a claim about the source patient's actual cells.

### Independent shape check

A sweep of assigned APD90 values of 140, 200, 300, and 480 ms, with shape values 0.45, 0.55, 0.8, 1, 1.25, and 2.2, confirmed that the implementation retains normalized voltage exactly 0.1 at its assigned APD90. The sampled recovery waveform stays within 0..1 and has no increasing step after the 4 ms anchor. At a fixed 300 ms APD90, changing the shape from 1 to 0.45 advances APD20 from 159.2 to 102.1 ms and APD50 from 240.0 to 193.1 ms. This is primarily a change in the middle plateau and recovery: normalized voltage at 40 ms is still 0.959, compared with 0.992 for the original template. It should not be described as a literal, abrupt early epicardial dome-loss simulation.

The initial shape experiment also broadens the signed injury-duration bound to permit up to 140 ms of prolongation, compared with the prior 100 ms limit. The cited evidence supports testing both signs but does not calibrate that numerical bound. Actual local durations, any clipping at the implemented 120 or 480 ms limits, and the sensitivity to this assumed range must therefore accompany the candidate comparison.

The rational-shape experiment's training objective multiplies QRS, ST, and late-T residuals by 1.2, 3, and 2, respectively, after division by each training lead's QRS RMS with a 0.2 mV floor. These are residual multipliers, so their squared-loss multipliers are 1.44, 9, and 4. The phase sample counts and amplitudes still differ. This is an explicitly ST/T-prioritized objective rather than equal contribution from all ECG phases. It does not rescale the published ECG amplitudes.

## A second family: explicit early plateau suppression

The first family changes the middle plateau only modestly and did not resolve the important terminal-T mismatch. The second experiment therefore introduces one bounded regional plateau fraction `f`, interpolated from 1 in uninjured tissue toward a fitted injury value. It retains the original rapid upstroke through 4 ms, then smoothly depresses the subsequent voltage excursion over 4–30 ms. With `q0(a)` the original duration-warped, normalized waveform,

```text
h = (f − 0.1) / 0.9
x = clamp((a − 4) / 26, 0, 1)
s(x) = x²(3 − 2x)
q(a) = 0.1 + [q0(a) − 0.1] [1 − (1 − h)s(x)]    for 4 < a ≤ APD90
```

For `0.1 < f ≤ 1`, both positive factors in the excursion above 0.1 are nonincreasing, so the result cannot produce a new upward phase. It equals the original peak at the anchor and equals 0.1 at APD90. The plateau fraction is an approximate upper level near 30 ms, not an exact measured plateau amplitude: the original waveform has already declined slightly by that age.

After APD90, a monotonic Hermite map of the remaining template age matches the changed initial slope and rejoins the original time of return to rest. If `v` is normalized template time from APD90 to that rest endpoint, its replacement is `h v + (1 − h)(2v² − v³)`. Its derivative is `h + (1 − h)(4v − 3v²)`, which stays positive over the interval, begins at `h`, and ends at 1. Thus there is no added late hump, endpoint jump, or unbounded tail stretching.

An independent sweep of APD90 values of 120, 140, 200, 300, and 480 ms and fractions of 0.15, 0.3, 0.5, 0.7, and 1 confirmed exact preservation of the 90% endpoint, normalized voltages within 0..1, monotone decline after the anchor, and the original return-to-rest endpoint. At a fixed 300 ms APD90 and fraction 0.3, APD20 and APD50 become 13.18 and 20.82 ms. This illustrates why the new field's early negative voltage slope must be distinguished from complete repolarization. The 90% endpoint can remain late after most of the voltage excursion has already been lost.

The 0.15..1 fraction bound is an exploratory modeling range, not a measured human physiological interval. The curve approximates early plateau suppression but does not implement a literal epicardial notch-and-dome, phase-2 re-entry, metabolic state, or specific channel kinetics. The source record does not identify those mechanisms uniquely. Three training initializations explore different plateau depths and recovery signs. The primary comparison uses QRS/ST/late-T residual multipliers of 1.2/4/3; a separately declared QRS-emphasized comparison uses 2.5/3/2. Their raw-mV errors remain directly comparable in the frozen windows.

## Outcome of the frozen comparison

The rational-shape candidate made only a small ST/T tradeoff and retained the terminal-T mismatch. The more flexible second search found a useful alternative with a much longer regional recovery field, but its early-plateau fraction returned to **1 everywhere**. The retained result therefore does not use the proposed early suppression. It is labeled **“ST/T-focused regional prolongation · QRS tradeoff”**, not a fitted dome-loss mechanism. This optimization result is not proof that plateau suppression is absent from the patient's tissue.

In the final direct all-source calculation, the alternative lowers held-out ST error from 0.110505 to 0.061643 mV and ST/T error from 0.117385 to 0.076153 mV, while raising QRS error from 0.394993 to 0.461056 mV. Its terminal V2 minimum is −0.237 mV at +329 ms, compared with −0.265 mV at +328 ms in the recorded median; the original default does not produce a negative terminal V2 component. The prior-informed default is preserved because the alternative has worse whole-window error and reaches the uncalibrated 140 ms injury-prolongation bound.

The alternative's modeled LV APD90 spans 240.3–432.4 ms and its RV spans 229.9–310.1 ms. Within the model-defined injury core, the median is 390.0 ms and the 5th–95th percentiles are 336.8–422.8 ms. No nodes reach the implemented 120 or 480 ms clipping limits. These values are model outputs, not human measurements inferred uniquely from the tracing. [INDEPENDENT_REVIEW.md](INDEPENDENT_REVIEW.md) reports all phase errors, the remaining per-lead mismatches, numerical checks, and the actual field bounds.

## Validation requirements

- Compute APD20, APD50, and APD90 from the resulting local waveform, in addition to reporting assigned parameters. Confirm the 90% landmark at representative and extreme parameters.
- Verify finite resting and peak voltages, ordered recovery landmarks, and absence of newly introduced extrema. Any small nonmonotonicity already present in the optical template must be distinguished from an added re-excitation mechanism.
- Preserve the same source shape in the optimizer, direct all-source calculation, browser membrane-voltage evaluator, and exported fixtures.
- Preserve the original measured targets, PR baseline convention, beat inclusion rules, training/held-out split, and scoring windows. Whole-window improvement and improvement under the ST/T-prioritized objective must be identified separately.
- Report raw-mV error for P, QRS, ST, ST/T, and the important individual leads. A candidate that improves one phase while degrading another is a tradeoff, even when it has the lowest chosen objective.
- Keep the existing conservative-RV candidate and numerical winner available as comparisons. A new waveform parameter must not be presented as uniquely identifying the patient's cellular physiology.

## Caution for regional source-contribution graphics

An exact regional contribution should partition the finite-element volume integrand,

```text
C_lead,region(t) = Σelements in region [−volume · grad(Zlead) · σi · grad(Vm(t))].
```

Soft region weights may be used if they sum to one for each element. This preserves the total lead voltage and makes each regional contribution vanish for a spatially uniform membrane voltage. Simply grouping the collapsed nodal lead weights times `Vm` by chamber can introduce partition-boundary terms and misleading nonzero regional signals, even when the total cancels.

Reference subtraction must also preserve the sum. Subtracting an independently calculated median PR value from each regional trace generally fails because a median is nonlinear. Instead, for each lead, find the PR sample whose **total** signal defines its median reference, then subtract all regions' values at that same sample. If the median averages two order-statistic samples, use that same pair for every region. The regional sum then equals the existing median-referenced lead voltage exactly. These decompositions are specific to the chosen source formulation and anatomical partition; they do not identify an independently measurable isolated chamber voltage.

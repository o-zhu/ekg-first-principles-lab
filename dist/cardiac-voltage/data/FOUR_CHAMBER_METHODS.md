# Whole-heart model: anatomy, cellular sources, and lead-II calibration

This is an educational reduced forward model. It calculates the ECG from a
three-dimensional membrane-voltage field. Its upstream parameters have been
calibrated to one measured healthy-control lead-II recording. Agreement with
that recording is calibration performance, not an independent validation or a
unique reconstruction of the donor's heart.

The original measured optical movies, the CT-derived anatomy, and the PTB ECG
come from different people. Their roles are kept explicit below.

## What is measured, inferred, and fitted?

| Component | Evidence and role |
|---|---|
| Main anatomy | Rodero's statistical mean of 19 CT-derived adult hearts. The LV wall was segmented; RV and atrial thicknesses were prescribed by the source authors. |
| Added appendage | Exact source ostium; an inferred, blind-ending body beyond it. Its shape is not recovered CT anatomy. |
| Ventricular AP shape | A conditioned, equally weighted pool of the two human optical donor medians, containing 2,948 accepted recording pixels. |
| Intrinsic ventricular rise and absolute Vm | Assumed 2 ms 10–90% upstroke and −85/+25 mV scale. Optical fluorescence cannot establish these intracellular quantities. |
| Atrial AP | Published Courtemanche–Ramirez–Nattel ionic-model output, not a measured atrial recording. |
| Activation and local APD | Explicit graph propagation, delivery sites, and spatial duration parameters calibrated to lead II. |
| Source conductivities | Effective fitted model parameters, not measured donor-specific intracellular conductivities. |
| Body conductor | A finite homogeneous ellipsoid with virtual boundary electrodes. |
| ECG target | Calibrated raw-mV median of 108 beats from PTB patient104/s0306lre. It is used in the fit. |

## 1. Anatomy and the extra atrial opening

The source [Rodero dataset](https://zenodo.org/records/4593739) labels tag 11 as
the left atrial appendage opening, tags 12–15 as the four pulmonary-vein
openings, and tag 7 as the separate mitral plane. The [original
paper](https://doi.org/10.1371/journal.pcbi.1008851) explicitly states that the
appendage was omitted because it fell outside the CT field of view in some
cases. Thus the fifth small opening was the cropped LAA ostium, not a fifth
pulmonary vein.

The extension preserves all 502 source attachment faces and 356 original
attachment nodes. A curved, tapering hollow pouch with a closed distal dome is
attached there. It adds **9,824 nodes,
35,902 tetrahedra, and
2.015 mL of myocardial tissue**. Its 30 mm centerline and
2.4 mm distal cap are explicit construction assumptions. The four pulmonary
veins and mitral opening are untouched. Fine pectinate muscles, patient-specific
lobes, blood flow, and contraction are not modeled.

The combined anatomy has **336,272 anatomical nodes and
1,562,432 myocardial tetrahedra**. Duplicating 4,310 shared AV
interface nodes prevents unintended direct activation from atria to ventricles,
giving **340,582 electrically distinct activation nodes**.
There are two electrical graph components. The AV delay is prescribed through
the onset schedule.

The appendage participates in both graph activation and the source integral.
It is not a decorative surface. Its distal surface is closed, all native seam
faces are shared correctly, and sampled overlap checks found no new nodes or
new tetrahedron centroids inside the original myocardial volume. These checks
are not a formal proof of every possible geometric intersection. Six existing
nonmanifold boundary edges in the isolated native LA subset are unchanged.

The normal cutaway removes the anterior appendage along with the adjacent
anterior atrial wall. **Inspect the reconstructed appendage** switches to a
full-surface view. The provenance is in
[left-atrial-appendage.json](left-atrial-appendage.json).

## 2. Activation and the improved QRS

The model uses a shortest-path travel graph on the myocardial mesh, with
anisotropic ventricular travel, a fast endocardial surrogate, and isotropic
atrial travel. It does not solve a monodomain/bidomain tissue PDE or an explicit
Purkinje tree.

Fifteen ventricular delivery locations are specified. The original twelve occupy
four literature-informed regions; three additional endocardial deliveries
cover basal RV tissue. Their locations and onset times are calibrated model
assumptions, not measured Purkinje-to-muscle junctions. Basal RV delivery
addressed the delayed positive source contribution that produced the previous
late QRS shoulder. [Human activation mapping](https://pubmed.ncbi.nlm.nih.gov/5482907/)
and [regional-delivery sensitivity simulations](https://pubmed.ncbi.nlm.nih.gov/29549620/)
motivate the regional model, but do not validate these exact fitted coordinates.
Under the earliest-arrival rule, thirteen of the fifteen locations have a
nonempty activation territory. Fronts from other locations reach the remaining
two territories first. This redundancy is retained and documented; the fitted
delivery schedule is not uniquely identified by one surface lead.

| Travel parameter | Selected value |
|---|---:|
| Ventricular longitudinal speed | 0.490175 mm/ms |
| Ventricular transverse speed | 0.210075 mm/ms |
| Fast endocardial speed | 1.400501 mm/ms |
| Atrial isotropic speed | 0.648019 mm/ms |
| Ventricular activation span | 98.012 ms |
| Earliest atrial-to-ventricular onset interval | 178.179 ms |

The onset interval is a tissue-model quantity, not a clinically delineated
surface PR interval. A common 30 ms display-clock translation provides an
initial resting interval. It changes no relative timing or waveform shape.

## 3. Pooled human optical recovery and duration scenarios

The original unquantized 1 ms MAT recordings from [Smirnov et al.
2020](https://doi.org/10.1371/journal.pone.0231695), shared through
[Zenodo](https://zenodo.org/records/3986725), were reprocessed with the retained
quality masks: 2,493 donor-1 and 455 donor-2 pixels. Reprocessing reproduces every
published movie byte after display quantization and every accepted activation
time. Each optical pixel averages a tissue volume; these are not 2,948
independent cells or 2,948 independent biological preparations.

For shape estimation only, each waveform is aligned by AT and normalized by its
own APD90. The two donor median shapes receive equal weight. The measured movies
and maps keep their original timings. Baseline/peak normalization, decreasing
isotonic conditioning, and 0.015-APD Gaussian smoothing suppress optical noise.
The selected template directly interpolates that conditioned empirical pool.
A Richards fit to the same pool was also tested, but was not the final choice.
The shape-processing script never uses ECG samples.

The optical rise is broadened by recording and processing, so the model uses
an assumed 2 ms intrinsic rise. The reusable template has a reference APD90 of
300 ms; local AP durations are assigned separately. This is neither a statement
that the optical donors had 300 ms APD nor a heart-rate correction. See the
[selected shape](selected-human-ventricular-template.json) and the
[complete pooled evidence](pooled-human-ventricular-template.json).

Let a = t − AT, with a 4 ms post-upstroke anchor. For a > 4 ms, the serialized
template is evaluated at age

    a_template = 4 + (a − 4) × (template_APD90 − 4) / (local_APD90 − 4).

The intrinsic rise is not duration-warped. Vm is the resting voltage plus the
normalized AP multiplied by its declared voltage excursion. The same evaluator
is used in the offline source calculation and browser playback.

The default ventricular APD90 field has median **331.494 ms**, a
**70.087 ms** endocardial-to-epicardial contrast, a
**7.459 ms** apex-to-base contrast, and a
**-35.000 ms** RV offset. The combined contrast is centered on its
ventricular median. The resulting range is
**273.03–384.55 ms**.
These parameters are fitted; they are not an inferred measured whole-heart map.
Local recovery always follows RT90 = AT + APD90. No global reverse recovery
order is imposed.

The optional equal-duration scenario sets all ventricular APD90 values to the
default median. The optical-donor alternative restores the original donor-1
single-site recovery shape and 392.59 ms median duration, with the current
spatial contrast parameters. Both alternatives recalculate the ECG from their
own cellular fields.

The atrial AP is the 40th 1 Hz beat of the
[Courtemanche–Ramirez–Nattel model](https://pubmed.ncbi.nlm.nih.gov/9688927/), at
310 K. Its baseline APD90 is approximately 296.8 ms, with +12 ms LA and −6 ms RA
offsets. Forty-beat conditioning is finite, not certified exact ionic steady
state. Atrial recovery is included in the total ECG.

## 4. From Vm to the body-surface lead voltage

The body is a homogeneous ellipsoid, centered at [0, 0, −60] mm with radii
[170, 110, 300] mm and conductivity 0.20 S/m. A finite-element solve on 50,932
body nodes and 327,148 tetrahedra obtains reciprocal potentials Z for virtual
boundary electrodes. The insulating body surface is part of the calculation.
Auxiliary unit-current solves obtain lead sensitivity; those currents are not
applied during the passive ECG recording shown in the animation.

    Vlead(t) = −integral [grad(Zlead) · sigma_i · grad(Vm(t))] dVolume
    Lead II = phi(LL) − phi(RA)

The ventricular source tensor follows the supplied rule-based fiber field.
Selected effective conductivities are
**0.268378/0.067094 S/m**
longitudinal/transverse and **0.026446 S/m** isotropic atrial.
These amplitude-sensitive inputs have been fitted. They can absorb errors in
other approximations, including wall thickness and the homogeneous torso;
their fitted values must not be described as donor measurements. Propagation
speed and source conductivity are separate inputs in this reduced model.

All twelve leads are differences of the same calculated electrode potentials.
No measured ECG waveform, prescribed P/QRS/T component, or output ECG filter
is inserted. The fit changes cellular/source parameters upstream. Constant Vm
has no gradient, so its source cancels; gauge offsets cancel in electrode
differences, and the limb leads satisfy Einthoven's identity.

## 5. What adding more points actually changes

The default uses **2,400,926 voltage samples**, comprising
all 340,582 activation nodes plus all
2,060,344 electrically separated edge
midpoints. Each parent tetrahedron is divided into eight, equivalent to
**12,499,456 sub-tetrahedra** for the
piecewise-linear Vm integral. AT and APD are interpolated to the midpoint before
the nonlinear AP is evaluated; averaging endpoint Vm would not achieve this.

For parent local source weights W_i, exact integration with fixed parent
conductivity and torso gradient gives refined corner weights W_i/4 and edge
midpoint weights 3(W_i + W_j)/4. The browser's surface/cutaway interpolation
uses the same eight-child basis. Selected APs therefore describe the same
field that generates the ECG. Section-point timing annotations are
interpolated source parameters, rather than new threshold measurements.

The controlled baseline experiment increased 330,758 voltage samples to
2,336,903 while holding all physiology fixed. Whole-beat waveform RMS changed
by about 0.0011 mV, with a maximum QRS difference of about 0.0092 mV. It barely
changed the notch. Thus the principal fit improvement came from activation and
cellular/source choices, not point count alone. In the final model, original
mesh sampling differs from dense sampling by
**0.877% waveform RMS**.

This is a source-field sensitivity calculation, not a new activation solution,
torso refinement, proof of complete numerical convergence, or extra biological
measurements. The 2 mm and 4 mm bin options are further coarsening experiments.
Published work on [undersampled cardiac sources](https://pubmed.ncbi.nlm.nih.gov/31799513/)
and [rapid anisotropic ECG models](https://doi.org/10.3389/fphys.2017.00265)
motivates examining the actual waveform sensitivity rather than assuming more
points guarantee better physiology.

## 6. Fit comparisons and remaining limits

The target is the first entry in the official PTB healthy-control manifest:
[patient104/s0306lre](https://physionet.org/content/ptbdb/1.0.0/patient104/).
The 1 kHz raw recording retains its 2,000 ADC-unit/mV calibration. A detector-only
filter locates R peaks; displayed/target samples remain raw calibrated values.
Each eligible beat has its pre-P median baseline subtracted, then 108 beats are
R-aligned and combined pointwise. No target amplitude scaling or time warping
is used. A healthy individual's beat is not a population-wide ideal waveform.

| Lead-II feature | Previous published model | Current dense model | Measured target |
|---|---:|---:|---:|
| P peak | 0.4009 mV | 0.1204 mV | 0.1425 mV |
| R peak | 1.0618 mV | 1.1423 mV | 1.1538 mV |
| T peak | 0.4717 mV | 0.3957 mV | 0.4035 mV |
| R-to-T peak interval | 280 ms | 265 ms | 271 ms |

The [comparison figure](lead-ii-fit-comparison.png) and
[complete experiment report](lead-ii-fit-study.json) retain the tested
alternatives, objective windows, raw-mV errors, parameter bounds, and other-lead
comparisons. Experiments included denser field sampling, regional timing fits,
chronology constraints, independently timed delivery sites, altered fast
endocardial conduction, basal RV coverage, native TT06 ionic APs, adapted AP
shape families, and pooled human optical recovery. An unconstrained timing fit
and several poorer or more speculative alternatives were not selected.

The current model is calibrated to lead II, so other leads are a useful
unoptimized check but not independent patient validation. Against the same PTB
recording, ten of the eleven non-target leads have larger whole-window errors
than the previous model; V5 improves. Thus this revision improves lead-II fit,
not general twelve-lead fidelity. The complete table is in
[LEAD_II_CALIBRATION.md](LEAD_II_CALIBRATION.md). A single lead cannot
uniquely identify true activation, recovery, fiber orientation, conductivity,
or geometry. The detailed fit still differs from the recording, including its
late baseline/U-wave region. Missing body tissue compartments, atrial fibers,
and an explicit Purkinje system remain important limits.

## 7. Display controls and the original scientific clock

The 3D simulation displays 0–800 ms and pauses at the endpoint. The recorded
human optical view retains its full recording window. The source JSON and
calibration report retain the original 1,001 model samples through 1,000 ms.
The ECG, tissue voltages, AP plots, phase buttons and time-seeking all use the
same unwarped source time; this is a display crop, not a change in physiology.

The optional lead-axis line uses the serialized virtual-electrode positions.
It points from the negative reference toward the positive electrode and is
translated through the heart for visibility. It rotates with the anatomy.
For augmented and chest leads, the reference position is the corresponding
mean electrode position. This geometric guide is not the spatially varying
reciprocal lead field, nor an instantaneous cardiac-dipole vector.

Appendage visibility is a display-only option. Hiding the inferred surface
also hides its scene markers and prevents picking that hidden surface. Its
contribution to the source integral, and any already-selected AP trace, remain
unchanged. The quieter inspection link is under the Appendage disclosure.

## 8. Numerical checks and reproduction

The [independent audit](whole-heart-independent-audit.json) is bound to the
published model hash. It independently evaluates serialized AP definitions at
all native and midpoint source sites, checks all twelve leads and separate
atrial/ventricular contributions, reconstructs sampled source weights from
geometry, verifies the AV split and constant-Vm cancellation, and compares the
shipped JavaScript evaluator with the same field. Refined-element integration
is separately checked by explicit eight-child assembly.

These are numerical consistency checks, not clinical validation. The full
torso solve has its own current balance, energy, gauge, and analytic-sphere
checks. Browser testing separately checks actual rendering, view switches,
site selection, AP comparisons, phase controls, and trace seeking.

Download [the reproducible source](heart-model-reproducible-source.zip).
The package includes scripts, all small anatomical extensions and rendering
inputs, exact calibrated parameters, AP templates, optical display exports,
the measured ECG, experiment records, and a SHA256 manifest. Large original
CT and optical archives have pinned retrieval instructions. Generated source
operator caches are rebuilt, not redistributed. The original geometry's
CC BY 4.0 credit and the optical/ECG data notices are retained.

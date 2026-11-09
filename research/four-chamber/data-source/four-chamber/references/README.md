# Atrial and measured ECG references for the educational whole-heart model

Obtained 2026-10-29. These retained sources support the four-chamber model and its separate measured ECG comparison.

## 1. Real healthy-control ECG reference

**Ready artifact:** `ptb-healthy-reference.json`.

Source: PTB Diagnostic ECG Database v1.0.0, official `CONTROLS` manifest, **first listed record `patient104/s0306lre`**. Original header explicitly gives “Healthy control”, no additional diagnoses. Selection was by manifest order, not similarity to a model waveform.

- Dataset: https://physionet.org/content/ptbdb/1.0.0/
- Record: https://physionet.org/content/ptbdb/1.0.0/patient104/
- Original header: https://physionet.org/files/ptbdb/1.0.0/patient104/s0306lre.hea
- Original signal: https://physionet.org/files/ptbdb/1.0.0/patient104/s0306lre.dat
- DOI: https://doi.org/10.13026/C28C71
- License: **Open Data Commons Attribution License v1.0**, https://opendatacommons.org/licenses/by/1-0/
- Credit: PTB Diagnostic ECG Database; Michael Oeff, Hans Koch, Ralf Bousseljot, Dieter Kreiseler and contributors; PhysioNet.

The `.dat` contains 12 multiplexed leads, 16-bit little endian, 1000 Hz, gain 2000 ADC units per mV. The separate Frank XYZ file was not needed. The header lists all 15 leads; do not incorrectly reshape the .dat as 15 channels.

### Derived reference processing

`package_references.py` is reproducible from retained source files. A 0.5–40 Hz third-order zero-phase Butterworth filter is used **only for R detection**, followed by refinement to the local raw lead-II maximum within ±8 ms. All 108 eligible beats outside the first and last 5 seconds are extracted over −300..599 ms relative to each R. Each raw beat has a constant pre-P baseline (median −300..−241 ms) subtracted. The displayed values are the pointwise median of these raw calibrated beats.

No amplitude normalization, time warping, polynomial smoothing, or synthetic waveform components. The pointwise 10th/90th percentiles are included to show beat variability. `allLeadsMv` contains medians from all 12 leads; `leadIIMv` is convenient for the requested lead II.

- `dtMs: 1`
- `startRelativeRMs: -300`
- `endRelativeRMs: 599`
- 900 samples
- 108 contributing beats
- median RR ≈976 ms, ≈61.5 beats/min
- lead-II R ≈1.154 mV, q ≈−0.086 mV

Suggested UI label:

> **Measured healthy reference · lead II.** PTB patient104/s0306lre; median of 108 raw, R-aligned, baseline-corrected beats. Calibrated mV retained. Separate person and recording from the anatomy and AP data.

Do not call this the universal “ideal lead II.” It has a normal-looking qR morphology; no artificial S wave should be added. If overlaid on the forward simulation, translate the entire reference in time to align the R peak, without time warping or amplitude scaling. Alternatively show both traces on the same physical mV scale with independent timing annotations. The reference is **not** part of the forward calculation.

`ptb_raw_median_review.png` shows the raw beat overlay and median. `ptb_reference_review.png` was an intermediate filtered-signal review and is not the final reference artifact.

## 2. Published human-data-based atrial ionic model

**Ready artifact:** `courtemanche-atrial-template.json`.

Courtemanche M, Ramirez RJ, Nattel S. *Ionic mechanisms underlying human atrial action potential properties: insights from a mathematical model*. Am J Physiol. 1998;275:H301–H321. DOI:10.1152/ajpheart.1998.275.1.H301.

- Primary paper: https://pubmed.ncbi.nlm.nih.gov/9688927/
- CellML model: https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65
- Raw model: https://models.cellml.org/workspace/courtemanche_ramirez_nattel_1998/@@rawfile/c26e4d53792b0e3161b2f8638afa2819fc999610/courtemanche_ramirez_nattel_1998.cellml
- Generated Python: https://models.physiomeproject.org/exposure/0e03bbe01606be5811691f9d5de10b65/courtemanche_ramirez_nattel_1998.cellml/@@cellml_codegen/Python
- License: **CC BY 3.0 Unported**, https://creativecommons.org/licenses/by/3.0/

The primary publication builds Na/K/Ca current formulations from human atrial myocyte recordings and compares the resulting AP and interventions against experimental observations. This is a defensible atrial waveform reference, but **it is model output, not a sampled human atrial action potential**. The repository notes unit consistency issues in its metadata; use its numerical units as specified and do not imply clinical validation.

`courtemanche_generated.py` is the original generated mathematical code, extracted without changes. `simulate_courtemanche.py` runs the published parameters at 1 Hz for 40 conditioning beats with 2-ms, −2000-pA stimuli and 310 K temperature. The ODE uses SciPy BDF, rtol 2e−7, atol 2e−9; integration is split at stimulus boundaries and sampled at 0.5 ms. No ionic conductance was fitted to the ECG.

The final beat has:

- Resting Vm ≈−80.938 mV
- Peak Vm ≈+23.911 mV
- Maximum sampled dVm/dt at 52 ms (2 ms after stimulus onset)
- APD50 ≈174.768 ms
- APD80 ≈257.733 ms
- APD90 ≈296.802 ms
- 2000 samples at 0.5 ms, time 0..999.5 ms

The shape is supplied in `voltageMv` and `normalized`. Small negative normalized values are real differences from the estimated pre-stimulus baseline, not a numeric failure. For spatial interpolation, choose an explicitly stated resting reference and, if clipping a normalized template to zero, document it.

**Conditioning limit:** maximum pointwise voltage difference between beats 39 and 40 is 0.0612 mV. Do not label the 40th beat certified ionic steady-state. “After 40 paced conditioning beats” is accurate.

Suggested UI label:

> **Atrial Vm · Courtemanche human atrial ionic model.** Published human-data-based cell equations, paced at 1 Hz for 40 conditioning beats; distributed over atrial anatomy with assumed activation timing.

Keep measured ventricular optical records separately labeled. Atrioventricular conduction delay and regional atrial heterogeneity remain model assumptions unless tied to additional measurements.

## 3. Primary physiological anchors

### de Ponti et al., 2002

*Electroanatomic analysis of sinus impulse propagation in normal human atria.* J Cardiovasc Electrophysiol. 2002;13:1–10.

https://pubmed.ncbi.nlm.nih.gov/11843475/
https://doi.org/10.1046/j.1540-8167.2002.00001.x

Seven patients without organic heart disease or atrial arrhythmia, mapped after accessory-pathway ablation. Sinus propagation was broadly reproducible, with predominant anterior LA breakthrough via Bachmann's bundle and frequent posterior breakthrough. Both atria are activated concurrently for 65±9% of the atrial activation interval. This supports a delayed LA entry alongside continuing RA activation, rather than activating all RA then all LA in sequence.

### Ramanathan et al., 2006

*Activation and repolarization of the normal human heart under complete physiological conditions.* PNAS.

https://pubmed.ncbi.nlm.nih.gov/16606830/
https://pmc.ncbi.nlm.nih.gov/articles/PMC1458874/

ECGI in seven healthy, intact, unanesthetized adults. Atrial activation spreads from the sinus-node region and ends at the LA appendage. Ventricular anterior paraseptal RV breakthrough is early, multiple subsequent breakthroughs precede 40 ms after QRS onset, and LV base/RV outflow tract activate late. Surface repolarization gradients include LV apex-to-base and LV/RV differences. Mean epicardial ARI 235 ms and mean LV apex-to-base dispersion 42 ms; ARI is a surrogate for APD, and these are epicardial inverse reconstructions, not full-wall simultaneous intracellular recordings.

### Detailed atrial simulation with timing comparison

*Simulation of biatrial conduction via different pathways during sinus rhythm with a detailed human atrial model* (2012).

https://pmc.ncbi.nlm.nih.gov/articles/PMC3437366/

Its own simulation activates LA beginning at 30 ms, with total LA activation 79 ms and total atrial activation 109 ms. The paper compares these with clinical human mapping. Thus a roughly 100–110-ms atrial activation interval with ~30-ms delayed LA entry is a plausible representative teaching-model configuration, **not a patient-specific measured map**.

## Integration recommendation

Use physically calculated atrial and ventricular source contributions, expose them separately and sum them for the ECG. Atrial repolarization may overlap ventricular events and should not be erased by adding a handdrawn P wave. The current revision explicitly uses the PTB lead-II recording as a calibration target for upstream source parameters; the displayed overlay and calibration report disclose this use. Agreement is calibration performance, not independent validation. The source signal still comes from the three-dimensional voltage field, without inserting measured ECG samples. Increased point count is tested separately with fixed anatomical/electrophysiological assumptions.

## Follow-up: representative ventricular APD and optical upstroke

### Choose 300–310 ms as an explicit model scenario, not a rate correction

The donor optical source was **already paced at CL1000 ms and 37°C**, with retained accepted-pixel median APD90 392.59 ms. Shortening it to 300 or 310 ms at the same cycle length is therefore **not a correction for heart rate**, and it must not be presented as recovering that donor's true physiology. It is a different representative whole-heart timing scenario, informed by in-vivo human studies. Retain the original duration as an optional exploration and retain the measured record unchanged.

Direct evidence: Franz MR et al. *Monophasic action potential mapping in human subjects with normal electrocardiograms: direct evidence for the genesis of the T wave*. Circulation. 1987;75:379–386.

- https://pubmed.ncbi.nlm.nih.gov/3802441/
- https://doi.org/10.1161/01.CIR.75.2.379
- Primary PDF/table: https://www.ahajournals.org/doi/pdf/10.1161/01.CIR.75.2.379

All patients had normal LV function and concordant-T ECGs; they were catheterization/surgical patients, not a population sample of healthy volunteers. Table1 reports LV endocardial APD90 ranges 284–348ms at64bpm, 306–336ms at72bpm, and286–347ms at76bpm. Across these ten subjects the displayed endocardial range is239–348ms and epicardial247–330ms, at64–101bpm. A 300–310ms central model value with tens-of-ms regional gradients is within observed in-vivo data, but **not an estimated universal human mean**.

Suggested UI wording:

> **Representative timings · APD90 about 300 ms.** A literature-constrained whole-heart scenario uses the donor-derived recovery shape with an assumed duration field. This does not reproduce the donor's original APD. Compare with “Original donor duration · about393ms.”

Suggested methods wording:

> The measured ventricular optical waveform supplies a shape template. To construct a representative whole-heart scenario, phase2/3 is smoothed under an explicitly imposed monotonic-recovery constraint and time-warped to a prescribed regional APD90 field centered at300ms. Human in-vivo monophasic-AP mapping supports APD90 values in this range. The original donor was paced at1000ms cycle length, so this duration change represents a different physiological scenario rather than a heart-rate correction or a patient-specific reconstruction. All APD90 values are verified from the final waveform's90%-recovery crossing. The original measured view and a donor-duration alternative are retained.

### A fast intrinsic upstroke is an assumption justified by measurement physics

Walton RD et al. *Extracting Surface Activation Time from the Optically Recorded Action Potential in Three-Dimensional Myocardium.* Biophys J. 2012;102:30–38.

- https://pmc.ncbi.nlm.nih.gov/articles/PMC3250680/
- https://pubmed.ncbi.nlm.nih.gov/22225795/
- DOI:10.1016/j.bpj.2011.10.036

Electro-optical simulations plus rat and pig validation show optical upstroke broadening by three-dimensional fluorescence averaging; optical rises can reach5–15ms, much longer than electrical upstrokes. This supports treating a tissue optical upstroke as different from a pointwise cellular upstroke. It does **not** identify the exact intrinsic rise time of this human donor. The donor's own11ms temporal Savitzky–Golay processing can also broaden the observed rise.

Suggested methods wording:

> The spatial current calculation uses an assumed fast2-ms activation upstroke. This replaces the broadened optical rise; it is not a recovered measurement of that donor's intrinsic upstroke. Optical volume averaging and temporal processing broaden the recorded rise. The donor-derived phase2/3 template is retained after the disclosed conditioning steps.

Do not describe monotonic fitting as merely 'denoising' if it removes physiological notch/plateau structure. Describe it as a constrained reduced model. Smoothing and time warping do not create new real data. Do not normalize the computed ECG amplitude or alter its phases to force a textbook waveform.


## Reproduce the compact reference files

From this directory, run `python simulate_courtemanche.py` to regenerate the 40-beat ionic-model output, then `python package_references.py` to regenerate both JSON reference files. Copy the two JSON files to the parent four-chamber directory before running the main model builder. The retained 40-beat NPZ permits the packaging step without repeating the ODE calculation. Dependencies are NumPy and SciPy.

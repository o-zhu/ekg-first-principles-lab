# Cardiac voltage: measured data and the four-chamber forward model

## What was obtained

The experimental view uses publicly shared human ventricular optical mapping from:

Smirnov D, Pikunov A, Syunyaev R, et al. **Genetic algorithm-based personalized models of human cardiac action potential.** PLOS ONE 15(5), e0231695 (2020). DOI: https://doi.org/10.1371/journal.pone.0231695. Dataset DOI: https://doi.org/10.5061/dryad.stqjq2c09. Downloadable mirror: https://zenodo.org/records/3986725. Correction: https://doi.org/10.1371/journal.pone.0244687.

The two original files were downloaded and checked against the repository MD5s:

| Source | Size | Verified MD5 |
|---|---:|---|
| Patient1_CL1000.mat | 67,069,659 bytes | c135455177687d7f57909cfe6003dd92 |
| Patient2_CL1000.mat | 62,148,182 bytes | ee4a046007478f76c89bfcdb127e974e |

License: CC0 1.0. Each contains a 100 × 100 × 4,096 optical signal array, recorded at 1 kHz. These preparations are human posterolateral left-ventricular wedges, viewed from the endocardium and paced from the epicardium at a 1,000 ms cycle length. Conditions include 37 °C oxygenated Tyrode solution, di-4-ANBDQBS voltage-sensitive dye, and blebbistatin to suppress contraction.

The accepted masks contain **2,493 sites in donor 1** and **455 sites in donor 2**. A camera pixel samples a tissue volume with many cells; a pixel is not an individually impaled cell. The remaining camera pixels are background, inadequate signal, or excluded by the quality criteria. The full study's molecular cohort is larger than the optical cohort; these two displays are two LV preparations, not two entire mapped hearts.

No documented, calibrated simultaneous ECG was supplied with these files. Auxiliary analog channels are not relabeled as an ECG. Relative fluorescence is not calibrated membrane voltage in mV.

## Optical processing

Full metadata is in donor1-metadata.json and donor2-metadata.json in the human directory. The original camera coordinates are preserved.

1. Use four complete 1,000 ms cycles, aligned globally to the measured pacing trigger. No individual pixel is shifted to align its upstroke in the measured movie.
2. Apply a narrow 60 Hz notch (Q = 30, zero-phase forward-backward), average four beats, and apply an 11 ms cubic Savitzky–Golay temporal filter. No spatial smoothing is used.
3. Correct linear baseline drift from resting intervals, then normalize each pixel to its own baseline and peak. The source cmosData already uses increasing signal for depolarization.
4. Estimate activation time from the maximum upstroke derivative; recovery at 80% and 90% is the corresponding descending optical threshold crossing after the local peak. Linear interpolation refines the crossing estimate.
5. Retain the largest connected tissue component satisfying brightness, amplitude, noise-ratio and timing criteria. The criteria and accepted count are in the metadata; masking is not anatomical ground truth.
6. Export the movie at 2 ms intervals in 8-bit normalized optical units. The underlying recordings and timing calculation use 1 ms samples. The optional single-beat view has the same temporal filtering and baseline procedure but no ensemble average.

The movie values decode as `value / 255 * 1.5 - 0.25`. Clipped color saturation in the movie is a display choice. The traces can show values outside [0,1]. Timing maps use the accepted 5th–95th percentile color interval, with endpoint limits shown. Timing estimates depend on the processing, marker and signal quality. A 1 ms sampling interval does not establish 1 ms physiological accuracy.

The model template is the native 1 ms conditioned trace at donor-1 camera pixel x46, y46, the highest-SNR accepted site. Its measured AT is 157 ms, APD80 418.58 ms and APD90 435.11 ms. It is one site's waveform, not a population-average action potential.

## What the current four-chamber view models

The current model uses the population-average four-chamber anatomy from [Rodero et al. (2021)](https://doi.org/10.1371/journal.pcbi.1008851), derived from 19 adult CT-based models and shared in the [source dataset](https://zenodo.org/records/4593739) under CC BY 4.0. Its LV wall comes from segmented myocardium; RV and atrial wall thicknesses were prescribed by the source authors. This population-derived anatomy is separate from the optical donors and the measured reference-EKG participant.

The complete myocardial calculation uses **330,758 electrical sites and 1,526,530 tetrahedra** across the LV, RV, LA, and RA. The electrical count includes 4,310 duplicated atrial–ventricular interface points, allowing independent atrial and ventricular activity without unintended direct conduction between them. These are numerical tissue-field samples, not individual cells or recording sites. The browser uses 19,497 rendering vertices with explicit source interpolation; every myocardial tetrahedron still contributes to the EKG. The section cuts the actual wall volumes and keeps the chamber lumens empty.

### Activation, action-potential shape, and recovery

Activation is a shortest-path approximation on the anatomical edge graph, with anisotropic ventricular travel, a fast endocardial delivery surrogate, isotropic atrial travel, and prescribed sinus-region, left-atrial-entry, and ventricular seeds. An explicit AV delay separates atrial and ventricular excitation. This is not a solved ionic tissue PDE, continuous eikonal equation, detailed AV node, or reconstructed Purkinje tree.

The ventricular recovery shape is a constrained fit to the human optical template described above. Its intrinsic 2 ms upstroke and −85 to +25 mV scale are assumptions. The default duration field is centered at a representative APD90 of 305 ms, with explicit regional variation. An alternative retains the optical-donor median duration of 392.59 ms; this changes the physiological scenario, not the heart rate. The original donor was already paced at a 1,000 ms cycle length. An equal-ventricular-duration control removes the prescribed ventricular APD variation.

Atrial action potentials come from the published [Courtemanche–Ramirez–Nattel human atrial ionic model](https://pubmed.ncbi.nlm.nih.gov/9688927/) after 40 paced beats, with a small prescribed regional duration difference. They are model output informed by human experiments, not newly obtained atrial recordings. Forty conditioning beats do not establish certified ionic steady state. At numerical source sites, recovery remains derived as **RT90 = AT + APD90**; no globally reversed recovery sequence is imposed.

## From the four-chamber voltage field to an EKG

The body conductor is a **finite homogeneous ellipsoid**, centered at `[0, 0, −60]` mm with radii `[170, 110, 300]` mm and conductivity 0.20 S/m. A separate linear-tetrahedral finite-element mesh at nominal 8 mm spacing supplies reciprocal lead fields. Virtual limb and chest electrodes are projected to its boundary. The boundary is insulating in the passive forward-recording problem; auxiliary unit-current electrode pairs are used only to calculate the reciprocal sensitivities.

For each myocardial tetrahedron, exact linear basis functions provide the spatial membrane-voltage gradient. Centroid quadrature combines that gradient with intracellular conductivity and the reciprocal potential gradient:

`Vlead(t) = −∫myocardium [grad(Zlead) · sigma_i · grad(Vm(t))] dV`.

Intracellular conductivity follows supplied rule-based ventricular fibers and is isotropic in the atria; it is distinct from propagation speed. The reciprocal field includes the finite body boundary. Physical unit conversions produce mV from model membrane voltages in mV. Lead II is `phi(LL) − phi(RA)`; all twelve leads come from the same source field. A spatially constant membrane voltage produces zero source gradient and zero lead voltage.

Atrial and ventricular source contributions are calculated separately and sum to the displayed EKG. No Gaussian P/QRS/T components, waveform fit, or amplitude gain are added. The measured comparison is an independent PTB healthy-control recording, `patient104/s0306lre`: a calibrated median of 108 raw, baseline-corrected, R-aligned beats, without amplitude normalization or time warping. It is a real reference recording, not a universal ideal or a fitting target.

## Numerical verification and limits

Generated metadata reports uniform-field cancellation, separately constant atrial/ventricular-field cancellation, source reachability, positive element volumes, rendering interpolation, atrial-plus-ventricular summation, and the identity `lead I + lead III = lead II`. The body solver checks current balance, linear residuals, positive energy, source containment, and an independent analytic insulating-sphere result. Actual counts, fingerprints, residuals, and waveform metrics are in [heart-model.json](heart-model.json); these are numerical consistency checks, not clinical validation.

The optional 2 mm and 4 mm source-bin comparisons retain the full anatomical mesh and lead operator while aggregating source weights and activation/APD parameters. They test source-sampling sensitivity within this specified model. They are not remeshing, activation-solver convergence, or body-FEM resolution studies. More points can reduce discretization error but cannot supply a missing measured activation map or correct an assumed duration field.

The ellipsoid is not a CT-derived torso and has no separate lung, blood, skeletal-muscle, or adipose conductivity compartments. Its electrodes and heart–body registration are virtual. The model omits detailed conduction-system anatomy, electrotonic feedback on AP shape, mechanical contraction, and clinical acquisition filters. The anatomy, optical preparation, atrial model, and measured EKG come from different sources; this is a representative educational model, not a patient-specific reconstruction.

See [the complete four-chamber methods and provenance](FOUR_CHAMBER_METHODS.md) for source licenses, processing, physical units, parameters, cache fingerprints, and reproduction. The older biventricular generator and its geometry provenance are retained in the source package as legacy material; they do not describe the current displayed model.

## Evidence in The wave

- Higuchi & Nakaya (1984), seven dogs, simultaneous endocardial/epicardial monophasic APs and a local electrogram. Warming/cooling changed the AP-duration difference and T polarity. https://pubmed.ncbi.nlm.nih.gov/6464965/
- Boukens et al. (2015), ten human LV wedges, optical APs and pseudo-ECG plus a published ten Tusscher/CARP three-dimensional forward simulation. Mean subendocardial APD80 360 ± 17 ms, RT 364 ± 16 ms; subepicardial APD80 317 ± 20 ms, RT 349 ± 19 ms. https://pmc.ncbi.nlm.nih.gov/articles/PMC4571834/
- Opthof et al. (2017), three isolated human hearts sampled with transmural unipolar electrodes. Recovery across the whole sampled wall was not universally the reverse of activation. These were electrogram-derived timings, not direct cell APs. https://pubmed.ncbi.nlm.nih.gov/27737802/

The wave's human preset uses the Boukens endpoint means. AT values 4 and 32 ms are derived by subtracting APD from RT. The plot adds the same 80 ms display offset to both endpoints; the original values remain shown. Intermediate sites and the AP shapes are simulated. The controlled strand uses APD80, while the organ model and its labels use APD90. These definitions are intentionally kept distinct.

## Reading the wave signal and its end effects

The default is now the published human wedge timing preset. Its AP waveform is a simplified prescribed waveform with no early-repolarization notch. The timing endpoints remain the published APD80/RT means; neither the AP shape nor the external voltage is a measured ECG. Optional exploratory controls expose the APD shortening, electrode distance and an imposed 5 mV early notch.

The original human preset produced −0.053884 mV at 115 ms with nearby electrodes. At that instant, activation had completed (last upstroke ended at 114 ms), but the imposed early notch had not finished at later-activated sites. Site A was at +15.00 mV and site B at +19.90 mV. This small spatial gradient generated a small opposite-polarity signal; it was not the later, phase-3 recovery event. Removing only the imposed notch makes that 115 ms signal exactly zero. The previous current-loop renderer had a minimum opacity of 50% and fixed arrow size and particle speed, exaggerating this weak source. The renderer reports the spatial voltage range and instantaneous phase. Its default direction view enlarges weak-current glyphs with an explicit label; the numerical magnitude is retained, and an optional strength view scales the glyphs. Exact-zero current draws no flow.

Electrode potentials use the sum of current sources weighted by inverse distance. A lead subtracts the two weighted potentials: V_lead is proportional to sum I_j(1/r_j,+ − 1/r_j,−). When the electrodes are near the strand ends, a traveling source is sensed more strongly near either end. In the original human-preset calculation, the signal rose from approximately 0.845 mV at 98 ms to 1.422 mV at 110 ms. Refining 81 sites to 321 changes the 110 ms signal by only 0.0156% with nearby electrodes, demonstrating that this increase is primarily the chosen lead geometry, not a spatial discretization error.

The strand extends from −1 to +1 in illustrative coordinates. The default distant electrodes are at ±10; the optional nearby electrodes are at ±2.15. The original near-electrode amplitude calibration is retained for both geometries. Moving the electrodes farther away therefore reduces the actual calculated amplitude; it is not normalized back upward. Only the graph's vertical axis adapts, and this is labeled. A sensitivity strip shows the relative spatial weighting. The displayed loop is a schematic representation of distributed source/sink currents, not a solved streamline field.

## Comparing selected sites

In the whole-heart module, clicks add or remove up to six sites with shared A–F colors. Model and measured selections are separate, and the two human donors retain separate selections. No signal from one preparation is merged into the other's overlay.

The small AP plot overlays the chosen signals; “Enlarge comparison” opens a larger plot with full-beat, activation-detail and recovery-detail windows. Cropping the common time axis never shifts individual curves to align their upstrokes. Human playback samples span 0–998 ms at 2 ms intervals; current model playback spans 0–1,000 ms. The timing table displays AT, APD, RT and differences relative to site A. Optical timing estimates continue to come from the filtered four-beat ensemble when the single-beat waveform is shown.

The uniform-voltage control assigns the active modeled AP to every location, so all selected traces and timing rows coincide. This selection feature does not change the underlying recorded data or the full-field ECG calculation.

## Reproduce and inspect

- Current four-chamber methods, sources, and reproduction: [FOUR_CHAMBER_METHODS.md](FOUR_CHAMBER_METHODS.md).
- Model parameters, assumptions, references and validation: [heart-model.json](heart-model.json).
- Complete executable model source and inputs: heart-model-reproducible-source.zip.
- Original human optical files: Zenodo 3986725, linked above.
- Processed human signals, timing maps, masks and metadata: the human directory in this Site.
- The source repository retains the optical processing script and all model-generation inputs.

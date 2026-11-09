# The wave: measured timings, controlled assumptions, and electrode geometry

## Default

The default uses published human LV wedge endpoint timings from Boukens et al. (2015): subendocardial APD80 360 ms and recovery time 364 ms; subepicardial APD80 317 ms and recovery time 349 ms. Activation times of 4 and 32 ms are derived by subtracting APD from recovery time. They are derived from rounded group means, not individual raw recordings. A common 80 ms display offset leaves every time difference unchanged.

The interior of the strand is linearly interpolated. Its AP waveform is simplified, with no early notch by default, and is not a digitized waveform from that study. This separates the evidence about timing from assumptions about detailed waveform shape. APD80 is exactly the interval from the model's maximum upstroke to its −68 mV recovery crossing, 80% of the −90 to +20 mV excursion.

Source: [Boukens et al., 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4571834/), doi:10.1093/cvr/cvv202. These wedge results are not a claim that every region of the intact human heart recovers in reverse activation order.

## Why the earlier version had a small negative signal at 115 ms

The earlier version added a 5 mV early-repolarization notch to every prescribed AP. The first cells had already fallen from +20 to +15 mV, while the final cell was still at +19.902 mV. The resulting small spatial gradient generated −0.053884 mV with the near-end electrode configuration. That is early repolarization in the imposed waveform, not the much later APD80 recovery event. Removing only the notch makes all cells exactly +20 mV at that instant and makes the computed strand signal exactly zero.

The original loop graphic exaggerated this small current without explaining its visual scale. A later attempt scaled opacity, width and marker size together, making genuine weak recovery currents practically invisible. The current default is explicitly a direction schematic: readable arrows and moving markers show the source-weighted path and conventional-current direction, while the numerical current percentage reports magnitude against one fixed reference. Marker speed is illustrative. Optional “Scaled strength” restores the magnitude-dependent glyph view. Exact-zero current produces no flow glyphs. The EKG calculation is independent of this display choice. A numerical spatial-Vm plot shows voltage differences that a broad cell-color scale can conceal, with its magnification explicitly labeled.

The notch remains available as an optional experiment. When enabled, the original small negative feature reappears. Its current phase is labeled early repolarization, and it is not confused with the final-recovery ordering shown by the timing bars. The 5 mV value is an imposed example, not a measurement from the cited human timing study.

## Why the signal grew as the front approached an end

The forward calculation weights every current source by its distance from each electrode. The original electrodes sat at ±2.15 strand half-lengths; the local lead sensitivity at the strand ends is about 1.96 times its value at the center. The same moving front therefore produces a larger signal near an end. This is a property of this particular near-electrode geometry, not a rule that the ECG grows with the total number of depolarized cells.

The distant default places the electrodes at ±10 strand half-lengths, where end sensitivity is only about 1.03 times center sensitivity. With the optional original notch, moving from 98 ms to 110 ms changes the lead signal by a factor of about 1.68 in the near geometry and 1.02 in the distant geometry. Refining the strand from 81 to 321 points changes these values by less than 0.1%; the effect is not a coarse-grid instability.

Both geometries use the same gain. The distant signal is consequently smaller: approximately 0.042 mV peak versus 1.48 mV near the ends in the human-timing example. These absolute amplitudes have an illustrative scale, not a calibration against an experimental ECG. The external trace axis rescales for readability; that changes the drawing scale, not the computed voltage. No per-geometry voltage normalization is performed.

## Electrical model

The model prescribes APs and activation timing, then calculates axial currents from their spatial voltage differences. The finite-volume source at each point is axial inflow minus axial outflow, with sealed ends. The membrane-source sum is zero. A homogeneous unbounded-conductor kernel converts sources to two extracellular potentials, and their difference is the lead voltage.

This is a reduced forward model, not an ionic propagation solver or a torso conductivity simulation. The cell sheet and current loop are explanatory drawings. The loop is not a calculated extracellular streamline. The separate Lead module explores the extracellular field, and the Whole heart module calculates a ventricular volume integral on a three-dimensional mesh.

Physical background: [Malmivuo & Plonsey, Bioelectromagnetism, Chapter 8](https://www.bem.fi/book/08/08.htm).

## Reproduction

Run `node scripts/check_wave_model.mjs` from the project root. It checks the 115 ms notch ablation, fixed gain across electrode distances, grid refinement, APD80 marker consistency, current balance, uniform-voltage cancellation and recovery-polarity controls. The report is written to `data-source/wave-model/validation.json`.

## Real tissue and the schematic

The cell drawings represent working ventricular cardiomyocytes. Their elongated forms and transverse striations are stylized, with 12 drawn cells in each row sampling the 81-element electrical model. The rows are not a reconstruction of cell orientation across the ventricular wall. In the human preset, A and B stand for inner- and outer-wall timing endpoints.

The “See real microscopy” view includes an original CC0 longitudinal cardiac-muscle photograph, a public-domain TEM of an intercalated-disc gap junction from the NTP Rodent Ultrastructure Atlas, and Romero et al.'s CC BY confocal figure of rabbit Purkinje and working ventricular cells. The confocal figure's lower panels are explicitly identified as the authors' 3D reconstructions. Original image pixels, labels and available scale bars are retained. Species and magnification limitations are stated. Complete asset provenance is in [microscopy provenance](../assets/microscopy/provenance.json).

The loop represents conventional intracellular and extracellular return current. It is not a closed electric-field line or a solved streamline. The extracellular quasi-static electric field is derived from the potential; the schematic loop includes membrane crossings and the intracellular path.

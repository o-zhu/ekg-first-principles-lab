# Shared pathway and muscle activation

## Why another synchronization change was needed

The version 12 guide made a daughter pulse wait for its supplying pulse at each branch junction, and matched its final arrival to the transferred myocardial activation field. That solved disconnected branch timing but did not make the drawn conducting tree the source of myocardial activation.

An audit of the shipped normal-heart geometry at 72 beats/min found intermediate guide-to-nearby-muscle differences up to about 50 ms. The reference activation time also decreased along parts of several rising guide curves. A single forward-moving pulse could not exactly follow that field everywhere. At 0.03× playback, these differences became conspicuous.

There was a second registration problem: the hidden cavity surfaces used to position the tree do not coincide perfectly with every visible inner-wall triangle. A few distal endpoints were about 0.08–0.13 scene units from the displayed wall. Matching an activation time at an off-wall endpoint does not verify what the student sees.

## Physiological relationship being illustrated

The corrected teaching relationship is:

1. A conducted impulse reaches the His–Purkinje system.
2. Fast pathways distribute it to explicit muscle junctions.
3. A short junctional transmission delay precedes the local working-myocyte upstroke.
4. Activation spreads through connected endocardial tissue and outward through the ventricular wall.
5. Each site recovers according to its local activation time and action-potential duration.

The conducting fibers are specialized cardiac muscle cells. They are not nerves, and they are not continuously coupled to every working myocyte alongside their entire length. It is therefore appropriate for an impulse in an insulated trunk to pass nearby muscle that has not yet activated. The critical synchronization checks are at declared delivery junctions and in the ensuing muscle wave.

Human mapping by Durrer and colleagues found several early LV endocardial activation regions. A single universal apex-first origin would misrepresent that finding. The teaching tree retains descending bundles and ascending peripheral fans while allowing distributed early delivery.

The model’s small junction delay is a pedagogical parameter. Rabbit optical mapping demonstrates distinct conducting-fiber and muscle upstrokes and heterogeneous junctional delays; it does not establish a universal human delay or the values in the patients whose ECGs appear here.

## One arrival model, several displays

The teaching tree and muscle use common source-arrival data. Myocardial first-arrival times are prepared on connected anatomical surface edges; the solver does not travel directly across a chamber’s blood pool. The runtime samples the precomputed surface field and adds the modeled outward wall delay.

The surface colors, electrical cutaway, moving fronts, activation map, and working-myocyte voltage rows use the same local activation and waveform evaluator. Newly created cut-face vertices are sampled at their own locations instead of inheriting activation values interpolated across a large cut face from its boundary.

The reference recovery pattern remains an independent modeling constraint. When the coupled teaching activation time changes, local APD is adjusted to retain that reference recovery time before the existing ECG timing adaptation. Recovery is still local activation plus APD; it is not a second impulse traveling backward through the conducting tree.

Overall P/QRS/T timing continues to follow the lesson or recorded-event clock. Independent atrial and ventricular clocks remain necessary in AV block and escape rhythms. Interrupted bundles cannot deliver a fictitious fast pulse. For a blocked bundle, eight selected intact-side septal suppliers per chamber feed short myocardial connections and then connected surface propagation on the affected side. A conservative common entry gate prevents the adapted blocked-side wave from preceding its suppliers. These locations, velocities and duration adaptation are teaching assumptions. Ectopic activation and qualitative tachyarrhythmia mechanisms retain their stated limitations.

### Incoming impulse and preceding recovery are different event clocks

The previous myocardial-event selector could retain a PVC until 25 ms before
the next sinus QRS, suppressing that next beat's earlier His pulse. The older
AF selectors similarly switched ventricular events too late to show the
whole pre-QRS conduction sequence. Extrapolating an escape beat's next RR
interval could also invent a final pulse beyond the recorded events.

The guide now reads a separate `conductionEvent`, selected from actual
scheduled or annotated ventricular events beginning 55 ms before their QRS.
The preceding muscle event keeps its recovery clock. Incoming event identity,
origin, block flags, and linked atrial event determine which pathways may
conduct. No P wave or future QRS is invented to make the display look regular.

## What this does and does not establish

This is a geometrically coupled teaching model, not a patient-specific electrophysiology reconstruction. The anatomical patches, simplified tree, junction selection, propagation speeds, outward wall delay, and reference recovery transfer remain assumptions. Surface geodesics approximate endocardial spread; they do not solve a fiber-resolved volumetric bidomain or monodomain model.

The original clinical recordings are unchanged. The idealized ECGs in Modules 2–4 and the Sandbox retain their prescribed signal models. The native CT fitted RBBB and STEMI views retain their existing source fields, parameters, and forward-calculated ECGs. Improved synchronization of the separate contracting teaching anatomy is not evidence of a better inverse fit to those recordings.

## Verification of the shipped model

The reproducible render audit samples the attributes prepared by the actual
`HeartScene` methods on the shipped anatomical triangles. It also evaluates
the real moving-pulse code. It does not merely compare two metadata tables.

| Check | Result |
| --- | --- |
| Recruiting muscle junctions on the full visible ventricular wall | 205 checked; all lie on the visible wall |
| Additional full-mesh timing error at those junctions | Maximum approximately 0.000012 ms |
| Moving impulse at each declared recruiting junction's arrival | 205 of 205 agree with the declared location |
| Full ventricular cut-face vertices | 1,656; local timing resampled at each new vertex |
| Local-voltage sampling markers and pathway timing | 5 resolved marker positions; 16 atrial/AV/His/Purkinje checks across 45–180 beats/min |
| Reduced software-mesh timing interpolation | Mean 2.56 ms; maximum 6.83 ms |
| Declared bundle-block connections | 16 checked; no intervening wall-boundary crossings |
| Intact supplier precedes blocked-side target | 64 checks across four QRS durations; all pass |
| Incoming-event transitions | 161 His samples, 147 bundle samples, 520 blocked or suppressed states |
| CPU versus actual compiled scene shader | 80 cases; maximum voltage difference below 0.001 mV |
| Clinical chart gain, bounds, paging and seeking | 25 records; 1,300,200 sample/gain checks; 177 windows; 885 seeks |

The timing interpolation errors are **additional rendering errors**, not the
intended fiber-to-muscle delay. That delay is 3 ms in the reference graph and
is adapted with the displayed QRS duration. It is not a measured human
constant. The reduced software anatomy is decimated and therefore retains a
small visual interpolation error; its existing section generator also lacks
a ventricular cap, so cap validation is explicitly unavailable for that
fallback. The full WebGL cutaway contains the tested cap.

The audit pins the coupling asset and source-anatomy hashes in
`data-source/conduction-render-audit.json` within the research download. Run
`node scripts/check-conduction-render.mjs --write` to regenerate it. The
continuity check's `--coupled` mode tests the new model; its default mode
continues to test the transferred-field fallback. Event-transition checks
run in both modes. These are numerical and geometric checks of a teaching
implementation, not validation against a patient's intracardiac recordings.

## Clinical 12-lead readability

The original-recording grid now uses a common user-controlled gain. At the default 10 mm/mV setting, one millivolt spans 50 display pixels, compared with 8.5 previously. A default 2.5-second stationary window replaces the compressed 10-second overview; 5-second and full-record views remain available.

All displayed leads share the same time interval, zero line, and gain. No per-lead normalization changes their relative amplitudes. Row height accounts for the full recording’s extrema, so changing windows does not rescale the waveform or silently clip isolated large complexes. Clicking, dragging, keyboard seeking, and window navigation use the actual recording time.

## Primary sources

- Durrer D, et al. *Total excitation of the isolated human heart.* Circulation. 1970;41:899–912. https://doi.org/10.1161/01.CIR.41.6.899
- Stephenson RS, et al. *High resolution 3-Dimensional imaging of the human cardiac conduction system from microanatomy to mathematical modeling.* Scientific Reports. 2017. https://www.nature.com/articles/s41598-017-07694-8
- Choi BR, Ziv O, Salama G. *Conduction delays across the specialized conduction system of the heart: Revisiting atrioventricular node (AVN) and Purkinje-ventricular junction (PVJ) delays.* 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10154624/

The retained recovery-template and human recovery-map sources are documented in the site’s model notes and [electrical atlas provenance](../electrical-atlas.json).

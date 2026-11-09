# Conduction-guide continuity refinement

**Historical version 12 audit.** The endpoint-only guide described below was subsequently replaced in the teaching anatomy by a shared pathway-and-muscle activation model. See [Shared pathway and muscle activation](./PATHWAY_MUSCLE_SYNCHRONIZATION.md) for the current behavior and limitations. The historical results below explain the earlier branch-continuity fix; they do not establish full muscle synchronization.

## Scope and baseline

This refinement changes the shared registered conduction-guide animation used by Modules 2–6. The comparison baseline is published commit `6ebbe8775fad436fe09f5544ef9d2dd2097a0c86`. Module 1, the myocardial activation/APD atlas, membrane-voltage evaluator, ordinary teaching ECG signals, and fitted forward ECG calculations are unchanged by this refinement.

The prior guide assigned each Purkinje route and twig an independent start time, then adjusted its finish to the mapped activation time at its distal target. It did not require the supplying pulse to reach a branch junction before that branch started. On the shipped cavity geometry at 72 bpm, 7 of 21 normal ventricular twigs started more than 3 ms early and 7 started more than 3 ms late. The largest early start was **12.9915 ms** (`left-twig-1-3`), approximately 0.43 seconds on screen at 0.03× playback.

## Timing and geometry rule

Each daughter path now stores its supplying `parentId` and geometric `parentFraction`. Its origin coincides with that point on the parent curve. A child starts at the parent's interpolated arrival time at that junction, translated between the independent event clocks when necessary:

```text
child.start = parent.arrivalAt(parentFraction)
              + child.currentClock − parent.currentClock
```

Intact bundle routes retain their specified guide travel duration. Distal routes and twigs finish at their local mapped myocardial activation time when feasible:

```text
child.end = max(mappedTargetAT, child.start + 0.0001 seconds)
endpointMismatch = child.end − mappedTargetAT
```

The 0.1 ms floor only ensures a positive numerical travel interval; it is not a measured physiological delay or a fitted conduction velocity. If a registration is incompatible with this causal tree, its delivery is late and its `schedule.endpointMismatch` records that discrepancy. Activation in the myocardial field is not moved to conceal it. In the tested intact paths, the floor introduces **no endpoint mismatch**.

The fourth left Purkinje route now joins the same apical supply as the other left routes. Both bundle routes meet the supplying His pulse continuously. The left atrial daughter starts when the Bachmann guide reaches its actual junction. A known conducted atrial event supplies the upcoming pre-QRS guide through its explicit event link; independent AV-block and escape clocks remain independent.

## Bundle-block representation

In the old RBBB animation, the illustrative septal crossing reached the mapped RV apical point at about 109 ms, although several mapped distal RV targets activated at 79–87 ms. That curve therefore could not be the causal source of those targets.

The unsupported septal-crossing curves and blocked-side fast-tree pulses have been removed. Interrupted distal guide anatomy remains quiet amber; the existing delayed mapped myocardial field displays recruitment on that side. No patient-specific crossing tract, retrograde Purkinje recruitment sequence, or replacement activation source is inferred from these timings. The intact side retains its causal guide animation.

## Reproduce the original largest early handoff

Run from the repository root. The coordinates below are the unchanged distal endpoint of `left-purkinje-1`, projected onto the shipped `heart-medium.glb` cavity surface. The formula reproduces its baseline schedule and the baseline start of its third twig:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import {installElectricalField,electricalTimingAt} from './dist/electrical-field.js';
const raw=fs.readFileSync('./dist/data/electrical-atlas.f32');
installElectricalField(JSON.parse(fs.readFileSync('./dist/data/electrical-atlas.json')),
  new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
const target=[0.10000000000000003,-0.2899999999999999,-0.29647124750007875];
const end=electricalTimingAt(target,{qrsStart:0,qrsEnd:.09,tStart:.20,tEnd:.38,
  lvWeight:1,transmuralDepth:0,lvDelay:0,rvDelay:.008}).activation;
const parentStart=-.027+.020+.0018;
const twigStart=-.027+.020+.001+.75*.025+.0018;
const parentArrival=parentStart+.75*(end-parentStart);
console.log({mappedParentEndMs:1000*end,twigStartMs:1000*twigStart,
  parentArrivalMs:1000*parentArrival,handoffErrorMs:1000*(twigStart-parentArrival)});
NODE
```

Expected values: parent target 38.4553 ms; twig start 14.5500 ms; supplying pulse arrival 27.5415 ms; handoff error **−12.9915 ms**. The baseline endpoint-cap rule is inactive for this example.

## Reproduce current validation

```bash
node scripts/check-conduction-continuity.mjs
node scripts/check-electrical-events.mjs
node scripts/check-electrical-field.mjs
git diff --check
```

The continuity test reads the shipped cavity meshes and atlas. It checks actual pulse positions at handoff times after cardiac point deformation, not only schedule metadata.

| Validation | Result |
|---|---:|
| Geometric parent–child junctions | 31 |
| Pulse handoffs across normal/RBBB/LBBB at 45, 72, 120 and 180 bpm | 252 |
| Maximum handoff timing error | 3.7 × 10⁻¹³ ms |
| Maximum deformed spatial handoff difference | 1.5 × 10⁻¹⁴ scene units |
| Intact target checks across those synthetic rhythms | 224 |
| Additional real-record timing adaptations checked | 2,292 |
| Maximum tested intact endpoint mismatch | 0 ms |
| Blocked-side pulse-suppression states | 816 |

A deliberately incompatible target verifies positive travel and an explicit nonzero mismatch. The existing event tests also pass for dropped atrial events, independent complete-block clocks, junctional escape, PVC/ventricular-escape suppression, and qualitative AF atria with a timed ventricular reference. Existing shared-field/AP-row tests remain unchanged and pass.

## Interpretation limits

This is a causal **teaching guide registered to a reference anatomy**, not a segmented or solved patient Purkinje network. The imported myocardial field uses a fast endocardial surrogate, not this explicit tree. A pulse's agreement with a mapped distal target does not establish agreement at every intermediate point or a validated local conduction velocity. Myocardial recovery remains determined by local activation time and action-potential duration; it is not animated as a pulse returning through these fibers. The guide does not generate the adjacent ordinary teaching ECG, and this change does not improve or revalidate the separate fitted ECG model by itself.

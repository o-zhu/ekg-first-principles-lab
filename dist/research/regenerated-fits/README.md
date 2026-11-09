# Regenerated clinical propagation fits

## What was recovered and what was rebuilt

The package retains the original recorded ECG samples and the two detailed
RBBB (`ptbxl-03155`) and anterior STEMI (`acs-00004`) fitting experiments.
Their case JSON files were recovered from the published release unchanged.
The other 22 case fits were newly regenerated from the recovered recordings,
source code, anatomy, and physical torso operator. They are a reproducible
replacement for lost derived assets, not a byte-for-byte recovery of a former
release or a claim to reproduce its earlier numerical results.

Every clinical example now has a comparison between recorded voltage and an
explicit source-field hypothesis. Some hypotheses fit poorly. In particular,
complex atrial or ventricular arrhythmias cannot be identified from these few
surface channels. The displayed residuals and held-out metrics are part of the
result; they must not be interpreted as validated patient activation maps.

## Physical model and numerical calculation

The original CT-derived Rodero anatomy was rebuilt from the public,
checksum-pinned archive. The original preparation script verified all 11
canonical input arrays. The electrical geometry contains 340,582 native nodes
and 1,562,432 tetrahedra. The original finite-torso reciprocal operator
integrates myocardial transmembrane voltage at 2,400,926 native and
edge-midpoint quadrature sites. All signed source weights are retained.

The forward model has the form

`ECG_lead(t) = sum_j W[j, lead] * Vm[j, t]`.

The original operator uses the quasi-static volume-conductor formulation; its
weights already include spatial gradients, tissue conductivity, and the
reciprocal lead field. This is not a sum of visible colored pixels or a claim
that an ECG electrode measures intracellular membrane voltage directly.
The native operator's constant-Vm nullspace is checked during reconstruction.

Activation uses the original anisotropic graph travel maps from anatomical
delivery sites. Local action potentials use the original normalized human
ventricular optical template and atrial template, with bounded duration and
amplitude assumptions. Spatial grouping into 3,845 cells accelerates the
initial optimization while preserving every signed operator weight. A native
node refinement is followed by export with the full 2.4-million-site operator.
The exported histogram uses 0.75 ms activation and 3 ms AP-duration bins.
Seven independent direct all-source matrix products check the selected curve
against the same source fields. A single constant per lead aligns their
reference levels; no time-dependent correction is permitted.

Three source experiments are exported per ordinary case: an aligned reference,
a pathology-constrained field, and a native-node refinement. VF and torsades
each retain two regional rotating-wave candidates. Some ventricular-origin
cases also test three focus seeds internally before selecting a candidate.
There are 64 newly exported candidate approaches across the 22 regenerated
cases. These searches are deliberately bounded; they are less extensive than
the retained RBBB and anterior STEMI studies.

## Physiological constraints and their limits

For regular beats without documented AV block, the nominal atrial-to-ventricular
source-timing delay is constrained to 100–230 ms. The healthy, sinus
bradycardia, and sinus tachycardia cases use the narrower 120–210 ms range.
First-degree AV block uses 205–370 ms. These are nominal model timing priors,
not independently measured ECG PR intervals. Local graph travel and sampled
source positions can shift the actual first-activation gap by several
milliseconds. The priors prevent improving waveform error by assigning a
prolonged nominal AV delay to the healthy example. Parameters
near a declared search bound are reported explicitly in each case's
`parameterBoundaryFlags` and `physiologyNote`.

LBBB removes direct left-ventricular delivery; the Mobitz II record's associated
right bundle delay removes direct right-ventricular delivery. Axis-pattern
candidates alter the corresponding fascicular delivery subset. These are
mechanistic hypotheses, not proof that a particular fascicle caused an axis
shift. High-voltage/hypertrophy examples adjust source and recovery parameters
on a generic anatomy; the model does not infer the patient's wall thickness.

PVC and VT compare a bounded set of ventricular-origin trajectories. The PVC
has a separate ectopic stream; regular atrial anchors exclude that PVC anchor,
so the model does not invent a P-wave synchronized to the ectopic event. A
complete measured P-wave series is unavailable. Complete block uses an
independent illustrative atrial clock rather than coupling P-waves to escape
beats. This prior is disclosed in that case.
For SVT, the atrial phase can represent activation in a neighboring cycle or
retrograde timing; the fitted cycle phase does not identify the circuit or a
physiological PR interval.

Ischemia candidates combine depolarized rest, reduced action-potential
excursion, shortened action-potential duration, and slower activation in a
smooth regional territory. These directions are supported by physiological
research, but this recording does not separately identify their magnitudes.
A fixed 60:40 rest/plateau attribution is an explanatory prior. Constant
baseline subtraction makes that attribution non-identifiable. An ischemia
label is not converted into electrically inert scar. Boundary-limited injury
duration/delay parameters indicate model constraints and unresolved mismatch,
not a measured infarct property.

AF, flutter, VF, and torsades use explicitly described regional timing or
rotating-wave hypotheses. They are not coupled ionic-tissue PDE solutions.
Human mapping studies show diverse organized and disorganized mechanisms;
these few surface leads do not establish the specific illustrated circuit.
Poor held-out waveform agreement remains visible, including unsuccessful
torsades/VF fits.

## Targets, references, and validation partitions

For stable rhythms, complete beats are aligned at existing common QRS anchors
and divided into alternating training and held-out sets before constructing
their medians. No independent P/T warping or morphology rejection is applied.
The common-time baseline window is documented in each asset and is only an
approximate initialization reference. The interquartile band describes beat
variation and noise, not anatomical uncertainty. Existing visualization
anchors are not presented as newly validated clinical interval measurements.

For irregular rhythms, conduction block, PVC, and tachyarrhythmias, the target
remains an unaveraged recording window. One constant training-window median
is removed per channel; no extra waveform filter or ST-segment correction is
applied. The first 65% of the displayed window fits parameters; the remaining
35% tests conditional waveform agreement. PVC uses 88%/12% so its single
ectopic beat is fitted, with an explicit warning that no independent ectopic
beat validates the focus. Torsades uses the source-identified 8–14 s segment;
the full recording remains in the original-recording view.

Ventricular event times, when available, are supplied from source annotations
or existing visualization anchors in both partitions. Thus the held-out
score is conditional on the supplied event clock; it does not test prediction
of future beat timing or arrhythmia onset. VF/TdP frequency initialization
uses training waveform samples only. Held-out waveform values do not select
the model. Same-record repeatability is not independent-patient validation.

Unknown ECG1/ECG2 or modified-limb channels retain their original channel
names. A fixed three-dimensional nuisance projection of physical lead-field
components is fitted on training samples only and then reused for the
holdout. The model does not invent absent standard leads or measured electrode
axes. All twelve leads are fitted jointly only where all twelve were recorded;
independent standard leads determine the multichannel objective.

The original raw signals are unchanged. Linearly interpolated display or
optimization grids do not create additional measurement resolution.

## Reproduce

Python 3.10+ is required with `numpy`, `scipy`, `threadpoolctl`, and `vtk`.
Use an isolated working directory with several GB of free space. The first
run downloads the public 58 MB checksum-pinned source anatomy and rebuilds
the original operator; subsequent runs reuse its cache.

From the website directory:

```sh
python3 research/regenerated-fits/reproduce.py --work-dir ../ekg-fit-work
```

To rerun one new case with completed operators:

```sh
python3 research/regenerated-fits/reproduce.py --work-dir ../ekg-fit-work --skip-operators --case ptbxl-00303
```

The wrapper extracts the bundled original source releases into the chosen
working directory, checks archive paths, copies the new generator and event
metadata, rebuilds the physical operator, and runs the bounded fitting job.
It writes only new case assets and reconstruction summaries. The original two
deep-fit cases are explicitly excluded. The manifest is a packaged index;
rerunning one case does not silently change the list of available records.

`clinical-events.json` preserves the source-derived or existing lesson timing
metadata used in this reconstruction. `scripts/regenerate_all_cases.py` is
the exact generator. `summary.json` gives the final exported errors and
numerical checks. The original source releases remain at
`cardiac-voltage/data/heart-model-reproducible-source.zip` and
`data/pathology-fits/propagation-research.zip`. Heavy intermediate caches are
rebuildable and intentionally excluded from the website package.

## Primary sources

- Rodero et al., four-chamber cardiac anatomy and modeling:
  https://doi.org/10.1371/journal.pcbi.1008851
- Public source anatomy, CC BY 4.0:
  https://zenodo.org/records/4593739
- Gillette et al., whole-heart electrophysiology and bundle branch block:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC9539798/
- Ionic mechanisms of ST-segment elevation during acute myocardial infarction:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/
- Di Diego and Antzelevitch, ischemic cellular action-potential changes:
  https://pubmed.ncbi.nlm.nih.gov/14716579/
- Optical mapping of ventricular fibrillation in isolated human hearts:
  https://pubmed.ncbi.nlm.nih.gov/17369453/
- Human VF, Purkinje triggers and myocardial substrate:
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8934691/
- Human ventricular optical recordings used by the original template:
  https://zenodo.org/records/3986725

Recording-specific dataset URLs, original record identifiers, labels, and
licenses remain in every clinical record and each fitted asset's provenance.

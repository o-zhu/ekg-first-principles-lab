# Pharmacology reference

This optional reference is opened from **Explore pharmacology** in the membrane
chapter, or from a medicine selected in the existing channel structure popup.
It contains 21 medicines, a rotatable target view, structural provenance, and a
baseline-versus-medicine comparison of qualitative single-cell action potentials.

## Evidence and visual conventions

The content and 27 source URLs are in `data/pharmacology-content.json`.
`pharmacology-data.js` exports the same content for the static application.
The sources are prescribing information, original experimental papers, and
Protein Data Bank records. No dose, concentration, treatment recommendation, or
patient-specific response is calculated.

Seven medicines have deposited ligand coordinates in this package:

| Medicine | PDB | Experimental preparation |
| --- | --- | --- |
| Quinidine | 6LQA | Human NaV1.5 |
| Flecainide | 6UZ0 | Rat NaV1.5 construct |
| Propafenone | 7FBS | Engineered open-state rat NaV1.5 construct |
| Verapamil | 6JPA | Rabbit CaV1.1, a homolog of cardiac CaV1.2 |
| Diltiazem | 6JPB | Rabbit CaV1.1, a homolog of cardiac CaV1.2 |
| Digoxin | 7DDH | Pig Na+/K+-ATPase |
| Adenosine | 6D9H | Human A1 receptor construct in a Gi complex |

The eighth reference, hERG 5VA1, is drug-free. Its complete tetramer is rebuilt
from the deposited biological-assembly operators. A broad highlight represents
the functionally supported pore region containing Y652 and F656; it is not an
atomically resolved pose for dofetilide, sotalol, amiodarone, or dronedarone.
When a sodium-blocking medicine lacks a deposited pose in this package, the
quinidine reference protein is used with quinidine hidden and an explicitly
labeled regional highlight.

The potassium popup starts with KCNQ1/KCNE1 (IKs), as in the original lesson.
Selecting an IKr medicine switches to hERG, with the distinction explained in
the interface. Beta blockers are illustrated at receptors with downstream cAMP
signaling, rather than drawn inside a channel pore. Magnesium is illustrated as
a distributed ionic mechanism. Ibutilide's slow inward current mechanism is
distinguished from a simple potassium-pore-block cartoon.

The protein views use resolved C-alpha coordinates, deposited helix annotations,
and ligand heavy atoms/bonds. Missing residues remain gaps. The protein and
ligand receive the same rigid coordinate transformation. Camera rotation and
zoom do not imply molecular dynamics, docking, or an affinity calculation.
The UI identifies species, engineered constructs, and homolog structures.

## Reproduction

Download the eight public PDB files from the `sourceUrl`/`downloadUrl` records in
`data/pharmacology/*.json`. Then, from the website project root, run:

```sh
python3 scripts/build-pharmacology-structures.py /path/to/public-pdb-downloads
```

The source PDB hashes and extraction notes are recorded in the generated assets.
The action-potential equations are in `pharmacology-ap.js`; their shape
parameters are illustrative, not calibrated drug-response measurements.

## Verification during reconstruction

- All modified JavaScript modules passed syntax checks.
- 100,926 action-potential samples (21 medicines, two cell types, three effect
  levels, and 801 time points) were finite and within the teaching chart range.
- Mechanism checks confirmed that the ventricular beta-blocker curves overlap,
  class Ic slows the fast upstroke, IKr block prolongs repolarization, and the
  magnesium example reduces an EAD without automatically shortening APD.
- All eight structural assets passed coordinate, annotation-length, and
  ligand-bond-index checks; hERG contains four pore subunits.
- Browser checks in the full Module 1 iframe confirmed explorer opening,
  quinidine rendering, binding-site focus, AP chart rendering, effect control,
  time scrubbing, and automatic nodal view for metoprolol. At zero effect the
  baseline and medicine SVG paths were identical.
- The channel-popup handoff was verified with flecainide (6UZ0), including the
  experimental homolog label and selected-medicine context in the comparison.
  Selecting dofetilide correctly switched the original potassium structure to
  the hERG reference (5VA1) and displayed the regional-evidence caveat.
- Responsive styles are provided; a dedicated mobile viewport was not available
  in this browser QA session.

Content JSON SHA-256:
`fad00b53b75ebaef43b7358660964d257b4897588be9f5305a726e74e406b601`

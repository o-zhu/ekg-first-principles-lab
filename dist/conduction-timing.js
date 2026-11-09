/**
 * Shared, representative normal conduction clock (seconds).
 * Dhingra et al., Chest 1973;64:55–59, DOI 10.1378/chest.64.1.55:
 * 61 people without ECG evidence of conduction disease; mean H–V 43 ms.
 * Lee & Lien, Chest 1975;67:696–701, PMID 1126224: normal subgroup mean
 * H–V 45 ms, His potential duration 19 ms. These local AP samples are not
 * clinical intracardiac electrograms or measurements of a patient's HV.
 */
export const CONDUCTION_TIMING=Object.freeze({
  saBeforeP:.028,
  atrialProbeAfterP:.014,
  atrialToAVDuration:.070,
  hisPathRelativeToQRS:-.049,
  hisPathSpan:.022,
  hisProbeRelativeToQRS:-.043,
  bundleRelativeToQRS:-.027,
  leftBundleSpan:.020,
  rightBundleSpan:.022,
  purkinjeProbeRelativeToQRS:-.007,
  // Numerical monotonicity floor for registered teaching-guide segments;
  // this is not a measured conduction delay or a fitted tissue velocity.
  guideMinimumTravel:.0001
});

// This mild rate prescription is shared by the AP row and its pathway guide;
// it is a display model, not an AV-nodal restitution or autonomic model.
export const atrialConductionScale=rr=>Math.min(1,Math.sqrt(Math.max(.3,rr||60/72)/(60/72)));

export const CONDUCTION_TIMING_SOURCES=Object.freeze([
  {title:'Dhingra, Rosen & Rahimtoola (1973) · Normal conduction intervals in 61 patients',url:'https://doi.org/10.1378/chest.64.1.55'},
  {title:'Lee & Lien (1975) · Human His and left bundle potentials',url:'https://pubmed.ncbi.nlm.nih.gov/1126224/'}
]);

import {electricalTimingAt} from './electrical-field.js';

/**
 * A spatial teaching model of ventricular activation and local recovery.
 *
 * Recovery is activation time + local APD90. It is NOT an impulse sent back
 * along the Purkinje network, nor a patient-specific inverse ECG solution.
 * Normal endocardial-to-epicardial activation is partly offset by a shorter
 * epicardial action potential. The chosen example has earlier apical and RV
 * recovery, but neither gradient is universal in healthy human hearts.
 *
 * Human evidence: Ramanathan et al. 2006 (PMID 16606830), Boukens et al. 2015
 * (PMID 26209251), Opthof et al. 2017 (PMID 27737802), and Sobota et al. 2025
 * (PMID 40434181). These studies motivate the ordering and modest dispersion;
 * the recovery reference is projected from the imported Module 1 CT model.
 * Local APD is adjusted when the shared pathway model changes activation,
 * then the timing is adapted to the displayed ECG. This is not patient registration.
 */
export const RECOVERY_MODEL=Object.freeze({
  description:'Recovery follows each cell\'s activation time plus its local action-potential duration. Ventricular activation is coupled to the teaching conduction network; local APD is adjusted to retain the projected Module 1 CT recovery pattern and imported human-optical ventricular waveform. The network, coordinate transfer and ECG timing adaptation are model assumptions, not a recovered patient map. Human recovery patterns vary; the T wave comes from spatial voltage differences, not an impulse returning through the conduction tree.',
  sources:Object.freeze([
    {title:'Ramanathan et al. (2006) · Activation and repolarization of the normal human heart',url:'https://pubmed.ncbi.nlm.nih.gov/16606830/'},
    {title:'Boukens et al. (2015) · Transmural APD gradient synchronizes human ventricular recovery',url:'https://pubmed.ncbi.nlm.nih.gov/26209251/'},
    {title:'Opthof et al. (2017) · Activation–repolarization patterns in intact human hearts',url:'https://pubmed.ncbi.nlm.nih.gov/27737802/'},
    {title:'Sobota et al. (2025) · Human apicobasal repolarization gradients and age',url:'https://pubmed.ncbi.nlm.nih.gov/40434181/'}
  ])
});

// Paired vertices on the actual source LV free wall, behind the anterior
// section plane. Depth is the SAME educational cavity-distance attribute used
// by the myocardium shader, rather than an unrelated inner/outer label.
export const VENTRICULAR_AP_SITES=Object.freeze({
  'ventricular-endo':Object.freeze({position:Object.freeze([.960959971,-.827199996,.243521005]),lvWeight:1,transmuralDepth:.022546265}),
  'ventricular-epi':Object.freeze({position:Object.freeze([1.145141959,-.769400001,.269941002]),lvWeight:1,transmuralDepth:.965039432})
});

// Compatibility entry point used by the selected myocardial AP rows. The same
// spatial reference and duration warp now drives the intact wall and cut face.
export function ventricularTimingAt(position,options={},out={}){
  return electricalTimingAt(position,options,out);
}

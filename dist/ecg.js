/**
 * Original educational ECG model. All times are seconds; signal amplitudes mV.
 * Limb leads share rotating equivalent dipoles and obey Einthoven/Goldberger
 * identities exactly. Chest leads use illustrative regional sensitivities to
 * teach normal R-wave progression, not a patient-specific volume-conductor solve.
 * The frontal-axis control applies to limb leads; chest morphology is held fixed.
 * Regional omission removes a mathematical term, not living tissue or a disease.
 */

export const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

const norm = (v) => { const n = Math.hypot(...v); return v.map(x => x / n); };
const SQRT3_2 = Math.sqrt(3) / 2;
export const LEAD_INFO = {
  I: {title:'Lead I', formula:'LA − RA', description:'Left arm compared with right arm. A leftward frontal view.', axis:0, direction:[1,0,0], plane:'frontal'},
  II: {title:'Lead II', formula:'LL − RA', description:'Left leg compared with right arm. The normal ventricular vector often points toward this lead.', axis:60, direction:[0.5,-SQRT3_2,0], plane:'frontal'},
  III: {title:'Lead III', formula:'LL − LA', description:'Left leg compared with left arm. An inferior frontal view.', axis:120, direction:[-0.5,-SQRT3_2,0], plane:'frontal'},
  aVR: {title:'Lead aVR', formula:'RA − (LA + LL) / 2', description:'Right arm compared with the average of left arm and left leg. Usually predominantly negative in normal sinus rhythm.', axis:-150, direction:[-SQRT3_2,0.5,0], plane:'frontal'},
  aVL: {title:'Lead aVL', formula:'LA − (RA + LL) / 2', description:'Left arm compared with the average of right arm and left leg. A superior-left frontal view.', axis:-30, direction:[SQRT3_2,0.5,0], plane:'frontal'},
  aVF: {title:'Lead aVF', formula:'LL − (RA + LA) / 2', description:'Left leg compared with the average of both arms. An inferior frontal view.', axis:90, direction:[0,-1,0], plane:'frontal'},
  V1: {title:'Lead V1', formula:'V1 electrode − WCT', description:'Fourth intercostal space, right sternal border. Normal QRS often has a small r followed by a deeper S.', placement:'4th intercostal space · right sternal border', direction:norm([-0.45,-0.05,0.89]), plane:'precordial'},
  V2: {title:'Lead V2', formula:'V2 electrode − WCT', description:'Fourth intercostal space, left sternal border. An anterior view of the same electrical events.', placement:'4th intercostal space · left sternal border', direction:norm([-0.18,-0.05,0.98]), plane:'precordial'},
  V3: {title:'Lead V3', formula:'V3 electrode − WCT', description:'Halfway between V2 and V4. Often near the transition from predominantly negative to positive QRS.', placement:'Halfway between V2 and V4', direction:norm([0.25,-0.20,0.95]), plane:'precordial'},
  V4: {title:'Lead V4', formula:'V4 electrode − WCT', description:'Fifth intercostal space, left midclavicular line. Place V4 before positioning V3.', placement:'5th intercostal space · left midclavicular line', direction:norm([0.65,-0.30,0.70]), plane:'precordial'},
  V5: {title:'Lead V5', formula:'V5 electrode − WCT', description:'Left anterior axillary line, at the same horizontal level as V4. A left lateral view.', placement:'Anterior axillary line · level with V4', direction:norm([0.91,-0.20,0.35]), plane:'precordial'},
  V6: {title:'Lead V6', formula:'V6 electrode − WCT', description:'Left midaxillary line, at the same horizontal level as V4. Usually a predominantly positive QRS.', placement:'Midaxillary line · level with V4', direction:norm([0.98,-0.20,0.05]), plane:'precordial'},
};

export const REGIONS = [
  {id:'atria', title:'Atrial myocardium', color:'#69d4c8', description:'Activation spreads through both atria, contributing the P wave.'},
  {id:'septum', title:'Early septal activation', color:'#f1cc77', description:'Early left-to-right septal activation contributes the first part of QRS.'},
  {id:'lv', title:'Left ventricular wall', color:'#f28b8b', description:'The large left ventricular muscle mass strongly influences the main QRS.'},
  {id:'rv', title:'Right ventricular wall', color:'#a69ef4', description:'Right ventricular activation overlaps the larger left ventricular contribution.'},
  {id:'basal', title:'Late ventricular activation', color:'#edb37b', description:'Late activation of basal regions helps shape the end of QRS.'},
  {id:'recovery', title:'Ventricular recovery', color:'#91cfa5', description:'Spatial differences in recovery timing generate the T wave.'},
];

export const MODEL_NOTES = {
  simulation:'Idealized sinus rhythm · original teaching simulation · not a patient recording',
  regional:'Colored contributions are prescribed teaching components. Hiding one removes a mathematical term; it does not simulate ablation or diagnose disease.',
  precordial:'Chest-lead morphology uses illustrative regional sensitivities, not a patient-specific forward solution. The frontal-axis control affects limb leads only.',
  reference:'WCT = (RA + LA + LL) / 3. This is a computed reference potential, not an electrode inside the heart. The right-leg electrode is not part of WCT.',
};

const rate = value => Number.isFinite(Number(value)) ? Math.max(45,Math.min(120,Number(value))) : 72;
const radians = deg => deg * Math.PI / 180;
const wrap = (t,rr) => ((Number(t) || 0) % rr + rr) % rr;

/** Fiducials and durations are seconds, including both QTc values. */
export function getFiducials(bpm=72) {
  const hr=rate(bpm), rr=60/hr, baseRR=60/72;
  const pStart=0.08*Math.min(1,rr/baseRR);
  const pEnd=pStart+0.1*Math.pow(72/hr,0.15);
  const pr=0.16*Math.pow(72/hr,0.12), qrs=0.09;
  const qrsStart=pStart+pr, qrsEnd=qrsStart+qrs;
  const qt=0.38*Math.sqrt(rr/baseRR);
  const tEnd=qrsStart+qt, tStart=tEnd-0.18*Math.sqrt(rr/baseRR);
  // Individual Q/R/S peak anchors describe the default lead-II morphology.
  // For another lead use onset/offset labels; deflection names depend on sign.
  const pPeak=(pStart+pEnd)/2, qPeak=qrsStart+0.014,
    rPeak=qrsStart+0.041, sPeak=qrsStart+0.075, tPeak=(tStart+tEnd)/2;
  return {rr,pStart,pEnd,qrsStart,qrsEnd,tStart,tEnd,pr,qrs,qt,
    pPeak,qPeak,rPeak,sPeak,tPeak,
    qtcB:qt/Math.sqrt(rr),qtcF:qt/Math.cbrt(rr)};
}

// C1-continuous, compact-support bump. Onsets and offsets really are zero.
const bump = (t,a,b) => t<=a || t>=b ? 0 : Math.sin(Math.PI*(t-a)/(b-a))**2;

function pulses(t,f) {
  const q=f.qrsStart;
  return {
    atria:bump(t,f.pStart,f.pEnd),
    septum:bump(t,q,q+0.028),
    lv:bump(t,q+0.018,q+0.064),
    rv:bump(t,q+0.016,q+0.066),
    basal:bump(t,q+0.060,f.qrsEnd),
    recovery:bump(t,f.tStart,f.tEnd),
  };
}

// Frontal angles at the default mean axis of +60 degrees. The amplitudes are
// normalized to the intended regional peak values in lead II at that axis.
const DIPOLES = {
  atria:{angle:60,strength:0.15},
  septum:{angle:-150,strength:0.12/SQRT3_2},
  lv:{angle:60,strength:0.84},
  rv:{angle:100,strength:0.16/Math.cos(radians(40))},
  basal:{angle:-100,strength:0.20/Math.cos(radians(20))},
  recovery:{angle:50,strength:0.28/Math.cos(radians(10))},
};

const CHEST = {
  V1:{atria:0.05,septum:0.08,lv:-0.58,rv:0.12,basal:-0.025,recovery:-0.07},
  V2:{atria:0.10,septum:0.12,lv:-0.60,rv:0.18,basal:-0.05,recovery:0.15},
  V3:{atria:0.12,septum:0.06,lv:0.34,rv:0.16,basal:-0.38,recovery:0.26},
  V4:{atria:0.14,septum:-0.04,lv:0.91,rv:0.10,basal:-0.19,recovery:0.32},
  V5:{atria:0.13,septum:-0.06,lv:1.03,rv:0.06,basal:-0.10,recovery:0.30},
  V6:{atria:0.10,septum:-0.06,lv:0.84,rv:0.05,basal:-0.035,recovery:0.25},
};

function validLead(lead) {
  return LEADS.find(x=>x.toLowerCase()===String(lead).toLowerCase()) || 'II';
}

function limbValue(x,y,lead) {
  const I=x, II=0.5*x-SQRT3_2*y;
  switch(lead) {
    case 'I':return I;
    case 'II':return II;
    case 'III':return II-I;
    case 'aVR':return -(I+II)/2;
    case 'aVL':return I-II/2;
    case 'aVF':return II-I/2;
    default:return II;
  }
}

/** Per-region signed voltage contributions in mV; axis is in degrees. */
export function regionalContributions(t,lead='II',bpm=72,axis=60) {
  const f=getFiducials(bpm), local=wrap(t,f.rr), p=pulses(local,f);
  const selected=validLead(lead), out={};
  if(CHEST[selected]) {
    for(const id of Object.keys(p)) out[id]=p[id]*CHEST[selected][id];
    // A small biphasic P in V1: early right-atrial and late left-atrial influence.
    if(selected==='V1') {
      const mid=(f.pStart+f.pEnd)/2;
      out.atria=0.06*bump(local,f.pStart,mid+0.01)-0.04*bump(local,mid-0.01,f.pEnd);
    }
    return out;
  }
  const rotation=(Number.isFinite(Number(axis))?Number(axis):60)-60;
  for(const id of Object.keys(p)) {
    const d=DIPOLES[id], angle=radians(d.angle+rotation);
    const magnitude=p[id]*d.strength;
    out[id]=limbValue(magnitude*Math.cos(angle),-magnitude*Math.sin(angle),selected);
  }
  return out;
}

/** A missing key is enabled; setting enabled[id] === false omits that term. */
export function sampleECG(t,lead='II',bpm=72,enabled=null,axis=60) {
  const parts=regionalContributions(t,lead,bpm,axis);
  let result=0;
  for(const id of Object.keys(parts)) if(enabled===null || enabled[id]!==false) result+=parts[id];
  return result;
}

/** Phase labels share the exact timebase and fiducials used by the waveform. */
export function phaseAt(t,bpm=72) {
  const f=getFiducials(bpm), local=wrap(t,f.rr);
  const phases=[
    ['rest','Between beats','The myocardium is resting; there is little net surface voltage difference.',0,f.pStart],
    ['atria','P · atria activate','Activation spreads from the sinus node through the right and left atria.',f.pStart,f.pEnd],
    ['av','PR segment · conduction slows','AV conduction delays ventricular activation. The full PR interval also includes the P wave.',f.pEnd,f.qrsStart],
    ['septum','Early QRS · septum activates','Early septal activation travels left to right. Its sign depends on the selected lead.',f.qrsStart,f.qrsStart+0.028],
    ['ventricles','QRS · ventricular walls activate','Rapid conduction coordinates both ventricles; left ventricular mass strongly influences the net signal.',f.qrsStart+0.028,f.qrsStart+0.060],
    ['basal','Late QRS · activation completes','Late ventricular regions finish depolarizing and shape the end of QRS.',f.qrsStart+0.060,f.qrsEnd],
    ['st','ST · ventricles are depolarized','The tracing is near baseline because net spatial gradients are small, not because the muscle is inactive.',f.qrsEnd,f.tStart],
    ['recovery','T · ventricles recover','Spatial differences in recovery timing generate the T wave.',f.tStart,f.tEnd],
    ['rest','Between beats','Recovery is complete; the next sinus beat will repeat the sequence.',f.tEnd,f.rr],
  ];
  const active=phases.find(p=>local>=p[3]&&local<p[4]) || phases[0];
  return {id:active[0],title:active[1],description:active[2],progress:Math.max(0,Math.min(1,(local-active[3])/(active[4]-active[3]))),time:local,rr:f.rr};
}

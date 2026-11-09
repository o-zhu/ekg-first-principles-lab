/**
 * Original regional ST-injury teaching examples, never patient recordings.
 * Timed sinus source events are retained; a smooth injury-current contribution
 * changes the J point/ST segment and adjacent recovery. Limb projections keep
 * Einthoven/Goldberger voltage identities. This is not an ischemic cell model.
 */
import {createSandboxModel,DEFAULT_SANDBOX_CONFIG} from './pathology-model.js';
import {LEADS} from './ecg.js';

export const STEMI_SOURCES=Object.freeze([
  {id:'aha-ischemia',title:'AHA/ACCF/HRS ECG standards, Part VI: acute ischemia/infarction and reciprocal ST changes',url:'https://doi.org/10.1016/j.jacc.2008.12.016'},
  {id:'esc-acs',title:'2023 ESC acute coronary syndromes guideline: ST-elevation patterns and additional leads',url:'https://academic.oup.com/ehjacc/article/13/1/55/7280662'},
  {id:'acs-2025',title:'Australian ACS guideline 2025: ECG regions and reciprocal changes',url:'https://www.heartfoundation.org.au/for-professionals/acs-guideline?tab=2'},
  {id:'aha-lead-technology',title:'AHA/ACCF/HRS ECG standards, Part I: supplemental posterior lead positions',url:'https://doi.org/10.1016/j.jacc.2007.01.024'},
]);

// Supplemental leads are present only on the posterior teaching record. Their
// prescribed ECGs are direct posterior views, not re-labelled V4–V6 signals.
const POSTERIOR_LEADS=[
  {id:'V7',name:'V7 · posterior axillary',placement:'Left posterior axillary line, at the same horizontal level as V6',units:'mV',baselineScale:.65,st:.12,recovery:.05},
  {id:'V8',name:'V8 · midscapular',placement:'Left midscapular line, at the same horizontal level as V6',units:'mV',baselineScale:.55,st:.16,recovery:.07},
  {id:'V9',name:'V9 · paraspinal',placement:'Left paraspinal border, at the same horizontal level as V6',units:'mV',baselineScale:.45,st:.13,recovery:.06},
];

const COMMON_LIMIT='Original teaching simulation. The highlighted region is an approximate anatomical teaching territory. ST displacement does not measure infarct size, wall motion or ejection fraction. A clinical STEMI diagnosis requires the presentation and full ECG context; other conditions can also shift the ST segment.';
const TERRITORIES={
  anterior:{
    title:'Anterior STEMI pattern',shortTitle:'Anterior STEMI',recommendedLead:'V3',
    regionLabel:'Anterior / anteroseptal LV injury',
    elevationLeads:['V1','V2','V3','V4'],reciprocalLeads:['III','aVF'],
    stI:.04,stII:-.07,chest:[.16,.40,.45,.32,.14,.06],
    tI:.015,tII:-.01,tChest:[.13,.22,.27,.20,.10,.04],
    description:'A simulated anterior injury pattern with ST elevation strongest in V2–V4. Compare the smaller reciprocal inferior changes with the healthy reference pattern.',
    observe:'Inspect the J point and elevated ST segment in V2, V3 and V4, then compare III and aVF. The anterior highlight is a teaching territory; coronary anatomy and the clinical pattern vary.',
    electrical:'An injury-current contribution directed toward the anterior chest shifts ST upward in neighboring precordial leads. Leads facing away can show reciprocal depression.',
  },
  inferior:{
    title:'Inferior STEMI pattern',shortTitle:'Inferior STEMI',recommendedLead:'III',
    regionLabel:'Inferior LV injury',
    elevationLeads:['II','III','aVF'],reciprocalLeads:['I','aVL'],
    stI:-.12,stII:.18,chest:[.02,-.08,-.07,-.03,0,.03],
    tI:-.03,tII:.07,tChest:[.02,.02,.02,.03,.04,.04],
    description:'A simulated inferior injury pattern: ST rises in II, III and aVF and falls reciprocally in I and aVL. The inferior wall is highlighted in the reference heart.',
    observe:'Compare II, III and aVF with I and aVL. In a clinical inferior presentation, right-sided chest leads help assess RV involvement; this example does not infer a culprit artery from the tracing alone.',
    electrical:'The prescribed inferior injury vector projects positively into II, III and aVF. Its opposite projection produces reciprocal change in I and aVL.',
  },
  lateral:{
    title:'Lateral STEMI pattern',shortTitle:'Lateral STEMI',recommendedLead:'V6',
    regionLabel:'Lateral LV injury',
    elevationLeads:['I','aVL','V5','V6'],reciprocalLeads:['III','aVF'],
    stI:.20,stII:-.04,chest:[0,.01,.03,.08,.24,.24],
    tI:.07,tII:-.015,tChest:[0,.01,.03,.05,.15,.16],
    description:'A simulated lateral injury pattern with ST elevation in I, aVL, V5 and V6 and reciprocal inferior ST depression.',
    observe:'Compare the lateral-facing I, aVL, V5 and V6 views with III and aVF. The exact lead distribution can overlap neighboring territories.',
    electrical:'A leftward injury-current contribution elevates ST in I and aVL; the illustrative precordial projections are largest in V5–V6. Opposing limb projections depress inferior ST segments.',
  },
  posterior:{
    title:'Posterior injury · STEMI-equivalent pattern',shortTitle:'Posterior injury',recommendedLead:'V2',
    regionLabel:'Posterior LV injury',
    elevationLeads:['V7','V8','V9'],reciprocalLeads:['V1','V2','V3'],
    stI:.03,stII:.04,chest:[-.17,-.25,-.19,-.04,.01,.02],
    tI:0,tII:.01,tChest:[.18,.12,.08,.02,0,0],
    description:'A simulated posterior injury pattern is seen indirectly on the standard ECG as ST depression in V1–V3 with upright recovery waves. Posterior leads V7–V9 provide the direct view.',
    observe:'Start with reciprocal ST depression in V1–V3, then select the additional V7–V9 leads to see the direct posterior ST elevation. These posterior views extend the standard 12-lead set.',
    electrical:'Posterior injury points away from V1–V3, producing a reciprocal negative ST projection in those anterior chest leads. The direct posterior projection is positive.',
  },
};

const clamp01=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,t)=>{const x=clamp01((t-a)/(b-a));return x*x*(3-2*x);};
function bump(t,a,b){if(t<=a||t>=b)return 0;return Math.sin(Math.PI*(t-a)/(b-a))**2;}
function injuryEnvelope(t,beat){
  // The transition is complete at the J point. A raised/reciprocally depressed
  // ST plateau joins recovery smoothly and returns to the TP baseline.
  const q=beat.qrsDuration,rise=smooth(q-.012,q,t);
  return rise*(1-smooth(beat.tStart+.025,beat.tEnd-.015,t));
}
function limbValues(I,II){return {I,II,III:II-I,aVR:-(I+II)/2,aVL:I-II/2,aVF:II-I/2};}
const MECHANICAL='The reference heart follows a sinus activation–contraction sequence. The warm region identifies the illustrated injury territory. Acute ischemia can impair regional contraction, but the ST amplitude here does not calculate mechanical dysfunction or infarct size.';

/** Returns four chart-ready 10-second, 250 Hz simulated library records. */
export function createSTEMIRecords(){return Object.keys(TERRITORIES).map(territory=>createSTEMIRecord(territory));}

export function createSTEMIRecord(territory,options={}){
  const p=TERRITORIES[territory];if(!p)throw new RangeError('Unknown STEMI teaching territory: '+territory);
  const base=createSandboxModel({...DEFAULT_SANDBOX_CONFIG,rate:72},{duration:options.duration??10,fs:options.fs??250});
  const signals=Object.fromEntries(LEADS.map(l=>[l,new Float32Array(base.signals[l])]));
  const supplemental=territory==='posterior'?POSTERIOR_LEADS:[];
  const additionalLeads=supplemental.map(l=>l.id);
  const additionalLeadInfo=Object.fromEntries(supplemental.map(({id,name,placement,units})=>[id,{id,name,placement,units}]));
  // A declining positive-R sinus reference represents the posterior viewing
  // directions. No patient posterior recording or forward solution is implied.
  for(const lead of supplemental)signals[lead.id]=Float32Array.from(base.signals.V6,v=>v*lead.baselineScale);
  const count=base.sampleCount,fs=base.fs;
  for(let i=0;i<count;i++){
    const time=i/fs;let st=0,recovery=0;
    for(const beat of base.beats){
      const t=time-beat.onset;if(t<beat.qrsDuration-.012||t>beat.tEnd)continue;
      st+=injuryEnvelope(t,beat);recovery+=bump(t,beat.tStart,beat.tEnd);
    }
    signals.I[i]+=p.stI*st+p.tI*recovery;signals.II[i]+=p.stII*st+p.tII*recovery;
    const limb=limbValues(signals.I[i],signals.II[i]);
    for(const l of ['III','aVR','aVL','aVF'])signals[l][i]=limb[l];
    for(let j=0;j<6;j++)signals['V'+(j+1)][i]+=p.chest[j]*st+p.tChest[j]*recovery;
    for(const lead of supplemental)signals[lead.id][i]+=lead.st*st+lead.recovery*recovery;
  }
  const profile={id:'stemi-'+territory,title:p.title,conditionId:'stemi-'+territory,config:{...base.config},
    electrical:p.electrical,mechanical:MECHANICAL,observe:p.observe,summary:p.description,
    limitations:COMMON_LIMIT,sourceRefs:STEMI_SOURCES,injuryTerritory:territory};
  const injury={territory,chamber:'lv',label:p.regionLabel,severity:1,illustrative:true,
    elevationLeads:[...p.elevationLeads],reciprocalLeads:[...p.reciprocalLeads]};
  const getState=time=>{
    const state=base.getState(time),beat=base.beats.find(b=>b.id===state.ventricularState?.id);
    const current=beat?injuryEnvelope(state.relativeTime,beat):0;
    let phase=state.phase;
    if(phase.id==='systole')phase={...phase,title:'ST injury pattern · '+territory,
      description:territory==='posterior'?'Posterior injury produces reciprocal ST depression in V1–V3. The ventricles continue their prescribed contraction.':'Electrical differences between the injured and surrounding regions displace ST. The ventricles continue their prescribed contraction.'};
    return {...state,condition:'normal',conditionId:profile.id,profile,phase,
      injuryTerritory:territory,injury:{...injury,stCurrent:current},
      signalKind:'simulated',motionKind:'illustrative'};
  };
  const stLevels={...limbValues(p.stI,p.stII),...Object.fromEntries(p.chest.map((v,j)=>['V'+(j+1),v])),
    ...Object.fromEntries(supplemental.map(l=>[l.id,l.st]))};
  const notes=[COMMON_LIMIT,
    'This example isolates an ST-injury pattern on a regular 72/min sinus sequence. QRS timing is preserved; it does not simulate the full evolution of infarction, treatment, every ST-elevation mimic, or all coexisting conduction disorders.',
    'The modeled ST plateau is displaced relative to the TP baseline, with a smooth J-point transition and altered recovery. Actual ischemia changes transmembrane potentials and injury currents; this curve is a prescribed teaching approximation.',
    'Limb changes are derived from two independent lead voltages so the six limb-lead identities are preserved. Chest projections and territory boundaries are illustrative.',
    ...(territory==='posterior'?['V7–V9 are supplemental posterior views at the same horizontal level as V6. Their smaller positive-R reference complexes and ST elevation are prescribed teaching projections, not patient recordings or a computed torso field. V1–V3 depression is a reciprocal clue; its cause requires the full ECG and clinical context.']:[]),
  ];
  const leadOrder=[...LEADS,...additionalLeads];
  const model={...base,signals,getState,notes,injuryTerritory:territory,injury,
    leadOrder,leadNames:[...leadOrder],additionalLeads,additionalLeadInfo};
  return {...model,id:'teaching-stemi-'+territory,title:p.title,shortTitle:p.shortTitle,description:p.description,
    kind:'simulated',group:'ischemia',conditionId:profile.id,recommendedLead:p.recommendedLead,
    tags:['Simulated','STEMI pattern',territory],source:'Original ECG Lab regional injury teaching simulation',
    sourceUrl:null,recordUrl:null,profile,_stateModel:model,synthetic:true,sandboxCompatible:false,
    stTeaching:{levelsMV:stLevels,measurement:'Prescribed J-point/ST plateau relative to TP baseline',illustrative:true},
  };
}

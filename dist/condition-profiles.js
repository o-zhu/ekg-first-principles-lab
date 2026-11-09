/**
 * Mechanistic teaching scenarios paired with the unchanged PTB-XL recordings.
 * QRS activity anchors were derived from 100-Hz multi-lead slope energy and
 * visually checked. They are approximate playback landmarks, NOT validated
 * onset/offset annotations. The conduction timings and all mechanics below are
 * prescribed illustrations: no mechanical measurements are present in PTB-XL.
 */
import {conductionEventAt} from './conduction-event.js';

export const CONDITION_SOURCES = {
  af: {title:'2023 ACC/AHA/ACCP/HRS atrial fibrillation guideline · definition and mechanisms',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11095842/'},
  conduction: {title:'2018 ACC/AHA/HRS bradycardia and conduction delay guideline · definitions',url:'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000628'},
  pacing: {title:'2023 HRS/APHRS/LAHRS physiologic pacing guideline · electrical and mechanical dyssynchrony',url:'https://doi.org/10.1002/joa3.12872'},
  rbbb: {title:'Right bundle branch block and RV electromechanical coupling · echocardiographic study',url:'https://pubmed.ncbi.nlm.nih.gov/26900418/'},
  pvc: {title:'Real-time CMR study of variable ventricular function during premature ventricular complexes',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4807630/'},
  qrs: {title:'AHA/ACCF/HRS ECG standards, Part III · normal QRS duration and conduction disturbances',url:'https://doi.org/10.1016/j.jacc.2008.12.013'},
  qt: {title:'AHA/ACCF/HRS ECG standards, Part IV · ST, T, U and QT interval',url:'https://doi.org/10.1016/j.jacc.2008.12.014'},
  p: {title:'AHA/ACCF/HRS ECG standards, Part V · atrial waveform criteria',url:'https://doi.org/10.1016/j.jacc.2008.12.015'},
  rate: {title:'American Heart Association · resting heart rate',url:'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse'},
};

const common = {
  pr:.16, pDuration:.10, qrs:.09, lvDelay:0, rvDelay:0,
  organizedAtria:true, reverseSeptal:false, nominalBpm:72,
  limitation:'This reference heart illustrates a mechanism. Its motion, conduction routes and activation intervals are not measurements from the person who supplied the ECG.',
};

export const CONDITION_PROFILES = {
  normal: {...common,id:'normal',recordId:'ptbxl-00303',title:'Normal sinus rhythm',shortTitle:'Sinus rhythm',color:'#79bda6',recommendedLead:'II',
    headline:'One organized sequence, two successive squeezes.',
    conduction:'A sinus impulse activates the atria, slows through the AV junction, then spreads rapidly through both ventricles.',
    contraction:'Atrial contraction follows the P wave. Ventricular shortening, inward motion and twist follow QRS and continue through much of ST–T; relaxation follows.',
    ecg:'Look for a P wave before each narrow QRS and relatively regular beat spacing.',
    watch:'Watch atrial systole first, then ventricular systole after a short electromechanical delay.',
    sources:['conduction','qrs'],
  },
  afib: {...common,id:'afib',recordId:'ptbxl-02078',title:'Atrial fibrillation',shortTitle:'AFib',color:'#b19bd7',recommendedLead:'II',organizedAtria:false,
    headline:'Disorganized atria; irregular ventricular timing.',
    conduction:'Atrial activation is rapid and uncoordinated. The AV node conducts only some impulses, so the ventricles are activated at irregular intervals.',
    contraction:'The atrial wall has no coordinated booster squeeze. Ventricular contractions follow the irregular QRS events; their strength is not measured by this ECG.',
    ecg:'There are no consistent, discrete P waves. Compare the changing R–R intervals in the real trace.',
    watch:'The small local atrial movements represent disorganization, not multiple effective atrial contractions.',
    sources:['af'],
  },
  rbbb: {...common,id:'rbbb',recordId:'ptbxl-03155',title:'Right bundle branch block',shortTitle:'RBBB',color:'#a99bdd',recommendedLead:'V1',qrs:.15,rvDelay:.075,
    headline:'The left side leads; the right free wall catches up.',
    conduction:'A blocked right bundle delays rapid delivery to the right ventricle. Activation reaches the right free wall later through the ventricular myocardium.',
    contraction:'Right ventricular contraction can be delayed relative to the left. The model makes the timing difference visible; its exact delay is illustrative.',
    ecg:'Follow the broad terminal positive deflection in V1 and the terminal S in I or V6. Complete RBBB includes QRS ≥120 ms plus characteristic morphology.',
    watch:'The interrupted right branch stays muted while the later right ventricular wave spreads.',
    sources:['conduction','rbbb'],
  },
  lbbb: {...common,id:'lbbb',recordId:'ptbxl-00618',title:'Left bundle branch block',shortTitle:'LBBB',color:'#ec9c8f',recommendedLead:'V6',qrs:.15,lvDelay:.075,reverseSeptal:true,
    headline:'Activation crosses from right to left before the left wall contracts.',
    conduction:'A blocked left bundle changes early septal activation and delays the left ventricular free wall. The usual left-to-right septal sequence is reversed in this schematic.',
    contraction:'Early regions shorten before the late left wall. This illustrates electromechanical dyssynchrony; individual motion patterns vary substantially.',
    ecg:'Compare the broad QRS and left-sided R waves in I/V6 with the predominantly negative complex in V1.',
    watch:'Notice that the septum and the left free wall do not reach peak shortening together.',
    sources:['conduction','pacing'],
  },
  pvc: {...common,id:'pvc',recordId:'ptbxl-00818',title:'Premature ventricular beat',shortTitle:'PVC',color:'#e8b576',recommendedLead:'II',
    headline:'A ventricular impulse interrupts the sinus sequence.',
    conduction:'Near 8 seconds, a premature ventricular impulse spreads outside the normal coordinated His–Purkinje sequence. The illustrated focus is an example, not a localization from this recording.',
    contraction:'The early beat starts a different, less synchronous contraction sequence. The following longer interval allows more filling; the ECG does not determine stroke volume.',
    ecg:'Compare the broad premature beat near 8 seconds with the preceding narrow beats and the longer interval afterward. The source also labels sinus arrhythmia.',
    watch:'Jump to the ectopic beat and compare where activation starts. The surrounding beats retain the sinus sequence.',
    ectopicFocus:'rv',ectopicFocusLabel:'Illustrative ventricular focus · site not inferred',
    focusTime:7.82,sources:['pvc'],
  },
  brady: {...common,id:'brady',recordId:'ptbxl-01166',title:'Sinus bradycardia',shortTitle:'Sinus bradycardia',color:'#8fbdc6',recommendedLead:'II',nominalBpm:42,
    headline:'The normal sequence, with a longer interval between beats.',
    conduction:'The impulse still begins in the sinus node and conducts through the atria, AV junction and ventricles. Sinus impulses occur less often.',
    contraction:'Atrial and ventricular contractions remain coordinated. More of the cycle is spent between ventricular contractions.',
    ecg:'Each QRS follows a sinus P wave. A resting rate below 60/min is termed bradycardia and can be physiological, for example during sleep or in trained athletes.',
    watch:'Compare the long diastolic interval with the much shorter period of active ventricular shortening.',
    sources:['conduction','rate'],
  },
  tachy: {...common,id:'tachy',recordId:'ptbxl-02277',title:'Sinus tachycardia',shortTitle:'Sinus tachycardia',color:'#d5ad70',recommendedLead:'II',nominalBpm:110,pr:.14,pDuration:.09,
    headline:'The same conduction route repeats sooner.',
    conduction:'The sinus node initiates each beat at a faster rate. The normal atrial–AV–ventricular sequence is preserved.',
    contraction:'The next beat arrives sooner, shortening the available filling interval. The animation retains a delay between electrical activation and mechanical shortening.',
    ecg:'Look for consistent P waves before the QRS complexes and a resting rate above 100/min. Sinus tachycardia may be a normal physiological response.',
    watch:'At the same playback speed, there is less quiet time between contractions than in the bradycardia example.',
    sources:['conduction','rate'],
  },
  avblock1: {...common,id:'avblock1',recordId:'ptbxl-00218',title:'First-degree AV block',shortTitle:'First-degree AV delay',color:'#b7bd7f',recommendedLead:'II',pr:.27,
    headline:'A longer atrial-to-ventricular delay; every impulse still conducts.',
    conduction:'The PR interval is prolonged beyond 200 ms, with one conducted QRS for every P wave. The model places the extra delay at the AV junction; the ECG alone does not establish its exact anatomical level.',
    contraction:'Atrial contraction occurs earlier relative to ventricular contraction. There are no dropped ventricular beats in this first-degree pattern.',
    ecg:'Measure from P-wave onset to QRS onset, including the P wave itself. First-degree AV block is more accurately an AV conduction delay.',
    watch:'Follow the prolonged pause at the AV junction, then the preserved ventricular activation sequence.',
    sources:['conduction'],
  },
};

export const MARKER_NOTES = 'Approximate QRS activity anchors derived from the original 100 Hz samples, then visually checked. Conduction onset, atrial timing, recovery and deformation are prescribed teaching estimates, not validated patient annotations. The 10-second replay boundary is not a physiological beat interval.';

export const CLINICAL_BEAT_MARKERS = {
  'ptbxl-00303': {condition:'normal',seconds:10,anchorOffset:.04,anchors:[.55,1.25,1.95,2.65,3.38,4.12,4.84,5.6,6.39,7.17,7.97,8.77,9.53]},
  'ptbxl-02078': {condition:'afib',seconds:10,anchorOffset:.04,anchors:[1.05,2.18,3.42,4.4,5.05,6.4,7.09,8.46,9.65]},
  'ptbxl-03155': {condition:'rbbb',seconds:10,anchorOffset:.05,anchors:[.28,1.33,2.37,3.42,4.46,5.49,6.52,7.56,8.6,9.64]},
  'ptbxl-00618': {condition:'lbbb',seconds:10,anchorOffset:.04,anchors:[.17,.97,1.8,2.63,3.5,4.37,5.24,6.1,6.98,7.85,8.71,9.59]},
  'ptbxl-01166': {condition:'brady',seconds:10,anchorOffset:.04,anchors:[.52,2.02,3.37,4.83,6.11,7.68,9.0]},
  'ptbxl-02277': {condition:'tachy',seconds:10,anchorOffset:.04,anchors:[.16,.72,1.27,1.82,2.38,2.93,3.48,4.02,4.56,5.11,5.66,6.21,6.75,7.29,7.83,8.37,8.91,9.45]},
  'ptbxl-00818': {condition:'pvc',seconds:10,anchorOffset:.04,anchors:[.57,1.24,1.90,2.58,3.32,4.13,4.98,5.81,6.61,7.51,8.00,9.26],ectopicIndices:[10],ectopicOffset:.08},
  'ptbxl-00218': {condition:'avblock1',seconds:10,anchorOffset:.04,anchors:[.04,.74,1.44,2.14,2.84,3.55,4.24,4.93,5.61,6.29,6.98,7.67,8.37,9.07,9.77]},
};

// UI-facing aliases keep the content contract explicit without duplicating text.
for(const profile of Object.values(CONDITION_PROFILES)) {
  Object.assign(profile,{
    summary:profile.headline,electrical:profile.conduction,mechanical:profile.contraction,
    observe:profile.watch,limitations:profile.limitation,
    sourceRefs:profile.sources.map(id=>({id,...CONDITION_SOURCES[id]})),
  });
}

export function getCondition(recordOrId='normal') {
  const id=typeof recordOrId==='object'?recordOrId?.id:recordOrId;
  return CONDITION_PROFILES[id] || CONDITION_PROFILES[CLINICAL_BEAT_MARKERS[id]?.condition] || CONDITION_PROFILES.normal;
}
export const getConditionProfile=getCondition;

export function getClinicalBeats(recordOrId) {
  const markers=CLINICAL_BEAT_MARKERS[getCondition(recordOrId).recordId];
  return markers.anchors.map((time,index)=>{
    const ectopic=markers.ectopicIndices?.includes(index)||false;
    return {index,time,qrsOnset:time-(ectopic?markers.ectopicOffset:markers.anchorOffset),ectopic,
      title:ectopic?'Premature ventricular beat':'Beat '+(index+1)};
  });
}

const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{const a=clamp(x);return a*a*(3-2*a);};
const pulse=(t,start,rise,hold,end)=>smooth((t-start)/(rise-start))*(1-smooth((t-hold)/(end-hold)));
const wrap=(t,n)=>((Number(t)||0)%n+n)%n;

/**
 * State contract consumed by HeartScene.update(t,bpm,{clinicalState:state}).
 * relativeTime and all timing fields use QRS onset as zero. qrsOnset is an
 * approximate absolute recording time. Mechanics are 0..1 prescribed squeeze
 * envelopes with electromechanical delay and sustained systole/relaxation.
 * No synthetic beats are joined across the 10-second recording boundary.
 */
export function getClinicalState(recordOrId,time=0) {
  const profile=getCondition(recordOrId), markers=CLINICAL_BEAT_MARKERS[profile.recordId];
  const recordTime=wrap(time,markers.seconds), anchors=markers.anchors;
  const events=anchors.map((anchor,i)=>{
    const ectopic=markers.ectopicIndices?.includes(i)||false;
    const qrsOnset=anchor-(ectopic?markers.ectopicOffset:markers.anchorOffset);
    const prevRR=i>0?anchor-anchors[i-1]:anchors[1]-anchor;
    const nextRR=i+1<anchors.length?anchors[i+1]-anchor:prevRR;
    const rr=Math.max(.35,prevRR), scale=Math.min(1.35,Math.max(.78,Math.sqrt(rr/(60/72))));
    const qrs=ectopic?.16:profile.qrs, qt=Math.min(nextRR*.85,.38*scale+(qrs>.11?.025:0));
    const lvDelay=ectopic?.06:profile.lvDelay, rvDelay=ectopic?0:profile.rvDelay;
    const timing={pStart:-profile.pr,pEnd:-profile.pr+profile.pDuration,qrsStart:0,qrsEnd:qrs,tStart:Math.max(qrs+.04,qt-.18*scale),tEnd:qt};
    const organizedAtria=profile.organizedAtria&&!ectopic;
    return {id:'record-v'+i,anchor,index:i,qrsOnset,ectopic,rr,nextRR,scale,timing,lvDelay,rvDelay,organizedAtria};
  });
  // Use the next beat when its atrial/ventricular sequence has begun; otherwise
  // retain the preceding beat through its contraction and recovery phase.
  let event=events[0];
  for(const candidate of events){
    const sequenceStart=candidate.qrsOnset+(candidate.organizedAtria?candidate.timing.pStart:-.015);
    if(recordTime>=sequenceStart)event=candidate;
  }
  const relativeTime=recordTime-event.qrsOnset, f=event.timing;
  // Preserve the existing tissue/recovery selector while allowing a known
  // upcoming His impulse to start before the next ventricular source clock.
  const guideAtria=events.filter(e=>e.organizedAtria).map(e=>({id:'record-a'+e.index,
    onset:e.qrsOnset+e.timing.pStart,duration:e.timing.pEnd-e.timing.pStart,
    conducted:true,pr:-e.timing.pStart,linkedQrsOnset:e.qrsOnset}));
  const conductionEvent=conductionEventAt(events,recordTime,guideAtria);
  const mechanics={atria:0,lv:0,rv:0,atrialReservoir:0};
  for(const beat of events){
    const t=recordTime-beat.qrsOnset, s=beat.scale;
    if(beat.organizedAtria)mechanics.atria=Math.max(mechanics.atria,pulse(t,beat.timing.pStart+.035,beat.timing.pStart+.11,beat.timing.pStart+.14,beat.timing.pStart+.23));
    for(const chamber of ['lv','rv']){
      const d=beat[chamber+'Delay'];
      mechanics[chamber]=Math.max(mechanics[chamber],pulse(t,.035+d,.16*s+d,.23*s+d,.43*s+d));
    }
    mechanics.atrialReservoir=Math.max(mechanics.atrialReservoir,pulse(t,.09,.22*s,.32*s,.50*s));
  }
  const activation={
    ra:event.organizedAtria?pulse(relativeTime,f.pStart,f.pStart+.028,f.pEnd-.02,f.pEnd+.03):0,
    la:event.organizedAtria?pulse(relativeTime,f.pStart+.025,f.pStart+.055,f.pEnd,f.pEnd+.04):0,
    septum:pulse(relativeTime,0,.012,.025,.045),
    lv:pulse(relativeTime,event.lvDelay+.012,event.lvDelay+.035,event.lvDelay+.055,event.lvDelay+.085),
    rv:pulse(relativeTime,event.rvDelay+.015,event.rvDelay+.04,event.rvDelay+.06,event.rvDelay+.09),
  };
  const atrialFibrillation=profile.id==='afib';
  let phase={id:'rest',title:'Filling between beats',description:'The ventricles relax and refill before the next activation.'};
  if(atrialFibrillation)phase={id:'af',title:'Uncoordinated atrial activity',description:'The atria have no coordinated squeeze; ventricular timing follows the irregular conducted beats.'};
  if(event.organizedAtria&&relativeTime>=f.pStart&&relativeTime<f.pEnd)phase={id:'atria',title:'Atrial activation',description:'The atrial impulse precedes the coordinated atrial contraction.'};
  else if(event.organizedAtria&&relativeTime>=f.pEnd&&relativeTime<0)phase={id:'av',title:profile.id==='avblock1'?'Prolonged AV conduction delay':'AV conduction delay',description:'The impulse pauses before ventricular activation; atrial contraction follows its earlier electrical signal.'};
  else if(relativeTime>=0&&relativeTime<f.qrsEnd){
    const late=relativeTime>.07;
    phase=event.ectopic?{id:'ectopic',title:'Premature ventricular activation',description:'An illustrative ventricular focus starts an early, altered activation sequence.'}:
      profile.id==='rbbb'&&late?{id:'rv-late',title:'Delayed right ventricular activation',description:'The right free wall activates after the earlier left ventricular wave.'}:
      profile.id==='lbbb'&&late?{id:'lv-late',title:'Delayed left ventricular activation',description:'Activation reaches the left free wall after the right-sided and septal regions.'}:
      {id:'qrs',title:'Ventricular activation',description:'Electrical activation comes first; shortening builds after an electromechanical delay.'};
  } else if(relativeTime>=f.qrsEnd&&relativeTime<f.tStart)phase={id:'systole',title:'Ventricular contraction continues',description:'A nearly flat ST segment can accompany active mechanical contraction.'};
  else if(relativeTime>=f.tStart&&relativeTime<f.tEnd+.08)phase={id:'recovery',title:'Recovery and relaxation',description:'Repolarization and mechanical relaxation overlap; they are different processes.'};
  return {
    condition:profile.id,profile,recordTime,beatIndex:event.index,beatCount:events.length,
    qrsAnchor:event.anchor,qrsOnset:event.qrsOnset,relativeTime,rr:event.rr,nextRR:event.nextRR,conductionEvent,
    ectopic:event.ectopic,ectopicFocus:event.ectopic?profile.ectopicFocus:null,
    organizedAtria:event.organizedAtria,atrialFibrillation,reverseSeptal:profile.reverseSeptal,
    lvDelay:event.lvDelay,rvDelay:event.rvDelay,timing:f,activation,mechanics,phase,
    approximate:true,notes:MARKER_NOTES,
  };
}

/** Adult teaching reference limits, not a diagnostic decision rule. */
export const NORMAL_METRICS = [
  {id:'hr',label:'Heart rate',range:'60–100 /min at rest',detail:'Lower rates may be normal in sleep or trained athletes; rate is interpreted in context.',sources:['rate']},
  {id:'rr',label:'R–R interval',range:'600–1,000 ms at 60–100 /min',detail:'RR = 60 / heart rate in seconds for a regular rhythm. Respiratory sinus variation may be normal.',sources:['rate']},
  {id:'p',label:'P-wave duration',range:'Usually <120 ms',detail:'Measure earliest onset to latest end across leads. Age, lead and measurement method affect the limit.',sources:['p']},
  {id:'pAmplitude',label:'P-wave amplitude',range:'Usually ≤0.25 mV in lead II',detail:'At 10 mm/mV this is 2.5 small boxes. Precordial morphology and limits differ.',sources:['p']},
  {id:'pr',label:'PR interval',range:'120–200 ms',detail:'P onset to QRS onset, including the P wave. More than 200 ms with 1:1 conduction is first-degree AV delay.',sources:['conduction']},
  {id:'prSegment',label:'PR segment',range:'Usually near the baseline; no single duration range',detail:'P offset to QRS onset. Do not confuse this segment with the full PR interval.',sources:['conduction']},
  {id:'qrs',label:'QRS duration',range:'Usually about 70–110 ms',detail:'AHA regards >110 ms as prolonged in adults. ≥120 ms is used for complete bundle branch block, together with morphology.',sources:['qrs']},
  {id:'qt',label:'QT interval',range:'Rate dependent · use a corrected QT',detail:'QRS onset to T-wave end. There is no one normal uncorrected QT value for every heart rate.',sources:['qt']},
  {id:'qtc',label:'Corrected QT (QTc)',range:'Common upper limits: <450 ms men; <460 ms women',detail:'State the correction formula. Bazett and Fridericia are teaching examples and can miscorrect at extreme rates. Wide QRS, irregular rhythm, age and clinical context need separate consideration.',sources:['qt']},
  {id:'st',label:'ST segment',range:'Usually close to baseline; no universal duration range',detail:'QRS end (J point) to T onset. Normal elevation and clinical thresholds depend on the lead, age and sex.',sources:['qt']},
  {id:'t',label:'T wave',range:'No universal isolated duration or amplitude range',detail:'Assess polarity, contour and relation to QRS in each lead; T-wave end is used to measure QT.',sources:['qt']},
];


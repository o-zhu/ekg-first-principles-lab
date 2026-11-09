import {getCondition,getClinicalBeats,getClinicalState} from './condition-profiles.js';
import {createEventStateModel,TEACHING_SCENARIOS} from './pathology-model.js';
import {isRecordedArrhythmia,recordedArrhythmiaProfile,createRecordedArrhythmiaModel} from './recorded-arrhythmias.js';
import {conductionEventAt} from './conduction-event.js';

/** Keep raw-record playback and mechanism models distinct at this boundary. */
export function scenarios(){
  return Array.isArray(TEACHING_SCENARIOS)?TEACHING_SCENARIOS:Object.entries(TEACHING_SCENARIOS).map(([id,s])=>({id,...s}));
}
const scenarioFor=id=>scenarios().find(s=>s.id===id||s.conditionId===id);
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const median=values=>{const v=[...values].sort((a,b)=>a-b);return v.length?(v[(v.length-1)>>1]+v[v.length>>1])/2:null;};
const observedIntervals=events=>events.slice(1).map((e,i)=>e.onset-events[i].onset).filter(t=>t>0);
const RECORDED_LIMIT='The ECG samples are recorded data. Myocardial activation, recovery and all motion are teaching illustrations, not measured patient mechanics. Source event markers, supplied waveform annotations and estimated animation timings are identified separately.';
const ONSET_NOTE='Each sharp recorded QRS extremum is placed 40 ms after an estimated QRS onset for animation. This fixed offset is an approximation, not a validated onset measurement.';

const EXTRA={
  mobitz1:{config:{avBlock:'mobitz1',rate:58},recommendedLead:'II',title:'Second-degree AV block · Wenckebach',
    electrical:'Atrial impulses continue while AV conduction progressively slows, until one atrial impulse does not produce a QRS. The sequence then resets.',
    mechanical:'The atria continue their cycle. A nonconducted atrial impulse has no corresponding ventricular contraction. This animation uses approximate visible P-wave and QRS landmarks; its exact regional delays are illustrative.',
    observe:'Follow successive P waves and the grouped ventricular beats in lead II. The source also labels nonspecific T-wave changes and flags V1–V2 baseline drift. Read PR intervals from the trace rather than from animation timing.'},
  complete:{config:{avBlock:'complete',rate:98,escapeRate:40},recommendedLead:'II',title:'Third-degree AV block',
    electrical:'The atrial and ventricular rhythms are independent. A slower escape rhythm activates the ventricles; a P wave does not determine when the next QRS occurs.',
    mechanical:'Ventricular motion follows approximate recorded QRS landmarks. Atrial motion uses a separate illustrative 98/min clock, guided by the source report: a complete reliable P-onset series is unavailable. Its phase is not reconstructed from this recording.',
    observe:'Look for atrial activity marching through the slower QRS rhythm. The source also reports incomplete RBBB and a low-confidence possible anteroseptal-infarction label. The escape origin and coexisting conduction details are not localized by this generic animation.'},
  lvh:{config:{hypertrophy:'lvh',axis:60,rate:84},recommendedLead:'V5',title:'Left ventricular hypertrophy pattern',
    electrical:'Greater left ventricular muscle mass can alter QRS voltage and repolarization. ECG voltage also depends on body habitus, orientation and conduction.',
    mechanical:'The model illustrates an organized activation–contraction sequence. This ECG does not establish ventricular wall thickness, filling pressure, chamber size or contraction strength. P timing is prescribed relative to QRS for this reference animation.',
    observe:'Compare the precordial voltages across V1–V6. The source label is LVH; voltage criteria and anatomical hypertrophy are related but are not interchangeable.'},
  rvh:{config:{hypertrophy:'rvh',axis:60,rate:92},recommendedLead:'V1',title:'Right ventricular hypertrophy pattern',
    electrical:'The source labels an RVH pattern, but its axis annotation is MID (normal). This reference model therefore keeps a normal-axis setting rather than automatically adding right axis deviation.',
    mechanical:'The reference heart shows the activation–contraction sequence. The recording does not measure right ventricular wall thickness or mechanical function. Its P timing is prescribed for illustration.',
    observe:'Compare V1 with the left precordial and limb leads. The report also describes widespread T-wave abnormalities and QT prolongation. No exact patient axis or QT value is supplied by this illustration.'},
  leftaxis:{config:{axis:-60,rate:90},recommendedLead:'aVF',title:'Left axis deviation',
    electrical:'The source reports marked left axis deviation and left anterior fascicular block. The reference model uses an illustrative −60° direction; this is not a measured angle from the recording.',
    mechanical:'An axis shift describes electrical projection. It does not mean the whole heart rotates or establish abnormal contraction strength. The motion and atrial timing remain reference illustrations.',
    observe:'Compare lead I with aVF and II. Keep the lead directions fixed while comparing how the same ventricular event projects into each lead. The source axis category is ALAD.'},
  rightaxis:{config:{axis:125,rate:92},recommendedLead:'I',title:'Right axis deviation',
    electrical:'The source reports right axis deviation and probable left posterior fascicular block. The reference model uses an illustrative 125° direction; the source does not supply that numeric angle.',
    mechanical:'The axis describes electrical direction seen by limb leads. The generic contraction animation does not infer a structural cause or patient-specific mechanics; atrial timing is prescribed for illustration.',
    observe:'Compare lead I and aVF, then inspect the remaining leads. Rightward axis has several possible causes. This record preserves the source RAD category and coexisting fascicular-block label.'},
};

function onsetOf(event){
  return typeof event==='number'?event:finite(event?.onset??event?.pOnset??event?.time,NaN);
}

function makeExternalModel(record,profile){
  if(isRecordedArrhythmia(record))return createRecordedArrhythmiaModel(record,profile);
  const teaching=record.teaching||{};
  const duration=finite(record.seconds,10);
  const config={...profile.config,...(teaching.config||{})};
  const complete=config.avBlock==='complete';
  const offset=finite(teaching.anchorOffset,.04);
  const anchors=teaching.ventricularAnchors||record.ventricularAnchors||[];
  const ventricularEvents=anchors.map((anchor,i)=>{
    const object=typeof anchor==='number'?{}:anchor;
    const sourceAnchor=typeof anchor==='number'?anchor:finite(object.anchor??object.time,NaN);
    const onset=finite(object.onset??object.qrsOnset,sourceAnchor-offset);
    return {...object,id:object.id||'record-v'+i,index:i,onset,qrsOnset:onset,
      sourceAnchor:Number.isFinite(sourceAnchor)?sourceAnchor:onset+offset,
      qrsDuration:finite(object.qrsDuration,finite(teaching.qrsDuration,.10)),
      escape:complete||!!object.escape,ectopic:!!object.ectopic,
      atrialId:null,pr:null,approximate:true};
  }).filter(v=>Number.isFinite(v.onset)).sort((a,b)=>a.onset-b.onset);

  let atrialEvents;
  let atrialTimingSource='prescribed-from-ventricular-events';
  const sourceFiducials=teaching.fiducialSource==='source-cardiologist-annotations';
  const timingNotes=[sourceFiducials?'P/QRS timing uses the source cardiologists’ waveform annotations. Regional tissue activation, recovery and all motion remain schematic.':offset===.04?ONSET_NOTE:'Recorded QRS event markers are shifted by an illustrative '+Math.round(offset*1000)+' ms to estimate activation onset; these are not validated onset annotations.'];

  if(!complete&&Array.isArray(teaching.atrialOnsets)){
    // Only a supplied complete approximate series may determine the P clock.
    // The complete-block record's partial visibleAtrialOnsets is never read here.
    const usedVentricles=new Set();
    let precedingPR=.30;
    atrialEvents=teaching.atrialOnsets.map((raw,index)=>{
      const onset=onsetOf(raw);
      if(!Number.isFinite(onset))return null;
      const supplied=typeof raw==='object'?raw:{};
      const explicitlyBlocked=supplied.dropped===true||(teaching.blockedAtrialOnsets||[]).some(t=>Math.abs(t-onset)<.001);
      const linked=explicitlyBlocked?null:ventricularEvents.find(v=>!usedVentricles.has(v.id)&&v.onset-onset>=.08&&v.onset-onset<=.60);
      const id='record-a'+index,pr=linked?linked.onset-onset:null;
      if(linked){usedVentricles.add(linked.id);linked.atrialId=id;linked.pr=pr;precedingPR=pr;}
      return {...supplied,id,onset,index,duration:finite(supplied.duration,.095),conducted:!!linked,dropped:!linked,
        blockedByAv:!linked,dropReason:linked?null:'av-block',
        linkedQrsOnset:linked?.onset??null,pr,
        plannedPR:pr??Math.max(.24,precedingPR),approximate:true};
    }).filter(Boolean);
    const pp=median(observedIntervals(atrialEvents));
    if(pp)config.rate=60/pp;
    atrialTimingSource=sourceFiducials?'source-cardiologist-p-onsets':'approximate-visible-p-onsets';
    if(!sourceFiducials)timingNotes.push('Supplied P-wave beginnings were estimated visually for synchronization. Their uncertainty is several tens of milliseconds; no diagnostic PR values are claimed.');
  }else if(complete){
    // Omitted atrialEvents asks the engine for a separate teaching clock. Do
    // not substitute the partial observed P list or infer a conduction link.
    const rr=median(observedIntervals(ventricularEvents));
    if(rr)config.escapeRate=60/rr;
    config.rate=finite(teaching.atrialRateEstimate,98);
    atrialTimingSource='independent-illustrative-clock';
    timingNotes.push('A reliable full P-onset series is unavailable. Atrial motion follows an independent illustrative 98/min clock guided by the narrative report, with arbitrary teaching phase. The partial visible P list is not used as a complete schedule.');
    timingNotes.push('All supplied ventricular events are marked escape events and are unlinked to atrial impulses. Escape origin is schematic; rate alone does not clinically locate the focus. The coexisting incomplete RBBB remains a source label, not a fully reconstructed activation map.');
  }else{
    const rr=median(observedIntervals(ventricularEvents));
    if(rr)config.rate=60/rr;
    timingNotes.push('Atrial timing was not measured. The reference sequence places P onset 160 ms before each estimated QRS onset; this prescribed delay is not a patient PR measurement.');
  }
  if(Number.isFinite(teaching.atrialRateEstimate))config.rate=teaching.atrialRateEstimate;
  if(profile.id==='rvh'&&record.heartAxis==='MID'){
    config.axis=60;
    timingNotes.push('This RVH recording has source axis category MID. The 60° model setting is a normal-axis illustration, not a measured patient angle or a right-axis-deviation diagnosis.');
  }
  if(profile.id==='leftaxis'||profile.id==='rightaxis')timingNotes.push('The source supplies a categorical axis annotation. The numeric angle in the reference mechanism model is illustrative, not measured from this recording.');

  const model=createEventStateModel(config,{duration,fs:record.fs||100,atrialEvents,ventricularEvents});
  // The generic engine's notes describe generating a synthetic trace. Replace
  // that wording here: original recorded samples are never generated by it.
  model.notes=[RECORDED_LIMIT,...timingNotes,...(teaching.notes||[])];
  model.timingProvenance={atrialTimingSource,qrsOnsetSource:sourceFiducials?'source-cardiologist-qrs-onsets':'fixed-offset-from-observed-extrema',qrsAnchorOffset:offset,
    qrsAnchorSource:teaching.qrsAnchorSource||'visually-selected-qrs-extrema',
    qrsDurationSource:sourceFiducials?'source-cardiologist-qrs-boundaries':'prescribed-reference-duration',mechanicsSource:'illustrative',signalSource:'recorded',
    sourceAxisCategory:record.heartAxis||null,axisMeasured:false};
  model.illustrativeMetrics={...model.metrics};
  model.metrics={...model.metrics,measuredQrsAxisDeg:null,axisIsIllustrative:true,
    prMs:null,prRangeMs:null,qrsMs:null,qrsRangeMs:null,qtMs:null,
    prPattern:complete?'No conducted PR; atrial clock illustrative':'Inspect the original trace; animation intervals are approximate.',
    metricSource:'Approximate reference timing; not validated recording measurements'};
  return model;
}

function extraProfile(record){
  const id=record.conditionId||record.teaching?.conditionId;
  const scenario=scenarioFor(id)||{}, specific=isRecordedArrhythmia(record)?recordedArrhythmiaProfile(record):EXTRA[id]||{}, supplied=record.teaching?.profile||{};
  return {...scenario,...specific,...supplied,id,recordId:record.id,synthetic:false,
    config:{...(scenario.config||{}),...(specific.config||{}),...(supplied.config||{})},
    summary:supplied.summary||specific.electrical||scenario.summary,
    headline:supplied.headline||specific.electrical||scenario.summary,
    conduction:supplied.electrical||specific.electrical||scenario.electrical,
    contraction:supplied.mechanical||specific.mechanical||scenario.mechanical,
    limitations:RECORDED_LIMIT,limitation:RECORDED_LIMIT,
    sourceAxisCategory:record.heartAxis||null,axisMeasured:false,
    coexistingFindings:record.coexistingFindings||[],
    sourceRefs:[...(scenario.sourceRefs||[]),...(specific.sourceRefs||[]),...(supplied.sourceRefs||[]),{id:record.id,title:record.source||'Source recording and metadata',url:record.recordUrl||record.sourceUrl}],
  };
}

export function decorateClinicalData(base,...collections){
  const conduction=new Set(['rbbb','lbbb','avblock1']);
  const withSource=(record,dataset={})=>({...record,attribution:record.attribution||dataset.attribution,
    license:record.license||dataset.license||'CC BY 4.0',licenseUrl:record.licenseUrl||dataset.licenseUrl,
    sourceLabel:record.sourceLabel||(record.id.startsWith('ptbxl-')?'PTB-XL '+record.id.slice(6):record.id.startsWith('mitdb-')?'MIT-BIH '+(record.ecgId||'231'):record.id.startsWith('sddb-')?'SDDB '+record.id.split('-')[1]:record.id.startsWith('ludb-')?'LUDB '+(record.ecgId||record.id.slice(5)):record.id.startsWith('acs-')?'ACS '+(record.ecgId||record.id.slice(4)):record.id)});
  const original=base.records.map(record=>({...withSource(record,base.dataset),kind:'recorded',group:conduction.has(getCondition(record).id)?'conduction':'rhythm'}));
  const additions=collections.flatMap(collection=>(collection?.records||[]).map(record=>withSource(record,collection.dataset))).map(record=>{
    const profile=extraProfile(record),model=makeExternalModel(record,profile);
    profile.config={...model.config};
    return {...record,kind:'recorded',synthetic:false,group:isRecordedArrhythmia(record)?'tachyarrhythmia':record.injuryTerritory?'ischemia':['lvh','rvh','leftaxis','rightaxis'].includes(profile.id)?'structure':'conduction',
      profile,mechanismNotes:model.notes,timingProvenance:model.timingProvenance,rateSummary:model.rateSummary||null,_stateModel:model};
  });
  return {...base,records:[...original,...additions],datasets:[base.dataset,...collections.map(c=>c?.dataset).filter(Boolean)]};
}

export function recordProfile(record){return record.profile||getCondition(record);}

export function recordState(record,time){
  if(!record._stateModel)return getClinicalState(record,time);
  const state=record._stateModel.getState(time);
  // Recorded fast rhythms already preserve their own myocardial selector.
  // Add the same explicit guide-event contract without inferring P waves or
  // assigning a normal His pathway to a ventricular-origin episode.
  if(!Object.prototype.hasOwnProperty.call(state,'conductionEvent')){
    state.conductionEvent=conductionEventAt(record._stateModel.beats||[],state.recordTime??time);
  }
  if(record.kind!=='recorded')return state;
  const provenance=record._stateModel.timingProvenance,phase={...state.phase};
  if(phase.id==='av')phase.description=provenance.atrialTimingSource==='source-cardiologist-p-onsets'?'Source P-wave and QRS-onset annotations anchor this interval. The illustrated route through the AV junction remains schematic.':'The animation places atrial activation before the next recorded ventricular landmark. Its delay is approximate; measure the original trace for a clinical PR interval.';
  if(phase.id==='atria'){
    if(provenance.atrialTimingSource==='independent-illustrative-clock'){
      phase.title='Illustrative independent atrial activation';
      phase.description='This atrial event follows an independent teaching clock. Its phase is not a measured P-wave onset from the recording.';
    }else if(provenance.atrialTimingSource==='prescribed-from-ventricular-events'){
      phase.title='Illustrative atrial activation';
      phase.description='P timing is prescribed relative to the observed ventricular landmark for this reference animation; it is not a measured atrial onset.';
    }else if(provenance.atrialTimingSource==='source-cardiologist-p-onsets')phase.description='The atrial event follows a source cardiologist’s P-wave annotation. Its propagation through the reference atria and subsequent shortening remain illustrative.';
    else phase.description='Atrial activity follows a manually estimated visible P-wave beginning. Its precise timing and subsequent shortening remain illustrative.';
  }
  if(phase.id==='escape')phase.description='The ventricular event follows an approximate recorded QRS landmark and is independent of atrial timing. Escape origin and regional spread are schematic.';
  if(record.injuryTerritory&&phase.id==='systole'){
    phase.title='ST segment · continued contraction';
    phase.description='Inspect the recorded ST level and shape in this lead while the reference ventricles continue contracting. The highlighted region is a teaching focus; ST amplitude does not measure this patient’s mechanical function.';
  }
  const currentBeat=record._stateModel.beats.find(beat=>beat.id===state.ventricularState?.id);
  return {...state,phase,qrsAnchor:currentBeat?.sourceAnchor??state.qrsAnchor,
    condition:record.conditionId||state.condition,profile:record.profile,
    injuryTerritory:record.injuryTerritory||null,
    injury:record.injuryTerritory?{territory:record.injuryTerritory,illustrative:true,label:record.injuryLabel||record.title}:null,
    synthetic:false,signalKind:'recorded',motionKind:'illustrative',timingProvenance:provenance,
    notes:record._stateModel.notes.join(' '),approximate:true};
}

export function recordBeats(record){
  if(!record._stateModel)return getClinicalBeats(record);
  const beats=record._stateModel.beats||record._stateModel.ventricularEvents||[];
  return beats.map((beat,index)=>({index,...beat,
    time:beat.sourceAnchor??beat.time??beat.anchor??beat.qrsOnset??beat.onset,
    qrsOnset:beat.qrsOnset??beat.onset??beat.time,
    title:isRecordedArrhythmia(record)?beat.label||'Ventricular event '+(index+1):beat.ectopic?'Premature ventricular beat':beat.escape?'Escape beat '+(index+1):'Beat '+(index+1)}));
}


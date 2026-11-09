/**
 * Mechanism illustrations driven by real rhythm windows and ventricular markers.
 * This module never generates or modifies a recorded ECG sample. Spatial waves,
 * recovery durations and mechanics are explanatory, not a patient reconstruction.
 */
export const ARRHYTHMIA_SOURCES = Object.freeze([
  {title:'2023 ACC/AHA/ACCP/HRS atrial fibrillation guideline',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11095842/'},
  {title:'2019 HRS/EHRA/APHRS/LAHRS ventricular arrhythmia consensus',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6595359/'},
  {title:'2019 ESC supraventricular tachycardia guideline',url:'https://academic.oup.com/eurheartj/article/41/5/655/5556821'},
  {title:'Lerma et al. (2007) · Source-adjudicated torsades in the Sudden Cardiac Death Holter Database',url:'https://pubmed.ncbi.nlm.nih.gov/17069837/'}
]);

const PROFILES={
  'af-rvr':{title:'Atrial fibrillation · rapid ventricular response',
    electrical:'Disorganized atrial activation continues while variable AV conduction produces a rapid, irregular ventricular rhythm. There is no coordinated sinus P-wave sequence.',
    mechanical:'The atria have no coordinated squeeze. Ventricular shortening follows the observed irregular events, with less time between contractions. The motion does not estimate this patient’s stroke volume or blood pressure.',
    observe:'Compare the changing R–R intervals and the absence of a consistent P-wave sequence. The ventricular rate is calculated from the recorded beat markers, not from the playback speed.'},
  vt:{title:'Ventricular tachycardia',
    electrical:'A sequence of rapid ventricular activations drives this rhythm. The normal sinus-to-AV-to-His sequence does not initiate each ventricular complex. This recording does not locate the patient’s focus or reentry circuit.',
    mechanical:'Rapid ventricular activations trigger short, closely spaced reference contractions. Atrial timing is not reconstructed. ECG amplitude and the depicted squeeze do not establish pulse, pressure or cardiac output.',
    observe:'Follow the rapid ventricular complexes and compare their morphology. The model illustrates ventricular-origin activation without assigning a patient-specific circuit.'},
  torsades:{title:'Torsades de pointes',
    electrical:'This source-identified episode has polymorphic ventricular tachycardia in a documented prolonged-QT context. The changing shape and polarity of the complexes reflect changing ventricular activation; the heart itself does not rotate.',
    mechanical:'Spatially varying activation produces an irregular reference shortening pattern. The 3D colors are schematic; the source does not provide a regional activation map or measurements of contraction.',
    observe:'Inspect the changing complex shape and amplitude during the published torsades segment. Its diagnosis is supported by the source study and prolonged-QT context, rather than by a twisting appearance alone.'},
  flutter:{title:'Atrial flutter',
    electrical:'Organized, rapid atrial activation continues between ventricular responses. The displayed loop illustrates typical right-atrial flutter; the source rhythm label alone does not prove this patient’s circuit or conduction ratio.',
    mechanical:'Rapid atrial activity continues while ventricular shortening follows the recorded ventricular markers. The atrial loop rate and phase are illustrative unless explicitly annotated.',
    observe:'Look for continuing flutter activity between QRS complexes. Compare the atrial activity with the slower ventricular responses without counting every atrial cycle as a ventricular beat.'},
  svt:{title:'Supraventricular tachycardia',
    electrical:'The source identifies a rapid supraventricular rhythm. Ventricular activation can still use the His–Purkinje system. This label alone does not establish AVNRT, AVRT or a specific atrial tachycardia circuit.',
    mechanical:'Ventricular shortening follows the measured beat sequence. Atrial activation timing is unavailable, so the model does not invent a P-wave relationship or a reentry loop.',
    observe:'Compare the fast ventricular cadence with the AF example. Inspect the original waveform for atrial activity; the source annotation supplies the rhythm category, not a complete electrophysiology diagnosis.'},
  vf:{title:'Ventricular fibrillation',
    electrical:'Spatially changing ventricular wavefronts replace a discrete, coordinated QRS sequence. The normal conduction tree no longer organizes repeated ventricular activations.',
    mechanical:'The reference ventricles show local quivering without a coordinated ejection squeeze. No beat interval or ventricular rate is assigned to the irregular oscillations.',
    observe:'Follow the changing morphology and timing. Oscillations within fibrillation are not discrete QRS complexes; previous/next-beat controls are unavailable for this segment.'}
};

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const finite=(x,f)=>typeof x==='number'&&Number.isFinite(x)?x:f;
const median=a=>{const s=a.slice().sort((x,y)=>x-y);return s.length?(s[(s.length-1)>>1]+s[s.length>>1])/2:null;};
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const envelope=(t,a,b,c,d)=>t<=a||t>=d?0:smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
const mod=(x,n)=>((x%n)+n)%n;
const VENTRICULAR=new Set(['vt','torsades','ventricular-ectopy']);

export function isRecordedArrhythmia(record){return !!PROFILES[record.teaching?.rhythmKind];}
export function recordedArrhythmiaProfile(record){
  const kind=record.teaching?.rhythmKind,base=PROFILES[kind]||{};
  return {...base,id:kind,summary:base.electrical,conduction:base.electrical,contraction:base.mechanical,
    config:{rhythm:kind,bundle:'none',avBlock:'none',axis:60},sourceRefs:ARRHYTHMIA_SOURCES};
}

export function createRecordedArrhythmiaModel(record,profile={}){
  const teaching=record.teaching||{},mainKind=teaching.rhythmKind,duration=record.seconds,fs=record.fs;
  const segments=(teaching.rhythmSegments?.length?teaching.rhythmSegments:[{start:0,end:duration,kind:mainKind}])
    .map(s=>({...s,start:clamp(finite(s.start,0),0,duration),end:clamp(finite(s.end,duration),0,duration)})).sort((a,b)=>a.start-b.start);
  const segmentAt=time=>segments.find(s=>time>=s.start&&time<s.end)||segments[segments.length-1];
  const offset=finite(teaching.anchorOffset,.04);
  const raw=teaching.ventricularAnchors||record.ventricularAnchors||[];
  const beats=raw.map((input,index)=>{
    const b=typeof input==='number'?{anchor:input}:input;
    const anchor=finite(b.sourceAnchor??b.anchor??b.time,NaN),onset=finite(b.onset??b.qrsOnset,anchor-offset);
    const kind=segmentAt(clamp(onset,0,duration-1/fs))?.kind||mainKind;
    return {...b,id:b.id||'arrhythmia-v'+index,index,time:anchor,sourceAnchor:anchor,onset,qrsOnset:onset,
      qrsDuration:finite(b.qrsDuration,finite(teaching.qrsDuration,VENTRICULAR.has(kind)?.15:.09)),
      kind,ectopic:!!b.ectopic,escape:false,atrialId:null,pr:null,approximate:true,
      label:VENTRICULAR.has(kind)?'Ventricular complex '+(index+1):'Ventricular response '+(index+1)};
  }).filter(b=>Number.isFinite(b.onset)&&Number.isFinite(b.sourceAnchor)&&b.kind!=='vf').sort((a,b)=>a.onset-b.onset);
  const intervals=beats.slice(1).map((b,i)=>b.sourceAnchor-beats[i].sourceAnchor).filter(x=>x>0);
  const nominalRR=median(intervals)||.5;
  const meanRR=intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null;
  for(let i=0;i<beats.length;i++){
    const b=beats[i];b.index=i;b.rr=i?b.onset-beats[i-1].onset:nominalRR;
    b.nextRR=i+1<beats.length?beats[i+1].onset-b.onset:nominalRR;
    const cycle=clamp(Math.min(b.rr,b.nextRR),.16,1.6);
    b.contractionDuration=clamp(cycle*.90,.16,.46);
    b.tEnd=Math.max(b.qrsDuration+.035,Math.min(.40,b.contractionDuration-.015));
    b.tStart=Math.max(b.qrsDuration+.012,b.tEnd-.09);
  }
  const summary={meanBpm:meanRR?60/meanRR:null,medianBpm:intervals.length?60/nominalRR:null,
    minBpm:intervals.length?60/Math.max(...intervals):null,maxBpm:intervals.length?60/Math.min(...intervals):null,
    measuredIntervals:intervals.length,method:teaching.qrsAnchorSource||'source-event-markers',
    approximate:record.rateSummary?.status!=='source-beat-markers',hasDiscreteBeats:beats.length>1&&mainKind!=='vf',
    sourceStatus:record.rateSummary?.status||'no-validated-beat-markers'};
  const config={...profile.config,...teaching.config,rhythm:mainKind,rate:summary.meanBpm,axis:60,bundle:'none',avBlock:'none'};
  const notes=['The waveform is the original calibrated recording. All spatial activation, recovery and contraction are illustrative.',
    beats.length?'Ventricular markers synchronize the reference motion; their source and uncertainty are listed for this record. No patient-specific circuit, pressure, ejection fraction or wall-motion map is inferred.':'No validated ventricular beat timing is assigned to this excerpt. The 3D illustration follows a schematic clock within the source-identified rhythm window; it does not align individual contractions to recorded complexes.',...(teaching.notes||[])];
  const timingProvenance={signalSource:'recorded',mechanicsSource:'illustrative',
    qrsAnchorSource:teaching.qrsAnchorSource||'source-event-markers',qrsAnchorOffset:offset,
    qrsOnsetSource:mainKind==='vf'?'not-defined-in-vf':!beats.length?'no-validated-beat-fiducials':teaching.qrsOnsetSource||'estimated-from-event-markers',
    qrsDurationSource:'illustrative',atrialTimingSource:mainKind==='af-rvr'?'disorganized-af':mainKind==='flutter'?'schematic-flutter-clock':'unavailable',
    sourceRhythmLabel:teaching.sourceRhythmLabel||null,axisMeasured:false};

  function getState(inputTime){
    const time=clamp(finite(inputTime,0),0,duration-1/fs),segment=segmentAt(time),kind=segment?.kind||mainKind;
    const vf=kind==='vf',af=kind==='af-rvr',flutter=kind==='flutter',ventricular=VENTRICULAR.has(kind);
    let v=null;for(const b of beats){if(b.onset<=time+.055)v=b;else break;}
    const untimed=!vf&&beats.length===0;
    // A source-adjudicated episode without defensible beat fiducials gets a
    // visibly disclosed schematic clock, never fabricated QRS annotations.
    const schematicCycles=4*time+.16*Math.sin(time*.9)+.07*Math.sin(time*2.3);
    const vt=v?time-v.onset:untimed?mod(schematicCycles,1)*.26:time,rr=v?.rr||nominalRR;
    const mechanics={atria:0,ra:0,la:0,lv:0,rv:0,atrialReservoir:0};
    const activation={ra:0,la:0,septum:0,lv:0,rv:0};
    if(!vf)for(const b of beats){
      const t=time-b.onset,d=b.contractionDuration;if(t<-.06||t>d+.05)continue;
      const irregular=b.kind==='torsades',gain=irregular?.38:1;
      for(const chamber of ['lv','rv']){
        const delay=irregular?(chamber==='lv'?.011:.032)+(b.index%3)*.004:chamber==='rv'?.008:0;
        mechanics[chamber]=Math.max(mechanics[chamber],gain*envelope(t,.025+delay,d*.44+delay,d*.61+delay,d+delay));
        activation[chamber]=Math.max(activation[chamber],envelope(t,.004+delay,.025+delay,b.qrsDuration*.65+delay,b.qrsDuration+.02+delay));
      }
      activation.septum=Math.max(activation.septum,envelope(t,0,.014,b.qrsDuration*.35,b.qrsDuration*.60));
    }
    const flutterRate=finite(teaching.atrialRateEstimate,300),flutterPhase=mod(time*flutterRate/60,1);
    if(af){
      activation.ra=clamp(.46+.22*Math.sin(time*42.1)+.12*Math.sin(time*57.2));
      activation.la=clamp(.44+.23*Math.sin(time*33.3+1)+.11*Math.sin(time*67.2));
    }else if(flutter){
      activation.ra=.50+.28*Math.sin(flutterPhase*Math.PI*2);
      activation.la=.46+.23*Math.sin(flutterPhase*Math.PI*2-.55);
      mechanics.ra=.035*(1+Math.sin(flutterPhase*Math.PI*2-.7));mechanics.la=.025*(1+Math.sin(flutterPhase*Math.PI*2-1.1));mechanics.atria=(mechanics.ra+mechanics.la)/2;
    }
    if(vf){activation.lv=clamp(.5+.20*Math.sin(time*29)+.13*Math.sin(time*41+1));activation.rv=clamp(.48+.24*Math.sin(time*33+2)+.12*Math.sin(time*47));}
    if(untimed){
      const p=schematicCycles*Math.PI*2;
      mechanics.lv=clamp(.14+.09*Math.sin(p)+.035*Math.sin(p*1.17),.01,.28);
      mechanics.rv=clamp(.13+.08*Math.sin(p+.8)+.035*Math.sin(p*.91),.01,.28);
      activation.lv=clamp(.46+.26*Math.sin(p));activation.rv=clamp(.43+.25*Math.sin(p+.8));
    }
    const base=PROFILES[kind]||PROFILES[mainKind];
    let phase={id:kind,title:base?.title||'Preceding ventricular activity',description:base?.electrical||'This context contains complex ventricular ectopy and runs before the source-identified torsades segment. The transition marker is approximate.'};
    if(kind==='ventricular-ectopy')phase={id:'ventricular-ectopy',title:'Preceding ectopy / ventricular runs',description:'The recorded context contains complex ventricular activity before the segment marked as torsades in the source figure. The graphical alignment is approximate; it is not a validated beat-level onset annotation.'};
    else if(!vf&&v&&vt>=0&&vt<v.qrsDuration)phase={id:ventricular?kind:'qrs',title:ventricular?(kind==='torsades'?'Changing ventricular activation':'Rapid ventricular activation'):'Ventricular response',description:ventricular?'This complex arises during the source-identified ventricular rhythm. Its exact spatial origin and pathway are not reconstructed.':'A recorded ventricular event anchors this response. Atrial activity follows its own rhythm; no measured P-to-QRS relationship is invented.'};
    else if(!vf&&v&&vt>=v.qrsDuration&&vt<v.contractionDuration)phase={id:'shortening',title:kind==='torsades'?'Irregular reference shortening':'Closely spaced ventricular contractions',description:'Electrical activation precedes reference shortening. At this cadence, the time for relaxation between events is limited. The animation does not quantify this patient’s pumping function.'};
    const timing={pStart:-.16,pEnd:-.06,qrsStart:0,qrsEnd:v?.qrsDuration||.15,tStart:v?.tStart||.18,tEnd:v?.tEnd||.25};
    const ventricularState=!vf&&v?{id:v.id,onset:v.onset,relativeTime:vt,qrsStart:0,qrsEnd:v.qrsDuration,tStart:v.tStart,tEnd:v.tEnd,ectopic:false,escape:false,atrialId:null,pr:null}:null;
    return {condition:kind,rhythmKind:kind,config,recordTime:time,time,relativeTime:vt,
      rr:vf||untimed?null:rr,nextRR:vf||untimed?null:v?.nextRR||nominalRR,qrsOnset:v?.onset??null,qrsAnchor:v?.sourceAnchor??null,
      beatIndex:vf?-1:v?.index??-1,beatCount:vf?0:beats.length,
      atrialState:null,atrialTiming:null,ventricularState,ventricularTiming:ventricularState,
      organizedAtria:false,atrialFibrillation:af,atrialFlutter:flutter,flutterPhase,
      atrialTimingUnavailable:!af&&!flutter,atrialUnavailable:!af&&!flutter,
      suppressNormalVentricularConduction:ventricular||vf,ventricularDisorganization:vf?1:kind==='torsades'?.72:0,
      noDiscreteVentricularEvents:vf||untimed,noValidatedVentricularTiming:untimed,conductionBlocked:false,avBlock:'none',bundle:'none',
      ectopic:false,ectopicFocus:null,escape:false,lvDelay:0,rvDelay:.008,hypertrophy:'none',axis:60,
      timing,activation,mechanics,phase,synthetic:false,signalKind:'recorded',motionKind:'illustrative',
      externalAnchors:true,approximate:true,segment,rateSummary:summary,timingProvenance,notes:notes.join(' ')};
  }
  return {config,duration,seconds:duration,fs,beats,atrialEvents:[],segments,rateSummary:summary,notes,timingProvenance,
    metrics:{ventricularRate:summary.meanBpm,prMs:null,qrsMs:null,qtMs:null,measuredQrsAxisDeg:null,axisIsIllustrative:true},getState};
}

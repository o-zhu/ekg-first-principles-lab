/**
 * Original, deterministic ECG teaching sandbox. Units: seconds and millivolts.
 *
 * Atrial and ventricular events are scheduled independently; their source
 * components are summed before projecting into leads. A dropped QRS therefore
 * leaves its P wave intact. Complete AV block has two independent clocks.
 * This is not a diagnostic generator or a patient-specific forward solution.
 * Chamber voltage changes and regional contraction amplitudes are illustrative.
 */
import {LEADS} from './ecg.js';
import {conductionEventAt} from './conduction-event.js';

export const SANDBOX_SOURCES = [
  {id:'av',title:'2018 ACC/AHA/HRS guideline: definitions of AV block and conduction delay',url:'https://www.ahajournals.org/doi/10.1161/CIR.0000000000000628'},
  {id:'axis',title:'AHA/ACCF/HRS ECG standards, Part III: QRS conduction and frontal axis',url:'https://doi.org/10.1016/j.jacc.2008.12.013'},
  {id:'hypertrophy',title:'AHA/ACCF/HRS ECG standards, Part V: ventricular hypertrophy patterns and limitations',url:'https://doi.org/10.1016/j.jacc.2008.12.015'},
  {id:'af',title:'2023 ACC/AHA/ACCP/HRS atrial fibrillation guideline',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11095842/'},
  {id:'pvc',title:'Real-time CMR: ventricular function varies between premature and ordinary beats',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4807630/'},
];

export const DEFAULT_SANDBOX_CONFIG = Object.freeze({
  rhythm:'sinus',rate:72,avBlock:'none',bundle:'none',hypertrophy:'none',
  axis:60,pvc:false,escapeRate:38,
});
const DURATION=12,FS=250,SQRT3_2=Math.sqrt(3)/2,TAU=2*Math.PI;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback)=>n==null||n===''?fallback:Number.isFinite(Number(n))?Number(n):fallback;
const lower=v=>String(v??'').toLowerCase().replace(/[ _-]/g,'');
const enumValue=(value,aliases,fallback)=>aliases[lower(value)]||fallback;
const avAliases={none:'none',normal:'none',first:'first',firstdegree:'first',av1:'first',avblock1:'first',mobitz1:'mobitz1',mobitzi:'mobitz1',wenckebach:'mobitz1',mobitz2:'mobitz2',mobitzii:'mobitz2',complete:'complete',chb:'complete',av3:'complete',third:'complete',thirddegree:'complete'};

/** Returns the plain, normalized configuration. See model.notes for adjustments. */
export function normalizeConfig(input={}) {
  const rhythm=enumValue(input.rhythm,{sinus:'sinus',normal:'sinus',sr:'sinus',af:'afib',afib:'afib',atrialfibrillation:'afib'},'sinus');
  let rate=clamp(finite(input.rate??input.bpm,72),30,160);
  let avBlock=enumValue(input.avBlock??input.avblock,avAliases,'none');
  if(rhythm==='afib'&&avBlock!=='complete')avBlock='none';
  // These named second-degree teaching patterns use a regular sinus atrial
  // rate, avoiding a separate atrial-tachycardia-with-block scenario.
  if(avBlock==='mobitz1'||avBlock==='mobitz2')rate=Math.min(rate,100);
  const bundle=enumValue(input.bundle,{none:'none',normal:'none',rbbb:'rbbb',right:'rbbb',lbbb:'lbbb',left:'lbbb'},'none');
  const hypertrophy=enumValue(input.hypertrophy,{none:'none',normal:'none',lvh:'lvh',lv:'lvh',left:'lvh',rvh:'rvh',rv:'rvh',right:'rvh'},'none');
  const axis=clamp(finite(input.axis,60),-180,180);
  const pvc=input.pvc===true||input.pvc===1||['true','on','yes','occasional'].includes(lower(input.pvc));
  const escapeRate=clamp(finite(input.escapeRate,38),25,rhythm==='afib'?60:Math.min(60,rate-5));
  return {rhythm,rate,avBlock,bundle,hypertrophy,axis,pvc,escapeRate};
}

const limitation='Original teaching simulation. Timing and voltage patterns explain mechanisms; they do not diagnose a patient or reconstruct measured myocardial mass, activation, strain or ejection fraction.';
const scenario=(id,title,config,electrical,mechanical,observe,recommendedLead,sourceIds)=>({
  id,conditionId:id,title,shortTitle:title,config:{...DEFAULT_SANDBOX_CONFIG,...config},
  electrical,mechanical,observe,recommendedLead,summary:electrical,limitations:limitation,
  sourceRefs:SANDBOX_SOURCES.filter(s=>sourceIds.includes(s.id)),synthetic:true,
});

export const TEACHING_SCENARIOS = {
  sinus:scenario('sinus','Normal sinus rhythm',{},'Organized atrial activation precedes each ventricular activation after AV conduction.','Atrial and ventricular shortening follow their own electrical activation, with a short mechanical delay.','Find the small P wave, the narrow QRS, and the later ventricular squeeze.','II',['av']),
  afib:scenario('afib','Atrial fibrillation',{rhythm:'afib',rate:90},'Disorganized atrial activity replaces distinct P waves; conducted ventricular intervals vary.','The atria lose their coordinated squeeze while ventricular contractions follow the irregular events.','Compare the changing R–R intervals with the continuing atrial activity.','II',['af']),
  avblock1:scenario('avblock1','First-degree AV delay',{avBlock:'first'},'PR is prolonged but every P wave is followed by a conducted QRS.','The atrial squeeze occurs earlier relative to ventricular shortening; no beat is dropped.','This model uses PR 260 ms. The full interval includes the P wave.','II',['av']),
  mobitz1:scenario('mobitz1','Mobitz I · Wenckebach',{avBlock:'mobitz1',rate:72},'PR progressively lengthens, then one P wave fails to conduct; the sequence resets.','The atria continue on time, including during the missing ventricular contraction.','Follow PR 160 → 220 → 260 ms, then a P wave without a QRS.','II',['av']),
  mobitz2:scenario('mobitz2','Mobitz II AV block',{avBlock:'mobitz2',rate:72},'Conducted beats keep the same PR interval, with an intermittently nonconducted P wave.','An atrial contraction still occurs during the dropped ventricular beat.','Compare the constant 160 ms PR before and after the isolated dropped QRS. This is a 4:3 example, not an ambiguous 2:1 pattern.','II',['av']),
  complete:scenario('complete','Complete heart block',{avBlock:'complete',rate:80,escapeRate:36},'Atrial impulses do not conduct to the ventricles. A slower escape rhythm runs independently.','The atria and ventricles contract on separate schedules, so their mechanical relationship changes.','P waves march through QRS and T. Apparent PR intervals vary and do not represent conducted PR intervals.','II',['av']),
  rbbb:scenario('rbbb','Right bundle branch block',{bundle:'rbbb'},'The left ventricle activates earlier and the right free wall is recruited late.','The right ventricular squeeze is delayed in this illustrative timing model.','Look for a late R′ in V1 and a broad terminal S in I or V6.','V1',['axis']),
  lbbb:scenario('lbbb','Left bundle branch block',{bundle:'lbbb'},'Early ventricular activation and the later left free-wall wave follow an altered sequence.','The left free wall contracts after earlier regions, illustrating dyssynchrony.','Compare the broad negative QRS in V1 with broad lateral R waves.','V6',['axis']),
  pvc:scenario('pvc','Premature ventricular beats',{pvc:true},'An early ventricular event interrupts the ordinary sequence and changes QRS morphology.','The ectopic activation produces a different timing of regional shortening.','Compare the premature broad complex with its surrounding beats and subsequent pause.','II',['pvc']),
  lvh:scenario('lvh','Left ventricular hypertrophy pattern',{hypertrophy:'lvh',axis:-15},'A larger illustrative left ventricular contribution increases lateral R and anterior S voltages.','The ECG voltage change does not, by itself, determine contraction strength or ventricular function.','Compare V1 with V5/V6. This voltage example is not a diagnosis or a calibrated estimate of wall thickness.','V5',['hypertrophy']),
  rvh:scenario('rvh','Right ventricular hypertrophy pattern',{hypertrophy:'rvh',axis:120},'The ventricular source balance shifts rightward and anteriorly, with a dominant right-precordial R pattern.','The chamber contribution changes without assuming a stronger or weaker contraction.','Compare the dominant R in V1 with the lateral S waves and rightward frontal axis.','V1',['hypertrophy']),
  leftaxis:scenario('leftaxis','Left axis deviation',{axis:-60},'The mean frontal QRS source points farther left and superiorly.','Changing electrical orientation alone leaves the contraction sequence unchanged.','Compare I, II and aVF. Axis deviation alone does not establish a particular cause.','I',['axis']),
  rightaxis:scenario('rightaxis','Right axis deviation',{axis:120},'The mean frontal QRS source points rightward and inferiorly.','Changing the source orientation alone does not imply mechanical dysfunction.','Compare negative lead I with positive aVF. This is an electrical direction, not a camera angle.','I',['axis']),
};

const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const envelope=(t,a,b,c,d)=>t<=a||t>=d?0:smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));
const bump=(t,a,b)=>t<=a||t>=b?0:Math.sin(Math.PI*(t-a)/(b-a))**2;
const mod=(a,n)=>((a%n)+n)%n;
const radians=degrees=>degrees*Math.PI/180;
const median=xs=>{const s=[...xs].sort((a,b)=>a-b);return s.length?(s[(s.length-1)>>1]+s[s.length>>1])/2:null;};
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const range=xs=>xs.length?[Math.min(...xs),Math.max(...xs)]:null;
function random(seed=93417){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

function schedule(config,duration){
  const atria=[],ventricles=[],pp=60/config.rate,pDuration=clamp(.10*Math.pow(72/config.rate,.10),.082,.118);
  if(config.rhythm==='afib'){
    if(config.avBlock!=='complete'){
      const rng=random();let q=-4,index=0;
      while(q<duration+2){const rr=Math.max(.28,pp*(.62+.76*rng()));q+=rr;ventricles.push({onset:q,id:'v'+index++,kind:'conducted',ectopic:false,escape:false,atrialId:null,pr:null});}
    }
  }else{
    const first=Math.floor((-4-.08)/pp),last=Math.ceil((duration+2-.08)/pp);
    for(let n=first;n<=last;n++){
      const onset=.08+n*pp,cycle=mod(n,4);
      let pr=config.avBlock==='first'?.26:.16,blocked=false;
      if(config.avBlock==='mobitz1'){pr=[.16,.22,.26,.30][cycle];blocked=cycle===3;}
      if(config.avBlock==='mobitz2')blocked=cycle===3;
      if(config.avBlock==='complete')blocked=true;
      const a={id:'a'+n,onset,duration:pDuration,pr:blocked?null:pr,plannedPR:pr,conducted:!blocked,dropped:blocked,blockedByAv:blocked,dropReason:blocked?'av-block':null,linkedQrsOnset:blocked?null:onset+pr};
      atria.push(a);
      if(!blocked)ventricles.push({id:'v'+n,onset:onset+pr,kind:'conducted',ectopic:false,escape:false,atrialId:a.id,pr});
    }
  }
  if(config.avBlock==='complete'){
    const rr=60/config.escapeRate,escapeOrigin=config.escapeRate<40?'ventricular':'junctional';
    for(let n=Math.floor((-4-.41)/rr);.41+n*rr<duration+2;n++)ventricles.push({id:'escape'+n,onset:.41+n*rr,kind:'escape',ectopic:false,escape:true,escapeOrigin,atrialId:null,pr:null});
  }
  ventricles.sort((a,b)=>a.onset-b.onset);
  if(config.pvc)insertPVCs(atria,ventricles,config,duration);
  return {atria,ventricles};
}

function insertPVCs(atria,ventricles,config,duration){
  const baseRR=60/(config.avBlock==='complete'?config.escapeRate:config.rate);
  for(const [serial,target]of[3.7,8.5].entries()){
    let index=-1,distance=Infinity;
    for(let i=1;i<ventricles.length-2;i++){
      const previous=ventricles[i-1],next=ventricles[i],gap=next.onset-previous.onset;
      if(previous.ectopic||next.ectopic||gap<.33||gap>baseRR*1.5||previous.onset<1||next.onset>duration-1)continue;
      if(Math.abs(next.onset-target)<distance){distance=Math.abs(next.onset-target);index=i;}
    }
    if(index<0)continue;
    const previous=ventricles[index-1],replaced=ventricles[index],gap=replaced.onset-previous.onset;
    const onset=previous.onset+Math.min(gap-.07,Math.max(.27,gap*.62));
    const pvc={id:'pvc'+serial,onset,kind:'pvc',ectopic:true,escape:false,atrialId:null,pr:null,replaces:replaced.id};
    const a=atria.find(a=>a.id===replaced.atrialId);
    if(a){a.conducted=false;a.dropped=true;a.blockedByAv=false;a.dropReason='pvc-interference';a.pr=null;a.linkedQrsOnset=null;}
    ventricles.splice(index,1,pvc);
    if(config.avBlock==='complete'){
      // A ventricular premature event restarts the illustrative escape clock;
      // the independent atrial clock is not reset by this rule.
      let k=1;
      for(let j=index+1;j<ventricles.length;j++)if(ventricles[j].escape)ventricles[j].onset=onset+k++*baseRR;
    }
    ventricles.sort((a,b)=>a.onset-b.onset);
  }
}

// Each QRS component is an elementary source with a compact support in time.
// Chest values are illustrative projections; frontal vectors share one source.
const normalQRS=[
  {region:'septum',a:0,b:.028,amp:.138564,angle:-150,chest:[.08,.12,.06,-.04,-.06,-.06]},
  {region:'lv',a:.018,b:.064,amp:.84,angle:60,chest:[-.58,-.60,.34,.91,1.03,.84]},
  {region:'rv',a:.016,b:.066,amp:.208865,angle:100,chest:[.12,.18,.16,.10,.06,.05]},
  {region:'basal',a:.060,b:.090,amp:.212836,angle:-100,chest:[-.025,-.05,-.38,-.19,-.10,-.035]},
];
function qrsComponents(kind,hypertrophy){
  let components;
  if(kind==='lbbb'||kind==='pvc'||kind==='ventricular-escape'){
    components=[
      {region:'septum',a:0,b:.080,amp:.42,angle:55,chest:[-.45,-.55,-.30,.26,.32,.32]},
      {region:'lv',a:.040,b:.125,amp:.96,angle:45,chest:[-.80,-1.0,-.55,.60,1.0,1.05]},
      {region:'basal',a:.092,b:.160,amp:.65,angle:50,chest:[-.60,-.65,-.35,.50,.85,.90]},
    ];
    if(kind==='pvc'||kind==='ventricular-escape')components=components.map(c=>({...c,a:c.a*1.09,b:c.b*1.09,amp:c.amp*1.08,chest:c.chest.map(x=>x*1.08)}));
  }else{
    components=normalQRS.map(c=>({...c,chest:[...c.chest]}));
    if(kind==='rbbb'){
      components.find(c=>c.region==='rv').amp*=.40;
      components.find(c=>c.region==='rv').chest=components.find(c=>c.region==='rv').chest.map(x=>x*.4);
      components.push({region:'rv',a:.068,b:.150,amp:.55,angle:170,chest:[.82,.68,.32,-.24,-.38,-.42]});
    }
  }
  if(hypertrophy==='lvh'){
    for(const c of components)if(c.region==='lv'||c.region==='basal'){c.amp*=2.4;c.chest=c.chest.map(x=>x*2.4);}
  }else if(hypertrophy==='rvh'){
    for(const c of components){
      if(c.region==='lv'){c.amp*=.60;c.chest=c.chest.map(x=>x*.55);}
      if(c.region==='rv'&&c.a<.04){c.amp=1.30;c.chest=[1.15,.90,.50,-.15,-.45,-.60];}
    }
    if(kind==='normal'||kind==='rbbb')components.push({region:'lv',a:.006,b:.032,amp:.06,angle:60,chest:[-.02,0,.03,.07,.10,.12]});
    // Broad left-bundle/ectopic morphology takes priority over a voltage rule;
    // a modest rightward source contribution is retained without inventing a
    // second superimposed QRS complex.
    if(!components.some(c=>c.region==='rv'))components.push({region:'rv',a:.018,b:.100,amp:.55,angle:115,chest:[.45,.35,.20,-.08,-.18,-.24]});
  }
  const qrs=Math.max(...components.map(c=>c.b));
  return {components,qrs};
}

function prepareEvents(config,raw,duration){
  const atria=raw.atria.slice().sort((a,b)=>a.onset-b.onset),ventricles=raw.ventricles.slice().sort((a,b)=>a.onset-b.onset);
  for(let i=0;i<ventricles.length;i++){
    const v=ventricles[i];
    const kind=v.ectopic?'pvc':v.escape&&v.escapeOrigin==='ventricular'?'ventricular-escape':config.bundle==='none'?'normal':config.bundle;
    const shape=qrsComponents(kind,config.hypertrophy);
    const qrs=Number.isFinite(v.qrsDuration)?clamp(v.qrsDuration,.06,.24):shape.qrs;
    const stretch=qrs/shape.qrs;
    const components=shape.components.map(c=>({...c,a:c.a*stretch,b:c.b*stretch}));
    // Rotate the entire QRS vector so its integrated frontal source direction
    // equals the requested axis, including after bundle/voltage alterations.
    let areaX=0,areaY=0;
    for(const c of components){const area=c.amp*(c.b-c.a)/2;areaX+=area*Math.cos(radians(c.angle));areaY+=area*Math.sin(radians(c.angle));}
    const intrinsicAxis=Math.atan2(areaY,areaX)*180/Math.PI,rotation=config.axis-intrinsicAxis;
    for(const c of components){c.angle+=rotation;c.x=c.amp*Math.cos(radians(c.angle));c.y=c.amp*Math.sin(radians(c.angle));}
    const nominalRR=60/(v.escape?config.escapeRate:config.rate);
    const qt=Number.isFinite(v.qt)?clamp(v.qt,qrs+.10,.8):clamp(.38*Math.sqrt(nominalRR/(60/72))+(qrs-.09)*.75,qrs+.14,.65);
    const tDuration=clamp(.18*Math.sqrt(nominalRR/(60/72)),.125,.24),tStart=Math.max(qrs+.035,qt-tDuration);
    const lvDelay=kind==='lbbb'||kind==='pvc'||kind==='ventricular-escape'?.075:0,rvDelay=kind==='rbbb'?.075:.008;
    Object.assign(v,{index:i,morphology:kind,qrsDuration:qrs,qrsOnset:v.onset,qrsEnd:v.onset+qrs,qt,tStart,tEnd:qt,components,lvDelay,rvDelay,
      time:v.onset+qrs*.45,anchor:v.onset+qrs*.45,rr:i? v.onset-ventricles[i-1].onset:nominalRR,
      nextRR:i+1<ventricles.length?ventricles[i+1].onset-v.onset:nominalRR,
      label:v.ectopic?'Premature ventricular beat':v.escape?'Independent escape beat':'Conducted beat'});
  }
  for(let i=0;i<atria.length;i++)atria[i].index=i;
  return {atria,ventricles,duration};
}

function notesFor(input,c,external=false){
  const notes=[limitation,'The same timed atrial and ventricular source events generate the tracing and drive the animation. Motion is prescribed after electrical activation; it is not calculated from ECG amplitude.'];
  if(c.rhythm==='afib'){
    notes.push(c.avBlock==='complete'?'AF remains electrically active without distinct P waves or a coordinated atrial squeeze. Complete AV block prevents atrial impulses from conducting; a regular independent escape rhythm drives the ventricles. The escape-rate control sets that cadence.':'AF uses irregular ventricular intervals and continuous small fibrillatory components, with no discrete sinus P waves or coordinated atrial squeeze. The rate control specifies an approximate mean ventricular rate.');
    notes.push('First-degree and Mobitz PR-pattern lessons require identifiable organized P waves. AF can be combined with complete AV block here because the independent escape rhythm does not depend on a measurable PR interval.');
    if(['first','mobitz1','mobitz2'].includes(enumValue(input.avBlock??input.avblock,avAliases,'none')))notes.push('The PR-pattern AV block selection was cleared when AF was chosen. Complete AV block remains available.');
  }
  if((c.avBlock==='mobitz1'||c.avBlock==='mobitz2')&&finite(input.rate??input.bpm,72)>100)notes.push('The atrial rate was capped at 100/min for this named Mobitz teaching example.');
  if(c.avBlock==='mobitz1')notes.push('The Wenckebach template uses PR 160, 220, 260 ms, followed by one nonconducted P wave. The increment becomes smaller before the dropped beat.');
  if(c.avBlock==='mobitz2')notes.push('The Mobitz II template uses a stable PR and three conducted P waves followed by one nonconducted P wave (4:3 conduction); a 2:1 pattern alone would not establish the type.');
  if(c.avBlock==='complete'){
    notes.push(c.rhythm==='afib'?'There is no conducted PR interval in AF with complete AV block. The escape focus is illustrated as ventricular below 40/min or junctional at higher settings; rate alone does not clinically establish its site.':'Atrial and escape events use independent clocks. Any apparent P-to-QRS spacing is not a conducted PR interval. The escape focus is illustrated as ventricular below 40/min or junctional at higher settings; rate alone does not clinically establish the site.');
    const ratio=c.rate/c.escapeRate;
    if(c.rhythm!=='afib'&&Math.abs(ratio-Math.round(ratio))<.025)notes.push('These chosen rates are nearly harmonic and may look temporarily phase-locked. The clocks remain independent; change either rate to make the P waves visibly march through QRS.');
  }
  if(c.pvc){
    notes.push(c.avBlock==='complete'?'A PVC restarts the prescribed escape clock while the atrial clock continues independently.':c.rhythm==='afib'?'PVCs replace selected conducted ventricular events in the irregular schedule; no fixed sinus compensatory-pause rule is imposed.':'The prescribed PVC example replaces one scheduled ventricular beat with an earlier broad event and a subsequent pause. The sinus P clock continues; not every clinical PVC has this pause pattern.');
    if(c.avBlock==='mobitz1'||c.avBlock==='mobitz2')notes.push('PVC interference is labeled separately from the programmed AV-block drop. Combining them can obscure the simple textbook block pattern.');
  }
  if(c.bundle!=='none')notes.push('Only one bundle-branch pattern is selected. A PVC or ventricular escape uses its own activation morphology rather than a second bundle-block waveform superimposed on it.');
  if(c.hypertrophy!=='none')notes.push('Hypertrophy changes an illustrative chamber voltage balance. Voltage does not measure wall thickness or contractile strength; axis, body habitus, conduction and other conditions affect clinical criteria. Secondary ST–T abnormalities are not required in this voltage example.');
  notes.push('The axis control sets the integrated frontal QRS source direction. The six limb leads obey Einthoven and Goldberger identities up to Float32 rounding. Chest morphology uses illustrative sensitivities, not a torso forward solution.');
  if(external)notes.push('External event anchors determine playback timing. Any inferred P timing, QRS duration, regional activation or contraction remains an illustrative estimate unless supplied and independently validated.');
  return notes;
}

function synthesize(config,events,duration,fs){
  const count=Math.round(duration*fs),x=new Float64Array(count),y=new Float64Array(count),chest=Array.from({length:6},()=>new Float64Array(count));
  function add(a,b,vx,vy,values){
    for(let i=Math.max(0,Math.floor(a*fs));i<=Math.min(count-1,Math.ceil(b*fs));i++){
      const p=bump(i/fs,a,b);if(!p)continue;x[i]+=vx*p;y[i]+=vy*p;
      for(let j=0;j<6;j++)chest[j][i]+=(values[j]||0)*p;
    }
  }
  for(const p of events.atria){
    add(p.onset,p.onset+p.duration,.15*Math.cos(radians(60)),.15*Math.sin(radians(60)),[0,.10,.12,.14,.13,.10]);
    add(p.onset,p.onset+p.duration*.60,0,0,[.06,0,0,0,0,0]);
    add(p.onset+p.duration*.40,p.onset+p.duration,0,0,[-.04,0,0,0,0,0]);
  }
  for(const v of events.ventricles){
    for(const c of v.components)add(v.onset+c.a,v.onset+c.b,c.x,c.y,c.chest);
    let tChest=[-.07,.15,.26,.32,.30,.25],tAngle=config.axis-10,tAmp=.28;
    if(v.morphology==='rbbb')tChest=[-.24,-.18,.10,.25,.23,.21];
    if(['lbbb','pvc','ventricular-escape'].includes(v.morphology)){tChest=[.32,.40,.23,-.16,-.26,-.25];tAngle=config.axis+180;tAmp=.25;}
    add(v.onset+v.tStart,v.onset+v.tEnd,tAmp*Math.cos(radians(tAngle)),tAmp*Math.sin(radians(tAngle)),tChest);
  }
  if(config.rhythm==='afib')for(let i=0;i<count;i++){
    const t=i/fs,fx=.022*Math.sin(TAU*6.7*t)+.010*Math.sin(TAU*9.1*t+.8),fy=.018*Math.sin(TAU*5.3*t+1.4)+.009*Math.sin(TAU*10.7*t);
    x[i]+=fx;y[i]+=fy;
    for(let j=0;j<6;j++)chest[j][i]+=(fx*Math.cos(j*.55)+fy*Math.sin(j*.55+1))*(j<2?1.4:.75);
  }
  const signals=Object.fromEntries(LEADS.map(l=>[l,new Float32Array(count)]));
  for(let i=0;i<count;i++){
    signals.I[i]=x[i];signals.II[i]=.5*x[i]+SQRT3_2*y[i];
    const I=signals.I[i],II=signals.II[i];
    signals.III[i]=II-I;signals.aVR[i]=-(I+II)/2;signals.aVL[i]=I-II/2;signals.aVF[i]=II-I/2;
    for(let j=0;j<6;j++)signals['V'+(j+1)][i]=chest[j][i];
  }
  return signals;
}

function modelMetrics(config,events,duration){
  const a=events.atria.filter(a=>a.onset>=0&&a.onset<duration),v=events.ventricles.filter(v=>v.onset>=0&&v.onset<duration);
  const rr=v.slice(1).map((b,i)=>b.onset-v[i].onset),prs=a.filter(a=>a.conducted&&Number.isFinite(a.pr)).map(a=>a.pr*1000);
  const qrs=v.map(v=>v.qrsDuration*1000),ordinary=v.filter(v=>!v.ectopic),representative=ordinary[0]||v[0];
  const prRange=range(prs),prMs=prRange&&Math.abs(prRange[1]-prRange[0])<.5?mean(prs):null;
  const relationship=config.avBlock==='complete'?(config.rhythm==='afib'?'AF with complete AV block: no discrete P waves; independent escape rhythm':'AV dissociation: independent atrial and escape clocks'):config.rhythm==='afib'?'No discrete P waves; irregular conducted ventricular events':config.avBlock==='mobitz1'?'Progressive PR, then a nonconducted P':config.avBlock==='mobitz2'?'Stable conducted PR with an intermittent nonconducted P':config.avBlock==='first'?'1:1 AV conduction with prolonged PR':'1:1 AV conduction';
  return {
    atrialRate:config.rhythm==='afib'?null:config.rate,ventricularRate:rr.length?60/mean(rr):null,
    ventricularRateRange:rr.length?range(rr.map(t=>60/t)):null,rrMs:rr.length?mean(rr)*1000:null,
    prMs,prRangeMs:prRange,prPattern:config.avBlock==='complete'?'No conducted PR':config.rhythm==='afib'?'Not defined in AF':config.avBlock==='mobitz1'?'160 → 220 → 260 ms → dropped QRS':config.avBlock==='mobitz2'?'160 ms → 160 ms → 160 ms → dropped QRS':(prMs??0).toFixed(0)+' ms',
    qrsMs:representative?.qrsDuration*1000||null,qrsRangeMs:range(qrs),qtMs:representative?.qt*1000||null,
    axisDeg:config.axis,measuredQrsAxisDeg:config.axis,
    atrialCount:a.length,conductedPCount:a.filter(a=>a.conducted).length,droppedPCount:a.filter(a=>a.dropped).length,
    avBlockedPCount:a.filter(a=>a.blockedByAv).length,ventricularCount:v.length,pvcCount:v.filter(v=>v.ectopic).length,avRelationship:relationship,
  };
}

function stateFactory(config,events,duration,fs,external=false){
  const {atria,ventricles}=events;
  return inputTime=>{
    const time=clamp(finite(inputTime,0),0,Math.max(0,duration-1/fs));
    let a=atria[0]||null,v=ventricles[0]||null;
    for(const candidate of atria)if(candidate.onset<=time)a=candidate;else break;
    for(const candidate of ventricles)if(candidate.onset<=time+.025)v=candidate;else break;
    const at=a?time-a.onset:0,vt=v?time-v.onset:0;
    const mechanics={atria:0,ra:0,la:0,lv:0,rv:0,atrialReservoir:0};
    const activation={ra:0,la:0,septum:0,lv:0,rv:0};
    for(const p of atria){
      const t=time-p.onset,d=p.duration;
      mechanics.ra=Math.max(mechanics.ra,envelope(t,.035,d+.015,d+.045,d+.135));
      mechanics.la=Math.max(mechanics.la,envelope(t,.055,d+.035,d+.060,d+.155));
      activation.ra=Math.max(activation.ra,envelope(t,0,.025,d-.025,d+.025));
      activation.la=Math.max(activation.la,envelope(t,.025,.055,d,d+.045));
    }
    mechanics.atria=(mechanics.ra+mechanics.la)/2;
    for(const beat of ventricles){
      const t=time-beat.onset,qt=beat.qt;
      for(const chamber of ['lv','rv']){
        const delay=beat[chamber+'Delay'];
        mechanics[chamber]=Math.max(mechanics[chamber],envelope(t,.035+delay,qt*.60+delay,qt*.79+delay,qt+.085+delay));
        activation[chamber]=Math.max(activation[chamber],envelope(t,.012+delay,.034+delay,.055+delay,Math.min(beat.qrsDuration+.025,.095+delay)));
      }
      activation.septum=Math.max(activation.septum,envelope(t,0,.012,.025,.045));
      mechanics.atrialReservoir=Math.max(mechanics.atrialReservoir,envelope(t,.09,qt*.55,qt*.85,qt+.13));
    }
    const af=config.rhythm==='afib';
    if(af){
      activation.ra=clamp(.46+.22*Math.sin(TAU*6.7*time)+.12*Math.sin(TAU*9.1*time+.4),0,1);
      activation.la=clamp(.44+.23*Math.sin(TAU*5.3*time+1)+.11*Math.sin(TAU*10.7*time),0,1);
    }
    const atrialState=a?{
      id:a.id,onset:a.onset,relativeTime:at,pStart:0,pEnd:a.duration,
      duration:a.duration,conducted:a.conducted,dropped:a.dropped,blockedByAv:a.blockedByAv,
      dropReason:a.dropReason,pr:a.pr,plannedPR:a.plannedPR??a.pr??.16,
      linkedQrsOnset:a.linkedQrsOnset,active:at>=0&&at<a.duration,
      activation:Math.max(activation.ra,activation.la),
    }:null;
    const ventricularState=v?{
      id:v.id,onset:v.onset,relativeTime:vt,qrsStart:0,qrsEnd:v.qrsDuration,
      tStart:v.tStart,tEnd:v.tEnd,ectopic:v.ectopic,escape:v.escape,escapeOrigin:v.escapeOrigin||null,
      morphology:v.morphology,atrialId:v.atrialId,pr:v.pr,
    }:null;
    const conductionBlocked=config.avBlock==='complete'||!!(a?.blockedByAv&&at>=0&&at<(a.plannedPR??.24)+.09);
    const pvOffset=a&&v?a.onset-v.onset:-.16;
    const timing={pStart:pvOffset,pEnd:pvOffset+(a?.duration||.10),qrsStart:0,qrsEnd:v?.qrsDuration||.09,tStart:v?.tStart||.20,tEnd:v?.tEnd||.38};
    let phase={id:'rest',title:'Filling between activations',description:'Electrical and mechanical activity have separate clocks; the walls relax before the next contraction.'};
    if(af)phase={id:'af',title:'Uncoordinated atrial activity',description:'Atrial activity continues without an organized atrial squeeze.'};
    if(a&&at>=0&&at<a.duration)phase={id:'atria',title:config.avBlock==='complete'?'Independent atrial activation':'Atrial activation',description:a.blockedByAv?'This atrial event is not conducted to the ventricles. Its P wave and atrial contraction are preserved.':'The P wave records atrial activation; the atrial squeeze follows shortly afterward.'};
    else if(a&&a.blockedByAv&&at>=a.duration&&at<(a.plannedPR??.24)+.12)phase={id:'blocked',title:config.avBlock==='complete'?'AV conduction remains blocked':'A P wave without a conducted QRS',description:'Atrial activation continues, but no ventricular event is generated by this impulse.'};
    else if(a&&a.conducted&&at>=a.duration&&time<a.linkedQrsOnset)phase={id:'av',title:config.avBlock==='first'?'Prolonged AV conduction':config.avBlock==='mobitz1'?'Progressively delayed conduction':'AV conduction delay',description:external?'The P-to-QRS timing is an approximate animation guide. Measure the original tracing rather than treating this as a validated clinical interval.':'The current conducted PR is '+Math.round(a.pr*1000)+' ms from P onset to QRS onset.'};
    if(v&&vt>=0&&vt<v.qrsDuration)phase={id:v.ectopic?'pvc':v.escape?'escape':'qrs',title:v.ectopic?'Premature ventricular activation':v.escape?'Independent escape activation':config.bundle==='rbbb'&&vt>.07?'Late right ventricular activation':config.bundle==='lbbb'&&vt>.07?'Late left ventricular activation':'Ventricular activation',description:v.escape?'The escape event is generated independently of the atrial P wave.':v.ectopic?'An illustrative ventricular focus starts an early, broad activation sequence.':'Electrical activation precedes the mechanical shortening that it triggers.'};
    else if(v&&vt>=v.qrsDuration&&vt<v.tStart)phase={id:'systole',title:'Ventricular shortening continues',description:'The ventricles can be actively contracting while the ST segment is near baseline.'};
    else if(v&&vt>=v.tStart&&vt<v.tEnd+.045)phase={id:'recovery',title:'Ventricular recovery and relaxation',description:'Repolarization and mechanical relaxation overlap. Atrial activity may continue independently.'};
    const condition=v?.ectopic?'pvc':config.bundle!=='none'?config.bundle:af?'afib':config.avBlock==='first'?'avblock1':config.avBlock!=='none'?config.avBlock:config.hypertrophy!=='none'?config.hypertrophy:'normal';
    return {
      condition,config,recordTime:time,time,relativeTime:vt,rr:v?.rr||60/config.rate,nextRR:v?.nextRR||60/config.rate,
      qrsOnset:v?.onset??0,qrsAnchor:v?.time??0,beatIndex:ventricles.filter(b=>b.onset>=0&&b.onset<=time).length-1,
      beatCount:ventricles.filter(b=>b.onset>=0&&b.onset<duration).length,
      atrialState,ventricularState,atrialTiming:atrialState,ventricularTiming:ventricularState,
      conductionEvent:conductionEventAt(ventricles,time,atria),
      organizedAtria:!af&&atria.length>0,atrialFibrillation:af,atrialUnavailable:!af&&atria.length===0,avBlock:config.avBlock,conductionBlocked,
      ectopic:!!v?.ectopic,ectopicFocus:v?.ectopic?'rv':null,escape:!!v?.escape,escapeOrigin:v?.escapeOrigin||null,
      bundle:config.bundle,hypertrophy:config.hypertrophy,axis:config.axis,axisDeg:config.axis,
      reverseSeptal:config.bundle==='lbbb',lvDelay:v?.lvDelay||0,rvDelay:v?.rvDelay||0,
      timing,activation,mechanics,phase,synthetic:true,approximate:true,externalAnchors:external,
    };
  };
}

function externalSchedule(config,options,duration){
  const inputV=options.ventricularEvents||options.beats;
  if(!Array.isArray(inputV))return schedule(config,duration);
  const ventricles=inputV.map((v,i)=>typeof v==='number'?{onset:v,id:'external-v'+i}:{...v,onset:finite(v.onset??v.qrsOnset,NaN),id:v.id||'external-v'+i})
    .filter(v=>Number.isFinite(v.onset)).map(v=>({...v,kind:v.ectopic?'pvc':(v.escape??config.avBlock==='complete')?'escape':'conducted',ectopic:!!v.ectopic,escape:!v.ectopic&&!!(v.escape??config.avBlock==='complete'),
      escapeOrigin:v.escapeOrigin||(config.avBlock==='complete'?(config.escapeRate<40?'ventricular':'junctional'):null),
      atrialId:v.atrialId??null,pr:Number.isFinite(v.pr)?v.pr:null}));
  let atria=[];
  if(config.rhythm==='afib')atria=[];
  else if(Array.isArray(options.atrialEvents))atria=options.atrialEvents.map((a,i)=>{
    if(typeof a==='number')a={onset:a};
    const onset=finite(a.onset??a.pStart,NaN),linked=finite(a.linkedQrsOnset,NaN);
    const blocked=a.blockedByAv??a.dropped??config.avBlock==='complete';
    const pr=Number.isFinite(a.pr)?a.pr:Number.isFinite(linked)?linked-onset:null;
    const conducted=a.conducted??(!blocked&&Number.isFinite(linked));
    return {...a,id:a.id||'external-a'+i,onset,duration:clamp(finite(a.duration,.10),.06,.18),conducted,dropped:!conducted,
      blockedByAv:!!blocked,dropReason:a.dropReason||(!conducted?'av-block':null),pr:conducted?pr:null,
      plannedPR:finite(a.plannedPR,pr??.16),linkedQrsOnset:conducted&&Number.isFinite(linked)?linked:null};
  }).filter(a=>Number.isFinite(a.onset));
  else if(config.rhythm!=='afib'){
    if(['mobitz1','mobitz2','complete'].includes(config.avBlock))atria=schedule({...config,pvc:false},duration).atria;
    else for(const [i,v]of ventricles.entries())if(!v.ectopic&&!v.escape){
      const pr=config.avBlock==='first'?.26:.16,id='inferred-a'+i;
      atria.push({id,onset:v.onset-pr,duration:.10,pr,plannedPR:pr,conducted:true,dropped:false,blockedByAv:false,dropReason:null,linkedQrsOnset:v.onset,inferred:true});
      v.atrialId=id;v.pr=pr;
    }
  }
  return {atria,ventricles};
}

/**
 * Reuse the timing engine with supplied event anchors, for a real-record
 * mechanism panel. Absolute ventricular onset/qrsOnset values are required;
 * a numeric ventricular event is interpreted as QRS ONSET, not an R peak.
 * Atrial inputs: {onset,duration,conducted,dropped,linkedQrsOnset,pr}.
 * If P events are omitted, their timing is explicitly inferred for teaching.
 */
export function createEventStateModel(input={},options={}) {
  const config=normalizeConfig(input),duration=clamp(finite(options.duration,DURATION),2,60),fs=clamp(finite(options.fs,FS),50,1000);
  const external=Array.isArray(options.ventricularEvents||options.beats);
  const raw=externalSchedule(config,options,duration),events=prepareEvents(config,raw,duration);
  const beats=events.ventricles.filter(v=>v.onset>=0&&v.onset<duration),atrialEvents=events.atria.filter(a=>a.onset>=0&&a.onset<duration);
  return {config,duration,seconds:duration,fs,beats,atrialEvents,metrics:modelMetrics(config,events,duration),
    notes:notesFor(input,config,external),getState:stateFactory(config,events,duration,fs,external),_events:events};
}

export function createSandboxModel(input={},options={}) {
  const base=createEventStateModel(input,options),c=base.config;
  const signals=synthesize(c,base._events,base.duration,base.fs);
  const parts=[c.rhythm==='afib'?'AFib':'Sinus '+c.rate+'/min',c.avBlock==='none'?null:c.avBlock,c.bundle==='none'?null:c.bundle.toUpperCase(),c.hypertrophy==='none'?null:c.hypertrophy.toUpperCase(),c.pvc?'PVCs':null].filter(Boolean);
  const {_events,...publicBase}=base;
  return {...publicBase,id:'sandbox',title:parts.join(' · '),source:'Original teaching simulation',synthetic:true,
    conditionId:c.avBlock!=='none'?c.avBlock:c.rhythm==='afib'?'afib':c.bundle!=='none'?c.bundle:c.hypertrophy!=='none'?c.hypertrophy:'sinus',
    leadOrder:[...LEADS],leadNames:[...LEADS],units:'mV',sampleCount:Math.round(base.duration*base.fs),signals};
}


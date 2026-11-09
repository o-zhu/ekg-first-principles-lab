/**
 * Representative local transmembrane voltages for the normal-heart lesson.
 *
 * Working-myocyte rows share the pathway-coupled timing and waveform
 * evaluator with the 3D myocardium. Specialized conduction-cell rows remain
 * prescribed educational curves informed by AP_SOURCES. Neither set recovers
 * this patient's membrane voltages or directly generates the adjacent ECG.
 * All time is seconds and voltage is intracellular minus extracellular mV.
 * Ventricular timing is shared with the 3D recovery field.
 */
import {getFiducials} from './ecg.js';
import {ventricularTimingAt,VENTRICULAR_AP_SITES} from './recovery-model.js';
import {CONDUCTION_TIMING as C,atrialConductionScale} from './conduction-timing.js';
import {electricalTimingAt,electricalReferenceAt,electricalSampleAt,electricalFieldRevision} from './electrical-field.js';
import {conductionCouplingData,coupledLVWeight,coupledTransmuralDepth} from './conduction-coupling.js';

export const AP_SOURCES=Object.freeze([
  {id:'human-optical',title:'Smirnov et al. (2020) · Human ventricular optical action potentials',url:'https://zenodo.org/records/3986725',evidence:'The imported Module 1 pooled human optical recovery template supplies working-ventricular AP shape; intrinsic upstroke and absolute voltage are assumptions.'},
  {id:'san-recording',title:'Verkerk et al. (2007) · Pacemaker current in the human sinoatrial node',url:'https://pubmed.ncbi.nlm.nih.gov/17823213/',evidence:'Patch-clamp recordings from isolated human sinoatrial pacemaker cells.'},
  {id:'san-model',title:'Fabbri et al. (2017) · Computational analysis of the human sinus node action potential',url:'https://pubmed.ncbi.nlm.nih.gov/28185290/',evidence:'Human-data-based SAN model; Table 5 compares observed and modeled membrane voltages and timing.'},
  {id:'atrial-model',title:'Courtemanche, Ramirez & Nattel (1998) · Ionic mechanisms underlying human atrial action potentials',url:'https://pubmed.ncbi.nlm.nih.gov/9688927/',evidence:'A human atrial ionic model constructed from human myocyte current recordings.'},
  {id:'avn-model',title:'Inada et al. (2009) · Atrio-nodal, nodal and nodal-His action potentials',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC2764063/',evidence:'Rabbit AV-node experiments and models support qualitative slow-response behavior; they are not human AV-node measurements.'},
  {id:'purkinje-model',title:'Stewart et al. (2009) · Action potentials of human Purkinje-fiber cells',url:'https://pubmed.ncbi.nlm.nih.gov/19414454/',evidence:'Human Purkinje-cell ionic modeling and comparison with experimental data.'},
  {id:'ventricular-model',title:'ten Tusscher & Panfilov (2006) · Human ventricular cell model',url:'https://pubmed.ncbi.nlm.nih.gov/16565318/',evidence:'Human ventricular models distinguish epicardial and endocardial electrophysiology.'},
  {id:'transmural-recording',title:'Boukens et al. (2015) · Transmural repolarization in the human left ventricular wall',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4571834/',evidence:'Human optical mapping: later epicardial activation and shorter action potentials can make recovery nearly synchronous, with modest reverse order.'},
  {id:'his-timing',title:'Lee & Lien (1975) · Human His and left bundle potentials',url:'https://pubmed.ncbi.nlm.nih.gov/1126224/',evidence:'Human intracardiac recordings inform the representative His-before-QRS timing; these local membrane-voltage curves are not His electrograms.'},
]);

export const AP_MODEL_NOTE='Transmembrane voltage is inside minus outside one cell. Atrial and ventricular working-myocyte rows evaluate the same local waveform, activation time and APD field as the 3D tissue. Ventricular activation follows the conducting tree, muscle junctions, and spread through the wall. Local APD is adjusted to retain the reference recovery pattern. Ventricular recovery uses the imported pooled human optical template; its absolute voltage and intrinsic upstroke are assumed. Atrial shape comes from the imported Courtemanche model. Timing follows this teaching model and the ECG event clock, not measurements of this patient’s cells. Nodal, His and Purkinje curves remain literature-informed illustrations; AV-node shape is informed in part by rabbit experiments. The ECG measures electrode-potential differences, not the sum of these seven voltages.';

// Locations are approximate resting coordinates in the registered heart. A
// selected point is a teaching probe, not a microscopic cell segmented in MRI.
export const AP_SITES=Object.freeze([
  {id:'sa',label:'SA node',subtitle:'Pacemaker cell',kind:'pacemaker',color:'#8bb858',location:[-.80,.53,.13],node:'sa',
    description:'Slow diastolic depolarization brings the pacemaker toward threshold. Its calcium-dependent upstroke initiates the next atrial activation.',sourceIds:['san-recording','san-model']},
  {id:'atrial',label:'Atrial muscle',subtitle:'Fast response · brief plateau',kind:'atrial',color:'#55b5a8',location:[-.845819822206,.339512345869,.107626533296],
    description:'The atrial cell has a fast upstroke and a shorter action potential than ventricular muscle. Its recovery can overlap QRS and is usually obscured on the surface ECG.',sourceIds:['atrial-model']},
  {id:'av',label:'AV node',subtitle:'Slow response · conduction delay',kind:'nodal',color:'#c49c53',location:[-.35,-.17,.03],node:'av',
    description:'Slow cell-to-cell conduction through the AV junction contributes to the PR delay. This row follows sinus input; latent AV pacemaking is not active here. The next cell can activate while this cell is still depolarized.',sourceIds:['avn-model']},
  {id:'his',label:'His bundle',subtitle:'Fast conducting tissue',kind:'conduction',color:'#9c91ce',location:[-.307049406,-.203087499,.056406845],
    description:'A representative fast-response cell in the penetrating conduction system. Its rapid upstroke precedes the main ventricular activation.',sourceIds:['avn-model','purkinje-model','his-timing']},
  {id:'purkinje',label:'Purkinje network',subtitle:'Rapid endocardial distribution',kind:'conduction',color:'#9b77bc',location:[.64,-1.125,-.004959422],
    description:'Purkinje fibers deliver activation rapidly to the ventricular endocardium. Their action potential lasts much longer than the brief impulse-propagation interval. This sinus-driven example does not model their latent escape rhythm.',sourceIds:['purkinje-model','his-timing']},
  {id:'ventricular-endo',label:'LV endocardium',subtitle:'Inner working myocardium',kind:'ventricular',color:'#d78071',location:VENTRICULAR_AP_SITES['ventricular-endo'].position,transmuralDepth:VENTRICULAR_AP_SITES['ventricular-endo'].transmuralDepth,lvWeight:VENTRICULAR_AP_SITES['ventricular-endo'].lvWeight,
    description:'This inner-wall cell uses the same pathway-coupled activation field and human-optical recovery shape as the 3D myocardium. Its recovery time is its activation time plus its local duration.',sourceIds:['human-optical','ventricular-model','transmural-recording']},
  {id:'ventricular-epi',label:'LV epicardium',subtitle:'Outer working myocardium',kind:'ventricular',color:'#6ea88a',location:VENTRICULAR_AP_SITES['ventricular-epi'].position,transmuralDepth:VENTRICULAR_AP_SITES['ventricular-epi'].transmuralDepth,lvWeight:VENTRICULAR_AP_SITES['ventricular-epi'].lvWeight,
    description:'This outer-wall cell activates later but has a shorter action potential in the mapped reference. Its voltage is sampled from the same field as the visible outer wall; recovery is not an impulse traveling backward through Purkinje fibers.',sourceIds:['human-optical','ventricular-model','transmural-recording']},
].map(site=>Object.freeze({...site,location:Object.freeze(site.location),sourceIds:Object.freeze(site.sourceIds)})));

const SITE_BY_ID=new Map(AP_SITES.map(s=>[s.id,s]));
const clamp01=x=>Math.max(0,Math.min(1,x));
const wrap=(t,rr)=>((Number.isFinite(Number(t))?Number(t):0)%rr+rr)%rr;
const smooth=x=>{x=clamp01(x);return x*x*(3-2*x);};
const mix=(a,b,u)=>a+(b-a)*smooth(u);
const hermite=(a,b,da,db,u,duration)=>{u=clamp01(u);const u2=u*u,u3=u2*u;return (2*u3-3*u2+1)*a+(u3-2*u2+u)*duration*da+(-2*u3+3*u2)*b+(u3-u2)*duration*db;};
let siteRevision=-1;
const siteCache=new Map();
/** Resolve a displayed probe from the same registered sites as the 3D tree. */
export function actionPotentialSite(id){
  const base=SITE_BY_ID.get(id&&typeof id==='object'?id.id:id)||AP_SITES[0],revision=electricalFieldRevision();
  if(revision!==siteRevision){siteCache.clear();siteRevision=revision;}
  if(siteCache.has(base.id))return siteCache.get(base.id);
  const probe=conductionCouplingData()?.probeSites?.[base.id],location=probe?.position||base.location;
  const lvWeight=base.kind==='ventricular'?coupledLVWeight(location,base.lvWeight):base.lvWeight;
  const transmuralDepth=base.kind==='ventricular'?(coupledTransmuralDepth(location,lvWeight)??base.transmuralDepth):base.transmuralDepth;
  const site=Object.freeze({...base,location,lvWeight,transmuralDepth,probe});siteCache.set(base.id,site);return site;
}
const siteFor=actionPotentialSite;
const cache=new Map();

function params(site,bpm){
  const f=getFiducials(bpm),key=site.id+'@'+f.rr+'@'+electricalFieldRevision();
  if(cache.has(key))return cache.get(key);
  const scale=Math.sqrt(f.rr/(60/72));
  let activation,upstroke,plateauStart,repolarizationStart,recovery,recoveryEnd,recovery90=null,apd90=null,rest,threshold,peak,notch,plateau,automatic=false,fieldOptions=null;
  if(site.id==='sa'){
    activation=Math.max(.010,f.pStart-C.saBeforeP);upstroke=.018*scale;
    plateauStart=activation+upstroke;
    repolarizationStart=activation+.052*scale;recovery=activation+.108*scale;recoveryEnd=activation+.172*scale;
    rest=-62;threshold=-42;peak=16;notch=16;plateau=9;automatic=true;
  }else if(site.id==='av'){
    const coupling=conductionCouplingData();
    activation=f.pStart+(site.probe?site.probe.activation*(f.pEnd-f.pStart)/coupling.reference.atrialDuration:C.atrialToAVDuration*atrialConductionScale(f.rr));upstroke=.022*scale;
    plateauStart=activation+upstroke;repolarizationStart=activation+.050*scale;
    recovery=activation+.122*scale;recoveryEnd=activation+.205*scale;
    rest=-65;threshold=-44;peak=12;notch=12;plateau=5;
  }else if(site.id==='atrial'){
    fieldOptions={...f,atrial:true,atrium:'right',rr:f.rr};
    const timing=electricalTimingAt(site.location,fieldOptions);
    activation=timing.activation;upstroke=.003;plateauStart=activation+.025*scale;
    repolarizationStart=timing.recoveryStart;recovery=timing.recoveryPeak;recoveryEnd=timing.recoveryEnd;recovery90=timing.recovery90;apd90=timing.apd90;
    rest=-80.938;threshold=rest;peak=23.911;notch=4;plateau=0;
  }else if(site.id==='his'){
    activation=f.qrsStart+(site.probe?.activation??C.hisProbeRelativeToQRS);upstroke=.0025;
    plateauStart=activation+.028*scale;repolarizationStart=f.tStart-.030*scale;
    recovery=f.tPeak-.025*scale;recoveryEnd=f.tEnd-.045*scale;
    rest=-88;threshold=rest;peak=32;notch=6;plateau=15;
  }else if(site.id==='purkinje'){
    const coupling=conductionCouplingData(),native=site.probe?.activation;
    activation=f.qrsStart+(Number.isFinite(native)?native<=0?native:native*(f.qrsEnd-f.qrsStart)/coupling.reference.ventricularDuration:C.purkinjeProbeRelativeToQRS);upstroke=.0025;
    plateauStart=activation+.035*scale;repolarizationStart=f.tStart+.010*scale;
    recovery=f.tPeak+.030*scale;recoveryEnd=Math.min(f.tEnd+.025*scale,f.rr-.010);
    rest=-90;threshold=rest;peak=34;notch=3;plateau=12;
  }else{
    // recovery-model.js is also used by the shader/software myocardium colors.
    fieldOptions={...f,lvWeight:site.lvWeight,transmuralDepth:site.transmuralDepth,rr:f.rr};
    const timing=ventricularTimingAt(site.location,fieldOptions);
    activation=timing.activation;upstroke=.003;
    plateauStart=activation+.036*scale;
    repolarizationStart=timing.recoveryStart;recoveryEnd=timing.recoveryEnd;recovery=(repolarizationStart+recoveryEnd)/2;
    recovery90=timing.recovery90;apd90=timing.apd90;
    rest=-85;threshold=rest;peak=25;notch=site.id==='ventricular-epi'?1:20;plateau=site.id==='ventricular-epi'?14:20;
  }
  // The display's rate control prescribes a smooth illustrative duration
  // adaptation. It is not a restitution model or an autonomic regulation model.
  recovery=Math.min(recovery,recoveryEnd-.008);
  repolarizationStart=Math.min(repolarizationStart,recovery-.012);
  plateauStart=Math.min(plateauStart,repolarizationStart-.008);
  if(fieldOptions)fieldOptions.reference=electricalReferenceAt(site.location,fieldOptions);
  const p={siteId:site.id,rr:f.rr,activation,upstrokeEnd:activation+upstroke,plateauStart,
    repolarizationStart,recovery,recovery90,recoveryEnd,apd:recoveryEnd-activation,apd90,
    rest,threshold,peak,notch,plateau,automatic,scale,fieldOptions,foot:site.id==='av'?.010*scale:0};
  if(cache.size>700)cache.clear();cache.set(key,Object.freeze(p));return p;
}

/** Representative landmarks in seconds in the shared one-beat ECG timebase. */
export function actionPotentialLandmarks(siteId,bpm=72){return params(siteFor(siteId),bpm);}

function voltageFrom(t,p,site){
  if(p.fieldOptions){
    const local=p.activation+wrap(t-p.activation+.004,p.rr)-.004;
    return electricalSampleAt(local,site.location,p.fieldOptions).voltage;
  }
  const rel=wrap(t-p.activation,p.rr),up=p.upstrokeEnd-p.activation;
  const peakToPlateau=p.plateauStart-p.activation,repol=p.repolarizationStart-p.activation;
  const end=p.recoveryEnd-p.activation;
  if(rel<up)return mix(p.threshold,p.peak,rel/up);
  if(site.kind==='pacemaker'||site.kind==='nodal'){
    if(rel<repol)return mix(p.peak,p.plateau,(rel-up)/(repol-up));
    if(rel<end)return mix(p.plateau,p.rest,(rel-repol)/(end-repol));
    if(p.automatic){
      // A gently accelerating phase-4 rise joins the next threshold continuously.
      const u=clamp01((rel-end)/(p.rr-end));
      return p.rest+(p.threshold-p.rest)*(.64*u+.36*u*u);
    }
    if(p.foot&&rel>p.rr-p.foot)return mix(p.rest,p.threshold,(rel-p.rr+p.foot)/p.foot);
    return p.rest;
  }
  const notchAt=up+.007*p.scale;
  if(rel<notchAt)return mix(p.peak,p.notch,(rel-up)/(notchAt-up));
  if(rel<peakToPlateau)return mix(p.notch,p.plateau,(rel-notchAt)/(peakToPlateau-notchAt));
  if(rel<repol)return mix(p.plateau,site.id==='atrial'?-10:2,(rel-peakToPlateau)/(repol-peakToPlateau));
  const phase3Start=site.id==='atrial'?-10:2;
  if(Number.isFinite(p.recovery90)){
    const at90=p.recovery90-p.activation,v90=p.rest+.10*(p.peak-p.rest);
    // A monotone Hermite join passes through exact AP90 without introducing an
    // artificial pause at -76.2 mV. The shared slope is the PCHIP harmonic mean.
    const h0=at90-repol,h1=end-at90,d0=(v90-phase3Start)/h0,d1=(p.rest-v90)/h1;
    const w0=2*h1+h0,w1=h1+2*h0,slope=(w0+w1)/(w0/d0+w1/d1);
    if(rel<at90)return hermite(phase3Start,v90,0,slope,(rel-repol)/h0,h0);
    if(rel<end)return hermite(v90,p.rest,slope,0,(rel-at90)/h1,h1);
    return p.rest;
  }
  if(rel<end)return mix(phase3Start,p.rest,(rel-repol)/(end-repol));
  return p.rest;
}

/** Local cell voltage in mV. Invalid site IDs select SA; nonfinite times use 0. */
export function actionPotentialAt(timeSeconds,siteId,bpm=72){
  const site=siteFor(siteId),p=params(site,bpm);return voltageFrom(wrap(timeSeconds,p.rr),p,site);
}

/** Live readout for a selected row; the ECG and every row use the same clock. */
export function actionPotentialState(timeSeconds,siteId,bpm=72){
  const site=siteFor(siteId),p=params(site,bpm),time=wrap(timeSeconds,p.rr),rel=wrap(time-p.activation,p.rr);
  let phase='rest',phaseLabel='Resting membrane',description='The cell is polarized and ready for its next activation.';
  if(rel<p.upstrokeEnd-p.activation){phase='upstroke';phaseLabel='Upstroke · depolarization';description=site.kind==='pacemaker'||site.kind==='nodal'?'A slow-response calcium-dependent upstroke raises the local membrane voltage.':'A rapid fast-response upstroke raises the local membrane voltage.';}
  else if(rel<p.repolarizationStart-p.activation){phase='plateau';phaseLabel=site.kind==='pacemaker'||site.kind==='nodal'?'Depolarized cell':site.kind==='atrial'?'Brief plateau':'Plateau · still depolarized';description='The local action potential continues after the propagating activation front has moved onward.';}
  else if(rel<p.recoveryEnd-p.activation){phase='repolarization';phaseLabel='Repolarization · recovery';description='Local membrane voltage returns toward its resting level. Recovery time is activation time plus local action-potential duration.';}
  else if(p.automatic){phase='diastolic';phaseLabel='Diastolic depolarization';description='Pacemaker voltage slowly rises toward the next threshold; the SA cell has no stable resting plateau.';}
  else if(p.foot&&rel>p.rr-p.foot){phase='foot';phaseLabel='Incoming activation';description='Electrotonic input brings this nodal cell toward its slow upstroke.';}
  return {siteId:site.id,time,relativeTime:rel,voltage:voltageFrom(time,p,site),phase,phaseLabel,label:phaseLabel,description,active:phase!=='rest'&&phase!=='diastolic',landmarks:p,illustrative:true};
}

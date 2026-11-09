/**
 * One working-myocardium field for the surface, section and local AP traces.
 *
 * The teaching conduction graph and actual inner-wall surface graph provide
 * one activation model. The imported Module 1 reference supplies recovery;
 * local APD adjusts to retain native recovery time when activation changes.
 * ECG fiducials prescribe global durations. Native CT fitted cases retain
 * their separate exact-source viewer and are not changed by this model.
 */
import {loadConductionCoupling,conductionCouplingData,conductionCouplingReady,conductionCouplingRevision,coupledReferenceFraction,coupledBlockReferenceFraction} from './conduction-coupling.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const R=Object.freeze({atrialStart:.03383583222017014,atrialSpan:.14172882156625665,
  ventricularStart:.21201437547424297,ventricularSpan:.09801228386561564,
  ventricularRecovery90End:.431985624525757});
export const ELECTRICAL_TRANSFER_MODEL=Object.freeze({
  title:'CT-informed myocardial voltage field',
  description:'The Module 1 reference activation and action-potential-duration fields are transferred chamber by chamber onto this deforming anatomy. Endocardial recruitment spreads through the wall; each site recovers after its own local action potential. The ventricular waveform uses pooled human optical recovery, with an assumed intrinsic upstroke and absolute voltage scale. Overall timing follows the displayed ECG.',
  limitation:'This is a teaching coordinate transfer between different hearts, not patient registration or a recovered patient activation map. Bundle block, ectopy and injury alter this reference field schematically. AF, flutter, VT, torsades and VF retain explicitly qualitative mechanisms. The separate CT fit explorer uses the actual source mesh and fitted parameters.',
  source:'./cardiac-voltage/data/heart-model.json',
  provenance:'./data/electrical-atlas.json',
  waveformAssumptions:Object.freeze({
    ventricularMeasurement:'Relative optical fluorescence pooled from two isolated human left-ventricular endocardial wedge preparations; not an in-vivo whole-heart voltage recording.',
    absoluteVoltage:'Assumed ventricular resting/peak membrane voltages of −85/+25 mV. Optical fluorescence did not measure these absolute voltages.',
    intrinsicUpstroke:'Assumed 2 ms intrinsic 10–90% upstroke; the measured optical rise is broadened by scattering and filtering.',
    atrialWaveform:'Courtemanche human-atrial ionic-model output, not a measured atrial optical waveform.',
    timing:'Chamber-transferred reference AT/APD fields adapted to the displayed ECG; not measured patient activation or recovery.'
  })
});
export const ELECTRICAL_MODEL=Object.freeze({...ELECTRICAL_TRANSFER_MODEL,
  title:'Pathway-coupled myocardial voltage field',
  description:'A connected conducting tree supplies explicit junctions on the visible inner ventricular wall. Working muscle then spreads activation along anatomical surface edges and outward through the wall. Atrial guides follow the same working-muscle surface paths as atrial activation. Local action-potential duration is adjusted to retain the imported reference recovery pattern; overall timing follows the displayed ECG.',
  limitation:'The graph, junction locations, velocities and septal transfer assumptions are teaching models on reference anatomy, not measured patient activation. Blocked ventricles receive slow septal and myocardial recruitment rather than delayed fast-tree sources. Ectopy and injury remain schematic; AF, flutter, VT, torsades and VF retain qualitative mechanisms. The separate native CT fit explorer and all recorded ECG samples are unchanged.',
  provenance:'./data/conduction-coupling.json',
  waveformAssumptions:Object.freeze({...ELECTRICAL_TRANSFER_MODEL.waveformAssumptions,timing:'Connected surface first arrivals and explicit fiber-to-muscle junctions, adapted to ECG fiducials. The 3 ms reference junction delay scales with the QRS duration and is an assumption, not a measured human constant. Native reference recovery time is retained by adjusting APD.'})
});
export const ELECTRICAL_FALLBACK_MODEL=Object.freeze({...ELECTRICAL_MODEL,
  title:'Analytic electrical teaching fallback',
  description:'The CT reference download could not load. This view uses an analytic teaching activation/APD gradient and smooth assumed action-potential shape. It is not displaying the imported CT timing or human-optical waveform.',
  source:null,provenance:null,
  waveformAssumptions:Object.freeze({absoluteVoltage:'Assumed membrane-voltage scales.',intrinsicUpstroke:'Assumed smooth finite upstroke.',timing:'Analytic educational gradients; no measured or imported CT field is loaded.'})
});
export const ELECTRICAL_PALETTE=Object.freeze(['#122e40','#21596e','#459ca3','#9ed9b0','#ffd67a']);
const colors=[[.07,.18,.25],[.13,.35,.43],[.27,.61,.64],[.62,.85,.69],[1,.84,.48]];
const gradient='linear-gradient(90deg,'+ELECTRICAL_PALETTE.join(',')+')';
export const ELECTRICAL_VIEWS=Object.freeze({
  voltage:{code:0,label:'Cell voltage',gradient,min:-85,max:25,unit:'mV',note:'Inside minus outside a working myocyte. Absolute voltage is assumed; this is not the voltage at an ECG electrode.'},
  fronts:{code:1,label:'Moving fronts',gradient:'linear-gradient(90deg,#7ddcda,#fff2af)',min:null,max:null,unit:'',note:'Gold: local upstroke. Cyan: local recovery. Front width follows the local voltage derivative; recovery is not a returning Purkinje impulse.'},
  activation:{code:2,label:'Activation time',gradient,min:0,max:100,unit:'ms',note:'Early to late recruitment. Ventricular time is measured from QRS onset; atrial time from P onset. Fine bands mark 10 ms.'},
  recovery:{code:3,label:'Recovery time',gradient,min:200,max:380,unit:'ms',note:'Local recovery90 = activation time + local APD90. The color range follows the current T-wave window; fine bands mark 10 ms.'},
  apd:{code:4,label:'AP duration',gradient,min:160,max:420,unit:'ms',note:'Duration from local activation to 90% recovery. This is not the QT interval, which also includes activation dispersion.'}
});

let atlas=null,loadPromise=null,revision=0;
export const electricalFieldRevision=()=>revision+conductionCouplingRevision();
export const electricalFieldReady=()=>!!atlas;
export const electricalFieldData=()=>atlas;
/** Interpret independent event clocks once for the shader and pathway guide. */
export function electricalSceneState(state={},bpm=72){
  const a=state.atrialState,positive=v=>Number.isFinite(v)&&v>0;
  const atrialRR=positive(a?.rr)?a.rr:positive(state.atrialPeriod)?state.atrialPeriod:
    positive(state.config?.rate)?60/state.config.rate:positive(state.rr)?state.rr:60/Math.max(1,bpm);
  const atrialAvailable=!state.atrialTimingUnavailable&&!state.atrialUnavailable&&
    !!(a||state.organizedAtria||state.atrialFibrillation||state.atrialFlutter);
  const ventricularAvailable=!state.noValidatedVentricularTiming&&!state.ventricularTimingUnavailable&&!state.ventricularUnavailable&&
    (!Object.prototype.hasOwnProperty.call(state,'ventricularState')||state.ventricularState!=null);
  const atrialQualitative=!!(state.atrialFibrillation||state.atrialFlutter),ventricularQualitative=!!state.suppressNormalVentricularConduction;
  return {atrialRR,atrialAvailable,ventricularAvailable,atrialQualitative,ventricularQualitative,
    atrialMapsAvailable:atrialAvailable&&!atrialQualitative,ventricularMapsAvailable:ventricularAvailable&&!ventricularQualitative};
}
export function installElectricalField(meta,values){
  if(meta.schemaVersion!==1||values.length!==4*meta.gridSize**3*4)throw Error('Invalid electrical reference atlas');
  if(!values.every(Number.isFinite))throw Error('Electrical reference atlas contains invalid values');
  atlas={...meta,values};revision++;return atlas;
}
export function loadElectricalField(){
  if(atlas)return Promise.resolve(atlas);if(loadPromise)return loadPromise;
  loadPromise=(async()=>{
    const metaURL=new URL('./data/electrical-atlas.json',import.meta.url),response=await fetch(metaURL);
    if(!response.ok)throw Error('Electrical field metadata could not load');
    const meta=await response.json(),binary=await fetch(new URL(meta.binaryFile,metaURL));
    if(!binary.ok)throw Error('Electrical field samples could not load');
    const installed=installElectricalField(meta,new Float32Array(await binary.arrayBuffer()));
    await loadConductionCoupling().catch(error=>console.warn('Coupled conducting field unavailable; using transferred reference activation',error));
    return installed;
  })().catch(error=>{loadPromise=null;throw error;});
  return loadPromise;
}

const leftScratch=new Float64Array(2),rightScratch=new Float64Array(2);
function sampleGrid(chamber,p,depth,out){
  const c=atlas.chambers[chamber],b=c.targetBounds,n=atlas.gridSize,
    x=clamp(((p.x??p[0])-b[0][0])/(b[1][0]-b[0][0]))*(n-1),
    y=clamp(((p.y??p[1])-b[0][1])/(b[1][1]-b[0][1]))*(n-1),
    z=clamp(((p.z??p[2])-b[0][2])/(b[1][2]-b[0][2]))*(n-1),
    ix=Math.min(n-2,Math.floor(x)),iy=Math.min(n-2,Math.floor(y)),iz=Math.min(n-2,Math.floor(z)),
    fx=x-ix,fy=y-iy,fz=z-iz,values=atlas.values;
  let at0=0,at1=0,apd0=0,apd1=0;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let d=0;d<2;d++){
    const weight=(a?fx:1-fx)*(b?fy:1-fy)*(d?fz:1-fz),i=c.offsetFloats+(((ix+a)*n+iy+b)*n+iz+d)*4;
    at0+=weight*values[i];at1+=weight*values[i+1];apd0+=weight*values[i+2];apd1+=weight*values[i+3];
  }
  out[0]=mix(at0,at1,depth);out[1]=mix(apd0,apd1,depth);return out;
}

/** Reference AT/APD in seconds, before the current ECG timing adaptation. */
export function electricalReferenceAt(position,{lvWeight=.5,transmuralDepth=0,atrial=false,atrium=null}={},out=new Float64Array(2)){
  const x=position.x??position[0],y=position.y??position[1],z=position.z??position[2],depth=clamp(transmuralDepth),lv=clamp(lvWeight);
  if(atlas){
    if(atrial)sampleGrid(atrium==='left'||atrium===3?3:atrium==='right'||atrium===4?4:x>-.28?3:4,position,.5,out);
    else{sampleGrid(1,position,depth,leftScratch);sampleGrid(2,position,depth,rightScratch);out[0]=mix(rightScratch[0],leftScratch[0],lv);out[1]=mix(rightScratch[1],leftScratch[1],lv);}
    if(conductionCouplingReady()){
      const oldRecovery=out[0]+out[1],fraction=coupledReferenceFraction(position,{lvWeight:lv,atrial,atrium});
      if(atrial)out[0]=R.atrialStart+fraction*R.atrialSpan;
      else{
        const before=out[0];sampleGrid(1,position,0,leftScratch);sampleGrid(2,position,0,rightScratch);
        const outward=Math.max(0,before-mix(rightScratch[0],leftScratch[0],lv));
        out[0]=R.ventricularStart+(fraction+outward/conductionCouplingData().reference.ventricularDuration)*R.ventricularSpan;
      }
      out[1]=oldRecovery-out[0];
    }
    return out;
  }
  // A visible, deterministic fallback if the small reference download fails.
  // Its availability is exposed on HeartScene.electricalSource; it is never
  // silently identified as an imported field.
  if(atrial){out[0]=R.atrialStart+R.atrialSpan*clamp(Math.hypot(x+.80,y-.53,z-.13)/1.8);out[1]=x>-.28?.3088:.2908;}
  else{
    const basal=clamp((y+1.28)/1.65),septal=Math.exp(-(((x-.02)/.30)**2)-(((z-.30)/.32)**2))*smooth(-1.10,-.60,y);
    out[0]=R.ventricularStart+mix(.018+.040*basal,.008+.014*(1-basal),septal)+.024*depth+.008*(1-lv);
    out[1]=.3315+.070*(.5-depth)+.0075*(basal-.5)-.035*(1-lv);
  }
  return out;
}

/** Alternate blocked-side tissue spread, supplied across the septum. */
export function electricalBlockReferenceAt(position,{transmuralDepth=0}={},out=new Float64Array(2)){
  const c=conductionCouplingData(),depth=clamp(transmuralDepth);
  for(let k=0;k<2;k++){
    const chamber=k===0?1:2,side=k===0?'lv':'rv';
    if(!c){out[k]=-1;continue;}
    let outward=.025*depth;
    if(atlas){sampleGrid(chamber,position,depth,leftScratch);const at=leftScratch[0];sampleGrid(chamber,position,0,rightScratch);outward=Math.max(0,at-rightScratch[0]);}
    const duration=c.reference.blockedDurations?.[side]||c.reference.ventricularDuration;
    const gate=c.reference.blockedEntryFractions?.[side]||0;
    out[k]=R.ventricularStart+(coupledBlockReferenceFraction(position,side)+(1-gate)*outward/duration)*R.ventricularSpan;
  }
  return out;
}

export function injuryWeightAt(p,territory=0,lvWeight=.5){
  const x=p.x??p[0],y=p.y??p[1],z=p.z??p[2];let mask=0;
  const code=typeof territory==='string'?({anterior:1,inferior:2,lateral:3,posterior:4}[territory]||0):territory;
  if(code===1)mask=smooth(.20,.76,z)*smooth(-.24,.25,x);
  else if(code===2)mask=1-smooth(-1.20,-.60,y);
  else if(code===3)mask=smooth(.48,.90,x);
  else if(code===4)mask=1-smooth(-.30,.22,z);
  return mask*clamp(lvWeight);
}

const referenceScratch=new Float64Array(2),blockScratch=new Float64Array(2);
/** Global fiducials anchor the teaching clock; local recovery is always AT+APD. */
export function electricalTimingAt(position,options={},out={}){
  const {qrsStart=0,qrsEnd=.09,tStart=.20,tEnd=.38,pStart=-.16,pEnd=-.06,
    lvWeight=.5,lvDelay=0,rvDelay=.008,ectopic=false,atrial=false,rr=60/72,
    injuryTerritory=0,injurySeverity=.70}=options;
  const ref=options.reference||electricalReferenceAt(position,options,referenceScratch),lv=clamp(lvWeight);
  const x=position.x??position[0],y=position.y??position[1],z=position.z??position[2];
  let activation,apd90,baselineActivation;
  if(atrial){
    activation=pStart+clamp((ref[0]-R.atrialStart)/R.atrialSpan)*(pEnd-pStart);
    apd90=ref[1]*clamp(Math.sqrt(rr),.55,1.40);baselineActivation=activation;
  }else{
    const extraRV=Math.max(0,rvDelay-.008),extraLV=Math.max(0,lvDelay),maxDelay=Math.max(extraRV,extraLV);
    const span=Math.max(.035,qrsEnd-qrsStart-maxDelay),a=clamp((ref[0]-R.ventricularStart)/R.ventricularSpan);
    const delay=extraLV*lv+extraRV*(1-lv);
    baselineActivation=qrsStart+a*span;
    let normal=baselineActivation+delay;
    if(conductionCouplingReady()&&(extraLV>0||extraRV>0)){
      const block=options.blockReference||electricalBlockReferenceAt(position,options,blockScratch),whole=Math.max(.035,qrsEnd-qrsStart);
      normal=baselineActivation;
      if(extraLV>0)normal=mix(normal,qrsStart+clamp((block[0]-R.ventricularStart)/R.ventricularSpan)*whole,lv);
      if(extraRV>0)normal=mix(normal,qrsStart+clamp((block[1]-R.ventricularStart)/R.ventricularSpan)*whole,1-lv);
    }
    const ectopicArrival=qrsStart+.006+Math.max(.04,qrsEnd-qrsStart)*.94*clamp(Math.hypot(x+.44,y+.91,z-.14)/2.15);
    activation=mix(normal,ectopicArrival,clamp(Number(ectopic)));
    // A common recovery-time warp preserves the reference RT ordering while
    // respecting the displayed QT window. It is timing adaptation, not APD
    // measurement or restitution. Abnormal recruitment still adds its delay.
    const scale=clamp((tEnd-qrsStart-maxDelay-.015)/R.ventricularRecovery90End,.25,2.2);
    const nativeRecovery=ref[0]-R.ventricularStart+ref[1];
    apd90=Math.max(.075,nativeRecovery*scale-(baselineActivation-qrsStart));
  }
  const injury=atrial?0:injuryWeightAt(position,injuryTerritory,lv)*clamp(injurySeverity);
  apd90*=1-.22*injury;
  out.activation=activation;out.apd90=apd90;out.recovery90=activation+apd90;
  out.recoveryStart=activation+apd90*.74;out.recoveryPeak=activation+apd90*.86;
  out.recoveryEnd=activation+apd90*1.075;out.recoveryWidth=Math.max(.015,apd90*.085);
  out.injury=injury;out.atrial=atrial;out.referenceActivation=ref[0];out.referenceApd90=ref[1];
  out.baselineActivation=baselineActivation;return out;
}

export function electricalTemplateValue(age,apd90,atrial=false){
  const t=atlas?.templates[atrial?'atrial':'ventricular'];
  if(t){
    const warped=age<=t.warpAnchor?age:t.warpAnchor+(age-t.warpAnchor)*(t.apd90-t.warpAnchor)/Math.max(.020,apd90-t.warpAnchor);
    const a=t.normalized,f=(warped-atlas.templateAgeStart)/(atlas.templateAgeEnd-atlas.templateAgeStart)*(a.length-1);
    if(f<0||f>a.length-1)return 0;const i=Math.floor(f);return mix(a[i],a[Math.min(a.length-1,i+1)],f-i);
  }
  const rise=smooth(-.001,.001,age),recovery=1-smooth(apd90*.68,apd90*1.08,age);
  return rise*recovery;
}

/** Vm and both fronts come from the SAME local waveform, including the AP row. */
export function electricalSampleAt(time,position,options={},out={}){
  const timing=electricalTimingAt(position,options,out),age=time-timing.activation,atrial=!!options.atrial;
  const t=atlas?.templates[atrial?'atrial':'ventricular'],rest=(t?.restMv??(atrial?-80.938:-85))+15*timing.injury;
  const amplitude=((t?.peakMv??25)-(t?.restMv??(atrial?-80.938:-85)))*(1-.30*timing.injury);
  const q=electricalTemplateValue(age,timing.apd90,atrial),before=electricalTemplateValue(age-.0015,timing.apd90,atrial),after=electricalTemplateValue(age+.0015,timing.apd90,atrial),slope=(after-before)/.003;
  out.voltage=rest+amplitude*q;out.normalized=clamp((out.voltage+85)/110);out.depolarized=q;
  out.front=clamp(slope*.005);out.back=clamp(-slope*.060);return out;
}

export function electricalColor(value,out=[0,0,0]){
  const q=clamp(value)*4,k=Math.min(3,Math.floor(q)),f=q-k;for(let i=0;i<3;i++)out[i]=mix(colors[k][i],colors[k+1][i],f);return out;
}
export function electricalDisplayColorAt(anatomy,field,{view=0,phase=0,atrial=false,pStart=-.16,pEnd=-.06,qrsStart=0,qrsEnd=.09,tStart=.20,tEnd=.38,enabled=1}={},out=[0,0,0]){
  const blend=(target,t)=>{for(let i=0;i<3;i++)out[i]=mix(out[i],target[i],t);};
  for(let i=0;i<3;i++)out[i]=anatomy[i];
  if(view<1.5){
    if(view<.5){blend(electricalColor(field.normalized),.88);blend([1,.96,.69],field.front*.55);}
    else{blend([.09,.19,.25],.40);blend([1,.94,.58],field.front*.98);blend([.24,.90,.86],field.back*.86);}
  }else{
    let q=0,value=field.activation;
    if(view<2.5){const a=atrial?pStart:qrsStart,b=atrial?pEnd:qrsEnd;q=(field.activation-a)/Math.max(.01,b-a);}
    else if(view<3.5){value=field.recovery90;q=(value-(atrial?pStart+.16:tStart))/Math.max(.03,atrial?.28:tEnd-tStart);}
    else{value=field.apd90;q=(value-.160)/.260;}
    electricalColor(q,out);
    const raw=value/.010+.5,band=Math.abs(raw-Math.floor(raw)-.5),isoline=1-smooth(.035,.12,band);
    blend([.02,.08,.13],isoline*.23);
    if(view<3.5)blend([1,.98,.84],Math.exp(-(((phase-value)/.0035)**2))*.55);
  }
  for(let i=0;i<3;i++)out[i]=mix(anatomy[i],out[i],enabled);return out;
}
export function electricalTextureBytes(){
  const size=2048,bytes=new Uint8Array(size*2*4);
  for(let row=0;row<2;row++)for(let i=0;i<size;i++){
    const age=-.012+i/(size-1)*1.012,q=electricalTemplateValue(age,row?.296802303:.300,!!row),value=Math.round(clamp(q)*65535),at=(row*size+i)*4;
    bytes[at]=value>>8;bytes[at+1]=value&255;bytes[at+3]=255;
  }
  return bytes;
}
export function electricalViewRange(view,state={}){
  const f=state.timing||{},q=f.qrsStart||0;
  if(view==='activation')return {min:0,max:Math.round(((f.qrsEnd??.09)-q)*1000),unit:'ms after QRS onset'};
  if(view==='recovery')return {min:Math.round(((f.tStart??.20)-q)*1000),max:Math.round(((f.tEnd??.38)-q)*1000),unit:'ms after QRS onset'};
  if(view==='apd')return {min:160,max:420,unit:'ms'};
  return {min:ELECTRICAL_VIEWS[view]?.min??-85,max:ELECTRICAL_VIEWS[view]?.max??25,unit:ELECTRICAL_VIEWS[view]?.unit??'mV'};
}

const gl=x=>Number(x).toFixed(9);
// This is intentionally the same timing and template evaluator as above.
// aElectricalReference carries native AT/APD, and survives section interpolation.
export const ELECTRICAL_FIELD_GLSL=`
uniform highp sampler2D uElectricalTemplate;
uniform float uElectricalView;
uniform float uRR;
uniform float uInjurySeverity;
varying vec2 vElectricalReference;
vec3 electricalPalette(float v){
  float q=clamp(v,0.0,1.0)*4.0;
  if(q<1.0)return mix(vec3(.07,.18,.25),vec3(.13,.35,.43),q);
  if(q<2.0)return mix(vec3(.13,.35,.43),vec3(.27,.61,.64),q-1.0);
  if(q<3.0)return mix(vec3(.27,.61,.64),vec3(.62,.85,.69),q-2.0);
  return mix(vec3(.62,.85,.69),vec3(1.0,.84,.48),q-3.0);
}
float electricalInjury(vec3 p,float territory,float lv){
  float w=0.0;
  if(territory>0.5&&territory<1.5)w=smoothstep(.20,.76,p.z)*smoothstep(-.24,.25,p.x);
  else if(territory>1.5&&territory<2.5)w=1.0-smoothstep(-1.20,-.60,p.y);
  else if(territory>2.5&&territory<3.5)w=smoothstep(.48,.90,p.x);
  else if(territory>3.5)w=1.0-smoothstep(-.30,.22,p.z);
  return w*lv;
}
vec4 mappedElectricalTiming(vec3 p,vec2 ref,vec2 blockRef,float lv,float atrial,float pStart,float pEnd,
  float qStart,float qEnd,float tEnd,float lvDelay,float rvDelay,float ectopic,float injury){
  float activation,apd;
  if(atrial>.5){
    activation=pStart+clamp((ref.x-${gl(R.atrialStart)})/${gl(R.atrialSpan)},0.0,1.0)*(pEnd-pStart);
    apd=ref.y*clamp(sqrt(uRR),.55,1.40);
  }else{
    float er=max(0.0,rvDelay-.008),el=max(0.0,lvDelay),md=max(er,el);
    float span=max(.035,qEnd-qStart-md),a=clamp((ref.x-${gl(R.ventricularStart)})/${gl(R.ventricularSpan)},0.0,1.0);
    float baseline=qStart+a*span,delay=mix(er,el,lv);
    float ectopicArrival=qStart+.006+max(.04,qEnd-qStart)*.94*clamp(length(p-vec3(-.44,-.91,.14))/2.15,0.0,1.0);
    float recruited=baseline+delay;
    // Valid alternate coordinates encode tissue-only recruitment from the
    // intact side of the septum. A negative sentinel preserves the old atlas
    // fallback without silently representing it as a causal blocked field.
    if(blockRef.x>0.0&&blockRef.y>0.0&&(er>0.0||el>0.0)){
      float whole=max(.035,qEnd-qStart);recruited=baseline;
      if(el>0.0)recruited=mix(recruited,qStart+clamp((blockRef.x-${gl(R.ventricularStart)})/${gl(R.ventricularSpan)},0.0,1.0)*whole,lv);
      if(er>0.0)recruited=mix(recruited,qStart+clamp((blockRef.y-${gl(R.ventricularStart)})/${gl(R.ventricularSpan)},0.0,1.0)*whole,1.0-lv);
    }
    activation=mix(recruited,ectopicArrival,clamp(ectopic,0.0,1.0));
    float scale=clamp((tEnd-qStart-md-.015)/${gl(R.ventricularRecovery90End)},.25,2.2);
    apd=max(.075,(ref.x-${gl(R.ventricularStart)}+ref.y)*scale-(baseline-qStart));
  }
  apd*=1.0-.22*injury;
  return vec4(activation,apd,activation+apd,injury);
}
float electricalTemplate(float age,float apd,float atrial){
  float templateAPD=mix(.300,.296802303,atrial),anchor=.004;
  float warped=age<=anchor?age:anchor+(age-anchor)*(templateAPD-anchor)/max(.020,apd-anchor);
  float q=(warped+.012)/1.012;if(q<0.0||q>1.0)return 0.0;
  // Interpolate the two 16-bit values explicitly. Hardware filtering of an
  // RGBA8 packed texture can quantize channels before decoding, amplifying
  // otherwise tiny voltage errors in the derivative-based recovery front.
  float f=q*2047.0,i=floor(f),row=mix(.25,.75,atrial);
  vec2 a=texture2D(uElectricalTemplate,vec2((.5+i)/2048.0,row)).rg;
  vec2 b=texture2D(uElectricalTemplate,vec2((.5+min(i+1.0,2047.0))/2048.0,row)).rg;
  vec2 encoded=mix(a,b,f-i);
  return (encoded.r*65280.0+encoded.g*255.0)/65535.0;
}
vec4 electricalWaveform(float phase,vec4 timing,float atrial){
  float age=phase-timing.x,q=electricalTemplate(age,timing.y,atrial);
  float slope=(electricalTemplate(age+.0015,timing.y,atrial)-electricalTemplate(age-.0015,timing.y,atrial))/.003;
  float rest=mix(-85.0,-80.938007426,atrial)+15.0*timing.w;
  float amp=mix(110.0,104.848975124,atrial)*(1.0-.30*timing.w);
  return vec4(clamp((rest+amp*q+85.0)/110.0,0.0,1.0),clamp(slope*.005,0.0,1.0),clamp(-slope*.060,0.0,1.0),q);
}
vec3 electricalDisplayColor(vec3 anatomy,vec4 field,vec4 timing,float phase,float atrial,float pStart,float pEnd,float qStart,float qEnd,float tStart,float tEnd,float enabled){
  vec3 result=mix(anatomy,electricalPalette(field.x),.88);
  if(uElectricalView<.5){result=mix(result,vec3(1.0,.96,.69),field.y*.55);}
  else if(uElectricalView<1.5){
    result=mix(anatomy,vec3(.09,.19,.25),.40);
    result=mix(result,vec3(1.0,.94,.58),field.y*.98);
    result=mix(result,vec3(.24,.90,.86),field.z*.86);
  }else{
    float q=0.0,value=timing.x;
    if(uElectricalView<2.5){float a=mix(qStart,pStart,atrial),b=mix(qEnd,pEnd,atrial);q=(timing.x-a)/max(.01,b-a);}
    else if(uElectricalView<3.5){value=timing.z;q=(timing.z-mix(tStart,pStart+.16,atrial))/max(.03,mix(tEnd-tStart,.28,atrial));}
    else{value=timing.y;q=(timing.y-.160)/.260;}
    result=electricalPalette(q);
    float band=abs(fract(value/.010+.5)-.5),isoline=1.0-smoothstep(.035,.12,band);
    result=mix(result,vec3(.02,.08,.13),isoline*.23);
    if(uElectricalView<3.5){float cursor=exp(-pow((phase-value)/.0035,2.0));result=mix(result,vec3(1.0,.98,.84),cursor*.55);}
  }
  return mix(anatomy,result,enabled);
}`;

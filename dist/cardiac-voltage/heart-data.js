// Recorded optical signals and a separate, explicitly modeled whole-heart field.
export const datasets={human:new Map(),model:null,error:null};
const inflight=new Map();
const modelRuntime=new WeakMap();
const clampProgress=p=>Math.max(0,Math.min(1,p));
async function fetchJSON(url){const r=await fetch(url);if(!r.ok)throw Error(`Could not load ${url} (${r.status})`);return r.json();}
async function fetchBytes(url,Type){const r=await fetch(url);if(!r.ok)throw Error(`Could not load ${url} (${r.status})`);return new Type(await r.arrayBuffer());}
function loadImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});}
export function loadHuman(donor=1){
  if(datasets.human.has(donor))return Promise.resolve(datasets.human.get(donor));
  const key='human'+donor;if(inflight.has(key))return inflight.get(key);
  const p=(async()=>{
    const root='./data/human/',meta=await fetchJSON(root+`donor${donor}-metadata.json`);
    const [voltage,mask,timings,background]=await Promise.all([fetchBytes(root+meta.voltage_file,Uint8Array),fetchBytes(root+meta.mask_file,Uint8Array),fetchBytes(root+meta.timing_file,Float32Array),loadImage(root+meta.background_file)]);
    const valid=[];for(let i=0;i<mask.length;i++)if(mask[i])valid.push(i);
    const best=valid.reduce((a,b)=>timings[50000+a]>timings[50000+b]?a:b,valid[0]);
    const d={meta,voltage,mask,timings,background,valid,best,donor,nodes:10000,frames:meta.display_samples,dt:meta.display_dt_ms,duration:meta.display_samples*meta.display_dt_ms};
    datasets.human.set(donor,d);return d;
  })();inflight.set(key,p);return p;
}
export async function loadSingleBeat(donor=1){const d=await loadHuman(donor);if(!d.single)d.single=await fetchBytes(`./data/human/donor${donor}-single-beat.u8`,Uint8Array);return d.single;}
export function humanValue(d,node,progress,single=false){
  if(!d||!d.mask[node])return NaN;
  const b=single&&d.single?d.single:d.voltage,f=Math.max(0,Math.min(d.frames-1,progress*(d.frames-1))),i=Math.floor(f),u=f-i,j=Math.min(i+1,d.frames-1);
  return (b[i*10000+node]*(1-u)+b[j*10000+node]*u)/255*1.5-.25;
}
export function loadHeartModel(){
  if(datasets.model)return Promise.resolve(datasets.model);if(inflight.has('model'))return inflight.get('model');
  const p=(async()=>{
    const d=await fetchJSON('./data/heart-model.json');
    d.geometry.positions=d.geometry.positions||d.geometry.vertices;
    d.nodeCount=d.geometry.positions.length/3;d.frames=d.time.frames;d.dt=d.time.dtMs;d.duration=(d.frames-1)*d.dt;
    for(const [key,v] of Object.entries(d.variants)){v.key=key;if(v.vmFile)v.vm=await fetchBytes('./data/'+v.vmFile,Uint16Array);}
    if(d.schemaVersion>=2&&d.field)runtimeFor(d);
    if(d.referenceECGFile)d.referenceECG=await fetchJSON('./data/'+d.referenceECGFile);
    datasets.model=d;return d;
  })();inflight.set('model',p);return p;
}
export function modelVariant(d,s){return d?.variants[s.modelVariant]||d?.variants.heterogeneous;}
function runtimeFor(d){
  if(modelRuntime.has(d))return modelRuntime.get(d);
  const r={frame:new Float32Array(d.nodeCount),frameProgress:NaN,frameVariant:null,traces:new Map()};
  if(d.schemaVersion>=2&&d.field){
    r.activation=new Float64Array(d.field.sourceActivationMs);r.type=new Uint8Array(d.field.sourceType);
    r.indices=new Uint32Array(d.field.renderIndices);r.weights=new Float64Array(d.field.renderWeights);r.sourceVm=new Float64Array(r.activation.length);
    r.templates=new Map(Object.values(d.variants).map(v=>[v,['ventricular','atrial'].map(name=>{const t=(v.templates||d.templates)[name];return {...t,normalized:new Float64Array(t.normalized)};})]));
    r.apd=new Map(Object.values(d.variants).map(v=>[v,new Float64Array(v.sourceApd90Ms)]));
  }
  modelRuntime.set(d,r);return r;
}
// This evaluator is shared by selected-site traces and full surface playback.
// AP timing and chamber-specific shapes remain unchanged by surface decimation.
function sourceValue(r,source,time,apd,templates){
  const t=templates[r.type[source]],age=time-r.activation[source],anchor=t.warpAnchorMs??0;
  const warped=age<=anchor?age:anchor+(age-anchor)*(t.apd90Ms-anchor)/(apd[source]-anchor);
  const f=(warped+t.activationMs)/t.dtMs,a=t.normalized;
  let q=0;
  if(f>=0&&f<=a.length-1){const i=Math.floor(f),u=f-i;q=a[i]*(1-u)+a[Math.min(i+1,a.length-1)]*u;}
  return t.restMv+(t.peakMv-t.restMv)*q;
}
function resolvedVariant(d,name){return d.variants[name]||d.variants.heterogeneous;}
export function modelValue(d,node,progress,variant='heterogeneous'){
  if(!d)return 0;const v=resolvedVariant(d,variant);
  if(d.schemaVersion>=2&&d.field){
    const r=runtimeFor(d),apd=r.apd.get(v),templates=r.templates.get(v),time=clampProgress(progress)*d.duration;let value=0;
    for(let k=0;k<4;k++){const q=node*4+k,w=r.weights[q];if(w)value+=w*sourceValue(r,r.indices[q],time,apd,templates);}
    return value;
  }
  const f=clampProgress(progress)*(d.frames-1),i=Math.floor(f),u=f-i,j=Math.min(i+1,d.frames-1);
  const encoding=d.encoding||{},min=encoding.minMv??encoding.min??-85,max=encoding.maxMv??encoding.max??25;
  return min+(max-min)*(v.vm[i*d.nodeCount+node]*(1-u)+v.vm[j*d.nodeCount+node]*u)/65535;
}
export function modelFrame(d,progress,variant='heterogeneous'){
  if(!d)return new Float32Array();const r=runtimeFor(d),p=clampProgress(progress),v=resolvedVariant(d,variant);
  if(r.frameProgress===p&&r.frameVariant===v)return r.frame;
  if(d.schemaVersion>=2&&d.field){
    const time=p*d.duration,apd=r.apd.get(v),templates=r.templates.get(v);
    for(let source=0;source<r.sourceVm.length;source++)r.sourceVm[source]=sourceValue(r,source,time,apd,templates);
    for(let node=0;node<d.nodeCount;node++){let value=0;for(let k=0;k<4;k++){const q=node*4+k,w=r.weights[q];if(w)value+=w*r.sourceVm[r.indices[q]];}r.frame[node]=value;}
  }else for(let node=0;node<d.nodeCount;node++)r.frame[node]=modelValue(d,node,p,variant);
  r.frameProgress=p;r.frameVariant=v;return r.frame;
}
export function modelTrace(d,node,variant='heterogeneous'){
  const r=runtimeFor(d),key=variant+'|'+node;
  if(!r.traces.has(key)){const values=new Float32Array(d.frames);for(let i=0;i<d.frames;i++)values[i]=modelValue(d,node,i/(d.frames-1),variant);if(r.traces.size>=48)r.traces.delete(r.traces.keys().next().value);r.traces.set(key,values);}
  return r.traces.get(key);
}
export function modelChamber(d,node){return ({1:'LV',2:'RV',3:'LA',4:'RA'})[d?.nodes.chamber?.[node]]||'';}
export function modelECG(d,p,lead='II',variant='heterogeneous',polarity=1,component='total',resolution='native'){
  if(!d)return 0;const v=resolvedVariant(d,variant),collection=component==='atrial'?v.ecgAtrial:component==='ventricular'?v.ecgVentricular:v.ecg;
  const sampled=variant==='heterogeneous'&&component==='total'&&resolution!=='native'?d.sourceSampling?.[resolution]?.ecg:null;
  const a=sampled?.[lead]||collection?.[lead]||collection?.II;if(!a)return 0;const f=clampProgress(p)*(a.length-1),i=Math.floor(f),u=f-i;
  return polarity*(a[i]*(1-u)+a[Math.min(i+1,a.length-1)]*u);
}
export function heartReady(s){return s.heartMode==='measured'?datasets.human.get(s.donor):datasets.model;}
export function heartReading(s,p=s.progress){const d=heartReady(s);if(!d)return 0;return s.heartMode==='measured'?humanValue(d,s.selectedPixel??d.best,p,s.singleBeat):modelECG(d,p,s.heartLead,s.modelVariant,s.polarity,s.heartECGComponent||'total',s.heartResolution||'native');}
export function referenceECG(d,p,lead='II',variant='heterogeneous'){
  const r=d?.referenceECG;if(!r)return NaN;
  const a=r.allLeadsMv[lead]||r.allLeadsMv[lead.toLowerCase()]||(lead==='II'?r.leadIIMv:null);if(!a)return NaN;
  const time=p*d.duration-(d.variants[variant]?.summary.rPeakMs??0),f=(time-r.startRelativeRMs)/r.dtMs;
  if(f<0||f>a.length-1)return NaN;const i=Math.floor(f),u=f-i;return a[i]*(1-u)+a[Math.min(i+1,a.length-1)]*u;
}

/** Causal guide propagation on the shipped source cavity surfaces. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import {installElectricalField,electricalTimingAt} from '../dist/electrical-field.js';
import {createEventStateModel} from '../dist/pathology-model.js';
import {decorateClinicalData,recordState} from '../dist/clinical-adapter.js';
import {installConductionCoupling} from '../dist/conduction-coupling.js';

const raw=fs.readFileSync(new URL('../dist/data/electrical-atlas.f32',import.meta.url));
installElectricalField(JSON.parse(fs.readFileSync(new URL('../dist/data/electrical-atlas.json',import.meta.url))),new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
const coupled=process.argv.includes('--coupled')?installConductionCoupling(JSON.parse(fs.readFileSync(new URL('../dist/data/conduction-coupling.json',import.meta.url)))):null;
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{makeConductionSystem,updateConductionSystem,conductionTimeAtFraction}=await import('../dist/conduction-system.js');
const glb=fs.readFileSync(new URL('../dist/models/heart-medium.glb',import.meta.url)),jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),binaryOffset=28+jsonLength;
function accessor(id){
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],components=a.type==='VEC3'?3:1,bytes=a.componentType===5123?2:4;
  const array=a.componentType===5126?new Float32Array(a.count*components):new Uint32Array(a.count*components),offset=binaryOffset+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*bytes;
  for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){const p=offset+i*stride+j*bytes;array[i*components+j]=a.componentType===5126?glb.readFloatLE(p):bytes===2?glb.readUInt16LE(p):glb.readUInt32LE(p);}
  return array;
}
const meshes={};
for(const name of ['left-ventricle','right-ventricle']){
  const p=gltf.meshes.find(m=>m.name===name).primitives[0],geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(accessor(p.attributes.POSITION),3));
  geometry.setIndex(new THREE.BufferAttribute(accessor(p.indices),1));meshes[name]=new THREE.Mesh(geometry);
}
const network=makeConductionSystem(meshes,{software:true});
const update=state=>updateConductionSystem(network,state,{enabled:true,deform:false,cutaway:true});
let geometricJunctions=0;
for(const child of network.paths.filter(p=>p.parentId)){
  const parent=network.pathById.get(child.parentId);
  assert.ok(parent,child.id+' needs an explicit supplying path');
  assert.ok(child.curve.getPoint(0).distanceTo(parent.curve.getPoint(child.parentFraction))<1e-9,child.id+' must meet its parent in the source anatomy');
  geometricJunctions++;
}
assert.equal(network.paths.filter(p=>p.id.startsWith('cross-')).length,0,'No invented septal crossing is used as the source of the mapped field');

let junctionStates=0,matchedTargets=0,maxJunctionDistance=0,maxJunctionTimingError=0,maxEndpointMismatch=0,blockedStates=0;
let recruitingJunctionChecks=0,minJunctionDelay=Infinity,maxJunctionDelay=-Infinity,maxMyocardialTimingError=0;
for(const bundle of ['none','rbbb','lbbb'])for(const rate of [45,72,120,180]){
  const model=createEventStateModel({bundle,rate}),beat=model.beats.find(b=>b.onset>2),base=model.getState(beat.onset+.05);update(base);
  const checks=network.paths.filter(p=>p.parentId&&p.schedule.supported).map(p=>({id:p.id,time:base.recordTime+p.schedule.start-p.schedule.clock}));
  for(const check of checks){
    const state=model.getState(check.time);update(state);
    const child=network.pathById.get(check.id),parent=network.pathById.get(child.parentId);
    assert.ok(child.pulse.visible&&parent.pulse.visible,`${bundle} ${rate}: ${check.id} and its supplier must both be visible at the junction`);
    assert.ok(Math.abs(child.progress)<1e-8,child.id+' starts at its own origin');
    assert.ok(Math.abs(parent.progress-child.parentFraction)<1e-8,child.id+' waits for its supplier');
    maxJunctionTimingError=Math.max(maxJunctionTimingError,Math.abs(parent.progress-child.parentFraction)*parent.schedule.duration);
    const distance=child.pulse.position.distanceTo(parent.pulse.position);maxJunctionDistance=Math.max(maxJunctionDistance,distance);
    assert.ok(distance<1e-8,child.id+' pulse handoff remains joined after cardiac deformation');junctionStates++;
  }
  update(base);
  if(coupled){
    const f=base.timing,span=Math.max(.035,f.qrsEnd-f.qrsStart-Math.max(Math.max(0,base.lvDelay||0),Math.max(0,(base.rvDelay||0)-.008)));
    for(const source of coupled.junctions.filter(s=>s.recruits&&!(bundle==='lbbb'&&s.side==='left'||bundle==='rbbb'&&s.side==='right'))){
      const path=network.pathById.get(source.pathId),fiber=conductionTimeAtFraction(path.schedule,source.fraction),expected=f.qrsStart+source.muscleArrival/coupled.reference.ventricularDuration*span;
      const tissue=electricalTimingAt(source.position,{...f,lvWeight:source.side==='left'?1:0,transmuralDepth:0,lvDelay:base.lvDelay,rvDelay:base.rvDelay}).activation;
      const error=Math.abs(tissue-expected);maxMyocardialTimingError=Math.max(maxMyocardialTimingError,error);
      assert.ok(error<1e-7,source.id+' uses the same source graph as visible muscle');assert.ok(tissue>fiber,source.id+' muscle must follow fiber delivery');
      minJunctionDelay=Math.min(minJunctionDelay,tissue-fiber);maxJunctionDelay=Math.max(maxJunctionDelay,tissue-fiber);recruitingJunctionChecks++;
    }
  }
  for(const path of network.paths.filter(p=>p.schedule.supported&&p.mappedDeliveryTime!==null)){
    const expected=electricalTimingAt(path.deliveryPoint,{...base.timing,lvWeight:path.side==='left'?1:0,transmuralDepth:0,lvDelay:base.lvDelay,rvDelay:base.rvDelay,reference:path.deliveryReference}).activation;
    const mismatch=Math.abs(path.schedule.end-expected);maxEndpointMismatch=Math.max(maxEndpointMismatch,mismatch);
    assert.ok(mismatch<1e-9,`${bundle} ${rate}: intact target ${path.id} must retain its mapped myocardial AT`);matchedTargets++;
  }
  if(bundle!=='none')for(let dt=-.055;dt<.20;dt+=.0025){
    update(model.getState(beat.onset+dt));const side=bundle==='rbbb'?'right':'left';
    assert.ok(network.paths.filter(p=>p.side===side).every(p=>!p.pulse.visible),'A blocked proximal bundle cannot deliver a fictitious distal fast pulse');
    assert.ok(network.paths.filter(p=>p.side===side&&!p.id.endsWith('bundle')).every(p=>p.mesh.visible),'The interrupted-side guide anatomy remains available');blockedStates++;
  }
}

// Real-record timing adaptations must preserve the same target behavior, even
// though neither these guide fibers nor the mapped anatomy were measured in
// those patients. Qualitative/unsupported pathways are excluded by their flags.
const load=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name+'.json',import.meta.url)));
const clinical=decorateClinicalData(load('clinical-ecgs'),load('clinical-extra'),load('clinical-mobitz2'),load('clinical-tachyarrhythmias'),load('clinical-torsades'));
let clinicalTargets=0;
for(const record of clinical.records){
  const duration=record._stateModel?.duration||record.seconds||10;
  for(const fraction of [.1,.3,.5,.7,.9]){
    const state=recordState(record,duration*fraction);update(state);
    for(const path of network.paths.filter(p=>p.schedule.supported&&p.mappedDeliveryTime!==null)){
      assert.ok(path.schedule.end>path.schedule.start,record.id+': guides must propagate forward');
      assert.ok(Math.abs(path.schedule.end-path.mappedDeliveryTime)<1e-9,record.id+': intact guide target remains synchronized');clinicalTargets++;
    }
    if(coupled){
      const g=state.conductionEvent,f=g?{qrsStart:g.qrsStart||0,qrsEnd:g.qrsEnd,tStart:g.tStart,tEnd:g.tEnd}:state.timing,lvDelay=g?.lvDelay??state.lvDelay??0,rvDelay=g?.rvDelay??state.rvDelay??0;
      const span=Math.max(.035,f.qrsEnd-f.qrsStart-Math.max(Math.max(0,lvDelay),Math.max(0,rvDelay-.008)));
      for(const source of coupled.junctions.filter(s=>s.recruits&&network.pathById.get(s.pathId).schedule.supported)){
        const field=electricalTimingAt(source.position,{...f,lvWeight:source.side==='left'?1:0,transmuralDepth:0,lvDelay,rvDelay});
        assert.ok(Math.abs(field.activation-(f.qrsStart+source.muscleArrival/coupled.reference.ventricularDuration*span))<1e-7,record.id+': real-record timing warp keeps source and tissue together');clinicalTargets++;
      }
    }
  }
}

// A deliberately incompatible registration must report its mismatch and keep
// a positive propagation interval, rather than silently starting before supply.
if(!coupled){const incompatible=createEventStateModel({rate:72}).getState(2.2);
incompatible.timing={...incompatible.timing,qrsStart:0,qrsEnd:.035};
const target=network.pathById.get('left-twig-1-3'),savedReference=target.deliveryReference;
target.deliveryReference=[0,0,0,0];
update(incompatible);
assert.ok(target.schedule.end>target.schedule.start,'A target earlier than branch supply must not reverse propagation');
assert.ok(target.schedule.endpointMismatch>0,'The incompatible mapped target is exposed in schedule metadata');
target.deliveryReference=savedReference;
}

console.log(JSON.stringify({passed:true,mode:coupled?'coupled source graph':'transferred atlas fallback',geometricJunctions,junctionStates,matchedTargets,clinicalTargets,blockedStates,recruitingJunctionChecks,maxMyocardialTimingErrorMs:maxMyocardialTimingError*1000,junctionDelayRangeMs:coupled?[minJunctionDelay*1000,maxJunctionDelay*1000]:null,
  maxJunctionDistance,maxEndpointMismatchMs:maxEndpointMismatch*1000,
  maxJunctionTimingErrorMs:maxJunctionTimingError*1000,
  incompatibleTarget:coupled?null:'causal positive travel with explicit endpoint mismatch',
  bundleBlock:coupled?'quiet interrupted-side guide; recruitment uses septal supply and tissue-only graph':'quiet interrupted-side guide; recruitment is shown by the mapped myocardial field'},null,2));

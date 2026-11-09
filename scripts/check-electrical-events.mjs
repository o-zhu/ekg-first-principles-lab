/** Independent event clocks and intentionally unavailable spatial maps. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import {installElectricalField,electricalSceneState,electricalSampleAt} from '../dist/electrical-field.js';
import {createEventStateModel} from '../dist/pathology-model.js';
import {decorateClinicalData,recordState} from '../dist/clinical-adapter.js';
const load=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name+'.json',import.meta.url)));
const raw=fs.readFileSync(new URL('../dist/data/electrical-atlas.f32',import.meta.url));
installElectricalField(load('electrical-atlas'),new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
const atrialPoint=[-.845819822206,.339512345869,.107626533296],ventricularPoint=[.960959971,-.827199996,.243521005];
function local(state,atrial){
  const clock=electricalSceneState(state),a=state.atrialState;
  return electricalSampleAt(atrial?a?.relativeTime??state.relativeTime:state.relativeTime,atrial?atrialPoint:ventricularPoint,
    {...state.timing,pStart:atrial?a?.pStart??state.timing.pStart:state.timing.pStart,pEnd:atrial?a?.pEnd??state.timing.pEnd:state.timing.pEnd,
      atrial,atrium:'right',rr:clock.atrialRR,lvWeight:1,transmuralDepth:.022546265,lvDelay:state.lvDelay,rvDelay:state.rvDelay,
      ectopic:state.ectopic||state.ventricularState?.escapeOrigin==='ventricular'});
}

let blockedEvents=0;
for(const kind of ['mobitz1','mobitz2']){
  const model=createEventStateModel({avBlock:kind,rate:80});
  for(const event of model.atrialEvents.filter(a=>a.blockedByAv)){
    const atrial=model.getState(event.onset+.05),dropped=model.getState(event.onset+event.plannedPR+.025);
    assert.ok(atrial.atrialState.dropped&&atrial.atrialState.onset===event.onset);
    assert.ok(local(atrial,true).voltage>-70,'A dropped QRS must preserve its atrial AP');
    assert.ok(dropped.ventricularState.onset<event.onset,'The blocked P must not start a ventricular clock');
    assert.ok(local(dropped,false).voltage<-80,'No new ventricular depolarization after blocked atrial input');
    assert.equal(electricalSceneState(dropped).atrialRR,60/80,'Atrial APD must not follow the long dropped-beat RR');
    blockedEvents++;
  }
}

let independentStates=0;
for(const escapeRate of [36,45]){
  const model=createEventStateModel({avBlock:'complete',rate:90,escapeRate});
  for(let time=.1;time<model.duration;time+=.041){
    const state=model.getState(time),clock=electricalSceneState(state);
    assert.ok(state.atrialState&&state.ventricularState);
    assert.equal(clock.atrialRR,60/90);
    assert.equal(state.ventricularState.atrialId,null);
    assert.ok(Math.abs(state.atrialState.relativeTime-(time-state.atrialState.onset))<1e-9);
    assert.ok(Math.abs(state.relativeTime-(time-state.ventricularState.onset))<1e-9);
    assert.ok(Number.isFinite(local(state,true).voltage)&&Number.isFinite(local(state,false).voltage));
    independentStates++;
  }
}
const empty=createEventStateModel({rate:72},{ventricularEvents:[],atrialEvents:[{onset:.08,duration:.1,conducted:false,blockedByAv:true}]}).getState(.13);
assert.equal(electricalSceneState(empty).ventricularAvailable,false);
assert.equal(electricalSceneState(empty).ventricularMapsAvailable,false);
assert.equal(electricalSceneState(empty).atrialMapsAvailable,true);

const data=decorateClinicalData(load('clinical-ecgs'),load('clinical-extra'),load('clinical-mobitz2'),load('clinical-tachyarrhythmias'),load('clinical-torsades'));
let recordChecks=0;
for(const record of data.records){
  const duration=record._stateModel?.duration||record.seconds||10;
  for(const fraction of [.1,.3,.5,.7,.9]){
    const state=recordState(record,duration*fraction),clock=electricalSceneState(state);
    if(state.atrialFibrillation||state.atrialFlutter||state.atrialTimingUnavailable)assert.equal(clock.atrialMapsAvailable,false);
    if(state.suppressNormalVentricularConduction||state.noValidatedVentricularTiming)assert.equal(clock.ventricularMapsAvailable,false);
    if(state.atrialFibrillation&&!state.suppressNormalVentricularConduction)assert.equal(clock.ventricularMapsAvailable,true,'AF must not suppress a timed ventricular reference');
    if(state.avBlock==='complete')assert.equal(clock.atrialRR,60/state.config.rate);
    assert.ok(Number.isFinite(local(state,true).voltage)&&Number.isFinite(local(state,false).voltage));
    recordChecks++;
  }
}

// Exercise the actual pathway visibility and clock decisions without a DOM or
// renderer. Use the shipped cavity surfaces, not test-invented cardiac shapes.
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{makeConductionSystem,updateConductionSystem}=await import('../dist/conduction-system.js');
const glb=fs.readFileSync(new URL('../dist/models/heart-medium.glb',import.meta.url)),jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),binaryOffset=28+jsonLength;
function accessor(id){
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],components=a.type==='VEC3'?3:1,bytes=a.componentType===5123?2:4;
  const array=a.componentType===5126?new Float32Array(a.count*components):new Uint32Array(a.count*components),offset=binaryOffset+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*bytes;
  for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){const p=offset+i*stride+j*bytes;array[i*components+j]=a.componentType===5126?glb.readFloatLE(p):bytes===2?glb.readUInt16LE(p):glb.readUInt32LE(p);}
  return array;
}
const meshes={};
for(const name of ['left-ventricle','right-ventricle']){
  const p=gltf.meshes.find(m=>m.name===name).primitives[0],geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(accessor(p.attributes.POSITION),3));geometry.setIndex(new THREE.BufferAttribute(accessor(p.indices),1));meshes[name]=new THREE.Mesh(geometry);
}
const network=makeConductionSystem(meshes,{software:true}),update=s=>updateConductionSystem(network,s,{enabled:false,deform:false,cutaway:true});
update(empty);
assert.ok(network.paths.filter(p=>p.start!=='atrial').every(p=>!p.pulse.visible));
const junctional=createEventStateModel({avBlock:'complete',rate:90,escapeRate:45}),escape=junctional.beats.find(b=>b.onset>2);
update(junctional.getState(escape.onset-.040));
assert.ok(network.paths.find(p=>p.id==='his').pulse.visible,'Junctional escape His pulse must follow the independent ventricular clock');
assert.ok(network.blockMarkers.av.visible,'The atrial AV block remains marked during junctional escape');
const ventricularEscape=createEventStateModel({avBlock:'complete',rate:90,escapeRate:36}),vEscape=ventricularEscape.beats.find(b=>b.onset>2);
update(ventricularEscape.getState(vEscape.onset+.025));
assert.ok(network.nodeMeshes.ectopic.visible);
assert.ok(network.paths.filter(p=>p.start!=='atrial').every(p=>!p.pulse.visible));
const pvc=createEventStateModel({pvc:true}),ectopic=pvc.beats.find(b=>b.ectopic),pvcState=pvc.getState(ectopic.onset+.025);
assert.ok(pvcState.atrialState&&pvcState.ectopic);update(pvcState);
assert.ok(network.nodeMeshes.ectopic.visible&&network.paths.filter(p=>p.start!=='atrial').every(p=>!p.pulse.visible));
const af=createEventStateModel({rhythm:'afib',rate:110}).getState(2.3);update(af);
assert.ok(network.paths.filter(p=>p.start==='atrial').every(p=>!p.pulse.visible));
console.log(JSON.stringify({passed:true,blockedAtrialEvents:blockedEvents,independentAvClockStates:independentStates,clinicalRecordStates:recordChecks,
  absentVentricularMap:'neutral',atrialClockInAvBlock:'independent',junctionalEscapeHis:'independent ventricular clock',pvcAndVentricularEscape:'no normal fast-conduction pulse',af:'qualitative atria with timed ventricular reference'},null,2));

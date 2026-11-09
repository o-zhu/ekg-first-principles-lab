/** Regress the missing pre-QRS pulse without stealing the preceding tissue clock. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {register} from 'node:module';
import {createEventStateModel,createSandboxModel} from '../dist/pathology-model.js';
import {decorateClinicalData,recordState,recordBeats} from '../dist/clinical-adapter.js';
import {conductionEventAt} from '../dist/conduction-event.js';
import {installElectricalField} from '../dist/electrical-field.js';
import {installConductionCoupling} from '../dist/conduction-coupling.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name+'.json',import.meta.url)));
const raw=fs.readFileSync(new URL('../dist/data/electrical-atlas.f32',import.meta.url));
installElectricalField(read('electrical-atlas'),new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
const coupled=process.argv.includes('--coupled');
if(coupled)installConductionCoupling(read('conduction-coupling'));
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{makeConductionSystem,updateConductionSystem}=await import('../dist/conduction-system.js');
const glb=fs.readFileSync(new URL('../dist/models/heart-medium.glb',import.meta.url));
const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),binaryOffset=28+jsonLength;
function accessor(id){
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],components=a.type==='VEC3'?3:1,bytes=a.componentType===5123?2:4;
  const array=a.componentType===5126?new Float32Array(a.count*components):new Uint32Array(a.count*components),offset=binaryOffset+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*bytes;
  for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){
    const p=offset+i*stride+j*bytes;array[i*components+j]=a.componentType===5126?glb.readFloatLE(p):bytes===2?glb.readUInt16LE(p):glb.readUInt32LE(p);
  }
  return array;
}
const meshes={};
for(const name of ['left-ventricle','right-ventricle']){
  const p=gltf.meshes.find(m=>m.name===name).primitives[0],geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(accessor(p.attributes.POSITION),3));
  geometry.setIndex(new THREE.BufferAttribute(accessor(p.indices),1));meshes[name]=new THREE.Mesh(geometry);
}
const system=makeConductionSystem(meshes,{software:true});
const update=state=>updateConductionSystem(system,state,{enabled:false,deform:false,cutaway:true});
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,label);
let hisSamples=0,bundleSamples=0;
function checkWholePreQRS(getState,onset,label){
  for(let ms=-49;ms<=-27;ms++){
    const state=getState(onset+ms/1000);update(state);
    const his=system.pathById.get('his');
    assert.ok(his.pulse.visible,`${label}: missing His pulse at QRS${ms} ms`);
    near(his.progress,(ms+49)/22,`${label}: His follows the incoming event continuously`);hisSamples++;
  }
  let precedingProgress=-1;
  for(let ms=-27;ms<=-7;ms++){
    const state=getState(onset+ms/1000);update(state);
    const left=system.pathById.get('left-bundle');
    assert.ok(left.pulse.visible,`${label}: missing left bundle pulse at QRS${ms} ms`);
    if(ms===-27)near(left.progress,0,`${label}: bundle starts at the actual His junction`);
    assert.ok(left.progress>precedingProgress,`${label}: no event-clock jump reverses the bundle pulse`);
    precedingProgress=left.progress;bundleSamples++;
  }
}

// Before the incoming sinus beat, the current myocardial event is still the
// old PVC. Its ectopic flag and 75 ms LV delay must not suppress/distort His.
const pvc=createEventStateModel({pvc:true}),ectopic=pvc.beats.find(b=>b.ectopic),after=pvc.beats.find(b=>b.onset>ectopic.onset&&!b.ectopic);
const before=pvc.getState(after.onset-.040);
assert.equal(before.ventricularState.id,ectopic.id);assert.equal(before.ectopic,true);
near(before.relativeTime,1.11,'Keep the previous PVC myocardial/recovery clock');
assert.equal(before.conductionEvent.id,after.id);assert.equal(before.conductionEvent.ectopic,false);
assert.equal(before.conductionEvent.lvDelay,0);near(before.conductionEvent.relativeTime,-.040,'Incoming His has its own clock');
checkWholePreQRS(t=>pvc.getState(t),after.onset,'First sinus beat after PVC');

// AF has known ventricular events, without a fabricated P wave / PR interval.
const af=createEventStateModel({rhythm:'afib',rate:110}),afBeat=af.beats.find(b=>b.onset>2);
const afBefore=af.getState(afBeat.onset-.040);
assert.notEqual(afBefore.ventricularState.id,afBeat.id);assert.equal(afBefore.atrialState,null);
assert.equal(afBefore.conductionEvent.id,afBeat.id);assert.equal(afBefore.conductionEvent.atrialEvent,null);
checkWholePreQRS(t=>af.getState(t),afBeat.onset,'Sandbox AF');
const clinical=decorateClinicalData(read('clinical-ecgs'),read('clinical-extra'),read('clinical-mobitz2'),read('clinical-stemi'),read('clinical-tachyarrhythmias'),read('clinical-torsades'));
const legacy=clinical.records.find(r=>r.id==='ptbxl-02078'),legacyBeat=recordBeats(legacy)[2];
const legacyBefore=recordState(legacy,legacyBeat.qrsOnset-.040);
near(legacyBefore.qrsOnset,2.14,'Legacy AF retains its old myocardial event');
near(legacyBefore.conductionEvent.onset,3.38,'Legacy AF knows the next actual event');
assert.equal(legacyBefore.conductionEvent.atrialEvent,null);
checkWholePreQRS(t=>recordState(legacy,t),legacyBeat.qrsOnset,'PTB-XL AF');
for(const id of ['mitdb-202-af-rvr','mitdb-222-flutter','mitdb-209-svt']){
  const record=clinical.records.find(r=>r.id===id),beat=recordBeats(record)[2];
  checkWholePreQRS(t=>recordState(record,t),beat.qrsOnset,id);
}

// Junctional escape has its own ventricular clock through complete AV block;
// a ventricular escape or a PVC does not borrow the normal fast network.
const junctional=createEventStateModel({avBlock:'complete',rate:90,escapeRate:45}),escape=junctional.beats.find(b=>b.onset>2);
checkWholePreQRS(t=>junctional.getState(t),escape.onset,'Independent junctional escape');
let blockedStates=0;
for(const config of [{pvc:true},{avBlock:'complete',rate:90,escapeRate:36}]){
  const model=createEventStateModel(config),beat=model.beats.find(b=>b.onset>2&&(b.ectopic||b.escape));
  for(let ms=-49;ms<=90;ms++){
    const state=model.getState(beat.onset+ms/1000);update(state);
    assert.ok(system.paths.filter(p=>p.start!=='atrial').every(p=>!p.pulse.visible),'A ventricular-origin event cannot create a normal pre-QRS pulse');blockedStates++;
  }
}
for(const kind of ['mobitz1','mobitz2']){
  const model=createEventStateModel({avBlock:kind}),dropped=model.atrialEvents.find(a=>a.onset>2&&a.blockedByAv);
  const planned=dropped.onset+dropped.plannedPR;
  for(let ms=-49;ms<=70;ms++){
    const state=model.getState(planned+ms/1000);update(state);
    assert.notEqual(state.conductionEvent?.onset,planned,'A dropped P has no fictional ventricular event');
    assert.ok(system.paths.filter(p=>p.start==='left'||p.start==='right').every(p=>!p.pulse.visible),'A nonconducted P cannot light the ventricular fast tree');
    if(kind==='mobitz2'&&ms>=-49&&ms<=-27)assert.ok(system.pathById.get('his').pulse.visible,'The infranodal block permits the atrial impulse to reach His');
    blockedStates++;
  }
}

// The final observed RR is not authorization to invent another recorded beat.
const finite=createEventStateModel({avBlock:'complete',rate:90,escapeRate:45},{duration:4,ventricularEvents:[{onset:.8,escape:true,escapeOrigin:'junctional'}]});
for(const t of [0,.2,.74,2.0933333333333333,3.4266666666666667]){
  const state=finite.getState(t);update(state);
  assert.ok(system.paths.filter(p=>p.start!=='atrial').every(p=>!p.pulse.visible),'No pulse before an unknown first event or after the last known event');
}
assert.equal(conductionEventAt([],2),null);

// Synthetic ECG voltages are deliberately outside the scope of this fix.
const hash=signals=>crypto.createHash('sha256').update(JSON.stringify(signals)).digest('hex');
const references=[
  [{},'ebe4fe76f7247dcc684e8e092f1d4f011738fde251cc1849e8084d4c130884cc'],
  [{pvc:true},'af50bf8ce627422a75c4e56af572a51828504a9b52c9889bf0781508913376e6'],
  [{rhythm:'afib',rate:110},'608f660bc38dd8a430651bd4d284a201cd6f02397f57777f5a8a97ab3df1d083'],
];
for(const [config,expected]of references)assert.equal(hash(createSandboxModel(config).signals),expected,'All twelve synthetic ECG signals remain byte-identical to version 12');
console.log(JSON.stringify({passed:true,mode:coupled?'coupled source graph':'fallback guide',hisSamples,bundleSamples,blockedStates,
  coverage:'post-PVC sinus, Sandbox AF, recorded AF, AF-RVR, flutter, SVT, complete AV block and independent escapes',
  sourceClock:'Existing myocardial and atrial clocks retained; only the explicit fast-pathway event is previewed',
  finalRecordBoundary:'No extrapolated beat or phantom pre-QRS pulse',syntheticSignalHashes:'3 exact v12 matches'},null,2));

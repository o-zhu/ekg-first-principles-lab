/**
 * Independent rendering-input audit of conducting-fiber / muscle handoffs.
 *
 * Run: node scripts/check-conduction-render.mjs [--write]
 * Uses the actual HeartScene material and cutaway preparation on both shipped
 * anatomical resolutions. It samples the triangle-interpolated attributes
 * that reach the shader, rather than accepting the source model's metadata
 * or checking only its endpoint timing function. No browser is required.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {register} from 'node:module';
const root=new URL('../',import.meta.url);
const path=relative=>new URL(relative,root);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const threeURL=path('dist/vendor/three.module.js').href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL);
const {installConductionCoupling}=await import('../dist/conduction-coupling.js');
const {installElectricalField,electricalTimingAt,electricalReferenceAt}=await import('../dist/electrical-field.js');
const {HeartScene}=await import('../dist/scenes.js');
const {makeConductionSystem,updateConductionSystem,conductionTimeAtFraction}=await import('../dist/conduction-system.js');
const {createEventStateModel}=await import('../dist/pathology-model.js');
const {normalMotionState}=await import('../dist/cardiac-motion.js');
const {getFiducials}=await import('../dist/ecg.js');
const {actionPotentialSite,actionPotentialLandmarks}=await import('../dist/action-potentials.js');

const couplingBytes=fs.readFileSync(path('dist/data/conduction-coupling.json'));
const data=JSON.parse(couplingBytes);
installConductionCoupling(data);
const atlasBytes=fs.readFileSync(path('dist/data/electrical-atlas.f32'));
installElectricalField(JSON.parse(fs.readFileSync(path('dist/data/electrical-atlas.json'))),new Float32Array(atlasBytes.buffer,atlasBytes.byteOffset,atlasBytes.byteLength/4));
assert.equal(hash(fs.readFileSync(path('dist/models/heart.glb'))),data.sourceSha256,'Coupling must identify the shipped anatomical source');

function loadMeshes(variant){
  const glb=fs.readFileSync(path('dist/models/heart'+variant+'.glb'));
  const jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),binaryOffset=28+jsonLength;
  function accessor(id){
    const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],bytes=a.componentType===5123?2:4;
    const out=a.componentType===5126?new Float32Array(a.count*components):new Uint32Array(a.count*components),base=binaryOffset+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*bytes;
    for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){const k=base+i*stride+j*bytes;out[i*components+j]=a.componentType===5126?glb.readFloatLE(k):bytes===2?glb.readUInt16LE(k):glb.readUInt32LE(k);}
    return out;
  }
  const meshes={};
  for(const m of gltf.meshes){
    const p=m.primitives[0],g=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(accessor(p.attributes.POSITION),3));
    if(p.attributes.NORMAL!==undefined)g.setAttribute('normal',new THREE.BufferAttribute(accessor(p.attributes.NORMAL),3));
    if(p.indices!==undefined)g.setIndex(new THREE.BufferAttribute(accessor(p.indices),1));
    meshes[m.name]=new THREE.Mesh(g);meshes[m.name].name=m.name;
  }
  return meshes;
}

function nearestTriangle(geometry,point){
  const p=geometry.attributes.position,index=geometry.index,q=new THREE.Vector3(...point),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),temp=new THREE.Vector3(),bary=new THREE.Vector3(),triangle=new THREE.Triangle();
  const result={distance:Infinity};
  for(let k=0;k<(index?index.count:p.count);k+=3){
    const ids=[0,1,2].map(j=>index?index.getX(k+j):k+j);
    a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);triangle.set(a,b,c);triangle.closestPointToPoint(q,temp);
    const distance=temp.distanceTo(q);
    if(distance<result.distance){triangle.getBarycoord(temp,bary);Object.assign(result,{distance,point:temp.toArray(),indices:ids,weights:bary.toArray()});}
  }
  return result;
}
function interpolate(geometry,name,near){
  const a=geometry.getAttribute(name),out=[];
  for(let j=0;j<a.itemSize;j++)out.push(near.indices.reduce((sum,id,k)=>sum+a.array[id*a.itemSize+j]*near.weights[k],0));
  return out;
}

const qrsSeconds=.09,recruiting=data.junctions.filter(s=>s.recruits),resolutions=[];
for(const variant of ['', '-medium']){
  const meshes=loadMeshes(variant),wall=meshes['ventricular-wall'];
  const regions=JSON.parse(fs.readFileSync(path('dist/models/heart-regions'+variant+'.json')));
  const scene=Object.create(HeartScene.prototype);
  Object.assign(scene,{shaderMaterials:[],cavityReferences:['left-ventricle','right-ventricle'].map(n=>meshes[n].geometry),electricalView:'voltage',electricalTexture:null});
  wall.material=new THREE.MeshPhysicalMaterial();
  scene.addActivationMaterial(wall,wall.material,regions);
  const g=wall.geometry,rows=[];
  for(const s of recruiting){
    const near=nearestTriangle(g,s.position),reference=interpolate(g,'aElectricalReference',near),blockReference=interpolate(g,'aElectricalBlockActivation',near);
    const lvWeight=interpolate(g,'aLVWeight',near)[0],transmuralDepth=interpolate(g,'aTransmuralDepth',near)[0];
    const actual=electricalTimingAt(near.point,{reference,blockReference,lvWeight,transmuralDepth,qrsStart:0,qrsEnd:qrsSeconds,rvDelay:.008}).activation;
    const expected=s.firstArrival*qrsSeconds/data.reference.ventricularDuration;
    rows.push({id:s.id,nearDistanceSceneUnits:near.distance,expectedMs:expected*1000,renderedMs:actual*1000,errorMs:(actual-expected)*1000,lvWeight,transmuralDepth});
  }
  rows.sort((a,b)=>Math.abs(b.errorMs)-Math.abs(a.errorMs));
  const maxAbsMs=Math.max(...rows.map(r=>Math.abs(r.errorMs))),meanAbsMs=rows.reduce((s,r)=>s+Math.abs(r.errorMs),0)/rows.length;
  assert.ok(maxAbsMs<(variant?10:.002),(variant||'Full')+' geometry must retain its validated junction interpolation tolerance');

  // Exercise the real cutaway method. Its newly created cap vertices must
  // sample local wall depth and the shared field instead of merely blending
  // activation values from distant boundary vertices.
  Object.assign(scene,{meshes:{'ventricular-wall':wall},cutaway:true,cutawayRoot:new THREE.Group(),cutawayMotionMeshes:[],cutawaySources:[]});
  scene.addCutaway();
  const cap=scene.cutawayRoot.children.find(m=>m.name==='ventricular-wall-cut-face').geometry;
  if(!variant)assert.ok(cap.attributes.position.count>0,'Full anatomical cutaway must contain a ventricular cap');
  let capReferenceMaxSeconds=0;
  for(let i=0;i<cap.attributes.position.count;i++){
    const p=cap.attributes.position,position=[p.getX(i),p.getY(i),p.getZ(i)],lvWeight=cap.attributes.aLVWeight.getX(i),transmuralDepth=cap.attributes.aTransmuralDepth.getX(i);
    const expected=electricalReferenceAt(position,{lvWeight,transmuralDepth});
    for(let j=0;j<2;j++)capReferenceMaxSeconds=Math.max(capReferenceMaxSeconds,Math.abs(cap.attributes.aElectricalReference.array[i*2+j]-expected[j]));
  }
  assert.ok(capReferenceMaxSeconds<5e-8,'Cut-face vertices must contain newly sampled local timing');
  resolutions.push({variant:variant?'software-medium':'webgl-full',junctions:rows.length,maxAbsoluteInterpolationErrorMs:maxAbsMs,meanAbsoluteInterpolationErrorMs:meanAbsMs,maxJunctionToDisplayedSurfaceDistanceSceneUnits:Math.max(...rows.map(r=>r.nearDistanceSceneUnits)),capVertices:cap.attributes.position.count,capSamplingStatus:cap.attributes.position.count?'verified':'unavailable: the reduced anatomical section generates an empty ventricular cap',capReferenceMaxSeconds:cap.attributes.position.count?capReferenceMaxSeconds:null,worstJunctions:rows.slice(0,5)});
}

// The actual moving pulse must reach each recruiting junction's location at
// its declared fiber arrival; a correct data table alone is insufficient.
const network=makeConductionSystem(loadMeshes(''),{software:false}),model=createEventStateModel({rate:72}),beat=model.beats.find(b=>b.onset>2);
let pulseMaxDistance=0,pulseMaxFractionError=0,pulseChecks=0;
for(const s of recruiting){
  const fiberTime=s.fiberArrival<0?s.fiberArrival:s.fiberArrival/data.reference.ventricularDuration*beat.qrsDuration;
  updateConductionSystem(network,model.getState(beat.onset+fiberTime),{enabled:false,deform:false,cutaway:true});
  const route=network.pathById.get(s.pathId);
  assert.ok(route.pulse.visible,'The supplying pulse must be present at '+s.id);
  const distance=route.pulse.position.distanceTo(new THREE.Vector3(...s.position)),fractionError=Math.abs(route.progress-s.fraction);
  pulseMaxDistance=Math.max(pulseMaxDistance,distance);pulseMaxFractionError=Math.max(pulseMaxFractionError,fractionError);pulseChecks++;
}
assert.ok(pulseMaxDistance<1e-8&&pulseMaxFractionError<1e-8,'Pulse geometry and junction schedule must agree');

// A plotted AP probe must be the same location as its 3D marker, and the
// actual moving guide must pass that location at the plotted activation.
// This also catches a linear interpolation of a Catmull-Rom control polygon
// being mistaken for the runtime curve (especially for the His probe).
const probeRates=[45,72,120,180],probeRows=[];
let probePositionChecks=0,probePositionMax=0,probePulseMax=0,probeTimingMaxMs=0,probeMetadataTimingMaxMs=0;
for(const [id,probe] of Object.entries(data.probeSites)){
  const site=actionPotentialSite(id),marker=network.potentialSites[id];
  if(!marker)continue;
  const distance=new THREE.Vector3(...site.location).distanceTo(new THREE.Vector3(...marker.position));
  probePositionMax=Math.max(probePositionMax,distance);probePositionChecks++;
  assert.ok(distance<1e-10,'AP and 3D marker positions must coincide for '+id);
}
for(const id of ['atrial','av','his','purkinje']){
  const probe=data.probeSites[id],site=actionPotentialSite(id),pathId=probe.pathId||'atrial-to-av',route=network.pathById.get(pathId);
  const vertexIndex=probe.pathId?null:route.curve.points.findIndex(p=>p.distanceToSquared(new THREE.Vector3(...probe.position))<1e-20);
  assert.ok(probe.pathId||vertexIndex>=0,'Atrial probe must be on the actual displayed guide');
  const fraction=probe.pathId?probe.fraction:vertexIndex/(route.curve.points.length-1);
  for(const bpm of probeRates){
    const f=getFiducials(bpm),ap=actionPotentialLandmarks(id,bpm),state=normalMotionState(ap.activation,bpm);
    updateConductionSystem(network,state,{enabled:false,deform:false,cutaway:true});
    const scheduledTime=conductionTimeAtFraction(route.schedule,fraction),timingErrorMs=Math.abs(route.schedule.clock-scheduledTime)*1000;
    const metadataTime=probe.clock==='atrial'?f.pStart+probe.activation/data.reference.atrialDuration*(f.pEnd-f.pStart):f.qrsStart+(probe.activation<=0?probe.activation:probe.activation/data.reference.ventricularDuration*(f.qrsEnd-f.qrsStart));
    const metadataTimingErrorMs=Math.abs(ap.activation-metadataTime)*1000;
    assert.ok(route.pulse.visible,'The moving guide must be present at the AP upstroke: '+id+' at '+bpm+' bpm');
    const positionError=route.pulse.position.distanceTo(new THREE.Vector3(...site.location));
    probePulseMax=Math.max(probePulseMax,positionError);probeTimingMaxMs=Math.max(probeTimingMaxMs,timingErrorMs);probeMetadataTimingMaxMs=Math.max(probeMetadataTimingMaxMs,metadataTimingErrorMs);
    probeRows.push({id,bpm,pathId,fraction,activationSeconds:ap.activation,pulsePositionErrorSceneUnits:positionError,scheduledTimingErrorMs:timingErrorMs,metadataTimingErrorMs});
  }
}
assert.ok(probePulseMax<1e-7&&probeTimingMaxMs<1e-5&&probeMetadataTimingMaxMs<1e-5,'AP upstrokes, metadata, and moving guides must share a time and location');

// The alternate bundle-block field must have an intact-side supplier and a
// tissue connection, not a delayed copy of the unavailable Purkinje sources.
// Independently check each proposed connector against the visible wall:
// there must be no intervening wall boundary on its open line segment.
const transfers=data.septalTransfers||[];
assert.ok(transfers.length>0,'Bundle-block fields need explicit myocardial suppliers');
const wall=loadMeshes('')['ventricular-wall'].geometry,position=wall.attributes.position,index=wall.index;
const ray=new THREE.Ray(),va=new THREE.Vector3(),vb=new THREE.Vector3(),vc=new THREE.Vector3(),hit=new THREE.Vector3();
let connectorCrossings=0,supplierChecks=0,minSupplierToTargetMs=Infinity;
for(const transfer of transfers){
  const from=new THREE.Vector3(...transfer.fromPosition),to=new THREE.Vector3(...transfer.toPosition),length=from.distanceTo(to);
  ray.set(from,to.clone().sub(from).normalize());
  for(let k=0;k<index.count;k+=3){
    va.fromBufferAttribute(position,index.getX(k));vb.fromBufferAttribute(position,index.getX(k+1));vc.fromBufferAttribute(position,index.getX(k+2));
    if(ray.intersectTriangle(va,vb,vc,false,hit)){
      const distance=hit.distanceTo(from);
      if(distance>1e-5&&distance<length-1e-5)connectorCrossings++;
    }
  }
  for(const qrsEnd of [.09,.145,.18,.25]){
    const options={qrsStart:0,qrsEnd,lvDelay:transfer.toSide==='lv'?.075:0,rvDelay:transfer.toSide==='rv'?.078:.008,transmuralDepth:0};
    const supplier=electricalTimingAt(transfer.fromPosition,{...options,lvWeight:transfer.fromSide==='lv'?1:0}).activation;
    const target=electricalTimingAt(transfer.toPosition,{...options,lvWeight:transfer.toSide==='lv'?1:0}).activation;
    const lag=(target-supplier)*1000;
    assert.ok(lag>0,'Blocked-side myocardium cannot precede its declared intact-side supplier');
    minSupplierToTargetMs=Math.min(minSupplierToTargetMs,lag);supplierChecks++;
  }
}
assert.equal(connectorCrossings,0,'A proposed septal connection must not cross an intervening cavity boundary');
const report={passed:true,couplingSha256:hash(couplingBytes),anatomySha256:data.sourceSha256,referenceQrsMs:qrsSeconds*1000,recruitingJunctionCount:recruiting.length,
  distinction:'The intended junction transmission delay is a source-model assumption. The errors below measure additional geometry/attribute interpolation error relative to the model myocardial arrival, not that physiological delay.',
  referenceJunctionDelayMs:data.reference.junctionDelay*1000,resolutions,
  movingPulse:{checks:pulseChecks,maxPositionErrorSceneUnits:pulseMaxDistance,maxFractionError:pulseMaxFractionError},
  actionPotentialProbes:{ratesBpm:probeRates,markerPositionChecks:probePositionChecks,pulseAndTimingChecks:probeRows.length,maxMarkerPositionErrorSceneUnits:probePositionMax,maxPulsePositionErrorSceneUnits:probePulseMax,maxScheduledTimingErrorMs:probeTimingMaxMs,maxMetadataTimingErrorMs:probeMetadataTimingMaxMs,rows:probeRows,scope:'Resolved plotted probe locations are compared with actual runtime 3D markers. Atrial, AV, His, and Purkinje upstroke landmarks are checked against the moving guide under the normal lesson clock at four rates. This verifies internal synchronization, not measured human membrane-voltage timing.'},
  bundleBlock:{septalConnectors:transfers.length,interveningWallBoundaryIntersections:connectorCrossings,supplierBeforeTargetChecks:supplierChecks,minimumSupplierToTargetMs:minSupplierToTargetMs,scope:'Checks declared reference-anatomy connector geometry and causal order under ECG timing adaptation. The conservative common entry gate and selected septal routes are teaching assumptions, not a segmented or measured patient septal conduction map.'},
  scope:'Normal conducted teaching field on BodyParts3D; native CT fitted cases and recorded ECG samples are not changed. The WebGL triangle attributes are audited; this is not a pixel-color or occlusion test. Software uses reduced geometry, with the explicitly reported interpolation limit.'};
if(process.argv.includes('--write'))fs.writeFileSync(path('data-source/conduction-render-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

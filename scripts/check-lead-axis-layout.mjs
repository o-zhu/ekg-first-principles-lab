/** Regression checks for lead caption flicker, projection, and label switches. */
import assert from 'node:assert/strict';
import {register} from 'node:module';
import {layoutLeadLabels} from '../dist/lead-axis-layout.js';
import {LEAD_INFO} from '../dist/ecg.js';

const names=Object.keys(LEAD_INFO);
const intersects=(a,b)=>Math.abs(a.x-b.x)<(a.w+b.w)/2-.1&&Math.abs(a.y-b.y)<(a.h+b.h)/2-.1;
function checkLayout(layout,width,height,obstacles=[]){
  const shown=[...layout.positions.values()].filter(p=>p.visible);
  for(const p of shown){
    assert(p.x-p.w/2>=0&&p.x+p.w/2<=width,'Name stays in the horizontal viewport');
    assert(p.y-p.h/2>=0&&p.y+p.h/2<=height,'Name stays in the vertical viewport');
    for(const other of obstacles)assert(!intersects(p,other),'A name must not cover fixed scene controls');
  }
  for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++)assert(!intersects(shown[i],shown[j]),`${shown[i].id} and ${shown[j].id} collide`);
  return shown;
}
const clustered=(x=260,y=300)=>names.map((id,i)=>({id,x:x+(i%4)*5,y:y+Math.floor(i/4)*5,anchorX:x+(i%4)*5,anchorY:y+Math.floor(i/4)*5,w:id.length*7+8,h:20,focused:id==='II'}));
let maxPerturbation=0;
for(const [items,obstacles]of [[clustered(),[]],[clustered(480,560),[]],[clustered(260,30),[{id:'controls',x:260,y:30,w:430,h:45}]]]){
  const bounds={width:520,height:600,obstacles};let layout=layoutLeadLabels(items,bounds);
  checkLayout(layout,520,600,obstacles);
  for(let i=0;i<180;i++)assert.equal(layoutLeadLabels(items,bounds,layout),layout,'A stationary camera cannot drift or oscillate');
  for(let frame=0;frame<240;frame++){
    const delta=Math.sin(frame*.8)*.003;
    const perturbed=items.map((p,i)=>({...p,x:p.x+delta*(i%2?1:-1),anchorX:p.anchorX+delta*(i%2?1:-1),y:p.y+delta,anchorY:p.anchorY+delta}));
    const next=layoutLeadLabels(perturbed,bounds,layout);checkLayout(next,520,600,obstacles);
    for(const p of next.positions.values()){
      const old=layout.positions.get(p.id);maxPerturbation=Math.max(maxPerturbation,Math.hypot(p.x-old.x,p.y-old.y));
    }
    layout=next;
  }
}
assert(maxPerturbation<1,'Tiny camera oscillations cannot jump names between distant slots');
const tiny=layoutLeadLabels(clustered(40,40),{width:80,height:80});
const tinyShown=checkLayout(tiny,80,80);assert(tinyShown.length<12&&tinyShown.some(p=>p.id==='II'),'An overcrowded view favors the focused name over overlapping captions');

// Use the real Three camera and HeartScene methods. Only the DOM container is
// lightweight here; no geometry/model loading or numerical fitting is needed.
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{HeartScene}=await import('../dist/scenes.js');
class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.style={};this.attrs={};this.dataset={};this.classList={add(){}};this.textContent='';}
  setAttribute(name,value){this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name];}
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=[...children];}
  querySelectorAll(){return [];}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth||0,height:this.clientHeight||0};}
}
globalThis.document={createElement:tag=>new Element(tag),createElementNS:(namespace,tag)=>new Element(tag)};
function makeScene(width,height,torso=true){
  const scene=Object.create(HeartScene.prototype),container=new Element('div');container.clientWidth=width;container.clientHeight=height;
  const camera=new THREE.PerspectiveCamera(38,width/height,.05,100);
  Object.assign(scene,{container,camera,alive:true,torso,axes:new THREE.Group(),electrodes:new THREE.Group(),scene:new THREE.Scene(),labels:[],anatomyLabels:[],electrodeLabels:[],conductionLabels:[],labelsOn:true,axisLabels:null,leadAxes:true,selectedLeads:names,renderer:{render(){}},controls:{target:new THREE.Vector3(),update(){camera.lookAt(this.target);camera.updateMatrixWorld();}}});
  scene.reset();scene.addElectrodes();scene.setLead('II',names);scene.render();return scene;
}
let frames=0,minNames=12,maxTinyCameraMove=0;
for(const [width,height]of [[434,597],[800,650],[340,360]]){
  const scene=makeScene(width,height),radius=scene.camera.position.distanceTo(scene.controls.target);
  for(const view of ['anterior','left','posterior','superior']){
    scene.reset(view);scene.render();const positions=scene.leadLabelLayout;
    assert.equal(checkLayout(positions,width,height).length,12,`${view} shows every selected lead at ${width}×${height}`);
    for(let frame=0;frame<120;frame++){
      scene.render();assert.equal(scene.leadLabelLayout,positions,'Static camera renders preserve the exact label layout');
    }
  }
  for(let frame=0;frame<=360;frame++){
    const azimuth=frame*Math.PI/180,elevation=Math.sin(azimuth*2)*1.35;
    scene.camera.position.copy(scene.controls.target).add(new THREE.Vector3(Math.sin(azimuth)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(azimuth)*Math.cos(elevation)*radius));
    scene.render();minNames=Math.min(minNames,checkLayout(scene.leadLabelLayout,width,height).length);frames++;
  }
  const position=scene.camera.position.clone();let previous=scene.leadLabelLayout;
  for(let frame=0;frame<240;frame++){
    scene.camera.position.copy(position);scene.camera.position.x+=Math.sin(frame*.9)*1e-6;scene.render();
    for(const p of scene.leadLabelLayout.positions.values()){
      const old=previous.positions.get(p.id);maxTinyCameraMove=Math.max(maxTinyCameraMove,Math.hypot(p.x-old.x,p.y-old.y));
    }
    previous=scene.leadLabelLayout;
  }
  scene.set({labels:false});scene.render();
  assert.equal(scene.axisNames.style.display,'none','Labels off also hides EKG lead names');
  assert.equal(scene.axisOverlay.hidden,false,'Labels off retains the selected arrow geometry');
  assert(scene.electrodeLabels.every(l=>l.hidden&&l.el.style.display==='none'));
  scene.set({labels:true});scene.render();
  assert.equal(scene.axisNames.style.display,'');assert(scene.electrodeLabels.every(l=>l.hidden),'Axes do not repeat electrode names');
  assert(scene.axisMarkers.every(m=>!/[+−]/.test(m.label.textContent)),'Names have no redundant polarity badges');
  scene.set({leadAxes:false});scene.render();
  assert(scene.axisOverlay.hidden);assert(scene.electrodeLabels.some(l=>!l.hidden),'Electrode placement names return when axes are hidden');
  scene.set({labels:false,axisLabels:true,leadAxes:true});scene.render();
  assert.equal(scene.axisNames.style.display,'','Clinical views may show only the lead name');assert(scene.electrodeLabels.every(l=>l.hidden));
  scene.setLead('II',['II']);scene.render();
  assert.equal(scene.leadLabelLayout.positions.size,1,'Changing selection drops old placement contacts');
  const only=scene.leadLabelLayout.positions.get('II'),marker=scene.axisMarkers[0];
  const negative=marker.negative.clone().project(scene.camera),positive=marker.positive.clone().project(scene.camera);
  const ux=(positive.x-negative.x)*width,uy=-(positive.y-negative.y)*height,direction=Math.hypot(ux,uy);
  assert(((only.x-only.anchorX)*ux+(only.y-only.anchorY)*uy)/direction>8,'A lone lead name sits beyond its positive arrowhead');
}
assert(maxTinyCameraMove<1,'Tiny actual-camera changes must not cause large label movement');
// Reproduce the grazing-contact regression: V4/V5 separate vertically, then
// barely meet again. A stale horizontal contact must not swap their positions.
const grazing=makeScene(520,600),grazingObstacles=[{id:'ui-0',x:260,y:35,w:486,h:42},{id:'ui-1',x:170,y:540,w:300,h:64}];
grazing.container.querySelectorAll=()=>grazingObstacles.map(o=>({getBoundingClientRect:()=>({left:o.x-o.w/2,top:o.y-o.h/2,width:o.w,height:o.h})}));
grazing.controls.target.set(-.43,-.05,0);grazing.leadLabelLayout=null;grazing.axisViewSignature=null;
const grazingRadius=4.7/(Math.tan(19*Math.PI/180)*(520/600));let grazingPrevious=null,maxGrazingStep=0;
for(let frame=0;frame<600;frame++){
  const yaw=frame/600*Math.PI*2,pitch=.8*Math.sin(frame/150);
  grazing.camera.position.copy(grazing.controls.target).add(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch)*grazingRadius,Math.sin(pitch)*grazingRadius,Math.cos(yaw)*Math.cos(pitch)*grazingRadius));
  grazing.render();const current=grazing.leadLabelLayout;assert.equal(checkLayout(current,520,600,grazingObstacles).length,12);
  if(grazingPrevious)for(const p of current.positions.values()){
    const old=grazingPrevious.positions.get(p.id);maxGrazingStep=Math.max(maxGrazingStep,Math.hypot(p.x-old.x,p.y-old.y));
  }
  grazingPrevious=current;
}
assert(maxGrazingStep<12,'A grazing contact cannot force a distant sideways label swap');
// The reported V1 collision: the positive direction is down-left in the
// anterior view, so an upper-right caption lies directly over the arrow.
const v1Clearances=[];
for(const selected of [['I','II','V1'],names]){
  const scene=makeScene(434,597);scene.setLead('II',selected);scene.reset();scene.render();
  const label=scene.leadLabelLayout.positions.get('V1'),marker=scene.axisMarkers.find(m=>m.name==='V1');
  const screen=point=>{const p=point.clone().project(scene.camera);return {x:(p.x*.5+.5)*434,y:(-.5*p.y+.5)*597};};
  const a=screen(marker.negative),tip=screen(marker.positive),length=Math.hypot(tip.x-a.x,tip.y-a.y),ux=(tip.x-a.x)/length,uy=(tip.y-a.y)/length;
  const headGap=(label.x-tip.x)*ux+(label.y-tip.y)*uy-Math.abs(ux)*label.w/2-Math.abs(uy)*label.h/2;
  const point=new THREE.Vector3(...scene.electrodeCoords.V1),dot=screen(point),depth=-point.applyMatrix4(scene.camera.matrixWorldInverse).z;
  const radius=Math.max(4,.15*597/(2*Math.tan(scene.camera.fov*Math.PI/360)*depth));
  const electrodeGap=Math.hypot(Math.max(0,Math.abs(label.x-dot.x)-label.w/2),Math.max(0,Math.abs(label.y-dot.y)-label.h/2))-radius;
  assert(label.visible&&headGap>=7,'V1 has a visible gap beyond its own chevron');
  assert(electrodeGap>=5,'V1 clears its electrode ring as well as the arrow');
  assert.equal(marker.clearance.style.display,'','Visible names reserve clear space across other vector strokes');
  scene.set({labels:false});scene.render();assert.equal(scene.axisVectors.getAttribute('mask'),'none','Names off restores uninterrupted arrows');
  v1Clearances.push({selected:selected.length,headGapPx:headGap,electrodeGapPx:electrodeGap});
}
console.log(JSON.stringify({status:'passed',rotationFrames:frames+600,minVisibleNames:minNames,maxFixturePerturbationPx:maxPerturbation,maxCameraPerturbationPx:maxTinyCameraMove,maxGrazingStepPx:maxGrazingStep,v1Clearances,checks:['static-camera stability','collision and clipping','end-on presets','grazing contact continuity','lead selection reset','label master switch','clinical label override','duplicate caption removal','V1 arrowhead and electrode clearance']}));

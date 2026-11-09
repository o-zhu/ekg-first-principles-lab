/** First-interaction regression: real camera damping, bounded SVG work, no layout barriers. */
import assert from 'node:assert/strict';
import {register} from 'node:module';
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL);
const {OrbitControls}=await import('../dist/vendor/OrbitControls.js');
const {HeartScene}=await import('../dist/scenes.js');
let counts,dirty=false;
function resetCounts(){counts={attributeWrites:0,styleWrites:0,visibilityWrites:0,dimensionReads:0,boxReads:0,writeReadBarriers:0};dirty=false;}
function read(kind){counts[kind]++;if(dirty){counts.writeReadBarriers++;dirty=false;}}
function write(kind,changed=true){counts[kind]++;if(changed)dirty=true;}
class Element{
  constructor(tag,rect={left:0,top:0,width:640,height:480}){
    this.tagName=tag;this.children=[];this.attrs={};this.dataset={};this.classList={add(){}};this.textContent='';this.rect=rect;this._hidden=false;
    this.style=new Proxy({},{set(target,key,value){write('styleWrites',target[key]!==value);target[key]=value;return true;}});
  }
  get hidden(){return this._hidden;}
  set hidden(value){write('visibilityWrites',this._hidden!==value);this._hidden=value;}
  setAttribute(name,value){write('attributeWrites',this.attrs[name]!==String(value));this.attrs[name]=String(value);}
  getAttribute(name){return this.attrs[name];}
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(...children){this.children=[...children];}
  get clientWidth(){read('dimensionReads');return this.rect.width;}
  get clientHeight(){read('dimensionReads');return this.rect.height;}
  getBoundingClientRect(){read('boxReads');return this.rect;}
  querySelectorAll(selector){if(this.obstacles)assert(selector.includes('.scene-controls'),'Canvas controls must be reserved');return this.obstacles||[];}
}
class Observer{
  static all=new Set();
  constructor(callback){this.callback=callback;this.elements=new Set();Observer.all.add(this);}
  observe(element){this.elements.add(element);}
  disconnect(){this.elements.clear();Observer.all.delete(this);}
  static notify(element){for(const observer of Observer.all)if(observer.elements.has(element))observer.callback([{target:element}]);}
}
globalThis.document={createElement:tag=>new Element(tag),createElementNS:(namespace,tag)=>new Element(tag)};
globalThis.ResizeObserver=Observer;
function makeScene(){
  resetCounts();
  const scene=Object.create(HeartScene.prototype),container=new Element('div'),camera=new THREE.PerspectiveCamera(38,640/480,.05,100),controls=new OrbitControls(camera,null);
  container.obstacles=[new Element('div',{left:20,top:15,width:600,height:44}),new Element('div',{left:20,top:350,width:500,height:52}),new Element('div',{left:20,top:420,width:600,height:42})];
  controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=3;controls.maxDistance=15;
  Object.assign(scene,{container,camera,controls,alive:true,torso:false,axes:new THREE.Group(),electrodes:new THREE.Group(),scene:new THREE.Scene(),labels:[],anatomyLabels:[],electrodeLabels:[],conductionLabels:[],labelsOn:false,axisLabels:true,leadAxes:true,selectedLeads:['II'],renderer:{setSize(){},render(){}}});
  scene.reset();scene.setLead('II',['II']);scene.render();return scene;
}
function frame(scene){resetCounts();const previous=scene.axisScreenProjection;scene.render();return {...counts,committed:previous!==scene.axisScreenProjection};}
function paintedError(scene){
  const marker=scene.axisMarkers[0],numbers=marker.shaft.getAttribute('d').match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
  return Math.max(...[marker.negative,marker.positive].map((point,i)=>{const p=point.clone().project(scene.camera),x=(p.x*.5+.5)*scene.viewport.width,y=(-p.y*.5+.5)*scene.viewport.height;return Math.hypot(x-numbers[i*2],y-numbers[i*2+1]);}));
}
const scene=makeScene(),reference=makeScene();reference.beforeRender=()=>{};
for(let i=0;i<20;i++){frame(scene);frame(reference);}
const idle=frame(scene);assert.equal(idle.attributeWrites+idle.styleWrites+idle.visibilityWrites+idle.dimensionReads+idle.boxReads,0,'Idle playback does not redo fixed overlay work');
for(const item of [scene,reference]){item.controls._rotateLeft(.25);item.controls._rotateUp(.12);item.controls.update();}
let commits=0,lastCommit=0,maxError=0;const total={attributeWrites:0,styleWrites:0,dimensionReads:0,boxReads:0,writeReadBarriers:0};
for(let i=0;i<600;i++){
  const report=frame(scene);if(report.committed){commits++;lastCommit=i+1;}
  for(const key of Object.keys(total))total[key]+=report[key];
  assert.equal(report.writeReadBarriers,0,'A changed camera cannot cause writes followed by layout reads');
  maxError=Math.max(maxError,paintedError(scene));
  reference.render();assert(scene.camera.position.distanceTo(reference.camera.position)<1e-12,'Overlay scheduling must not alter camera damping');assert(scene.camera.quaternion.angleTo(reference.camera.quaternion)<1e-7,'Camera orientation must remain unchanged');
}
assert(commits<80&&lastCommit<140,'A small drag must not keep rebuilding SVG through the imperceptible damping tail');
assert(maxError<.1,'Coalescing must stay within 0.1 CSS pixel of the actual camera projection');
assert.equal(total.dimensionReads+total.boxReads+total.writeReadBarriers,0,'Fixed UI bounds are cached throughout camera interaction');

// Tiny input continues to accumulate against the last painted pose. Comparing
// only with the previous tick would freeze an arbitrarily slow deliberate drag.
const slow=makeScene();slow.controls.enableDamping=false;let slowCommits=0,slowError=0;
for(let i=0;i<240;i++){slow.controls._rotateLeft(.00002);slow.controls._rotateUp(.00001);slowCommits+=frame(slow).committed;slowError=Math.max(slowError,paintedError(slow));}
assert(slowCommits>0&&slowCommits<240,'Slow deliberate input accumulates and eventually repaints');assert(slowError<.1);

const zoom=makeScene(),original=zoom.camera.position.clone();zoom.controls._handleMouseWheel({deltaY:-100,clientX:320,clientY:240});
assert(frame(zoom).committed,'Wheel zoom refreshes the projected axis');assert(zoom.camera.position.distanceTo(original)>.01);assert(paintedError(zoom)<.1);
zoom.reset();assert(frame(zoom).committed,'Reset refreshes camera and fixed UI bounds');assert(zoom.camera.position.distanceTo(original)<1e-10);
zoom.leadAxes=false;frame(zoom);assert.equal(zoom.axisOverlay.hidden,true);
zoom.leadAxes=true;frame(zoom);assert.equal(zoom.axisOverlay.hidden,false,'Stationary off/on cannot strand the overlay hidden');
zoom.set({axisLabels:false});frame(zoom);assert.equal(zoom.axisNames.style.display,'none');assert.equal(frame(zoom).attributeWrites,0,'Hidden names do not force ongoing work');
zoom.set({axisLabels:true});frame(zoom);assert.equal(zoom.axisNames.style.display,'');

const control=zoom.container.obstacles[2],caption=zoom.leadLabelLayout.positions.get('II');
control.rect={left:caption.x-caption.w/2-6,top:caption.y-caption.h/2-6,width:caption.w+12,height:caption.h+12};
Observer.notify(control);const resized=frame(zoom),moved=zoom.leadLabelLayout.positions.get('II');
assert(resized.committed&&resized.boxReads>0,'Expanding a canvas control invalidates its cached exclusion area');assert.equal(resized.writeReadBarriers,0,'Changed overlay bounds are measured before SVG writes');
const r=control.rect;assert(!moved.visible||Math.abs(moved.x-r.left-r.width/2)>=(moved.w+r.width)/2||Math.abs(moved.y-r.top-r.height/2)>=(moved.h+r.height)/2,'Lead names must clear the resized control');
zoom.container.rect.width=700;zoom.resize();frame(zoom);assert.equal(zoom.viewport.width,700);assert.equal(zoom.camera.aspect,700/480);
console.log(JSON.stringify({status:'passed',dragFrames:600,svgCommits:commits,lastCommitFrame:lastCommit,maxAccumulatedScreenErrorPx:maxError,slowDragCommits:slowCommits,maxSlowDragErrorPx:slowError,operations:total,checks:['unchanged camera damping','idle and post-drag work','accumulated subpixel input','wheel zoom','reset','stationary axes off/on','names off/on','canvas-control resize','viewport resize']}));

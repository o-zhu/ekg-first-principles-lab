/** Exact fitted sample values, bounded DOM work, and seek/transport behavior. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FitAPPanel,chooseFitSamples} from '../dist/fit-ap-panel.js';
import {FittedField} from '../dist/fit-model.js';

const readJSON=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const base=await readJSON('../dist/cardiac-voltage/data/heart-model.json');
const cases=['ptbxl-00303','ptbxl-03155','acs-00004','mitdb-202-af-rvr'];
const signed=x=>(x>=0?'+':'−')+Math.abs(x).toFixed(1);
let checked=0,totalCalls=0;
globalThis.devicePixelRatio=1;

// The canvas is a command sink: numerical evaluation is the real fitted model.
// Count DOM writes directly; no headless browser or approximate timing metric.
for(const id of cases){
  const fit=await readJSON(`../dist/data/pathology-fits/cases/${id}.json`);
  const approach=fit.approaches?.find(a=>a.id===fit.selectedApproachId);
  const field=new FittedField(base,fit,approach),evaluate=field.voltageAtNode.bind(field);
  let calls=0,writes=0,htmlWrites=0,measured=false,inDraw=false;
  field.voltageAtNode=(...args)=>{calls++;return evaluate(...args);};
  const textNode=()=>{
    let value='';
    return {get nodeValue(){return value;},set nodeValue(next){if(inDraw)assert(measured,'Measure before writing readout text');writes++;value=next;},get textContent(){return value;},set textContent(next){if(inDraw)assert(measured,'Measure before writing readout text');writes++;value=next;}};
  };
  const cards=Object.fromEntries(['A','B','difference'].map(k=>[k,{set innerHTML(_){htmlWrites++;}}]));
  const context=new Proxy({},{get:(o,key)=>key in o?o[key]:(()=>{})});
  const attrs=new Map(),canvas={width:700,height:380,
    getBoundingClientRect(){measured=true;return {width:700,height:380};},
    getAttribute:key=>attrs.get(key),setAttribute(key,value){if(inDraw)assert(measured,'Measure before writing accessibility values');writes++;attrs.set(key,value);}
  };
  const panel=Object.assign(Object.create(FitAPPanel.prototype),{
    base,field,timeMs:fit.timeMs||fit.ecg.timeMs,timeLabel:'ms from R anchor',fullWindow:fit.timeReference==='recording',
    samples:chooseFitSamples(base,field,id==='ptbxl-03155'?'rbbb':id==='acs-00004'?'stemi':'general'),
    alive:true,time:0,canvas,ctx:context,cache:{getContext:()=>context},
    readouts:Object.fromEntries(['A','B'].map(k=>[k,{label:textNode(),value:textNode(),timing:textNode()}])),
    differenceValue:textNode(),host:{querySelector(selector){return selector.includes('explanation')?textNode():selector.includes('difference')?cards.difference:cards[selector.includes('"A"')?'A':'B'];}}
  });
  panel.time=panel.timeMs[0];panel.rebuild();calls=0;
  const start=panel.timeMs[0],end=panel.timeMs.at(-1),count=180;
  for(let i=0;i<count;i++){
    const time=start+(end-start)*i/(count-1);measured=false;
    inDraw=true;panel.draw(time);inDraw=false;
    assert(measured,'The panel measures before updating its readouts');
    const a=evaluate(panel.samples.A,time),b=evaluate(panel.samples.B,time);
    assert.equal(panel.readouts.A.value.nodeValue,signed(a)+' ');
    assert.equal(panel.readouts.B.value.nodeValue,signed(b)+' ');
    assert.equal(panel.differenceValue.nodeValue,signed(a-b)+' ');
    assert.equal(canvas.getAttribute('aria-valuenow'),String(Math.round(time)));
    checked++;
  }
  assert.equal(calls,count*2,'Each rendered instant evaluates A and B exactly once');
  assert.equal(htmlWrites,0,'Playback must preserve the readout DOM subtrees');
  const priorWrites=writes;panel.draw(panel.time);
  assert.equal(writes,priorWrites,'An identical instant must not rewrite DOM text or accessibility values');
  totalCalls+=count*2;
}

// Importing UI help only needs listener registration for this transport check.
globalThis.document={hidden:false,addEventListener(){}};
globalThis.window={addEventListener(){}};
globalThis.requestAnimationFrame=()=>1;
const {FitExplorer}=await import('../dist/fit-explorer.js');
let chartDraws=0,heartDraws=0;
const explorer=Object.assign(Object.create(FitExplorer.prototype),{
  fit:{},alive:true,start:-250,end:750,time:0,last:1000,lastDraw:0,speed:.03,running:false,
  updatePlay(){},updateInstant(){},drawHeart(){heartDraws++;},
  mainChart:{draw(){chartDraws++;}},apPanel:{draw(){chartDraws++;}}
});
for(const wasRunning of [false,true]){
  explorer.running=wasRunning;explorer.seek(100);
  assert.equal(explorer.time,100);assert(explorer.running);
}
assert.equal(chartDraws,0,'Seeking queues one coordinated frame instead of duplicate chart redraws');
explorer.tick(1100);
assert(explorer.time>100&&explorer.running,'Playback advances after seeking');
assert.equal(heartDraws,1);assert.equal(chartDraws,2);
explorer.togglePlaying();assert.equal(explorer.running,false,'Explicit Pause still pauses');
explorer.seek(10000);assert.equal(explorer.time,750);
explorer.tick(1200);assert.equal(explorer.running,false,'The recorded endpoint still stops playback');

// Exercise the actual registered canvas handlers without constructing the AP
// panel DOM. Interrupted capture must end a drag just like up/cancel does.
const binding=FitExplorer.prototype.bind.toString(),begin=binding.indexOf('const coordinates='),end=binding.indexOf('this.resizeObserver=',begin);
assert(begin>=0&&end>begin,'Locate the production canvas-handler registration');
const handlers=new Map(),interaction={yaw:.25,pitch:.55,zoom:1,pan:[0,0],pointers:new Map(),dirty:false,
  canvas:{setPointerCapture(){},addEventListener:(name,handler)=>handlers.set(name,handler)}};
new Function('clamp',binding.slice(begin,end)).call(interaction,(v,a,b)=>Math.max(a,Math.min(b,v)));
const pointer=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,button:0});
for(const ending of ['pointerup','pointercancel','lostpointercapture']){
  handlers.get('pointerdown')(pointer(1,100,100));handlers.get('pointermove')(pointer(1,120,110));
  handlers.get(ending)(pointer(1,120,110));assert.equal(interaction.pointers.size,0,ending+' clears the active pointer');
  const view=[interaction.yaw,interaction.pitch,interaction.zoom,...interaction.pan];interaction.dirty=false;
  handlers.get('pointermove')(pointer(1,160,140));
  assert.deepEqual([interaction.yaw,interaction.pitch,interaction.zoom,...interaction.pan],view,'Hover after '+ending+' cannot change the camera');
  assert.equal(interaction.dirty,false,'Hover after '+ending+' cannot queue redraw work');
}
handlers.get('pointerdown')(pointer(1,100,100));handlers.get('pointerdown')(pointer(2,200,100));
handlers.get('lostpointercapture')(pointer(1,100,100));handlers.get('lostpointercapture')(pointer(1,100,100));
assert.equal(interaction.pointers.size,1,'Capture cleanup is idempotent and preserves another active pointer');
assert(interaction.pointers.has(2));handlers.get('pointercancel')(pointer(2,200,100));
console.log(JSON.stringify({cases:cases.length,checkedInstants:checked,nodeEvaluations:totalCalls,htmlSubtreeReplacements:0,seekContinues:true,explicitPause:true,endStop:true,interruptedCaptureCleanup:true}));

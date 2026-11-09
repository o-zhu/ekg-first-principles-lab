/** Exercise production gain geometry and playback/caliper event routing without a browser. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {LEADS,REGIONS,sampleECG,getFiducials} from '../dist/ecg.js';
import {ECGChart,chartScale} from '../dist/charts.js';

const source=readFileSync(new URL('../dist/lab.js',import.meta.url),'utf8');
const productionFunction=name=>{
  const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?source.indexOf("\ndocument.addEventListener('visibilitychange'",start):end);
};
const elements=new Map();
const element=id=>{
  if(!elements.has(id))elements.set(id,{style:{setProperty(){}},setAttribute(){},addEventListener(){},classList:{toggle(){}},value:''});
  return elements.get(id);
};
const phaseButtons=['p','pr','qrs','st','t'].map(phase=>({dataset:{phase}}));
const handlers=new Map(),createdCharts=new Map();
const state={module:'leads',bpm:72,axis:60,selectedLeads:[...LEADS],leadGain:10,
  regions:Object.fromEntries(REGIONS.map(r=>[r.id,true])),time:0,running:false,speed:1,
  recordIndex:0,lead:'II',annotations:true,interval:'pr',gain:10,paperSpeed:25};
const context=vm.createContext({state,$:element,leadExtent:null,getFiducials,sampleECG,
  mod:(t,rr)=>((t%rr)+rr)%rr,leadDuration:()=>getFiducials(state.bpm).rr*12,
  document:{hidden:false,querySelectorAll:selector=>selector==='[data-phase]'?phaseButtons:[]},
  on:(id,event,handler)=>handlers.set(id+':'+event,handler),
  scene:null,fitExplorer:null,mainChart:null,last:0,lastUI:0,lastChart:0,
  data:{records:[{seconds:10,fs:500}]},sandboxModel:{seconds:14,fs:500},
  chart:(id,options)=>{const chart={options,set(){}};createdCharts.set(id,chart);return chart;},
  charts:[],requestAnimationFrame:()=>1,buildHeart(){},bindAnatomyToggles(){},bindPotentialStudy(){},
  updateDuration(){},updateLeadCursor(){},updateInterval(){},updatePaper(){},showMeasurement(){},
});
for(const name of ['leadScaleGeometry','currentSequence','sequenceEnd','seekTime','toggleRunning',
  'updatePlayButton','bindPhaseControls','bindHeartbeat','bindRhythm','animate']){
  vm.runInContext(productionFunction(name),context);
}

// Independent sample positions include a 4 ms whole-beat grid, a 0.5 ms QRS
// grid, and exact waveform landmarks. Cover rate limits, the default rate, and
// axis limits plus representative intermediate directions.
let settings=0,boundsChecked=0,minInkClearance=Infinity,maxHeight=0;
const selections=[[...LEADS],['I','II','V1'],...LEADS.map(lead=>[lead])];
const rates=[45,72,120],axes=[-150,-90,-30,0,60,90,120,180];
for(const bpm of rates){
  const f=getFiducials(bpm),times=[f.pPeak,f.qPeak,f.rPeak,f.sPeak,f.tPeak];
  for(let t=0;t<f.rr;t+=.004)times.push(t);
  for(let t=f.qrsStart;t<=f.qrsEnd;t+=.0005)times.push(t);
  for(const axis of axes){
    Object.assign(state,{bpm,axis});
    const extrema=new Map(LEADS.map(lead=>{
      let low=0,high=0;
      for(const t of times){const value=sampleECG(t,lead,bpm,state.regions,axis);low=Math.min(low,value);high=Math.max(high,value);}
      return [lead,{low,high}];
    }));
    for(const selectedLeads of selections){
      state.selectedLeads=selectedLeads;
      for(const gain of [5,10,20,40]){
        state.leadGain=gain;
        const geometry=context.leadScaleGeometry();
        for(const row of [geometry.short,geometry.long]){
          const layout=chartScale(320,row.height,{compact:true,edgeToEdge:true,mmPx:2.1,gain,
            baselineFraction:row.baselineFraction,windowSeconds:f.rr*3,paperSpeed:25});
          assert.equal(layout.pxPerMV,gain*2.1,'Gain changes pixels per mV, without normalizing a lead');
          assert.ok(Math.abs(layout.verticalMM/layout.pxPerMV-1/gain)<1e-12,'One vertical small box retains its calibrated voltage');
          assert.equal(layout.duration,f.rr*3,'Vertical zoom leaves the time domain unchanged');
          for(const lead of selectedLeads)for(const value of Object.values(extrema.get(lead))){
            const y=layout.baseline-value*layout.pxPerMV;
            const clearance=Math.min(y-layout.top,row.height-layout.bottom-y);
            assert.ok(clearance>=10,`${lead}, ${bpm} bpm, ${axis} degrees, gain ${gain}: full waveform must clear plot edges`);
            minInkClearance=Math.min(minInkClearance,clearance);boundsChecked++;
          }
          maxHeight=Math.max(maxHeight,row.height);
        }
      }
    }
    settings++;
  }
}

// The main ECG in Module 2 must route clicks just like its AP comparison rows.
Object.assign(state,{module:'heartbeat',bpm:72,axis:60,running:false,time:0});
context.bindHeartbeat();
const heartbeat=createdCharts.get('heart-trace');
assert.equal(typeof heartbeat.options.onSeek,'function','Module 2 main ECG is seekable');
heartbeat.options.onSeek(.31);assert.equal(state.running,true);assert.equal(state.time,.31);
for(const module of ['heartbeat','leads','library','sandbox']){
  state.module=module;state.running=false;
  context.seekTime(.27);assert.equal(state.running,true,module+' seek resumes playback');
  assert.equal(state.time,.27);
  context.toggleRunning();assert.equal(state.running,false,module+' explicit Pause still pauses');
  if(module==='library'||module==='sandbox'){
    context.seekTime(1000);const end=context.sequenceEnd();assert.equal(state.time,end);
    context.animate(0);assert.equal(state.running,false,module+' stops at its finite sample boundary');
  }
}
for(const module of ['heartbeat','leads']){
  Object.assign(state,{module,time:2.7,running:false});context.bindPhaseControls();
  phaseButtons.find(button=>button.dataset.phase==='qrs').onclick();
  assert.equal(state.running,true,module+' phase shortcut resumes playback');
  const f=getFiducials(state.bpm);
  assert.ok(Math.abs(state.time-(module==='leads'?3*f.rr:0)-f.rPeak)<1e-12,'Phase jump retains its beat and waveform landmark');
  state.running=false;handlers.get('phase-scrub:input')({target:{value:'400'}});
  assert.equal(state.running,true,module+' timeline resumes playback');
}

function eventChart(options={}){
  const chart=Object.create(ECGChart.prototype);
  Object.assign(chart,{options:{mode:'fixed',bpm:72,lead:'II',gain:10,mmPx:5,paperSpeed:25,
    baselineFraction:.63,windowSeconds:2,compact:false,calipers:false,minGain:5,maxGain:40,...options},
    width:420,height:220,startTime:0,endTime:2,lastTime:0,caliperTimes:null,activeCaliper:0,
    canvas:{style:{},setAttribute(){},focus(){},getBoundingClientRect:()=>({left:0,width:420})},
    render(time){this.lastTime=time;}});
  chart.scale=chartScale(chart.width,chart.height,chart.options);return chart;
}
const pointer=clientX=>({clientX,button:0,pointerId:1,preventDefault(){}});
Object.assign(state,{module:'leads',time:0,running:false});
const seekChart=eventChart({onSeek:context.seekTime});
seekChart._pointerDown(pointer(seekChart._x(.6)));assert.equal(state.time,.6);assert.equal(state.running,true);
seekChart._pointerUp({pointerId:1});state.running=false;
seekChart._keyDown({key:'ArrowRight',preventDefault(){}});assert.equal(state.time,.602);assert.equal(state.running,true);

// Retain Module 4's stationary/caliper-only event routing, including keyboard steps.
Object.assign(state,{module:'rhythm',running:false});context.bindRhythm();
assert.equal(createdCharts.get('rhythm-trace').options.onSeek,undefined,'The measurement chart remains stationary');
let measured=null,seeks=0;
const calipers=eventChart({calipers:true,onMeasure:value=>{measured=value;},onSeek:()=>{seeks++;}});
calipers._pointerDown(pointer(calipers._x(.28)));calipers._pointerUp({pointerId:1});
assert.equal(calipers.caliperTimes[0],.28);assert.ok(measured>0);assert.equal(seeks,0);
calipers._keyDown({key:'2',preventDefault(){}});
const initial=calipers.caliperTimes[1];
calipers._keyDown({key:'ArrowRight',preventDefault(){}});
assert.ok(Math.abs(calipers.caliperTimes[1]-initial-.002)<1e-12);
calipers._keyDown({key:'ArrowLeft',shiftKey:true,preventDefault(){}});
assert.ok(Math.abs(calipers.caliperTimes[1]-initial+.098)<1e-12);
assert.equal(seeks,0,'Caliper pointer and keyboard gestures never seek or start playback');
assert.equal(state.running,false);context.toggleRunning();assert.equal(state.running,false);

// Small trackpad deltas must accumulate, including when leaving a gain limit.
const wheelChart=eventChart();let prevented=0;
wheelChart.options.onGainChange=value=>{wheelChart.options.gain=value;};
const wheel=(delta,extra={})=>wheelChart._wheel({deltaY:delta,deltaMode:0,shiftKey:true,
  preventDefault(){prevented++;},...extra});
for(const [gain,delta,direction] of [[10,-2,1],[5,-2,1],[40,2,-1]]){
  wheelChart.options.gain=gain;wheelChart._gainWheelDelta=0;
  for(let i=0;i<30;i++)wheel(delta);
  assert.ok((wheelChart.options.gain-gain)*direction>0,'Fine scrolling changes gain from '+gain);
}
wheelChart.options.gain=5;wheel(180);assert.equal(wheelChart.options.gain,5);
wheelChart.options.gain=40;wheel(-180);assert.equal(wheelChart.options.gain,40);
const before=wheelChart.options.gain,events=prevented;
wheel(-100,{shiftKey:false});wheel(-100,{ctrlKey:true});wheel(-100,{metaKey:true});
assert.equal(wheelChart.options.gain,before);assert.equal(prevented,events,'Ordinary scroll and browser zoom remain available');

console.log(JSON.stringify({pass:true,settings,rates,axes,boundsChecked,minInkClearancePx:minInkClearance,
  maxHeightPx:maxHeight,gains:[5,10,20,40],leadSelections:'All 12, default I/II/V1, and every individual lead',
  scale:'Calibrated mV per small box; time domain unchanged',
  playback:'Module 2 main ECG, shared seeks, phase shortcuts, timeline, explicit Pause, finite record endpoints',
  measurement:'Module 4 remains stationary; pointer and 2 ms / 100 ms keyboard calipers preserved',
  wheel:'Fine-delta accumulation, both gain limits, and browser scroll/zoom exclusions',
  limitation:'Production function checks; DOM, rendering, and frame scheduling stubbed'},null,2));

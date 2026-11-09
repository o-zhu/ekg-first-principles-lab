import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {decorateClinicalData,recordBeats,recordState} from '../dist/clinical-adapter.js';

const root=fileURLToPath(new URL('../dist/data/',import.meta.url));
const names=['clinical-ecgs.json','clinical-extra.json','clinical-mobitz2.json','clinical-stemi.json','clinical-tachyarrhythmias.json','clinical-torsades.json'];
const inputs=names.map(n=>JSON.parse(fs.readFileSync(root+n,'utf8'))),original=new Map(inputs.flatMap(d=>d.records).map(r=>[r.id,r]));
const data=decorateClinicalData(...inputs),added=data.records.filter(r=>r.group==='tachyarrhythmia');
assert.equal(data.records.length,24);assert.equal(new Set(data.records.map(r=>r.id)).size,24);assert.equal(added.length,6);assert.equal(data.records[0].id,'ptbxl-00303');
let samples=0,states=0;
for(const r of data.records){
  assert.equal(r.signals,original.get(r.id).signals,'Original source arrays must remain identical objects');
  assert.equal(r.kind,'recorded');assert.notEqual(r.synthetic,true);
  assert.ok(r.recordUrl&&r.licenseUrl&&r.attribution&&r.sourceLabel);
  for(const signal of Object.values(r.signals)){assert.equal(signal.length,Math.round(r.fs*r.seconds));assert.ok(signal.every(Number.isFinite));samples+=signal.length;}
}
assert.equal(samples,373400);
for(const r of added){
  const kind=r.teaching.rhythmKind,beats=recordBeats(r),source=original.get(r.id);
  assert.equal(Object.keys(r.signals).length,2);assert.ok([250,360].includes(r.fs));assert.ok(r.signals[r.recommendedLead]);
  assert.deepEqual(beats.map(b=>b.sourceAnchor),source.teaching.ventricularAnchors);
  assert.ok(beats.every(b=>!b.title.includes('Premature')));
  assert.equal(r._stateModel.atrialEvents.length,0,'Unknown atrial timing cannot become invented sinus events');
  assert.equal(r._stateModel.metrics.prMs,null);assert.equal(r._stateModel.metrics.qtMs,null);assert.equal(r._stateModel.metrics.qrsMs,null);
  if(beats.length){const mean=60*(beats.length-1)/(beats.at(-1).sourceAnchor-beats[0].sourceAnchor);assert.ok(Math.abs(mean-r.rateSummary.meanBpm)<1e-8);assert.ok(Math.abs(mean-source.rateSummary.bpm)<.001);}
  else{assert.equal(r.rateSummary.meanBpm,null);assert.equal(r.rateSummary.hasDiscreteBeats,false);}
  let maxMotion=0;
  for(let t=0;t<r.seconds;t+=.013){
    const s=recordState(r,t);states++;assert.equal(s.signalKind,'recorded');assert.equal(s.synthetic,false);assert.equal(s.atrialState,null);
    for(const key of ['mechanics','activation'])for(const n of Object.values(s[key])){assert.ok(Number.isFinite(n));assert.ok(n>=0&&n<=1,`${kind} ${key} ${n}`);}
    maxMotion=Math.max(maxMotion,s.mechanics.lv);
    if(['vt','torsades','vf'].includes(kind))assert.equal(s.suppressNormalVentricularConduction,true);
    if(kind==='af-rvr'){assert.equal(s.atrialFibrillation,true);assert.equal(s.mechanics.ra,0);assert.equal(s.mechanics.la,0);}
    if(kind==='flutter')assert.equal(s.atrialFlutter,true);
    if(['vt','torsades','svt','vf'].includes(kind))assert.equal(s.atrialTimingUnavailable,true);
    if(kind==='vf'){assert.equal(s.noDiscreteVentricularEvents,true);assert.equal(s.mechanics.lv,0);assert.equal(s.mechanics.rv,0);assert.equal(s.rr,null);assert.equal(s.qrsOnset,null);assert.equal(s.ventricularState,null);}
    if(kind==='torsades'){assert.equal(s.noValidatedVentricularTiming,true);assert.equal(s.rr,null);assert.equal(s.qrsOnset,null);assert.equal(s.ventricularState,null);assert.ok(s.relativeTime>=0&&s.relativeTime<.26);}
  }
  assert.equal(recordState(r,-1).time,0);assert.equal(recordState(r,999).time,r.seconds-1/r.fs);
  if(kind!=='vf')assert.ok(maxMotion>.2,'Illustrative motion must remain active across the excerpt');
}
const get=k=>added.find(r=>r.teaching.rhythmKind===k);
assert.ok(get('af-rvr').rateSummary.meanBpm>120);assert.equal(get('af-rvr').rateSummary.approximate,false);
assert.ok(get('vt').rateSummary.meanBpm>240,'No old 160-bpm scheduler cap');assert.equal(get('vt').rateSummary.approximate,true);
assert.equal(recordState(get('torsades'),7).rhythmKind,'ventricular-ectopy');assert.equal(recordState(get('torsades'),10).rhythmKind,'torsades');assert.equal(recordBeats(get('torsades')).length,0);
assert.equal(get('torsades').sourceLabel,'SDDB 47');
console.log(JSON.stringify({pass:true,records:data.records.length,newRecords:added.length,unchangedSourceSamples:samples,reviewedStates:states,rates:Object.fromEntries(added.map(r=>[r.teaching.rhythmKind,r.rateSummary.meanBpm]))}));

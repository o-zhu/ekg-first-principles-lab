/** Calibrated readability, full-amplitude visibility, paging, and native-sample seeking. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {clinicalGridScale,clinicalWindow} from '../dist/clinical-chart-scale.js';
import {chartScale,ECGChart} from '../dist/charts.js';

const read=name=>JSON.parse(fs.readFileSync(new URL('../dist/data/'+name,import.meta.url)));
const collections=['clinical-ecgs','clinical-extra','clinical-mobitz2','clinical-stemi','clinical-tachyarrhythmias','clinical-torsades'].map(name=>read(name+'.json'));
const records=collections.flatMap(c=>c.records||[]);
const native=read('pathology-fits/source/ptbxl-03155-500hz.json');
records.push({...native,id:'ptbxl-03155-native500'});
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
let valuesChecked=0,pagesChecked=0,seeksChecked=0,maxHeight=0;
for(const record of records){
  const leads=Object.keys(record.signals||{});if(!leads.length)continue;
  const before=hash(record.signals);
  for(const gain of [5,10,20]){
    const common=clinicalGridScale(record,leads,gain);
    const layout=chartScale(220,common.height,{compact:true,voltageTicks:true,gain,mmPx:common.mmPx,baselineFraction:common.baselineFraction,windowSeconds:2.5});
    assert.equal(layout.pxPerMV,5*gain,'Gain controls the actual mV-to-pixel ratio');
    assert.ok(Math.abs(layout.verticalMM/layout.pxPerMV-1/gain)<1e-12,'Grid boxes retain their displayed calibrated mV');
    for(const lead of leads)for(const value of record.signals[lead])if(Number.isFinite(value)){
      const y=layout.baseline-value*layout.pxPerMV;
      assert.ok(y>=layout.top+23.9&&y<=common.height-layout.bottom-23.9,`${record.id} ${lead}: the full source voltage stays inside the plot with label/ink clearance`);
      valuesChecked++;
    }
    maxHeight=Math.max(maxHeight,common.height);
  }
  for(const requested of [2.5,5,0]){
    const first=clinicalWindow(record,0,requested);let lastEnd=0;
    for(let page=0;page<first.count;page++){
      const w=clinicalWindow(record,page*first.pageSeconds,requested);
      assert.equal(w.index,page);assert.equal(w.start,lastEnd,'Pages cover the record without gaps or duplicate intervals');
      assert.ok(w.duration>0&&w.end<=record.seconds);lastEnd=w.end;pagesChecked++;
      const options={record,gain:10,mmPx:5,compact:true,voltageTicks:true,windowSeconds:w.duration,windowStart:w.start,playheadPeriod:record.seconds+.01};
      const scale=chartScale(220,190,options),fake={options,scale,startTime:w.start,endTime:w.end,lastTime:Math.min(w.end-1/record.fs,w.start+w.duration/2)};
      for(const fraction of [0,.1,.5,.9,1]){
        const x=scale.left+fraction*scale.usableWidth;
        const actual=ECGChart.prototype._timeAt.call(fake,x);
        const desired=w.start+fraction*w.duration;
        assert.ok(actual>=w.start&&actual<=Math.min(w.end,record.seconds-1/record.fs),'A seek cannot leave the real recording / displayed page');
        assert.ok(Math.abs(actual-desired)<=1/record.fs+1e-9,'Mouse seeks preserve native sample timing');seeksChecked++;
      }
      const marker=ECGChart.prototype._playheadTimes.call(fake);
      assert.equal(marker.length,1,'Exactly one current-time marker in each simultaneous lead');
      assert.ok(Math.abs(marker[0]-fake.lastTime)<1e-10,'The marker is the actual record time, not a repeated beat phase');
    }
    assert.equal(lastEnd,record.seconds);
    assert.equal(clinicalWindow(record,record.seconds,requested).index,first.count-1,'Record end retains the final page');
  }
  assert.equal(hash(record.signals),before,'Scaling and windowing do not alter any original voltage sample');
}

// An isolated unipolar artifact must enlarge the page, not clip or normalize it.
for(const signals of [{I:[0,0,12,0],II:[0,.1,0,0]},{I:[0,0,-12,0],II:[0,-.1,0,0]}]){
  const common=clinicalGridScale({signals},Object.keys(signals),20);
  const layout=chartScale(220,common.height,{...common,compact:true,voltageTicks:true});
  for(const value of Object.values(signals).flat()){
    const y=layout.baseline-value*layout.pxPerMV;assert.ok(y>=layout.top+24-1e-9&&y<=common.height-layout.bottom-24+1e-9);
  }
  assert.equal(layout.pxPerMV,100,'A large outlier never silently reduces the gain of the other lead');
}
assert.equal(clinicalWindow({fs:500,seconds:10},2.499,2.5).start,0);
assert.equal(clinicalWindow({fs:500,seconds:10},2.5,2.5).start,2.5);
assert.deepEqual(clinicalWindow({fs:500,seconds:14},13.998,2.5),{start:12.5,end:14,duration:1.5,index:5,count:6,pageSeconds:2.5,total:14});
console.log(JSON.stringify({passed:true,records:records.length,valuesChecked,pagesChecked,seeksChecked,
  defaultGainPxPerMV:50,previousGainPxPerMV:8.5,verticalMagnification:50/8.5,
  defaultWindowSeconds:2.5,previousWindowSeconds:10,timeMagnification:4,
  amplitude:'Shared gain and zero line, no per-lead normalization or source changes',
  bounds:'Every source sample visible at all three gains; artifact extremes expand height',
  paging:'Stationary within each interval; exact sample-based seeks and one cursor per lead',
  maxHeightAtHighestGain:maxHeight},null,2));

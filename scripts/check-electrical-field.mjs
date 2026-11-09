// Scientific consistency checks for the new shared teaching field. Run with
// node scripts/check-electrical-field.mjs; no browser or network is required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {installElectricalField,electricalReferenceAt,electricalTimingAt,electricalSampleAt,electricalTemplateValue,electricalTextureBytes,ELECTRICAL_VIEWS} from '../dist/electrical-field.js';
import {AP_SITES,actionPotentialSite,actionPotentialAt,actionPotentialLandmarks} from '../dist/action-potentials.js';
import {installConductionCoupling} from '../dist/conduction-coupling.js';
import {getFiducials} from '../dist/ecg.js';

const meta=JSON.parse(fs.readFileSync(new URL('../dist/data/electrical-atlas.json',import.meta.url)));
const raw=fs.readFileSync(new URL('../dist/data/electrical-atlas.f32',import.meta.url));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),meta.binarySha256);
const original=fs.readFileSync(new URL('../dist/cardiac-voltage/data/heart-model.json',import.meta.url));
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),meta.sourceSha256,'Projection must identify its unchanged source');
installElectricalField(meta,new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
installConductionCoupling(JSON.parse(fs.readFileSync(new URL('../dist/data/conduction-coupling.json',import.meta.url))));

// Transmural order must be retained throughout the mapped teaching wall,
// including away from the two selected AP probes.
let pairs=0,minimumOutward=Infinity,maximumOutward=-Infinity;
for(const chamber of [1,2]){
  const bounds=meta.chambers[chamber].targetBounds;
  for(const u of [.2,.4,.6,.8])for(const v of [.2,.4,.6,.8])for(const w of [.2,.4,.6,.8]){
    const p=[u,v,w].map((q,k)=>bounds[0][k]+q*(bounds[1][k]-bounds[0][k]));
    const options={lvWeight:chamber===1?1:0};
    const inner=electricalReferenceAt(p,{...options,transmuralDepth:0});
    const outer=electricalReferenceAt(p,{...options,transmuralDepth:1});
    const delay=outer[0]-inner[0];assert.ok(delay>.001&&delay<=.03501,'An outward wall delay must remain positive and bounded after the common QRS timing warp');
    minimumOutward=Math.min(minimumOutward,delay);maximumOutward=Math.max(maximumOutward,delay);pairs++;
  }
}

// Source timing, selected working-cell plots and local surface sampling must
// use one clock. Delayed recovery must always remain AT+APD, never a backwards
// traveling impulse. Check several rates and throughout the entire beat.
let rowError=0,maxAP90Error=0;
for(const bpm of [45,72,120]){
  const f=getFiducials(bpm);
  for(const site of AP_SITES.filter(s=>s.kind==='ventricular'||s.kind==='atrial').map(s=>actionPotentialSite(s.id))){
    const options={...f,rr:f.rr,atrial:site.kind==='atrial',atrium:'right',lvWeight:site.lvWeight,transmuralDepth:site.transmuralDepth};
    const timing=electricalTimingAt(site.location,options),landmarks=actionPotentialLandmarks(site.id,bpm);
    assert.ok(Math.abs(timing.activation-landmarks.activation)<1e-10);
    assert.ok(Math.abs(timing.recovery90-timing.activation-timing.apd90)<1e-10);
    for(let time=0;time<f.rr;time+=.002){
      const local=timing.activation+((time-timing.activation+.004)%f.rr+f.rr)%f.rr-.004;
      const sample=electricalSampleAt(local,site.location,options);
      assert.ok(Number.isFinite(sample.voltage)&&sample.voltage>=-86&&sample.voltage<=26);
      assert.ok(sample.front>=0&&sample.front<=1&&sample.back>=0&&sample.back<=1);
      rowError=Math.max(rowError,Math.abs(actionPotentialAt(time,site.id,bpm)-sample.voltage));
    }
    const q90=electricalTemplateValue(timing.apd90,timing.apd90,site.kind==='atrial');
    maxAP90Error=Math.max(maxAP90Error,Math.abs(q90-.10));
  }
}
assert.ok(rowError<1e-8,'Working-cell traces and the spatial field must agree');
assert.ok(maxAP90Error<.006,'Resampled AP90 must retain its numerical definition');

// A conduction delay is local: a right bundle delay should preserve LV timing
// while delaying RV recruitment. Injury changes resting cellular voltage and
// local duration, even when the lesion outline is hidden by presentation UI.
const left=[.55,-.78,.15],right=[-.40,-.67,.74];
const healthyLV=electricalTimingAt(left,{lvWeight:1}),healthyRV=electricalTimingAt(right,{lvWeight:0});
const blockedLV=electricalTimingAt(left,{lvWeight:1,qrsEnd:.16,rvDelay:.078});
const blockedRV=electricalTimingAt(right,{lvWeight:0,qrsEnd:.16,rvDelay:.078});
assert.ok(Math.abs(blockedLV.activation-healthyLV.activation)<.001);
assert.ok(blockedRV.activation-healthyRV.activation>.010,'Blocked RV free-wall recruitment must be later; the delay now varies along the septal-entry route');
assert.ok(blockedRV.activation<.160,'The alternate recruitment remains within the displayed QRS window');
const injuryPoint=[.80,-.55,.95],healthy=electricalSampleAt(-.10,injuryPoint,{lvWeight:1});
const injured=electricalSampleAt(-.10,injuryPoint,{lvWeight:1,injuryTerritory:'anterior',injurySeverity:.7});
assert.ok(injured.voltage>healthy.voltage+5);assert.ok(injured.apd90<healthy.apd90);

// The WebGL LUT uses two unsigned bytes to avoid float-texture filtering
// support differences. Its interpolation error should be negligible in mV.
const packed=electricalTextureBytes();let textureError=0;
for(let row=0;row<2;row++)for(let i=0;i<2048;i++){
  const q=(packed[(row*2048+i)*4]*256+packed[(row*2048+i)*4+1])/65535;
  const ref=electricalTemplateValue(-.012+i/2047*1.012,row?.296802303:.300,!!row);
  textureError=Math.max(textureError,Math.abs(q-ref)*110);
}
assert.ok(textureError<.001);
assert.equal(Object.keys(ELECTRICAL_VIEWS).length,5);
console.log(JSON.stringify({passed:true,transmuralPairs:pairs,outwardDelayMs:[minimumOutward*1000,maximumOutward*1000],workingCellRowMaxErrorMv:rowError,ap90MaxNormalizedError:maxAP90Error,gpuTextureMaxErrorMv:textureError,rbbbRVDelayMs:(blockedRV.activation-healthyRV.activation)*1000},null,2));

// Input to check-electrical-gpu.py. The scene shader is obtained by calling the
// real material injection, rather than maintaining a second test-only shader.
import fs from 'node:fs';
import {register} from 'node:module';
import {installElectricalField,electricalReferenceAt,electricalBlockReferenceAt,electricalSampleAt,electricalTextureBytes,electricalDisplayColorAt,ELECTRICAL_FIELD_GLSL} from '../dist/electrical-field.js';
import {installConductionCoupling} from '../dist/conduction-coupling.js';
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{HeartScene}=await import('../dist/scenes.js');
const raw=fs.readFileSync(new URL('../dist/data/electrical-atlas.f32',import.meta.url));
installElectricalField(JSON.parse(fs.readFileSync(new URL('../dist/data/electrical-atlas.json',import.meta.url))),new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4));
installConductionCoupling(JSON.parse(fs.readFileSync(new URL('../dist/data/conduction-coupling.json',import.meta.url))));
const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.1,0,0,0,.1,0],3));
const material=new THREE.MeshPhysicalMaterial(),mesh=new THREE.Mesh(geometry,material);mesh.name='ventricular-wall';
HeartScene.prototype.addActivationMaterial.call({shaderMaterials:[],electricalView:'voltage',electricalTexture:null},mesh,material);
const shader={uniforms:{},vertexShader:'#include <common>\nvoid main(){\n#include <begin_vertex>\ngl_Position=vec4(aRestPosition,1.0);\n}',fragmentShader:'#include <common>\nvoid main(){vec4 diffuseColor=vec4(.35,.14,.11,1.0);\n#include <color_fragment>\ngl_FragColor=diffuseColor;\n}'};
material.onBeforeCompile(shader);
const cases=[];
for(const preset of [
  {p:[.6,-.8,.1],o:{lvWeight:1,transmuralDepth:.05}},
  {p:[.9,-.8,.3],o:{lvWeight:1,transmuralDepth:.95}},
  {p:[-.6,-.7,.8],o:{lvWeight:0,transmuralDepth:.85,qrsEnd:.16,rvDelay:.078}},
  {p:[.6,-.8,.1],o:{lvWeight:1,transmuralDepth:.05,qrsEnd:.16,lvDelay:.075}},
  {p:[.8,-.6,1],o:{lvWeight:1,transmuralDepth:.8,injuryTerritory:'anterior'}},
  {p:[-.8,.3,.1],o:{atrial:true,atrium:'right',rr:.6}},
  {p:[.4,.2,-.3],o:{atrial:true,atrium:'left',rr:1.2}},
  {p:[-.4,-.9,.15],o:{lvWeight:0,transmuralDepth:.1,ectopic:true,qrsEnd:.17}}
]){
  const options={qrsStart:0,qrsEnd:.09,tStart:.2,tEnd:.38,pStart:-.16,pEnd:-.06,lvWeight:.5,lvDelay:0,rvDelay:.008,rr:60/72,...preset.o};
  const reference=Array.from(new Float32Array(electricalReferenceAt(preset.p,options)));options.reference=reference;
  const blockReference=Array.from(new Float32Array(electricalBlockReferenceAt(preset.p,options)));options.blockReference=blockReference;
  const s=electricalSampleAt(0,preset.p,options);
  for(const age of [-.015,-.001,0,.001,.005,.05,s.apd90*.75,s.apd90*.9,s.apd90,s.apd90*1.1]){
    const phase=s.activation+age,sample=electricalSampleAt(phase,preset.p,options);
    const display=Object.fromEntries([0,1,2,3,4].map(view=>[view,electricalDisplayColorAt([.35,.14,.11],sample,{...options,phase,view})]));
    cases.push({position:preset.p,reference,blockReference,options,phase,injury:sample.injury,
      expectedTiming:[sample.activation,sample.apd90,sample.recovery90,sample.injury],
      expectedWaveform:[sample.normalized,sample.front,sample.back,sample.depolarized],display});
  }
}
console.log(JSON.stringify({fieldGLSL:ELECTRICAL_FIELD_GLSL,sceneVertex:shader.vertexShader,sceneFragment:shader.fragmentShader,texture:Array.from(electricalTextureBytes()),cases}));

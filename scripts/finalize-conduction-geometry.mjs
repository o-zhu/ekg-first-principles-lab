/** Resolve each shared junction/probe on the exact curve used by the viewer. */
import fs from 'node:fs';
import {register} from 'node:module';
import {installConductionCoupling} from '../dist/conduction-coupling.js';
import {sourceGeometry as source} from './conduction-source-geometry.mjs';
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{makeConductionSystem}=await import('../dist/conduction-system.js');
const file=new URL('../dist/data/conduction-coupling.json',import.meta.url),data=JSON.parse(fs.readFileSync(file));installConductionCoupling(data);
const meshes={};for(const name of ['left-ventricle','right-ventricle']){const s=source.geometry[name],geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(s.positions),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(s.indices),1));meshes[name]=new THREE.Mesh(geometry);}
const network=makeConductionSystem(meshes,{software:false});
for(const def of data.paths){const actual=network.pathById.get(def.id);def.points=actual.curve.points.map(p=>p.toArray());}
for(const probe of Object.values(data.probeSites))if(probe.pathId)probe.position=network.pathById.get(probe.pathId).curve.getPoint(probe.fraction).toArray();
data.audit.curveJunctionsFinalized=true;fs.writeFileSync(file,JSON.stringify(data)+'\n');

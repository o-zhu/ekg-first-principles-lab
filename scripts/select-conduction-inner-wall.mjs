/** Reproduce the source wall faces used by the coupled conduction graph. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {installConductionCoupling} from '../dist/conduction-coupling.js';
import {sourceGeometry as source} from './conduction-source-geometry.mjs';
import * as THREE from '../dist/vendor/three.module.js';
const adapt=g=>({...g,arrival:new Array(g.positions.length/3).fill(0),velocity:1});
const c=installConductionCoupling({schemaVersion:1,paths:[{id:'geometry-only'}],surfaces:{lv:adapt(source.geometry['left-ventricle']),rv:adapt(source.geometry['right-ventricle'])}});
const wall=source.geometry['ventricular-wall'],p=[];for(let i=0;i<wall.positions.length;i+=3)p.push(wall.positions.slice(i,i+3));
const sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),normal=(a,b,d)=>{const u=sub(b,a),v=sub(d,a),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n);return n.map(x=>x/(l||1));};
const faces=[],selected={left:[],right:[]};
const triangles={};for(const side of ['lv','rv'])triangles[side]=c.surfaces[side].faces.map(f=>{const tri=new THREE.Triangle(...f.map(i=>new THREE.Vector3(...c.surfaces[side].points[i])));return {tri,normal:tri.getNormal(new THREE.Vector3())};});
const closest=new THREE.Vector3(),center=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),d=new THREE.Vector3(),tri=new THREE.Triangle(),n=new THREE.Vector3();
function exactNearest(side,point){let best=Infinity,out;for(const entry of triangles[side]){entry.tri.closestPointToPoint(point,closest);const distance=closest.distanceToSquared(point);if(distance<best){best=distance;out={distance:Math.sqrt(distance),normal:entry.normal};}}return out;}
for(let i=0;i<wall.indices.length;i+=3){
  const ids=wall.indices.slice(i,i+3);a.set(...p[ids[0]]);b.set(...p[ids[1]]);d.set(...p[ids[2]]);center.copy(a).add(b).add(d).multiplyScalar(1/3);tri.set(a,b,d).getNormal(n);
  const left=exactNearest('lv',center),right=exactNearest('rv',center),side=left.distance<right.distance?'left':'right',near=side==='left'?left:right;
  faces.push(ids);if(near.distance<.15&&n.dot(near.normal)<-.1)selected[side].push(i/3);
}
function largestEdgeComponent(ids){
  const byEdge=new Map();for(const id of ids){const f=faces[id];for(const [a,b]of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]){const key=a<b?a+','+b:b+','+a;if(!byEdge.has(key))byEdge.set(key,[]);byEdge.get(key).push(id);}}
  const remaining=new Set(ids),components=[];
  for(const seed of ids)if(remaining.delete(seed)){const group=[],queue=[seed];while(queue.length){const id=queue.pop(),f=faces[id];group.push(id);for(const [a,b]of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]])for(const other of byEdge.get(a<b?a+','+b:b+','+a)||[])if(remaining.delete(other))queue.push(other);}components.push(group);}
  return components.sort((a,b)=>b.length-a.length)[0].sort((a,b)=>a-b);
}
const faceIndices=Object.fromEntries(Object.entries(selected).map(([key,ids])=>[key,largestEdgeComponent(ids)]));
const file=new URL('../data-source/conduction-inner-wall-faces.json',import.meta.url),old=JSON.parse(fs.readFileSync(file));
for(const side of ['left','right'])if([...old.faceIndices[side]].sort((a,b)=>a-b).join(',')!==faceIndices[side].join(','))throw Error('Derived '+side+' patch differs from checked source selection');
if(process.argv.includes('--write'))fs.writeFileSync(file,JSON.stringify({variant:'full',faceIndices,method:'Nearest cavity determines chamber; visible wall face opposes cavity normal (dot < -0.1), separation < 0.15 scene units; retain largest edge-connected patch. Exact-coordinate seam vertices are welded later by the field generator.',sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../dist/models/heart.glb',import.meta.url))).digest('hex'),scope:'Visible ventricular-wall inner surfaces, not hidden cavity surfaces.'})+'\n');
console.log(JSON.stringify({passed:true,faceCounts:Object.fromEntries(Object.entries(faceIndices).map(([k,v])=>[k,v.length])),mode:process.argv.includes('--write')?'wrote verified selection':'verified exact selection'}));

/** Export the immutable source anatomy and registered guide geometry. */
import fs from 'node:fs';
import {register} from 'node:module';
const threeURL=new URL('../dist/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript;base64,'+Buffer.from(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const THREE=await import(threeURL),{makeConductionSystem}=await import('../dist/conduction-system.js');
const glb=fs.readFileSync(new URL('../dist/models/heart.glb',import.meta.url)),jsonLength=glb.readUInt32LE(12),gltf=JSON.parse(glb.subarray(20,20+jsonLength)),binaryOffset=28+jsonLength;
function accessor(id){
  const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],components=a.type==='VEC3'?3:1,bytes=a.componentType===5123?2:4;
  const array=a.componentType===5126?new Float32Array(a.count*components):new Uint32Array(a.count*components),offset=binaryOffset+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||components*bytes;
  for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){const p=offset+i*stride+j*bytes;array[i*components+j]=a.componentType===5126?glb.readFloatLE(p):bytes===2?glb.readUInt16LE(p):glb.readUInt32LE(p);}
  return array;
}
const meshes={},geometry={};
for(const name of ['left-ventricle','right-ventricle','ventricular-wall','left-atrium','right-atrium']){
  const p=gltf.meshes.find(m=>m.name===name).primitives[0],positions=accessor(p.attributes.POSITION),indices=accessor(p.indices);
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(positions,3));g.setIndex(new THREE.BufferAttribute(indices,1));meshes[name]=new THREE.Mesh(g);geometry[name]={positions:Array.from(positions),indices:Array.from(indices)};
}
// No electrical atlas is installed here, so the constructor uses the source
// cavity projection rather than any installed coupled asset.
const n=makeConductionSystem(meshes,{software:false,coupling:false});
const paths=n.paths.map(d=>({id:d.id,side:d.side,role:d.role,parentId:d.parentId,parentFraction:d.parentFraction,points:d.curve.points.map(p=>p.toArray()),samples:Array.from({length:129},(_,i)=>d.curve.getPoint(i/128).toArray())}));
export const sourceGeometry={geometry,paths,nodes:n.nodes};
if(process.argv[1]===new URL(import.meta.url).pathname)console.log(JSON.stringify(sourceGeometry));

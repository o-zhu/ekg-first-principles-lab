/**
 * Shared first-arrival model for the teaching conducting tree and myocardium.
 * All graph solves are prepared offline on actual anatomical surface edges.
 * This module only samples the precomputed field; it does not change ECG data.
 */
let coupling=null,pending=null,revision=0;
const clamp=x=>Math.max(0,Math.min(1,x));
export const conductionCouplingReady=()=>!!coupling;
export const conductionCouplingData=()=>coupling;
export const conductionCouplingRevision=()=>revision;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const plus=(a,b,t)=>[a[0]+b[0]*t,a[1]+b[1]*t,a[2]+b[2]*t];
const d2=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
function closestTriangle(p,a,b,c){
  const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2a=dot(ac,ap);
  if(d1<=0&&d2a<=0)return a;
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
  const vc=d1*d4-d3*d2a;if(vc<=0&&d1>=0&&d3<=0)return plus(a,ab,d1/(d1-d3));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
  const vb=d5*d2a-d1*d6;if(vb<=0&&d2a>=0&&d6<=0)return plus(a,ac,d2a/(d2a-d6));
  const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return plus(b,sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)));
  const inv=1/(va+vb+vc),v=vb*inv,w=vc*inv;return [a[0]+ab[0]*v+ac[0]*w,a[1]+ab[1]*v+ac[1]*w,a[2]+ab[2]*v+ac[2]*w];
}
function boxDistance(p,n){let d=0;for(let i=0;i<3;i++){const q=Math.max(n.min[i]-p[i],0,p[i]-n.max[i]);d+=q*q;}return d;}
class SurfaceField{
  constructor(data){
    Object.assign(this,data);this.points=[];for(let i=0;i<data.positions.length;i+=3)this.points.push(data.positions.slice(i,i+3));
    this.faces=[];for(let i=0;i<data.indices.length;i+=3)this.faces.push(data.indices.slice(i,i+3));
    this.exactVertices=new Map();this.cache=new Map();
    for(let f=0;f<this.faces.length;f++)for(const id of this.faces[f]){const key=this.points[id].map(x=>Math.round(x*1e7)).join(',');if(!this.exactVertices.has(key))this.exactVertices.set(key,{id,face:f});}
    this.faceSources=new Map();for(const source of data.sources||[]){const list=this.faceSources.get(source.face)||[];list.push(source);this.faceSources.set(source.face,list);}
    this.faceBlockedSources=new Map();for(const source of data.blockedSources||[]){const list=this.faceBlockedSources.get(source.face)||[];list.push(source);this.faceBlockedSources.set(source.face,list);}
    this.bounds=this.faces.map(f=>({min:[0,1,2].map(k=>Math.min(...f.map(i=>this.points[i][k]))),max:[0,1,2].map(k=>Math.max(...f.map(i=>this.points[i][k])))}));
    const build=ids=>{
      const n={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
      for(const id of ids)for(let k=0;k<3;k++){n.min[k]=Math.min(n.min[k],this.bounds[id].min[k]);n.max[k]=Math.max(n.max[k],this.bounds[id].max[k]);}
      if(ids.length<=8)n.ids=ids;else{let axis=0;for(let k=1;k<3;k++)if(n.max[k]-n.min[k]>n.max[axis]-n.min[axis])axis=k;ids.sort((a,b)=>(this.bounds[a].min[axis]+this.bounds[a].max[axis])-(this.bounds[b].min[axis]+this.bounds[b].max[axis]));const half=ids.length>>1;n.left=build(ids.slice(0,half));n.right=build(ids.slice(half));}return n;
    };
    this.tree=build(this.faces.map((_,i)=>i));
  }
  nearest(p){
    const key=p.map(x=>Math.round(x*1e7)).join(','),cached=this.cache.get(key);if(cached)return cached;
    const exact=this.exactVertices.get(key);if(exact){const out={face:exact.face,point:this.points[exact.id],distance:Math.sqrt(d2(p,this.points[exact.id])),vertex:exact.id};this.cache.set(key,out);return out;}
    let best=Infinity,face=-1,point=null;
    const visit=n=>{if(boxDistance(p,n)>best)return;if(n.ids){for(const id of n.ids){if(boxDistance(p,this.bounds[id])>best)continue;const f=this.faces[id],q=closestTriangle(p,...f.map(i=>this.points[i])),d=d2(p,q);if(d<best){best=d;face=id;point=q;}}}else{const a=boxDistance(p,n.left),b=boxDistance(p,n.right);if(a<b){visit(n.left);visit(n.right);}else{visit(n.right);visit(n.left);}}};
    visit(this.tree);const out={face,point,distance:Math.sqrt(best)};if(this.cache.size>90000)this.cache.clear();this.cache.set(key,out);return out;
  }
  sample(p,blocked=false){
    const near=this.nearest(p),ids=this.faces[near.face];let time=Infinity;
    // Finish inside the final surface triangle, never by a chord through a
    // chamber. Explicit source-to-triangle paths retain exact junction AT.
    const arrivals=blocked&&this.blockedArrival?this.blockedArrival:this.arrival,sources=blocked?this.faceBlockedSources:this.faceSources;
    if(near.vertex!==undefined)return {...near,time:arrivals[near.vertex]};
    for(const id of ids)time=Math.min(time,arrivals[id]+Math.sqrt(d2(near.point,this.points[id]))/this.velocity);
    for(const s of sources.get(near.face)||[])time=Math.min(time,s.time+Math.sqrt(d2(near.point,s.position))/this.velocity);
    return {...near,time};
  }
}
export function installConductionCoupling(data){
  if(data.schemaVersion!==1||!data.surfaces?.lv||!data.paths?.length)throw Error('Invalid conduction coupling field');
  const surfaces={};for(const [name,s]of Object.entries(data.surfaces)){if(s.positions.length%3||s.indices.length%3||s.arrival.length*3!==s.positions.length)throw Error('Invalid conducting surface '+name);surfaces[name]=new SurfaceField(s);}
  coupling={...data,surfaces,pathById:new Map(data.paths.map(p=>[p.id,p]))};revision++;return coupling;
}
export function loadConductionCoupling(){
  if(coupling)return Promise.resolve(coupling);if(pending)return pending;
  pending=fetch(new URL('./data/conduction-coupling.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Coupled conduction field unavailable');return r.json();}).then(installConductionCoupling).catch(error=>{pending=null;throw error;});return pending;
}
export function coupledSurfaceSample(position,side='lv',blocked=false){
  if(!coupling)return null;return coupling.surfaces[side]?.sample([position.x??position[0],position.y??position[1],position.z??position[2]],blocked)||null;
}
export function coupledTransmuralDepth(position,lvWeight=.5){
  if(!coupling)return null;const p=[position.x??position[0],position.y??position[1],position.z??position[2]],lv=clamp(lvWeight);
  const left=coupling.surfaces.lv.nearest(p).distance,right=coupling.surfaces.rv.nearest(p).distance;
  return clamp((left*lv+right*(1-lv))/coupling.reference.wallDepthScale);
}
export function coupledLVWeight(position,fallback=.5){
  if(!coupling)return fallback;const p=[position.x??position[0],position.y??position[1],position.z??position[2]],left=coupling.surfaces.lv.nearest(p).distance,right=coupling.surfaces.rv.nearest(p).distance;
  if(left<1e-6&&right>1e-6)return 1;if(right<1e-6&&left>1e-6)return 0;
  if(left+right<1e-9)return clamp(fallback);
  // Squared-distance partition gives a pure surface and a smooth intramural
  // septal coordinate. It is shared by the shader and all local-voltage probes.
  return right*right/(left*left+right*right);
}
export function coupledReferenceFraction(position,{lvWeight=.5,atrial=false,atrium=null}={}){
  if(!coupling)return null;
  if(atrial){const side=atrium==='left'||atrium===3?'la':atrium==='right'||atrium===4?'ra':(position.x??position[0])>-.28?'la':'ra';return coupledSurfaceSample(position,side).time/coupling.reference.atrialDuration;}
  const lv=clamp(lvWeight),left=lv>0?coupledSurfaceSample(position,'lv').time:0,right=lv<1?coupledSurfaceSample(position,'rv').time:0;
  return (left*lv+right*(1-lv))/coupling.reference.ventricularDuration;
}
export function coupledBlockReferenceFraction(position,side){
  if(!coupling)return null;const gate=coupling.reference.blockedEntryFractions?.[side]||0;return gate+(1-gate)*coupledSurfaceSample(position,side,true).time/(coupling.reference.blockedDurations?.[side]||coupling.reference.ventricularDuration);
}

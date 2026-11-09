import * as THREE from 'three';

function indexedGeometry(values,source){
  const g=new THREE.BufferGeometry(),names=Object.keys(values),unique=Object.fromEntries(names.map(n=>[n,[]])),lookup=new Map(),indices=[],p=values.position;
  for(let i=0;i<p.length/3;i++){
    const key=[p[i*3],p[i*3+1],p[i*3+2]].map(x=>Math.round(x*1e6)).join(','),found=lookup.get(key);
    if(found!==undefined){indices.push(found);continue;}
    const id=lookup.size;lookup.set(key,id);indices.push(id);
    for(const name of names){const size=source.attributes[name].itemSize;for(let j=0;j<size;j++)unique[name].push(values[name][i*size+j]);}
  }
  for(const name of names)g.setAttribute(name,new THREE.Float32BufferAttribute(unique[name],source.attributes[name].itemSize));
  g.setIndex(indices);g.computeVertexNormals();g.computeBoundingSphere();return g;
}

// A geometric anterior section of the registered source surface. New vertices
// retain source-position and regional attributes, so the section deforms with
// the same continuous field as the intact wall. No transparent-shell shortcut.
export function sectionMyocardium(source,planeZ=.43,{cap=true}={}){
  const position=source.getAttribute('position'),index=source.index;
  const names=Object.keys(source.attributes).filter(n=>source.attributes[n].itemSize<=4),out=Object.fromEntries(names.map(n=>[n,[]]));
  const components={1:['getX'],2:['getX','getY'],3:['getX','getY','getZ'],4:['getX','getY','getZ','getW']};
  const read=i=>Object.fromEntries(names.map(n=>{const a=source.attributes[n];return[n,components[a.itemSize].map(fn=>a[fn](i))];}));
  const lerp=(a,b,t)=>Object.fromEntries(names.map(n=>[n,a[n].map((v,j)=>v+(b[n][j]-v)*t)]));
  const emit=vertex=>{for(const n of names)out[n].push(...vertex[n]);};
  const segments=[],count=index?index.count:position.count;
  for(let f=0;f<count;f+=3){
    const triangle=[0,1,2].map(j=>read(index?index.getX(f+j):f+j)),polygon=[],cross=[];
    for(let j=0;j<3;j++){
      const a=triangle[j],b=triangle[(j+1)%3],insideA=a.position[2]<=planeZ,insideB=b.position[2]<=planeZ;
      if(insideA)polygon.push(a);
      if(insideA!==insideB){const t=(planeZ-a.position[2])/(b.position[2]-a.position[2]),p=lerp(a,b,t);p.position[2]=planeZ;polygon.push(p);cross.push(p);}
    }
    if(cross.length===2)segments.push(cross);
    for(let j=1;j+1<polygon.length;j++){emit(polygon[0]);emit(polygon[j]);emit(polygon[j+1]);}
  }
  const geometry=indexedGeometry(out,source);
  if(!cap||!segments.length)return {geometry,capGeometry:null,loops:0,planeZ};

  // Stitch exact triangle/plane intersections. Coincident source seams can have
  // separate vertices; a small coordinate tolerance joins their shared edge.
  const key=p=>Math.round(p.position[0]*1e5)+','+Math.round(p.position[1]*1e5),points=new Map(),neighbors=new Map();
  const add=(a,b)=>{const ka=key(a),kb=key(b);if(ka===kb)return;points.set(ka,a);points.set(kb,b);if(!neighbors.has(ka))neighbors.set(ka,new Set());if(!neighbors.has(kb))neighbors.set(kb,new Set());neighbors.get(ka).add(kb);neighbors.get(kb).add(ka);};
  for(const [a,b]of segments)add(a,b);
  // Close tiny numerical cracks only, never span an anatomical opening.
  const ends=[...neighbors].filter(([,n])=>n.size===1).map(([k])=>k);
  for(let i=0;i<ends.length;i++)for(let j=i+1;j<ends.length;j++){
    const a=ends[i],b=ends[j];if(neighbors.get(a).size!==1||neighbors.get(b).size!==1)continue;
    const pa=points.get(a).position,pb=points.get(b).position;if(Math.hypot(pa[0]-pb[0],pa[1]-pb[1])<.003){neighbors.get(a).add(b);neighbors.get(b).add(a);}
  }
  const visited=new Set(),loops=[];
  for(const first of neighbors.keys()){
    if(visited.has(first)||neighbors.get(first).size!==2)continue;
    let current=first,previous=null;const ring=[];
    for(let guard=0;guard<neighbors.size+2;guard++){
      if(visited.has(current))break;visited.add(current);ring.push(points.get(current));
      const links=[...neighbors.get(current)],next=links.find(k=>k!==previous);previous=current;current=next;
      if(current===first){if(ring.length>=3)loops.push(ring);break;}
      if(!current||neighbors.get(current)?.size!==2)break;
    }
  }
  const area=ring=>Math.abs(THREE.ShapeUtils.area(ring.map(p=>new THREE.Vector2(...p.position))));
  const contains=(ring,p)=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i].position,b=ring[j].position;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
  const ordered=loops.filter(l=>area(l)>1e-6).sort((a,b)=>area(b)-area(a)),parents=ordered.map((ring,i)=>{let parent=-1;for(let j=0;j<i;j++)if(contains(ordered[j],ring[0].position))parent=j;return parent;}),depths=[];
  for(let i=0;i<ordered.length;i++)depths[i]=parents[i]<0?0:depths[parents[i]]+1;
  const caps=Object.fromEntries(names.map(n=>[n,[]]));
  const addCap=p=>{for(const n of names)caps[n].push(...(n==='normal'?[0,0,1]:p[n]));};
  for(let i=0;i<ordered.length;i++){
    if(depths[i]%2)continue;
    const outer=ordered[i],holes=ordered.filter((_,j)=>parents[j]===i&&depths[j]===depths[i]+1),all=[outer,...holes].flat();
    const faces=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(p.position[0],p.position[1])),holes.map(r=>r.map(p=>new THREE.Vector2(p.position[0],p.position[1]))));
    // Subdivide large cut-face triangles so their deformation samples the local
    // field instead of stretching one straight triangle across a whole chamber.
    const subdivide=(a,b,c,depth=0)=>{
      const distance=(u,v)=>Math.hypot(...u.position.map((x,j)=>x-v.position[j]));
      if(depth<3&&Math.max(distance(a,b),distance(b,c),distance(c,a))>.20){const ab=lerp(a,b,.5),bc=lerp(b,c,.5),ca=lerp(c,a,.5);subdivide(a,ab,ca,depth+1);subdivide(ab,b,bc,depth+1);subdivide(ca,bc,c,depth+1);subdivide(ab,bc,ca,depth+1);}
      else{addCap(a);addCap(b);addCap(c);}
    };
    for(const [a,b,c]of faces)subdivide(all[a],all[b],all[c]);
  }
  const capGeometry=indexedGeometry(caps,source);
  return {geometry,capGeometry,loops:loops.length,planeZ};
}

// Remove the ragged distal crop of the source IVC with a transverse open cut.
// Original vertex indices are preserved: precomputed upper collar attachments
// still reference exactly the same source vertices and barycentric weights.
export function trimInferiorVessel(source,minimumY=-1.58){
  const names=Object.keys(source.attributes),data=Object.fromEntries(names.map(name=>[name,[]])),sizes=Object.fromEntries(names.map(name=>[name,source.attributes[name].itemSize])),getters=['getX','getY','getZ','getW'];
  for(const name of names){const a=source.attributes[name];for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)data[name].push(a[getters[j]](i));}
  const read=(index,name)=>data[name].slice(index*sizes[name],(index+1)*sizes[name]);
  const intersections=new Map(),indices=[],idx=source.index,count=idx?.count||source.attributes.position.count;
  function cross(a,b){const key=a<b?a+','+b:b+','+a;if(intersections.has(key))return intersections.get(key);const pa=read(a,'position'),pb=read(b,'position'),t=(minimumY-pa[1])/(pb[1]-pa[1]),id=data.position.length/3;for(const name of names){const aa=read(a,name),bb=read(b,name);for(let j=0;j<aa.length;j++)data[name].push(name==='position'&&j===1?minimumY:aa[j]+(bb[j]-aa[j])*t);}intersections.set(key,id);return id;}
  for(let k=0;k<count;k+=3){const tri=[0,1,2].map(j=>idx?idx.getX(k+j):k+j),poly=[];for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],insideA=data.position[a*3+1]>=minimumY,insideB=data.position[b*3+1]>=minimumY;if(insideA)poly.push(a);if(insideA!==insideB)poly.push(cross(a,b));}for(let j=1;j+1<poly.length;j++)indices.push(poly[0],poly[j],poly[j+1]);}
  const geometry=new THREE.BufferGeometry();for(const name of names)geometry.setAttribute(name,new THREE.Float32BufferAttribute(data[name],sizes[name]));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.userData.inferiorOpenSection=minimumY;return geometry;
}

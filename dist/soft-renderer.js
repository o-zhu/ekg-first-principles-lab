import * as THREE from 'three';
import {electricalSampleAt,electricalDisplayColorAt,injuryWeightAt} from './electrical-field.js';

// Perspective software 3D for environments where WebGL is disabled. It renders
// the same reference surfaces and the same deformed vertex positions as WebGL.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
// Schematic fields for recorded tachyarrhythmia lessons. Their geometry is
// intentionally generic: source ECGs do not provide a patient activation map,
// scar circuit, ventricular focus, or flutter phase. Spatially coherent fronts
// coexist with disordered components in VF; this is not random vertex flicker.
const FIELD=Object.freeze({vx:3.7,vy:5.1,vz:2.8,va:33,wx:-4.3,wy:2.2,wz:4.7,wb:27,wx2:6.2,wy2:-4.1,wz2:3.8,wc:41});
const wrapDistance=x=>x-Math.floor(x+.5);
export function ventricularArrhythmiaFieldAt(p,{phase=0,qStart=0,qEnd=.16,tStart=.19,tEnd=.30,clock=0,mode=1,disorganization=0}={},out={}){
  const x=p.x??p[0],y=p.y??p[1],z=p.z??p[2],qWidth=clamp(qEnd-qStart,.06,.30);
  const angle=mode>1.5&&mode<2.5?.70*Math.sin(clock*3.7)+.55*Math.sin(clock*1.9):0;
  const spatial=clamp(.5+.26*(x*Math.cos(angle)+z*Math.sin(angle))+.18*y);
  const arrival=qStart+qWidth*.78*spatial,recovery=Math.max(qEnd+.035,tStart+(tEnd-tStart)*.55)+qWidth*.10*(spatial-.5);
  let dep=smooth(arrival,arrival+.016,phase)*(1-smooth(recovery-.040,recovery+.030,phase));
  let front=Math.exp(-(((phase-arrival)/.014)**2)),back=Math.exp(-(((phase-recovery)/.030)**2));
  const fib=Math.sin(x*FIELD.vx+y*FIELD.vy+z*FIELD.vz-clock*FIELD.va)+.70*Math.sin(x*FIELD.wx+y*FIELD.wy+z*FIELD.wz+clock*FIELD.wb)+.30*Math.sin(x*FIELD.wx2+y*FIELD.wy2+z*FIELD.wz2-clock*FIELD.wc);
  const blend=mode>2.5?1:mode>1.5?.45*clamp(disorganization):0;
  dep+=(.30+.20*Math.sin(fib*2)-dep)*blend;
  front+=(smooth(.65,1.25,fib)-front)*blend;
  back+=((1-smooth(-1.25,-.65,fib))*.65-back)*blend;
  out.dep=dep;out.front=front;out.back=back;return out;
}
export function flutterFieldAt(p,phase=0,out={}){
  const x=p.x??p[0],y=p.y??p[1],z=p.z??p[2],la=smooth(-.32,.08,x);
  const raPath=Math.atan2(y+.06,x+.70)/(Math.PI*2)+z*.08;
  const laPath=.25+Math.hypot(x+.15,y-.35,z+.10)*.25;
  const path=raPath+(laPath-raPath)*la,d=wrapDistance(phase-path),r=wrapDistance(d-.44);
  out.dep=.35+.25*Math.cos(d*Math.PI*2);out.front=Math.exp(-((d/.095)**2));out.back=Math.exp(-((r/.14)**2))*.60;return out;
}
const gl=x=>Number(x).toFixed(6);
export const ARRHYTHMIA_FIELD_GLSL=`
vec3 ventricularArrhythmiaField(vec3 p,float phase,float qStart,float qEnd,float tStart,float tEnd,float clock,float mode,float disorder){
  float qWidth=clamp(qEnd-qStart,0.06,0.30);
  float angle=0.0;if(mode>1.5&&mode<2.5)angle=0.70*sin(clock*3.7)+0.55*sin(clock*1.9);
  float spatial=clamp(0.5+0.26*(p.x*cos(angle)+p.z*sin(angle))+0.18*p.y,0.0,1.0);
  float arrival=qStart+qWidth*0.78*spatial;
  float recovery=max(qEnd+0.035,tStart+(tEnd-tStart)*0.55)+qWidth*0.10*(spatial-0.5);
  float dep=smoothstep(arrival,arrival+0.016,phase)*(1.0-smoothstep(recovery-0.040,recovery+0.030,phase));
  float ad=(phase-arrival)/0.014,rd=(phase-recovery)/0.030;
  float front=exp(-ad*ad),back=exp(-rd*rd);
  float fib=sin(p.x*${gl(FIELD.vx)}+p.y*${gl(FIELD.vy)}+p.z*${gl(FIELD.vz)}-clock*${gl(FIELD.va)})+0.70*sin(p.x*${gl(FIELD.wx)}+p.y*${gl(FIELD.wy)}+p.z*${gl(FIELD.wz)}+clock*${gl(FIELD.wb)})+0.30*sin(p.x*${gl(FIELD.wx2)}+p.y*${gl(FIELD.wy2)}+p.z*${gl(FIELD.wz2)}-clock*${gl(FIELD.wc)});
  float blend=mode>2.5?1.0:mode>1.5?0.45*clamp(disorder,0.0,1.0):0.0;
  dep=mix(dep,0.30+0.20*sin(fib*2.0),blend);front=mix(front,smoothstep(0.65,1.25,fib),blend);back=mix(back,(1.0-smoothstep(-1.25,-0.65,fib))*0.65,blend);
  return vec3(dep,front,back);
}
vec3 atrialFlutterField(vec3 p,float phase){
  float la=smoothstep(-0.32,0.08,p.x);
  float raPath=atan(p.y+0.06,p.x+0.70)/6.28318530718+p.z*0.08;
  float laPath=0.25+length(p-vec3(-0.15,0.35,-0.10))*0.25;
  float path=mix(raPath,laPath,la),d=phase-path;d=d-floor(d+0.5);
  float r=d-0.44;r=r-floor(r+0.5);
  float fd=d/0.095,rd=r/0.14;
  return vec3(0.35+0.25*cos(d*6.28318530718),exp(-fd*fd),exp(-rd*rd)*0.60);
}`;
const arrhythmiaScratch={};
const srgbTable=Uint8Array.from({length:4096},(_,i)=>{const x=i/4095;return Math.round(255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055));});
const srgb=x=>srgbTable[Math.max(0,Math.min(4095,Math.round(x*4095)))];
const geometryCache=new WeakMap(),attributeCache=new WeakMap();
const recoveryScratch={},electricalReferenceScratch=new Float64Array(2),electricalBlockScratch=new Float64Array(2),electricalColorScratch=[0,0,0];
function packed(a){
  if(!a)return null;if(!a.isInterleavedBufferAttribute)return a.array;
  const version=a.data.version,old=attributeCache.get(a);if(old?.version===version)return old.values;
  const values=new Float32Array(a.count*a.itemSize);
  for(let i=0;i<a.count;i++){values[i*a.itemSize]=a.getX(i);if(a.itemSize>1)values[i*a.itemSize+1]=a.getY(i);if(a.itemSize>2)values[i*a.itemSize+2]=a.getZ(i);}
  attributeCache.set(a,{version,values});return values;
}
const version=a=>a?.isInterleavedBufferAttribute?a.data.version:a?.version;
function facesFor(g){
  const pa=g.attributes.position,na=g.attributes.normal;
  const old=geometryCache.get(g),pv=version(pa),nv=version(na);
  if(old?.pv===pv&&old?.nv===nv)return old.faces;
  const p=packed(pa),normals=packed(na),rest=packed(g.attributes.aRestPosition)||p;if(!p)return[];
  const idx=g.index?.array,count=idx?idx.length:p.length/3,out=[];
  for(let i=0;i<count;i+=3){
    const a=(idx?idx[i]:i)*3,b=(idx?idx[i+1]:i+1)*3,c=(idx?idx[i+2]:i+2)*3;
    const ax=p[a],ay=p[a+1],az=p[a+2],bx=p[b],by=p[b+1],bz=p[b+2],cx=p[c],cy=p[c+1],cz=p[c+2];
    const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
    let nx=normals?(normals[a]+normals[b]+normals[c]):uy*vz-uz*vy,ny=normals?(normals[a+1]+normals[b+1]+normals[c+1]):uz*vx-ux*vz,nz=normals?(normals[a+2]+normals[b+2]+normals[c+2]):ux*vy-uy*vx;
    const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
    out.push({a,b,c,nx,ny,nz,x:(rest[a]+rest[b]+rest[c])/3,y:(rest[a+1]+rest[b+1]+rest[c+1])/3,z:(rest[a+2]+rest[b+2]+rest[c+2])/3});
  }
  geometryCache.set(g,{pv,nv,faces:out});return out;
}
function projected(e,x,y,z,w,h){const q=e[3]*x+e[7]*y+e[11]*z+e[15];if(q<.01)return null;return[(e[0]*x+e[4]*y+e[8]*z+e[12])/q*w/2+w/2,-(e[1]*x+e[5]*y+e[9]*z+e[13])/q*h/2+h/2,(e[2]*x+e[6]*y+e[10]*z+e[14])/q];}
function mix(c,b,t){c[0]+=(b[0]-c[0])*t;c[1]+=(b[1]-c[1])*t;c[2]+=(b[2]-c[2])*t;}
function colorFor(mat,f,nm,attr,transmural,reference,blockReference){
  const c=[mat.color?.r??.5,mat.color?.g??.5,mat.color?.b??.5],u=mat.userData?.uniforms;
  if(u?.uPhase){
    const atrial=u.uAtrial.value,phase=atrial?(u.uAtrialPhase?.value??u.uPhase.value):u.uPhase.value,w=attr?(attr[f.a/3]+attr[f.b/3]+attr[f.c/3])/3:.5;
    const depth=transmural?(transmural[f.a/3]+transmural[f.b/3]+transmural[f.c/3])/3:0;
    if(reference){const a=f.a/3*2,b=f.b/3*2,d=f.c/3*2;electricalReferenceScratch[0]=(reference[a]+reference[b]+reference[d])/3;electricalReferenceScratch[1]=(reference[a+1]+reference[b+1]+reference[d+1])/3;}
    if(blockReference){const a=f.a/3*2,b=f.b/3*2,d=f.c/3*2;electricalBlockScratch[0]=(blockReference[a]+blockReference[b]+blockReference[d])/3;electricalBlockScratch[1]=(blockReference[a+1]+blockReference[b+1]+blockReference[d+1])/3;}
    const opts={qrsStart:u.uQStart.value,qrsEnd:u.uQEnd.value,tStart:u.uTStart.value,tEnd:u.uTEnd.value,
      pStart:u.uPStart.value,pEnd:u.uPEnd.value,lvWeight:w,transmuralDepth:depth,atrial:!!atrial,
      lvDelay:u.uLVDelay?.value||0,rvDelay:u.uRVDelay?.value||0,ectopic:u.uEctopic?.value||0,
      rr:u.uRR?.value||60/72,injuryTerritory:u.uInjuryTerritory?.value||0,injurySeverity:u.uInjurySeverity?.value??.70,
      reference:reference?electricalReferenceScratch:undefined,blockReference:blockReference?electricalBlockScratch:undefined};
    const field=electricalSampleAt(phase,f,opts,recoveryScratch);let qualitative=false;
    if(atrial&&u.uAtrialFibrillation?.value){
      const clock=u.uClock.value,fib=Math.sin(f.x*11+f.y*8+f.z*7-clock*39)+.65*Math.sin(-f.x*7+f.y*13+f.z*8+clock*51);
      field.normalized=.25+.20*Math.sin(fib*2.2);field.front=smooth(.95,1.45,fib);field.back=(1-smooth(-1.40,-.85,fib))*.45;qualitative=true;
    }
    if(atrial&&u.uAtrialFlutter?.value){
      const rhythm=flutterFieldAt(f,u.uFlutterPhase?.value||0,arrhythmiaScratch);field.normalized=rhythm.dep;field.front=rhythm.front;field.back=rhythm.back;qualitative=true;
    }
    if(!atrial&&(u.uVentricularMechanism?.value||0)>.5){
      const rhythm=ventricularArrhythmiaFieldAt(f,{phase,qStart:u.uQStart.value,qEnd:u.uQEnd.value,tStart:u.uTStart.value,tEnd:u.uTEnd.value,clock:u.uClock.value,mode:u.uVentricularMechanism.value,disorganization:u.uVentricularDisorganization?.value||0},arrhythmiaScratch);field.normalized=rhythm.dep;field.front=rhythm.front;field.back=rhythm.back;qualitative=true;
    }
    const unavailable=atrial?u.uAtrialAvailable?.value<.5&&!u.uAtrialFibrillation?.value&&!u.uAtrialFlutter?.value:
      (u.uVentricularAvailable?.value??1)<.5&&!(u.uVentricularMechanism?.value>0);
    if(unavailable){field.normalized=atrial?.037:0;field.front=0;field.back=0;}
    const view=u.uElectricalView?.value||0,a=u.uActivation.value;
    if((qualitative||unavailable)&&view>1.5)mix(c,[.13,.25,.29],a*.55);
    else{electricalDisplayColorAt(c,field,{...opts,phase,view,enabled:a},electricalColorScratch);for(let j=0;j<3;j++)c[j]=electricalColorScratch[j];}
    const injury=injuryWeightAt(f,u.uInjuryTerritory?.value||0,w)*(1-atrial),rim=Math.exp(-(((injury-.48)/.075)**2));
    mix(c,[.95,.35,.16],rim*.48*(u.uInjuryVisible?.value??1)*a);
    if(u.uCutFace?.value){const grain=.95+.05*Math.sin(f.x*145+f.y*63);c[0]*=grain;c[1]*=grain;c[2]*=grain;}
    if(u.uHighlight?.value>0){
      const mode=u.uHighlight.value;let mask=atrial?(mode===1?1:0):(mode===5?1:mode===4?smooth(-.48,-.02,f.y):0);
      if(attr&&!atrial){if(mode===2)mask=w;if(mode===3)mask=1-w;}
      if(mode<6){const dim=.52+.48*mask;c[0]*=dim;c[1]*=dim;c[2]*=dim;const col=u.uHighlightColor.value;mix(c,[col.r,col.g,col.b],mask*.78);}
    }
  }
  if(mat.isMeshBasicMaterial)return[srgb(c[0]),srgb(c[1]),srgb(c[2])];
  let nx=nm[0]*f.nx+nm[3]*f.ny+nm[6]*f.nz,ny=nm[1]*f.nx+nm[4]*f.ny+nm[7]*f.nz,nz=nm[2]*f.nx+nm[5]*f.ny+nm[8]*f.nz;
  const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
  const light=.35+Math.max(0,-nx*.4+ny*.6+nz*.68)*.82+Math.max(0,nx*.7+ny*.1+nz*.65)*.22;
  const spec=Math.pow(Math.max(0,-nx*.23+ny*.35+nz*.91),25)*.16,emissive=mat.emissiveIntensity||0,ec=mat.emissive;
  return[srgb(c[0]*light+spec+(ec?.r||0)*emissive),srgb(c[1]*light+spec+(ec?.g||0)*emissive),srgb(c[2]*light+spec+(ec?.b||0)*emissive)];
}

// Only the triangle fill stage is rasterized here. A per-pixel depth buffer
// resolves the real inner/outer wall surfaces correctly, while interpolated
// vertex colors remove the old flat triangle mosaic. Geometry and interactions
// are unchanged; translucent layers retain back-to-front alpha compositing.
function rasterTriangle(t,rgba,depth,width,height,ratio,writeDepth=false){
  const ax=t.a[0]*ratio,ay=t.a[1]*ratio,bx=t.b[0]*ratio,by=t.b[1]*ratio,cx=t.c[0]*ratio,cy=t.c[1]*ratio;
  const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<.00001)return;
  const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(width-1,Math.ceil(Math.max(ax,bx,cx)));
  const y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(height-1,Math.ceil(Math.max(ay,by,cy)));
  if(x0>x1||y0>y1)return;
  const dx0=(by-cy)/den,dy0=(cx-bx)/den,dx1=(cy-ay)/den,dy1=(ax-cx)/den;
  let row0=((by-cy)*(x0+.5-cx)+(cx-bx)*(y0+.5-cy))/den;
  let row1=((cy-ay)*(x0+.5-cx)+(ax-cx)*(y0+.5-cy))/den;
  const za=t.a[2],zb=t.b[2],zc=t.c[2],colors=t.colors,ai=t.ia*3,bi=t.ib*3,ci=t.ic*3;
  const ar=colors[ai],ag=colors[ai+1],ab=colors[ai+2],br=colors[bi],bg=colors[bi+1],bb=colors[bi+2],cr=colors[ci],cg=colors[ci+1],cb=colors[ci+2];
  const alpha=t.alpha,opaque=alpha>=.995;
  for(let y=y0;y<=y1;y++,row0+=dy0,row1+=dy1){
    let a=row0,b=row1,pi=y*width+x0;
    for(let x=x0;x<=x1;x++,pi++,a+=dx0,b+=dx1){
      const c=1-a-b;if(a<-.00001||b<-.00001||c<-.00001)continue;
      const z=za*a+zb*b+zc*c;if(!t.overlay&&z>depth[pi]+.0000001)continue;
      const r=ar*a+br*b+cr*c,g=ag*a+bg*b+cg*c,blue=ab*a+bb*b+cb*c,j=pi*4;
      if(opaque){rgba[j]=r;rgba[j+1]=g;rgba[j+2]=blue;rgba[j+3]=255;if(writeDepth)depth[pi]=z;}
      else{
        const destAlpha=rgba[j+3]/255,remain=destAlpha*(1-alpha),sum=alpha+remain;
        if(sum<=0)continue;
        rgba[j]=(r*alpha+rgba[j]*remain)/sum;rgba[j+1]=(g*alpha+rgba[j+1]*remain)/sum;rgba[j+2]=(blue*alpha+rgba[j+2]*remain)/sum;rgba[j+3]=sum*255;
      }
    }
  }
}

export class SoftwareRenderer{
  constructor(){this.isSoftwareRenderer=true;this.domElement=document.createElement('canvas');this.ctx=this.domElement.getContext('2d',{alpha:true});this.imageData=this.ctx.createImageData(1,1);this.depth=new Float32Array(1);this.ratio=1;this.width=1;this.height=1;this.lastDraw=-Infinity;this.disposed=false;this.matrix=new THREE.Matrix4();this.view=new THREE.Matrix4();this.normal=new THREE.Matrix3();}
  setPixelRatio(r){this.ratio=Math.min(r,1.35);}
  setSize(w,h){this.width=w;this.height=h;this.domElement.width=Math.round(w*this.ratio);this.domElement.height=Math.round(h*this.ratio);this.imageData=this.ctx.createImageData(this.domElement.width,this.domElement.height);this.depth=new Float32Array(this.domElement.width*this.domElement.height);this.lastDraw=-Infinity;}
  dispose(){this.disposed=true;}
  render(scene,camera){
    if(this.disposed)return;const now=performance.now();if(now-this.lastDraw<40)return;this.lastDraw=now;
    scene.updateMatrixWorld();camera.updateMatrixWorld();this.view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const tris=[],lines=[],sprites=[],w=this.width,h=this.height;
    scene.traverseVisible(o=>{
      if(o.isMesh){
        const mat=Array.isArray(o.material)?o.material[0]:o.material;if(!mat||mat.visible===false||mat.opacity===0)return;
        const p=packed(o.geometry.attributes.position);if(!p)return;
        this.matrix.multiplyMatrices(this.view,o.matrixWorld);const e=this.matrix.elements;this.normal.getNormalMatrix(o.matrixWorld);const nm=this.normal.elements;
        const faces=facesFor(o.geometry),vertices=new Array(p.length/3),attr=packed(o.geometry.attributes.aLVWeight||o.geometry.attributes.regionWeight);
        const normals=packed(o.geometry.attributes.normal),rest=packed(o.geometry.attributes.aRestPosition)||p,transmural=packed(o.geometry.attributes.aTransmuralDepth),reference=packed(o.geometry.attributes.aElectricalReference),blockReference=packed(o.geometry.attributes.aElectricalBlockActivation);
        const frontColors=new Float32Array(p.length),backColors=mat.side===THREE.DoubleSide?new Float32Array(p.length):frontColors;
        for(let i=0;i<p.length;i+=3){
          vertices[i/3]=projected(e,p[i],p[i+1],p[i+2],w,h);
          const f={a:i,b:i,c:i,x:rest[i],y:rest[i+1],z:rest[i+2],nx:normals?.[i]||0,ny:normals?.[i+1]||0,nz:normals?.[i+2]??1};
          frontColors.set(colorFor(mat,f,nm,attr,transmural,reference,blockReference),i);
          if(backColors!==frontColors){f.nx=-f.nx;f.ny=-f.ny;f.nz=-f.nz;backColors.set(colorFor(mat,f,nm,attr,transmural,reference,blockReference),i);}
        }
        for(const face of faces){
          const a=vertices[face.a/3],b=vertices[face.b/3],c=vertices[face.c/3];if(!a||!b||!c)continue;
          if((a[0]<-100&&b[0]<-100&&c[0]<-100)||(a[0]>w+100&&b[0]>w+100&&c[0]>w+100)||(a[1]<-100&&b[1]<-100&&c[1]<-100)||(a[1]>h+100&&b[1]>h+100&&c[1]>h+100))continue;
          const area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(mat.side===THREE.FrontSide&&area>=0)continue;
          tris.push({a,b,c,ia:face.a/3,ib:face.b/3,ic:face.c/3,colors:area>0?backColors:frontColors,z:(a[2]+b[2]+c[2])/3,alpha:mat.transparent?mat.opacity:1,overlay:mat.depthTest===false,order:o.renderOrder||0,wireframe:mat.wireframe});
        }
      }else if(o.isLine){
        const p=packed(o.geometry.attributes.position);if(!p)return;this.matrix.multiplyMatrices(this.view,o.matrixWorld);const e=[...this.matrix.elements],pts=[];
        for(let i=0;i<p.length;i+=3)pts.push(projected(e,p[i],p[i+1],p[i+2],w,h));
        lines.push({points:pts,color:'#'+o.material.color.getHexString(),alpha:o.material.opacity??1,segments:o.isLineSegments,dashed:o.material.isLineDashedMaterial});
      }else if(o.isSprite&&o.material.map?.image){
        const pos=o.getWorldPosition(new THREE.Vector3()),p=pos.clone().project(camera);if(p.z>1)return;
        const dist=pos.distanceTo(camera.position),scale=o.getWorldScale(new THREE.Vector3()),factor=h/(2*Math.tan(camera.fov*Math.PI/360)*dist);
        sprites.push({image:o.material.map.image,x:(p.x*.5+.5)*w,y:(-.5*p.y+.5)*h,w:scale.x*factor,h:scale.y*factor,alpha:o.material.opacity??1});
      }
    });
    tris.sort((a,b)=>(Number(a.overlay)-Number(b.overlay))||(a.overlay?a.order-b.order:0)||b.z-a.z);
    const ctx=this.ctx,rgba=this.imageData.data,width=this.domElement.width,height=this.domElement.height;
    rgba.fill(0);this.depth.fill(Infinity);
    // Front-to-back opaque filling allows early depth rejection of inner walls.
    for(let i=tris.length-1;i>=0;i--){const t=tris[i];if(!t.wireframe&&!t.overlay&&t.alpha>=.995)rasterTriangle(t,rgba,this.depth,width,height,this.ratio,true);}
    for(const t of tris)if(!t.wireframe&&!t.overlay&&t.alpha<.995)rasterTriangle(t,rgba,this.depth,width,height,this.ratio,false);
    for(const t of tris)if(!t.wireframe&&t.overlay)rasterTriangle(t,rgba,this.depth,width,height,this.ratio,false);
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.putImageData(this.imageData,0,0);
    ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.lineJoin='round';
    for(const t of tris){if(!t.wireframe)continue;
      const c=t.colors,j=t.ia*3;ctx.globalAlpha=t.alpha;ctx.strokeStyle=`rgb(${c[j]},${c[j+1]},${c[j+2]})`;
      ctx.beginPath();ctx.moveTo(t.a[0],t.a[1]);ctx.lineTo(t.b[0],t.b[1]);ctx.lineTo(t.c[0],t.c[1]);ctx.closePath();ctx.lineWidth=1;ctx.stroke();
    }
    for(const l of lines){
      ctx.globalAlpha=l.alpha;ctx.strokeStyle=l.color;ctx.lineWidth=1.35;ctx.setLineDash(l.dashed?[4,3]:[]);ctx.beginPath();let next=true;
      for(let i=0;i<l.points.length;i++){const p=l.points[i];if(!p){next=true;continue;}if(next||l.segments&&i%2===0){ctx.moveTo(p[0],p[1]);next=false;}else ctx.lineTo(p[0],p[1]);}ctx.stroke();
    }
    ctx.setLineDash([]);
    for(const s of sprites){ctx.globalAlpha=s.alpha;ctx.drawImage(s.image,s.x-s.w/2,s.y-s.h/2,s.w,s.h);}ctx.globalAlpha=1;
  }
}

/**
 * Kinematic cardiac mechanics on the actual BodyParts3D surfaces.
 *
 * This is a literature-informed teaching deformation, not a patient-specific
 * electromechanical simulation and not motion recovered from a surface ECG.
 * Long-axis shortening, AV-plane descent, endocardial inward displacement,
 * transmural thickening and counter-rotation are separate modes. Distal great
 * vessels are spatially anchored; compliant roots and radial arterial pulsation
 * preserve their connection without pulling the entire vascular tree downward.
 *
 * Primary sources:
 * 3D systolic strain patterns, Radiology 2000, PMID 10671594 (31 healthy volunteers).
 * Quantitative tagged MRI of the normal human LV, PMID 11153703 / PMCID PMC2396311.
 * Lorenz et al., JCMR 2000, PMID 11545133; doi:10.3109/10976640009148678.
 * Whole-heart electromechanical activation study, PMID 39729494 / PMCID PMC11676786.
 * Seemann et al., BMC Med Imaging 2017;17:19, doi:10.1186/s12880-017-0189-5.
 * Reference cine: UMN Visible Heart Lab, cardiac-mri-tutorial/functional-assessment.shtml.
 */
import {getFiducials} from './ecg.js';
import {BufferAttribute} from 'three';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const q=clamp((x-a)/(b-a));return q*q*(3-2*q);};
// The LV axis follows the principal long axis of the registered cavity, rather
// than the screen's vertical axis. Units are 50 mm in the source anatomy.
const AXIS=[-.6236,.5788,-.5255];
const al=Math.hypot(...AXIS);for(let i=0;i<3;i++)AXIS[i]/=al;
const APEX=[.99,-1.13,.73],LENGTH=1.82;
const RV_AXIS=[-.20,.9747,-.10],RV_APEX=[.50,-1.30,.75];
const AORTA_PATH=[[-.05,-.21,.20],[-.18,.25,.20],[-.33,.73,.24],[-.15,1.18,-.10],[-.12,1.13,-.65],[-.10,.88,-1.10]];
const PULMONARY_PATH=[[.25,.23,.65],[.06,.55,.43],[.06,.88,.24]];
const SVC_PATH=[[-.735,.50,.045],[-.735,1.33,.045]],IVC_PATH=[[-.735,-1.05,.035],[-.735,-1.95,.035]];

export const MOTION_MODEL={
  description:'Reference anatomy with cine-informed ventricular shortening, inward endocardial motion, wall thickening, twist and separate atrial contraction. The apex moves slightly, the valve plane descends, and vessel roots flex beneath nearly stationary great-vessel trunks. One continuous spatial field keeps chambers, coronaries and registered junctions connected. This is an illustrative kinematic model, not patient-specific motion or an estimate of ejection fraction.',
  longitudinalShortening:.15,
  epicardialCircumferentialShortening:.06,
  endocardialCircumferentialShortening:.38,
  baseToApexTwistDegrees:11,
  sources:[
    {title:'Three-dimensional systolic strain patterns in the normal human left ventricle',url:'https://pubmed.ncbi.nlm.nih.gov/10671594/'},
    {title:'Quantitative tagged magnetic resonance imaging of the normal human left ventricle',url:'https://pubmed.ncbi.nlm.nih.gov/11153703/'},
    {title:'Delineation of normal human left ventricular twist throughout systole',url:'https://pubmed.ncbi.nlm.nih.gov/11545133/'},
    {title:'Whole-heart electromechanical activation and cardiac strain',url:'https://pubmed.ncbi.nlm.nih.gov/39729494/'},
    {title:'AV-plane displacement with two-, three- and four-chamber cine videos',url:'https://link.springer.com/article/10.1186/s12880-017-0189-5'},
    {title:'Normal human short-axis cine MRI · University of Minnesota Visible Heart Lab',url:'https://www.vhlab.umn.edu/atlas/cardiac-mri-tutorial/functional-assessment.shtml'}
  ]
};

// Activation is followed by contraction, then a short end-systolic plateau and
// relaxation. Thus a large QRS is not mistaken for the instant of peak squeeze.
export function contractionEnvelope(t,onset,peak,hold,end){
  if(t<=onset||t>=end)return 0;
  if(t<peak)return smooth(onset,peak,t);
  if(t<hold)return 1;
  return 1-smooth(hold,end,t);
}

export function normalMotionState(time,bpm=72){
  const f=getFiducials(bpm),p=((time%f.rr)+f.rr)%f.rr;
  const systole=f.tEnd-f.qrsStart;
  const ventricular=t=>contractionEnvelope(t,f.qrsStart+.028,f.qrsStart+systole*.64,f.qrsStart+systole*.84,Math.min(f.rr-.015,f.tEnd+.09));
  const a=contractionEnvelope(p,f.pStart+.035,f.pEnd+.025,f.qrsStart-.012,f.qrsStart+.060);
  const la=contractionEnvelope(p,f.pStart+.060,f.pEnd+.037,f.qrsStart+.003,f.qrsStart+.075);
  return {
    condition:'normal',relativeTime:p-f.qrsStart,recordTime:time,rr:f.rr,
    organizedAtria:true,atrialFibrillation:false,ectopic:false,lvDelay:0,rvDelay:.008,
    timing:{pStart:f.pStart-f.qrsStart,pEnd:f.pEnd-f.qrsStart,qrsStart:0,qrsEnd:f.qrsEnd-f.qrsStart,tStart:f.tStart-f.qrsStart,tEnd:f.tEnd-f.qrsStart},
    mechanics:{atria:a,ra:a,la,lv:ventricular(p),rv:ventricular(p-.008)},
    activation:{ra:clamp((p-f.pStart)/.065),la:clamp((p-f.pStart-.025)/.075),septum:clamp((p-f.qrsStart)/.025),lv:clamp((p-f.qrsStart-.010)/.075),rv:clamp((p-f.qrsStart-.020)/.070)}
  };
}

function ventWeight(x,y,z){
  // Smooth spatial chamber coupling for mechanics. The electrical overlay
  // keeps the source-cavity proximity masks; mechanical displacement blends
  // across a broader septal zone so delayed chambers remain a continuous wall.
  const dl=(x-.40)**2+(z-.10)**2,dr=(x+.22)**2+(z-.68)**2;
  return clamp(.5+(dr-dl)*1.25);
}

/** Capture immutable positions once. Never repeatedly deform an already-deformed mesh. */
export function prepareCardiacGeometry(mesh){
  const g=mesh.geometry,p=g.getAttribute('position');
  if(!p)return null;
  const count=p.count,rest=new Float32Array(count*3),normal=new Float32Array(count*3),n=g.getAttribute('normal');
  for(let i=0;i<count;i++){rest[i*3]=p.getX(i);rest[i*3+1]=p.getY(i);rest[i*3+2]=p.getZ(i);if(n){normal[i*3]=n.getX(i);normal[i*3+1]=n.getY(i);normal[i*3+2]=n.getZ(i);}}
  // GLTF source positions can be interleaved with normals. Convert once to
  // separate attributes before mutating; treating an interleaved array as xyz
  // would overwrite normals and corrupt the anatomical surface.
  g.setAttribute('position',new BufferAttribute(rest.slice(),3));
  g.setAttribute('normal',new BufferAttribute(normal.slice(),3));
  const coords=new Float32Array(count*5),masks=new Float32Array(count*3),vessels=new Float32Array(count*9);
  const name=mesh.name,atrial=name.includes('atrium'),right=name==='right-atrium',vessel=!atrial&&!name.includes('ventric')&&!name.includes('coronary');
  const cavity=name==='left-ventricle'||name==='right-ventricle';
  for(let i=0;i<count;i++){
    const j=i*3,k=i*5,x=rest[j],y=rest[j+1],z=rest[j+2],dx=x-APEX[0],dy=y-APEX[1],dz=z-APEX[2],s=dx*AXIS[0]+dy*AXIS[1]+dz*AXIS[2];
    const rx=dx-s*AXIS[0],ry=dy-s*AXIS[1],rz=dz-s*AXIS[2],r=Math.hypot(rx,ry,rz);
    coords[k]=s;coords[k+1]=rx;coords[k+2]=ry;coords[k+3]=rz;
    coords[k+4]=r;
    spatialMasks(x,y,z,masks,i*3);
    vesselCoordinates(x,y,z,vessels,i*9);
  }
  const lv=new Float32Array(count);
  for(let i=0;i<count;i++)lv[i]=ventWeight(rest[i*3],rest[i*3+1],rest[i*3+2]);
  g.userData.dynamicCardiac=true;
  return {mesh,geometry:g,rest,normal,coords,lv,masks,vessels,count,atrial,right,vessel,cavity,name};
}

/**
 * One field for the entire registered heart, including all vessel junctions.
 * There is deliberately no branch on mesh name: two surfaces at the same
 * position get exactly the same displacement. Soft atrial regions add their
 * active squeeze to a shared annular displacement. Vessel constraints are
 * spatial masks, never mesh-name branches: coincident surfaces stay coincident.
 */
function spatialMasks(x,y,z,out,offset=0){
  const cava=1-smooth(.30,.54,Math.hypot(x+.735,(z-.04)*1.07));
  const distalCaval=cava*Math.max(smooth(.14,.58,y),1-smooth(-1.12,-.62,y));
  const anchor=(1-smooth(.06,.64,y))*(1-distalCaval);
  const ra=Math.exp(-(((x+.73)/.62)**2+((y+.22)/1.0)**4+((z-.18)/.65)**2));
  const la=Math.exp(-(((x-.02)/.65)**2+((y-.03)/.61)**2+((z+.34)/.52)**2));
  const total=Math.max(1,ra+la);
  out[offset]=anchor;out[offset+1]=ra/total;out[offset+2]=la/total;
}

// Smoothly blended centerline radial vectors change vessel caliber without bulk
// translation. Blending is essential at arch bends: a hard nearest-segment switch
// would introduce a tiny discontinuity. Coefficients are cached for mesh vertices.
function tubeRadial(x,y,z,path,radius,out,offset){
  let total=0,bx=0,by=0,bz=0;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],vx=b[0]-a[0],vy=b[1]-a[1],vz=b[2]-a[2],length2=vx*vx+vy*vy+vz*vz;
    const t=clamp(((x-a[0])*vx+(y-a[1])*vy+(z-a[2])*vz)/length2);
    const dx=x-a[0]-t*vx,dy=y-a[1]-t*vy,dz=z-a[2]-t*vz,dist2=dx*dx+dy*dy+dz*dz;
    const weight=Math.exp(-dist2/(radius*radius*.70)),axial=(dx*vx+dy*vy+dz*vz)/length2;
    total+=weight;bx+=(dx-axial*vx)*weight;by+=(dy-axial*vy)*weight;bz+=(dz-axial*vz)*weight;
  }
  const mask=(1-Math.exp(-total*4))/Math.max(total,1e-20);
  out[offset]=bx*mask;out[offset+1]=by*mask;out[offset+2]=bz*mask;
}
function vesselCoordinates(x,y,z,out,offset=0){
  tubeRadial(x,y,z,AORTA_PATH,.26,out,offset);
  tubeRadial(x,y,z,PULMONARY_PATH,.27,out,offset+3);
  tubeRadial(x,y,z,y>=-.40?SVC_PATH:IVC_PATH,.26,out,offset+6);
}
function motionParameters(state,{enabled=true,gain=1}={}){
  const m=state.mechanics||{},g=enabled?gain:0;
  return {lv:clamp(m.lv||0)*g,rv:clamp(m.rv||0)*g,ra:clamp(m.ra??m.atria??0)*g,la:clamp(m.la??m.atria??0)*g,
    reservoir:clamp(m.atrialReservoir??((m.lv||0)+(m.rv||0))/2)*g,
    af:enabled&&state.atrialFibrillation,vf:enabled&&state.rhythmKind==='vf'&&!!state.suppressNormalVentricularConduction,clock:state.recordTime??state.relativeTime??0,
    flash:enabled&&state.condition==='lbbb'&&state.relativeTime>=0&&state.relativeTime<.12?Math.sin(Math.PI*state.relativeTime/.12)*.018:0};
}
function field(x,y,z,s,rx,ry,rz,r,w,anchor,raMask,laMask,vessels,vi,m,out,j=0){
  const c=m.lv*w+m.rv*(1-w),u=clamp(s/LENGTH),atrialMask=Math.min(1,raMask+laMask),ventricular=1-.87*atrialMask;
  // An approximate thick-walled LV shell. The inner boundary shortens much
  // more than the epicardium. For the shell, r'^2 = ri'^2 + (r^2-ri^2)/lambdaZ
  // preserves annular material area times axial length before regional blending.
  // This is a smooth kinematic approximation, not finite-element tissue physics.
  const ri=.48*Math.sqrt(Math.max(.035,1-((s-.92)/.93)**2));
  const lv=m.lv*ventricular,lambdaZ=Math.max(.60,1-.15*lv),endo=Math.max(.40,1-.38*lv);
  const shellMix=smooth(ri,ri+.10,r);
  const newR=Math.sqrt(r*r*endo*endo+Math.max(0,r*r-ri*ri)*(1/lambdaZ-endo*endo)*shellMix);
  const radial=1+(newR/Math.max(r,.00001)-1)*(1-smooth(ri+.35,ri+.85,r));
  const twist=(.115-.195*u)*Math.pow(Math.max(0,lv),.9);
  const cos=Math.cos(twist),sin=Math.sin(twist);
  const crossX=AXIS[1]*rz-AXIS[2]*ry,crossY=AXIS[2]*rx-AXIS[0]*rz,crossZ=AXIS[0]*ry-AXIS[1]*rx;
  // Small apexward-to-base translation of the apical tip, with substantially
  // larger annular descent. Thus the apex approaches the base slightly while
  // the AV plane also moves toward the apex, as seen in long-axis cine MRI.
  const ds=lv*(.035*(1-u)*(1-u)-.15*Math.max(0,s));
  const lvX=AXIS[0]*ds+(rx*cos+crossX*sin)*radial-rx;
  const lvY=AXIS[1]*ds+(ry*cos+crossY*sin)*radial-ry;
  const lvZ=AXIS[2]*ds+(rz*cos+crossZ*sin)*radial-rz;
  // RV contraction combines longitudinal shortening and inward bellows motion
  // of its anterior/free wall, rather than scaling the crescent as a second LV.
  const rvS=(x-RV_APEX[0])*RV_AXIS[0]+(y-RV_APEX[1])*RV_AXIS[1]+(z-RV_APEX[2])*RV_AXIS[2];
  const rv=m.rv*ventricular,rvU=clamp(rvS/1.65),rvDs=rv*(.025*(1-rvU)*(1-rvU)-.18*Math.max(0,rvS));
  const rvX=RV_AXIS[0]*rvDs+rv*(.09*(.12-x)-.065*(1-smooth(-.85,-.65,x)));
  const rvY=RV_AXIS[1]*rvDs;
  const rvZ=RV_AXIS[2]*rvDs+rv*(-.27*(z-.33)+.32*smooth(1.08,1.30,z));
  let dx=(w*lvX+(1-w)*rvX)*anchor;
  let dy=(w*lvY+(1-w)*rvY)*anchor;
  let dz=(w*lvZ+(1-w)*rvZ)*anchor;
  const raR=(-.13*m.ra+.19*m.reservoir)*raMask,laR=(-.13*m.la+.065*m.reservoir)*laMask;
  dx+=((x+.73)*raR+(x-.02)*laR)*anchor;
  dy+=((y+.02)*(-.15*m.ra)*raMask+(y-.03)*(-.15*m.la)*laMask-.065*c*atrialMask*(1-smooth(-.05,.50,y)))*anchor;
  dz+=((z-.18)*raR+(z+.34)*laR)*anchor;
  const aorticPulse=.023*m.lv,pulmonaryPulse=.022*m.rv,cavalPulse=.009*(m.reservoir-.55*m.ra);
  dx+=vessels[vi]*aorticPulse+vessels[vi+3]*pulmonaryPulse+vessels[vi+6]*cavalPulse;
  dy+=vessels[vi+1]*aorticPulse+vessels[vi+4]*pulmonaryPulse+vessels[vi+7]*cavalPulse;
  dz+=vessels[vi+2]*aorticPulse+vessels[vi+5]*pulmonaryPulse+vessels[vi+8]*cavalPulse;
  if(m.af){
    const quiver=.008*(Math.sin(m.clock*43+x*11+z*9)+.55*Math.sin(m.clock*61+y*13))*atrialMask*anchor;
    dx+=quiver*(x+.25);dy+=quiver*.25;dz+=quiver*(z+.10);
  }
  if(m.vf){
    // Small local quivering with no imposed whole-ventricle pump cycle. The
    // source ECG does not supply motion amplitude, blood flow or stroke volume.
    const quiver=.004*(Math.sin(m.clock*33+x*4+y*3)+.60*Math.sin(m.clock*41-y*5+z*4))*(1-atrialMask)*anchor;
    dx+=quiver*(x-.1);dy+=quiver*.35;dz+=quiver*(z-.15);
  }
  const flash=m.flash*4*w*(1-w)*anchor*(1-atrialMask);
  out[j]=x+dx-flash;out[j+1]=y+dy;out[j+2]=z+dz+flash*.3;
  return out;
}

/** Pure point form used for attachment validation and registered overlays. */
export function deformCardiacPoint(point,state,options={},out=[0,0,0]){
  const [x,y,z]=point,dx=x-APEX[0],dy=y-APEX[1],dz=z-APEX[2],s=dx*AXIS[0]+dy*AXIS[1]+dz*AXIS[2];
  const rx=dx-s*AXIS[0],ry=dy-s*AXIS[1],rz=dz-s*AXIS[2],r=Math.hypot(rx,ry,rz),masks=[0,0,0];spatialMasks(x,y,z,masks);
  const vessels=new Float64Array(9);vesselCoordinates(x,y,z,vessels);
  return field(x,y,z,s,rx,ry,rz,r,ventWeight(x,y,z),...masks,vessels,0,motionParameters(state,options),out);
}

/** Actual mesh vertices all sample the same position-only deformation field. */
export function deformCardiacGeometry(data,state,options={}){
  if(!data)return;
  const {mesh,geometry:g,rest,coords,lv,masks,vessels,count}=data,out=g.getAttribute('position').array,m=motionParameters(state,options);
  for(let i=0;i<count;i++){
    const j=i*3,k=i*5;
    field(rest[j],rest[j+1],rest[j+2],coords[k],coords[k+1],coords[k+2],coords[k+3],coords[k+4],lv[i],masks[j],masks[j+1],masks[j+2],vessels,i*9,m,out,j);
  }
  g.getAttribute('position').needsUpdate=true;g.computeVertexNormals();mesh.frustumCulled=false;
}

/**
 * Bind modeled collar end rings to their exact source triangles. The shared
 * spatial field handles the bulk motion; these barycentric attachment constraints
 * remove even the tiny interpolation mismatch at separately tessellated seams.
 * Sparse openings in the source section are bridged between adjacent anchors.
 */
export function bindCardiacJunctions(meshes,definition){
  const constraints=[];
  for(const [name,spec]of Object.entries(definition?.attachments||{})){
    const target=meshes[name],a=meshes[spec.from],b=meshes[spec.to];
    if(!target||!a||!b)throw new Error('Missing registered cardiac attachment: '+name);
    constraints.push({name,target,a,b,n:spec.radialSamples,rows:spec.rows,anchorsA:spec.anchorsA,anchorsB:spec.anchorsB});
  }
  return constraints;
}
export function enforceCardiacJunctions(constraints){
  for(const joint of constraints){
    const target=joint.target.geometry.getAttribute('position');
    for(const [source,anchors,offset]of [[joint.a,joint.anchorsA,0],[joint.b,joint.anchorsB,(joint.rows-1)*joint.n]]){
      const p=source.geometry.getAttribute('position');
      for(let i=0;i<anchors.length;i++){
        const a=anchors[i];if(a.interpolatedAcrossSourceOpening)continue;
        let x=0,y=0,z=0;
        for(let k=0;k<a.vertices.length;k++){const index=a.vertices[k],w=a.weights[k];x+=p.getX(index)*w;y+=p.getY(index)*w;z+=p.getZ(index)*w;}
        target.setXYZ(offset+i,x,y,z);
      }
      for(let i=0;i<anchors.length;i++){
        const a=anchors[i];if(!a.interpolatedAcrossSourceOpening)continue;
        const left=offset+a.neighbors[0],right=offset+a.neighbors[1],t=a.fraction;
        target.setXYZ(offset+i,target.getX(left)*(1-t)+target.getX(right)*t,target.getY(left)*(1-t)+target.getY(right)*t,target.getZ(left)*(1-t)+target.getZ(right)*t);
      }
    }
    target.needsUpdate=true;joint.target.geometry.computeVertexNormals();
  }
}

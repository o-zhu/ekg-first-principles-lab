import * as THREE from 'three';
import {prepareCardiacGeometry,deformCardiacGeometry,deformCardiacPoint} from './cardiac-motion.js';
import {CONDUCTION_TIMING as C,CONDUCTION_TIMING_SOURCES,atrialConductionScale} from './conduction-timing.js';
import {electricalReferenceAt,electricalTimingAt,electricalSceneState} from './electrical-field.js';
import {conductionCouplingData,coupledTransmuralDepth,coupledLVWeight} from './conduction-coupling.js';

export const CONDUCTION_MODEL={
  description:'The His bundle divides along the endocardial septum. Early septal branches and apical distribution fans supply explicit junctions on the visible inner ventricular wall. Every daughter pulse starts at its parent’s geometric and temporal junction. The same delivery times seed working-muscle first arrivals along anatomical surface edges, followed by outward wall activation. Proximal insulated fibers may pass resting muscle before delivering an impulse at a junction. In bundle block, the interrupted tree remains quiet and muscle is recruited through declared septal transfers from the intact chamber, followed by slower tissue spread. Recovery follows local action potentials rather than a returning conduction-tree pulse. Atrial guides follow working-muscle surface paths and an assumed Bachmann bridge; they are not insulated nerves. This is a shared teaching graph on reference anatomy, not a segmented patient conduction system or the separate native CT fitted source model.',
  cutaway:'Anterior myocardial tissue is geometrically sectioned from the source anatomy. The exposed cut faces retain the original cavity openings, ventricular septum and wall thickness; the remaining inner and outer surfaces deform together. The ventricular and atrial section depths differ to expose both levels.',
  timingSources:CONDUCTION_TIMING_SOURCES,
  source:{title:'Stephenson et al. · High resolution 3-Dimensional imaging of the human cardiac conduction system from microanatomy to mathematical modeling (2017)',url:'https://www.nature.com/articles/s41598-017-07694-8',doi:'10.1038/s41598-017-07694-8'}
};
const V=p=>new THREE.Vector3(...p),clamp=x=>Math.max(0,Math.min(1,x));
class RegisteredPolylineCurve extends THREE.Curve{
  constructor(points){super();this.points=points.map(V);this.arcLengthDivisions=Math.max(200,points.length*5);}
  getPoint(t,target=new THREE.Vector3()){const u=clamp(t)*(this.points.length-1),i=Math.min(this.points.length-2,Math.floor(u));return target.copy(this.points[i]).lerp(this.points[i+1],u-i);}
}

// Interpolate the actual scheduled arrival at a geometric branch fraction.
// Keeping this separate from the visual pulse position makes junction timing
// auditable, including the mapped atrial probe's nonuniform guide timing.
export function conductionTimeAtFraction(schedule,fraction){
  const knots=schedule.knots||[[0,schedule.start],[1,schedule.end]],u=clamp(fraction);
  for(let i=1;i<knots.length;i++)if(u<=knots[i][0]){
    const [a,ta]=knots[i-1],[b,tb]=knots[i];return ta+(tb-ta)*(u-a)/(b-a);
  }
  return schedule.end;
}
function conductionFractionAtTime(schedule,time){
  const knots=schedule.knots||[[0,schedule.start],[1,schedule.end]];
  for(let i=1;i<knots.length;i++)if(time<=knots[i][1]){
    const [a,ta]=knots[i-1],[b,tb]=knots[i];return a+(b-a)*(time-ta)/(tb-ta);
  }
  return 1+(time-schedule.end)/Math.max(C.guideMinimumTravel,schedule.end-schedule.start);
}

// Register the schematic fibers to the actual source endocardial surface.
// Cavity meshes are boundary surfaces, never rendered as solid blood volumes.
export function cavityProjector(geometry){
  const p=geometry.attributes.position,i=geometry.index,triangles=[];
  for(let k=0;k<(i?.count||p.count);k+=3){const a=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i?i.getX(k+j):k+j));triangles.push(new THREE.Triangle(...a));}
  const temp=new THREE.Vector3(),ray=new THREE.Ray(),hit=new THREE.Vector3();
  return {
    nearest(point,offset=.014){const q=V(point),out=q.clone();let best=Infinity;for(const t of triangles){t.closestPointToPoint(q,temp);const d=temp.distanceToSquared(q);if(d<best){best=d;out.copy(temp);}}out.z+=offset;return out.toArray();},
    posterior(x,y,fallback=.15){ray.origin.set(x,y,-3);ray.direction.set(0,0,1);let z=Infinity;for(const t of triangles)if(ray.intersectTriangle(t.a,t.b,t.c,false,hit)&&hit.z<z)z=hit.z;return Number.isFinite(z)?[x,y,z+.018]:this.nearest([x,y,fallback]);}
  };
}

// Distance to source cavity surfaces separates endocardial activation from the
// later outward wave through myocardial thickness. This is an educational
// transmural timing coordinate, not a measured fiber or activation map.
export function addTransmuralDepth(geometry,cavities){
  const p=geometry.attributes.position,values=new Float32Array(p.count),cell=.20,buckets=new Map();
  if(conductionCouplingData()){
    const weights=geometry.attributes.aLVWeight;
    for(let i=0;i<p.count;i++){const point=[p.getX(i),p.getY(i),p.getZ(i)],lv=weights?weights.getX(i):coupledLVWeight(point);values[i]=coupledTransmuralDepth(point,lv);}
    geometry.setAttribute('aTransmuralDepth',new THREE.BufferAttribute(values,1));return;
  }
  for(const g of cavities){const a=g.attributes.position;for(let i=0;i<a.count;i++){const q=[a.getX(i),a.getY(i),a.getZ(i)],k=q.map(x=>Math.floor(x/cell)).join(',');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(q);}}
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),bx=Math.floor(x/cell),by=Math.floor(y/cell),bz=Math.floor(z/cell);let best=.24*.24;
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++){const bucket=buckets.get([bx+dx,by+dy,bz+dz].join(','));if(bucket)for(const q of bucket){const d=(x-q[0])**2+(y-q[1])**2+(z-q[2])**2;if(d<best)best=d;}}
    values[i]=clamp(Math.sqrt(best)/.19);
  }
  geometry.setAttribute('aTransmuralDepth',new THREE.BufferAttribute(values,1));
}

export function makeConductionSystem(meshes,{software=false,coupling=true}={}){
  const coupled=coupling?conductionCouplingData():null;
  const root=new THREE.Group();root.name='registered-cardiac-conduction';
  const left=cavityProjector(meshes['left-ventricle'].geometry),right=cavityProjector(meshes['right-ventricle'].geometry);
  const nodes=coupled?.nodes||{sa:[-.80,.53,.13],av:[-.35,-.17,.03],his:[-.17,-.29,.15],
    lv:left.nearest([.30,-.72,.17]),rv:right.nearest([-.11,-.71,.46]),ectopic:right.posterior(-.44,-.91,.45)};
  const paths=[],nodeMeshes={},motions=[],labels=[];
  function path(id,points,{start='left',offset=0,span=.020,radius=.011,fine=false,side=null,role='specialized',parentId=null,parentFraction=1}={}){
    const definition=coupled?.pathById.get(id);
    if(definition){points=definition.points.map(p=>[...p]);side=definition.side;role=definition.role;parentId=definition.parentId;parentFraction=definition.parentFraction;fine=definition.fine??fine;}
    const parent=paths.find(p=>p.id===parentId);if(parent)points[0]=parent.curve.getPoint(parentFraction).toArray();
    const curve=definition?.polyline?new RegisteredPolylineCurve(points):new THREE.CatmullRomCurve3(points.map(V),false,'centripetal');
    const segments=definition?.polyline?Math.max(software?22:44,Math.min(software?96:192,points.length*(software?1:2))):software?(fine?12:22):(fine?24:44);
    const geometry=new THREE.TubeGeometry(curve,segments,radius,software?4:6,false);
    const material=new THREE.MeshStandardMaterial({color:fine?'#298572':'#156d60',roughness:.55,emissive:'#083c32',emissiveIntensity:.16,transparent:true,opacity:fine?.68:.88,depthTest:false,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='ventricular-conduction-'+id;mesh.renderOrder=10;root.add(mesh);
    const pulse=new THREE.Mesh(new THREE.SphereGeometry(fine?.027:.043,software?8:12,software?6:8),new THREE.MeshBasicMaterial({color:'#fff9c9',depthTest:false,depthWrite:false}));pulse.renderOrder=13;pulse.visible=false;root.add(pulse);
    const motion=prepareCardiacGeometry(mesh),deliveryPoint=curve.getPoint(1).toArray();
    const deliveryReference=electricalReferenceAt(deliveryPoint,{lvWeight:side==='left'?1:0,transmuralDepth:0,atrial:role==='atrial',atrium:id==='left-atrium'||id==='bachmann'?'left':'right'});
    motions.push(motion);paths.push({id,curve,mesh,pulse,start,offset,span,fine,side,role,motion,deliveryPoint,deliveryReference,parentId,parentFraction,definition});
  }
  // Atrial routes are working-myocardial activation guides, not anatomical wires.
  path('atrial-to-av',[nodes.sa,[-.85,.22,.09],[-.69,-.02,.03],nodes.av],{start:'atrial',span:C.atrialToAVDuration,radius:.010,role:'atrial'});
  path('bachmann',[nodes.sa,[-.49,.42,-.02],[-.12,.36,-.11],[.28,.22,-.16]],{start:'atrial',span:.090,radius:.010,role:'atrial'});
  path('left-atrium',[[-.12,.36,-.11],[.20,.10,-.26],[.22,-.18,-.34]],{start:'atrial',offset:.050,span:.048,radius:.007,fine:true,role:'atrial',parentId:'bachmann',parentFraction:2/3});
  path('his',[nodes.av,[-.27,-.23,.08],nodes.his],{start:'his',span:C.hisPathSpan,radius:.016});

  // Branches run down the septal endocardium before turning into the apical fan.
  const lApex=left.posterior(.64,-1.125,.40),rApex=right.posterior(-.05,-1.13,.42);
  const lSept=[nodes.his,left.nearest([-.04,-.43,.18]),left.nearest([.24,-.72,.20]),left.nearest([.45,-.98,.30]),lApex];
  const rSept=[nodes.his,right.nearest([-.12,-.43,.34]),right.nearest([-.12,-.76,.38]),right.nearest([-.04,-1.01,.42]),rApex];
  path('left-bundle',lSept,{start:'left',span:C.leftBundleSpan,radius:.015,side:'left',parentId:'his'});
  path('right-bundle',rSept,{start:'right',span:C.rightBundleSpan,radius:.012,side:'right',parentId:'his'});
  // A left anterior/posterior fascicular fan and a right apical/free-wall fan.
  // Posterior projection anchors the visible branches just inside the lumen.
  const lvRoutes=[
    [[.64,-1.125],[.80,-1.03],[.83,-.79],[.74,-.48],[.54,-.23]],
    [[.64,-1.125],[.51,-1.02],[.40,-.80],[.25,-.55],[.10,-.29]],
    [[.64,-1.125],[.67,-.92],[.59,-.70],[.49,-.46],[.35,-.20]],
    [[.64,-1.125],[.28,-.89],[.13,-.69],[.01,-.49],[-.08,-.29]]
  ];
  const rvRoutes=[
    [[-.05,-1.13],[-.31,-1.05],[-.52,-.87],[-.59,-.65],[-.48,-.43]],
    [[-.05,-1.13],[-.18,-.96],[-.29,-.74],[-.34,-.51],[-.33,-.30]],
    [[-.05,-1.13],[.04,-.92],[.03,-.70],[-.02,-.50],[-.01,-.28]]
  ];
  const fan=(routes,projector,side)=>{
    const fanStart=side==='left'?C.leftBundleSpan:C.rightBundleSpan;
    routes.forEach((route,j)=>{
      path(side+'-purkinje-'+j,route.map(([x,y])=>projector.posterior(x,y)),{start:side,offset:fanStart,span:.026,radius:.009,side,parentId:side+'-bundle'});
      for(let k=1;k<route.length-1;k++){
        const [x,y]=route[k],sgn=(j+k)%2?1:-1,dx=side==='left'?.065:.075;
        const branch=[[x,y],[x+sgn*dx*.55,y+.065],[x+sgn*dx,y+.145]].map(([px,py])=>projector.posterior(px,py));
        path(side+'-twig-'+j+'-'+k,branch,{start:side,span:.013,radius:.0055,fine:true,side,parentId:side+'-purkinje-'+j,parentFraction:k/(route.length-1)});
      }
    });
  };
  fan(lvRoutes,left,'left');fan(rvRoutes,right,'right');
  if(coupled)for(const definition of coupled.paths)if(!paths.some(p=>p.id===definition.id))path(definition.id,definition.points,{start:definition.side||'atrial',side:definition.side,role:definition.role,fine:definition.fine||false,radius:definition.fine?.0055:.008,parentId:definition.parentId,parentFraction:definition.parentFraction});
  // A registered guide is not the imported field's conduction graph. In BBB
  // the delayed myocardial field shows recruitment on the interrupted side;
  // do not invent a crossing fiber or force that field through the apex.
  for(const [id,p]of Object.entries(nodes)){
    const dot=new THREE.Mesh(new THREE.SphereGeometry(id==='av'?.050:id==='sa'?.045:.035,12,8),new THREE.MeshBasicMaterial({color:id==='ectopic'?'#f3ac91':'#e7edb5',depthTest:false,depthWrite:false}));dot.name='conduction-'+id;dot.position.set(...p);dot.userData.restPosition=p;dot.renderOrder=12;root.add(dot);nodeMeshes[id]=dot;
  }
  const blockMarkers={};
  for(const [id,p]of [['left',lSept[1]],['right',rSept[1]],['av',[-.28,-.235,.10]],['infranodal',nodes.his]]){
    const group=new THREE.Group();group.position.set(...p);group.userData.restPosition=p;
    for(const sign of [-1,1]){const bar=new THREE.Mesh(new THREE.CylinderGeometry(.010,.010,.11,6),new THREE.MeshBasicMaterial({color:'#ff9c8c',depthTest:false,depthWrite:false}));bar.rotation.z=sign*Math.PI/4;bar.renderOrder=15;group.add(bar);}group.visible=false;root.add(group);blockMarkers[id]=group;
  }
  labels.push({text:'SA node',node:'sa',position:[-1.45,.75,.40]},
    {text:'AV node',node:'av',position:[-1.48,-.06,.42]},
    {text:'His bundle',node:'his',position:[1.40,.12,.48]},
    {text:'L bundle',node:'lv',position:[1.48,-.67,.52]},
    {text:'R bundle',node:'rv',position:[-1.48,-.79,.55]},
    {text:'Purkinje · inner walls',position:[.44,-1.63,.58],anchor:lApex});
  // The selected local-voltage probe samples the registered guide, not a
  // floating seed coordinate. Timing fractions match the representative AP
  // upstrokes. The atrial working-myocyte point now follows the shared spatial
  // field; His QRS−43 ms and Purkinje QRS−7 ms remain illustrative cell types.
  const pathPoint=(id,fraction)=>paths.find(p=>p.id===id).curve.getPoint(fraction).toArray();
  const potentialSites={
    sa:{position:nodes.sa,label:'SA node',color:'#8bb858'},
    atrial:{position:pathPoint('atrial-to-av',C.atrialProbeAfterP/C.atrialToAVDuration),label:'Atrial muscle',color:'#55b5a8'},
    av:{position:nodes.av,label:'AV node',color:'#c49c53'},
    his:{position:pathPoint('his',(C.hisProbeRelativeToQRS-C.hisPathRelativeToQRS)/C.hisPathSpan),label:'His bundle',color:'#9c91ce'},
    purkinje:{position:pathPoint('left-purkinje-0',0),label:'Purkinje network',color:'#9b77bc'}
  };
  if(coupled?.probeSites)for(const [id,probe]of Object.entries(coupled.probeSites))if(potentialSites[id])potentialSites[id].position=probe.pathId?pathPoint(probe.pathId,probe.fraction):probe.position;
  return {root,nodes,nodeMeshes,paths,pathById:new Map(paths.map(p=>[p.id,p])),motions,blockMarkers,labels,left,right,potentialSites,coupling:coupled};
}

export function updateConductionSystem(system,state,{enabled=true,gain=1,cutaway=false,deform=true}={}){
  if(system.coupling)return updateCoupledConductionSystem(system,state,{enabled,gain,cutaway,deform});
  const {paths,nodeMeshes,blockMarkers}=system,t=state.relativeTime,f=state.conductionEvent?{...state.timing,...state.conductionEvent}:state.timing||{},a=state.atrialState,at=a?.relativeTime??t,pStart=a?.pStart??f.pStart??-.16,qStart=f.qrsStart??0;
  const kind=state.bundle&&state.bundle!=='none'?state.bundle:typeof state.condition==='object'?state.condition.id:state.condition;
  const organized=!!a||!!state.organizedAtria,af=!!state.atrialFibrillation,flutter=!!state.atrialFlutter,ectopic=!!state.ectopic,escape=!!state.ventricularState?.escape;
  const suppress=!!state.suppressNormalVentricularConduction,atrialUnavailable=!!state.atrialTimingUnavailable||!!state.atrialUnavailable;
  const ventEscape=escape&&(state.ventricularState?.escapeOrigin||state.escapeOrigin)==='ventricular';
  const junctionalEscape=escape&&!ventEscape;
  const avBlocked=!!state.conductionBlocked||state.avBlock==='complete',infra=avBlocked&&state.avBlock==='mobitz2',pr=Number.isFinite(a?.pr)?a.pr:Number.isFinite(a?.plannedPR)?a.plannedPR:Math.max(.12,-(f.pStart??-.16));
  const electrical=electricalSceneState(state),atrialScale=atrialConductionScale(electrical.atrialRR);
  // A junctional escape starts downstream of the blocked atrial connection.
  // Its His/bundle guide follows the ventricular clock, including the known
  // next event's pre-QRS conduction window, never the unrelated P-wave clock.
  const explicitGuide=Object.prototype.hasOwnProperty.call(state,'conductionEvent'),guide=state.conductionEvent;
  const guideEctopic=guide?!!guide.ectopic:ectopic,guideEscape=guide?!!guide.escape:escape,guideVentricularEscape=guideEscape&&(guide?.escapeOrigin||state.ventricularState?.escapeOrigin||state.escapeOrigin)==='ventricular';
  const next=explicitGuide?null:Number.isFinite(state.nextRR)&&state.nextRR>0?state.nextRR:null;
  const fastClock=guide?guide.relativeTime:junctionalEscape&&next&&t>next+C.hisPathRelativeToQRS-.004?t-next:t;
  // A known conducted atrial event can supply the upcoming pre-QRS guide even
  // before the myocardial event selector switches to that ventricle. This is
  // an explicit linked event, not a guessed rhythm or an invented PVC input.
  const conductedClock=guide?guide.relativeTime:a?.conducted&&Number.isFinite(a.linkedQrsOnset)&&!avBlocked?at-pStart-pr+qStart:t;
  const ventricularGuideClock=junctionalEscape?fastClock:conductedClock;
  const motion={enabled,gain},move=(point,out)=>out.set(...deformCardiacPoint(point,state,motion));
  const timingAudit={junctions:0,maxJunctionGap:0,distalTargets:0,maxEndpointMismatch:0,blockedSidePulses:0};
  for(const dot of Object.values(nodeMeshes)){move(dot.userData.restPosition,dot.position);dot.material.depthTest=cutaway;}
  for(const d of paths){
    let clock=t,start=qStart+d.offset,active=true,blocked=false;
    if(d.start==='atrial'){clock=at;start=pStart+d.offset;active=organized&&!af&&!flutter&&!atrialUnavailable;}
    else if(d.start==='his'){
      if(guide&&!(infra&&avBlocked)){clock=guide.relativeTime;start=(guide.qrsStart||0)+C.hisPathRelativeToQRS;blocked=false;}
      else if(junctionalEscape){clock=fastClock;start=qStart+C.hisPathRelativeToQRS;}
      else{if(a&&organized&&!flutter&&!atrialUnavailable){clock=at;start=pStart+pr+C.hisPathRelativeToQRS;}else start=qStart+C.hisPathRelativeToQRS;blocked=avBlocked&&!infra;}
    }
    else if(d.start==='left'||d.start==='right'){
      clock=ventricularGuideClock;
      const blockedSide=kind===(d.start==='left'?'lbbb':'rbbb');
      start=qStart+C.bundleRelativeToQRS+d.offset;
      // The blocked proximal bundle remains marked; distal myocardium follows
      // the mapped delayed field, without a fictitious fast delivery pulse.
      blocked=infra||(blockedSide&&d.id.endsWith('bundle'));
    }
    if((guideEctopic||guideVentricularEscape||(guide?.suppressNormalVentricularConduction??suppress))&&d.start!=='atrial')active=false;
    if(explicitGuide&&!guide&&d.start!=='atrial'&&!(d.start==='his'&&infra&&avBlocked))active=false;
    if(!electrical.ventricularAvailable&&d.start!=='atrial')active=false;
    // During a dropped atrial event there is no fresh ventricular impulse.
    // A prior ventricular event remains on its own clock and can finish normally.
    let duration=d.id==='atrial-to-av'?d.span*atrialScale:d.span,end=start+duration,targetEnd=null;
    const distal=(d.id.includes('purkinje')||d.fine)&&d.side;
    if(distal){
      const local=electricalTimingAt(d.deliveryPoint,{...f,lvWeight:d.side==='left'?1:0,transmuralDepth:0,
        lvDelay:guide?.lvDelay??state.lvDelay??0,rvDelay:guide?.rvDelay??state.rvDelay??0,reference:d.deliveryReference});
      targetEnd=local.activation;end=targetEnd;
    }
    const parent=d.parentId?system.pathById.get(d.parentId):null,parentSchedule=parent?.schedule;
    let parentArrival=null;
    if(parentSchedule?.supported){
      parentArrival=conductionTimeAtFraction(parentSchedule,d.parentFraction)+clock-parentSchedule.clock;
      start=parentArrival;
      // Bundles retain their guide travel interval. Distal fibers retain the
      // mapped target if feasible, with a strictly forward causal fallback.
      if(d.id.endsWith('bundle'))end=start+d.span;
    }
    end=Math.max(end,start+C.guideMinimumTravel);duration=end-start;
    const interruptedSide=kind==='lbbb'&&d.side==='left'||kind==='rbbb'&&d.side==='right';
    const supported=active&&!blocked&&!interruptedSide;
    const schedule=d.schedule={clock,start,end,duration,targetEnd,parentArrival,supported,endpointMismatch:targetEnd===null?0:end-targetEnd};
    d.deliveryTime=end;d.mappedDeliveryTime=targetEnd;
    if(d.id==='atrial-to-av'){
      const probe=electricalTimingAt(system.potentialSites.atrial.position,{atrial:true,atrium:'right',pStart,pEnd:a?.pEnd??f.pEnd??pStart+.10,rr:electrical.atrialRR});
      const fraction=C.atrialProbeAfterP/C.atrialToAVDuration,anchor=Math.max(start+.006,Math.min(start+duration-.006,probe.activation));
      schedule.knots=[[0,start],[fraction,anchor],[1,end]];
    }
    const q=conductionFractionAtTime(schedule,clock);d.progress=q;
    if(supported&&parentArrival!==null){timingAudit.junctions++;timingAudit.maxJunctionGap=Math.max(timingAudit.maxJunctionGap,Math.abs(start-parentArrival));}
    if(supported&&targetEnd!==null){timingAudit.distalTargets++;timingAudit.maxEndpointMismatch=Math.max(timingAudit.maxEndpointMismatch,Math.abs(end-targetEnd));}
    const distalDelay=interruptedSide&&!d.id.endsWith('bundle');
    const quietAnatomy=(suppress||!electrical.ventricularAvailable)&&d.start!=='atrial'&&d.role==='specialized';
    d.mesh.visible=active||quietAnatomy;d.mesh.material.depthTest=cutaway;d.mesh.material.opacity=quietAnatomy?.20:blocked?.52:distalDelay?.34:d.fine?.70:cutaway?.95:.65;
    d.mesh.material.color.set(quietAnatomy?'#73978b':blocked?'#e18a7d':d.role==='myocardial'||distalDelay?'#d8b979':d.fine?'#298572':'#156d60');
    d.pulse.visible=supported&&clock>=start-1e-9&&clock<=end+1e-9;d.pulse.material.depthTest=cutaway;
    if(interruptedSide&&d.pulse.visible)timingAudit.blockedSidePulses++;
    if(d.pulse.visible)move(d.curve.getPoint(clamp(q)).toArray(),d.pulse.position);
    if(deform&&(active||quietAnatomy))deformCardiacGeometry(d.motion,state,motion);
  }
  system.timingAudit=timingAudit;
  blockMarkers.left.visible=kind==='lbbb'&&!ectopic&&!suppress;blockMarkers.right.visible=kind==='rbbb'&&!ectopic&&!suppress;blockMarkers.av.visible=avBlocked&&!infra;blockMarkers.infranodal.visible=infra;
  for(const group of Object.values(blockMarkers)){move(group.userData.restPosition,group.position);group.traverse(o=>{if(o.material)o.material.depthTest=false;});}
  const sa=nodeMeshes.sa,av=nodeMeshes.av,his=nodeMeshes.his;
  // Local SAN firing precedes the onset of measurable atrial muscle activity.
  // The outgoing atrial guide still starts at P onset, after this nodal upstroke.
  sa.material.color.set(af?'#e7a1ba':flutter||atrialUnavailable?'#8ba89e':'#e7edb5');sa.scale.setScalar(af?1+.20*Math.sin((state.recordTime||0)*39):organized&&!flutter&&!atrialUnavailable?1+.55*Math.exp(-(((at-pStart+C.saBeforeP)/.022)**2)):1);
  const holding=flutter?Math.cos((state.flutterPhase||0)*Math.PI*2)>.45:!atrialUnavailable&&organized&&at>pStart+C.atrialToAVDuration*atrialScale&&at<pStart+pr+C.hisPathRelativeToQRS,nodal=avBlocked&&!infra&&state.avBlock!=='complete';
  av.material.color.set(nodal?'#ed918b':holding?'#f5c083':'#e7edb5');av.scale.setScalar(holding||nodal?1.3:1);
  const hisPulse=suppress||!electrical.ventricularAvailable?0:flutter||state.rhythmKind==='svt'?Math.exp(-(((t-qStart-C.bundleRelativeToQRS)/.012)**2)):organized&&(!avBlocked||infra)?Math.exp(-(((at-pStart-pr-C.bundleRelativeToQRS)/.012)**2)):0;
  const escapeHis=electrical.ventricularAvailable?Math.exp(-(((fastClock-qStart-C.hisProbeRelativeToQRS)/.012)**2)):0;
  his.material.color.set(junctionalEscape?'#a9dcd9':'#e7edb5');his.scale.setScalar(junctionalEscape?1+.7*escapeHis:1+.5*hisPulse);
  nodeMeshes.ectopic.visible=!suppress&&(ectopic||ventEscape);nodeMeshes.ectopic.material.color.set(ventEscape?'#a9dcd9':'#f3ac91');nodeMeshes.ectopic.scale.setScalar(1+.8*Math.exp(-((t/.04)**2)));
}

/** One source graph schedules guide travel AND the myocardial arrival field. */
function updateCoupledConductionSystem(system,state,{enabled=true,gain=1,cutaway=false,deform=true}={}){
  const c=system.coupling,{paths,nodeMeshes,blockMarkers}=system,a=state.atrialState,
    explicit=Object.prototype.hasOwnProperty.call(state,'conductionEvent'),g=state.conductionEvent,
    f=g?{qrsStart:g.qrsStart||0,qrsEnd:g.qrsEnd,tStart:g.tStart,tEnd:g.tEnd}:state.timing||{},
    t=g?.relativeTime??state.relativeTime,at=a?.relativeTime??state.relativeTime,
    pStart=a?.pStart??state.timing?.pStart??-.16,pEnd=a?.pEnd??state.timing?.pEnd??-.06,qStart=f.qrsStart||0,
    kind=state.bundle&&state.bundle!=='none'?state.bundle:typeof state.condition==='object'?state.condition.id:state.condition,
    af=!!state.atrialFibrillation,flutter=!!state.atrialFlutter,
    organized=!!a||!!state.organizedAtria,unavailable=!!state.atrialTimingUnavailable||!!state.atrialUnavailable,
    avBlocked=!!state.conductionBlocked||state.avBlock==='complete',infra=avBlocked&&state.avBlock==='mobitz2',
    ectopic=g?!!g.ectopic:!!state.ectopic,escape=g?!!g.escape:!!state.ventricularState?.escape,
    origin=g?.escapeOrigin||state.ventricularState?.escapeOrigin||state.escapeOrigin,
    suppressed=g?.suppressNormalVentricularConduction??!!state.suppressNormalVentricularConduction,
    electrical=electricalSceneState(state),ventAvailable=explicit?!!g:electrical.ventricularAvailable,
    extraLV=Math.max(0,g?.lvDelay??state.lvDelay??0),extraRV=Math.max(0,(g?.rvDelay??state.rvDelay??.008)-.008),
    ventricularSpan=Math.max(.035,(f.qrsEnd??.09)-qStart-Math.max(extraLV,extraRV)),
    pr=Number.isFinite(a?.pr)?a.pr:Number.isFinite(a?.plannedPR)?a.plannedPR:Math.max(.12,-(state.timing?.pStart??-.16));
  const motion={enabled,gain},move=(p,out)=>out.set(...deformCardiacPoint(p,state,motion));
  const mapV=x=>qStart+(x<0?x:x/c.reference.ventricularDuration*ventricularSpan),mapA=x=>pStart+x/c.reference.atrialDuration*(pEnd-pStart);
  const audit={junctions:0,maxJunctionGap:0,distalTargets:0,maxEndpointMismatch:0,blockedSidePulses:0,sourceModel:'shared anatomical surface graph'};
  for(const dot of Object.values(nodeMeshes)){move(dot.userData.restPosition,dot.position);dot.material.depthTest=cutaway;}
  for(const d of paths){
    const def=d.definition,atrial=d.role==='atrial';let clock=atrial?at:t,
      knots=(def?.knots||[[0,def?.start||0],[1,def?.end||.02]]).map(([fraction,raw])=>[fraction,atrial?mapA(raw):mapV(raw)]),
      active=atrial?organized&&!af&&!flutter&&!unavailable:ventAvailable&&!ectopic&&!(escape&&origin==='ventricular')&&!suppressed;
    const interrupted=kind==='lbbb'&&d.side==='left'||kind==='rbbb'&&d.side==='right';
    let blocked=interrupted||(!atrial&&infra&&d.id!=='his');
    if(d.id==='his'&&infra&&organized&&!unavailable){
      clock=at;knots=(def.knots||[]).map(([fraction,raw])=>[fraction,pStart+pr+raw]);active=true;blocked=false;
    }else if(d.id==='his'&&avBlocked&&!g&&!(escape&&origin!=='ventricular'))blocked=true;
    const start=knots[0][1],end=knots.at(-1)[1],supported=active&&!blocked;
    const parent=d.parentId?system.pathById.get(d.parentId):null,parentSchedule=parent?.schedule;
    const parentArrival=parentSchedule?conductionTimeAtFraction(parentSchedule,d.parentFraction)+clock-parentSchedule.clock:null;
    d.schedule={clock,start,end,duration:end-start,knots,parentArrival,supported,targetEnd:null,endpointMismatch:0};
    d.deliveryTime=end;d.mappedDeliveryTime=null;d.progress=conductionFractionAtTime(d.schedule,clock);
    if(supported&&parentSchedule?.supported){audit.junctions++;audit.maxJunctionGap=Math.max(audit.maxJunctionGap,Math.abs(start-parentArrival));}
    const quiet=!atrial&&!active;
    d.mesh.visible=active||quiet;d.mesh.material.depthTest=cutaway;d.mesh.material.opacity=quiet?.19:interrupted?.33:d.fine?.61:cutaway?.91:.65;
    d.mesh.material.color.set(quiet?'#73978b':interrupted?'#d8b979':blocked?'#e18a7d':d.fine?'#298572':'#156d60');
    d.pulse.visible=supported&&clock>=start-1e-9&&clock<=end+1e-9;d.pulse.material.depthTest=cutaway;
    if(d.pulse.visible)move(d.curve.getPoint(clamp(d.progress)).toArray(),d.pulse.position);
    if(interrupted&&d.pulse.visible)audit.blockedSidePulses++;
    if(deform)deformCardiacGeometry(d.motion,state,motion);
  }
  system.timingAudit=audit;
  blockMarkers.left.visible=kind==='lbbb'&&!ectopic&&!suppressed;blockMarkers.right.visible=kind==='rbbb'&&!ectopic&&!suppressed;blockMarkers.av.visible=avBlocked&&!infra;blockMarkers.infranodal.visible=infra;
  for(const marker of Object.values(blockMarkers)){move(marker.userData.restPosition,marker.position);marker.traverse(o=>{if(o.material)o.material.depthTest=false;});}
  const sa=nodeMeshes.sa,av=nodeMeshes.av,his=nodeMeshes.his,saTime=pStart-C.saBeforeP;
  sa.material.color.set(af?'#e7a1ba':flutter||unavailable?'#8ba89e':'#e7edb5');sa.scale.setScalar(af?1+.20*Math.sin((state.recordTime||0)*39):organized&&!flutter&&!unavailable?1+.55*Math.exp(-(((at-saTime)/.022)**2)):1);
  const avArrival=mapA(c.probeSites?.av?.activation||.07),hold=organized&&!unavailable&&at>avArrival&&at<pStart+pr+C.hisPathRelativeToQRS;
  av.material.color.set(avBlocked&&!infra?'#ed918b':hold?'#f5c083':'#e7edb5');av.scale.setScalar(hold?1.3:1);
  const hisSchedule=system.pathById.get('his')?.schedule,hisActive=hisSchedule?.supported?Math.exp(-(((hisSchedule.clock-(hisSchedule.start+.006))/.012)**2)):0;
  his.material.color.set(escape&&origin!=='ventricular'?'#a9dcd9':'#e7edb5');his.scale.setScalar(1+.5*hisActive);
  nodeMeshes.ectopic.visible=!suppressed&&(ectopic||escape&&origin==='ventricular');nodeMeshes.ectopic.scale.setScalar(1+.8*Math.exp(-((t/.04)**2)));
}

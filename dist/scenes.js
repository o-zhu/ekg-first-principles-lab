import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {SoftwareRenderer,ARRHYTHMIA_FIELD_GLSL} from './soft-renderer.js';
import {LEAD_INFO,REGIONS} from './ecg.js';
import {sectionMyocardium,trimInferiorVessel} from './cutaway.js';
import {makeConductionSystem,updateConductionSystem,addTransmuralDepth,CONDUCTION_MODEL} from './conduction-system.js';
import {conductionCouplingReady,coupledLVWeight} from './conduction-coupling.js';
import {VENTRICULAR_AP_SITES,RECOVERY_MODEL} from './recovery-model.js';
import {loadElectricalField,electricalReferenceAt,electricalBlockReferenceAt,electricalTextureBytes,electricalViewRange,electricalSceneState,ELECTRICAL_MODEL,ELECTRICAL_TRANSFER_MODEL,ELECTRICAL_FALLBACK_MODEL,ELECTRICAL_VIEWS,ELECTRICAL_FIELD_GLSL} from './electrical-field.js';
import {normalMotionState,prepareCardiacGeometry,deformCardiacGeometry,deformCardiacPoint,bindCardiacJunctions,enforceCardiacJunctions,MOTION_MODEL} from './cardiac-motion.js';
import {layoutLeadLabels} from './lead-axis-layout.js';

const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const POTENTIAL_SITE_IDS=new Set(['sa','atrial','av','his','purkinje','ventricular-endo','ventricular-epi']);
const cache=new Map();
function loadModel(url){if(!cache.has(url))cache.set(url,new GLTFLoader().loadAsync(url));return cache.get(url);}
const regionCache=new Map();
let leadOverlaySequence=0;
let junctionMetadata;
function loadJunctionMetadata(){return junctionMetadata??=(fetch('./models/heart-junctions.json').then(r=>{if(!r.ok)throw new Error('Junction metadata unavailable');return r.json();}));}
function loadRegions(variant=''){const file='./models/heart-regions'+variant+'.json';if(!regionCache.has(file))regionCache.set(file,fetch(file).then(r=>{if(!r.ok)throw new Error('Region data unavailable');return r.json();}).catch(()=>null));return regionCache.get(file);}
function textTexture(text,color='#e7f5cc',size=54){const c=document.createElement('canvas');c.width=256;c.height=128;const x=c.getContext('2d');x.font=`500 ${size}px sans-serif`;x.fillStyle=color;x.textAlign='center';x.textBaseline='middle';x.fillText(text,128,64);return new THREE.CanvasTexture(c);}
function textSprite(text,color='#e7f5cc',size=54){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:textTexture(text,color,size),transparent:true,depthTest:false}));s.userData.sharedGeometry=true;s.material.userData.ownsMap=true;s.scale.set(.75,.375,1);return s;}
function line(points,color,opacity=.4){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity}));}
function disposeBranch(group){const geometries=new Set(),materials=new Set(),textures=new Set();group.traverse(o=>{if(o.geometry&&!o.userData.sharedGeometry)geometries.add(o.geometry);if(o.material&&!o.userData.sharedMaterial){for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m.map&&m.userData?.ownsMap)textures.add(m.map);}}});for(const t of textures)t.dispose();for(const m of materials)m.dispose();for(const g of geometries)g.dispose();group.clear();}

class BaseScene{
  constructor(container){
    this.container=container;this.alive=true;this.labels=[];this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(38,1,.05,100);const probe=document.createElement('canvas');let context=null;try{context=probe.getContext('webgl2',{alpha:true,antialias:true});}catch{}this.renderer=context?new THREE.WebGLRenderer({canvas:probe,context,antialias:true,alpha:true,powerPreference:'high-performance'}):new SoftwareRenderer();this.software=!!this.renderer.isSoftwareRenderer;container.dataset.renderer=this.software?'software':'webgl';if(this.software){const note=document.createElement('span');note.className='software-note';note.textContent='Software 3D · reduced geometry';container.appendChild(note);}
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.renderer.domElement.setAttribute('aria-label','Interactive 3D model. Drag to rotate, right-drag to pan, scroll to zoom. Keyboard: arrow keys adjust the view; plus and minus keys zoom.');this.renderer.domElement.tabIndex=0;this.container.prepend(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=.075;this.controls.minDistance=2.6;this.controls.maxDistance=28;this.controls.autoRotateSpeed=.5;this.controls.enablePan=true;this.controls.addEventListener('start',()=>{const badge=this.container.querySelector('.orientation-badge');if(badge)badge.textContent='FREE VIEW · PATIENT COORDINATES FIXED';});
    this.scene.add(new THREE.HemisphereLight('#e0efcf','#203d32',1.9));
    const key=new THREE.DirectionalLight('#ffe6cd',3.2);key.position.set(-4,5,6);this.scene.add(key);
    const fill=new THREE.DirectionalLight('#a2ccca',1.55);fill.position.set(4,1,3);this.scene.add(fill);
    const rim=new THREE.DirectionalLight('#d0e8ab',2.8);rim.position.set(0,2,-5);this.scene.add(rim);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();
    this.keyHandler=e=>{if(e.target!==this.renderer.domElement)return;const d=.18;if(e.key==='ArrowLeft'){this.camera.position.x-=d;e.preventDefault();}if(e.key==='ArrowRight'){this.camera.position.x+=d;e.preventDefault();}if(e.key==='ArrowUp'){this.camera.position.y+=d;e.preventDefault();}if(e.key==='ArrowDown'){this.camera.position.y-=d;e.preventDefault();}if(e.key==='+'||e.key==='=')this.zoom(.9);if(e.key==='-')this.zoom(1.1);};this.renderer.domElement.addEventListener('keydown',this.keyHandler);
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();const d=this.container.querySelector('.model-loading');if(d){d.classList.remove('hidden');d.textContent='3D graphics paused by the browser. Reload this lesson to restore the model.';}});
  }
  resize(){const width=this.container.clientWidth,height=this.container.clientHeight;if(!width||!height)return;if(this.viewport?.width===width&&this.viewport?.height===height)return;this.viewport={width,height};this.axisObstaclesDirty=true;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);}
  label(text,pos,cls=''){const el=document.createElement('div');el.className='scene-label '+cls;el.textContent=text;this.container.appendChild(el);const item={el,pos:pos.clone()};this.labels.push(item);return item;}
  render(){
    if(!this.alive)return;
    // ResizeObserver owns the viewport size. Read it only for callers that
    // construct a scene without the normal constructor (render-input audits).
    const {width,height}=this.viewport??(this.viewport={width:this.container.clientWidth,height:this.container.clientHeight});
    this.controls.update();this.beforeRender?.();
    // Clinical views hide anatomy names; those labels need neither projection
    // nor DOM movement. Do not read layout after updating the SVG lead overlay.
    for(const a of this.labels){
      if(a.hidden){if(a.el.style.display!=='none')a.el.style.display='none';continue;}
      const p=a.pos.clone().project(this.camera),display=p.z>1||p.z< -1?'none':'';
      if(a.el.style.display!==display)a.el.style.display=display;if(display)continue;
      const left=(p.x*.5+.5)*width+'px',top=(-p.y*.5+.5)*height+'px';
      if(a.el.style.left!==left)a.el.style.left=left;if(a.el.style.top!==top)a.el.style.top=top;
    }
    this.renderer.render(this.scene,this.camera);
  }
  zoom(factor){const d=this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);const len=d.length();if(len>=this.controls.minDistance&&len<=this.controls.maxDistance)this.camera.position.copy(this.controls.target).add(d);}
  autoRotate(value){this.controls.autoRotate=value;}
  destroy(){this.alive=false;this.observer.disconnect();this.controls.dispose();for(const l of this.labels)l.el.remove();disposeBranch(this.scene);this.renderer.dispose();this.renderer.domElement.remove();}
}

export class PhysicsScene extends BaseScene{
  constructor(container){
    super(container);this.mode='sphere';this.charge=5;this.rPlus=6;this.rMinus=18;this.angle=0;this.camera.position.set(1.1,2.0,12.5);this.controls.target.set(0,0,0);this.controls.maxDistance=24;this.controls.minDistance=5;this.controls.enablePan=true;
    this.source=new THREE.Group();this.scene.add(this.source);this.sphere=new THREE.Mesh(new THREE.SphereGeometry(.45,64,48),new THREE.MeshPhysicalMaterial({color:'#b8d98d',roughness:.25,metalness:.18,clearcoat:1,emissive:'#467f40',emissiveIntensity:.22}));this.source.add(this.sphere);
    this.sign=textSprite('+','#f5ffd7',65);this.sign.position.set(0,0,.47);this.source.add(this.sign);
    this.negative=new THREE.Mesh(new THREE.SphereGeometry(.45,64,48),new THREE.MeshPhysicalMaterial({color:'#a38cc0',roughness:.25,metalness:.15,clearcoat:1,emissive:'#7560a0',emissiveIntensity:.16}));this.negative.visible=false;this.source.add(this.negative);
    this.minusSign=textSprite('−','#eaddff',65);this.minusSign.visible=false;this.source.add(this.minusSign);
    this.halo=new THREE.Group();this.scene.add(this.halo);
    for(let i=0;i<7;i++){const r=.72+i*.49;const pts=[];for(let j=0;j<=160;j++){const a=j/160*Math.PI*2;pts.push(v(Math.cos(a)*r,Math.sin(a)*r,0));}const ring=line(pts,'#b9e49b',.19-i*.018);this.halo.add(ring);if(i%2===0){const r2=ring.clone();r2.rotation.x=Math.PI/2;this.halo.add(r2);}}
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;this.halo.add(line([v(Math.cos(a)*.5,Math.sin(a)*.5,0),v(Math.cos(a)*3.8,Math.sin(a)*3.8,0)],'#9fcb88',.10));}
    const matP=new THREE.MeshStandardMaterial({color:'#d5f1b0',emissive:'#6a934f',emissiveIntensity:.4,roughness:.35});const matM=new THREE.MeshStandardMaterial({color:'#bfa7dd',emissive:'#74618f',emissiveIntensity:.3,roughness:.35});
    this.positiveProbe=new THREE.Mesh(new THREE.SphereGeometry(.10,24,16),matP);this.negativeProbe=new THREE.Mesh(new THREE.SphereGeometry(.10,24,16),matM);this.scene.add(this.positiveProbe,this.negativeProbe);
    this.probeRingP=new THREE.Mesh(new THREE.TorusGeometry(.19,.013,6,48),new THREE.MeshBasicMaterial({color:'#d8eac1',transparent:true,opacity:.7}));this.probeRingM=new THREE.Mesh(new THREE.TorusGeometry(.19,.013,6,48),new THREE.MeshBasicMaterial({color:'#c9b7dd',transparent:true,opacity:.7}));this.scene.add(this.probeRingP,this.probeRingM);
    this.distanceP=line([v(0,0,0),v(1,0,0)],'#c0dea0',.45);this.distanceM=line([v(0,0,0),v(-1,0,0)],'#a996c0',.4);this.scene.add(this.distanceP,this.distanceM);
    this.pLabel=this.label('+ electrode',v(1.35,.5,0),'positive');this.mLabel=this.label('− reference',v(-4.05,.5,0),'negative');this.sourceLabel=this.label('uniformly charged sphere',v(0,-.88,0));this.set({});
  }
  set(o){Object.assign(this,o);const dip=this.mode==='dipole';this.source.rotation.z=this.angle*Math.PI/180;this.sphere.position.set(dip?.55:0,0,0);this.negative.position.set(-.55,0,0);this.negative.visible=dip;this.minusSign.visible=dip;this.sign.position.set(dip?.55:0,0,.47);this.minusSign.position.set(-.55,0,.47);this.sign.material.map.dispose();this.sign.material.map=textTexture(this.charge>=0?'+':'−','#f5ffd7',65);this.minusSign.material.map.dispose();this.minusSign.material.map=textTexture(this.charge>=0?'−':'+','#eaddff',65);
    const p=this.rPlus*.225,m=this.rMinus*.225;this.positiveProbe.position.set(p,0,0);this.negativeProbe.position.set(-m,0,0);this.probeRingP.position.set(p,0,0);this.probeRingM.position.set(-m,0,0);this.distanceP.geometry.setFromPoints([v(0,0,0),v(p,0,0)]);this.distanceM.geometry.setFromPoints([v(0,0,0),v(-m,0,0)]);this.pLabel.pos.set(p,.38,0);this.mLabel.pos.set(-m,.38,0);this.sourceLabel.el.textContent=dip?'a pair of opposite charges':'uniformly charged sphere';this.sourceLabel.pos.set(0,-.9,0);this.halo.visible=!dip;
    if(this.dipoleLines){this.scene.remove(this.dipoleLines);disposeBranch(this.dipoleLines);this.dipoleLines=null;}
    if(dip){this.dipoleLines=new THREE.Group();for(let side of [-1,1])for(let i=0;i<6;i++){const pts=[];const h=(i+1)*.47;for(let j=0;j<=90;j++){const a=j/90*Math.PI;pts.push(v(-.55*Math.cos(a),side*h*Math.sin(a),0));}const l=line(pts,'#b6c7b2',.25-i*.02);this.dipoleLines.add(l);const l2=l.clone();l2.rotation.x=Math.PI/2;this.dipoleLines.add(l2);}this.dipoleLines.rotation.z=this.angle*Math.PI/180;this.scene.add(this.dipoleLines);}
  }
  reset(){this.camera.position.set(1.1,2,12.5);this.controls.target.set(0,0,0);}
  update(time){this.halo.rotation.y=Math.sin(time*.1)*.07;this.render();}
}

export class HeartScene extends BaseScene{
  constructor(container,{torso=false,onReady,onError}={}){
    super(container);
    this.torso=torso;this.heartRoot=new THREE.Group();this.scene.add(this.heartRoot);
    this.activation=true;this.beating=true;this.motionGain=1;this.labelsOn=true;this.axisLabels=null;
    this.lead='II';this.selectedLeads=['II'];this.leadAxes=false;this.shaderMaterials=[];this.motionMeshes=[];this.motionLabels=[];
    this.meshes={};this.skin=null;this.bones=null;this.showSkin=torso;this.showBones=torso;
    this.anatomyLabels=[];this.electrodeLabels=[];this.conductionLabels=[];this.potentialSite=null;
    this.axes=new THREE.Group();this.axes.visible=this.leadAxes;this.axes.userData.fixedAnatomicalCoordinates=true;this.axisMarkers=[];this.scene.add(this.axes);
    this.electrodes=new THREE.Group();this.scene.add(this.electrodes);
    this.bpm=72;this.highlightedRegion=null;this.regionMasksReady=false;this.electricalView='voltage';this.electricalDescription=ELECTRICAL_MODEL;this.electricalSource='loading';
    this.conductionOn=false;this.cutaway=false;this.referencePlane=false;this.injuryVisible=true;this.cutawayMotionMeshes=[];this.cutawaySources=[];this.motionDescription=MOTION_MODEL.description;this.conductionDescription=CONDUCTION_MODEL.description;this.cutawayDescription=CONDUCTION_MODEL.cutaway;this.recoveryDescription=RECOVERY_MODEL.description;
    this.cutawayRoot=new THREE.Group();this.cutawayRoot.name='anatomical-myocardial-section';this.cutawayRoot.visible=false;this.heartRoot.add(this.cutawayRoot);
    if(torso)this.addReferencePlane();
    this.controls.minDistance=torso?5:3;this.controls.maxDistance=torso?30:15;this.reset();
    const orbit=line(Array.from({length:129},(_,i)=>{const a=i/128*Math.PI*2;return v(Math.cos(a)*2.1,-1.65,Math.sin(a)*2.1);}), '#a1bd8b',.13);
    this.scene.add(orbit);this.orbit=orbit;orbit.visible=!torso;
    const variant=this.software?'-medium':'';
    Promise.all([loadModel('./models/heart'+variant+'.glb'),loadRegions(variant),loadModel('./models/heart-junctions'+variant+'.glb'),loadJunctionMetadata(),loadElectricalField().catch(error=>{console.warn('Reference electrical field unavailable; using teaching fallback',error);return null;})]).then(([g,regions,junctions,junctionData,electrical])=>{
      if(!this.alive)return;
      this.electricalSource=electrical?(conductionCouplingReady()?'network-coupled-reference':'mapped-ct-reference'):'illustrative-fallback';
      this.electricalDescription=electrical?(conductionCouplingReady()?ELECTRICAL_MODEL:ELECTRICAL_TRANSFER_MODEL):ELECTRICAL_FALLBACK_MODEL;
      this.container.dataset.electricalSource=this.electricalSource;
      this.electricalTexture=new THREE.DataTexture(electricalTextureBytes(),2048,2,THREE.RGBAFormat,THREE.UnsignedByteType);
      this.electricalTexture.minFilter=THREE.NearestFilter;this.electricalTexture.magFilter=THREE.NearestFilter;this.electricalTexture.generateMipmaps=false;this.electricalTexture.needsUpdate=true;
      const model=g.scene.clone(true);
      // Registered source IVC plus explicitly modeled collars across source cut seams.
      // The original anatomical files are unchanged; every surface samples the same field.
      model.add(junctions.scene.clone(true));
      this.cavityReferences=['left-ventricle','right-ventricle'].map(name=>model.getObjectByName(name).geometry);
      model.traverse(mesh=>{
        if(!mesh.isMesh)return;
        this.meshes[mesh.name]=mesh;
        // Every cardiac component has its own mutable geometry. The cached
        // reference model is never changed, including across module switches.
        mesh.geometry=mesh.geometry.clone();mesh.userData.sharedGeometry=false;
        if(mesh.name==='inferior-vena-cava'){const original=mesh.geometry;mesh.geometry=trimInferiorVessel(original,-1.58);original.dispose();}
        if(['right-ventricle','left-ventricle'].includes(mesh.name)){
          mesh.visible=false;mesh.material=mesh.material.clone();
          this.motionMeshes.push(prepareCardiacGeometry(mesh));return;
        }
        let color='#ad6056';
        if(mesh.name==='right-atrium')color='#c47f6d';
        if(mesh.name==='left-atrium')color='#b77a77';
        if(mesh.name==='ventricular-wall')color='#ab5e56';
        if(mesh.name.includes('aorta')||mesh.name==='aortic-arch')color='#cf997f';
        if(mesh.name==='pulmonary-trunk')color='#819fa9';
        if(mesh.name.includes('vena-cava')||mesh.name.startsWith('caval-'))color='#698a9b';
        if(mesh.name==='aortic-junction-collar')color='#cf997f';
        if(mesh.name.includes('coronary'))color='#6d1728';
        const mat=new THREE.MeshPhysicalMaterial({color,roughness:.45,metalness:.015,clearcoat:.30,clearcoatRoughness:.5,side:THREE.DoubleSide});
        mesh.material=mat;
        if(mesh.name.includes('atrium')||mesh.name==='ventricular-wall')this.addActivationMaterial(mesh,mat,regions);
        this.motionMeshes.push(prepareCardiacGeometry(mesh));
      });
      this.junctionConstraints=bindCardiacJunctions(this.meshes,junctionData.variants[variant||'full']);
      this.heartRoot.add(model);this.addAnatomyLabels();this.addSeptumMarker(regions?.septumCenter);
      this.addCutaway();this.addConductionNetwork();this.addPotentialProbe();this.highlightRegion(this.highlightedRegion);this.setLead(this.lead,this.selectedLeads);
      this.container.querySelector('.model-loading')?.classList.add('hidden');onReady?.();
    }).catch(error=>{
      if(!this.alive)return;
      const el=this.container.querySelector('.model-loading');
      if(el)el.textContent='The anatomy model could not load. Try reloading this lesson.';
      onError?.(error);
    });
    if(torso){this.loadTorso();this.addElectrodes();}
  }
  addActivationMaterial(mesh,mat,regions){
    const atrial=mesh.name.includes('atrium'),count=mesh.geometry.getAttribute('position').count;
    const weights=mesh.geometry.getAttribute('aLVWeight')?.array?.slice()||new Float32Array(count).fill(.5);
    if(!atrial&&regions?.lvWeights?.length===count){for(let i=0;i<count;i++)weights[i]=regions.lvWeights[i]/255;this.regionMasksReady=true;}
    if(!atrial&&conductionCouplingReady()){
      const positions=mesh.geometry.getAttribute('position');
      for(let i=0;i<count;i++)weights[i]=coupledLVWeight([positions.getX(i),positions.getY(i),positions.getZ(i)],weights[i]);
    }
    mesh.geometry.setAttribute('aLVWeight',new THREE.BufferAttribute(weights,1));
    if(!mesh.geometry.getAttribute('aTransmuralDepth')){
      if(!atrial&&this.cavityReferences)addTransmuralDepth(mesh.geometry,this.cavityReferences);
      else mesh.geometry.setAttribute('aTransmuralDepth',new THREE.BufferAttribute(new Float32Array(count),1));
    }
    const original=mesh.geometry.getAttribute('position');
    const rest=new Float32Array(count*3);
    for(let i=0;i<count;i++){rest[i*3]=original.getX(i);rest[i*3+1]=original.getY(i);rest[i*3+2]=original.getZ(i);}
    mesh.geometry.setAttribute('aRestPosition',new THREE.BufferAttribute(rest,3));
    if(!mesh.geometry.getAttribute('aElectricalReference')){
      const field=new Float32Array(count*2),depth=mesh.geometry.getAttribute('aTransmuralDepth'),point=[0,0,0],sample=new Float64Array(2);
      const atrium=mesh.name.startsWith('left-atrium')?'left':'right';
      for(let i=0;i<count;i++){
        point[0]=rest[i*3];point[1]=rest[i*3+1];point[2]=rest[i*3+2];
        electricalReferenceAt(point,{atrial,atrium,lvWeight:weights[i],transmuralDepth:depth.getX(i)},sample);
        field[i*2]=sample[0];field[i*2+1]=sample[1];
      }
      mesh.geometry.setAttribute('aElectricalReference',new THREE.BufferAttribute(field,2));
    }
    if(!mesh.geometry.getAttribute('aElectricalBlockActivation')){
      const field=new Float32Array(count*2),depth=mesh.geometry.getAttribute('aTransmuralDepth'),point=[0,0,0],sample=new Float64Array(2);
      for(let i=0;i<count;i++){
        point[0]=rest[i*3];point[1]=rest[i*3+1];point[2]=rest[i*3+2];
        electricalBlockReferenceAt(point,{atrial,lvWeight:weights[i],transmuralDepth:depth.getX(i)},sample);
        field[i*2]=sample[0];field[i*2+1]=sample[1];
      }
      mesh.geometry.setAttribute('aElectricalBlockActivation',new THREE.BufferAttribute(field,2));
    }
    const uniforms={
      uPhase:{value:0},uAtrialPhase:{value:0},uAtrialAvailable:{value:1},uVentricularAvailable:{value:1},uAtrialRecovery:{value:.04},uClock:{value:0},uPStart:{value:-.16},uPEnd:{value:-.06},
      uQStart:{value:0},uQEnd:{value:.09},uTStart:{value:.20},uTEnd:{value:.38},
      uActivation:{value:1},uAtrial:{value:atrial?1:0},uAtrialFibrillation:{value:0},uAtrialFlutter:{value:0},uFlutterPhase:{value:0},
      uVentricularMechanism:{value:0},uVentricularDisorganization:{value:0},
      uLVDelay:{value:0},uRVDelay:{value:.008},uEctopic:{value:0},
      uInjuryTerritory:{value:0},uInjuryVisible:{value:1},uCutFace:{value:mesh.userData.cutFace?1:0},
      uElectricalView:{value:ELECTRICAL_VIEWS[this.electricalView].code},uElectricalTemplate:{value:this.electricalTexture},uRR:{value:60/72},uInjurySeverity:{value:.70},
      uHighlight:{value:0},uHighlightColor:{value:new THREE.Color('#cde99a')}
    };
    mat.userData.uniforms=uniforms;this.shaderMaterials.push(mat);
    mat.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        varying vec3 vHeartPos;
        attribute vec3 aRestPosition;
        attribute float aLVWeight; attribute float aTransmuralDepth;
        attribute vec2 aElectricalReference; varying vec2 vElectricalReference;
        attribute vec2 aElectricalBlockActivation; varying vec2 vElectricalBlockActivation;
        varying float vLVWeight; varying float vTransmuralDepth;`);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vHeartPos = aRestPosition;
        vLVWeight = aLVWeight; vTransmuralDepth = aTransmuralDepth;
        vElectricalReference = aElectricalReference;
        vElectricalBlockActivation = aElectricalBlockActivation;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vHeartPos; varying float vLVWeight; varying float vTransmuralDepth;
        varying vec2 vElectricalBlockActivation;
        uniform float uPhase; uniform float uAtrialPhase; uniform float uAtrialAvailable; uniform float uVentricularAvailable; uniform float uAtrialRecovery; uniform float uClock;
        uniform float uPStart; uniform float uPEnd;
        uniform float uQStart; uniform float uQEnd; uniform float uTStart; uniform float uTEnd;
        uniform float uActivation; uniform float uAtrial; uniform float uAtrialFibrillation; uniform float uAtrialFlutter; uniform float uFlutterPhase;
        uniform float uVentricularMechanism; uniform float uVentricularDisorganization;
        uniform float uLVDelay; uniform float uRVDelay; uniform float uEctopic;
        uniform float uInjuryTerritory; uniform float uInjuryVisible; uniform float uCutFace;
        uniform float uHighlight; uniform vec3 uHighlightColor;
        ${ELECTRICAL_FIELD_GLSL}
        ${ARRHYTHMIA_FIELD_GLSL}`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float injuryMask=electricalInjury(vHeartPos,uInjuryTerritory,vLVWeight)*(1.0-uAtrial);
        float injury=injuryMask*uInjurySeverity;
        vec4 timing=mappedElectricalTiming(vHeartPos,vElectricalReference,vElectricalBlockActivation,vLVWeight,uAtrial,uPStart,uPEnd,uQStart,uQEnd,uTEnd,uLVDelay,uRVDelay,uEctopic,injury);
        float localPhase=mix(uPhase,uAtrialPhase,uAtrial);
        vec4 field=electricalWaveform(localPhase,timing,uAtrial);
        bool qualitative=false;
        if(uAtrial>0.5 && uAtrialFibrillation>0.5){
          float fibrillation=sin(dot(vHeartPos,vec3(11.0,8.0,7.0))-uClock*39.0)+0.65*sin(dot(vHeartPos,vec3(-7.0,13.0,8.0))+uClock*51.0);
          float dep=0.25+0.20*sin(fibrillation*2.2);
          field=vec4(dep,smoothstep(0.95,1.45,fibrillation),(1.0-smoothstep(-1.40,-0.85,fibrillation))*0.45,dep);qualitative=true;
        }
        if(uAtrial>0.5 && uAtrialFlutter>0.5){
          vec3 flutter=atrialFlutterField(vHeartPos,uFlutterPhase);field=vec4(flutter.x,flutter.y,flutter.z,flutter.x);qualitative=true;
        }
        if(uAtrial<0.5 && uVentricularMechanism>0.5){
          vec3 rhythm=ventricularArrhythmiaField(vHeartPos,uPhase,uQStart,uQEnd,uTStart,uTEnd,uClock,uVentricularMechanism,uVentricularDisorganization);
          field=vec4(rhythm.x,rhythm.y,rhythm.z,rhythm.x);qualitative=true;
        }
        // Independent atrial clocks survive AV block; an unannotated P does
        // not invent an organized atrial wave. Static timing maps are withheld
        // for qualitative rhythms where no measured local AT/APD was supplied.
        bool unavailable=(uAtrial>0.5&&uAtrialAvailable<0.5&&uAtrialFibrillation<0.5&&uAtrialFlutter<0.5)||
          (uAtrial<0.5&&uVentricularAvailable<0.5&&uVentricularMechanism<0.5);
        if(unavailable)field=vec4(mix(0.0,0.037,uAtrial),0.0,0.0,0.0);
        vec3 anatomy=diffuseColor.rgb;
        if((qualitative||unavailable)&&uElectricalView>1.5){
          diffuseColor.rgb=mix(anatomy,vec3(.13,.25,.29),uActivation*.55);
        }else{
          diffuseColor.rgb=electricalDisplayColor(anatomy,field,timing,localPhase,uAtrial,uPStart,uPEnd,uQStart,uQEnd,uTStart,uTEnd,uActivation);
        }
        // A thin warm rim identifies the illustrative injury territory while
        // the tissue color itself follows changed resting Vm, amplitude/APD.
        float injuryRim=exp(-pow((injuryMask-.48)/.075,2.0));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.95,.35,.16),injuryRim*.48*uInjuryVisible*uActivation);
        if(uCutFace>0.5){float grain=0.95+0.05*sin(vHeartPos.x*145.0+vHeartPos.y*63.0);diffuseColor.rgb*=grain;}
        float regionMask = 0.0;
        if(uHighlight>0.5 && uHighlight<1.5)regionMask=uAtrial;
        else if(uHighlight>1.5 && uHighlight<2.5)regionMask=(1.0-uAtrial)*vLVWeight;
        else if(uHighlight>2.5 && uHighlight<3.5)regionMask=(1.0-uAtrial)*(1.0-vLVWeight);
        else if(uHighlight>3.5 && uHighlight<4.5)regionMask=(1.0-uAtrial)*smoothstep(-0.48,-0.02,vHeartPos.y);
        else if(uHighlight>4.5 && uHighlight<5.5)regionMask=1.0-uAtrial;
        if(uHighlight>0.5 && uHighlight<5.5){
          diffuseColor.rgb *= mix(0.52,1.0,regionMask);
          diffuseColor.rgb = mix(diffuseColor.rgb,uHighlightColor,regionMask*0.78);
        }`);
    };
    mat.customProgramCacheKey=()=>atrial?'heart-atrial-electrical-v13':'heart-ventricular-electrical-v13';
  }
  async loadTorso(){
    const jobs=[['./models/chest-bones.glb','bones'],['./models/chest-skin.glb','skin']];
    for(const [url,key]of jobs){
      try{
        const g=await loadModel(this.software?url.replace('.glb','-low.glb'):url);if(!this.alive)return;
        const m=g.scene.clone(true);
        m.traverse(o=>{if(!o.isMesh)return;o.userData.sharedGeometry=true;
          o.material=key==='skin'?new THREE.MeshPhysicalMaterial({color:'#b0d3b9',transparent:true,opacity:.105,roughness:.7,metalness:0,side:THREE.FrontSide,depthWrite:false}):new THREE.MeshStandardMaterial({color:'#ded4ae',transparent:true,opacity:.31,roughness:.75,depthWrite:false});
          o.renderOrder=key==='skin'?3:2;
        });
        this[key]=m;m.visible=key==='skin'?this.showSkin:this.showBones;this.scene.add(m);
      }catch(e){console.warn('Optional chest layer failed to load',key,e);const el=document.getElementById('layer-status');if(el)el.textContent='A chest layer could not load; reload this lesson to retry.';}
    }
  }
  addAnatomyLabels(){
    const entries=[['Right atrium',[-1.08,.22,.55]],['Left atrium',[.78,.6,-.4]],['Right ventricle',[-.65,-.78,.86]],['Left ventricle',[.94,-.93,.22]],['Aorta',[.35,1.52,-.12]]];
    for(const [t,p]of entries){const label=this.label(t,v(...p));label.restPos=label.pos.clone();this.anatomyLabels.push(label);this.motionLabels.push(label);}
  }
  addSeptumMarker(center=[.04275,-.48265,.41079]){
    this.septumRest=[...center];this.septumMarker=new THREE.Group();this.septumMarker.position.set(...center);this.septumMarker.visible=false;this.heartRoot.add(this.septumMarker);
    const point=new THREE.Mesh(new THREE.OctahedronGeometry(.105),new THREE.MeshBasicMaterial({color:'#f1cc77',wireframe:true,transparent:true,opacity:.95,depthTest:false,depthWrite:false}));point.renderOrder=6;this.septumMarker.add(point);
    const guide=new THREE.Line(new THREE.BufferGeometry().setFromPoints([v(-.1,-.30,-.03),v(.1,.30,.03)]),new THREE.LineDashedMaterial({color:'#f1cc77',dashSize:.055,gapSize:.045,transparent:true,opacity:.85,depthTest:false,depthWrite:false}));guide.computeLineDistances();guide.renderOrder=6;this.septumMarker.add(guide);
    this.septumLabel=this.label('Internal septum · schematic marker',v(center[0],center[1]-.44,center[2]),'positive');this.septumLabel.el.style.display='none';this.septumLabel.restPos=this.septumLabel.pos.clone();this.motionLabels.push(this.septumLabel);
  }
  addCutaway(){
    // Preserve the actual inner and outer surfaces. The anterior section is
    // capped only across muscle, with genuine cavity holes left open.
    for(const name of ['ventricular-wall','right-atrium','left-atrium']){
      const original=this.meshes[name];if(!original)continue;
      const section=sectionMyocardium(original.geometry,name.includes('atrium')?.05:.43);
      const surface=new THREE.Mesh(section.geometry,original.material);surface.name=name+'-section';surface.userData.sharedMaterial=true;
      this.cutawayRoot.add(surface);this.cutawayMotionMeshes.push(prepareCardiacGeometry(surface));
      if(section.capGeometry){
        const mat=new THREE.MeshPhysicalMaterial({color:name.includes('atrium')?'#d29d88':'#c88c7e',roughness:.68,metalness:0,side:THREE.DoubleSide});
        const face=new THREE.Mesh(section.capGeometry,mat);face.name=name+'-cut-face';face.userData.cutFace=true;
        // The cap introduces interior points. Re-sample the shared activation
        // field and wall depth there, rather than interpolating activation
        // across a large opening from its boundary vertices.
        face.geometry.deleteAttribute('aElectricalReference');
        face.geometry.deleteAttribute('aElectricalBlockActivation');
        face.geometry.deleteAttribute('aTransmuralDepth');
        this.addActivationMaterial(face,mat);this.cutawayRoot.add(face);this.cutawayMotionMeshes.push(prepareCardiacGeometry(face));
      }
      this.cutawaySources.push(original);
    }
    // Coronary branches are epicardial vessels. Remove only the front part
    // with the corresponding myocardial window; never present them as fibers.
    for(const name of ['left-coronary','right-coronary']){
      const original=this.meshes[name];if(!original)continue;
      const section=sectionMyocardium(original.geometry,.43,{cap:false});
      const m=new THREE.Mesh(section.geometry,original.material);m.name=name+'-section';m.userData.sharedMaterial=true;
      this.cutawayRoot.add(m);this.cutawayMotionMeshes.push(prepareCardiacGeometry(m));this.cutawaySources.push(original);
    }
    this.applyCutaway();
  }
  applyCutaway(){
    this.cutawayRoot.visible=this.cutaway;
    for(const m of this.cutawaySources)m.visible=!this.cutaway;
    this.lastDeformAt=0;
  }
  addConductionNetwork(){
    this.conductionSystem=makeConductionSystem(this.meshes,{software:this.software});
    this.conductionRoot=this.conductionSystem.root;this.conductionRoot.visible=this.conductionOn;this.heartRoot.add(this.conductionRoot);
    // Retain these public names for lesson diagnostics and geometry inspection.
    this.conductionNodes=this.conductionSystem.nodeMeshes;this.conductionPaths=this.conductionSystem.paths;this.blockMarkers=this.conductionSystem.blockMarkers;
    this.conductionLeaders=[];
    for(const def of this.conductionSystem.labels){
      const source=def.position,anchor=def.anchor||this.conductionSystem.nodes[def.node];
      const label=this.label(def.text,v(...source),'positive');label.restPos=label.pos.clone();label.el.style.display='none';this.conductionLabels.push(label);
      const leader=line([v(...anchor),v(...source)],'#70a997',.44);leader.material.depthTest=false;leader.material.depthWrite=false;leader.renderOrder=16;this.conductionRoot.add(leader);
      this.conductionLeaders.push({leader,anchor:[...anchor],endpoint:[...source]});
    }
    const ectopic=this.conductionSystem.nodes.ectopic;
    this.ectopicLabel=this.label('Ectopic focus · illustrative',v(ectopic[0]-.26,ectopic[1]-.20,ectopic[2]+.04),'negative');this.conductionLabels.push(this.ectopicLabel);this.ectopicLabel.restPos=this.ectopicLabel.pos.clone();this.ectopicLabel.el.style.display='none';this.motionLabels.push(this.ectopicLabel);
  }
  updateConduction(state,deform=true){
    if(!this.conductionRoot)return;this.conductionRoot.visible=this.conductionOn;if(!this.conductionOn)return;
    updateConductionSystem(this.conductionSystem,state,{enabled:this.beating,gain:this.motionGain,cutaway:this.cutaway,deform});
    for(const {leader,anchor,endpoint}of this.conductionLeaders){leader.visible=this.labelsOn;const p=deformCardiacPoint(anchor,state,{enabled:this.beating,gain:this.motionGain}),a=leader.geometry.getAttribute('position');a.setXYZ(0,...p);a.setXYZ(1,...endpoint);a.needsUpdate=true;}
    const escape=state.ventricularState?.escapeOrigin==='ventricular';
    this.ectopicLabel.el.textContent=escape?'Escape focus · illustrative':'Ectopic focus · illustrative';
  }
  addPotentialProbe(){
    this.potentialSiteDefinitions={...this.conductionSystem.potentialSites,
      'ventricular-endo':{...VENTRICULAR_AP_SITES['ventricular-endo'],label:'LV endocardium',color:'#d78071'},
      'ventricular-epi':{...VENTRICULAR_AP_SITES['ventricular-epi'],label:'LV epicardium',color:'#6ea88a'}};
    const group=new THREE.Group();group.name='selected-local-action-potential';group.visible=false;this.heartRoot.add(group);
    const core=new THREE.Mesh(new THREE.SphereGeometry(.035,12,8),new THREE.MeshBasicMaterial({color:'#d7e8ff',depthTest:false,depthWrite:false}));core.renderOrder=21;group.add(core);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.073,.006,6,32),new THREE.MeshBasicMaterial({color:'#d7e8ff',transparent:true,opacity:.94,depthTest:false,depthWrite:false}));ring.renderOrder=21;group.add(ring);
    const label=this.label('',v(0,0,0),'potential-site-label');label.hidden=true;label.el.style.display='none';
    label.el.style.transform='translate(14px,-50%)';label.el.style.fontSize='12px';label.el.style.fontWeight='650';label.el.style.pointerEvents='none';
    this.potentialProbe={group,core,ring,label};
    this.updatePotentialProbe(this.lastState||normalMotionState(0,this.bpm));
  }
  updatePotentialProbe(state){
    const probe=this.potentialProbe;if(!probe)return;
    const site=this.potentialSiteDefinitions[this.potentialSite];probe.group.visible=!!site;probe.label.hidden=!site||!this.labelsOn;
    if(!site){if(probe.label.el.style.display!=='none')probe.label.el.style.display='none';return;}
    const point=deformCardiacPoint(site.position,state,{enabled:this.beating,gain:this.motionGain});
    probe.group.position.set(...point);probe.ring.quaternion.copy(this.camera.quaternion);probe.label.pos.set(...point);
    if(probe.site!==this.potentialSite){
      probe.site=this.potentialSite;probe.core.material.color.set(site.color);probe.ring.material.color.set(site.color);
      probe.label.el.textContent='AP · '+site.label;probe.label.el.style.color=site.color;probe.label.el.dataset.site=this.potentialSite;
    }
  }
  addReferencePlane(){
    const group=new THREE.Group();group.name='patient-xy-reference-plane';group.userData.fixedAnatomicalCoordinates=true;
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(7.4,6.8),new THREE.MeshBasicMaterial({color:'#83b7b2',transparent:true,opacity:.026,side:THREE.DoubleSide,depthWrite:false}));plane.position.set(-.2,-.75,-1.85);group.add(plane);
    const points=[];for(let x=-3.9;x<=3.5;x+=.5)points.push(v(x,-4.15,-1.85),v(x,2.65,-1.85));for(let y=-4.15;y<=2.65;y+=.5)points.push(v(-3.9,y,-1.85),v(3.5,y,-1.85));
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#9bc7bd',transparent:true,opacity:.09,depthWrite:false})));
    group.add(line([v(-3.9,0,-1.84),v(3.5,0,-1.84)],'#add5c7',.26),line([v(0,-4.15,-1.84),v(0,2.65,-1.84)],'#add5c7',.26));
    this.referencePlaneLabels=[];
    for(const [text,pos]of [['x · patient left',[3.1,.18,-1.84]],['y · superior',[.25,2.65,-1.84]]]){const label=textSprite(text,'#aecac0',28);label.position.set(...pos);label.scale.set(1.3,.65,1);label.material.opacity=.70;group.add(label);this.referencePlaneLabels.push(label);}
    group.visible=this.referencePlane;this.referencePlaneRoot=group;this.scene.add(group);
  }
  highlightRegion(id=null){
    const codes={atria:1,lv:2,rv:3,basal:4,recovery:5,septum:6};this.highlightedRegion=id in codes?id:null;
    const code=codes[this.highlightedRegion]||0,definition=REGIONS.find(r=>r.id===this.highlightedRegion),internal=code===6;
    for(const mat of this.shaderMaterials){const u=mat.userData.uniforms;u.uHighlight.value=code;u.uHighlightColor.value.set(definition?.color||'#cde99a');const changed=mat.transparent!==internal;mat.transparent=internal;mat.opacity=internal?.20:1;mat.depthWrite=!internal;if(changed)mat.needsUpdate=true;}
    if(this.septumMarker)this.septumMarker.visible=internal;
    const notes={atria:'Both atrial walls highlighted.',lv:'Approximate left ventricular surface, classified by proximity to the source left/right cavity surfaces.',rv:'Approximate right ventricular surface, classified by proximity to the source left/right cavity surfaces.',basal:'Illustrative superior ventricular band; not a measured activation map.',recovery:'Both ventricular walls highlighted. Recovery is distributed across ventricular tissue.',septum:'The septum is internal. A schematic marker between the source cavity surfaces is shown through translucent myocardium; it is not a segmented septal mesh.'};
    return {id:this.highlightedRegion,note:notes[this.highlightedRegion]||'',approximate:['lv','rv','basal','septum'].includes(this.highlightedRegion)};
  }
  addElectrodes(){
    const coords={RA:[-3.50,1.05,.5648],LA:[2.65,1.05,.5453],LL:[2.10,-3.50,1.1551],RL:[-3.00,-3.50,1.1389],V1:[-.95,-.60,2.1786],V2:[.10,-.60,2.1895],V3:[.60,-1.12,2.2850],V4:[1.10,-1.65,2.0817],V5:[2.10,-1.65,1.4542],V6:[2.55,-1.65,.6585]};
    this.electrodeCoords=coords;this.electrodeMarkers={};
    for(const [name,p]of Object.entries(coords)){
      const group=new THREE.Group();group.name='electrode-'+name;
      const material=new THREE.MeshStandardMaterial({color:'#d4eaa6',emissive:'#7d9f52',emissiveIntensity:.22,roughness:.4});
      const dot=new THREE.Mesh(new THREE.SphereGeometry(.075,16,12),material);dot.position.set(...p);dot.name=name;group.add(dot);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.13,.013,6,32),new THREE.MeshBasicMaterial({color:'#d3e3bc',transparent:true,opacity:.7}));ring.position.set(...p);group.add(ring);this.electrodes.add(group);this.electrodeMarkers[name]=group;
      const label=this.label(/^(RA|LA|LL|RL)$/.test(name)?name+'*':name,v(p[0]+.13,p[1]+.17,p[2]),'positive');label.electrodeName=name;this.electrodeLabels.push(label);
    }
    this.updateElectrodeVisibility();
  }
  updateElectrodeVisibility(){
    const deps={I:['RA','LA'],II:['RA','LL'],III:['LA','LL'],aVR:['RA','LA','LL'],aVL:['RA','LA','LL'],aVF:['RA','LA','LL']},active=new Set();
    for(const lead of this.selectedLeads){for(const name of deps[lead]||(/^V[1-6]$/.test(lead)?['RA','LA','LL',lead]:[]))active.add(name);}
    this.activeElectrodes=active;
    for(const [name,marker]of Object.entries(this.electrodeMarkers||{}))marker.visible=active.has(name);
    for(const label of this.electrodeLabels)label.hidden=!this.labelsOn||this.leadAxes||!active.has(label.electrodeName);
  }
  setLead(lead,selected){
    // Keep our own selection snapshot: individual toggles and All 12 build the
    // exact same geometry and labels, regardless of the caller's array identity.
    this.lead=lead;this.selectedLeads=[...new Set(selected||[lead])];disposeBranch(this.axes);
    if(!this.axisOverlay){
      this.axisOverlay=document.createElement('div');this.axisOverlay.className='lead-axis-overlay';this.axisOverlay.setAttribute('aria-hidden','true');this.container.appendChild(this.axisOverlay);
    }
    this.axisOverlay.replaceChildren();this.axisMarkers=[];this.axisViewSignature=null;this.axisScreenProjection=null;
    const svg=(tag,attrs={})=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
    this.axisLeaders=svg('svg',{class:'lead-axis-leaders'});this.axisOverlay.appendChild(this.axisLeaders);
    const defs=svg('defs'),vectors=svg('g',{class:'lead-axis-vectors'}),names=svg('g',{class:'lead-axis-names'});
    this.axisLeaders.append(defs,vectors,names);this.axisNames=names;this.axisOverlayId??=++leadOverlaySequence;
    this.axisVectors=vectors;this.axisMaskId=`lead-caption-clearance-${this.axisOverlayId}`;
    this.axisMask=svg('mask',{id:this.axisMaskId,maskUnits:'userSpaceOnUse',x:0,y:0});
    this.axisMask.appendChild(svg('rect',{x:0,y:0,width:'100%',height:'100%',fill:'white'}));defs.appendChild(this.axisMask);
    const order=[...Object.keys(LEAD_INFO),'V7','V8','V9'];
    const list=(this.torso?this.selectedLeads:[lead]).filter(name=>order.includes(name)).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    const selectionKey=[lead,...list].join('|');
    if(this.axisSelectionKey!==selectionKey)this.leadLabelLayout=null;
    this.axisSelectionKey=selectionKey;
    const origin=v(0,-.42,.25),chest={V1:[-.95,-.60,2.1786],V2:[.10,-.60,2.1895],V3:[.60,-1.12,2.2850],V4:[1.10,-1.65,2.0817],V5:[2.10,-1.65,1.4542],V6:[2.55,-1.65,.6585],V7:[2.25,-1.65,-.55],V8:[1.60,-1.65,-1.35],V9:[.65,-1.65,-1.65]};
    const colors={I:'#d9e6b4',II:'#cce7a4',III:'#aadbc2',aVR:'#d7bfdf',aVL:'#b8cdec',aVF:'#cec2e5',V1:'#efc1a7',V2:'#edd6a5',V3:'#dddfad',V4:'#bce0c0',V5:'#aedbd9',V6:'#b8d2eb',V7:'#b8d2eb',V8:'#c4c5e6',V9:'#d7bfdf'};
    for(const name of list){
      const info=LEAD_INFO[name]||(chest[name]?{plane:'precordial'}:null);if(!info)continue;
      // Limb directions are the standard frontal hexaxial orientations. A chest
      // arrow points approximately towards its registered electrode; it is not
      // an exact lead field or an electrode pretending to be inside the heart.
      const d=chest[name]?v(...chest[name]).sub(origin).normalize():v(...info.direction).normalize();
      const focused=name===lead,half=this.torso?2.35:1.95,color=colors[name];
      const negative=origin.clone().addScaledVector(d,-half),positive=origin.clone().addScaledVector(d,half);
      // Project the same patient-fixed endpoints into a crisp, continuous SVG
      // stroke. An open chevron gives polarity without a second +/− badge.
      const gradientId=`lead-axis-${this.axisOverlayId}-${name}`,gradient=svg('linearGradient',{id:gradientId,gradientUnits:'userSpaceOnUse'});
      gradient.append(svg('stop',{offset:'0%','stop-color':color,'stop-opacity':focused?'.22':'.12'}),svg('stop',{offset:'100%','stop-color':color,'stop-opacity':focused?'.98':'.80'}));defs.appendChild(gradient);
      const group=svg('g',{'data-axis-vector':name,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}),stroke=focused?1.65:1.25;
      const halo=svg('path',{stroke:'#08241f','stroke-width':stroke+1.6,'stroke-opacity':'.48'});
      const shaft=svg('path',{stroke:`url(#${gradientId})`,'stroke-width':stroke});
      const head=svg('path',{stroke:color,'stroke-width':stroke,'stroke-opacity':focused?'.98':'.86'});
      const endOn=svg('g',{stroke:color,'stroke-width':stroke,'stroke-opacity':'.86'}),ring=svg('circle',{r:'4.3'}),sign=svg('path');endOn.append(ring,sign);group.append(halo,shaft,head,endOn);vectors.appendChild(group);
      const text=this.torso?name:'Lead '+name,width=Math.ceil(text.length*(focused?7.5:7.1)+7),height=20;
      const leader=svg('path',{fill:'none',stroke:color,'stroke-width':'.8','stroke-opacity':'.48','stroke-linecap':'round'});
      const clearance=svg('rect',{width:width+6,height:height+4,rx:3,fill:'black'});clearance.style.display='none';this.axisMask.appendChild(clearance);
      leader.setAttribute('mask',`url(#${this.axisMaskId})`);
      const label=svg('text',{class:'lead-axis-name','data-lead-axis':name,fill:color,stroke:'#08241f','stroke-width':'2.6','stroke-linejoin':'round','paint-order':'stroke fill','font-family':'DM Sans, Arial, sans-serif','font-size':focused?'13':'12.5','font-weight':focused?'650':'550','text-anchor':'middle','dominant-baseline':'central'});label.textContent=text;names.append(leader,label);
      this.axisMarkers.push({name,focused,origin,positive,negative,d,half,group,gradient,halo,shaft,head,endOn,ring,sign,label,leader,clearance,width,height});
    }
    this.axes.visible=this.leadAxes;this.updateElectrodeVisibility();this.updateLeadAxes();
  }
  updateLabelVisibility(){
    const state=this.lastState||{};
    for(const l of this.anatomyLabels)l.hidden=!this.labelsOn||this.torso||this.conductionOn||this.highlightedRegion==='septum';
    for(const l of this.electrodeLabels)l.hidden=!this.labelsOn||this.leadAxes||!this.activeElectrodes?.has(l.electrodeName);
    for(const l of this.conductionLabels)l.hidden=!this.labelsOn||!this.conductionOn||(l===this.ectopicLabel&&(state.suppressNormalVentricularConduction||!(state.ectopic||state.ventricularState?.escapeOrigin==='ventricular')));
    if(this.septumLabel)this.septumLabel.hidden=!this.labelsOn||this.highlightedRegion!=='septum';
    if(this.potentialProbe)this.potentialProbe.label.hidden=!this.labelsOn||!this.potentialSite;
    for(const l of this.referencePlaneLabels||[])l.visible=this.labelsOn;
  }
  beforeRender(){this.updateLabelVisibility();this.updateLeadAxes();}
  measureAxisObstacles(){
    if(!this.axisObstacleElements||this.axisObstaclesDirty||!this.leadLabelLayout){
      const elements=[...this.container.querySelectorAll('.stage-top,.scene-state,.orientation-badge,.legend-pill,.scene-controls')];
      if(!this.axisObstacleElements||elements.length!==this.axisObstacleElements.length||elements.some((element,i)=>element!==this.axisObstacleElements[i])){
        this.axisObstacleElements=elements;this.axisObstacleObserver?.disconnect();
        if(typeof ResizeObserver!=='undefined'){
          this.axisObstacleObserver=new ResizeObserver(()=>{this.axisObstaclesDirty=true;});
          for(const element of elements)this.axisObstacleObserver.observe(element);
        }
      }
      this.axisObstaclesDirty=true;
    }
    if(this.axisObstaclesDirty||!this.axisObstacles){
      const bounds=this.container.getBoundingClientRect();this.axisObstacles=[];
      for(const [i,element]of this.axisObstacleElements.entries()){
        const r=element.getBoundingClientRect();if(r.width&&r.height)this.axisObstacles.push({id:'ui-'+i,x:r.left-bounds.left+r.width/2,y:r.top-bounds.top+r.height/2,w:r.width,h:r.height});
      }
      this.axisObstaclesDirty=false;
    }
    return this.axisObstacles;
  }
  updateLeadAxes(){
    if(!this.axisOverlay)return;
    if(!this.leadAxes){if(this.axisOverlay.hidden!==true)this.axisOverlay.hidden=true;return;}
    const {width,height}=this.viewport??(this.viewport={width:this.container.clientWidth,height:this.container.clientHeight});if(!width||!height)return;
    const showNames=this.axisLabels??this.labelsOn,needsRefresh=(showNames&&this.axisObstaclesDirty)||this.axisOverlay.hidden===true;
    this.camera.updateMatrixWorld();
    const signature=[width,height,showNames,...this.camera.matrixWorld.elements,...this.camera.projectionMatrix.elements];
    if(!needsRefresh&&this.axisViewSignature&&signature.every((n,i)=>typeof n==='boolean'?n===this.axisViewSignature[i]:Math.abs(n-this.axisViewSignature[i])<1e-10))return;
    this.axisViewSignature=signature;
    const project=point=>{const p=point.clone().project(this.camera);return {x:(p.x*.5+.5)*width,y:(-.5*p.y+.5)*height,visible:p.z>=-1&&p.z<=1&&Math.abs(p.x)<1.7&&Math.abs(p.y)<1.7};};
    const projections=this.axisMarkers.map(marker=>{
      const a=project(marker.negative),b=project(marker.positive),center=project(marker.origin),length=Math.hypot(b.x-a.x,b.y-a.y);
      const endOn=marker.endOnView?length<13:length<8;
      return {marker,a,b,center,length,endOn};
    });
    const screen=[width,height,showNames,...projections.flatMap(({a,b,center,endOn})=>[a.visible,b.visible,endOn,a.x,a.y,b.x,b.y,center.x,center.y])];
    // Keep OrbitControls' camera and damping exact. Only SVG work is coalesced
    // while the accumulated projected movement remains below a tenth of a
    // CSS pixel; compare with the last painted pose, never the previous tick.
    const componentTolerance=.1/Math.SQRT2;
    if(!needsRefresh&&this.axisScreenProjection&&screen.length===this.axisScreenProjection.length&&screen.every((n,i)=>typeof n==='boolean'?n===this.axisScreenProjection[i]:Math.abs(n-this.axisScreenProjection[i])<componentTolerance))return;
    this.axisScreenProjection=screen;
    // Measure fixed UI before changing any SVG attributes or visibility. Its
    // bounds are refreshed by ResizeObserver when phase text/controls resize.
    const obstacles=showNames?this.measureAxisObstacles():[];
    const attr=(element,name,value)=>{value=String(value);if(element.getAttribute(name)!==value)element.setAttribute(name,value);};
    const display=(element,visible)=>{const value=visible?'':'none';if(element.style.display!==value)element.style.display=value;};
    if(this.axisOverlay.hidden!==false)this.axisOverlay.hidden=false;display(this.axisNames,showNames);attr(this.axisLeaders,'viewBox',`0 0 ${width} ${height}`);
    // Leave a little transparent breathing room if a different lead's shaft
    // crosses a caption. This cuts only vector strokes, not the anatomy, and
    // keeps the text unboxed instead of adding another opaque badge.
    attr(this.axisMask,'width',width);attr(this.axisMask,'height',height);
    attr(this.axisVectors,'mask',showNames?`url(#${this.axisMaskId})`:'none');
    const projected=[];
    for(const {marker,a,b,center,length,endOn}of projections){
      const visible=a.visible&&b.visible;display(marker.group,visible);if(!visible){display(marker.label,false);display(marker.leader,false);display(marker.clearance,false);continue;}
      const dx=b.x-a.x,dy=b.y-a.y;
      marker.endOnView=endOn;
      display(marker.endOn,endOn);display(marker.shaft,!endOn);display(marker.head,!endOn);display(marker.halo,!endOn);
      if(marker.endOnView){
        attr(marker.ring,'cx',center.x);attr(marker.ring,'cy',center.y);
        const positiveDepth=marker.positive.clone().applyMatrix4(this.camera.matrixWorldInverse).z,negativeDepth=marker.negative.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
        const x=center.x,y=center.y,r=1.8;
        attr(marker.sign,'d',positiveDepth>negativeDepth?`M ${x-.55} ${y} L ${x+.55} ${y}`:`M ${x-r} ${y-r} L ${x+r} ${y+r} M ${x-r} ${y+r} L ${x+r} ${y-r}`);
      }else{
        const ux=dx/length,uy=dy/length,headLength=Math.min(marker.focused?10:8.5,length*.3),halfWidth=headLength*.4;
        const line=`M ${a.x} ${a.y} L ${b.x} ${b.y}`;
        const head=`M ${b.x-ux*headLength-uy*halfWidth} ${b.y-uy*headLength+ux*halfWidth} L ${b.x} ${b.y} L ${b.x-ux*headLength+uy*halfWidth} ${b.y-uy*headLength-ux*halfWidth}`;
        attr(marker.shaft,'d',line);attr(marker.head,'d',head);attr(marker.halo,'d',line+' '+head);
        for(const [key,value]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))attr(marker.gradient,key,value);
      }
      if(showNames){
        const tip=marker.endOnView?center:b;
        // Put the name beyond its positive arrowhead, following the projected
        // direction. A fixed upper-right offset placed V1 over its own shaft.
        const ux=marker.endOnView?1:dx/length,uy=marker.endOnView?0:dy/length;
        const support=Math.abs(ux)*marker.width/2+Math.abs(uy)*marker.height/2;
        let offset=support+11;
        const coords=this.torso&&this.electrodeCoords?.[marker.name];
        if(coords){
          const point=v(...coords),electrode=project(point),depth=-point.applyMatrix4(this.camera.matrixWorldInverse).z;
          const radius=Math.max(4,.15*height/(2*Math.tan(this.camera.fov*Math.PI/360)*Math.max(.05,depth)));
          offset=Math.max(offset,(electrode.x-tip.x)*ux+(electrode.y-tip.y)*uy+radius+support+7);
        }
        projected.push({id:marker.name,focused:marker.focused,anchorX:tip.x,anchorY:tip.y,x:tip.x+ux*offset,y:tip.y+uy*offset,w:marker.width,h:marker.height});
      }
    }
    if(!showNames)return;
    this.leadLabelLayout=layoutLeadLabels(projected,{width,height,obstacles},this.leadLabelLayout);
    for(const marker of this.axisMarkers){
      const p=this.leadLabelLayout.positions.get(marker.name);display(marker.label,!!p?.visible);display(marker.clearance,!!p?.visible);if(!p?.visible){display(marker.leader,false);continue;}
      attr(marker.label,'x',p.x);attr(marker.label,'y',p.y);
      attr(marker.clearance,'x',p.x-p.w/2-3);attr(marker.clearance,'y',p.y-p.h/2-2);
      const dx=p.x-p.anchorX,dy=p.y-p.anchorY,distance=Math.hypot(dx,dy);
      const edge=Math.min(p.w/2/Math.max(.001,Math.abs(dx)),p.h/2/Math.max(.001,Math.abs(dy)),1);
      // Nearby names simply sit beside the chevron. Only separated names need
      // a fine connector, preserving the link at dense/end-on camera angles.
      display(marker.leader,distance>p.w/2+21);
      attr(marker.leader,'d',`M ${p.anchorX} ${p.anchorY} L ${p.x-dx*edge} ${p.y-dy*edge}`);
    }
  }
  destroy(){
    this.axisOverlay?.remove();this.axisMarkers=[];this.axisObstacleObserver?.disconnect();this.electricalTexture?.dispose();super.destroy();
  }
  set(o){
    if('skin'in o){this.showSkin=o.skin;if(this.skin)this.skin.visible=o.skin;}
    if('bones'in o){this.showBones=o.bones;if(this.bones)this.bones.visible=o.bones;}
    if('activation'in o)this.activation=o.activation;
    if('electricalView'in o&&ELECTRICAL_VIEWS[o.electricalView])this.electricalView=o.electricalView;
    if('beating'in o)this.beating=o.beating;
    if('motionGain'in o)this.motionGain=Math.max(.5,Math.min(1.5,o.motionGain));
    if('labels'in o)this.labelsOn=o.labels;
    if('axisLabels'in o)this.axisLabels=o.axisLabels==null?null:!!o.axisLabels;
    if('conduction'in o)this.conductionOn=o.conduction;
    if('potentialSite'in o){this.potentialSite=POTENTIAL_SITE_IDS.has(o.potentialSite)?o.potentialSite:null;this.updatePotentialProbe(this.lastState||normalMotionState(0,this.bpm));}
    if('cutaway'in o){const previous=this.cutaway;this.cutaway=!!o.cutaway;this.applyCutaway();if(previous!==this.cutaway&&!this.torso)this.zoom(this.cutaway?.90:1/.90);}
    if('referencePlane'in o){this.referencePlane=!!o.referencePlane;if(this.referencePlaneRoot)this.referencePlaneRoot.visible=this.referencePlane;}
    if('injuryVisible'in o)this.injuryVisible=!!o.injuryVisible;
    if('leadAxes'in o){this.leadAxes=!!o.leadAxes;this.axes.visible=this.leadAxes;if(this.axisOverlay)this.axisOverlay.hidden=!this.leadAxes;}
    if('lead'in o||'selectedLeads'in o)this.setLead(o.lead??this.lead,o.selectedLeads??this.selectedLeads);
    if('autoRotate'in o)this.autoRotate(o.autoRotate);
    if('clinicalState'in o)this.clinicalState=o.clinicalState;
  }
  reset(view='anterior'){
    this.leadLabelLayout=null;this.axisViewSignature=null;this.axisScreenProjection=null;this.axisObstaclesDirty=true;
    const c=this.torso?v(-.43,-.65,0):v(0,-.45,0);this.controls.target.copy(c);
    const distance=this.torso?Math.min(26,Math.max(12,4.0/(Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*Math.max(.25,this.camera.aspect)))):(this.cutaway?6.48:7.2);
    if(view==='left')this.camera.position.copy(c).add(v(distance,1.1,.1));
    else if(view==='right')this.camera.position.copy(c).add(v(-distance,1.1,.1));
    else if(view==='posterior')this.camera.position.copy(c).add(v(0,1,-distance));
    else if(view==='superior')this.camera.position.copy(c).add(v(0,distance,.01));
    else this.camera.position.copy(c).add(this.torso?v(0,.7,distance):v(.9,.75,distance));
    this.controls.update();
  }
  update(time,bpm=72,options={}){
    const state=options.clinicalState||this.clinicalState||normalMotionState(time,bpm);this.lastState=state;this.electricalState=state;
    const f=state.timing||{},t=state.relativeTime,electrical=electricalSceneState(state,bpm);
    this.electricalLegend={...ELECTRICAL_VIEWS[this.electricalView],...electricalViewRange(this.electricalView,state)};
    for(const mat of this.shaderMaterials){
      const u=mat.userData.uniforms;
      u.uElectricalView.value=ELECTRICAL_VIEWS[this.electricalView].code;u.uRR.value=Math.max(.22,electrical.atrialRR);
      u.uPhase.value=t;u.uClock.value=state.recordTime??time;
      const atrial=state.atrialState;
      u.uAtrialPhase.value=atrial?.relativeTime??t;
      u.uAtrialAvailable.value=electrical.atrialAvailable?1:0;u.uVentricularAvailable.value=electrical.ventricularAvailable?1:0;
      u.uPStart.value=atrial?.pStart??f.pStart??-.16;u.uPEnd.value=atrial?.pEnd??f.pEnd??-.06;
      u.uAtrialRecovery.value=u.uPEnd.value+.10;
      u.uQStart.value=f.qrsStart??0;u.uQEnd.value=f.qrsEnd??.09;
      u.uTStart.value=f.tStart??.20;u.uTEnd.value=f.tEnd??.38;
      u.uActivation.value=this.activation?1:0;
      u.uAtrialFibrillation.value=state.atrialFibrillation?1:0;
      u.uAtrialFlutter.value=state.atrialFlutter?1:0;u.uFlutterPhase.value=Number.isFinite(state.flutterPhase)?state.flutterPhase:0;
      // These generic ventricular fields show an altered activation sequence,
      // never a localized patient focus or a heart rotating with the ECG axis.
      u.uVentricularMechanism.value=state.suppressNormalVentricularConduction?(state.rhythmKind==='vf'?3:state.rhythmKind==='torsades'?2:1):0;
      u.uVentricularDisorganization.value=Math.max(0,Math.min(1,state.ventricularDisorganization||0));
      u.uLVDelay.value=state.lvDelay||0;u.uRVDelay.value=state.rvDelay||0;
      u.uInjuryTerritory.value=({anterior:1,inferior:2,lateral:3,posterior:4})[state.injuryTerritory||state.injury?.territory]||0;u.uInjuryVisible.value=this.injuryVisible?1:0;
      u.uInjurySeverity.value=Math.max(0,Math.min(1,Number.isFinite(state.injury?.severity)?state.injury.severity:.70));
      u.uEctopic.value=(state.ectopic||(state.ventricularState?.escape&&(state.ventricularState?.escapeOrigin||state.escapeOrigin)==='ventricular'))?1:0;
    }
    // Geometry is recomputed from the immutable diastolic reference, never by
    // accumulating a scale transform. This path is shared by WebGL and software.
    const now=performance.now();let deformed=false;
    if(!this.lastDeformAt||now-this.lastDeformAt>=(this.software?38:25)){
      for(const m of this.motionMeshes)deformCardiacGeometry(m,state,{enabled:this.beating,gain:this.motionGain});
      enforceCardiacJunctions(this.junctionConstraints||[]);
      if(this.cutaway)for(const m of this.cutawayMotionMeshes)deformCardiacGeometry(m,state,{enabled:this.beating,gain:this.motionGain});
      this.lastDeformAt=now;deformed=true;
    }
    this.heartRoot.scale.set(1,1,1);this.heartRoot.rotation.set(0,0,0);this.heartRoot.position.set(0,0,0);
    if(this.septumMarker)this.septumMarker.position.set(...deformCardiacPoint(this.septumRest,state,{enabled:this.beating,gain:this.motionGain}));
    for(const label of this.motionLabels){const p=deformCardiacPoint(label.restPos.toArray(),state,{enabled:this.beating,gain:this.motionGain});label.pos.set(...p);}
    this.updateConduction(state,deformed);this.updatePotentialProbe(state);this.render();
    return state;
  }
}
const clamp01=x=>Math.max(0,Math.min(1,x));

// A lightweight, rotatable view of experimentally determined C-alpha coordinates.
// The deposited protein is a fixed structural snapshot; only the camera moves.
import {drugsForChannel,getPharmacologyDrug,loadDrugStructure} from './pharmacology.js';
import {drawBindingOverlay} from './pharmacology-view.js';
const COLORS={sodium:'#f8ba79',calcium:'#b8b9f4',potassium:'#9ce4cc'};
const COPY={
  sodium:{name:'Naᵥ1.5',ion:'Na⁺',short:'Fast sodium',heading:'A brief opening.<br>A rapid upstroke.',intro:'Four connected repeats of one protein surround a sodium-selective pore. Opening lets Na⁺ enter the working heart cell.',features:[['Selective pore','The narrow filter favors sodium.'],['Voltage sensors','Helical bundles around the pore couple voltage changes to its gate.'],['Fast inactivation','An intracellular IFM latch docks beside the gate and helps stop conduction.']],relation:'The teaching cartoon opens for the upstroke, then shows a side-docking inactivation latch.'},
  calcium:{name:'Caᵥ1.2',ion:'Ca²⁺',short:'L-type calcium',heading:'A calcium pathway<br>through the plateau.',intro:'Four connected repeats form the pore. Calcium entry supports the plateau and helps trigger calcium release inside the cell.',features:[['Selective pore','The filter strongly favors divalent calcium.'],['Inner gate','Pore-lining helices control access at the intracellular mouth.'],['Supporting proteins','Accessory subunits help regulate the pore-forming protein. Reveal them in the 3D view.']],relation:'The teaching cartoon illustrates calcium entry during the plateau. This experimental snapshot captures an inactivated channel.'},
  potassium:{name:'KCNQ1 + KCNE1',ion:'K⁺',short:'Delayed potassium',heading:'Four subunits.<br>One potassium pore.',intro:'Four separate KCNQ1 proteins surround the pore. With KCNE1, they carry Iₖₛ, a delayed rectifier current that contributes to recovery.',features:[['Potassium filter','A narrow selectivity filter favors potassium.'],['Four-part architecture','Four KCNQ1 subunits assemble around one shared pore.'],['Accessory partners','KCNE1 modifies gating. Calmodulin sits on the intracellular side.']],relation:'The main animation groups delayed K⁺ currents. This structure represents Iₖₛ; Iₖᵣ uses a different channel, hERG.'}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function shade(color,light){const c=rgb(color);return `rgb(${c.map(v=>Math.round(clamp(v*light,0,255))).join(',')})`;}
const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k),sub=(a,b)=>add(a,b,-1),unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
// Display interpolation follows the resolved Cα path, without bridging gaps.
// A ribbon is used only where the deposited structure annotates a helix.
function spline(a,b,c,d,t){return b.map((v,i)=>.5*((2*v)+(-a[i]+c[i])*t+(2*a[i]-5*v+4*c[i]-d[i])*t*t+(-a[i]+3*v-3*c[i]+d[i])*t*t*t));}
function ribbonSide(a,b,c,d,t){
  const tangent=b.map((v,i)=>(-a[i]+c[i])+2*(2*a[i]-5*v+4*c[i]-d[i])*t+3*(-a[i]+3*v-3*c[i]+d[i])*t*t);
  const curve=b.map((v,i)=>2*(2*a[i]-5*v+4*c[i]-d[i])+6*(-a[i]+3*v-3*c[i]+d[i])*t);
  return unit(cross(tangent,curve));
}
export const channelLensLaunch=`<button class="channel-lens-launch" id="channel-lens-open" aria-haspopup="dialog"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M8 8 15 4l7 4v14l-7 4-7-4Z M8 8l7 5 7-5M15 13v13M8 15l7 5 7-5"/><circle cx="8" cy="8" r="2"/><circle cx="22" cy="22" r="2"/></svg><span><strong>Explore the channels</strong><small>Cartoon → real protein structure</small></span><span aria-hidden="true">↗</span></button>`;

export function initializeChannelLens({pause,pharmacology,onSelect=()=>{}}={}){
  const dialog=document.createElement('dialog');dialog.id='channel-dialog';dialog.setAttribute('aria-labelledby','channel-dialog-title');
  dialog.innerHTML=`<div class="channel-dialog-head"><div><div class="eyebrow">A CLOSER LOOK · THE STRUCTURE LENS</div><h2 id="channel-dialog-title">The proteins <em>behind the current.</em></h2></div><button class="close-btn" id="channel-close" aria-label="Close channel structures">×</button></div>
    <div class="channel-tabs" role="tablist" aria-label="Ion-channel structures">${Object.entries(COPY).map(([id,c],i)=>`<button class="channel-tab" role="tab" id="channel-tab-${id}" aria-controls="channel-lens-panel" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-channel="${id}"><span class="channel-tab-ion">${c.ion}</span><span><strong>${c.short}</strong><small>${c.name}</small></span></button>`).join('')}</div>
    <div id="channel-lens-panel" role="tabpanel" aria-labelledby="channel-tab-sodium"><div class="channel-lens-layout"><div class="channel-structure-stage"><div class="channel-structure-header"><span>EXPERIMENTAL PROTEIN STRUCTURE</span><a id="channel-pdb" target="_blank" rel="noopener">PDB ↗</a></div><canvas id="channel-structure-canvas" tabindex="0" role="img" aria-describedby="channel-orbit-help"></canvas><div id="channel-structure-message" class="channel-structure-message">Loading the experimental structure…</div><div class="channel-structure-caption"><strong id="channel-structure-method">Cryo-EM</strong><span id="channel-orbit-help">Drag to rotate · scroll to zoom</span></div><div class="channel-structure-controls"><button class="channel-view-btn" data-channel-view="side" aria-pressed="true">Side view</button><button class="channel-view-btn" data-channel-view="pore" aria-pressed="false">End-on view</button><div class="channel-zoom-group"><button class="channel-view-btn" id="channel-zoom-in" aria-label="Zoom into protein">+</button><button class="channel-view-btn" id="channel-zoom-out" aria-label="Zoom out of protein">−</button><button class="channel-view-btn" id="channel-reset" aria-label="Reset protein view">↺</button></div></div><label class="channel-accessory" id="channel-accessory-label"><span>Accessory proteins <small id="channel-accessory-count"></small></span><input type="checkbox" id="channel-accessory" aria-label="Show accessory proteins"></label></div><div class="channel-story" id="channel-story"></div></div><div class="channel-lens-foot"><p id="channel-relation"></p><details class="channel-source-details"><summary>Structure provenance & what is simplified</summary><div id="channel-source-copy"></div></details></div></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id),canvas=$('channel-structure-canvas'),ctx=canvas.getContext('2d');
  let selected='sodium',dataset=null,loading=null,record=null,geometry=[],bounds=null,yaw=.35,pitch=.13,zoom=1,accessory=false,dirty=true,frameId=null,pointer=null,view='side',activeDrug=null,drugRequest=0,bindingFocus=false;
  const focusBinding=document.createElement('button');focusBinding.className='channel-view-btn channel-focus-binding';focusBinding.id='channel-focus-site';focusBinding.textContent='Binding site';focusBinding.hidden=true;focusBinding.setAttribute('aria-pressed','false');dialog.querySelector('.channel-structure-controls').insertBefore(focusBinding,dialog.querySelector('.channel-zoom-group'));
  const mark=()=>{dirty=true;if(dialog.open&&!frameId)frameId=requestAnimationFrame(draw);};
  function reset(nextView='side'){view=nextView;yaw=nextView==='pore'?0:.35;pitch=nextView==='pore'?1.48:.13;zoom=1;bindingFocus=false;focusBinding.setAttribute('aria-pressed','false');dialog.querySelectorAll('[data-channel-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.channelView===view)));mark();}
  function load(){
    if(dataset)return Promise.resolve(dataset);if(loading)return loading;
    loading=fetch(new URL('./data/channel-structures.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Structure download failed');return r.json();}).then(data=>{if(data.schemaVersion!==1||data.structures?.length!==3)throw Error('Invalid structure data');dataset=data;return data;}).catch(error=>{loading=null;throw error;});return loading;
  }
  function compile(){
    geometry=[];const points=[];if(!record)return;
    for(const chain of record.chains){
      if(chain.role==='accessory'&&!accessory)continue;
      const color=chain.role==='accessory'?'#718d9b':chain.color||COLORS[selected];
      for(const segment of chain.segments){
        const a=segment.positions,secondary=segment.secondary||'',backbone=[];
        for(let i=0;i<a.length;i+=3){const p=[a[i],a[i+1],a[i+2]];points.push(p);backbone.push(p);}
        for(let i=0;i<backbone.length-1;i++){
          const controls=[backbone[Math.max(0,i-1)],backbone[i],backbone[i+1],backbone[Math.min(backbone.length-1,i+2)]],helix=secondary[i]==='H'&&secondary[i+1]==='H';
          for(let j=0;j<4;j++){
            const t=j/4,u=(j+1)/4,p=spline(...controls,t),q=spline(...controls,u),base={a:p,b:q,accessory:chain.role==='accessory',color};
            if(helix){
              const n=ribbonSide(...controls,t),m=ribbonSide(...controls,u),w=1.12;
              geometry.push({...base,kind:'ribbon',vertices:[add(p,n,w),add(q,m,w),add(q,m,-w),add(p,n,-w)],normal:unit(cross(sub(q,p),add(n,m)))});
            }else geometry.push({...base,kind:'loop'});
          }
        }
      }
    }
    const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
    const center=min.map((v,k)=>(v+max[k])/2),radius=Math.max(...points.map(p=>Math.hypot(...p.map((v,k)=>v-center[k]))));
    bounds={center,radius};mark();
  }
  function updateCopy(){
    const copy=COPY[selected];dialog.style.setProperty('--channel-color',COLORS[selected]);
    dialog.querySelectorAll('[data-channel]').forEach(b=>{const active=b.dataset.channel===selected;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    $('channel-lens-panel').setAttribute('aria-labelledby','channel-tab-'+selected);
    const plain=`<span class="channel-story-overline">${copy.name} · HUMAN CHANNEL</span><h3>${copy.heading}</h3><p class="channel-story-intro">${copy.intro}</p><div class="channel-feature-list">${copy.features.map(([title,body],i)=>`<div class="channel-feature"><span class="channel-feature-number">${String(i+1).padStart(2,'0')}</span><div><strong>${title}</strong><p>${body}</p></div></div>`).join('')}</div><div class="channel-captured-state"><span>STATE IN THIS EXPERIMENTAL SNAPSHOT</span><strong>${escape(record?.state||'Loading structure…')}</strong><p>Rotate to explore its shape. The molecular coordinates stay fixed; gating is illustrated in the main cartoon.</p></div>`;
    const drugStory=activeDrug?`<span class="channel-story-overline">${escape(record?.protein||activeDrug.targets[0])}</span><div class="channel-drug-summary"><h4>${escape(activeDrug.name)} at its target.</h4><span class="channel-drug-evidence">${escape(record?.evidence||activeDrug.bindingEvidence)}</span><p>${escape(activeDrug.summary)}</p><p>${escape(record?.structureNote||'Loading structural evidence…')}</p><div class="channel-captured-state"><span>THE CONSEQUENCE FOR ONE CELL</span><p>${escape(activeDrug.apEffect)}</p></div></div>`:'';
    const choices=drugsForChannel(selected);
    $('channel-story').innerHTML=(activeDrug?drugStory:plain)+`<div class="channel-medicine-section"><label for="channel-medicine">${selected==='potassium'?'REPOLARIZATION MEDICINES':'MEDICINES AT THIS TARGET'}</label><select id="channel-medicine"><option value="">Channel alone</option>${choices.map(d=>`<option value="${d.id}" ${d.id===activeDrug?.id?'selected':''}>${escape(d.name)} · ${escape(d.class)}</option>`).join('')}</select>${selected==='potassium'?'<p class="channel-medicine-note">Iₖᵣ medicines switch the structure to hERG. KCNQ1 above carries Iₖₛ.</p>':''}<button class="channel-pharm-link" id="channel-pharm-compare"><span>${activeDrug?'Compare action potentials':'Explore pharmacology'}</span><span aria-hidden="true">↗</span></button></div>`;
    $('channel-medicine').onchange=e=>selectMedicine(e.target.value);
    $('channel-pharm-compare').onclick=()=>pharmacology?.open({drug:activeDrug?.id||choices[0].id,channel:selected});
    $('channel-relation').innerHTML=activeDrug?`<strong>From binding to voltage.</strong> ${escape(activeDrug.apEffect)} The comparison window separates nodal and ventricular cell responses.`:`<strong>Back to the membrane.</strong> ${copy.relation}`;
    canvas.setAttribute('aria-label',`${activeDrug?activeDrug.name+' binding on '+(record?.protein||'a protein structure'):copy.name+' experimental protein backbone'}. Drag or use arrow keys to rotate; plus and minus zoom; Home resets.`);
    focusBinding.hidden=!activeDrug;focusBinding.disabled=!record;
    if(!record){$('channel-source-copy').textContent='Loading source information…';return;}
    $('channel-pdb').href=record.sourceUrl;$('channel-pdb').textContent=`PDB ${record.pdbId} ↗`;
    $('channel-structure-method').textContent=`Cryo-EM · ${Number(record.resolution).toFixed(2)} Å`;
    const other=record.chains.filter(c=>c.role==='accessory');$('channel-accessory-label').hidden=!other.length;$('channel-accessory-count').textContent=other.length?`+${other.length} chains`:'';
    const pose=record.orientation?.note||record.orientation?.description||'The camera pose is chosen to make the protein architecture readable.';
    $('channel-source-copy').innerHTML=`<p>${escape(record.title)}. Experimental coordinates from the RCSB Protein Data Bank, ${escape(record.method)}, ${escape(record.resolution)} Å.</p><p>${escape(record.caveat)} Ribbons follow deposited helix annotations and a smooth interpolation through resolved Cα positions; other regions appear as thin backbone traces. Gaps remain gaps. ${activeDrug?(record.actualLigand?'The selected medicine is shown using its deposited heavy-atom coordinates in the same rigid coordinate frame as the protein.':'A broad halo marks a supported binding region; no drug pose is asserted.'):'Unresolved residues, side chains, water, and small molecules are omitted.'} Accessory protein chains can be revealed separately.</p><p>${escape(pose)}</p><div class="channel-source-links"><a href="${escape(record.sourceUrl)}" target="_blank" rel="noopener">RCSB structure & coordinates ↗</a><a href="${escape(record.citation?.url||record.sourceUrl)}" target="_blank" rel="noopener">${activeDrug?'Supporting evidence':'Original structure study'} ↗</a></div>`;
  }
  async function selectMedicine(id){
    if(!id){await select(selected);return;}
    if(!drugsForChannel(selected).some(d=>d.id===id))return;
    const token=++drugRequest;activeDrug=getPharmacologyDrug(id);record=null;geometry=[];bounds=null;accessory=false;$('channel-accessory').checked=false;reset();updateCopy();$('channel-structure-message').hidden=false;$('channel-structure-message').textContent='Loading the medicine-bound structure…';mark();
    try{const next=await loadDrugStructure(id);if(token!==drugRequest)return;record=next;updateCopy();compile();$('channel-structure-message').hidden=true;mark();}
    catch(error){if(token!==drugRequest)return;$('channel-structure-message').hidden=false;$('channel-structure-message').textContent='This structure could not load. Choose Channel alone or another medicine to retry.';}
  }
  async function select(id){
    const token=++drugRequest;activeDrug=null;selected=COPY[id]?id:'sodium';record=dataset?.structures.find(r=>r.id===selected)||null;accessory=false;$('channel-accessory').checked=false;onSelect(selected);reset();updateCopy();compile();
    $('channel-structure-message').hidden=!!record;
    if(record)return;
    try{await load();if(token!==drugRequest)return;record=dataset.structures.find(r=>r.id===selected);updateCopy();compile();$('channel-structure-message').hidden=true;mark();}
    catch(error){if(token!==drugRequest)return;$('channel-structure-message').hidden=false;$('channel-structure-message').textContent='The structure could not load. Close and reopen to retry.';}
  }
  function draw(){
    frameId=null;if(!dialog.open||!dirty)return;dirty=false;
    const rect=canvas.getBoundingClientRect(),W=rect.width,H=rect.height,dpr=Math.min(devicePixelRatio||1,2.5);if(!W||!H)return;
    if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    const ambient=ctx.createRadialGradient(W*.5,H*.45,5,W*.5,H*.45,W*.47);ambient.addColorStop(0,COLORS[selected]+'17');ambient.addColorStop(1,COLORS[selected]+'00');ctx.fillStyle=ambient;ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#87b9ab0b';ctx.lineWidth=.7;
    for(let i=0;i<7;i++){const x=W*.12+i*W*.13;ctx.beginPath();ctx.moveTo(x,22);ctx.lineTo(x,H-20);ctx.stroke();}for(let i=0;i<5;i++){const y=H*.16+i*H*.17;ctx.beginPath();ctx.moveTo(26,y);ctx.lineTo(W-26,y);ctx.stroke();}
    if(!record||!bounds||!geometry.length)return;
    let {center,radius}=bounds;if(bindingFocus&&(record.ligand?.center||record.region?.center)){center=record.ligand?.center||record.region?.center;radius=27;}
    const scale=Math.min(W*.44,H*.43)/Math.max(1,radius)*zoom,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    function project(p){const x=p[0]-center[0],y=p[1]-center[1],z=p[2]-center[2],xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp,depth=y*sp+zz*cp;return [W/2+xx*scale,H*.49-yy*scale,depth];}
    const segments=geometry.map(g=>({...g,p:project(g.a),q:project(g.b)}));segments.sort((a,b)=>(a.p[2]+a.q[2])-(b.p[2]+b.q[2]));
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const g of segments){
      const depth=clamp(((g.p[2]+g.q[2])*.5/radius+1)/2,0,1);
      ctx.globalAlpha=g.accessory?.65:1;
      if(g.kind==='ribbon'){
        const face=g.vertices.map(project),n=g.normal,nx=n[0]*cy+n[2]*sy,nz=n[2]*cy-n[0]*sy,ny=n[1]*cp-nz*sp,nzz=n[1]*sp+nz*cp;
        const light=Math.abs(nx*-.32+ny*.47+nzz*.82),color=shade(g.color,.38+.37*depth+.42*light);
        ctx.beginPath();ctx.moveTo(face[0][0],face[0][1]);for(const p of face.slice(1))ctx.lineTo(p[0],p[1]);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=.45;ctx.stroke();
        if(light>.6){ctx.beginPath();ctx.moveTo(face[0][0],face[0][1]);ctx.lineTo(face[1][0],face[1][1]);ctx.strokeStyle=shade(g.color,.8+.36*light);ctx.lineWidth=.55;ctx.stroke();}
      }else{
        const width=clamp(scale*.48,.8,2.5);
        ctx.beginPath();ctx.moveTo(g.p[0],g.p[1]);ctx.lineTo(g.q[0],g.q[1]);ctx.strokeStyle='#061921';ctx.lineWidth=width+.7;ctx.stroke();
        ctx.strokeStyle=shade(g.color,.4+.48*depth);ctx.lineWidth=width;ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
    if(activeDrug)drawBindingOverlay(ctx,record,project,scale,W,H);
    // A physical scale from the coordinate units, independent of zoom.
    const angstroms=20,length=angstroms*scale;if(length<W*.35){ctx.strokeStyle='#89aba67a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(22,H-28);ctx.lineTo(22+length,H-28);ctx.moveTo(22,H-31);ctx.lineTo(22,H-25);ctx.moveTo(22+length,H-31);ctx.lineTo(22+length,H-25);ctx.stroke();ctx.font='9px system-ui,sans-serif';ctx.fillStyle='#8daaa3';ctx.textAlign='left';ctx.fillText('2 nm',22,H-12);}
  }
  const observer=new ResizeObserver(mark);observer.observe(canvas);
  focusBinding.onclick=()=>{bindingFocus=!bindingFocus;zoom=1;focusBinding.setAttribute('aria-pressed',String(bindingFocus));mark();};
  dialog.querySelectorAll('[data-channel]').forEach(b=>b.onclick=()=>select(b.dataset.channel));
  dialog.querySelector('.channel-tabs').addEventListener('keydown',e=>{const ids=Object.keys(COPY),i=ids.indexOf(selected);let next;if(e.key==='ArrowRight')next=ids[(i+1)%3];else if(e.key==='ArrowLeft')next=ids[(i+2)%3];else if(e.key==='Home')next=ids[0];else if(e.key==='End')next=ids[2];else return;e.preventDefault();select(next);$('channel-tab-'+next).focus();});
  dialog.querySelectorAll('[data-channel-view]').forEach(b=>b.onclick=()=>reset(b.dataset.channelView));
  $('channel-accessory').onchange=e=>{accessory=e.target.checked;compile();};$('channel-zoom-in').onclick=()=>{zoom=clamp(zoom*1.18,.6,2.3);mark();};$('channel-zoom-out').onclick=()=>{zoom=clamp(zoom/1.18,.6,2.3);mark();};$('channel-reset').onclick=()=>reset();
  $('channel-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{pointer=null;onSelect(null);if(frameId)cancelAnimationFrame(frameId);frameId=null;});
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;yaw+=(e.clientX-pointer.x)*.009;pitch=clamp(pitch+(e.clientY-pointer.y)*.009,-Math.PI/2,Math.PI/2);pointer.x=e.clientX;pointer.y=e.clientY;view=null;dialog.querySelectorAll('[data-channel-view]').forEach(b=>b.setAttribute('aria-pressed','false'));mark();});
  const release=e=>{if(pointer?.id===e.pointerId){pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',()=>pointer=null);
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.6,2.3);mark();},{passive:false});
  canvas.addEventListener('keydown',e=>{const step=e.shiftKey?.25:.1;if(e.key==='ArrowLeft')yaw-=step;else if(e.key==='ArrowRight')yaw+=step;else if(e.key==='ArrowUp')pitch=clamp(pitch-step,-Math.PI/2,Math.PI/2);else if(e.key==='ArrowDown')pitch=clamp(pitch+step,-Math.PI/2,Math.PI/2);else if(e.key==='+'||e.key==='=')zoom=clamp(zoom*1.15,.6,2.3);else if(e.key==='-')zoom=clamp(zoom/1.15,.6,2.3);else if(e.key==='Home')reset();else return;e.preventDefault();e.stopPropagation();mark();});
  return {open(id='sodium'){pause?.();if(!dialog.open)dialog.showModal();select(id);mark();},isOpen:()=>dialog.open,close:()=>dialog.close()};
}

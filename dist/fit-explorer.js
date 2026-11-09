import {HeartSurface} from './fit-surface.js';
import {FittedField,loadFitBase} from './fit-model.js';
import {FitChart} from './fit-chart.js';
import {FitAPPanel,AP_SAMPLE_COLORS} from './fit-ap-panel.js';
import {enhanceInfoPanels,closeInfoPanels} from './ui-help.js';

export const FITTED_RECORDS=['ptbxl-00303','ptbxl-02078','ptbxl-03155','ptbxl-00618','ptbxl-01166','ptbxl-02277','ptbxl-00818','ptbxl-00218','ptbxl-01222','ptbxl-00959','ptbxl-01451','ptbxl-02417','ptbxl-00789','ptbxl-06938','mitdb-231-mobitz2','acs-00004','acs-18206','ludb-021','mitdb-202-af-rvr','vfdb-421-vt','mitdb-222-flutter','mitdb-209-svt','vfdb-422-vf','sddb-47-torsades'];
const ORDER=['I','aVR','V1','V4','II','aVL','V2','V5','III','aVF','V3','V6'];
const INDEPENDENT=['I','II','V1','V2','V3','V4','V5','V6'];
const SPEEDS=[.03,.1,.3,1],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sign=(n,d=0)=>(n>=0?'+':'−')+Math.abs(n).toFixed(d);
const setText=(element,text)=>{if(element&&element.textContent!==text)element.textContent=text;};
const cache=new Map();
async function getJSON(url){const response=await fetch(url);if(!response.ok)throw Error('The fitted recording could not load.');return response.json();}
function loadCase(id){
  if(!cache.has(id))cache.set(id,getJSON(new URL(`./data/pathology-fits/cases/${id}.json`,import.meta.url)).catch(error=>{cache.delete(id);throw error;}));
  return cache.get(id);
}
function metric(observed,predicted,time,window=[time[0],time.at(-1)],leads=INDEPENDENT){
  let n=0,aa=0,bb=0,ab=0,sa=0,sb=0,se=0;
  for(const lead of leads){const a=observed?.[lead],b=predicted?.[lead];if(!a||!b)continue;for(let i=0;i<time.length;i++)if(time[i]>=window[0]&&time[i]<=window[1]&&Number.isFinite(a[i])&&Number.isFinite(b[i])){const x=a[i],y=b[i];n++;sa+=x;sb+=y;aa+=x*x;bb+=y*y;ab+=x*y;se+=(x-y)**2;}}
  const denominator=Math.sqrt(Math.max(0,n*aa-sa*sa)*Math.max(0,n*bb-sb*sb));
  return {rmse:n?Math.sqrt(se/n):NaN,correlation:denominator?(n*ab-sa*sb)/denominator:NaN};
}
const number=(n,d=3)=>Number.isFinite(n)?n.toFixed(d):'—';
function posedHeart(base,pose){
  if(!pose?.rotationMatrix)return base;
  const R=pose.rotationMatrix,c=pose.rotationCenterMm||[0,0,0],t=pose.translationMm||[0,0,0];
  const multiply=v=>[0,1,2].map(i=>R[i*3]*v[0]+R[i*3+1]*v[1]+R[i*3+2]*v[2]);
  const rc=multiply(c),shift=c.map((v,i)=>v+t[i]-rc[i]),source=base.geometry;
  const positions=new Float32Array(source.positions.length),normals=new Float32Array(source.normals.length);
  for(let i=0;i<positions.length;i+=3){const p=multiply(source.positions.slice(i,i+3)),n=multiply(source.normals.slice(i,i+3));for(let k=0;k<3;k++){positions[i+k]=p[k]+shift[k];normals[i+k]=n[k];}}
  const cutNormal=multiply(source.cutNormal),cutOffset=source.cutOffset+cutNormal.reduce((s,n,i)=>s+n*shift[i],0);
  return {...base,geometry:{...source,positions,normals,cutNormal,cutOffset}};
}
function releaseSurface(surface){
  const gl=surface?.gl;if(!gl)return;
  for(const b of surface.batches||[])for(const key of ['position','normal','value','index'])gl.deleteBuffer(b[key]);
  gl.deleteProgram(surface.program);gl.getExtension('WEBGL_lose_context')?.loseContext();
}

export class FitExplorer {
  constructor(host,options={}){
    this.host=host;this.options=options;this.alive=true;this.charts=[];this.speed=options.speed||.03;
    this.running=!matchMedia('(prefers-reduced-motion: reduce)').matches;this.view='voltage';this.cutaway=true;this.leadAxis=true;this.time=-250;
    this.yaw=.25;this.pitch=.55;this.zoom=1;this.pan=[0,0];this.node=null;this.dirty=true;this.pointers=new Map();
    host.innerHTML='<div class="fit-loading"><span class="fit-loading-orbit"></span><h3>Loading the fitted source model</h3><p>Measured beat, spatial voltage field, and calculated leads.</p></div>';
    this.load();
  }
  $(id){return this.host.querySelector('[data-fit="'+id+'"]');}
  async load(){
    try{
      const [base,fit]=await Promise.all([loadFitBase(),loadCase(this.options.recordId)]);if(!this.alive)return;
      this.base=base;this.fit=fit;
      const recorded=Object.keys(fit.ecg.observed||{}), available=fit.availableLeads||recorded;
      this.leads=[...ORDER.filter(l=>available.includes(l)),...available.filter(l=>!ORDER.includes(l))].filter(l=>recorded.includes(l));
      this.independentLeads=(fit.independentLeads||fit.fitLeads||(this.leads.length===12?INDEPENDENT:this.leads)).filter(l=>this.leads.includes(l));
      if(!this.independentLeads.length)this.independentLeads=[...this.leads];
      this.fullWindow=fit.timeReference==='recording';
      this.timeLabel=this.fullWindow?'ms in recording':'ms from R anchor';
      this.hasHeldOut=!!fit.ecg.heldOut&&Object.values(fit.ecg.heldOut).some(a=>Array.isArray(a)&&a.some(Number.isFinite));
      const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];for(let i=0;i<base.geometry.positions.length;i++){const k=i%3,v=base.geometry.positions[i];bounds[0][k]=Math.min(bounds[0][k],v);bounds[1][k]=Math.max(bounds[1][k],v);}
      this.worldCenter=bounds[0].map((v,k)=>(v+bounds[1][k])/2);this.worldRange=Math.max(...bounds[0].map((v,k)=>bounds[1][k]-v))*1.44;this.timeMs=fit.timeMs||fit.ecg.timeMs;this.start=this.timeMs[0];this.end=this.timeMs.at(-1);this.time=this.start;
      this.approaches=fit.approaches||[];this.selected=fit.selectedApproachId||fit.selectedApproach||this.approaches.at(-1)?.id;
      this.approach=this.approaches.find(a=>a.id===this.selected)||null;
      this.field=new FittedField(base,fit,this.approach);this.updateSurface();
      this.lead=this.options.lead||fit.representativeLead||({'ptbxl-03155':'V1','acs-00004':'V2'}[fit.recordId||this.options.recordId])||'II';
      if(!this.leads.includes(this.lead))this.lead=this.leads.includes(fit.representativeLead)?fit.representativeLead:this.leads[0];
      this.observation='observed';this.target=fit.target||fit.targetMetadata||{};this.quality=this.target.quality||fit.provenance?.quality||{};
      this.window=this.target.analysisWindowMs||fit.analysisWindowMs||[this.start,this.end];
      this.render();this.bind();this.updateApproach();this.last=performance.now();this.tick(this.last);
    }catch(error){
      if(!this.alive)return;console.error(error);
      this.host.innerHTML=`<div class="fit-loading"><h3>The fitted model is unavailable</h3><p>${escape(error.message)} The original recording remains available.</p><button class="button" data-fit="retry">Retry</button><button class="button soft" data-fit="original">Open original recording</button></div>`;
      this.$('retry').onclick=()=>this.load();this.$('original').onclick=()=>this.options.onOriginal?.();
    }
  }
  render(){
    const q=this.quality,fit=this.fit,rbbb=this.options.recordId==='ptbxl-03155',name=fit.title||(rbbb?'Delayed recruitment of the right ventricle':this.options.recordId==='acs-00004'?'Regional voltage differences during ischemia':this.options.title||'A fitted propagation hypothesis');
    const accepted=q.acceptedBeatCount,heldout=q.heldoutBeatCount??q.heldOutBeatCount,train=q.trainBeatCount;
    const description=fit.description||(this.options.recordId!=='ptbxl-03155'&&this.options.recordId!=='acs-00004'?'Compare a physiology-constrained spatial source model with the actual recorded signal, and inspect where the model succeeds and where it does not.':rbbb?'Remove right-sided rapid delivery, let activation arrive through the remaining myocardium, and compare the resulting twelve leads with the recorded RBBB.':'Change the local action potential in a smooth injury region, then calculate the lead voltages. The ST shift emerges from the spatial field and its reference baseline.');
    this.host.innerHTML=`<section class="fit-explorer" aria-label="Fitted electrical propagation">
      <header class="fit-intro fit-intro-compact"><h3 class="fit-status-badge">Fitted source hypothesis</h3><div class="fit-intro-meta"><div data-info-panel="About this fitted model" data-info-label="Model details"><p><strong>${escape(name)}</strong> · ${this.fullWindow?'Recorded sequence':'Recorded beat'}</p><p>${escape(description)}</p></div><div class="fit-limits-info" data-fit="physiology-info" hidden><div data-info-panel="Timing &amp; fit limits" data-info-label="Timing &amp; fit limits"><p data-fit="physiology-note"></p></div></div></div></header>
      <div class="fit-approach-bar"><label for="fit-approach">Model experiment <select id="fit-approach" class="select-field" data-fit="approach">${this.approaches.filter(a=>a.field||a.id===this.selected).map(a=>`<option value="${escape(a.id)}" ${a.id===this.selected?'selected':''}>${escape(a.label||a.id)}</option>`).join('')||'<option value="best">Best fitted model</option>'}</select></label><div data-info-panel="Model experiment" data-info-label="Experiment notes"><p data-fit="approach-note">The displayed field and orange ECG use the same fitted source parameters.</p></div></div>
      <div class="fit-workspace">
        <section class="fit-source-column">
          <div class="fit-model-stage"><div class="fit-stage-heading"><span><i></i>Native CT source mesh</span><div><button data-fit="zoom-in" aria-label="Zoom fitted heart in">+</button><button data-fit="zoom-out" aria-label="Zoom fitted heart out">−</button><button data-fit="reset-view" aria-label="Reset fitted heart view">↺</button></div></div>
          <canvas data-fit="heart" tabindex="0" role="img" aria-label="Interactive fitted electrical source heart. Drag to rotate, right-drag to pan, scroll to zoom, or click the myocardium to sample voltage."></canvas>
          <div class="fit-stage-corner"><strong data-fit="clock">−250 ms</strong><span>${this.fullWindow?'time within the recorded excerpt':'relative to the recorded R anchor'}</span></div><div class="fit-stage-hint">Drag to rotate <span>Right-drag to pan</span> Scroll to zoom</div></div>
          <div class="fit-model-options"><label><input type="checkbox" data-fit="cutaway" checked> Cutaway</label><label><input type="checkbox" data-fit="axis" checked> Lead direction</label><label class="fit-color-label">Color <select class="select-field" data-fit="view" aria-label="Fitted electrical field display"><option value="voltage">Membrane voltage</option><option value="fronts">Moving fronts</option><option value="activation">Activation time</option><option value="recovery">Recovery time</option><option value="apd">AP duration</option>${rbbb?'':'<option value="injury">Injury region</option>'}</select></label></div>
          <div class="fit-field-scale"><div></div><p><span data-fit="scale-low">−85 mV</span><b data-fit="scale-name">Modeled Vₘ · inside − outside</b><span data-fit="scale-high">+25 mV</span></p></div><p class="fit-front-note" data-fit="front-note" hidden>Cyan marks falling membrane voltage, which can begin during the plateau. The recovery-time map separately marks 90% recovery.</p>
          <div class="fit-probe" data-fit="probe"><span class="fit-probe-icon">⊙</span><div><strong>Sample the myocardium</strong><p>Click a surface or cut face to inspect its local voltage and timing.</p></div></div>
        </section>
        <section class="fit-signal-column"><div class="fit-trace-heading"><div><div class="section-label">Observed ↔ calculated</div><h3>Recorded and fitted ECG</h3></div><label>Lead <select class="select-field" data-fit="lead" aria-label="Fitted comparison ECG lead">${this.leads.map(l=>`<option value="${l}" ${l===this.lead?'selected':''}>${l}</option>`).join('')}</select></label></div>
          <div class="fit-trace-key"><span><i class="fit-recorded-key"></i><span data-fit="recorded-label">Recorded median</span></span><span><i class="fit-predicted-key"></i>Source simulation</span><span data-fit="spread-label"><i class="fit-spread-key"></i>Beat IQR</span></div>
          <div class="fit-primary-chart"><canvas data-fit="main-chart"></canvas></div>
          <div class="fit-evidence-controls" ${this.fullWindow?'hidden':''}><label for="fit-observation">Compare with <select id="fit-observation" class="select-field" data-fit="observation"><option value="observed">All accepted beats · median</option><option value="train">Training beats only</option><option value="heldOut">Held-out beats only</option></select></label><span>Click the tracing to seek · playback continues</span></div>
          <div class="fit-scorecards"><div><span>Selected lead RMSE</span><strong data-fit="lead-rmse">—</strong><small>mV · lower is closer</small></div><div><span>Selected lead correlation</span><strong data-fit="lead-correlation">—</strong><small>shape agreement</small></div><div><span>${this.independentLeads.length} fitted channels</span><strong data-fit="all-rmse">—</strong><small>pooled RMSE · mV</small></div></div>
          <div class="fit-instant"><span class="section-label">At this instant</span><h3 data-fit="phase-title">Before ventricular activation</h3><p data-fit="phase-description">Follow the source field and the recorded beat on one common clock.</p></div>
        </section>
      </div>
      <div class="fit-transport"><button class="button primary" data-fit="play">${this.running?'Ⅱ Pause':'▶ Play'}</button><input type="range" data-fit="time" min="${this.start}" max="${this.end}" step="1" value="${this.time}" aria-label="${this.fullWindow?'Time in fitted recording':'Time in fitted recorded beat'}"><span data-fit="time-label">−250 ms</span><label>Playback <select class="select-field" data-fit="speed" aria-label="Fitted simulation playback speed">${SPEEDS.map(v=>`<option value="${v}" ${this.speed===v?'selected':''}>${v}×</option>`).join('')}</select></label></div>
      <div class="fit-phase-jumps" data-fit="jumps"></div>
      <div data-info-panel="Heart model and lead direction" data-info-label="About the heart model"><p class="fit-source-caption">The CT mesh shows the electrical sources used by the forward calculation; its shape is held fixed to make propagation legible. The original-recording tab retains the separate contracting anatomical model. The lead arrow shows a direction, not the full spatial sensitivity of the lead.</p></div>
      <section class="fit-local-potentials" data-fit="ap-panel" aria-label="Local action potential comparison"></section>
      <section class="fit-all-leads"><div class="fit-section-heading"><div><div class="section-label">Check every perspective</div><h3>${this.leads.length===12?'Twelve leads':this.leads.length+' recorded channels'}. The same source field.</h3></div><p>Select any panel to enlarge it above.</p></div><div class="fit-lead-grid">${this.leads.map(l=>`<div class="fit-lead-cell ${l===this.lead?'is-selected':''}" data-fit-lead="${l}"><canvas data-fit="mini-${l}" aria-label="Compare fitted lead ${l}"></canvas><span data-fit="error-${l}"></span></div>`).join('')}</div><div data-info-panel="Lead display and channel geometry" data-info-label="Lead display"><p class="fit-small-note">All panels show the same ${this.start} to ${this.end} ms window; each uses its own labeled lead and automatic voltage range. ${this.independentLeads.length===8&&this.leads.length===12?'I, II and V1–V6 are the eight independent channels used for fitting. The remaining modeled limb leads follow their voltage identities.':escape(this.fit.leadGeometryNote||'Only the source recording’s available channels are shown. Exact modified or unspecified electrode geometry is not available; those channels have no anatomical lead-axis arrow.')}</p></div></section>
      <section class="fit-experiment-section"><div class="fit-section-heading"><div><div class="section-label">What improved, and what did not</div><h3>Compare the experiments</h3></div><span class="fit-holdout-label">${this.fullWindow?'Recorded excerpt · temporal split':Number.isFinite(train)?train+' training + '+heldout+' held-out beats':'Training and held-out beats'}</span></div><div class="table-scroll"><table class="fit-experiment-table"><thead><tr><th>Source model</th><th>Training RMSE</th><th>Held-out RMSE</th><th>Held-out pooled correlation</th></tr></thead><tbody data-fit="experiments"></tbody></table></div><div class="fit-phase-errors" data-fit="phase-errors"></div><div data-info-panel="Fit error and validation" data-info-label="How to read the scores"><p class="fit-small-note">Errors are unweighted mV across ${this.independentLeads.length} fitted channels in the ${this.window[0]} to ${this.window[1]} ms analysis window. ${this.fullWindow?'Held-out time samples':'Held-out beats'} test repeatability within this recording; they do not validate the inferred anatomy or test a different patient. The difference between model and recording remains visible in the residual trace.</p></div></section>
      <section class="fit-evidence-note" data-info-panel="Recorded data and model limits" data-info-label="Recording and model limits"><div><span class="section-label">What was actually recorded</span><h3>${this.fullWindow?'The recorded sequence. Timing preserved.':(Number.isFinite(accepted)?accepted+' accepted beats':'An aligned beat ensemble')+'. One robust median.'}</h3><p data-fit="ensemble-copy">All source channels are in calibrated millivolts. Beats share a common R anchor; P, QRS and T are not separately stretched to force agreement.</p><div class="fit-quality-numbers" data-fit="quality"></div></div><div><span class="section-label">What remains a hypothesis</span><h3>A fit is a possible mechanism.</h3><p>Different source patterns, anatomy and torso properties can produce similar surface ECGs. These patients do not have matching CT anatomy or invasive activation maps in this dataset. A close waveform fit cannot establish the true block site, infarct boundary, or local action potential.</p></div></section>
      <details class="fit-methods"><summary>Model parameters, numerical checks, and reproducible methods</summary><div class="fit-methods-content"><p>${escape(this.fit.methodSummary||'The simulation combines spatial activation times, regional action-potential waveforms, and a torso lead-field operator. The action potential is evaluated at the source sites before interpolation onto the displayed surface. The ECGs are calculated from the spatial source field, with one consistent electrode reference and baseline convention.')}</p><p>Changing a source parameter changes the forward calculation. No arbitrary ST offset or independent per-lead waveform correction is added to make the orange trace agree. Pose adjustments, when present, are assumptions about the reference heart inside the torso; rotating the camera does not change the ECG.</p><pre data-fit="parameters"></pre><div data-fit="limitations"></div><div class="fit-method-links">${(this.fit.reconstruction||this.fit.reconstructed)?'<a href="./data/pathology-fits/REGENERATED_FIT_METHODS.md" target="_blank" rel="noopener">Regenerated fits: methods and limits ↗</a>':''}<a href="./data/pathology-fits/PHYSIOLOGY_REFINEMENT.md" target="_blank" rel="noopener">Action-potential shape experiments ↗</a><a href="./data/pathology-fits/CONDUCTION_CONTINUITY.md" target="_blank" rel="noopener">Conduction continuity audit ↗</a><a href="./data/pathology-fits/FORWARD_FIT_METHODS.md" target="_blank" rel="noopener">Full fitting report ↗</a><a href="./data/pathology-fits/INDEPENDENT_REVIEW.md" target="_blank" rel="noopener">Independent fit review ↗</a><a href="./data/pathology-fits/TARGET_METHODS.md" target="_blank" rel="noopener">Beat preparation & sources ↗</a><a href="./data/pathology-fits/cases/${escape(this.options.recordId)}.json" download>Download this fit · JSON ↓</a><a href="./data/pathology-fits/targets-v1.json" download>Download measured ensembles ↓</a><a href="./data/pathology-fits/propagation-research.zip" download>Research code & reproduction guide · ZIP ↓</a></div><p>Methods informed by <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9539798/" target="_blank" rel="noopener">whole-heart activation modeling</a>, <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5411438/" target="_blank" rel="noopener">fast activation / lead-field computation</a>, and <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/" target="_blank" rel="noopener">regional ischemic action-potential mechanisms</a>.</p></div></details>
    </section>`;
    enhanceInfoPanels(this.host);
  }
  bind(){
    this.canvas=this.$('heart');this.ctx=this.canvas.getContext('2d');
    this.$('play').onclick=()=>this.togglePlaying();this.$('time').oninput=e=>this.seek(Number(e.target.value));
    this.$('speed').onchange=e=>{this.speed=Number(e.target.value);this.options.onSpeed?.(this.speed);};
    this.$('lead').onchange=e=>this.selectLead(e.target.value);
    this.$('view').onchange=e=>{this.view=e.target.value;this.updateScale();this.dirty=true;};
    this.$('cutaway').onchange=e=>{this.cutaway=e.target.checked;this.dirty=true;};this.$('axis').onchange=e=>{this.leadAxis=e.target.checked;this.dirty=true;};
    this.$('observation').onchange=e=>{this.observation=e.target.value;this.rebuildCharts();};
    this.$('approach').onchange=e=>{this.selected=e.target.value;this.approach=this.approaches.find(a=>a.id===this.selected);this.field.setApproach(this.approach);this.updateApproach();};
    this.$('zoom-in').onclick=()=>{this.zoom=clamp(this.zoom*1.15,.55,2.5);this.dirty=true;};this.$('zoom-out').onclick=()=>{this.zoom=clamp(this.zoom/1.15,.55,2.5);this.dirty=true;};
    this.$('reset-view').onclick=()=>{this.yaw=.25;this.pitch=.55;this.zoom=1;this.pan=[0,0];this.dirty=true;};
    const coordinates=e=>({x:e.clientX,y:e.clientY});
    this.canvasEvents={
      contextmenu:e=>e.preventDefault(),
      wheel:e=>{e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(-e.deltaY*.0012),.55,2.5);this.dirty=true;},
      pointerdown:e=>{this.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,coordinates(e));this.gesture={start:coordinates(e),moved:0,pan:e.button===2||e.shiftKey};this.dirty=true;},
      pointermove:e=>{
        const previous=this.pointers.get(e.pointerId);if(!previous)return;
        const next=coordinates(e),dx=next.x-previous.x,dy=next.y-previous.y;
        if(this.pointers.size===2){const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)?.[1];if(other){const old=Math.hypot(previous.x-other.x,previous.y-other.y),now=Math.hypot(next.x-other.x,next.y-other.y);if(old>3)this.zoom=clamp(this.zoom*now/old,.55,2.5);this.pan[0]+=dx/2;this.pan[1]+=dy/2;}}
        else if(this.gesture?.pan){this.pan[0]+=dx;this.pan[1]+=dy;}
        else{this.yaw+=dx*.009;this.pitch=clamp(this.pitch+dy*.008,-1.35,1.35);}
        if(this.gesture)this.gesture.moved+=Math.hypot(dx,dy);this.pointers.set(e.pointerId,next);this.dirty=true;
      },
      pointerup:e=>{if(this.pointers.size===1&&this.gesture?.moved<5&&!this.gesture.pan){const rect=this.canvas.getBoundingClientRect();this.node=this.surface.pick(e.clientX-rect.left-this.pan[0],e.clientY-rect.top-this.pan[1],this.cutaway);if(this.node!==null)this.apPanel?.setSample(this.node);this.dirty=true;}this.pointers.delete(e.pointerId);},
      pointercancel:e=>this.pointers.delete(e.pointerId),
      lostpointercapture:e=>this.pointers.delete(e.pointerId),
      keydown:e=>{let handled=true;if(e.key==='ArrowLeft')this.yaw-=.1;else if(e.key==='ArrowRight')this.yaw+=.1;else if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.1,-1.35,1.35);else if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.1,-1.35,1.35);else if(e.key==='+')this.zoom=clamp(this.zoom*1.1,.55,2.5);else if(e.key==='-')this.zoom=clamp(this.zoom/1.1,.55,2.5);else if(e.key==='0'){this.yaw=.25;this.pitch=.55;this.zoom=1;this.pan=[0,0];}else handled=false;if(handled){e.preventDefault();this.dirty=true;}}
    };
    for(const [event,fn]of Object.entries(this.canvasEvents))this.canvas.addEventListener(event,fn,{passive:false});
    this.resizeObserver=new ResizeObserver(()=>{this.dirty=true;});this.resizeObserver.observe(this.canvas);
    this.apPanel=new FitAPPanel(this.$('ap-panel'),{base:this.base,field:this.field,timeMs:this.timeMs,timeLabel:this.timeLabel,fullWindow:this.fullWindow,kind:this.options.conditionId==='rbbb'||this.options.recordId==='ptbxl-03155'?'rbbb':this.field.lesion.some(v=>v>.05)?'stemi':'general',onSeek:t=>this.seek(t),onPick:key=>{this.node=this.apPanel.samples[key];this.dirty=true;this.canvas.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});this.canvas.focus({preventScroll:true});},onChange:()=>{this.node=this.apPanel.samples[this.apPanel.target];this.dirty=true;}});
  }
  predicted(approach=this.approach){return approach?.ecg?.predicted||approach?.ecg||approach?.predicted||this.fit.ecg.predicted;}
  observed(){const e=this.fit.ecg;return e[this.observation]||e.observed;}
  selectLead(lead){if(!this.leads.includes(lead))return;this.lead=lead;this.options.onLead?.(lead);this.$('lead').value=lead;this.syncLeadAxis();this.rebuildCharts();this.dirty=true;}
  syncLeadAxis(){
    const known=ORDER.includes(this.lead),axis=this.$('axis');if(axis){axis.disabled=!known;axis.checked=known&&this.leadAxis;axis.title=known?'Positive direction of the reference lead':'Source electrode geometry is unspecified or modified; no axis is inferred';}
    if(!this.hasHeldOut){const option=this.$('observation')?.querySelector('option[value=heldOut]');if(option)option.disabled=true;}
  }
  updateApproach(){
    this.updateSurface();
    const a=this.approach;this.hasInjury=this.field.lesion.some(v=>v>.01);this.$('approach-note').textContent=a?.description||'The displayed field and orange ECG use the same fitted source parameters.';
    const parameters=a?.parameters||this.fit.parameters||{},physiology=this.$('physiology-note');
    const shortRv=this.options.recordId==='acs-00004'&&Number(parameters.rvApdOffset)<-40;
    const physiologyNote=a?.physiologyNote||this.fit.physiologyNote;
    this.$('physiology-info').hidden=!shortRv&&!physiologyNote;
    physiology.textContent=physiologyNote||(shortRv?`This flexible voltage fit shifts right-ventricular action-potential duration by ${Math.round(parameters.rvApdOffset)} ms. Such short RV recovery is not established by this recording or a defining feature of LAD injury. Compare the conservative-recovery experiment to see how a stronger physiological prior changes the fit.`:'');
    this.$('parameters').textContent=JSON.stringify(parameters,null,2);
    this.$('limitations').innerHTML=(this.fit.limitations||[]).map(l=>`<p>${escape(l)}</p>`).join('');
    this.apPanel?.setField(this.field);
    this.syncLeadAxis();this.rebuildCharts();this.buildExperimentTable();this.buildPhaseErrors();this.buildJumps();this.updateScale();this.updateQuality();this.dirty=true;
  }
  updateSurface(){
    const pose=this.approach?this.approach.pose:this.fit.pose,key=JSON.stringify(pose||null);
    if(this.surface&&this.poseKey===key)return;
    releaseSurface(this.surface);this.surface=new HeartSurface(posedHeart(this.base,pose));this.surface.center=this.worldCenter;this.surface.range=this.worldRange;this.poseKey=key;
  }
  rebuildCharts(){
    for(const chart of this.charts)chart.destroy();this.charts=[];
    const ecg=this.fit.ecg,observed=this.observed(),predicted=this.predicted();
    this.$('recorded-label').textContent=(this.fullWindow?{observed:'Recorded excerpt',train:'Training portion',heldOut:'Held-out portion'}:{observed:'Recorded median',train:'Training median',heldOut:'Held-out median'})[this.observation];this.$('spread-label').hidden=this.fullWindow||this.observation!=='observed';
    const options={timeMs:this.timeMs,observed:observed[this.lead],predicted:predicted[this.lead],p25:!this.fullWindow&&this.observation==='observed'?ecg.p25?.[this.lead]:null,p75:!this.fullWindow&&this.observation==='observed'?ecg.p75?.[this.lead]:null,lead:this.lead,timeLabel:this.timeLabel};
    this.mainChart=new FitChart(this.$('main-chart'),{...options,onSeek:t=>this.seek(t)});this.charts.push(this.mainChart);
    for(const lead of this.leads){
      const chart=new FitChart(this.$('mini-'+lead),{timeMs:this.timeMs,observed:observed[lead],predicted:predicted[lead],lead,timeLabel:this.timeLabel,compact:true,residual:false,onSelect:()=>{this.selectLead(lead);this.$('main-chart').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}});this.charts.push(chart);
      const m=metric(observed,predicted,this.timeMs,this.window,[lead]);this.$('error-'+lead).textContent='RMSE '+number(m.rmse)+' mV';
      this.host.querySelector(`[data-fit-lead="${lead}"]`).classList.toggle('is-selected',lead===this.lead);
    }
    const m=metric(observed,predicted,this.timeMs,this.window,[this.lead]),all=metric(observed,predicted,this.timeMs,this.window,this.independentLeads);
    this.$('lead-rmse').textContent=number(m.rmse);this.$('lead-correlation').textContent=number(m.correlation);this.$('all-rmse').textContent=number(all.rmse);
    this.mainChart.draw(this.time);this.dirty=true;
  }
  buildExperimentTable(){
    const ecg=this.fit.ecg;
    this.$('experiments').innerHTML=(this.approaches.length?this.approaches:[{id:'best',label:'Best fitted model'}]).map(a=>{
      const predicted=this.predicted(a),train=metric(ecg.train||ecg.observed,predicted,this.timeMs,this.fit.trainingWindowMs||this.window,this.independentLeads),test=metric(ecg.heldOut||ecg.test,predicted,this.timeMs,this.fit.heldOutWindowMs||this.window,this.independentLeads);
      return `<tr class="${a.id===this.selected?'is-selected':''}"><th scope="row">${escape(a.label||a.id)}${a.id===this.selected?'<span>shown above</span>':''}</th><td>${number(train.rmse)} mV</td><td>${number(test.rmse)} mV</td><td>${number(test.correlation)}</td></tr>`;
    }).join('');
  }
  buildPhaseErrors(){
    if(this.fullWindow){const train=this.fit.trainingWindowMs,test=this.fit.heldOutWindowMs;this.$('phase-errors').innerHTML=train&&test?`<div><span>Training interval</span><strong>${(train[0]/1000).toFixed(2)}–${(train[1]/1000).toFixed(2)} s</strong></div><div><span>Held-out waveform interval</span><strong>${(test[0]/1000).toFixed(2)}–${(test[1]/1000).toFixed(2)} s</strong><p>Timing may be supplied by source annotations; this is a conditional waveform check.</p></div>`:'';return;}
    const windows=this.fit.comparisonWindowsMs||{},predicted=this.predicted(),ecg=this.fit.ecg;
    this.$('phase-errors').innerHTML=Object.entries({P:'P-wave window',QRS:'QRS window',ST:'ST window',ST_T:'ST–T window'}).filter(([key])=>windows[key]).map(([key,label])=>{
      const window=windows[key],fit=metric(ecg.heldOut,predicted,this.timeMs,window,this.independentLeads),repeat=metric(ecg.train,ecg.heldOut,this.timeMs,window,this.independentLeads);
      return `<div><span>${label}</span><strong>${number(fit.rmse)} <small>mV</small></strong><p>Held-out fit error<br><b>${number(repeat.rmse)} mV</b> recorded repeatability</p></div>`;
    }).join('');
  }
  fiducials(){return this.target.fiducialsMs||this.target.fiducials||this.fit.fiducialsMs||{};}
  buildJumps(){
    if(this.fullWindow){const span=this.end-this.start;this.$('jumps').innerHTML=[0,.25,.5,.75,1].map(q=>`<button class="button small" data-fit-jump-time="${this.start+span*q}">${((this.start+span*q)/1000).toFixed(2)} s</button>`).join('');this.host.querySelectorAll('[data-fit-jump-time]').forEach(b=>b.onclick=()=>this.seek(Number(b.dataset.fitJumpTime)));return;}
    const f=this.fiducials(),qrsOn=f.qrsOnset??f.qrsStart??-40,qrsEnd=f.qrsOffset??f.qrsEnd??f.jPoint??100,tOn=f.tOnset??f.tStart??180,tEnd=f.tOffset??f.tEnd??420;
    this.phaseTimes={p:f.pPeak??((f.pOnset??-220)+(f.pOffset??-90))/2,qrs:qrsOn+Math.min(30,(qrsEnd-qrsOn)/2),late:qrsEnd-15,st:qrsEnd+60,t:f.tPeak??(tOn+tEnd)/2};
    this.$('jumps').innerHTML=Object.entries({p:'Atrial activation',qrs:'Early QRS',late:'Late QRS',st:'J + 60 ms',t:'Recovery'}).map(([id,label])=>`<button class="button small" data-fit-jump="${id}">${label}</button>`).join('');
    this.host.querySelectorAll('[data-fit-jump]').forEach(b=>b.onclick=()=>this.seek(this.phaseTimes[b.dataset.fitJump]));
  }
  updateScale(){
    const [min,max]=this.field.ranges[this.view],unit=['voltage'].includes(this.view)?'mV':['fronts','injury'].includes(this.view)?'':'ms';
    this.$('scale-low').textContent=this.view==='fronts'?'Cyan · falling Vₘ':this.view==='injury'?'Reference tissue':Math.round(min)+' '+unit;
    this.$('scale-high').textContent=this.view==='fronts'?'Gold · rising Vₘ':this.view==='injury'?'Peak fitted injury':Math.round(max)+' '+unit;
    this.$('scale-low').parentElement.parentElement.dataset.view=this.view;this.$('front-note').hidden=this.view!=='fronts';
    this.$('scale-name').textContent=({voltage:'Modeled Vₘ · inside − outside',fronts:'Dark · little change',activation:this.fullWindow?'Nominal local activation · ms':'Activation · relative to R anchor',recovery:this.fullWindow?'Nominal local recovery · ms':'90% recovery · relative to R anchor',apd:'Local APD₉₀',injury:'Assumed smooth injury weight'})[this.view];
  }
  updateQuality(){
    const q=this.quality,baseline=this.target.baselineWindowMs||this.fit.baselineWindowMs;
    this.$('ensemble-copy').textContent=q.summary||`${q.acceptedBeatCount??'The accepted'} beats contribute to the all-beat median${q.excludedBeatCount?' after '+q.excludedBeatCount+' excluded window'+(q.excludedBeatCount===1?'':'s'):''}. Each lead keeps calibrated millivolts. A constant PR reference${baseline?' ('+baseline[0]+' to '+baseline[1]+' ms)':''} is removed per beat. All channels share one R alignment; P, QRS and T are not separately time-warped. The native sampling rate is ${this.fit.sourceSamplingHz||this.target.nativeFs||500} Hz; display resampling does not add information.`;
    const repeatability=this.fit.targetRepeatability?.wholeBeat?.independentLeadRmseMv??q.trainVsHeldoutRmseMv;
    const items=[[this.fullWindow?'Training samples':'Training beats',q.trainSampleCount??q.trainBeatCount],[this.fullWindow?'Held-out samples':'Held-out beats',q.heldOutSampleCount??q.heldoutBeatCount??q.heldOutBeatCount],['Train ↔ held-out repeatability',Number.isFinite(repeatability)?number(repeatability)+' mV':null]];
    this.$('quality').innerHTML=items.filter(([,v])=>v!=null).map(([label,v])=>`<span><b>${escape(v)}</b>${label}</span>`).join('');
  }
  seek(time){this.time=clamp(time,this.start,this.end);this.running=true;this.dirty=true;this.updatePlay();}
  togglePlaying(){if(!this.fit)return;if(this.time>=this.end)this.time=this.start;this.running=!this.running;this.updatePlay();}
  updatePlay(){if(this.$('play'))this.$('play').textContent=this.running?'Ⅱ Pause':this.time>=this.end?'↺ Restart':'▶ Play';}
  updateInstant(){
    const clock=sign(this.time)+' ms';setText(this.$('clock'),clock);setText(this.$('time-label'),clock);this.$('time').value=this.time;
    const f=this.fiducials(),on=f.qrsOnset??f.qrsStart??-40,end=f.qrsOffset??f.qrsEnd??f.jPoint??100,t=f.tOnset??f.tStart??180,tEnd=f.tOffset??f.tEnd??420,rbbb=this.options.recordId==='ptbxl-03155'&&!this.approach?.healthy;
    let title,copy;
    const unblockedPrior=this.approach?.healthy||this.approach?.id==='healthy-prior';
    if(this.time<on){title='Before ventricular recruitment';copy='Atrial activation and recovery use their own local action potentials. The reference baseline is an electrode-voltage convention, not zero cell voltage.';}
    else if(this.time<end){title=rbbb?'Ventricular activation is spatially delayed':'The depolarization front recruits the ventricles';copy=rbbb?'Compare early left-sided recruitment with later right-sided tissue. The ECG polarity comes from spatial voltage gradients and the selected lead field.':'Cells ahead of and behind the front have different membrane voltages. Their weighted spatial contributions produce the QRS; a positive cell voltage alone does not imply a positive lead.';}
    else if(this.time<t){title=!this.hasInjury?'Plateau and early recovery':'The plateau is no longer spatially uniform';copy=!this.hasInjury?(rbbb?'The myocardium can remain depolarized while the surface signal is small. Delayed activation also changes the later recovery sequence.':'This candidate has no modeled injury region. The ventricular plateau is relatively uniform, while regional action-potential durations still determine recovery.'):'The fitted region has an altered resting voltage and action-potential excursion. Differences between injured and reference tissue generate a displacement relative to the chosen PR baseline.';}
    else if(this.time<tEnd){title='Each region recovers on its own clock';copy='Recovery is local activation time plus action-potential duration. The sequence can differ from activation; the recovery wave is not an impulse traveling backward through the Purkinje system.';}
    else{title='Recovery and the following cycle';copy='The fitted periodic source also includes neighboring beats where their action potentials overlap this window. A remaining recorded residual may reflect noise, genuine variation, or model limitations.';}
    if(unblockedPrior&&this.time>=on&&this.time<end){title='Unblocked-conduction comparison';copy='This aligned healthy prior keeps rapid delivery to both ventricles. It provides a baseline comparison with the pathological recording; the source gain and timing have still been aligned to that recording.';}
    if(this.fullWindow){title=this.fit.title||'A time-resolved propagation hypothesis';copy=this.fit.dynamicDescription||this.fit.description||'The source clock follows this recorded excerpt. Compare the calculated trace with the recording; spatial propagation is a fitted hypothesis.';}
    setText(this.$('phase-title'),title);setText(this.$('phase-description'),copy);
    if(this.node!==null){
      const p=this.field.nodeInfo(this.node,this.time),probe=this.$('probe');
      if(!this.probeReadout){
        const note=document.createElement('small');note.textContent=this.fullWindow?'Interpolated sample; nominal timing is supplemented by the source event schedule.':'Interpolated surface sample; times are relative to R.';probe.querySelector('div').appendChild(note);
        this.probeReadout={title:probe.querySelector('strong'),timing:probe.querySelector('p')};
      }
      setText(this.probeReadout.title,`${p.chamber} · ${sign(p.voltage,1)} mV`);
      setText(this.probeReadout.timing,`AT ${sign(p.activation)} ms · APD₉₀ ${Math.round(p.apd)} ms · recovery ${sign(p.recovery)} ms${p.lesion>.01?' · injury weight '+p.lesion.toFixed(2):''}`);
    }
  }
  drawAxis(ctx){
    const electrodes=this.fit.virtualElectrodes||this.base.virtualElectrodes,E=electrodes,mean=(a,b)=>a.map((v,i)=>(v+b[i])/2),minus=(a,b)=>a.map((v,i)=>v-b[i]);
    let d;if(this.lead==='I')d=minus(E.LA,E.RA);else if(this.lead==='II')d=minus(E.LL,E.RA);else if(this.lead==='III')d=minus(E.LL,E.LA);else if(this.lead==='aVR')d=minus(E.RA,mean(E.LA,E.LL));else if(this.lead==='aVL')d=minus(E.LA,mean(E.RA,E.LL));else if(this.lead==='aVF')d=minus(E.LL,mean(E.RA,E.LA));else{const c=E['C'+this.lead.slice(1)],w=E.RA.map((v,i)=>(v+E.LA[i]+E.LL[i])/3);if(c)d=minus(c,w);}
    if(!d)return;const length=Math.hypot(...d),center=this.surface.center,span=this.surface.range*.58;if(length<1e-9)return;
    const a=this.surface.project(center.map((v,i)=>v-d[i]/length*span)),b=this.surface.project(center.map((v,i)=>v+d[i]/length*span));
    const distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<3)return;
    const ux=(b.x-a.x)/distance,uy=(b.y-a.y)/distance,nx=-uy,ny=ux,head=Math.min(9,distance*.3);
    ctx.save();ctx.strokeStyle='rgba(46,103,99,.75)';ctx.lineWidth=1.6;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.beginPath();ctx.moveTo(b.x-ux*head+nx*head*.4,b.y-uy*head+ny*head*.4);ctx.lineTo(b.x,b.y);ctx.lineTo(b.x-ux*head-nx*head*.4,b.y-uy*head-ny*head*.4);ctx.stroke();
    ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    const halfW=ctx.measureText(this.lead).width/2+3,halfH=10,forward=12+Math.abs(ux)*halfW+Math.abs(uy)*halfH,side=12+Math.abs(nx)*halfW+Math.abs(ny)*halfH;
    const candidates=[{x:b.x+ux*forward,y:b.y+uy*forward}];
    for(const back of [0,24,48,80])for(const offset of [side,side+20,side+44])for(const direction of [1,-1])candidates.push({x:b.x-ux*back+nx*offset*direction,y:b.y-uy*back+ny*offset*direction});
    // These fixed scene overlays must remain readable on the narrow two-column
    // view. Bounds are in canvas coordinates, including the user's pan.
    const [panX,panY]=this.pan,w=this.surface.w,h=this.surface.h;
    const inside=p=>p.x+panX-halfW>=8&&p.x+panX+halfW<=w-8&&p.y+panY-halfH>=52&&p.y+panY+halfH<=h-44;
    const clearsClock=p=>p.x+panX-halfW>=Math.min(226,w*.68)||p.y+panY+halfH<=h-110;
    const label=candidates.find(p=>inside(p)&&clearsClock(p))||candidates.find(inside);
    if(!label){ctx.restore();return;}
    // A subtle text halo keeps the name readable without covering the tissue
    // with a badge. Each candidate leaves space around the positive arrowhead.
    ctx.strokeStyle='rgba(246,250,239,.94)';ctx.lineWidth=3;ctx.strokeText(this.lead,label.x,label.y);ctx.fillStyle='#2e6763';ctx.fillText(this.lead,label.x,label.y);ctx.restore();
  }
  drawHeart(){
    const rect=this.canvas.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height);if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2);if(this.canvas.width!==Math.round(w*dpr)||this.canvas.height!==Math.round(h*dpr)){this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);}
    const image=this.surface.render(this.field.sample(this.time,this.view),{yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,cutaway:this.cutaway,showAppendage:true,fronts:this.view==='fronts'},w,h);
    const c=this.ctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.save();c.translate(...this.pan);if(image)c.drawImage(image,0,0,w,h);if(this.cutaway)this.surface.drawCutBoundary(c,0,0);if(this.leadAxis&&ORDER.includes(this.lead))this.drawAxis(c);
    this.drawSampleMarkers(c);
    c.restore();
  }
  drawSampleMarkers(c){
    if(!this.apPanel)return;
    const samples=this.apPanel.samples,key=this.poseKey+'|'+this.surface.viewKey+'|'+this.cutaway+'|'+samples.A+'|'+samples.B;
    if(this.sampleVisibilityKey!==key){
      this.sampleVisibility={};
      for(const id of ['A','B']){const p=this.surface.project(samples[id]);let visible=!this.cutaway||!this.surface.isCutHidden(p);
        if(visible){const hit=this.surface.pick(p.x,p.y,this.cutaway);visible=hit!==null&&this.surface.project(hit).z-p.z<2.5;}
        this.sampleVisibility[id]=visible;
      }
      this.sampleVisibilityKey=key;
    }
    for(const id of ['A','B']){if(!this.sampleVisibility[id])continue;const p=this.surface.project(samples[id]);c.fillStyle=AP_SAMPLE_COLORS[id];c.strokeStyle='#f5f9ee';c.lineWidth=1.5;c.beginPath();c.arc(p.x,p.y,9,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#fffdf7';c.font='600 12px system-ui';c.textAlign='center';c.fillText(id,p.x,p.y+4);}
  }
  tick(now){
    if(!this.alive)return;const dt=Math.min(.1,(now-this.last)/1000);this.last=now;
    if(!document.hidden){
      if(this.running){this.time=Math.min(this.end,this.time+dt*this.speed*1000);this.dirty=true;if(this.time>=this.end){this.running=false;this.updatePlay();}}
      if(this.dirty&&(!this.lastDraw||now-this.lastDraw>=32)){this.lastDraw=now;this.drawHeart();this.mainChart?.draw(this.time);this.apPanel?.draw(this.time);this.updateInstant();this.dirty=false;}
    }
    this.raf=requestAnimationFrame(t=>this.tick(t));
  }
  destroy(){
    closeInfoPanels();
    this.alive=false;cancelAnimationFrame(this.raf);this.resizeObserver?.disconnect();this.apPanel?.destroy();for(const chart of this.charts)chart.destroy();
    if(this.canvas&&this.canvasEvents)for(const [event,fn]of Object.entries(this.canvasEvents))this.canvas.removeEventListener(event,fn);
    releaseSurface(this.surface);
  }
}

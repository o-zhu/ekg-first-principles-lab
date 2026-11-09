import {LEADS,LEAD_INFO,REGIONS,getFiducials,regionalContributions,phaseAt,sampleECG} from './ecg.js';
import {HeartScene} from './scenes.js';
import {voltageLessonTemplate,VoltageLesson} from './voltage-lesson.js';
import {ECGChart} from './charts.js';
import {clinicalWindow,clinicalGridScale} from './clinical-chart-scale.js';
import {decorateClinicalData,recordProfile,recordState,recordBeats,scenarios} from './clinical-adapter.js';
import {DEFAULT_SANDBOX_CONFIG,normalizeConfig,createSandboxModel} from './pathology-model.js';
import {sourceMarkup} from './references.js';
import {AP_SITES,actionPotentialState,actionPotentialLandmarks,AP_SOURCES,AP_MODEL_NOTE} from './action-potentials.js';
import {ActionPotentialChart} from './action-potential-chart.js';
import {electricalViewMarkup,bindElectricalUI,updateElectricalUI,SNAPSHOTS} from './electrical-ui.js';
import {FitExplorer,FITTED_RECORDS} from './fit-explorer.js';
import {enhanceInfoPanels,closeInfoPanels} from './ui-help.js';
import {renderCaseBrowser,bindCaseBrowser} from './case-browser.js';

const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mod=(x,n)=>((x%n)+n)%n;
const signed=(n,d=3)=>(n>=0?'+':'')+n.toFixed(d);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const modules=['electricity','heartbeat','leads','rhythm','library','sandbox'];
const SPEEDS=[.03,.1,.3,1];
const LEAD_GRID=[['I','aVR','V1','V4'],['II','aVL','V2','V5'],['III','aVF','V3','V6']];
const LEAD_COLUMNS=[['I','II','III'],['aVR','aVL','aVF'],['V1','V2','V3'],['V4','V5','V6']];
const leadDuration=()=>getFiducials(state.bpm).rr*12;
const allRegions=()=>Object.fromEntries(REGIONS.map(r=>[r.id,true]));
const state={
  module:'electricity',time:0,bpm:72,running:!reduced,speed:.03,lead:'II',axis:60,
  regions:allRegions(),selectedLeads:['I','II','V1'],leadGain:10,skin:false,bones:true,labels:true,
  electricalView:'voltage',clinicalFit:false,activation:true,beating:true,annotations:true,interval:'pr',paperSpeed:25,gain:10,calipers:false,cutaway:false,conduction:false,referencePlane:false,
  recordIndex:0,clinicalLead:'II',clinicalAll:false,clinicalGain:10,clinicalWindowSeconds:2.5,clinicalState:null,leadAxes:true,clinicalGroup:'rhythm',
  voltage:{chapter:'#membrane',scroll:0}
};
state.sandbox={...DEFAULT_SANDBOX_CONFIG};state.sandboxLead='II';state.sandboxReference=true;state.sandboxAxes=true;state.potentialSite='sa';
let scene=null,charts=[],mainChart=null,data=null,dataPromise=null,routeToken=0;
let potentialReferenceChart=null,potentialSampleKey=0;
let sandboxModel=null,sandboxReference=null,fitExplorer=null;
let clinicalChartWindow=null,leadGainFrame=0,leadExtent=null;
const visited=new Set(['electricity']);
try{JSON.parse(localStorage.getItem('cardio-explored')||'[]').filter(m=>modules.includes(m)).forEach(m=>visited.add(m));}catch{}

function on(id,event,fn){$(id)?.addEventListener(event,fn);}
function updateText(id,text){const element=$(id);if(element&&element.textContent!==text)element.textContent=text;}
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function switchRow(label,id,checked){return `<label class="toggle-row" for="${id}"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${checked?'checked':''}><span></span></span></label>`;}
function leadSelect(id,lead='II'){return `<select id="${id}" class="select-field" aria-label="EKG lead">${LEADS.map(l=>`<option value="${l}" ${l===lead?'selected':''}>Lead ${l}</option>`).join('')}</select>`;}
const MODULE_COPY={
  '01':{title:'Electrical foundations',prompt:'Choose a scale, then pause or scrub the voltage trace to follow the signal.'},
  '02':{title:'Conduction & motion',prompt:'Rotate the heart, then pause or scrub the ECG to follow one beat.'},
  '03':{title:'The 12 leads',prompt:'Choose leads and rotate the anatomy to compare their views of the same beat.'},
  '04':{title:'ECG measurements',prompt:'Select an interval. Use calipers to measure the stationary trace.'},
  '05':{title:'Clinical patterns',prompt:'Choose a category and case. Compare the recording with its electrical mechanism.'},
  '06':{title:'Rhythm builder',prompt:'Change a setting and inspect the effect on the heart and ECG.'}
};
function info(title,html,label=''){return `<div data-info-panel="${escapeHTML(title)}"${label?` data-info-label="${escapeHTML(label)}"`:''}>${html}</div>`;}
function intro(number,kicker,title,copy,action=''){const m=MODULE_COPY[number]||{title,prompt:copy};return `<section class="lesson-intro"><div><div class="eyebrow">Module ${number}<span>·</span>${kicker}</div><div class="lesson-title-row"><h1>${m.title}</h1>${info('About '+m.title,`<p>${copy}</p>`)}</div><div class="lesson-prompt-row"><p class="lesson-prompt">${m.prompt}</p>${action}</div></div></section>`;}
function electricityTemplate(){return intro('01','From ions to EKG','Electrical foundations','Follow the signal through four scales: the membrane, the wave, the lead, and the whole heart. Explore the controls and optional channel, pharmacology, and electrolyte sections to connect each scale with the EKG.')+voltageLessonTemplate();}
function bottom(next,copy){return `<div class="lesson-bottom"><a href="#${next}" class="next-button">${{heartbeat:'Conduction & motion',leads:'The 12 leads',rhythm:'ECG measurements',library:'Clinical patterns',sandbox:'Rhythm builder',electricity:'Electrical foundations'}[next]} <span>→</span></a></div>`;}
function insight(title,copy){return `<aside class="insight-compact"><h3>${title}</h3>${info(title,`<p>${copy}</p>`)}</aside>`;}
function stageMarkup(torso=false,clinical=false,{controls=false}={}){return `<div class="model-interaction"><div><strong>Explore in 3D</strong><span>Drag to rotate · Scroll or pinch to zoom</span></div>${info('3D controls','<p><b>Rotate:</b> drag the heart with one finger or the left mouse button.</p><p><b>Zoom:</b> scroll, pinch, or use + and −.</p><p><b>Pan:</b> right-drag or use a two-finger gesture.</p><p><b>Keyboard:</b> focus the model, then use the arrow keys to change the view and + / − to zoom. Reset restores the front view.</p>')}</div><div id="scene" class="stage anatomy ${torso?'torso-stage':'heart-stage'} ${clinical?'clinical-stage':''} ${controls?'has-scene-controls':''}">
  <div class="model-loading">Loading reference anatomy…</div>
  <div class="stage-top">${controls?speedSelect('scene-playback-speed',state.speed,{scene:true}):`<span class="stage-label"><i class="tiny-dot"></i>${clinical?'Reference heart':torso?'Heart & lead directions':'Activation & contraction'}</span>`}<div class="stage-tools"><button id="zoom-in" aria-label="Zoom in" title="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out" title="Zoom out">−</button><button id="reset-view" aria-label="Reset 3D view" title="Reset to front view">↺</button></div></div>
  <div class="scene-state"><span class="phase-name" id="phase-name">Between beats</span><span class="phase-sub" id="phase-sub">Electricity leads; contraction follows.</span></div>
  <div class="legend-pill"><span class="legend-gradient"></span>Activation / recovery</div>${controls?anatomyViewButtons(true):''}</div>`;}
function anatomyViewButtons(embedded=false){return `<div class="anatomy-view-controls ${embedded?'scene-controls':''}" role="group" aria-label="Heart anatomy view"><button type="button" class="anatomy-view-button ${state.cutaway?'':'active'}" data-anatomy-view="surface" aria-pressed="${!state.cutaway}"><span aria-hidden="true">◉</span> Surface anatomy</button><button type="button" class="anatomy-view-button ${state.cutaway?'active':''}" data-anatomy-view="cutaway" aria-pressed="${state.cutaway}"><span aria-hidden="true">◐</span> Electrical cutaway</button>${embedded?'':'<span class="cutaway-hint">Open the chambers to follow conduction</span>'}</div>`;}
function anatomyViewControls(){return anatomyViewButtons()+electricalViewMarkup(state.electricalView);}
function speedSelect(id='playback-speed',value=state.speed,{scene=false}={}){return `<label class="speed-label ${scene?'scene-speed-control':''}" for="${id}"><span>${scene?'Speed':'Playback'}</span><select id="${id}" data-playback-speed class="select-field" aria-label="${scene?'3D playback speed':'Playback speed'}">${SPEEDS.map(s=>`<option value="${s}" ${s===value?'selected':''}>${s}×${s===1?' · real time':''}</option>`).join('')}</select></label>`;}
function phaseControls({clinical=false}={}){
  const previous=clinical?'<button id="previous-beat" class="button small" aria-label="Previous beat">← Beat</button>':'',next=clinical?'<button id="next-beat" class="button small" aria-label="Next beat">Beat →</button>':'';
  const scrub=`<input id="phase-scrub" type="range" min="0" max="1000" step="1" value="0" aria-label="${clinical?(state.module==='sandbox'?'Scrub through the simulation':'Scrub through recording'):state.module==='leads'?'Scrub through the ECG sheet':'Scrub through one heartbeat'}"><span class="timeline-time" id="phase-time">0 ms</span>`;
  const transport=clinical&&state.module==='library'?previous+next+speedSelect()+scrub:previous+scrub+next+speedSelect();
  return `<div class="phase-controls">
  ${clinical?'':`<div class="phase-buttons">${[['p','P · atria'],['pr','AV delay'],['qrs','QRS'],['st','Contraction'],['t','T · recovery']].map(([id,title])=>`<button data-phase="${id}">${title}</button>`).join('')}</div>`}
  <div class="phase-timeline"><button id="play-toggle" class="button primary">${state.running?'Ⅱ Pause':'▶ Play'}</button>${transport}</div>
  <div class="timeline-caption"><span class="scan-key"><i></i> Red cursor = current instant</span><span id="playback-duration">One beat takes 27.8 seconds at 0.03×</span></div>
  ${info('Current phase','<p class="timeline-readout" id="phase-description">Pause or drag the slider to explore an instant.</p>','Phase explanation')}</div>`;}
function traceMarkup(id,{big=false,clinical=false,title='A stationary tracing',height=150}={}){return `<section class="trace-panel ${big?'big-trace':''}"><div class="trace-heading"><div class="trace-title"><span class="tiny-dot"></span><span id="${id}-title">${title}</span></div><div class="trace-meta"><span id="${id}-lead">LEAD ${clinical?state.clinicalLead:state.lead}</span><span id="${id}-rate">${clinical?'100 Hz':state.bpm+' BPM'}</span><span class="badge ${clinical?'coral':''}">${clinical?'REAL RECORDING':'IDEALIZED SINUS'}</span></div></div><div class="trace-canvas-wrap" style="height:${height}px"><canvas id="${id}" aria-label="${clinical?'Clinical':'Simulated'} stationary electrocardiogram"></canvas></div><div class="trace-footer"><span id="${id}-scale">${state.paperSpeed} mm/s · ${state.gain} mm/mV</span><span id="${id}-footer">Original teaching model</span></div></section>`;}
function quiz(question,answers,correct,explanation){return `<section class="check-card"><div class="section-label">Quick check</div><h3>${question}</h3><div class="check-options">${answers.map((a,i)=>`<button class="button" data-answer="${i}" data-correct="${correct}">${a}</button>`).join('')}</div><p class="check-feedback hidden" data-explanation="${escapeHTML(explanation)}" aria-live="polite"></p></section>`;}

function potentialTemplate(){return `<section class="potential-study" id="cell-voltage" aria-labelledby="potential-heading">
  <div class="potential-heading"><div><div class="section-label">From the pathway to the cell</div><h2 id="potential-heading" tabindex="-1">Cellular action potentials</h2><p>Select a cell type or scrub a trace to compare the signals.</p></div><span class="badge">ILLUSTRATIVE CELL VOLTAGES</span></div>
  <div class="potential-transport"><button class="button primary" id="potential-play">${state.running?'Ⅱ Pause':'▶ Play'}</button>${speedSelect('potential-speed')}<span class="potential-time" id="potential-time">0 ms</span><span class="scan-key"><i></i> One shared clock</span><button class="button small" id="potential-locate">Locate selected site in 3D ↑</button></div>
  <div class="potential-selection"><span class="potential-site-dot" id="potential-site-dot"></span><div><strong id="potential-site-title">${escapeHTML(AP_SITES[0].label)}</strong><p id="potential-site-description">${escapeHTML(AP_SITES[0].description||'')}</p></div></div>
  <div class="potential-rows">
    <div class="potential-row potential-ecg-row"><div class="potential-site"><span class="potential-number">EKG</span><span><strong>Surface EKG</strong><small id="potential-ecg-lead">Lead ${state.lead} · body electrodes</small></span></div><div class="potential-canvas-wrap"><canvas id="potential-ecg"></canvas></div><div class="potential-live"><strong id="potential-ecg-value">0.00 <small>mV</small></strong><span>Surface potential</span></div></div>
    ${AP_SITES.map((s,i)=>`<div class="potential-row ${s.id===state.potentialSite?'is-selected':''}" data-potential-row="${s.id}" style="--potential-color:${s.color}"><button class="potential-site" data-potential-site="${s.id}" aria-pressed="${s.id===state.potentialSite}" aria-label="Select sampling site: ${escapeHTML(s.label)}"><span class="potential-number">${String(i+1).padStart(2,'0')}</span><span><strong>${escapeHTML(s.label)}</strong><small>${escapeHTML(s.subtitle||'Representative cell')}</small></span></button><div class="potential-canvas-wrap"><canvas id="potential-trace-${s.id}"></canvas></div><div class="potential-live"><strong id="potential-value-${s.id}">−90.0 <small>mV</small></strong><span id="potential-phase-${s.id}">Rest</span></div></div>`).join('')}
  </div>
  <div class="potential-scale-note"><span><b>Cell voltage Vₘ</b> = inside − outside the cell · −100 to +40 mV</span><span>The surface EKG uses its own smaller voltage scale. Time is aligned across every row.</span></div>
  <div class="potential-principles"><div><span class="section-label">Why the shapes differ</span><h3>The cell’s job shapes its signal.</h3><p>Pacemaker cells gradually approach threshold. Working atrial and ventricular cells have a rapid upstroke; ventricular cells maintain a long plateau before recovery.</p></div><div><span class="section-label">Why recovery has a different order</span><h3>Activation time + action-potential duration.</h3><p>Local recovery depends on both. A cell activated later can recover earlier when its action potential is shorter. Human recovery maps vary across the wall, apex, base and chambers.</p><p class="potential-pair-timing" id="potential-pair-timing"></p></div></div>
  <details class="potential-methods"><summary>Model assumptions and experimental sources</summary><p>${escapeHTML(AP_MODEL_NOTE)}</p><p>The reference EKG and the cell curves share timing, but the EKG is an educational surface-signal model rather than a voltage sum of these seven cells. The numbered sites represent selected cell types within a much larger conduction network. Changing a regional signal contribution changes the teaching EKG; it does not remove those cells from the heart.</p><div>${AP_SOURCES.map(s=>`<a href="${escapeHTML(s.url)}" target="_blank" rel="noopener">${escapeHTML(s.title||s.label||s.id)} ↗</a>`).join('')}</div><button class="text-button sources-trigger">Human recovery maps & all sources ↗</button></details>
</section>`;}

function selectPotentialSite(id,{locate=false}={}){
  const site=AP_SITES.find(s=>s.id===id);if(!site)return;state.potentialSite=id;
  scene?.set({potentialSite:id,conduction:true});state.conduction=true;if($('conduction-toggle'))$('conduction-toggle').checked=true;
  document.querySelectorAll('[data-potential-site]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.potentialSite===id));
  document.querySelectorAll('[data-potential-row]').forEach(r=>r.classList.toggle('is-selected',r.dataset.potentialRow===id));
  if($('potential-site-title'))$('potential-site-title').textContent=site.label;
  if($('potential-site-description'))$('potential-site-description').textContent=site.description||site.subtitle||'';
  if($('potential-site-dot'))$('potential-site-dot').style.background=site.color;
  if(locate){
    if(['av','his','purkinje','ventricular-endo'].includes(id)){
      state.cutaway=true;scene?.set({cutaway:true,conduction:true});
      document.querySelectorAll('[data-anatomy-view]').forEach(b=>{const active=b.dataset.anatomyView==='cutaway';b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});
    }
    $('scene')?.scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});
  }
}
function bindPotentialStudy(){
  on('potential-explore','click',()=>{
    $('potential-heading')?.focus({preventScroll:true});
    $('cell-voltage')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  });
  potentialReferenceChart=new ActionPotentialChart($('potential-ecg'),{siteId:'surface-ecg',bpm:state.bpm,time:state.time,onSeek:seekTime,sampleValue:t=>sampleECG(t,state.lead,state.bpm,state.regions,state.axis),sampleKey:++potentialSampleKey,voltageMin:-1.4,voltageMax:1.6,yTicks:[-1,0,1],color:'#4b705a',label:'Surface EKG · lead '+state.lead,xLabels:true});charts.push(potentialReferenceChart);
  for(const [i,site] of AP_SITES.entries())charts.push(new ActionPotentialChart($('potential-trace-'+site.id),{siteId:site.id,bpm:state.bpm,time:state.time,onSeek:seekTime,xLabels:i===AP_SITES.length-1}));
  document.querySelectorAll('[data-potential-site]').forEach(b=>b.onclick=()=>selectPotentialSite(b.dataset.potentialSite));
  on('potential-locate','click',()=>selectPotentialSite(state.potentialSite,{locate:true}));on('potential-play','click',toggleRunning);
  on('potential-speed','change',e=>setPlaybackSpeed(e.target.value));
  selectPotentialSite(state.potentialSite);updatePotentialUI();
}
function refreshPotentialReference(){
  if(!potentialReferenceChart)return;potentialReferenceChart.set({label:'Surface EKG · lead '+state.lead,sampleKey:++potentialSampleKey});
  if($('potential-ecg-lead'))$('potential-ecg-lead').textContent='Lead '+state.lead+' · body electrodes';
}
function updatePotentialUI(){
  if(!$('potential-time'))return;const t=mod(state.time,getFiducials(state.bpm).rr);
  $('potential-time').textContent=Math.round(t*1000)+' ms';
  $('potential-ecg-value').innerHTML=signed(sampleECG(t,state.lead,state.bpm,state.regions,state.axis),2)+' <small>mV</small>';
  for(const site of AP_SITES){const s=actionPotentialState(t,site.id,state.bpm);$('potential-value-'+site.id).innerHTML=signed(s.voltage,1)+' <small>mV</small>';$('potential-phase-'+site.id).textContent=s.phaseLabel||s.label||s.phase;}
  const endo=actionPotentialLandmarks('ventricular-endo',state.bpm),epi=actionPotentialLandmarks('ventricular-epi',state.bpm);
  $('potential-pair-timing').textContent=`Selected LV sites: inner-wall activation ${Math.round(endo.activation*1000)} ms, 90% recovery ${Math.round(endo.recovery90*1000)} ms; outer-wall activation ${Math.round(epi.activation*1000)} ms, 90% recovery ${Math.round(epi.recovery90*1000)} ms. These are the model’s timings.`;
}

// 01 — The complete, user-approved Cardiac Voltage course.
function bindVoltage(){scene=new VoltageLesson($('voltage-lesson'),state.voltage);}

// 02 — Fixed one-beat waveform immediately below the deforming anatomy.
function heartbeatTemplate(){return `${intro('02','Inside a heartbeat','See electricity become <br class="title-break"><em>a heartbeat.</em>','Electrical activation comes first. Contraction follows. Watch the atria tighten, the ventricular walls shorten and twist, and relaxation restore the shape—all against a stationary ECG.','<button class="potential-jump" id="potential-explore" type="button" aria-controls="cell-voltage"><svg viewBox="0 0 28 24" aria-hidden="true"><path d="M2 16h6l3-11 4 16 3-9 2 4h6"/></svg>Explore tissue action potentials <span class="potential-jump-arrow" aria-hidden="true">↓</span></button>')}
  <div class="lesson-grid heartbeat-grid"><div class="heart-study"><div>${stageMarkup(false,false,{controls:true})}${electricalViewMarkup(state.electricalView)}</div>${traceMarkup('heart-trace',{title:'One fixed beat · follow the red cursor',height:145})}${phaseControls()}<p class="credit-inline">BodyParts3D reference anatomy · Motion informed by cardiac MRI. The cutaway exposes the chambers and endocardial conduction paths. <button class="text-button sources-trigger">Motion references & sources ↗</button></p></div>
  <div class="column-stack"><section class="panel"><div class="panel-header"><h2>Lead & signal contributions</h2>${leadSelect('heart-lead',state.lead)}</div><p class="teaching-note" id="heart-lead-description">${LEAD_INFO[state.lead].description}</p><div class="panel-divider"></div><div class="section-label">Contributions to the tracing</div><p class="control-help">Select a region to locate it. Toggle its signal contribution.</p>${REGIONS.map(r=>`<div class="region-row"><div class="region-heading"><button class="region-name region-name-button" data-highlight="${r.id}" aria-pressed="false"><i class="color-dot" style="background:${r.color}"></i>${r.title}</button><span class="region-value" id="value-${r.id}">0.00</span><label class="switch" aria-label="Include ${r.title}"><input type="checkbox" data-region="${r.id}" ${state.regions[r.id]?'checked':''}><span></span></label></div><div class="contribution-track"><i class="contribution-zero"></i><i id="bar-${r.id}" class="contribution-bar" style="background:${r.color}"></i></div></div>`).join('')}<div id="region-description" class="region-description hidden"></div><p class="teaching-note">Signed mV contributions. These switches are not simulations of ablation or disease.</p><div class="panel-divider"></div>${switchRow('Electrical activation colors','activation-toggle',state.activation)}${switchRow('Anatomy labels','labels-toggle',state.labels)}${switchRow('Contraction','beating-toggle',state.beating)}${switchRow('Conduction system','conduction-toggle',state.conduction||state.cutaway)}<label class="field-label" for="heart-rate">Heart rate <b id="heart-rate-value">${state.bpm}<span>bpm</span></b></label><input id="heart-rate" type="range" min="45" max="120" value="${state.bpm}"></section>
  ${insight('The muscle keeps working after QRS','The QRS records ventricular depolarization. Mechanical shortening builds after that activation and continues through much of ST and T. A nearly flat ST segment can coincide with strong contraction.')}</div></div>
  <div class="mechanics-key"><span><i class="key-atrial"></i>Atrial squeeze</span><span><i class="key-ventricular"></i>Ventricular shortening + twist</span><span><i class="key-recovery"></i>Relaxation + untwisting</span></div>
  ${potentialTemplate()}
  ${quiz('A nearly flat ST segment means the ventricular muscle is…',['Largely depolarized and contracting','Already fully relaxed','Not electrically activated'],0,'Once most of the ventricle is depolarized, the net surface electrical gradient can be small. Force and deformation continue after electrical activation.')}${bottom('leads','Next: see the same activation from twelve fixed perspectives.')}`;}

function bindHeartbeat(){
  buildHeart(false);scene?.set({activation:state.activation,beating:state.beating,labels:state.labels,lead:state.lead,leadAxes:true,cutaway:state.cutaway,conduction:state.conduction||state.cutaway});
  const rr=getFiducials(state.bpm).rr;mainChart=chart('heart-trace',{mode:'fixed',annotations:true,windowSeconds:rr,playhead:true,playheadPeriod:rr,mmPx:4.5,gain:10,onSeek:seekTime});
  $('heart-trace-scale').textContent='One beat · time fitted to view · 0.1 mV / vertical small box';$('heart-trace-footer').textContent='Fixed waveform · shared heart clock';bindPhaseControls();
  on('heart-lead','change',e=>{state.lead=e.target.value;scene?.setLead(state.lead);mainChart.set({lead:state.lead});refreshPotentialReference();$('heart-trace-lead').textContent='LEAD '+state.lead;$('heart-lead-description').textContent=LEAD_INFO[state.lead].description;});
  document.querySelectorAll('[data-highlight]').forEach(button=>button.onclick=()=>{const id=button.dataset.highlight,selected=button.getAttribute('aria-pressed')!=='true';document.querySelectorAll('[data-highlight]').forEach(b=>{b.classList.toggle('active',selected&&b===button);b.setAttribute('aria-pressed',selected&&b===button);});const result=scene?.highlightRegion(selected?id:null);$('region-description').classList.toggle('hidden',!selected);if(selected)$('region-description').textContent=(REGIONS.find(r=>r.id===id)?.description||'')+' '+(result?.note||'');});
  document.querySelectorAll('[data-region]').forEach(input=>input.onchange=()=>{state.regions[input.dataset.region]=input.checked;refreshCharts();});
  on('heart-rate','input',e=>{const phase=mod(state.time,getFiducials(state.bpm).rr)/getFiducials(state.bpm).rr;state.bpm=Number(e.target.value);const rr=getFiducials(state.bpm).rr;state.time=phase*rr;$('heart-rate-value').innerHTML=state.bpm+' <span>bpm</span>';$('heart-trace-rate').textContent=state.bpm+' BPM';refreshCharts({windowSeconds:rr,playheadPeriod:rr});updateDuration();});
  bindAnatomyToggles();on('conduction-toggle','change',e=>{state.conduction=e.target.checked;scene?.set({conduction:state.conduction});});bindPotentialStudy();
}

// 03 — Compact clinical groups and one shared absolute-time cursor.
function leadsTemplate(){return `${intro('03','Twelve perspectives','One heart. <br class="title-break"><em>One shared moment.</em>','Reveal only the leads you want to study. The paper compacts into clinical lead groups, while a single red line follows the same instant across the entire sheet.')}
  <div class="lead-workspace"><div class="lead-anatomy-column">${stageMarkup(true)}<div class="lead-view-settings" role="group" aria-label="3D view settings"><div class="view-presets"><button class="button small" data-view="anterior">Anterior</button><button class="button small" data-view="left">Left lateral</button><button class="button small" data-view="posterior">Posterior</button><button class="button small" data-view="superior">Superior</button></div><div class="anatomy-layer-controls">${switchRow('Skin','skin-toggle',state.skin)}${switchRow('Bones','bones-toggle',state.bones)}${switchRow('Labels','labels-toggle',state.labels)}${switchRow('Axes','axes-toggle',state.leadAxes)}${switchRow('x–y plane','plane-toggle',state.referencePlane)}</div>${electricalViewMarkup(state.electricalView)}<p class="credit-inline">Each thin arrow points from a lead’s reference toward its positive electrode. Lead names sit at the arrowheads; turn Labels off for an uncluttered view. Electrode dots mark the selected leads and their references. These arrows are geometric guides, not computed lead fields. The x–y plane stays fixed in the patient’s frontal frame.</p></div></div>
  <div class="lead-paper-column"><section class="lead-paper"><div class="lead-paper-heading"><div><div class="section-label">Shared time · selected leads</div><h2>Choose leads</h2></div><div class="control-actions"><button class="button small" id="all-leads">All 12</button><button class="button small" id="default-leads">Reset</button></div></div><div id="lead-picker" class="lead-picker"></div><div class="lead-gain-control" role="group" aria-label="Waveform height"><label for="lead-gain">Waveform height</label><div class="lead-gain-slider"><button type="button" id="lead-gain-down" aria-label="Decrease waveform height">−</button><input id="lead-gain" type="range" min="5" max="40" step="1" value="${state.leadGain}" aria-label="Waveform height" aria-valuetext="${state.leadGain} millimeters per millivolt"><button type="button" id="lead-gain-up" aria-label="Increase waveform height">+</button></div><output id="lead-gain-value" for="lead-gain">${state.leadGain} mm/mV</output><button type="button" id="lead-gain-reset" class="text-button">Reset</button>${info('Adjust waveform height','<p>Drag the slider, use + / −, or hold Shift and scroll over a trace. Every lead uses the same vertical scale, and rows expand to keep the waves visible. Time and the underlying voltages stay unchanged. Reset returns to 10 mm/mV.</p>')}</div><div id="lead-paper-body" class="lead-paper-body"><div id="lead-comparisons" class="compact-lead-columns"></div><div id="lead-rhythm-strips" class="long-rhythm-strips"></div><div id="lead-paper-cursor" class="paper-cursor" aria-hidden="true"><i></i></div></div><div class="lead-paper-footer"><b id="lead-sweep-time">0.00 s</b> · Click a trace to seek · <span id="lead-gain-caption">${state.leadGain} mm/mV</span> ${info('Reading the ECG sheet','<p>One cursor follows the same instant across the sheet. Short panels show consecutive time windows; long rhythm strips cover the full sweep. Lead groups stay in the standard clinical order.</p>')}</div></section>${phaseControls()}</div></div>
  <div class="lead-explainer-grid"><section class="panel lead-detail-panel"><div><div class="section-label">Selected perspective</div><strong id="lead-detail-title"></strong><div class="lead-formula" id="lead-detail-formula"></div><p id="lead-detail-description"></p></div><div><label class="field-label" for="frontal-axis">Frontal model orientation <b id="frontal-axis-value">${signed(state.axis,0)}°</b></label><input type="range" id="frontal-axis" min="-150" max="180" step="5" value="${state.axis}"><p class="field-hint">Rotates the limb-lead source model. The lead axes stay fixed in patient coordinates. Camera rotation changes the view; chest morphology stays fixed.</p></div></section>${insight('Build toward the familiar ECG','Leads stay in the groups I–III, aVR–aVF, V1–V3 and V4–V6. Empty slots and groups collapse. With all twelve selected, the sheet becomes the standard 3 × 4 layout, with V1, II and V5 rhythm strips below.')}</div>
  <p class="physics-caption">A 12-lead ECG uses ten electrodes. Chest leads use WCT = (RA + LA + LL) / 3; RL is not part of that reference. Chest markers are approximate locations; RA*, LA*, LL* and RL* indicate remote limb connections. The anatomy and signal model share time; the lead arrows represent directions, not computed volume-conductor lead fields.</p>${bottom('rhythm','Next: use a stationary tracing and calipers to learn the normal measurements.')}`;}

function leadScaleGeometry(){
  // Keep all selected leads on one voltage scale, with room for their extrema.
  // Cache the one-cycle extent: dragging gain never re-evaluates the waveform.
  const key=[state.bpm,state.axis,...state.selectedLeads].join('|');
  if(leadExtent?.key!==key){
    let low=0,high=0;const rr=getFiducials(state.bpm).rr;
    for(const lead of state.selectedLeads)for(let t=0;t<rr;t+=.002){const v=sampleECG(t,lead,state.bpm,state.regions,state.axis);low=Math.min(low,v);high=Math.max(high,v);}
    leadExtent={key,low,high};
  }
  const positive=leadExtent.high*state.leadGain*2.1+12,negative=-leadExtent.low*state.leadGain*2.1+12;
  const geometry=minimum=>{const height=Math.max(minimum,Math.ceil(24+positive+negative)),plot=height-24;return {height,baselineFraction:(positive+(plot-positive-negative)/2)/plot};};
  const short=geometry(104),long=geometry(80);
  $('lead-comparisons')?.style.setProperty('--lead-row-height',short.height+'px');
  $('lead-rhythm-strips')?.style.setProperty('--rhythm-row-height',long.height+'px');
  return {short,long};
}
function setLeadGain(value){
  state.leadGain=Math.max(5,Math.min(40,Math.round(Number(value)||10)));
  if($('lead-gain')){$('lead-gain').value=state.leadGain;$('lead-gain').setAttribute('aria-valuetext',state.leadGain+' millimeters per millivolt');}
  if($('lead-gain-value'))$('lead-gain-value').textContent=state.leadGain+' mm/mV';
  if($('lead-gain-caption'))$('lead-gain-caption').textContent=state.leadGain+' mm/mV';
  if($('lead-gain-down'))$('lead-gain-down').disabled=state.leadGain===5;
  if($('lead-gain-up'))$('lead-gain-up').disabled=state.leadGain===40;
  if(leadGainFrame)return;
  leadGainFrame=requestAnimationFrame(()=>{
    leadGainFrame=0;if(state.module!=='leads'||!$('lead-paper-body'))return;
    const scale=leadScaleGeometry();
    for(const c of charts)c.set({gain:state.leadGain,axis:state.axis,baselineFraction:scale[c.canvas.id.startsWith('long-')?'long':'short'].baselineFraction});
  });
}
function rebuildLeadCharts(){
  destroyCharts();const scale=leadScaleGeometry();const groups=LEAD_COLUMNS.map(g=>g.filter(l=>state.selectedLeads.includes(l))).filter(g=>g.length),duration=leadDuration(),segment=duration/groups.length;
  $('lead-picker').innerHTML=LEAD_COLUMNS.flat().map(l=>`<button class="lead-chip ${state.selectedLeads.includes(l)?'active':''}" data-lead="${l}" aria-pressed="${state.selectedLeads.includes(l)}" aria-label="${state.selectedLeads.includes(l)?'Hide':'Show'} lead ${l}">${l}</button>`).join('');
  $('lead-comparisons').style.setProperty('--lead-columns',groups.length);$('lead-comparisons').style.setProperty('--lead-rows',Math.max(...groups.map(g=>g.length)));
  $('lead-comparisons').innerHTML=groups.map((g,i)=>`<div class="compact-lead-column"><div class="lead-window-label">${(i*segment).toFixed(1)}–${((i+1)*segment).toFixed(1)} s</div>${g.map(l=>`<div class="standard-lead-cell selected"><button class="lead-cell-toggle" data-lead="${l}" aria-label="Hide lead ${l}"><strong>${l}</strong><span>−</span></button><canvas id="lead-chart-${l}" aria-label="Stationary simulated lead ${l}"></canvas></div>`).join('')}</div>`).join('');
  groups.forEach((g,i)=>g.forEach(l=>chart('lead-chart-'+l,{lead:l,mode:'fixed',compact:true,edgeToEdge:true,playhead:false,windowStart:i*segment,windowSeconds:segment,mmPx:2.1,gain:state.leadGain,baselineFraction:scale.short.baselineFraction,paperSpeed:25,onSeek:seekTime,onGainChange:setLeadGain})));
  const rhythm=['V1','II','V5'].filter(l=>state.selectedLeads.includes(l));
  $('lead-rhythm-strips').innerHTML=rhythm.map(l=>`<div class="long-rhythm-row"><span>${l}</span><canvas id="long-${l}" aria-label="Long stationary rhythm strip lead ${l}"></canvas></div>`).join('');
  for(const l of rhythm)chart('long-'+l,{lead:l,mode:'fixed',compact:true,edgeToEdge:true,playhead:false,windowSeconds:duration,baselineFraction:scale.long.baselineFraction,mmPx:2.1,gain:state.leadGain,paperSpeed:25,onSeek:seekTime,onGainChange:setLeadGain});
  document.querySelectorAll('[data-lead]').forEach(b=>b.onclick=()=>{
    const l=b.dataset.lead;if(state.selectedLeads.includes(l)){if(state.selectedLeads.length===1){toast('Keep one lead visible to compare with the heart.');return;}state.selectedLeads=state.selectedLeads.filter(x=>x!==l);if(state.lead===l)state.lead=state.selectedLeads.at(-1);}else{state.selectedLeads.push(l);state.lead=l;}rebuildLeadCharts();updateLeadDetails();
  });updateLeadCursor();
}
function updateLeadCursor(){const t=mod(state.time,leadDuration());if($('lead-paper-cursor'))$('lead-paper-cursor').style.left=(100*t/leadDuration())+'%';if($('lead-sweep-time'))$('lead-sweep-time').textContent=t.toFixed(2)+' / '+leadDuration().toFixed(1)+' s';}
function updateLeadDetails(){const l=LEAD_INFO[state.lead];$('lead-detail-title').textContent=l.title;$('lead-detail-formula').textContent=l.formula;$('lead-detail-description').textContent=l.description;scene?.setLead(state.lead,state.selectedLeads);}
function bindLeads(){
  state.regions=allRegions();if(!state.selectedLeads.includes(state.lead))state.lead=state.selectedLeads[0];buildHeart(true);scene?.set({skin:state.skin,bones:state.bones,labels:state.labels,lead:state.lead,selectedLeads:state.selectedLeads,activation:true,beating:true,leadAxes:state.leadAxes,referencePlane:state.referencePlane});
  rebuildLeadCharts();updateLeadDetails();bindPhaseControls();bindAnatomyToggles();
  on('lead-gain','input',e=>setLeadGain(e.target.value));
  on('lead-gain-down','click',()=>setLeadGain(state.leadGain-5));on('lead-gain-up','click',()=>setLeadGain(state.leadGain+5));on('lead-gain-reset','click',()=>setLeadGain(10));
  on('frontal-axis','input',e=>{state.axis=Number(e.target.value);$('frontal-axis-value').textContent=signed(state.axis,0)+'°';setLeadGain(state.leadGain);});
  on('axes-toggle','change',e=>{state.leadAxes=e.target.checked;scene?.set({leadAxes:state.leadAxes});});on('plane-toggle','change',e=>{state.referencePlane=e.target.checked;scene?.set({referencePlane:state.referencePlane});});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{scene?.reset(b.dataset.view);});
  on('all-leads','click',()=>{state.selectedLeads=[...LEADS];rebuildLeadCharts();updateLeadDetails();});
  on('default-leads','click',()=>{state.selectedLeads=['I','II','V1'];state.lead='II';state.axis=60;$('frontal-axis').value=60;$('frontal-axis-value').textContent='+60°';rebuildLeadCharts();updateLeadDetails();});
}

// 04 — A stationary measurement desk, with adult reference values in view.
const INTERVALS={
  p:{title:'P wave',kicker:'Atrial depolarization',text:'Measure from P-wave onset to its return to baseline. P reflects the spread through the atria, not the sinus node’s action potential alone.',value:f=>(f.pEnd-f.pStart)*1000,range:'Adult duration <120 ms. In the limb leads, usual amplitude ≤0.25 mV.'},
  pr:{title:'PR interval',kicker:'Atria to ventricles',text:'Measure from the beginning of P to the beginning of QRS. The interval includes the P wave and conduction through the AV junction and His–Purkinje system. Starting at the end of P would measure only the PR segment.',value:f=>f.pr*1000,range:'Usual adult range: 120–200 ms.'},
  qrs:{title:'QRS duration',kicker:'Ventricular depolarization',text:'Measure the entire complex from its earliest deflection to its end at the J point. The R wave is only one component. Prolonged ventricular activation can widen QRS.',value:f=>f.qrs*1000,range:'Usually 70–110 ms. >110 ms is prolonged; ≥120 ms is the wide-QRS threshold commonly used for complete bundle branch block.'},
  st:{title:'ST segment',kicker:'The ventricular plateau',text:'The ST segment runs from the J point to T-wave onset. Its duration depends on rate and repolarization. Assess its level and shape against the isoelectric baseline in the relevant lead.',value:f=>(f.tStart-f.qrsEnd)*1000,range:'No universal normal ST-duration range. A near-isoelectric level is the teaching baseline; normal elevation limits are lead-, age- and sex-dependent.'},
  t:{title:'T wave',kicker:'Ventricular repolarization',text:'The T wave reflects ventricular recovery. Locate its end where it rejoins baseline, without including a separate U wave. Shape, amplitude and polarity vary by lead.',value:f=>(f.tEnd-f.tStart)*1000,range:'No universal T-wave duration range. Adults are usually upright in I, II and V3–V6 and negative in aVR; other leads can vary.'},
  qt:{title:'QT interval & QTc',kicker:'Activation through recovery',text:'Measure from QRS onset to the end of T. QT shortens with increasing heart rate, so an uncorrected QT does not have one rate-independent normal range. QTcB = QT / √RR; QTcF = QT / ∛RR, using seconds. Bazett can overcorrect at fast rates and undercorrect at slow rates.',value:f=>f.qt*1000,range:'Conventional adult prolonged-QTc thresholds: ≥450 ms for men and ≥460 ms for women. Thresholds and correction method require context.'},
  rr:{title:'RR interval & heart rate',kicker:'The interval between beats',text:'Measure between matching R peaks. For a regular rhythm, HR = 60 / RR in seconds. At 25 mm/s, 300 divided by large boxes estimates rate; at 50 mm/s use 600. Irregular rhythms require a longer sample.',value:f=>f.rr*1000,range:'Usual resting adult rate 60–100 bpm, equivalent to RR 600–1000 ms. Slower rates can be normal in trained or sleeping adults.'}
};
function rhythmTemplate(){return `${intro('04','Read the rhythm','A still tracing. <br class="title-break"><em>A clearer measurement.</em>','No playback here. Take your time with an ideal healthy ECG, compare each measurement with its adult reference, and place calipers directly on the stationary trace.')}
  <div class="rhythm-controls"><span class="badge">STATIONARY STUDY</span><label>Lead ${leadSelect('rhythm-lead',state.lead)}</label><label class="bpm-control">Rate <input type="range" id="rhythm-rate" min="45" max="120" value="${state.bpm}" aria-label="Heart rate"><b id="rhythm-rate-value">${state.bpm}</b></label><span class="spacer"></span><label>Paper <select class="select-field" id="paper-speed"><option value="25" ${state.paperSpeed===25?'selected':''}>25 mm/s</option><option value="50" ${state.paperSpeed===50?'selected':''}>50 mm/s</option></select></label><label>Gain <select class="select-field" id="paper-gain">${[5,10,20].map(g=>`<option value="${g}" ${state.gain===g?'selected':''}>${g} mm/mV</option>`).join('')}</select></label><button class="button ${state.annotations?'active':''}" id="annotations-toggle" aria-pressed="${state.annotations}">Wave labels</button><button class="button" id="calipers-toggle" aria-pressed="false">↔ Calipers</button></div>
  ${traceMarkup('rhythm-trace',{big:true,title:'An ideal healthy ECG · fixed on the page',height:285})}
  <div class="interval-tabs" role="tablist" aria-label="Wave and interval lesson">${[['p','P wave'],['pr','PR interval'],['qrs','QRS'],['st','ST segment'],['t','T wave'],['qt','QT / QTc'],['rr','RR / rate']].map(([id,title])=>`<button data-interval="${id}" role="tab" aria-selected="${state.interval===id}" class="${state.interval===id?'active':''}">${title}</button>`).join('')}</div><section id="interval-content" class="interval-content" role="tabpanel"></section>
  <section class="electrical-snapshot" aria-labelledby="snapshot-title"><div class="snapshot-model">${stageMarkup()}${electricalViewMarkup(state.electricalView)}</div><div class="electrical-snapshot-copy"><div class="section-label">Electrical snapshot</div><h2 id="snapshot-title"></h2><p id="snapshot-description"></p><span id="snapshot-time" class="snapshot-time"></span><p class="snapshot-note">Choose a wave or interval above to change the snapshot. Rotate the model or open a timing map without starting playback. The ECG remains the idealized measurement example.</p></div></section>
  <section class="reference-table-panel"><div class="reference-table-heading"><div><div class="section-label">Adult reference values</div><h2>Adult reference guide</h2></div><button class="text-button sources-trigger">Definitions & sources ↗</button></div><div class="table-scroll"><table class="normal-table"><thead><tr><th>Measurement</th><th>This ideal beat</th><th>Usual adult reference</th></tr></thead><tbody id="normal-range-rows"></tbody></table></div><p class="reference-caveat">References describe adults at rest and depend on age, sex, lead, method and clinical context. They are teaching guides, not stand-alone diagnostic cutoffs. QTc values use seconds in the correction formulas.</p></section>
  <div class="reference-grid"><div class="reference-card"><strong id="small-box-time">40 ms</strong><b>One small box, horizontally</b><p id="small-box-explanation"></p></div><div class="reference-card"><strong id="small-box-voltage">0.1 mV</strong><b>One small box, vertically</b><p id="small-box-voltage-note"></p></div><div class="reference-card"><strong id="rate-rule">300 ÷ boxes</strong><b>Estimate a regular rate</b><p id="rate-rule-explanation"></p></div></div>${bottom('library','Next: compare the ideal rhythm with real conduction and rhythm patterns.')}`;}
function updateInterval(){
  const f=getFiducials(state.bpm),it=INTERVALS[state.interval];$('interval-content').innerHTML=`<div><div class="section-label">${it.kicker}</div><h2>${it.title}</h2><p class="interval-summary">${it.text.split('. ')[0]}.</p>${info('Measuring '+it.title,`<p>${it.text}</p>`,'Measurement notes')}</div><div class="interval-metric"><div class="section-label">This ideal beat</div><div class="interval-big-value">${Math.round(it.value(f))}<span>ms</span></div><div class="interval-range">${it.range}</div>${state.interval==='qt'?`<p>QTcB <b>${Math.round(f.qtcB*1000)} ms</b> · QTcF <b>${Math.round(f.qtcF*1000)} ms</b></p>`:state.interval==='rr'?`<p>60 ÷ ${f.rr.toFixed(3)} = <b>${state.bpm} bpm</b></p>`:''}</div>`;
  document.querySelectorAll('[data-interval]').forEach(b=>{const active=b.dataset.interval===state.interval;b.classList.toggle('active',active);b.setAttribute('aria-selected',active);});mainChart?.set({interval:state.interval});updateNormalRanges();updateElectricalSnapshot();enhanceInfoPanels($('interval-content'));
}
function updateElectricalSnapshot(){
  const item=SNAPSHOTS[state.interval],f=getFiducials(state.bpm);if(!item||!$('snapshot-title'))return;
  state.time=item.at(f);state.running=false;
  $('snapshot-title').textContent=item.title;$('snapshot-description').textContent=item.text;
  $('snapshot-time').textContent='Frozen at '+Math.round(state.time*1000)+' ms into this beat';
  const label=document.querySelector('#scene .stage-label');if(label)label.innerHTML='<i class="tiny-dot"></i>Electrical snapshot';
}
function updateNormalRanges(){
  const f=getFiducials(state.bpm),ms=v=>Math.round(v*1000)+' ms';
  const rows=[
    ['Heart rate',state.bpm+' bpm','60–100 bpm at rest'],['RR interval',ms(f.rr),'600–1000 ms at 60–100 bpm'],
    ['P-wave duration',ms(f.pEnd-f.pStart),'<120 ms'],['P amplitude (lead II)','0.15 mV','≤0.25 mV in limb leads'],
    ['PR interval',ms(f.pr),'120–200 ms'],['PR segment',ms(f.qrsStart-f.pEnd),'No universal standalone cutoff; assess the entire PR interval'],['QRS duration',ms(f.qrs),'Usually 70–110 ms; ≥120 ms is wide'],
    ['QT interval',ms(f.qt),'Rate-dependent; interpret a corrected QT'],['QTc · Bazett',ms(f.qtcB),'Prolonged at ≥450 ms (men), ≥460 ms (women)'],['QTc · Fridericia',ms(f.qtcF),'Same conventional sex-specific teaching thresholds; methods differ'],
    ['ST duration',ms(f.tStart-f.qrsEnd),'No universal duration cutoff; assess level and shape'],['T-wave duration',ms(f.tEnd-f.tStart),'No universal duration cutoff; assess morphology and polarity']
  ];$('normal-range-rows').innerHTML=rows.map(([metric,value,range])=>`<tr><th scope="row">${metric}</th><td>${value}</td><td>${escapeHTML(range)}</td></tr>`).join('');
}
function updatePaper(){
  mainChart?.set({paperSpeed:state.paperSpeed,gain:state.gain});$('rhythm-trace-scale').textContent=state.paperSpeed+' mm/s · '+state.gain+' mm/mV';
  $('small-box-time').textContent=(1000/state.paperSpeed)+' ms';$('small-box-explanation').textContent=`At ${state.paperSpeed} mm/s, 1 small box represents ${(1/state.paperSpeed).toFixed(2)} seconds.`;
  $('small-box-voltage').textContent=(1/state.gain)+' mV';$('small-box-voltage-note').textContent=`At ${state.gain} mm/mV, 1 small box represents ${1/state.gain} millivolts.`;
  $('rate-rule').textContent=(state.paperSpeed*12)+' ÷ boxes';$('rate-rule-explanation').textContent=`Count large boxes between R peaks at ${state.paperSpeed} mm/s; use a longer strip for irregular rhythms.`;
  if(state.calipers&&state.caliperDelta!=null)showMeasurement(state.caliperDelta);
}
function showMeasurement(seconds){state.caliperDelta=seconds;$('rhythm-trace-footer').innerHTML=`<span class="caliper-value">↔ ${Math.round(seconds*1000)} ms <span>· ${(seconds*state.paperSpeed).toFixed(1)} small boxes</span></span>`;}
function bindRhythm(){
  buildHeart(false);scene?.set({activation:true,beating:false,labels:false,conduction:false,leadAxes:false,cutaway:true});
  mainChart=chart('rhythm-trace',{mode:'fixed',playhead:false,annotations:state.annotations,interval:state.interval,mmPx:5,onMeasure:showMeasurement});
  on('rhythm-lead','change',e=>{state.lead=e.target.value;mainChart.set({lead:state.lead});$('rhythm-trace-lead').textContent='LEAD '+state.lead;});
  on('rhythm-rate','input',e=>{state.bpm=Number(e.target.value);$('rhythm-rate-value').textContent=state.bpm;$('rhythm-trace-rate').textContent=state.bpm+' BPM';mainChart.set({bpm:state.bpm});updateInterval();});
  on('paper-speed','change',e=>{state.paperSpeed=Number(e.target.value);updatePaper();});on('paper-gain','change',e=>{state.gain=Number(e.target.value);updatePaper();});
  on('annotations-toggle','click',e=>{state.annotations=!state.annotations;e.currentTarget.classList.toggle('active',state.annotations);e.currentTarget.setAttribute('aria-pressed',state.annotations);mainChart.set({annotations:state.annotations});});
  on('calipers-toggle','click',e=>{state.calipers=!state.calipers;e.currentTarget.classList.toggle('active',state.calipers);e.currentTarget.setAttribute('aria-pressed',state.calipers);mainChart.set({calipers:state.calipers,mode:'fixed'});if(state.calipers)toast('Drag the calipers. Keyboard: 1 / 2 selects a handle; arrow keys move it.');else $('rhythm-trace-footer').textContent='Stationary teaching trace · calipers do not start playback';});
  document.querySelectorAll('[data-interval]').forEach(b=>b.onclick=()=>{state.interval=b.dataset.interval;updateInterval();});updateInterval();updatePaper();
}

// 05 — Authentic source recordings, with separately described teaching motion.
function libraryTemplate(){return `${intro('05','The real world','Recognize the tracing. <br class="title-break"><em>Understand the mechanism.</em>','Explore rhythm, conduction, hypertrophy, axis and regional injury patterns. Click any point on the stationary ECG to jump there and inspect the heart at that instant.')}
  <div id="library-content" class="placeholder">Loading clinical examples…</div>${bottom('sandbox','Next: combine electrical changes and see how the simulated signal responds.')}`;}
async function fetchData(){
  if(data)return data;
  if(!dataPromise)dataPromise=Promise.all(['clinical-ecgs.json','clinical-extra.json','clinical-mobitz2.json','clinical-stemi.json','clinical-tachyarrhythmias.json','clinical-torsades.json','pathology-fits/source/ptbxl-03155-500hz.json'].map(name=>fetch('./data/'+name).then(r=>{if(!r.ok)throw Error('Recording data unavailable');return r.json();}))).then(collections=>{
    const native=collections.pop(),r=collections[0].records.find(r=>r.id==='ptbxl-03155');
    if(r&&native.signals){r.signals=native.signals;r.fs=native.fs;r.seconds=native.seconds;r.sampleCount=native.sampleCount;r.recordUrl=native.source.recordUrl;r.downloadUrl=native.source.downloadUrl;r.recordSha256=native.source.recordSha256;r.checksumVerified=native.source.checksumVerified;r.notes=[...(r.notes||[]),'This RBBB view uses the original 500 Hz edition of PTB-XL record 03155, also used for the fitted beat. Its source samples are unchanged; the previously bundled 100 Hz edition remains in the downloadable clinical-ecgs.json.'];}
    return data=decorateClinicalData(...collections);
  }).catch(e=>{dataPromise=null;throw e;});
  return dataPromise;
}
async function loadLibrary(token){try{await fetchData();if(token!==routeToken)return;renderLibrary(true);}catch(error){if(token!==routeToken)return;$('library-content').className='data-error';$('library-content').innerHTML='The clinical recordings could not load. <button class="button" id="retry-data">Try again</button>';on('retry-data','click',()=>loadLibrary(token));console.error(error);}}
function clinicalTeaching(i){const p=recordProfile(data.records[i]);return p.observe||p.ecg||p.headline||p.summary||'Follow atrial and ventricular activation while inspecting the original tracing.';}
function clinicalLeadList(r){return [...(r.leadOrder||r.leadNames||LEADS),...Object.keys(r.signals||{})].filter((l,i,a)=>a.indexOf(l)===i&&r.signals[l]);}
function clinicalLeadSelect(r){return `<select id="clinical-lead" class="select-field" aria-label="EKG lead">${clinicalLeadList(r).map(l=>`<option value="${l}" ${l===state.clinicalLead?'selected':''}>${l==='MLII'?'MLII · modified lead II':/^ECG\d+$/.test(l)?l+' · recorded channel':'Lead '+l}${['V7','V8','V9'].includes(l)?' · posterior':''}</option>`).join('')}</select>`;}
function clinicalViewLabel(r){return state.clinicalAll?'Single channel':'All '+clinicalLeadList(r).length+(clinicalLeadList(r).length===12?' leads':' channels');}
function clinicalRhythmFacts(r){
  if(r.group!=='tachyarrhythmia')return '';
  const rate=r.rateSummary,kind=r.teaching.rhythmKind;
  const value=rate?.hasDiscreteBeats?`≈${Math.round(rate.meanBpm)} bpm`:kind==='vf'?'No discrete QRS rate':'No validated beat timing';
  const rateLabel=rate?.hasDiscreteBeats?(rate.approximate?'Estimated ventricular rate':'Mean ventricular rate'):'Ventricular timing';
  const timing=kind==='torsades'?'Motion timing: schematic':kind==='vf'?'Continuous schematic activity':rate?.approximate?'Motion timing: estimated landmarks':'Motion timing: source beat markers';
  const detail=kind==='torsades'?'The source identifies the episode; individual contractions are not aligned to the trace.':kind==='vf'?'Continuous wavefronts and local quivering; no coordinated ejection squeeze.':rate?.approximate?'Waveform landmarks align the motion. Exact activation and contraction remain illustrative.':'Recorded ventricular events align the motion. Atrial timing and regional spread remain illustrative.';
  return `<div class="clinical-rhythm-facts"><div class="rhythm-rate-fact"><span>${rateLabel}</span><strong>${value}</strong></div><div class="rhythm-timing-fact"><strong>${timing}</strong><span>${detail}</span></div></div>`;
}
function syncClinicalAxis(){
  const known=[...LEADS,'V7','V8','V9'].includes(state.clinicalLead);
  scene?.setLead(state.clinicalLead);scene?.set({leadAxes:state.leadAxes&&known});
  const toggle=$('clinical-axis');if(toggle){toggle.disabled=!known;toggle.checked=state.leadAxes&&known;}
  if($('clinical-axis-note'))$('clinical-axis-note').textContent=known?'The arrow points along the selected lead’s positive direction.':state.clinicalLead==='MLII'?'MLII uses a modified electrode setup; its exact 3D axis is unavailable and is not drawn.':'The source does not specify this channel’s electrode geometry; a 3D lead axis is unavailable.';
}
function clinicalTimingNotes(r){
  if(!r.timingProvenance)return '';
  if(r.teaching?.notes?.length)return r.teaching.notes.map(n=>`<p>${escapeHTML(n)}</p>`).join('');
  const source=r.timingProvenance.atrialTimingSource,offset=Math.round((r.timingProvenance.qrsAnchorOffset??.04)*1000),notes=[r.timingProvenance.qrsOnsetSource==='source-cardiologist-qrs-onsets'?'The source cardiologists’ waveform annotations anchor the electrical events. Regional spread and all contraction remain teaching illustrations.':`For synchronization, ventricular activation begins approximately ${offset} ms before each selected QRS event marker. The activation onset and duration are teaching estimates.`];
  if(source==='independent-illustrative-clock')notes.push('A complete reliable series of P-wave onsets is unavailable because some atrial deflections overlap QRS or T waves. Atrial motion therefore follows an independent illustrative 98/min clock with an assumed phase. The large atrial deflection near 0.41 s is not counted as a ventricular beat.');
  else if(source==='approximate-visible-p-onsets')notes.push('P-wave beginnings were estimated visually to synchronize the atrial events, including nonconducted events. Their uncertainty is several tens of milliseconds; measure the original trace for clinical PR intervals.');
  else if(source==='source-cardiologist-p-onsets')notes.push('Atrial events use source cardiologist P-wave annotations. These waveform annotations do not measure regional atrial activation or contraction.');
  else notes.push('The reference animation places atrial activation 160 ms before each estimated ventricular onset. That delay is prescribed for teaching and is not a PR measurement from this patient.');
  if(['leftaxis','rightaxis','rvh'].includes(r.conditionId))notes.push('The source supplies an axis category. Numeric angles used in the reference model are illustrative; the RVH example retains its source normal-axis category.');
  return notes.map(n=>`<p>${escapeHTML(n)}</p>`).join('');
}
function renderLibrary(resetTime=false){
  document.querySelector('.clinical-case-browser')?._caseBrowserCleanup?.();
  closeInfoPanels();
  fitExplorer?.destroy();fitExplorer=null;scene?.destroy();scene=null;destroyCharts();const r=data.records[state.recordIndex],profile=recordProfile(r),real=!r.synthetic;
  const hasFit=FITTED_RECORDS.includes(r.id);
  if(!r.signals[state.clinicalLead])state.clinicalLead=r.recommendedLead||clinicalLeadList(r)[0];
  if(resetTime){const first=recordBeats(r)[0];state.time=first?Math.max(0,(first.qrsOnset??first.time)-.18):0;state.running=!reduced;}
  state.clinicalState=recordState(r,state.time);
  $('library-content').className='clinical-lab';$('library-content').innerHTML=`
  <div class="clinical-layout">${renderCaseBrowser(data.records,{recordIndex:state.recordIndex,group:state.clinicalGroup})}<section class="clinical-case-workspace" aria-label="Selected clinical case">
  <section class="clinical-record-header"><div class="clinical-case-heading"><div class="clinical-case-title"><h2>${escapeHTML(r.title)}</h2>${info('About this case',`<p>${escapeHTML(r.description||profile.summary||profile.observe||'')}</p>`)}</div><div class="badge ${real?'coral':'simulation-badge'}">${hasFit&&state.clinicalFit?'REAL ECG · FITTED SOURCE MODEL':real?'REAL ECG · ILLUSTRATIVE MOTION':'SIMULATED ECG · TEACHING MODEL'}</div></div><div class="clinical-case-actions">
  ${hasFit?`<div class="clinical-fit-tabs" role="group" aria-label="Clinical evidence view"><button id="clinical-original-view" class="${state.clinicalFit?'':'active'}" aria-pressed="${!state.clinicalFit}">Recording & anatomy</button><button id="clinical-fitted-view" class="${state.clinicalFit?'active':''}" aria-pressed="${state.clinicalFit}"><span class="fit-tab-dot"></span>Fitted model</button>${info('Recording and fitted model','<p>The recording view pairs unchanged ECG samples with illustrative reference anatomy. The fitted view compares a recorded beat or rhythm window with an inferred spatial source model. Its fields are explanatory hypotheses, not measured patient activation maps.</p>')}</div>`:''}
  ${real?`<div class="clinical-source-links"><a class="text-button" href="${escapeHTML(r.recordUrl)}" target="_blank" rel="noopener">Source record ↗</a>${r.publicationUrl?`<a class="text-button" href="${escapeHTML(r.publicationUrl)}" target="_blank" rel="noopener">Source study ↗</a>`:""}</div>`:r.sandboxCompatible===false?'':'<button id="case-to-sandbox" class="button small">Customize in Sandbox →</button>'}</div></section>
  <div id="clinical-fit-host" ${state.clinicalFit&&hasFit?'':'hidden'}></div><div id="clinical-original-workspace" ${state.clinicalFit&&hasFit?'hidden':''}>
  <div class="clinical-workspace"><div class="clinical-anatomy">${stageMarkup(false,true,{controls:true})}${electricalViewMarkup(state.electricalView)}<div class="anatomy-layer-controls">${switchRow('Activation','clinical-activation',true)}${switchRow('Pathways','clinical-pathways',true)}${switchRow('Contraction','clinical-contraction',true)}${switchRow('Lead axis','clinical-axis',state.leadAxes)}${r.injuryTerritory?switchRow('Injury territory','clinical-injury',true):''}</div><p class="credit-inline">Reference anatomy · <span id="clinical-axis-note"></span> ${real?'Motion illustrates a mechanism; it is not measured from this patient.':'Waveforms and mechanics are prescribed teaching examples.'}</p></div>
  <div class="clinical-evidence"><div class="library-toolbar">${clinicalLeadSelect(r)}<select id="clinical-gain" class="select-field" aria-label="Clinical signal gain">${[5,10,20].map(g=>`<option value="${g}" ${state.clinicalGain===g?'selected':''}>${g} mm/mV</option>`).join('')}</select><button class="button ${state.clinicalAll?'active':''}" id="clinical-all">${clinicalViewLabel(r)}</button><small>${r.seconds} s · ${r.fs} Hz</small></div><div id="clinical-traces"></div>${clinicalRhythmFacts(r)}
  <div class="mechanism-readout"><div class="section-label">What is happening now</div><h3 id="clinical-phase-title">${escapeHTML(profile.title||r.title)}</h3><p id="clinical-phase-description">${clinicalTeaching(state.recordIndex)}</p><div class="activity-bars">${[['ra','Right atrium'],['la','Left atrium'],['rv','Right ventricle'],['lv','Left ventricle']].map(([id,label])=>`<div><span id="activity-label-${id}">${label}</span><i><b id="activity-${id}"></b></i></div>`).join('')}</div><small>Bars show schematic electrical activation, not measured contraction force.</small></div>
  ${phaseControls({clinical:true})}<div class="mechanism-copy"><div><span class="mechanism-label">Electrical sequence</span><p>${escapeHTML(profile.electrical||profile.conduction||clinicalTeaching(state.recordIndex))}</p></div><div><span class="mechanism-label">Mechanical consequence</span><p>${escapeHTML(profile.mechanical||profile.mechanicsDescription||'Contraction follows electrical activation; regional motion is illustrative.')}</p></div></div></div></div>
  ${r.id==='ptbxl-00818'?'<div class="control-actions event-jump"><button id="jump-pvc" class="button soft">Inspect the premature beat at 8.00 s →</button><span>The early broad complex and following pause are visible in the real recording.</span></div>':''}
  ${(r.teaching?.focusEvents||[]).map(e=>`<div class="control-actions event-jump"><button class="button soft" data-clinical-event="${e.time}">${escapeHTML(/^Inspect /i.test(e.label)?e.label:'Inspect the '+e.label.replace(/^./,c=>c.toLowerCase()))} at ${e.time.toFixed(2)} s →</button><span>${e.kind==='av-block'?'Follow the atrial event without a ventricular beat.':e.approximate?'The episode is source-identified; its graphical alignment is approximate.':'Jump to the source event and inspect the tracing.'}</span></div>`).join('')}
  ${insight('Look for the mechanism',clinicalTeaching(state.recordIndex))}
  <details class="record-notes"><summary>${real?'How the recording and animation are linked':'How this teaching simulation is constructed'}</summary><p>${real?`Original ${r.fs} Hz samples remain unchanged. ${r.group==='tachyarrhythmia'&&!r.rateSummary?.hasDiscreteBeats?'The source identifies the rhythm window; 3D motion timing is schematic and is not matched to individual recorded complexes.':'Recorded event markers or annotated waveform landmarks synchronize the teaching animation; the timing method for this record is described below.'} Regional activation and all contraction are illustrative. Playback pauses at the record boundary.`:'This example is generated from scheduled atrial and ventricular events. It is a teaching pattern with known assumptions, rather than a clinical recording.'}</p>${clinicalTimingNotes(r)}<p>${(r.notes||[]).filter(n=>!/playback repeats|repeating this.*recording/i.test(n)&&!(r.teaching?.notes||[]).includes(n)).map(n=>escapeHTML(n)).join(' ')}</p>${real?`<p>${escapeHTML(r.attribution)} <a href="${escapeHTML(r.licenseUrl)}" target="_blank" rel="noopener">${escapeHTML(r.license)} ↗</a></p>`:''}<button class="text-button sources-trigger">Mechanism sources & model limitations ↗</button></details></div></section></div>`;
  if(!(state.clinicalFit&&hasFit)){buildHeart(false);scene?.set({activation:true,beating:true,labels:false,axisLabels:true,conduction:true,cutaway:state.cutaway,injuryVisible:true});syncClinicalAxis();}
  const selectRecord=index=>{if(!data.records[index])return;state.recordIndex=index;state.clinicalGroup=data.records[index].group;state.clinicalLead=data.records[index].recommendedLead||'II';state.clinicalFit=false;renderLibrary(true);const focusTarget=document.querySelector('.clinical-case-disclosure:not([open]) > summary')||document.querySelector(`[data-record="${index}"]`);focusTarget?.focus({preventScroll:true});};
  const chooseFit=active=>{state.clinicalFit=active;renderLibrary(false);$(active?'clinical-fitted-view':'clinical-original-view')?.focus({preventScroll:true});};
  on('clinical-original-view','click',()=>chooseFit(false));on('clinical-fitted-view','click',()=>chooseFit(true));
  bindCaseBrowser($('library-content'),{onSelect:selectRecord,onGroup:group=>{
    const first=data.records.findIndex(record=>record.group===group);if(first<0)return;
    const keepBrowserOpen=document.querySelector('.clinical-case-disclosure')?.open;
    state.clinicalGroup=group;
    if(data.records[state.recordIndex].group!==group)selectRecord(first);else renderLibrary(false);
    if(keepBrowserOpen)document.querySelector('.clinical-case-disclosure').open=true;
    const focusTarget=document.querySelector('.clinical-case-disclosure:not([open]) > summary')||document.querySelector(`[data-record-group="${group}"]`);focusTarget?.focus({preventScroll:true});
  }});
  on('clinical-lead','change',e=>{state.clinicalLead=e.target.value;syncClinicalAxis();renderClinicalCharts();});on('clinical-gain','change',e=>{state.clinicalGain=Number(e.target.value);renderClinicalCharts();});on('clinical-all','click',()=>{state.clinicalAll=!state.clinicalAll;renderClinicalCharts();$('clinical-all').textContent=clinicalViewLabel(r);$('clinical-all').classList.toggle('active',state.clinicalAll);});
  on('clinical-activation','change',e=>scene?.set({activation:e.target.checked}));on('clinical-pathways','change',e=>scene?.set({conduction:e.target.checked}));on('clinical-contraction','change',e=>scene?.set({beating:e.target.checked}));on('clinical-axis','change',e=>{state.leadAxes=e.target.checked;scene?.set({leadAxes:state.leadAxes});});on('clinical-injury','change',e=>scene?.set({injuryVisible:e.target.checked}));
  on('case-to-sandbox','click',()=>{state.sandbox=normalizeConfig({...DEFAULT_SANDBOX_CONFIG,...r.config});location.hash='sandbox';});
  if(!(state.clinicalFit&&hasFit))renderClinicalCharts();bindPhaseControls({clinical:true});bindCommon();for(const id of ['previous-beat','next-beat'])if($(id)){const unavailable=!recordBeats(r).length;$(id).disabled=unavailable;$(id).title=unavailable?'No validated discrete beat markers in this excerpt':'';}on('jump-pvc','click',()=>seekTime(8));document.querySelectorAll('[data-clinical-event]').forEach(b=>b.onclick=()=>seekTime(Number(b.dataset.clinicalEvent)));
  if(state.clinicalFit&&hasFit){scene?.destroy();scene=null;destroyCharts();fitExplorer=new FitExplorer($('clinical-fit-host'),{recordId:r.id,title:r.title,conditionId:r.conditionId,lead:state.clinicalLead,speed:state.speed,onSpeed:setPlaybackSpeed,onLead:value=>{state.clinicalLead=value;},onOriginal:()=>chooseFit(false)});}
}
function renderClinicalCharts(){
  destroyCharts();clinicalChartWindow=null;const r=data.records[state.recordIndex],duration=r.seconds,leads=clinicalLeadList(r);$('clinical-gain').disabled=false;
  $('clinical-original-workspace')?.classList.toggle('clinical-multilead',state.clinicalAll);
  if(state.clinicalAll){
    const scale=clinicalGridScale(r,leads,state.clinicalGain),{height}=scale;
    clinicalChartWindow=clinicalWindow(r,state.time,state.clinicalWindowSeconds);
    const viewport=clinicalChartWindow;
    const cell=l=>`<div class="lead-small"><div class="lead-small-title"><strong>${l}</strong><span>mV</span></div><canvas id="clinical-${l}" style="height:${height}px" aria-label="ECG lead ${l}"></canvas></div>`;
    const fullStandard=LEADS.every(l=>leads.includes(l)),additional=leads.filter(l=>!LEADS.includes(l));
    const grid=fullStandard?`<div class="clinical-standard-grid">${LEAD_GRID.flat().map(cell).join('')}</div>${additional.length?`<div class="posterior-lead-heading">Additional recorded perspectives</div><div class="clinical-posterior-grid">${additional.map(cell).join('')}</div>`:''}`:`<div class="clinical-limited-grid">${leads.map(cell).join('')}</div>`;
    $('clinical-traces').innerHTML=`<div class="clinical-window-controls"><label>Time window <select id="clinical-window" class="select-field" aria-label="Clinical grid time window"><option value="2.5" ${state.clinicalWindowSeconds===2.5?'selected':''}>2.5 s · detail</option><option value="5" ${state.clinicalWindowSeconds===5?'selected':''}>5 s</option><option value="0" ${state.clinicalWindowSeconds===0?'selected':''}>Full ${duration} s</option></select></label><div class="clinical-window-navigation"><button id="clinical-window-previous" class="button small" aria-label="Previous ECG window">←</button><span id="clinical-window-range" aria-live="polite"></span><button id="clinical-window-next" class="button small" aria-label="Next ECG window">→</button></div></div>${grid}<p class="clinical-scale-note"><b>Same time and voltage scale in every panel.</b> ${(1/state.clinicalGain).toFixed(state.clinicalGain===20?2:1)} mV per vertical small box · 40 ms per horizontal small box. Time is fitted to each panel; waveforms stay fixed until the next window. Click or drag any lead to seek${fullStandard?'.':' · only the '+leads.length+' recorded channels.'}</p>`;
    for(const l of leads)chart('clinical-'+l,{record:r,lead:l,mode:'fixed',compact:true,voltageTicks:true,windowStart:viewport.start,windowSeconds:viewport.duration,playhead:true,playheadPeriod:duration+.01,mmPx:scale.mmPx,gain:state.clinicalGain,paperSpeed:25,baselineFraction:scale.baselineFraction,onSeek:seekTime}).render(state.time);
    on('clinical-window','change',e=>{state.clinicalWindowSeconds=Number(e.target.value);renderClinicalCharts();});
    for(const direction of [-1,1])on('clinical-window-'+(direction<0?'previous':'next'),'click',()=>{
      const w=clinicalChartWindow,index=Math.max(0,Math.min(w.count-1,w.index+direction));seekTime(index*w.pageSeconds);syncClinicalChartWindow();
    });
    updateClinicalWindowLabels();
  }else{
    const samples=r.signals[state.clinicalLead],high=Math.max(0,...samples),low=Math.min(0,...samples),pxPerMV=4*state.clinicalGain;
    const plotHeight=Math.max(133,(high-low)*pxPerMV+24),height=Math.ceil(47+plotHeight),baselineFraction=(high*pxPerMV+12)/plotHeight;
    $('clinical-traces').innerHTML=traceMarkup('clinical-main',{clinical:true,title:r.synthetic?(r.injuryTerritory?'A simulated regional injury pattern':'A simulated conduction pattern'):'The original clinical recording',height});
    mainChart=chart('clinical-main',{record:r,lead:state.clinicalLead,mode:'fixed',annotations:false,windowSeconds:duration,playhead:true,playheadPeriod:duration+.01,mmPx:4,gain:state.clinicalGain,paperSpeed:25,baselineFraction,onSeek:seekTime});
    if(/^ECG\d+$/.test(state.clinicalLead))$('clinical-main-lead').textContent='CHANNEL '+state.clinicalLead.slice(3);
    $('clinical-main-rate').textContent=r.fs+' Hz';$('clinical-main-scale').textContent=duration+' s overview · '+(1/state.clinicalGain)+' mV / vertical small box';$('clinical-main-footer').textContent='Click the tracing to seek · drag to scrub';
    document.querySelector('#clinical-traces .badge').textContent=r.synthetic?'TEACHING MODEL':'REAL RECORDING';
  }
}

function updateClinicalWindowLabels(){
  if(!clinicalChartWindow||!$('clinical-window-range'))return;
  const w=clinicalChartWindow;$('clinical-window-range').textContent=`${w.start.toFixed(1)}–${w.end.toFixed(1)} s · ${w.index+1}/${w.count}`;
  $('clinical-window-previous').disabled=w.index===0;$('clinical-window-next').disabled=w.index===w.count-1;
}
function syncClinicalChartWindow(){
  if(state.module!=='library'||!state.clinicalAll||!clinicalChartWindow||!data)return;
  const next=clinicalWindow(data.records[state.recordIndex],state.time,state.clinicalWindowSeconds);
  if(next.start===clinicalChartWindow.start&&next.duration===clinicalChartWindow.duration)return;
  clinicalChartWindow=next;
  for(const c of charts)c.set({windowStart:next.start,windowSeconds:next.duration});
  updateClinicalWindowLabels();
}

// 06 — Compose compatible changes on one event-based signal model.
const SANDBOX_PRESETS=[
  {name:'Healthy sinus',config:{}},
  {name:'Wenckebach',config:{avBlock:'mobitz1'}},
  {name:'Complete block',config:{avBlock:'complete',rate:80,escapeRate:36}},
  {name:'RBBB + right axis',config:{bundle:'rbbb',axis:120}},
  {name:'LVH + left axis',config:{hypertrophy:'lvh',axis:-45}},
  {name:'AF + LVH',config:{rhythm:'afib',rate:90,hypertrophy:'lvh'}},
  {name:'AF + complete block',config:{rhythm:'afib',avBlock:'complete',rate:90,escapeRate:38}},
  {name:'Sinus + PVCs',config:{pvc:true}}
];
function sandboxSelect(id,label,options,value){return `<label class="sandbox-field" for="${id}"><span>${label}</span><select id="${id}" class="select-field">${options.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></label>`;}
function sandboxTemplate(){const c=state.sandbox;return `${intro('06','Sandbox','Build a rhythm. <br class="title-break"><em>See what changes.</em>','Combine timing, conduction, chamber-voltage patterns and electrical orientation. Follow their effects on one simulated ECG, with the atria and ventricles running on the appropriate clocks.')}
  <div class="sandbox-presets"><label class="sandbox-preset-select" for="sandbox-preset">Load a preset <select id="sandbox-preset" class="select-field"><option value="" selected disabled>Choose an example…</option>${SANDBOX_PRESETS.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('')}</select></label><span class="badge simulation-badge">Teaching simulation</span></div>
  <div class="sandbox-workspace"><section class="panel sandbox-controls"><div class="panel-header"><h2>Adjust the rhythm</h2><span class="badge simulation-badge">SIMULATION</span></div>
  ${sandboxSelect('sb-rhythm','Atrial rhythm',[['sinus','Organized sinus rhythm'],['afib','Atrial fibrillation']],c.rhythm)}
  <div class="sandbox-field"><label for="sb-rate"><span id="sb-rate-label">Sinus / atrial rate</span><b id="sb-rate-value">${c.rate} /min</b></label><input id="sb-rate" type="range" min="30" max="160" step="1" value="${c.rate}" aria-label="Sandbox heart rate"></div>
  ${sandboxSelect('sb-avblock','AV conduction',[['none','Normal conduction'],['first','First-degree AV delay'],['mobitz1','Mobitz I · Wenckebach'],['mobitz2','Mobitz II'],['complete','Complete heart block']],c.avBlock)}
  <p class="sandbox-control-note" id="sb-av-note">Each atrial impulse is scheduled before conduction is applied.</p>
  <div class="sandbox-field hidden" id="sb-escape-field"><label for="sb-escape"><span>Independent escape rate</span><b id="sb-escape-value">${c.escapeRate} /min</b></label><input id="sb-escape" type="range" min="25" max="60" step="1" value="${c.escapeRate}" aria-label="Ventricular escape rate"></div>
  ${sandboxSelect('sb-bundle','Intraventricular conduction',[['none','Normal bundle conduction'],['rbbb','Right bundle branch block'],['lbbb','Left bundle branch block']],c.bundle)}
  ${sandboxSelect('sb-hypertrophy','Chamber-voltage pattern',[['none','Usual chamber contributions'],['lvh','Left ventricular hypertrophy pattern'],['rvh','Right ventricular hypertrophy pattern']],c.hypertrophy)}
  <div class="sandbox-field"><label for="sb-axis"><span>Frontal QRS source direction</span><b id="sb-axis-value">${signed(c.axis,0)}°</b></label><input id="sb-axis" type="range" min="-180" max="180" step="5" value="${c.axis}" aria-label="Simulated frontal QRS axis"><div class="axis-shortcuts"><button data-sandbox-axis="-60">Left −60°</button><button data-sandbox-axis="60">Usual +60°</button><button data-sandbox-axis="120">Right +120°</button></div></div>
  ${switchRow('Add occasional PVCs','sb-pvc',c.pvc)}<div class="panel-divider"></div>${switchRow('Show sinus reference','sb-reference',state.sandboxReference)}${switchRow('Show lead axis in 3D','sb-lead-axis',state.sandboxAxes)}<button id="sb-reset" class="button soft sandbox-reset">Reset to healthy sinus</button>
  <p class="sandbox-control-note">One atrial rhythm and one bundle pattern are selected at a time. PR-based block lessons require organized atrial activity. AF can also coexist with complete AV block and an independent ventricular escape rhythm.</p></section>
  <div class="sandbox-study"><div class="sandbox-preview-head"><div><div class="section-label">Your combination</div><div id="sandbox-combination" class="combination-tags"></div></div>${leadSelect('sandbox-lead',state.sandboxLead)}</div>${stageMarkup(false,true)}${anatomyViewControls()}<div id="sandbox-trace"></div><div id="sandbox-event-rail" class="sandbox-event-rail"></div>${phaseControls({clinical:true})}</div></div>
  <section class="sandbox-results"><div class="reference-table-heading"><div><div class="section-label">Read the consequences</div><h2>Resulting measurements</h2></div><span class="badge simulation-badge">MODEL VALUES</span></div><div id="sandbox-metrics" class="sandbox-metrics"></div><div id="sandbox-model-notes" class="sandbox-model-notes"></div></section>
  <details class="record-notes"><summary>How these changes combine</summary><p>The model first schedules atrial events, then decides which impulses conduct or are blocked. Ventricular escape and premature events have their own timing. P-wave, QRS and recovery contributions add to produce the signal; chamber-voltage and axis settings change the source contributions and their projections.</p><p>Timing changes interact. A missing ventricular event removes its QRS and associated recovery waveform, while preserving the atrial event. Complete heart block uses independent atrial and ventricular clocks. Selecting two whole rhythms and simply adding them would not represent these mechanisms.</p><p>The gray reference is an unmodified sinus model at the selected rate. All waveforms here are original teaching simulations. The controls do not predict a patient's exact tracing, chamber dimensions, contraction strength or risk.</p><button class="text-button sources-trigger">Scientific sources & model notes ↗</button></details>${bottom('electricity','Return to the membrane, wave, and lead to reconnect the signal with its first principles.')}`;}
function bindSandbox(){
  buildHeart(false);scene?.set({activation:true,beating:true,labels:false,axisLabels:true,conduction:true,lead:state.sandboxLead,leadAxes:state.sandboxAxes,cutaway:state.cutaway});
  const change=(key,value)=>{const input={...state.sandbox,[key]:value};rebuildSandbox(input);state.running=false;updatePlayButton();};
  for(const [id,key]of[['sb-rhythm','rhythm'],['sb-avblock','avBlock'],['sb-bundle','bundle'],['sb-hypertrophy','hypertrophy']])on(id,'change',e=>change(key,e.target.value));
  for(const [id,key]of[['sb-rate','rate'],['sb-escape','escapeRate'],['sb-axis','axis']])on(id,'input',e=>change(key,Number(e.target.value)));
  on('sb-pvc','change',e=>change('pvc',e.target.checked));
  on('sb-reference','change',e=>{state.sandboxReference=e.target.checked;renderSandboxChart();});
  on('sb-lead-axis','change',e=>{state.sandboxAxes=e.target.checked;scene?.set({leadAxes:state.sandboxAxes,cutaway:state.cutaway});});
  on('sandbox-lead','change',e=>{state.sandboxLead=e.target.value;scene?.setLead(state.sandboxLead);renderSandboxChart();});
  on('sandbox-preset','change',e=>{const preset=SANDBOX_PRESETS[Number(e.target.value)];if(!preset)return;state.time=0;rebuildSandbox({...DEFAULT_SANDBOX_CONFIG,...preset.config});state.running=false;updatePlayButton();e.target.value='';});
  document.querySelectorAll('[data-sandbox-axis]').forEach(b=>b.onclick=()=>change('axis',Number(b.dataset.sandboxAxis)));
  on('sb-reset','click',()=>{state.time=0;state.sandboxLead='II';$('sandbox-lead').value='II';scene?.setLead('II');rebuildSandbox({...DEFAULT_SANDBOX_CONFIG});state.running=false;updatePlayButton();});
  rebuildSandbox(state.sandbox);bindPhaseControls({clinical:true});bindCommon();
}
function rebuildSandbox(input){
  sandboxModel=createSandboxModel(input);state.sandbox={...sandboxModel.config};const c=state.sandbox;
  sandboxReference=createSandboxModel({...DEFAULT_SANDBOX_CONFIG,rate:c.rate});
  state.time=Math.min(state.time,sandboxModel.seconds-1/sandboxModel.fs);
  for(const [id,key]of[['sb-rhythm','rhythm'],['sb-avblock','avBlock'],['sb-bundle','bundle'],['sb-hypertrophy','hypertrophy'],['sb-rate','rate'],['sb-escape','escapeRate'],['sb-axis','axis']])$(id).value=c[key];
  $('sb-pvc').checked=c.pvc;$('sb-rate-value').textContent=c.rate+' /min';$('sb-axis-value').textContent=signed(c.axis,0)+'°';$('sb-escape-value').textContent=c.escapeRate+' /min';
  const afComplete=c.rhythm==='afib'&&c.avBlock==='complete';
  $('sb-rate-label').textContent=afComplete?'Stored rate · inactive':c.rhythm==='afib'?'Mean ventricular rate':'Sinus / atrial rate';$('sb-rate').disabled=afComplete;$('sb-rate').closest('.sandbox-field').classList.toggle('inactive',afComplete);
  for(const option of $('sb-avblock').options)option.disabled=c.rhythm==='afib'&&['first','mobitz1','mobitz2'].includes(option.value);
  $('sb-avblock').options[0].textContent=c.rhythm==='afib'?'Variable AV conduction':'Normal conduction';$('sb-escape-field').classList.toggle('hidden',c.avBlock!=='complete');$('sb-rate').max=['mobitz1','mobitz2'].includes(c.avBlock)?100:160;
  $('sb-av-note').textContent=afComplete?'Atrial fibrillation continues. The escape-rate control sets the independent ventricular rhythm; the stored rate above is used only for the gray sinus reference.':c.rhythm==='afib'?'AF has no discrete P waves or measurable PR interval. Complete AV block remains available; switch to sinus rhythm for the PR-based block lessons.':c.avBlock==='complete'?'The escape clock is independent of the sinus clock. P waves keep their own timing.':'Atrial events continue even when an impulse is not conducted to the ventricles.';
  const tags=[c.rhythm==='afib'?'Atrial fibrillation':'Sinus '+c.rate+'/min',c.avBlock==='none'?null:({first:'First-degree delay',mobitz1:'Wenckebach',mobitz2:'Mobitz II',complete:'Complete block'}[c.avBlock]),c.bundle==='none'?null:c.bundle.toUpperCase(),c.hypertrophy==='none'?null:c.hypertrophy.toUpperCase(),signed(c.axis,0)+'° source',c.pvc?'Occasional PVCs':null].filter(Boolean);
  $('sandbox-combination').innerHTML=tags.map(t=>`<span>${t}</span>`).join('');
  const m=sandboxModel.metrics,num=(n,suffix='')=>Number.isFinite(n)?Math.round(n)+suffix:'—';
  const cards=[['Atrial rate',c.rhythm==='afib'?'Disorganized':num(m.atrialRate,' /min')],['Mean ventricular rate',num(m.ventricularRate,' /min')],['Conducted PR',m.prMs===null?m.prPattern:num(m.prMs,' ms')],['Usual QRS duration',num(m.qrsMs,' ms')],['Nonconducted P events',c.rhythm==='afib'?'No discrete P waves':String(m.avBlockedPCount??m.droppedPCount??0)],['PVCs in this window',String(m.pvcCount??0)]];
  $('sandbox-metrics').innerHTML=cards.map(([title,value])=>`<div><span>${title}</span><strong>${escapeHTML(value)}</strong></div>`).join('');
  $('sandbox-model-notes').innerHTML=`<p class="sandbox-relationship">${escapeHTML(m.avRelationship)}</p><ul>${sandboxModel.notes.map(n=>`<li>${escapeHTML(n)}</li>`).join('')}</ul>`;
  renderSandboxChart();renderSandboxEvents();updateDuration();
}
function renderSandboxChart(){
  destroyCharts();if(!sandboxModel)return;
  const vals=sandboxModel.signals[state.sandboxLead],ref=sandboxReference.signals[state.sandboxLead],high=Math.max(0,...vals,...(state.sandboxReference?ref:[])),low=Math.min(0,...vals,...(state.sandboxReference?ref:[]));
  const px=35,plotHeight=Math.max(150,(high-low)*px+28),height=Math.ceil(plotHeight+47);
  $('sandbox-trace').innerHTML=traceMarkup('sandbox-main',{clinical:true,title:'Your simulated ECG · click to inspect',height});
  mainChart=chart('sandbox-main',{record:sandboxModel,referenceRecord:state.sandboxReference?sandboxReference:null,lead:state.sandboxLead,mode:'fixed',windowSeconds:sandboxModel.seconds,playhead:true,playheadPeriod:sandboxModel.seconds+.01,onSeek:seekTime,mmPx:3.5,gain:10,baselineFraction:(high*px+14)/plotHeight});
  $('sandbox-main-lead').textContent='LEAD '+state.sandboxLead;$('sandbox-main-rate').textContent=sandboxModel.fs+' Hz';document.querySelector('#sandbox-trace .badge').textContent='SIMULATION';
  $('sandbox-main-scale').textContent=sandboxModel.seconds+' s overview · 0.1 mV / vertical small box';$('sandbox-main-footer').innerHTML=state.sandboxReference?'<span class="ghost-key"></span> Gray = unmodified sinus reference at '+state.sandbox.rate+'/min':'Original teaching waveform';
}
function renderSandboxEvents(){
  const duration=sandboxModel.seconds;
  const lanes=[['Atria',sandboxModel.atrialEvents,'atrial'],['Ventricles',sandboxModel.beats,'ventricular']];
  const afLane='<span class="af-event-activity"><svg viewBox="0 0 600 16" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8l7-3 6 6 5-8 7 10 6-7 8 5 5-9 7 10 6-5 7 3 5-7 8 9 5-8 7 5 6-2 8 4 5-8 7 9 6-6 8 2 5-5 7 10 6-7 8 3 5-6 7 9 6-4 8 2 5-7 7 8 6-5 8 4 5-8 7 10 6-7 8 3 5-6 7 9 6-4 8 2 5-7 7 8 6-5 8 4 5-8 7 10 6-7 8 3 5-6 7 9 6-4 8 2 5-7 7 8 6-5 8 4 5-8 7 10 6-7 8 3 5-6 7 9 6-4 8 2 5-7 7 8 6-5 8 4 5-8 7 10 6-7 8 3 5-6 7 9 6-4 8 2 5-7 7 8 6-5 8 4 5-8 7 10 6-7 8 3 5-6 7 9 6-4 8 2"/></svg><span>Continuous disorganized activity</span></span>';
  $('sandbox-event-rail').innerHTML=lanes.map(([name,events,kind])=>`<div class="event-lane"><span>${name}</span><div>${kind==='atrial'&&state.sandbox.rhythm==='afib'?afLane:events.filter(e=>(e.onset??e.qrsOnset)>=0&&(e.onset??e.qrsOnset)<duration).map(e=>{const t=e.onset??e.qrsOnset,dropped=kind==='atrial'&&e.blockedByAv;return `<button class="event-marker ${kind} ${dropped?'dropped':''} ${e.ectopic?'ectopic':''}" style="left:${100*t/duration}%" data-event-time="${t}" aria-label="${name} event at ${t.toFixed(2)} seconds${dropped?', not conducted':''}${e.ectopic?', premature':''}" title="${name}: ${t.toFixed(2)} s${dropped?' · not conducted':''}"></button>`;}).join('')}<i class="event-clock"></i></div></div>`).join('')+'<p>Each dot is an activation event. Hollow atrial markers are not conducted to the ventricles; select a dot to inspect it.</p>';
  document.querySelectorAll('[data-event-time]').forEach(b=>b.onclick=()=>seekTime(Number(b.dataset.eventTime)));
}

// Shared transport and lifecycle.
function destroyCharts(){for(const c of charts)c.destroy();charts=[];mainChart=null;potentialReferenceChart=null;}
function clearScene(){document.querySelector('.clinical-case-browser')?._caseBrowserCleanup?.();fitExplorer?.destroy();fitExplorer=null;scene?.destroy();scene=null;destroyCharts();}
function chart(id,options={}){const c=new ECGChart($(id),{bpm:state.bpm,lead:state.lead,axis:state.axis,regions:state.regions,paperSpeed:state.paperSpeed,gain:state.gain,...options});charts.push(c);return c;}
function refreshCharts(patch={}){for(const c of charts)c.set({bpm:state.bpm,axis:state.axis,regions:state.regions,...patch});refreshPotentialReference();}
function buildHeart(torso){try{scene=new HeartScene($('scene'),{torso});}catch(error){console.error(error);$('scene').querySelector('.model-loading').textContent='The 3D view could not initialize. Reload this lesson to try again.';}}
function bindAnatomyToggles(){for(const [id,key,option]of[['activation-toggle','activation','activation'],['beating-toggle','beating','beating'],['labels-toggle','labels','labels'],['skin-toggle','skin','skin'],['bones-toggle','bones','bones']])on(id,'change',e=>{state[key]=e.target.checked;scene?.set({[option]:state[key]});});}
function currentSequence(){return state.module==='sandbox'?sandboxModel:state.module==='library'?data?.records[state.recordIndex]:null;}
function sequenceEnd(){const r=currentSequence();return r?Math.max(0,r.seconds-1/r.fs):state.module==='leads'?leadDuration()-.002:getFiducials(state.bpm).rr;}
function seekTime(time){state.time=Math.max(0,Math.min(sequenceEnd(),time));state.running=true;updatePlayButton();if($('phase-time'))$('phase-time').textContent=state.time.toFixed(2)+' s';if(state.module==='leads')updateLeadCursor();}
function toggleRunning(){if(state.module==='rhythm')return;if(fitExplorer){fitExplorer.togglePlaying();return;}if(state.module==='electricity'){scene?.togglePlaying();return;}if(currentSequence()&&state.time>=sequenceEnd())state.time=0;state.running=!state.running;updatePlayButton();}
function updatePlayButton(){if($('play-toggle'))$('play-toggle').textContent=state.running?'Ⅱ Pause':currentSequence()&&state.time>=sequenceEnd()?'↺ Restart':'▶ Play';if($('potential-play'))$('potential-play').textContent=state.running?'Ⅱ Pause':'▶ Play';}
function setPlaybackSpeed(value){
  const speed=Number(value);if(!SPEEDS.includes(speed))return;
  state.speed=speed;
  document.querySelectorAll('[data-playback-speed]').forEach(select=>{if(Number(select.value)!==speed)select.value=String(speed);});
  updateDuration();
}
function updateDuration(){
  if(!$('playback-duration'))return;
  const c=state.clinicalState;
  if(state.module==='library'&&c?.noDiscreteVentricularEvents){updateText('playback-duration',c.rhythmKind==='vf'?'Continuous ventricular activity · no discrete beat interval':'Motion timing is schematic · no validated beat markers');return;}
  const rr=currentSequence()?(c?.rr||60/(state.module==='sandbox'?state.sandbox.rate:72)):getFiducials(state.bpm).rr,s=rr/state.speed;
  updateText('playback-duration',`One ventricular cycle ≈ ${s<60?s.toFixed(1)+' s':(s/60).toFixed(1)+' min'} at ${state.speed}×${currentSequence()?' · interval may vary':''}`);
}
function bindPhaseControls({clinical=false}={}){
  on('play-toggle','click',toggleRunning);on('playback-speed','change',e=>setPlaybackSpeed(e.target.value));
  on('phase-scrub','input',e=>seekTime(Number(e.target.value)/1000*sequenceEnd()));
  document.querySelectorAll('[data-phase]').forEach(b=>b.onclick=()=>{const f=getFiducials(state.bpm),base=state.module==='leads'?Math.floor(mod(state.time,leadDuration())/f.rr)*f.rr:0;seekTime(base+{p:f.pPeak,pr:(f.pEnd+f.qrsStart)/2,qrs:f.rPeak,st:(f.qrsEnd+f.tStart)/2,t:f.tPeak}[b.dataset.phase]);});
  if(clinical){on('previous-beat','click',()=>jumpBeat(-1));on('next-beat','click',()=>jumpBeat(1));}updateDuration();
}
function jumpBeat(direction){
  const r=currentSequence();if(!r)return;const raw=state.module==='sandbox'?sandboxModel.beats:recordBeats(r),beats=raw.map(b=>({...b,time:b.time??b.qrsOnset??b.onset}));
  const candidate=direction>0?beats.find(b=>b.time>state.time+.025):[...beats].reverse().find(b=>b.time<state.time-.025);
  seekTime(candidate?candidate.time:direction>0?sequenceEnd():0);
}

function disclose(element,title,label=title){
  if(!element||element.closest('[data-info-panel]'))return;
  const wrapper=document.createElement('div');wrapper.dataset.infoPanel=title;
  if(label)wrapper.dataset.infoLabel=label;
  element.before(wrapper);wrapper.append(element);
}
function polishReadingLayout(root=document){
  const groups=[
    ['.credit-inline','Anatomy, timing & source notes'],
    ['.physics-caption','Electrodes & model assumptions'],
    ['.field-hint','What this control changes'],
    ['#lead-detail-description','About the selected lead'],
    ['#snapshot-description','What this snapshot shows'],
    ['.teaching-note','How to interpret these signals'],
    ['.potential-selection p','About the selected cell'],
    ['.potential-scale-note','Voltage scales'],
    ['.potential-principles','Why the cellular signals differ'],
    ['.reference-caveat','Using the reference values'],
    ['.snapshot-note','Explore the electrical snapshot'],
    ['.mechanism-copy','Electrical & mechanical mechanism'],
    ['.clinical-record-header p','About this case'],
    ['.mechanism-readout>p','Current mechanism'],
    ['.sandbox-controls>.sandbox-control-note:last-child','Combining rhythm changes'],
    ['#sandbox-model-notes','Model assumptions & consequences']
  ];
  for(const [selector,title] of groups)root.querySelectorAll(selector).forEach(el=>disclose(el,title));
  root.querySelectorAll('details.record-notes,details.potential-methods').forEach(details=>{
    if(details.closest('[data-info-panel]'))return;
    const summary=details.querySelector('summary'),title=summary?.textContent.trim()||'Model notes';
    const wrapper=document.createElement('div');wrapper.dataset.infoPanel=title;wrapper.dataset.infoLabel=title;
    for(const node of [...details.childNodes])if(node!==summary)wrapper.append(node);
    details.replaceWith(wrapper);
  });
  const workspace=root.querySelector('.sandbox-workspace'),study=workspace?.querySelector('.sandbox-study');
  if(workspace&&study&&workspace.firstElementChild!==study)workspace.prepend(study);
  enhanceInfoPanels(root);
}

function bindCommon(){
  polishReadingLayout($('main'));
  bindElectricalUI(scene,state.electricalView,value=>{state.electricalView=value;});
  on('scene-playback-speed','change',e=>setPlaybackSpeed(e.target.value));
  document.querySelectorAll('[data-anatomy-view]').forEach(b=>b.onclick=()=>{
    state.cutaway=b.dataset.anatomyView==='cutaway';
    const options={cutaway:state.cutaway};
    if(state.cutaway){options.conduction=true;state.conduction=true;for(const id of ['conduction-toggle','clinical-pathways'])if($(id))$(id).checked=true;}
    scene?.set(options);
    document.querySelectorAll('[data-anatomy-view]').forEach(button=>{const active=(button.dataset.anatomyView==='cutaway')===state.cutaway;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});
  });
  document.querySelectorAll('.sources-trigger').forEach(b=>b.onclick=showSources);
  document.querySelectorAll('[data-answer]').forEach(b=>b.onclick=()=>{const card=b.closest('.check-card');card.querySelectorAll('button').forEach(x=>x.classList.remove('correct','incorrect'));const ok=b.dataset.answer===b.dataset.correct;b.classList.add(ok?'correct':'incorrect');const p=card.querySelector('.check-feedback');p.textContent=(ok?'Exactly. ':'Try the principle again. ')+p.dataset.explanation;p.classList.remove('hidden');});
  on('zoom-in','click',()=>scene?.zoom(.85));on('zoom-out','click',()=>scene?.zoom(1.18));on('reset-view','click',()=>{scene?.reset();const b=document.querySelector('.orientation-badge');if(b)b.textContent='ANTERIOR VIEW · PATIENT R ← → L';});
}
function route(event){
  closeInfoPanels();
  const token=++routeToken,name=location.hash.replace('#','');state.module=modules.includes(name)?name:'electricity';clearScene();state.time=0;state.running=!reduced;state.clinicalState=null;
  if(state.module==='rhythm'){state.lead='II';state.bpm=72;state.axis=60;state.regions=allRegions();state.calipers=false;state.running=false;}
  visited.add(state.module);try{localStorage.setItem('cardio-explored',JSON.stringify([...visited]));}catch{}
  document.querySelectorAll('.nav-item').forEach(a=>{const active=a.dataset.module===state.module;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','step');else a.removeAttribute('aria-current');});
  $('progress-label').textContent=visited.size+' / '+modules.length;$('progress-bar').style.width=visited.size/modules.length*100+'%';
  $('main').dataset.module=state.module;$('main').innerHTML=({electricity:electricityTemplate,heartbeat:heartbeatTemplate,leads:leadsTemplate,rhythm:rhythmTemplate,library:libraryTemplate,sandbox:sandboxTemplate}[state.module])();
  if(state.module==='electricity')bindVoltage();if(state.module==='heartbeat')bindHeartbeat();if(state.module==='leads')bindLeads();if(state.module==='rhythm')bindRhythm();if(state.module==='library')loadLibrary(token);if(state.module==='sandbox')bindSandbox();bindCommon();window.scrollTo({top:0,behavior:'instant'});
  if(event?.type==='hashchange')$('main').focus({preventScroll:true});
  if(matchMedia('(max-width:760px)').matches)document.querySelector('.nav-item.active')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
}
function showDialog(html){closeInfoPanels({restoreFocus:true});$('dialog-content').innerHTML=html;const heading=$('dialog-content').querySelector('h1,h2');if(heading){heading.id='ekg-dialog-title';$('info-dialog').setAttribute('aria-labelledby',heading.id);}else{$('info-dialog').removeAttribute('aria-labelledby');$('info-dialog').setAttribute('aria-label','EKG Lab information');}if(!$('info-dialog').open)$('info-dialog').showModal();}
function showSources(){showDialog(sourceMarkup);}
function showHelp(){showDialog(`<div class="eyebrow">A hands-on guide</div><h2>Interaction guide</h2><h3>From ions to an EKG</h3><p>Electrical foundations covers the membrane, the wave, the lead, and the whole heart. Use its chapter tabs and time controls, or click a tracing to inspect an instant. Hover over or select an info button for the explanation. The science and mathematics buttons open the course’s explanations and original sources.</p><p>The whole-heart chapter includes the 3D source model and measured human optical recordings. Its expand button fills the lesson area. The main course navigation stays available when you are ready to continue to Module 2.</p><h3>Explore the heart</h3><p>Drag to orbit. Scroll or pinch to zoom. Right-drag or use a two-finger gesture to pan. The + and − buttons zoom, and reset restores the anterior view.</p><h3>Follow the stationary ECG</h3><p>The pale red line marks the instant matching the anatomy. Choose 0.03× through 1× playback, pause, scrub, or jump to a phase. At 0.03× a normal 72 bpm beat takes about 28 seconds to study.</p><h3>Measure without playback</h3><p>Module 4 is always stationary. Turn on calipers, drag either handle, or focus the chart and press 1 / 2 to select one. Arrow keys move in 2 ms increments; Shift moves by 100 ms. Changing paper speed changes the boxes, not the underlying time.</p><h3>Clinical mechanisms</h3><p>The original ECG samples stay fixed. Approximate QRS activity anchors synchronize a schematic condition-specific animation. Motion, strain and regional timing have not been measured in these patients. Click the tracing to continue playback from that instant. Playback stops at the end of the available example. The Sandbox schedules separate atrial and ventricular events so compatible signal changes can be combined.</p><h3>Test a source explanation</h3><p>The fitted clinical examples include a Fitted model view. Compare the recorded median beat with a twelve-lead forward calculation from the displayed CT source mesh. Choose a model experiment, inspect held-out beats and residuals, or click the myocardium to sample its voltage and timing. The inferred fields remain hypotheses on reference anatomy; the original recording and contracting model are available in the neighboring tab.</p><h3>Keyboard and motion</h3><p>Tab moves between controls; arrows adjust sliders. Space toggles playback outside controls, except in the stationary measurement lesson. Reduced-motion preferences start simulations paused.</p>`);}

document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();$('main').focus({preventScroll:true});$('main').scrollIntoView({block:'start',behavior:'instant'});});
$('help-button').addEventListener('click',showHelp);document.querySelector('.dialog-close').addEventListener('click',()=>$('info-dialog').close());$('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')){const r=$('info-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('info-dialog').close();}});window.addEventListener('hashchange',route);
window.addEventListener('keydown',e=>{if(e.defaultPrevented||e.target.closest?.('button,input,select,textarea,summary,a,canvas,iframe,[contenteditable],[role="button"],[role="tab"],[role="slider"],[role="dialog"],dialog'))return;if(e.code==='Space'&&!$('info-dialog').open&&state.module!=='rhythm'){e.preventDefault();toggleRunning();}});
let last=performance.now(),lastUI=0,lastChart=0;
function updateHeartbeatUI(){
  const f=getFiducials(state.bpm),phase=phaseAt(state.time,state.bpm),p=mod(state.time,f.rr);
  if($('phase-name'))$('phase-name').textContent=phase.title;if($('phase-sub'))$('phase-sub').textContent=state.running?`${state.bpm} bpm · ${state.speed}× playback`:`Paused · ${Math.round(p*1000)} ms into beat`;
  const sweep=state.module==='leads',clock=sweep?mod(state.time,leadDuration()):p;if($('phase-scrub'))$('phase-scrub').value=clock/(sweep?leadDuration():f.rr)*1000;if($('phase-time'))$('phase-time').textContent=sweep?clock.toFixed(2)+' s':Math.round(p*1000)+' ms';if(sweep)updateLeadCursor();if($('phase-description'))$('phase-description').textContent=phase.description;
  const map={atria:'p',av:'pr',septum:'qrs',ventricles:'qrs',basal:'qrs',st:'st',recovery:'t'};document.querySelectorAll('[data-phase]').forEach(b=>b.classList.toggle('active',b.dataset.phase===map[phase.id]));
  if(state.module==='heartbeat'){const values=regionalContributions(state.time,state.lead,state.bpm,state.axis);for(const r of REGIONS){const value=state.regions[r.id]?values[r.id]:0,bar=$('bar-'+r.id),el=$('value-'+r.id);if(el)el.textContent=signed(value,2);if(bar){const width=Math.min(49,Math.abs(value)*45);bar.style.width=width+'%';bar.style.left=(value>=0?50:50-width)+'%';}}updatePotentialUI();}
}
function updateClinicalUI(c){
  const title=c.phase?.title||'Between beats',description=c.phase?.description||(state.module==='library'?clinicalTeaching(state.recordIndex):'Follow the independently timed atrial and ventricular events.');updateText('phase-name',title);updateText('phase-sub',`${state.time.toFixed(2)} s · ${state.speed}× · illustrative motion`);
  updateText('clinical-phase-title',title);updateText('clinical-phase-description',description);
  if($('phase-scrub'))$('phase-scrub').value=state.time/Math.max(.001,sequenceEnd())*1000;updateText('phase-time',state.time.toFixed(2)+' s');updateText('phase-description',description);
  for(const id of['ra','la','rv','lv']){
    const bar=$('activity-'+id),atrial=id==='ra'||id==='la',af=c.atrialFibrillation&&atrial,unavailable=atrial&&c.atrialTimingUnavailable;
    const value=af?.45+.2*Math.sin(state.time*43+(id==='la'?2:0))+.1*Math.sin(state.time*67):Number(c.activation?.[id])||0;
    if(bar){bar.style.width=unavailable?'0%':Math.max(0,Math.min(1,value))*100+'%';bar.classList.toggle('fibrillating',af||(!atrial&&c.rhythmKind==='vf'));bar.parentElement.classList.toggle('timing-unavailable',unavailable);}
    updateText('activity-label-'+id,({ra:'Right atrium',la:'Left atrium',rv:'Right ventricle',lv:'Left ventricle'}[id])+(unavailable?' · timing unavailable':af?' · AF':atrial&&c.atrialFlutter?' · flutter':!atrial&&c.rhythmKind==='vf'?' · VF':''));
  }if(state.module==='sandbox')document.querySelectorAll('.event-clock').forEach(e=>e.style.left=100*state.time/sandboxModel.seconds+'%');updateDuration();
}
function animate(now){
  const dt=Math.max(0,(now-last)/1000);last=now;
  // Module 1 owns its clock inside the imported document.
  if(!document.hidden&&state.module!=='electricity'&&!fitExplorer){
    if(state.running&&state.module!=='rhythm'){state.time+=dt*state.speed;if(currentSequence()&&state.time>=sequenceEnd()){state.time=sequenceEnd();state.running=false;updatePlayButton();}}
    // Measure/draw the ECG before the scene writes projected labels. Keeping
    // layout reads ahead of those writes avoids a forced reflow while rotating.
    if(now-lastChart>32){lastChart=now;syncClinicalChartWindow();const chartTime=state.module==='leads'?mod(state.time,leadDuration()):state.module==='rhythm'?0:state.time;for(const c of charts)c.render(chartTime);}
    if(state.module==='library'&&data&&scene){state.clinicalState=recordState(data.records[state.recordIndex],state.time);scene.update(state.time,state.bpm,{clinicalState:state.clinicalState});}
    else if(state.module==='sandbox'&&sandboxModel&&scene){state.clinicalState=sandboxModel.getState(state.time);scene.update(state.time,state.sandbox.rate,{clinicalState:state.clinicalState});}
    else if(scene)scene.update(state.time,state.bpm);
    if(now-lastUI>65){lastUI=now;updateElectricalUI(scene);if(state.module==='heartbeat'||state.module==='leads')updateHeartbeatUI();if((state.module==='library'||state.module==='sandbox')&&state.clinicalState)updateClinicalUI(state.clinicalState);}
  }requestAnimationFrame(animate);
}
document.addEventListener('visibilitychange',()=>{last=performance.now();});
route();requestAnimationFrame(animate);

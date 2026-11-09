import {enhanceInfoPanels,closeInfoPanels} from '../ui-help.js';
import {membraneState,leadState,clamp} from './model.js';
import {waveState,waveVoltage} from './wave-model.js';
import {renderMembrane,membraneChannelAt} from './membrane.js';
import {initializeChannelLens,channelLensLaunch} from './channel-lens.js';
import {initializePharmacology,pharmacologyLaunch} from './pharmacology.js';
import {initializeElectrolytes,electrolytesLaunch} from './electrolytes.js';
import {renderTissue} from './tissue.js';
import {renderField} from './field.js';
import {renderHeart,pickHeart} from './heart.js';
import {datasets,loadHuman,loadSingleBeat,loadHeartModel,heartReady,heartReading,modelVariant,referenceECG} from './heart-data.js';
import {getLesson,waveEvidence,heartEvidence} from './lessons.js';
import {getComparisonSites,comparisonRows,renderComparison} from './site-comparison.js';
import {initializeMicroscopy,openMicroscopy} from './microscopy.js';
import {progressAtPlotPoint} from './plot-navigation.js';
import {heartDataDuration,heartDisplayDuration,heartDataProgress,heartDisplayProgress} from './heart-time.js';
import {createSceneHelp} from './scene-help.js';
const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={chapter:0,progress:.08,elapsed:0,playing:!reduced,speed:1,angle:0,polarity:1,recovery:'reverse',offset:0,uniform:false,showIons:true,showCharges:true,showCurrents:true,currentDisplay:'direction',showField:true,reduceMotion:reduced,shortening:60,wavePreset:'human',waveGeometry:'distant',waveNotch:false,heartMode:'model',donor:1,heartMap:'voltage',selectedPixel:null,selectedNode:3500,selectedModelSites:[3500],selectedHumanSites:{1:[],2:[]},humanSitesInitialized:{1:false,2:false},comparisonRange:'full',heartLead:'II',heartECGComponent:'total',heartResolution:'native',showECGReference:false,heartSitesInitialized:false,modelVariant:'heterogeneous',singleBeat:false,yaw:.12,pitch:.28,zoom:1,cutaway:true,showAppendage:true,showLeadAxis:true,showSamples:true,uniformHeart:false};
const renderers=[renderMembrane,renderTissue,renderField,renderHeart],durations=[15,20,16,22];
const scene=$('scene'),ctx=scene.getContext('2d'),trace=$('trace'),tc=trace.getContext('2d');
const sceneHelp=createSceneHelp(scene,()=>state);
const pharmacology=initializePharmacology({pause});
const electrolytes=initializeElectrolytes({pause});
const channelLens=initializeChannelLens({pause,pharmacology,onSelect:id=>{state.channelFocus=id;}});
let lastTime=performance.now(),lastUI=0,lastPhase='',graphKey='',graphValues=[],graphPeak=0,toastTimer,wasPlaying=false,sceneSize={w:0,h:0},traceSize={w:0,h:0},drag=null;
let selectionUIKey='',comparisonWasPlaying=false;
let mainTracePlot=null,comparisonPlot=null,scenePlots=[];
const waveOptions=()=>({geometry:state.waveGeometry,earlyRepolarization:state.waveNotch});
const fmt=(v,p=2)=>(v<-.000001?'−':v>.000001?'+':'')+Math.abs(v).toFixed(p);
const microNotes={rest:['Rest · about −90 mV','The inside is at a lower potential than the outside. Both bulk fluids remain nearly neutral.'],depolarization:['Depolarization · inward Na⁺','Na⁺ moves inward. The small membrane-charge imbalance changes, making the inside more positive.'],plateau:['Plateau · opposing ion currents','Ca²⁺ entry and K⁺ exit partly balance. A sustained voltage does not mean ions have stopped moving.'],repolarization:['Repolarization · outward K⁺','Net outward positive current makes the inside negative again. K⁺ channels drive recovery; pumps maintain gradients over time.']};
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function pause(){state.playing=false;if($('comparison-dialog').open)comparisonWasPlaying=false;updatePlay();}
function jump(p){
  state.progress=clamp(p);
  // A chosen instant is a new playback position. The finite model still stops at its endpoint.
  state.playing=!(state.chapter===3&&state.heartMode==='model'&&state.progress>=1);
  if($('comparison-dialog').open)comparisonWasPlaying=state.playing;
  lastTime=performance.now();updatePlay();updateUI(true);
}
function updatePlay(){
  const finished=state.chapter===3&&state.heartMode==='model'&&state.progress>=1;
  $('play-glyph').textContent=state.playing?'Ⅱ':finished?'↻':'▶';$('play').setAttribute('aria-label',state.playing?'Pause animation':finished?'Replay animation':'Play animation');
  $('play').title=(state.playing?'Pause':finished?'Replay':'Play')+' (Space)';
  $('comparison-play').textContent=state.playing?'Ⅱ':finished?'↻':'▶';
  $('comparison-play').setAttribute('aria-label',state.playing?'Pause action-potential comparison':finished?'Replay action-potential comparison':'Play action-potential comparison');
  $('scene-status').textContent=!state.playing?'PAUSED · EXPLORE':state.chapter===3?(state.heartMode==='measured'?'RECORDED DATA':'FORWARD MODEL'):'LIVE MODEL';
}
async function ensureHeartData(){
  try{
    if(state.heartMode==='measured'){
      const donor=state.donor,d=await loadHuman(donor);
      if(!state.humanSitesInitialized[donor]){state.selectedHumanSites[donor]=[d.best];state.humanSitesInitialized[donor]=true;}
      if(state.donor===donor&&(state.selectedPixel===null||!d.mask[state.selectedPixel]))state.selectedPixel=state.selectedHumanSites[donor].at(-1)??null;
      if(state.singleBeat)await loadSingleBeat(donor);
    }else{const d=await loadHeartModel();if(!state.heartSitesInitialized){state.selectedModelSites=d.defaultSites||[3500];state.selectedNode=state.selectedModelSites[0];Object.assign(state,d.geometry.defaultView||{});state.heartSitesInitialized=true;}}
    graphKey='';datasets.error=null;updateUI(true);updateSelectionUI(true);
  }catch(e){datasets.error='Data could not load. Reload the page to retry.';toast(datasets.error);console.error(e);}
}
// Keep the scientific explanations in the DOM while bringing controls and plots forward.
function compactLesson(){
  const root=$('lesson-content');
  const explain=(element,title,label)=>{
    if(!element)return;
    const panel=document.createElement('div');panel.dataset.infoPanel=title;
    if(label)panel.dataset.infoLabel=label;
    element.before(panel);panel.append(element);
  };
  const intro=root.querySelector('.lesson-intro');
  if(intro){
    const overview=document.createElement('p');overview.className='lesson-overview';
    overview.textContent=[
      'Open channels. Follow the change in membrane voltage.',
      'Compare activation, action-potential duration, and recovery.',
      'Rotate the electrodes. Watch their voltage difference.',
      state.heartMode==='measured'?'Select tissue sites to compare recorded action potentials.':'Rotate the heart and follow the calculated EKG.'
    ][state.chapter];
    intro.before(overview);explain(intro,'About this chapter','Why this happens');
  }
  explain(root.querySelector('#now-copy'),'What is happening now');
  root.querySelectorAll('.experiment-hint').forEach(element=>explain(element,'Experiment notes','Experiment notes'));
  explain(root.querySelector('.selection-help'),'Comparing action potentials');
}
function setupLesson(){
  closeInfoPanels();
  mainTracePlot=null;scenePlots=[];sceneHelp.hide();sceneHelp.refresh();
  $('lesson-content').innerHTML=getLesson(state);
  if(state.chapter===0)$('lesson-content').insertAdjacentHTML('beforeend',channelLensLaunch+pharmacologyLaunch+electrolytesLaunch);
  compactLesson();
  enhanceInfoPanels($('lesson-content'));
  bindLesson();lastPhase='';graphKey='';selectionUIKey='';
  $('evidence-panel').hidden=![1,3].includes(state.chapter);$('evidence-panel').innerHTML=state.chapter===1?waveEvidence:state.chapter===3?heartEvidence:'';
  if(state.chapter===3){
    const evidence=$('evidence-panel'),details=document.createElement('details'),summary=document.createElement('summary');
    details.className='heart-evidence-details';summary.textContent='Sources, calibration & model limits';details.append(summary);
    const content=document.createElement('div');content.className='heart-evidence-content';while(evidence.firstChild)content.append(evidence.firstChild);details.append(content);evidence.append(details);
    ensureHeartData();
  }
  updateUI(true);updateSelectionUI(true);resize();
}
function setChapter(n,{progress=.08,scroll=false}={}){
  state.chapter=clamp(n,0,3);state.progress=progress;state.uniform=false;state.polarity=1;state.angle=0;state.offset=0;
  $('experience').dataset.chapter=state.chapter;$('experience').setAttribute('aria-labelledby','chapter-'+state.chapter);
  document.querySelectorAll('[data-chapter]').forEach(b=>{const active=+b.dataset.chapter===state.chapter;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  $('scene-scale').textContent=['NANOSCALE → ONE CELL','CELL TIMING → CURRENT SOURCES','TISSUE → EXTRACELLULAR FIELD','HUMAN DATA → FOUR-CHAMBER MODEL'][state.chapter];
  scene.setAttribute('aria-label',['Animated membrane and ion currents. Click a channel, or use Explore the channels, to inspect its experimental protein structure.','Coupled cardiac cells with derived recovery order and two action potential traces','Calculated extracellular field and differential voltage','Interactive recorded human optical maps or three-dimensional four-chamber voltage model'][state.chapter]);
  $('next').innerHTML=state.chapter===3?'Back to the cell <span aria-hidden="true">↺</span>':'Next scale <span aria-hidden="true">→</span>';
  setupLesson();updatePlay();if(scroll)$('experience').scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
}
function ensureFieldActive(){if(Math.abs(leadState(state.progress).voltage)<.08)state.progress=.27;pause();}
function bindLesson(){
  if($('channel-lens-open'))$('channel-lens-open').onclick=()=>{closeInfoPanels();channelLens.open(state.channelFocus||'sodium');};
  if($('pharmacology-open'))$('pharmacology-open').onclick=()=>{closeInfoPanels();pharmacology.open();};
  if($('electrolytes-open'))$('electrolytes-open').onclick=()=>{closeInfoPanels();electrolytes.open();};
  document.querySelectorAll('[data-phase]').forEach(b=>b.addEventListener('click',()=>jump([.08,.195,.39,.65][+b.dataset.phase])));
  const toggle=(id,key)=>{const e=$(id);if(!e)return;e.checked=state[key];e.onchange=()=>{state[key]=e.checked;graphKey='';updateUI(true);};};
  toggle('ions-toggle','showIons');toggle('charges-toggle','showCharges');toggle('currents-toggle','showCurrents');toggle('field-toggle','showField');toggle('sample-points','showSamples');toggle('uniform-heart','uniformHeart');toggle('appendage-toggle','showAppendage');toggle('lead-axis-toggle','showLeadAxis');
  document.querySelectorAll('[data-current-display]').forEach(b=>b.onclick=()=>{state.currentDisplay=b.dataset.currentDisplay;state.showCurrents=true;if($('currents-toggle'))$('currents-toggle').checked=true;document.querySelectorAll('[data-current-display]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});});
  if($('microscopy-open'))$('microscopy-open').onclick=openMicroscopy;
  const setShortening=value=>{state.shortening=value;state.wavePreset='explore';state.uniform=false;$('uniform-toggle').checked=false;$('shortening').value=value;jump((380+(40-value)/2-15)/600);};
  if($('shortening')){$('shortening').value=state.shortening;$('shortening').oninput=e=>setShortening(+e.target.value);}
  document.querySelectorAll('[data-shortening]').forEach(b=>b.onclick=()=>setShortening(+b.dataset.shortening));
  document.querySelectorAll('[data-wave-mode]').forEach(b=>b.onclick=()=>{state.wavePreset=b.dataset.waveMode;state.uniform=false;if(state.wavePreset==='human'){state.waveGeometry='distant';state.waveNotch=false;}setupLesson();jump(state.wavePreset==='human'?.70:.60);});
  document.querySelectorAll('[data-wave-geometry]').forEach(b=>b.onclick=()=>{state.waveGeometry=b.dataset.waveGeometry;document.querySelectorAll('[data-wave-geometry]').forEach(x=>x.classList.toggle('active',x===b));graphKey='';updateUI(true);});
  if($('wave-notch'))$('wave-notch').onchange=e=>{state.waveNotch=e.target.checked;graphKey='';jump((state.wavePreset==='human'?115:123)/600);};
  if($('uniform-toggle'))$('uniform-toggle').onchange=e=>{state.uniform=e.target.checked;jump(100/600);};
  if($('angle'))$('angle').oninput=e=>{ensureFieldActive();state.angle=+e.target.value;updateUI(true);};
  document.querySelectorAll('[data-angle]').forEach(b=>b.onclick=()=>{ensureFieldActive();state.angle=+b.dataset.angle;$('angle').value=state.angle;updateUI(true);});
  if($('swap'))$('swap').onclick=()=>{ensureFieldActive();state.polarity*=-1;updateUI(true);};
  if($('offset'))$('offset').onclick=()=>{ensureFieldActive();state.offset=state.offset?0:2;updateUI(true);};
  document.querySelectorAll('[data-heart-mode]').forEach(b=>b.onclick=()=>{state.heartMode=b.dataset.heartMode;state.heartMap='voltage';state.uniformHeart=false;state.progress=state.heartMode==='measured'?.22:.18;setupLesson();updatePlay();});
  document.querySelectorAll('[data-heart-map]').forEach(b=>b.onclick=()=>{state.heartMap=b.dataset.heartMap;document.querySelectorAll('[data-heart-map]').forEach(x=>x.classList.toggle('active',x===b));updateUI(true);});
  if($('donor'))$('donor').onchange=e=>{state.donor=+e.target.value;state.selectedPixel=null;state.singleBeat=false;setupLesson();};
  if($('single-beat'))$('single-beat').onchange=async e=>{state.singleBeat=e.target.checked;await ensureHeartData();};
  if($('heart-lead'))$('heart-lead').onchange=e=>{state.heartLead=e.target.value;graphKey='';updateUI(true);};
  document.querySelectorAll('[data-variant]').forEach(b=>b.onclick=()=>{state.modelVariant=b.dataset.variant;state.uniformHeart=false;$('uniform-heart').checked=false;document.querySelectorAll('[data-variant]').forEach(x=>x.classList.toggle('active',x===b));graphKey='';updateUI(true);});
  if($('heart-timing'))$('heart-timing').onchange=e=>{state.modelVariant=e.target.value;state.heartResolution='native';state.uniformHeart=false;if($('uniform-heart'))$('uniform-heart').checked=false;graphKey='';updateUI(true);updateSelectionUI(true);};
  if($('heart-resolution'))$('heart-resolution').onchange=e=>{state.heartResolution=e.target.value;graphKey='';updateUI(true);};
  if($('ecg-reference'))$('ecg-reference').onchange=e=>{state.showECGReference=e.target.checked;graphKey='';updateUI(true);};
  document.querySelectorAll('[data-ecg-component]').forEach(b=>b.onclick=()=>{state.heartECGComponent=b.dataset.ecgComponent;state.heartResolution='native';document.querySelectorAll('[data-ecg-component]').forEach(x=>x.classList.toggle('active',x===b));graphKey='';updateUI(true);});
  document.querySelectorAll('[data-heart-phase]').forEach(b=>b.onclick=()=>{const d=datasets.model;if(!d)return;const phase=b.dataset.heartPhase,v=modelVariant(d,state);jump(heartDisplayProgress(d,state,phase==='p'?(v.summary.pPeakMs??90):phase==='qrs'?v.summary.rPeakMs:v.summary.tPeakMs));});
  if($('view-reset'))$('view-reset').onclick=()=>{Object.assign(state,datasets.model?.geometry.defaultView||{yaw:.538,pitch:.874,zoom:1});};
  if($('appendage-inspect'))$('appendage-inspect').onclick=()=>{
    const d=datasets.model;if(!d?.appendage)return;
    state.cutaway=false;state.showAppendage=true;if($('appendage-toggle'))$('appendage-toggle').checked=true;Object.assign(state,d.appendage.inspectView||{yaw:.85,pitch:.3,zoom:1.08});
    document.querySelectorAll('[data-heart-surface]').forEach(x=>{const active=x.dataset.heartSurface==='full';x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
    jump(heartDisplayProgress(d,state,d.appendage.representativeActivationMs??d.variants.heterogeneous.summary.pPeakMs));
    toast('Reconstructed LAA: a blind-ending pouch attached to the original appendage opening.');
  };
  document.querySelectorAll('[data-heart-surface]').forEach(b=>b.onclick=()=>{
    state.cutaway=b.dataset.heartSurface==='cutaway';
    document.querySelectorAll('[data-heart-surface]').forEach(x=>{const active=(x.dataset.heartSurface==='cutaway')===state.cutaway;x.classList.toggle('active',active);x.setAttribute('aria-pressed',String(active));});
  });
  if($('sites-clear'))$('sites-clear').onclick=()=>{setSelectedSites([]);updateSelectionUI(true);updateUI(true);};
  if($('compare-open'))$('compare-open').onclick=openComparison;
}
function setSelectedSites(sites){
  if(state.heartMode==='measured'){
    state.selectedHumanSites[state.donor]=sites;
    if(!sites.includes(state.selectedPixel))state.selectedPixel=sites.at(-1)??null;
  }else{
    state.selectedModelSites=sites;
    if(sites.length&&!sites.includes(state.selectedNode))state.selectedNode=sites.at(-1);
  }
  graphKey='';
}
function toggleSelectedSite(node){
  const sites=[...(state.heartMode==='measured'?state.selectedHumanSites[state.donor]:state.selectedModelSites)];
  if(sites.includes(node))setSelectedSites(sites.filter(n=>n!==node));
  else{
    if(sites.length>=6){toast('Six sites selected. Remove a site to add another.');return;}
    sites.push(node);setSelectedSites(sites);
    if(state.heartMode==='measured')state.selectedPixel=node;else state.selectedNode=node;
  }
  updateSelectionUI(true);updateUI(true);
}
function updateSelectionUI(force=false){
  if(state.chapter!==3||!$('site-chips'))return;
  const d=heartReady(state),rows=d?comparisonRows(state,d):[],active=state.heartMode==='measured'?state.selectedPixel:state.selectedNode;
  const key=[state.heartMode,state.donor,rows.map(r=>r.node).join(','),active,state.modelVariant,state.uniformHeart,!!d].join('|');
  if(!force&&key===selectionUIKey)return;selectionUIKey=key;
  $('selection-count').textContent=rows.length+' / 6';
  $('site-chips').innerHTML=rows.length?rows.map(r=>`<div class="site-chip ${r.node===active?'active':''}" style="--site-color:${r.color}"><button data-focus-site="${r.node}" aria-label="Inspect site ${r.label}"${state.heartMode==='measured'?'':` title="Model node ${r.node}"`}><span class="site-letter">${r.label}</span>${state.heartMode==='measured'?`${r.node%100}, ${Math.floor(r.node/100)}`:(r.chamberName||r.chamber||'Modeled site')}</button><button class="remove-site" data-remove-site="${r.node}" aria-label="Remove site ${r.label}">×</button></div>`).join(''):`<p class="selection-empty">${d?'Click tissue locations to add their action potentials.':'Loading the spatial data…'}</p>`;
  document.querySelectorAll('[data-focus-site]').forEach(b=>b.onclick=()=>{const node=+b.dataset.focusSite;if(state.heartMode==='measured')state.selectedPixel=node;else state.selectedNode=node;graphKey='';updateUI(true);updateSelectionUI(true);});
  document.querySelectorAll('[data-remove-site]').forEach(b=>b.onclick=()=>toggleSelectedSite(+b.dataset.removeSite));
  $('compare-open').disabled=!rows.length;$('sites-clear').disabled=!rows.length;
  if($('comparison-dialog').open)updateComparisonDialog();
}
function renderComparisonCanvas(){
  if(!$('comparison-dialog').open)return;
  const d=heartReady(state);if(!d)return;
  const canvas=$('comparison-canvas'),size=sizeCanvas(canvas);
  comparisonPlot=renderComparison(canvas.getContext('2d'),size.w,size.h,state,d,state.comparisonRange);
  const duration=heartDisplayDuration(d,state);
  $('comparison-timeline').value=Math.round(state.progress*1000);
  $('comparison-time').textContent=Math.round(state.progress*duration)+' ms';
}
function updateComparisonDialog(){
  const d=heartReady(state);if(!d)return;
  const measured=state.heartMode==='measured',rows=comparisonRows(state,d),marker=measured?'80':'90';
  $('comparison-title').textContent=measured?'Compare recorded action potentials.':'Compare modeled action potentials.';
  $('comparison-context').textContent=measured?`Donor ${state.donor} · ${state.singleBeat?'one recorded beat':'four-beat ensemble'} · relative fluorescence. All sites retain their recording times.`:state.uniformHeart?'Uniform-voltage control: every selected site follows the active site’s AP.':'Same four-chamber beat · modeled mV. Every curve retains its original model timing.';
  $('comparison-head').innerHTML=`<tr><th scope="col">Site</th><th scope="col">AT</th><th scope="col">APD<sub>${marker}</sub></th><th scope="col">RT<sub>${marker}</sub></th><th scope="col">ΔAT vs A</th><th scope="col">ΔRT vs A</th></tr>`;
  $('comparison-rows').innerHTML=rows.map(r=>`<tr><th scope="row"${measured?'':` title="Model node ${r.node}"`}><span class="table-site" style="--site-color:${r.color}">${r.label}</span>${measured?`x ${r.node%100}, y ${Math.floor(r.node/100)}`:(r.chamberName||r.chamber||'Modeled site')}</th><td>${r.at.toFixed(1)}</td><td>${r.apd.toFixed(1)}</td><td>${r.rt.toFixed(1)}</td><td>${fmt(r.at-rows[0].at,1)}</td><td>${fmt(r.rt-rows[0].rt,1)}</td></tr>`).join('');
  $('comparison-note').textContent=`Times are in ms; Δ is relative to site A. ${measured?'Timing estimates use the filtered four-beat ensemble, including when a single beat is displayed.':'AT, APD₉₀ and RT₉₀ are interpolated timing parameters; a mixed cut-face trace can cross slightly differently.'} Curves are never individually shifted to align their upstrokes.`;
  document.querySelectorAll('[data-comparison-range]').forEach(b=>b.classList.toggle('active',b.dataset.comparisonRange===state.comparisonRange));
  renderComparisonCanvas();
}
function openComparison(){closeInfoPanels();
  const d=heartReady(state);if(!d||!getComparisonSites(state,d).length)return;
  comparisonWasPlaying=state.playing;state.playing=false;updatePlay();$('comparison-dialog').showModal();updateComparisonDialog();
}
function data(){if(state.chapter===0)return membraneState(state.progress);if(state.chapter===1)return waveState(state.progress,state.shortening,state.uniform,state.wavePreset,81,waveOptions());if(state.chapter===2)return leadState(state.progress,state.angle,state.polarity,state.recovery,state.offset,state.uniform);return heartReady(state);}
function valueAt(p){if(state.chapter===0)return membraneState(p).vm;if(state.chapter===1)return waveVoltage(p,state.shortening,state.uniform,state.wavePreset,waveOptions());if(state.chapter===2)return leadState(p,state.angle,state.polarity,state.recovery,0,state.uniform).voltage;if(state.heartMode==='measured'&&!state.selectedHumanSites[state.donor].length)return NaN;return state.uniformHeart&&state.heartMode==='model'?0:heartReading(state,heartDataProgress(heartReady(state),state,p));}
function updateUI(force=false){
  const m=data();let note=['Loading data','Preparing the spatial recordings.'],unit='mV',val=valueAt(state.progress),precision=2;
  if(state.chapter===0){note=microNotes[m.phase];precision=1;$('trace-title').textContent='MEMBRANE VOLTAGE · Vₘ';$('trace-subtitle').textContent='One cell’s action potential';$('trace-provenance').textContent='ILLUSTRATIVE MEMBRANE MODEL';$('timeline-ticks').innerHTML='<span>Rest</span><span>Depolarize</span><span>Plateau</span><span>Recover</span>';document.querySelectorAll('[data-phase]').forEach(b=>b.classList.toggle('active',+b.dataset.phase==={rest:0,depolarization:1,plateau:2,repolarization:3}[m.phase]));}
  if(state.chapter===1){
    const delta=state.wavePreset==='human'?-15:40-state.shortening,order=Math.abs(delta)<.001?'synchronized':delta<0?'reversed':'same-order';
    note=state.uniform?['Uniform Vₘ · zero external voltage','Identical voltages leave no spatial gradient.']:state.wavePreset==='human'?['Outer wall recovers 15 ms earlier','Shorter action potentials offset later activation. Intermediate cells are simulated.']:[order==='synchronized'?'Recovery synchronized':order==='reversed'?'Recovery order reverses':'Recovery follows activation',`A 40 ms activation delay minus ${state.shortening} ms APD shortening gives ΔRT = ${delta>0?'+':''}${delta} ms.`];
    $('wave-equation').textContent=state.wavePreset==='human'?'Human endpoint means: ΔRT = 28 − 43 = −15 ms':`ΔRT = 40 − ${state.shortening} = ${delta} ms`;
    if($('shortening-value'))$('shortening-value').textContent=state.shortening+' ms';if($('shortening'))$('shortening').value=state.shortening;
    document.querySelectorAll('[data-shortening]').forEach(b=>b.classList.toggle('active',state.wavePreset==='explore'&&+b.dataset.shortening===state.shortening));
    precision=3;$('trace-title').textContent='CALCULATED EXTERNAL VOLTAGE · RIGHT MINUS LEFT';$('trace-subtitle').textContent='The electrodes record a voltage difference.';$('trace-provenance').textContent='SIMULATED VOLTAGE · ILLUSTRATIVE mV';$('timeline-ticks').innerHTML='<span>0 ms</span><span>200 ms</span><span>400 ms</span><span>600 ms</span>';
  }
  if(state.chapter===2){
    note=state.offset?['A shared offset cancels','Both electrode potentials include +2 mV. Subtraction removes the shared value exactly.']:Math.abs(m.voltage)<.0001?['Equal inputs · zero difference','The two electrode potentials are equal. The lead records their difference.']:m.voltage>0?['Positive deflection · φ₊ is higher','The positive input samples a higher potential than the negative input.']:['Negative deflection · φ₊ is lower','The negative sign gives the ordering of the two potentials, not the net charge of the body.'];
    $('phi-plus').textContent=fmt(m.vp);$('phi-minus').textContent=fmt(m.vn);$('phi-diff').textContent=fmt(m.voltage);$('angle-value').textContent=state.angle+'°';$('swap').classList.toggle('active',state.polarity===-1);$('offset').classList.toggle('active',!!state.offset);
    $('trace-title').textContent='LEAD VOLTAGE · φ₊ − φ₋';$('trace-subtitle').textContent='The same source. A different measurement axis.';$('trace-provenance').textContent='ILLUSTRATIVE TIMING & AMPLITUDE';$('timeline-ticks').innerHTML='<span>Rest</span><span>Depolarize</span><span>Plateau</span><span>Recover</span>';
  }
  if(state.chapter===3){
    if(state.heartMode==='measured'){
      unit='relative';const d=m,node=state.selectedPixel??d?.best;
      note=d?(state.selectedHumanSites[state.donor].length?[`Active site · x ${node%100}, y ${Math.floor(node/100)}`,`AT ${d.timings[node].toFixed(1)} ms · RT₈₀ ${d.timings[10000+node].toFixed(1)} ms · APD₈₀ ${d.timings[20000+node].toFixed(1)} ms. Click more locations to compare their recorded action potentials.`]:['Select sites to compare','Click the colored tissue. Each site adds a measured action potential on the same time axis.']):note;
      $('trace-title').textContent='ACTIVE SITE · HUMAN OPTICAL ACTION POTENTIAL';$('trace-subtitle').textContent=`Donor ${state.donor} · ${state.singleBeat?'one observed beat':'four-beat ensemble'} · not calibrated to mV`;$('trace-provenance').textContent='EXPERIMENTAL DATA · NO PAIRED EKG';$('timeline-ticks').innerHTML='<span>0 ms</span><span>333 ms</span><span>667 ms</span><span>1,000 ms</span>';
    }else{
      if(m){const node=state.selectedNode,v=modelVariant(m,state),a=m.nodes.activationMs[node],ap=(v.apd90Ms||m.nodes.apd90Ms)[node],r=(v.recoveryMs||m.nodes.recoveryMs)[node],selected=comparisonRows(state,m).find(row=>row.node===node),siteName=selected?`Site ${selected.label}${selected.chamberName?' · '+selected.chamberName:''}`:'Active site';note=!state.selectedModelSites.length?['Select sites to compare','Click atrial or ventricular tissue to overlay up to six action potentials on a shared time axis.']:state.uniformHeart?['Identical Vₘ · no spatial source','Every modeled node is assigned the same instantaneous membrane voltage. The lead becomes zero because its spatial-gradient contributions vanish.']:[`${siteName} · AT + APD₉₀ = RT₉₀`,`${a.toFixed(1)} + ${ap.toFixed(1)} = ${r.toFixed(1)} ms. The ECG uses the complete 3D voltage gradient, not the sum of the selected action potentials.`];}
      $('trace-title').textContent=(state.heartECGComponent==='total'?'COMPUTED FOUR-CHAMBER EKG':state.heartECGComponent==='atrial'?'ATRIAL CONTRIBUTION · INCLUDING ATRIAL RECOVERY':'VENTRICULAR CONTRIBUTION')+' · LEAD '+state.heartLead;
      $('trace-subtitle').textContent=state.showECGReference?'Green: calculated · gold dashed: measured calibration target, R aligned; original mV':state.heartLead==='II'?'Calibrated 3D cellular sources · finite body conductor · modeled mV':'Unoptimized lead · shared 3D source field · exploratory calculation';
      $('trace-provenance').textContent='COMPUTED FROM THE SPATIAL FIELD';
      const duration=heartDisplayDuration(m,state);$('timeline-ticks').innerHTML=[0,.25,.5,.75,1].map(q=>'<span>'+Math.round(q*duration)+' ms</span>').join('');
      if($('reference-note'))$('reference-note').hidden=!state.showECGReference;
      if($('heart-resolution')){
        const enabled=state.modelVariant==='heterogeneous'&&state.heartECGComponent==='total';$('heart-resolution').disabled=!enabled;$('heart-resolution').value=state.heartResolution;
        for(const option of $('heart-resolution').options){const q=m?.sourceSampling?.[option.value];if(q)option.textContent=`${q.label} · ${q.nodeCount.toLocaleString()}`;}
        const sample=m?.sourceSampling?.[state.heartResolution];
        $('sampling-note').textContent=!enabled?'Source-sampling comparison is available for the calibrated model and whole-heart EKG.':state.heartResolution==='native'&&m?`${(m.sourceFieldNodeCount||m.computationalNodeCount).toLocaleString()} voltage samples from ${m.computationalNodeCount.toLocaleString()} activation nodes. Intermediate AT and APD are interpolated before evaluating the cellular AP.`:sample?`${(sample.relativeRmsErrorLeadII*100).toFixed(2)}% lead-II RMS difference from dense sampling. The activation model and tissue parameters are held fixed.`:'Computing source sampling…';
      }
      if($('heart-timing')&&m){for(const option of $('heart-timing').options){const q=m.variants[option.value];if(q)option.textContent=q.label;}$('timing-note').textContent=m.variants[state.modelVariant]?.description||'Cellular durations remain explicit model assumptions.';}

    }
  }
  const key=note.join('|');if(force||key!==lastPhase){$('now-title').textContent=note[0];$('now-copy').textContent=note[1];lastPhase=key;}
  $('timeline').value=Math.round(state.progress*1000);$('timeline').setAttribute('aria-valuetext',Math.round(state.progress*100)+'% of displayed interval');
  $('trace-value').innerHTML=(Number.isFinite(val)?fmt(val,precision):'—')+' <small>'+unit+'</small>';
  updatePlotAccessibility();
  if(state.chapter===1)sceneHelp.update();
  if(state.chapter===3)updateSelectionUI();
}
function sizeCanvas(el){const r=el.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);if(el.width!==Math.round(r.width*dpr)||el.height!==Math.round(r.height*dpr)){el.width=Math.round(r.width*dpr);el.height=Math.round(r.height*dpr);}el.getContext('2d').setTransform(dpr,0,0,dpr,0,0);return {w:r.width,h:r.height};}
function resize(){sceneSize=sizeCanvas(scene);traceSize=sizeCanvas(trace);sceneHelp.layout();if($('comparison-dialog').open)renderComparisonCanvas();}
function chartHeart(){
  const W=traceSize.w,H=traceSize.h,d=datasets.model;if(!W||!H||!d)return;
  const v=modelVariant(d,state),duration=heartDisplayDuration(d,state),frames=Math.round(duration/d.dt)+1;
  const key=['fourchamber',state.heartLead,state.modelVariant,state.heartECGComponent,state.heartResolution,state.uniformHeart,state.showECGReference].join('|');
  if(key!==graphKey){graphValues=Array.from({length:frames},(_,i)=>valueAt(i/(frames-1)));graphKey=key;}
  const collections=Object.values(d.variants).map(q=>state.heartECGComponent==='atrial'?q.ecgAtrial:state.heartECGComponent==='ventricular'?q.ecgVentricular:q.ecg);
  const bounds=collections.flatMap(q=>q?.[state.heartLead]||[]);
  if(state.showECGReference&&d.referenceECG)bounds.push(...(d.referenceECG.allLeadsMv[state.heartLead]||d.referenceECG.allLeadsMv[state.heartLead.toLowerCase()]||[]));
  const max=Math.max(.2,Math.ceil(Math.max(...bounds)*1.16*10)/10),min=Math.min(-.15,Math.floor(Math.min(...bounds)*1.16*10)/10);
  const left=45,right=W-9,top=20,bottom=H-22,xx=t=>left+(right-left)*t/duration,yy=n=>bottom-(n-min)/(max-min)*(bottom-top);
  mainTracePlot={x:left,y:top,w:right-left,h:bottom-top,start:0,end:1};
  tc.clearRect(0,0,W,H);
  for(let t=0;t<=duration;t+=40){tc.strokeStyle=t%200===0?'#52777f42':'#52777f20';tc.lineWidth=.6;tc.beginPath();tc.moveTo(xx(t),top);tc.lineTo(xx(t),bottom);tc.stroke();}
  for(let n=Math.ceil(min*10)/10;n<=max+.001;n+=.1){const major=Math.abs(n*2-Math.round(n*2))<.01;tc.strokeStyle=major?'#52777f42':'#52777f20';tc.beginPath();tc.moveTo(left,yy(n));tc.lineTo(right,yy(n));tc.stroke();}
  tc.strokeStyle='#8dafaa60';tc.beginPath();tc.moveTo(left,yy(0));tc.lineTo(right,yy(0));tc.stroke();
  tc.font='12px "DM Sans",system-ui';tc.fillStyle='#91aaa9';tc.textAlign='right';tc.textBaseline='middle';for(const n of [min,0,max])tc.fillText(n===0?'0':n.toFixed(1),left-7,yy(n));
  const stroke=(values,color,width,end=1,dashed=false)=>{tc.beginPath();let started=false;const n=values.length-1;for(let i=0;i<=Math.ceil(end*n);i++){const val=values[Math.min(n,i)];if(!Number.isFinite(val)){started=false;continue;}const x=xx(i/n*duration),y=yy(val);if(started)tc.lineTo(x,y);else tc.moveTo(x,y);started=true;}tc.strokeStyle=color;tc.lineWidth=width;tc.setLineDash(dashed?[5,4]:[]);tc.lineJoin='round';tc.stroke();tc.setLineDash([]);};
  if(state.showECGReference){const reference=Array.from({length:frames},(_,i)=>referenceECG(d,heartDataProgress(d,state,i/(frames-1)),state.heartLead,state.modelVariant));stroke(reference,'#e5bd70bb',1.5,1,true);}
  stroke(graphValues,'#a5dac48a',1.4);stroke(graphValues,'#b4f2d4',2.1,state.progress);
  if(state.heartECGComponent==='total'&&!state.uniformHeart){
    const features=[['P',v.summary.pPeakMs??90],['QRS',v.summary.rPeakMs],['T',v.summary.tPeakMs]];
    tc.font='600 12px "DM Sans",system-ui';tc.textAlign='left';tc.fillStyle='#b0c7bf';tc.textBaseline='middle';const placed=[];
    for(const[label,t]of [features[1],features[0],features[2]]){const width=tc.measureText(label).width,x=Math.max(left,Math.min(right-width,xx(t)-width/2));if(placed.some(([a,b])=>x<b+6&&x+width>a-6))continue;tc.fillText(label,x,10);placed.push([x,x+width]);}
  }
  const t=state.progress*duration,val=valueAt(state.progress);tc.strokeStyle='#bce4cd66';tc.beginPath();tc.moveTo(xx(t),top);tc.lineTo(xx(t),bottom);tc.stroke();if(Number.isFinite(val)){tc.beginPath();tc.arc(xx(t),yy(val),2.8,0,Math.PI*2);tc.fillStyle='#d6f8dc';tc.fill();}
  tc.font='12px "DM Sans",system-ui';tc.fillStyle='#8ba6a9';tc.textAlign='left';tc.textBaseline='middle';
  const ticks=[0,.25,.5,.75,1].map(q=>{const text=Math.round(duration*q)+(q===0||q===1?' ms':''),width=tc.measureText(text).width;return {text,width,x:xx(q*duration)-(q===0?0:q===1?width:width/2)};});
  // Keep numeric labels on their exact time ticks; omit crowded interior labels.
  let after=-Infinity;const endLeft=ticks.at(-1).x;
  for(const [i,label]of ticks.entries()){if(label.x<after+8||(i<ticks.length-1&&label.x+label.width>endLeft-8))continue;tc.fillText(label.text,label.x,H-10);after=label.x+label.width;}
}
function chart(){
  if(state.chapter===3&&state.heartMode==='model'&&datasets.model?.schemaVersion>=2){chartHeart();return;}

  const W=traceSize.w,H=traceSize.h;if(!W||!H)return;
  const key=[state.chapter,state.angle,state.polarity,state.recovery,state.uniform,state.shortening,state.wavePreset,state.waveGeometry,state.waveNotch,state.heartMode,state.donor,state.selectedPixel,state.singleBeat,state.selectedNode,state.heartLead,state.modelVariant,state.uniformHeart,!!heartReady(state)].join('|');
  if(key!==graphKey){graphValues=Array.from({length:601},(_,i)=>valueAt(i/600));graphPeak=Math.max(0,...graphValues.filter(Number.isFinite).map(Math.abs));graphKey=key;}
  const measured=state.chapter===3&&state.heartMode==='measured';let min=-1.8,max=1.8;if(state.chapter===0){min=-110;max=40;}else if(state.chapter===1){const peak=Math.max(.005,graphPeak*1.12),base=10**Math.floor(Math.log10(peak));max=([1,2,2.5,5,10].find(v=>v*base>=peak)??10)*base;min=-max;}else if(measured){min=-.2;max=1.3;}else if(state.chapter===3&&datasets.model){const all=Object.values(datasets.model.variants).flatMap(v=>v.ecg[state.heartLead]||v.ecg.II);const peak=Math.max(...all.map(Math.abs));max=Math.max(.5,Math.ceil(peak*1.15*2)/2);min=-max;}
  const left=50,right=W-9,top=10,bottom=H-20,xx=p=>left+(right-left)*p,yy=v=>bottom-(v-min)/(max-min)*(bottom-top);
  mainTracePlot={x:left,y:top,w:right-left,h:bottom-top,start:0,end:1};
  tc.clearRect(0,0,W,H);tc.lineWidth=.5;tc.strokeStyle='#52777f27';for(let i=0;i<=40;i++){tc.beginPath();tc.moveTo(xx(i/40),top);tc.lineTo(xx(i/40),bottom);tc.stroke();}for(let i=0;i<7;i++){const y=top+(bottom-top)*i/6;tc.beginPath();tc.moveTo(left,y);tc.lineTo(right,y);tc.stroke();}
  tc.font='12px "DM Sans",system-ui';tc.fillStyle='#8da9af';tc.textAlign='right';tc.textBaseline='middle';for(const v of state.chapter===0?[-90,0,25]:measured?[0,.5,1]:[-max*.75,0,max*.75]){const y=yy(v);tc.fillText(v===0?'0':state.chapter===0?String(v):Math.abs(v)<.1?v.toFixed(3):Math.abs(v)<1?v.toFixed(2):v.toFixed(1),left-7,y);if(v===0){tc.strokeStyle='#72949765';tc.beginPath();tc.moveTo(left,y);tc.lineTo(right,y);tc.stroke();}}
  const stroke=(end,color,width)=>{tc.beginPath();for(let i=0;i<=Math.ceil(end*600);i++){const v=graphValues[Math.min(600,i)],x=xx(i/600),y=yy(v);if(!Number.isFinite(v))continue;i?tc.lineTo(x,y):tc.moveTo(x,y);}tc.strokeStyle=color;tc.lineWidth=width;tc.lineJoin='round';tc.stroke();};stroke(1,'#a5dac45c',1.3);stroke(state.progress,'#adebd0',1.9);
  const x=xx(state.progress),y=yy(valueAt(state.progress));tc.strokeStyle='#bce4cd66';tc.beginPath();tc.moveTo(x,top);tc.lineTo(x,bottom);tc.stroke();if(Number.isFinite(y)){tc.fillStyle='#d6f8dc';tc.beginPath();tc.arc(x,y,2.8,0,Math.PI*2);tc.fill();}
  tc.fillStyle='#83a1a7';tc.textAlign='left';tc.textBaseline='middle';tc.font='12px "DM Sans",system-ui';
  const labels=state.chapter===0?[[.08,'REST'],[.19,'Na⁺'],[.39,'PLATEAU'],[.67,'K⁺']]:state.chapter===1?[[0,'0 ms'],[1/3,'200'],[2/3,'400'],[1,'600 ms']]:state.chapter===2?[[.27,'ACTIVATION'],[.48,'UNIFORM'],[.71,'RECOVERY']]:[[0,'0 ms'],[.25,measured?'250':'175'],[.5,measured?'500':'350'],[.75,measured?'750':'525'],[1,measured?'1,000 ms':'700 ms']];
  const ticks=labels.map(([p,text])=>{const width=tc.measureText(text).width;return {text,width,x:xx(p)-(p===0?0:p===1?width:width/2)};});
  if(state.chapter===1||state.chapter===3){
    let after=-Infinity;const endLeft=ticks.at(-1).x;
    for(const [i,label]of ticks.entries()){if(label.x<after+8||(i<ticks.length-1&&label.x+label.width>endLeft-8))continue;tc.fillText(label.text,label.x,H-9);after=label.x+label.width;}
  }else{
    while(ticks.length>1&&ticks.reduce((sum,label)=>sum+label.width,0)+8*(ticks.length-1)>right-left)ticks.splice(ticks.length===2?0:Math.floor(ticks.length/2),1);
    let after=left-8;for(const label of ticks){label.x=Math.max(label.x,after+8);after=label.x+label.width;}
    let before=right+8;for(const label of [...ticks].reverse()){label.x=Math.min(label.x,before-label.width-8);before=label.x;}
    for(const label of ticks)tc.fillText(label.text,label.x,H-9);
  }
}
function frame(now){const dt=Math.min((now-lastTime)/1000,.06);lastTime=now;if(state.playing){state.elapsed+=dt*state.speed;if(state.chapter!==3||heartReady(state)){const d=state.chapter===3?heartReady(state):null,seconds=durations[state.chapter]*(d?heartDisplayDuration(d,state)/heartDataDuration(d):1);state.progress+=dt*state.speed/seconds;}if(state.progress>=1){if(state.chapter===3&&state.heartMode==='model'){state.progress=1;pause();}else state.progress%=1;}}
  if(sceneSize.w){const m=membraneState(state.progress);ctx.clearRect(0,0,sceneSize.w,sceneSize.h);scenePlots=renderers[state.chapter](ctx,sceneSize.w,sceneSize.h,{...state,vm:m.vm,phase:m.phase})||[];chart();}if($('comparison-dialog').open)renderComparisonCanvas();if(now-lastUI>120){updateUI();lastUI=now;}requestAnimationFrame(frame);
}
function timeScale(){
  if(state.chapter===1)return {duration:600,unit:'ms'};
  if(state.chapter===3){const d=heartReady(state);return {duration:heartDisplayDuration(d,state),unit:'ms'};}
  return {duration:100,unit:'% of cycle'};
}
function updatePlotAccessibility(){
  const {duration,unit}=timeScale(),value=Math.round(state.progress*duration*10)/10;
  for(const canvas of [trace,$('comparison-canvas')]){
    canvas.setAttribute('aria-valuemin','0');canvas.setAttribute('aria-valuemax',String(duration));canvas.setAttribute('aria-valuenow',String(value));canvas.setAttribute('aria-valuetext',`${value} ${unit}`);
  }
  trace.setAttribute('aria-label',`${$('trace-title').textContent}. Seek time`);
}
function installPlotScrubber(canvas,getPlot){
  let pointer=null,activePlot=null;
  canvas.classList.add('time-seek-canvas');canvas.tabIndex=0;canvas.setAttribute('role','slider');canvas.setAttribute('aria-orientation','horizontal');
  canvas.title='Click or drag to play from a time point. Arrow keys move through time; Home and End select the displayed endpoints.';
  const local=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
  const seek=(e,dragging=false)=>{const p=local(e),value=progressAtPlotPoint(activePlot||getPlot(),p.x,p.y,{dragging});if(value===null)return false;jump(value);return true;};
  canvas.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0)return;
    activePlot=getPlot();if(!seek(e)){activePlot=null;return;}
    pointer=e.pointerId;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(pointer);
  });
  canvas.addEventListener('pointermove',e=>{if(e.pointerId===pointer)seek(e,true);});
  const stop=e=>{if(e.pointerId!==pointer)return;if(e.type==='pointerup')seek(e,true);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);pointer=null;activePlot=null;};
  canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',()=>{pointer=null;activePlot=null;});
  canvas.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))return;
    const plot=getPlot();if(!plot)return;
    const {duration,unit}=timeScale(),step=(unit==='ms'?1/duration:.01)*(e.shiftKey?10:1),start=plot.start??0,end=plot.end??1;
    const next=e.key==='Home'?start:e.key==='End'?end:state.progress+(['ArrowLeft','ArrowDown','PageDown'].includes(e.key)?-1:1)*step*(e.key.startsWith('Page')?10:1);
    e.preventDefault();e.stopPropagation();jump(clamp(next,start,end));
  });
}
installPlotScrubber(trace,()=>mainTracePlot);
installPlotScrubber($('comparison-canvas'),()=>comparisonPlot);
$('comparison-canvas').setAttribute('aria-label','Superimposed action potentials on a shared time axis. Seek time');
function virtualPoint(e){const r=scene.getBoundingClientRect(),z=Math.min(r.width/1000,r.height/610);return {x:(e.clientX-r.left-(r.width-1000*z)/2)/z,y:(e.clientY-r.top-(r.height-610*z)/2)/z};}
scene.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0)return;
  const p=virtualPoint(e),plot=scenePlots.find(g=>progressAtPlotPoint(g,p.x,p.y)!==null);
  if(plot){drag={kind:'seek',plot,pointerId:e.pointerId};jump(progressAtPlotPoint(plot,p.x,p.y));e.preventDefault();scene.setPointerCapture(e.pointerId);return;}
  if(state.chapter!==3)return;
  drag={kind:'heart',pointerId:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:0,orbit:state.heartMode==='model'&&p.x<670&&p.y>75};scene.setPointerCapture(e.pointerId);
});
scene.addEventListener('pointermove',e=>{
  const p=virtualPoint(e);
  if(!drag){scene.style.cursor=scenePlots.some(g=>progressAtPlotPoint(g,p.x,p.y)!==null)?'crosshair':state.chapter===0&&membraneChannelAt(p,1000,610)?'pointer':state.chapter===3?(state.heartMode==='model'&&p.x<670&&p.y>75?'grab':'pointer'):'default';return;}
  if(e.pointerId!==drag.pointerId)return;
  if(drag.kind==='seek'){jump(progressAtPlotPoint(drag.plot,p.x,p.y,{dragging:true}));return;}
  const dx=e.clientX-drag.lastX,dy=e.clientY-drag.lastY;drag.moved+=Math.abs(dx)+Math.abs(dy);if(drag.orbit){state.yaw+=dx*.008;state.pitch=clamp(state.pitch+dy*.006,-1.15,1.15);scene.style.cursor='grabbing';}drag.lastX=e.clientX;drag.lastY=e.clientY;
});
scene.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.pointerId)return;
  const p=virtualPoint(e);
  if(drag.kind==='seek')jump(progressAtPlotPoint(drag.plot,p.x,p.y,{dragging:true}));
  else if(drag.moved<7){const n=pickHeart(p.x,p.y,state);if(n!==null&&n>=0)toggleSelectedSite(n);}
  drag=null;if(scene.hasPointerCapture(e.pointerId))scene.releasePointerCapture(e.pointerId);
});
scene.addEventListener('pointercancel',()=>drag=null);scene.addEventListener('lostpointercapture',()=>drag=null);scene.addEventListener('wheel',e=>{if(state.chapter===3&&state.heartMode==='model'&&virtualPoint(e).x<670){e.preventDefault();state.zoom=clamp(state.zoom-e.deltaY*.001,.65,1.5);}},{passive:false});
scene.addEventListener('click',e=>{
  if(state.chapter!==0)return;
  const r=scene.getBoundingClientRect(),id=membraneChannelAt({x:e.clientX-r.left,y:e.clientY-r.top},r.width,r.height);
  if(id){closeInfoPanels();channelLens.open(id);}
});
document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{setChapter(+b.dataset.chapter);state.playing=!reduced;updatePlay();history.replaceState(null,'',['#membrane','#the-wave','#the-lead','#whole-heart'][state.chapter]);});
document.querySelector('.chapters').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=(state.chapter+(e.key==='ArrowRight'?1:3))%4;setChapter(n);$('chapter-'+n).focus();}});
function togglePlayback(){if(!state.playing&&state.chapter===3&&state.heartMode==='model'&&state.progress>=1)state.progress=0;state.playing=!state.playing;if($('comparison-dialog').open)comparisonWasPlaying=state.playing;updatePlay();}
$('play').onclick=togglePlayback;$('restart').onclick=()=>{state.progress=0;state.elapsed=0;updateUI(true);updatePlay();};$('timeline').oninput=e=>jump(+e.target.value/1000);$('speed').onchange=e=>state.speed=+e.target.value;$('next').onclick=()=>{setChapter((state.chapter+1)%4);state.playing=!reduced;updatePlay();};
let microscopyWasPlaying=false;
initializeMicroscopy({onOpen:()=>{closeInfoPanels();microscopyWasPlaying=state.playing;state.playing=false;updatePlay();},onClose:()=>{state.playing=microscopyWasPlaying;updatePlay();}});
function openScience(){closeInfoPanels();wasPlaying=state.playing;state.playing=false;updatePlay();$('science-dialog').showModal();}for(const id of ['sources-open','math-open','model-open'])$(id).onclick=openScience;$('science-close').onclick=()=>$('science-dialog').close();$('science-dialog').addEventListener('close',()=>{state.playing=wasPlaying;updatePlay();});$('science-dialog').addEventListener('click',e=>{if(e.target===$('science-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('science-dialog').close();}});
$('comparison-close').onclick=()=>$('comparison-dialog').close();
$('comparison-play').onclick=togglePlayback;
$('comparison-dialog').addEventListener('close',()=>{state.playing=comparisonWasPlaying;updatePlay();});
document.querySelectorAll('[data-comparison-range]').forEach(b=>b.onclick=()=>{state.comparisonRange=b.dataset.comparisonRange;updateComparisonDialog();});
$('comparison-timeline').oninput=e=>{jump(+e.target.value/1000);renderComparisonCanvas();};
function toggleExpanded(){const a=$('experience').classList.toggle('expanded');document.body.style.overflow=a?'hidden':'';$('fullscreen').setAttribute('aria-label',a?'Exit expanded view':'Expand animation');resize();}$('fullscreen').onclick=toggleExpanded;
document.addEventListener('keydown',e=>{if($('science-dialog').open||$('comparison-dialog').open||$('microscopy-dialog').open||channelLens.isOpen()||pharmacology.isOpen()||electrolytes.isOpen())return;if(e.key==='Escape'&&$('experience').classList.contains('expanded'))return toggleExpanded();if(['INPUT','SELECT','TEXTAREA','BUTTON','SUMMARY','A'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();togglePlayback();}if(e.key==='ArrowRight'){e.preventDefault();jump(state.progress+.015);}if(e.key==='ArrowLeft'){e.preventDefault();jump(state.progress-.015);}});
document.querySelectorAll('[data-experiment]').forEach(b=>b.onclick=()=>{const t=b.dataset.experiment;setChapter(t==='uniform'?1:2,{progress:t==='uniform'?100/600:.27,scroll:true});pause();if(t==='uniform'){state.uniform=true;$('uniform-toggle').checked=true;}if(t==='negative')state.polarity=-1;if(t==='reference')state.offset=2;updateUI(true);});
document.addEventListener('visibilitychange',()=>lastTime=performance.now());new ResizeObserver(resize).observe($('experience'));
const hash=location.hash;if(hash==='#human-recordings')state.heartMode='measured';setChapter(hash==='#whole-heart'||hash==='#human-recordings'?3:hash==='#the-wave'?1:hash==='#the-lead'?2:0);requestAnimationFrame(frame);
window.cardiacVoltage={getState:()=>({...state}),getReading:()=>valueAt(state.progress),getDataSummary:()=>({human:[...datasets.human.values()].map(d=>({donor:d.donor,accepted:d.valid.length,frames:d.frames})),model:datasets.model?{nodes:datasets.model.nodeCount,frames:datasets.model.frames,variants:Object.keys(datasets.model.variants)}:null})};

/** Shared explanation and controls for the pathway-coupled teaching field. */
import {ELECTRICAL_VIEWS as FIELD_VIEWS} from './electrical-field.js';
export const ELECTRICAL_VIEWS = {
  voltage: {label:'Membrane voltage', low:'−85 mV', mid:'Vₘ · assumed scale', high:'+25 mV', note:'Inside minus outside each cell. Warm tissue is depolarized; the ECG depends on spatial differences, not the amount of warm tissue.'},
  fronts: {label:'Moving wavefronts', low:'Cyan · falling Vₘ', mid:'Local voltage change', high:'Gold · rising Vₘ', note:'Gold marks rising membrane voltage; cyan marks falling voltage. A falling voltage is not yet complete recovery. The separate recovery-time map marks 90% recovery on each region’s own clock, not a returning Purkinje impulse.'},
  activation: {label:'Activation time', low:'Earlier', mid:'Local upstroke', high:'Later', note:'A static map of the order in which the modeled tissue activates. The atria and ventricles use their respective event clocks.'},
  recovery: {label:'Recovery time', low:'Earlier', mid:'90% recovery', high:'Later', note:'Recovery time = activation time + local APD₉₀. Later activation does not always mean later recovery.'},
  apd: {label:'Action-potential duration', low:'Shorter', mid:'APD₉₀', high:'Longer', note:'Duration from local upstroke to 90% recovery. A spatially varying duration changes recovery order and the T wave.'}
};

export function electricalViewMarkup(view='voltage') {
  const m=ELECTRICAL_VIEWS[view]||ELECTRICAL_VIEWS.voltage;
  return `<section class="electrical-view-control" aria-label="Electrical field display">
    <div class="electrical-view-row"><label for="electrical-view">Color by</label><select id="electrical-view" class="select-field">${Object.entries(ELECTRICAL_VIEWS).map(([v,o])=>`<option value="${v}" ${view===v?'selected':''}>${o.label}</option>`).join('')}</select></div>
    <div class="electrical-scale" data-electrical-scale="${view}"><div class="electrical-scale-gradient"></div><div class="electrical-scale-labels"><span data-scale-low>${m.low}</span><b data-scale-mid>${m.mid}</b><span data-scale-high>${m.high}</span></div></div>
    <div class="electrical-map-help" data-info-panel="Reading the electrical map" data-info-label="Read this map"><p class="electrical-view-note" id="electrical-view-note">${m.note}</p>
    <p class="electrical-pathway-key" data-pathway-key hidden><span aria-hidden="true">●</span> Impulse → muscle junction → spreading depolarization. Fast conducting fibers can pass resting muscle before delivering the impulse at a junction.</p>
    <details class="electrical-method-note"><summary>What this electrical map represents</summary><p>The ventricular pathways and working muscle share one activation model. An impulse follows the connected conducting tree, reaches a muscle junction, and recruits the inner wall after a short assumed junctional delay. Activation then spreads along the chamber’s connected inner surface and outward through the wall. These conducting fibers are specialized cardiac muscle cells, not nerves.</p><p>The model retains the reference recovery pattern by adjusting local action-potential duration when activation timing changes. Ventricular recovery shape uses pooled human optical data; the intrinsic upstroke, absolute millivolt scale, junction delays, and propagation speeds are teaching assumptions. The displayed ECG supplies the overall timing. Reference anatomy and reference recovery data come from different hearts; this is not a patient activation measurement.</p><p>Neutral areas in static maps indicate regions whose organized timing is unavailable. Bundle block, ectopy and injury remain schematic adaptations; AF, flutter, VT, torsades and VF retain qualitative mechanism illustrations. The idealized ECGs in Modules 2–4 and the Sandbox retain their teaching signal models. Module 5’s <b>Fitted propagation</b> view separately calculates the ECG from the same native 3D source field that it displays.</p><p data-field-status>Loading the shared activation and recovery model…</p><a href="./data/pathology-fits/PATHWAY_MUSCLE_SYNCHRONIZATION.md" target="_blank" rel="noopener">Synchronization method & checks ↗</a> · <a href="./data/electrical-atlas.json" target="_blank" rel="noopener">Recovery reference provenance ↗</a></details></div>
  </section>`;
}

export function bindElectricalUI(scene, view, onChange) {
  const select=document.getElementById('electrical-view');
  if(!select)return;
  const update=value=>{
    const m=ELECTRICAL_VIEWS[value]||ELECTRICAL_VIEWS.voltage;
    select.value=value;
    document.querySelector('[data-electrical-scale]')?.setAttribute('data-electrical-scale',value);
    for(const [key,text] of [['low',m.low],['mid',m.mid],['high',m.high]]){const el=document.querySelector(`[data-scale-${key}]`);if(el)el.textContent=text;}
    const note=document.getElementById('electrical-view-note');if(note)note.textContent=m.note;
    const pill=document.querySelector('#scene .legend-pill');if(pill){pill.classList.add('electrical-legend-pill');pill.dataset.mode=value;pill.innerHTML=`<span class="legend-gradient"></span>${m.label}`;}
    scene?.set({electricalView:value});
    updateElectricalUI(scene);
  };
  select.onchange=()=>{update(select.value);onChange?.(select.value);};
  update(view||'voltage');
}

export function updateElectricalUI(scene){
  const scale=document.querySelector('[data-electrical-scale]');if(!scale||!scene)return;
  const view=scene.electricalView||'voltage',m=scene.electricalLegend||FIELD_VIEWS[view],state=scene.electricalState;
  const bar=scale.querySelector('.electrical-scale-gradient');if(bar&&FIELD_VIEWS[view])bar.style.background=FIELD_VIEWS[view].gradient;
  if(['activation','recovery','apd'].includes(view)){
    const labels=[['low',Math.round(m.min)+' ms'],['mid',view==='apd'?'APD₉₀':view==='activation'?'From QRS / P onset':'From QRS onset'],['high',Math.round(m.max)+' ms']];
    for(const [key,value]of labels){const el=scale.querySelector(`[data-scale-${key}]`);if(el)el.textContent=value;}
  }
  const note=document.getElementById('electrical-view-note');
  if(note){const unavailable=state?.suppressNormalVentricularConduction?' Ventricular activity here is qualitative; static timing maps are neutral.':(state?.atrialFibrillation||state?.atrialFlutter||state?.atrialTimingUnavailable)?' Atrial timing maps are neutral where organized activation is unavailable.':'';note.textContent=ELECTRICAL_VIEWS[view].note+unavailable;}
  const key=document.querySelector('[data-pathway-key]');if(key)key.hidden=!(scene.cutaway&&scene.conductionOn);
  const status=document.querySelector('[data-field-status]');if(status)status.textContent=scene.electricalSource==='network-coupled-reference'?'Shared pathway and muscle activation loaded. Reference recovery is retained; overall timing follows the displayed ECG.':scene.electricalSource==='mapped-ct-reference'?'The pathway coupling could not load. The transferred CT activation field is being displayed; its fiber animation is a separate teaching guide.':scene.electricalSource==='illustrative-fallback'?'The reference field could not load. A simpler illustrative fallback is being displayed.':'Loading the shared activation and recovery model…';
}

export const SNAPSHOTS={
  p:{title:'A moving front through the atria',text:'The sinus impulse recruits atrial myocardium. Cells behind the front have depolarized while cells ahead remain at rest. That spatial difference contributes to the P wave.',at:f=>f.pPeak},
  pr:{title:'An electrical delay, not an empty heart',text:'After atrial activation, the AV junction delays the impulse before rapid ventricular recruitment. A small surface signal does not mean every cell has returned to rest.',at:f=>(f.pEnd+f.qrsStart)/2},
  qrs:{title:'Rapid recruitment of ventricular tissue',text:'Distributed endocardial activation spreads through the ventricular walls. The lead weights the spatial voltage differences across the whole heart; a bright region is not itself a positive ECG deflection.',at:f=>f.rPeak},
  st:{title:'Depolarized tissue can produce a flat ECG',text:'Much of the ventricle remains on its action-potential plateau. When neighboring regions have similar voltage, their contributions to the lead largely cancel. Ischemia can disturb this balance.',at:f=>(f.qrsEnd+f.tStart)/2},
  t:{title:'Recovery has its own spatial order',text:'Local recovery combines when each region activated with how long its action potential lasts. The recovery pattern need not be an exact reversal of activation, and its polarity also depends on the lead.',at:f=>f.tPeak},
  qt:{title:'One interval spans two different processes',text:'QT begins with ventricular activation and ends when the recorded ventricular recovery wave has finished. This snapshot shows recovery; the interval covers the preceding QRS and plateau as well.',at:f=>f.tPeak},
  rr:{title:'Between beats, most ventricular cells rest',text:'The RR interval measures the timing between successive ventricular complexes. The resting myocardium has a large negative membrane voltage, yet the surface ECG can sit near its reference baseline.',at:f=>Math.min(f.rr-.02,f.tEnd+.06)}
};

/** Two rendered tissue samples, evaluated by the same fitted source model. */
export const AP_SAMPLE_COLORS={A:'#2d7e78',B:'#c17847'};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sign=(x,n=1)=>(x>=0?'+':'−')+Math.abs(x).toFixed(n);
const CHAMBERS={1:'Left ventricle',2:'Right ventricle',3:'Left atrium',4:'Right atrium'};

export function chooseFitSamples(base,field,kind){
  const chamber=base.nodes.chamber,cap=[...new Set(base.geometry.cutTriangles)],defaults=base.defaultSites||[];
  const firstIn=id=>defaults.find(n=>chamber[n]===id)??cap.find(n=>chamber[n]===id)??chamber.findIndex(c=>c===id);
  let A=firstIn(1),B=firstIn(2);
  if(kind==='rbbb'){
    // A late RV cut-face example makes delayed recruitment inspectable. It is
    // a chosen teaching sample, not a claim about the entire RV's timing.
    const rv=cap.filter(n=>chamber[n]===2).sort((a,b)=>field.nodeAT[a]-field.nodeAT[b]);
    if(rv.length)B=rv[Math.floor(.85*(rv.length-1))];
  }
  if(kind==='stemi'){
    const lv=cap.filter(n=>chamber[n]===1);
    if(lv.length){
      B=lv.reduce((best,n)=>field.nodeLesion[n]>field.nodeLesion[best]?n:best,lv[0]);
      if(field.nodeLesion[A]>.05)A=lv.reduce((best,n)=>field.nodeLesion[n]<field.nodeLesion[best]?n:best,lv[0]);
    }
  }
  return {A,B};
}

export class FitAPPanel{
  constructor(host,{base,field,timeMs,timeLabel='ms from R anchor',fullWindow=false,kind,onSeek,onPick,onChange}){
    Object.assign(this,{host,base,field,timeMs,timeLabel,fullWindow,kind,onSeek,onPick,onChange});
    this.samples=chooseFitSamples(base,field,kind);this.target='B';this.time=timeMs[0];this.alive=true;
    host.innerHTML=`<div class="fit-section-heading"><div><div class="section-label">From local voltage to a spatial difference</div><h3>Compare the action potentials.</h3></div><div class="fit-ap-pickers" role="group" aria-label="Choose a myocardial sample"><button type="button" class="button small" data-ap-pick="A" aria-pressed="false"><i style="background:${AP_SAMPLE_COLORS.A}"></i>Choose A on heart</button><button type="button" class="button small" data-ap-pick="B" aria-pressed="true"><i style="background:${AP_SAMPLE_COLORS.B}"></i>Choose B on heart</button><button type="button" class="button small" data-ap-reset>Reset pair</button></div></div><div class="fit-ap-readouts"><div data-ap-readout="A"></div><div data-ap-readout="B"></div><div data-ap-difference></div></div><div class="fit-ap-chart"><canvas tabindex="0" role="slider" aria-label="Local membrane voltages A and B, and A minus B. Click or use arrow keys to seek the shared time." aria-valuemin="${timeMs[0]}" aria-valuemax="${timeMs.at(-1)}"></canvas></div><p class="fit-small-note" data-ap-explanation></p><p class="fit-small-note fit-ap-picking-note">A and B stay at the same anatomical locations when you change model experiments. Reset pair chooses suggested sites for the current model. Choose A or B, then click the 3D tissue to move that sample. The traces are modeled membrane voltages at the rendered tissue points; they are not patient intracellular recordings. Timing readouts are approximate local estimates, not thresholds measured from these interpolated traces.</p>`;
    this.canvas=host.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.cache=document.createElement('canvas');
    // Keep the readout nodes in place during playback. Replacing three HTML
    // subtrees on every frame also forced layout before measuring the canvas.
    this.readouts={};
    for(const key of ['A','B']){
      const card=host.querySelector(`[data-ap-readout="${key}"]`);
      card.innerHTML=`<span><i style="background:${AP_SAMPLE_COLORS[key]}">${key}</i>Myocardium</span><strong>−85.0 <small>mV</small></strong><p></p>`;
      this.readouts[key]={label:card.querySelector('span').lastChild,value:card.querySelector('strong').firstChild,timing:card.querySelector('p')};
    }
    const difference=host.querySelector('[data-ap-difference]');
    difference.innerHTML='<span>A − B at this instant</span><strong>+0.0 <small>mV</small></strong><p>Difference of local membrane voltages</p>';
    this.differenceValue=difference.querySelector('strong').firstChild;
    host.querySelectorAll('[data-ap-pick]').forEach(button=>button.onclick=()=>{this.target=button.dataset.apPick;this.updateButtons();this.onPick?.(this.target);});
    host.querySelector('[data-ap-reset]').onclick=()=>{this.samples=chooseFitSamples(this.base,this.field,this.kind);this.rebuild();this.onChange?.();};
    this.events={
      pointerdown:e=>{this.pointer=e.pointerId;this.canvas.setPointerCapture(e.pointerId);this.seekEvent(e);},
      pointermove:e=>{if(this.pointer===e.pointerId)this.seekEvent(e);},
      pointerup:()=>{this.pointer=null;},pointercancel:()=>{this.pointer=null;},
      keydown:e=>{let t=null;if(e.key==='ArrowLeft')t=this.time-(e.shiftKey?25:5);if(e.key==='ArrowRight')t=this.time+(e.shiftKey?25:5);if(e.key==='Home')t=this.timeMs[0];if(e.key==='End')t=this.timeMs.at(-1);if(t!==null){e.preventDefault();this.time=clamp(t,this.timeMs[0],this.timeMs.at(-1));this.onSeek?.(this.time);}}
    };
    for(const [name,fn]of Object.entries(this.events))this.canvas.addEventListener(name,fn);
    this.observer=new ResizeObserver(()=>{this.dirty=true;this.draw(this.time);});this.observer.observe(this.canvas);this.rebuild();
  }
  updateButtons(){this.host.querySelectorAll('[data-ap-pick]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.apPick===this.target)));}
  setField(field){this.field=field;this.rebuild();}
  setSample(node){if(!Number.isInteger(node)||node<0||node>=this.field.nodeCount)return;this.samples[this.target]=node;this.rebuild();this.onChange?.();}
  rebuild(){
    this.series={};for(const key of ['A','B'])this.series[key]=this.timeMs.map(t=>this.field.voltageAtNode(this.samples[key],t));
    this.series.difference=this.series.A.map((v,i)=>v-this.series.B[i]);
    const a=this.samples.A,b=this.samples.B,delay=this.field.nodeAT[b]-this.field.nodeAT[a];
    const timing=this.fullWindow?'This panel follows the same full recording clock and source-event schedule. ':`At these points, B activates approximately ${Math.abs(delay).toFixed(0)} ms ${delay>=0?'after':'before'} A. `;
    const statement=timing+'Different activation times, plateau shapes, and recovery times can create a spatial voltage difference. Watch how that difference changes as each region activates and recovers.';
    this.host.querySelector('[data-ap-explanation]').textContent=statement+' A − B illustrates a local membrane-voltage difference. The ECG combines gradients across the entire myocardium through the torso lead field; this pair difference is not itself the lead voltage.';
    for(const key of ['A','B']){
      const node=this.samples[key],injury=this.field.nodeLesion[node],readout=this.readouts[key];
      readout.label.nodeValue=CHAMBERS[this.base.nodes.chamber[node]]+(injury>.05?' · injury weight '+injury.toFixed(2):'');
      readout.timing.textContent=`${this.fullWindow?'Nominal activation':'Activation'} ≈ ${sign(this.field.nodeAT[node],0)} ms · APD₉₀ ≈ ${Math.round(this.field.nodeAPD[node])} ms`;
    }
    this.dirty=true;this.draw(this.time);
  }
  seekEvent(event){if(!this.layout)return;const r=this.canvas.getBoundingClientRect(),{left,right,width}=this.layout;this.time=this.timeMs[0]+clamp((event.clientX-r.left-left)/(width-left-right),0,1)*(this.timeMs.at(-1)-this.timeMs[0]);this.onSeek?.(this.time);}
  resize(){const r=this.canvas.getBoundingClientRect(),w=Math.round(r.width),h=Math.round(r.height),dpr=Math.min(devicePixelRatio||1,2);if(!w||!h)return false;if(w!==this.width||h!==this.height||dpr!==this.dpr){this.width=w;this.height=h;this.dpr=dpr;this.canvas.width=this.cache.width=Math.round(w*dpr);this.canvas.height=this.cache.height=Math.round(h*dpr);this.dirty=true;}return true;}
  build(){
    const c=this.cache.getContext('2d'),w=this.width,h=this.height,left=w<600?57:70,right=18,top=24,bottom=27,gap=22,row=(h-top-bottom-2*gap)/3;
    const span=this.timeMs.at(-1)-this.timeMs[0],timeStep=Math.max(100,Math.ceil(span/7/100)*100);
    this.layout={left,right,width:w,top,bottom,row,gap};this.x=t=>left+(t-this.timeMs[0])/(this.timeMs.at(-1)-this.timeMs[0])*(w-left-right);
    c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle='#fcfdf8';c.fillRect(0,0,w,h);c.lineWidth=.5;
    const columns=['A','B','difference'];this.rows=[];
    columns.forEach((key,index)=>{
      const y0=top+index*(row+gap),y1=y0+row;
      let low=key==='difference'?-120:-100,high=key==='difference'?120:40;
      for(const v of this.series[key]){low=Math.min(low,v-5);high=Math.max(high,v+5);}
      const y=v=>y1-(v-low)/(high-low)*row;this.rows.push({key,y,y0,y1});
      c.fillStyle=index===2?'#f0f4eb':'#f8faf3';c.fillRect(left,y0,w-left-right,row);
      for(let t=Math.ceil(this.timeMs[0]/timeStep)*timeStep;t<=this.timeMs.at(-1);t+=timeStep){c.strokeStyle='#dee7d7';c.beginPath();c.moveTo(this.x(t),y0);c.lineTo(this.x(t),y1);c.stroke();}
      c.font='9px ui-monospace,monospace';c.textAlign='right';c.fillStyle='#85947a';
      for(const v of key==='difference'?[-100,0,100]:[-85,0,25]){c.strokeStyle=v===0?'#bdcdb4':'#e0e8da';c.beginPath();c.moveTo(left,y(v));c.lineTo(w-right,y(v));c.stroke();c.fillText(v>0?'+'+v:String(v),left-8,y(v)+3);}
      c.textAlign='left';c.font='600 10px system-ui';c.fillStyle=key==='difference'?'#68784c':AP_SAMPLE_COLORS[key];c.fillText(key==='difference'?'A − B · local difference':key+' · membrane voltage',left,y0-7);
      c.strokeStyle=key==='difference'?'#879964':AP_SAMPLE_COLORS[key];c.lineWidth=1.7;c.lineJoin='round';c.beginPath();this.timeMs.forEach((t,i)=>i?c.lineTo(this.x(t),y(this.series[key][i])):c.moveTo(this.x(t),y(this.series[key][i])));c.stroke();
    });
    c.fillStyle='#7e8f72';c.font='9px ui-monospace,monospace';c.textAlign='center';for(let t=Math.ceil(this.timeMs[0]/timeStep)*timeStep;t<=this.timeMs.at(-1);t+=timeStep)c.fillText(t,this.x(t),h-11);c.textAlign='left';c.fillText('mV',8,13);c.textAlign='right';c.fillText(this.timeLabel,w-right,h-1);this.dirty=false;
  }
  draw(time=this.time){
    if(!this.alive)return;this.time=time;
    // Measure before updating text, then evaluate the two tissue samples once.
    // The same exact values drive the cards, difference, and cursor markers.
    const sized=this.resize(),values={A:this.field.voltageAtNode(this.samples.A,time),B:this.field.voltageAtNode(this.samples.B,time)},diff=values.A-values.B;
    for(const key of ['A','B']){const text=sign(values[key])+' ';if(this.readouts[key].value.nodeValue!==text)this.readouts[key].value.nodeValue=text;}
    const differenceText=sign(diff)+' ';if(this.differenceValue.nodeValue!==differenceText)this.differenceValue.nodeValue=differenceText;
    const now=String(Math.round(time)),description=`${now} milliseconds ${this.fullWindow?'in the recording':'from R anchor'}; A minus B ${sign(diff)} millivolts.`;
    if(this.canvas.getAttribute('aria-valuenow')!==now)this.canvas.setAttribute('aria-valuenow',now);
    if(this.canvas.getAttribute('aria-valuetext')!==description)this.canvas.setAttribute('aria-valuetext',description);
    if(!sized)return;if(this.dirty)this.build();const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);c.drawImage(this.cache,0,0,this.width,this.height);const x=this.x(time);
    c.strokeStyle='rgba(209,91,83,.72)';c.lineWidth=1.2;c.beginPath();c.moveTo(x,15);c.lineTo(x,this.height-25);c.stroke();
    for(const r of this.rows){const v=r.key==='difference'?diff:values[r.key];c.fillStyle=r.key==='difference'?'#879964':AP_SAMPLE_COLORS[r.key];c.beginPath();c.arc(x,r.y(v),3,0,Math.PI*2);c.fill();}
  }
  destroy(){this.alive=false;this.observer.disconnect();for(const [name,fn]of Object.entries(this.events))this.canvas.removeEventListener(name,fn);}
}

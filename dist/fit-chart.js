/** Stationary observed/predicted comparison. Only the large trace has a cursor. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class FitChart {
  constructor(canvas,{timeMs,observed,predicted,p25,p75,lead='II',timeLabel='ms from R anchor',compact=false,residual=true,onSeek,onSelect}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.options={timeMs,observed,predicted,p25,p75,lead,timeLabel,compact,residual,onSeek,onSelect};
    this.time=0;this.dirty=true;this.cache=document.createElement('canvas');this.alive=true;
    canvas.tabIndex=0;canvas.setAttribute('role',onSeek?'slider':'button');canvas.setAttribute('aria-label',onSeek?`Observed and simulated lead ${lead}. Arrow keys seek by five milliseconds.`:`Compare lead ${lead}`);
    if(onSeek){canvas.setAttribute('aria-valuemin',timeMs[0]);canvas.setAttribute('aria-valuemax',timeMs.at(-1));canvas.style.touchAction='none';}
    this.events={pointerdown:e=>{if(onSeek){this.pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);this.seekEvent(e);}else onSelect?.();},pointermove:e=>{if(this.pointer===e.pointerId)this.seekEvent(e);},pointerup:e=>{if(this.pointer===e.pointerId)this.pointer=null;},pointercancel:()=>{this.pointer=null;},keydown:e=>{
      if(onSelect&&['Enter',' '].includes(e.key)){e.preventDefault();onSelect();return;}
      if(!onSeek)return;
      const end=timeMs.at(-1),start=timeMs[0];let target=null;
      if(e.key==='ArrowRight')target=this.time+(e.shiftKey?25:5);if(e.key==='ArrowLeft')target=this.time-(e.shiftKey?25:5);if(e.key==='Home')target=start;if(e.key==='End')target=end;
      if(target!==null){e.preventDefault();onSeek(clamp(target,start,end));}
    }};
    for(const [name,fn]of Object.entries(this.events))canvas.addEventListener(name,fn);
    this.observer=new ResizeObserver(()=>{this.dirty=true;this.draw(this.time);});this.observer.observe(canvas);this.draw(0);
  }
  set(patch){Object.assign(this.options,patch);this.dirty=true;this.draw(this.time);}
  seekEvent(event){const rect=this.canvas.getBoundingClientRect(),{left,right,width}=this.layout;const t=this.options.timeMs;this.options.onSeek?.(t[0]+clamp((event.clientX-rect.left-left)/(width-left-right),0,1)*(t.at(-1)-t[0]));}
  resize(){
    const rect=this.canvas.getBoundingClientRect(),w=Math.round(rect.width),h=Math.round(rect.height),dpr=Math.min(2,devicePixelRatio||1);
    if(!w||!h)return false;
    if(this.width!==w||this.height!==h||this.dpr!==dpr){this.width=w;this.height=h;this.dpr=dpr;this.canvas.width=this.cache.width=Math.round(w*dpr);this.canvas.height=this.cache.height=Math.round(h*dpr);this.dirty=true;}
    return true;
  }
  build(){
    const o=this.options,c=this.cache.getContext('2d'),w=this.width,h=this.height,compact=o.compact;
    const left=compact?7:53,right=compact?7:20,top=compact?25:30,bottom=compact?9:40;
    const residual=o.residual&&!compact,mainBottom=residual?h-100:h-bottom;
    this.layout={left,right,width:w,top,mainBottom};
    let low=0,high=0;for(const arr of [o.observed,o.predicted,o.p25,o.p75])if(arr)for(const v of arr)if(Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);}
    const pad=Math.max(.10,(high-low)*.12);low-=pad;high+=pad;
    const time=o.timeMs,x=t=>left+(t-time[0])/(time.at(-1)-time[0])*(w-left-right),y=v=>mainBottom-(v-low)/(high-low)*(mainBottom-top);
    this.x=x;this.y=y;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle='#fffdf8';c.fillRect(0,0,w,h);
    const span=time.at(-1)-time[0],timeStep=span>2000?(compact?1000:200):(compact?100:40),voltageStep=compact?.5:.1;
    c.lineWidth=.5;
    for(let t=Math.ceil(time[0]/timeStep)*timeStep;t<=time.at(-1);t+=timeStep){c.strokeStyle=t%200===0?'#e9c9c1':'#f2e3dc';c.beginPath();c.moveTo(x(t),top);c.lineTo(x(t),mainBottom);c.stroke();}
    for(let v=Math.ceil(low/voltageStep)*voltageStep;v<=high;v+=voltageStep){c.strokeStyle=Math.abs(v*2-Math.round(v*2))<.001?'#e9c9c1':'#f2e3dc';c.beginPath();c.moveTo(left,y(v));c.lineTo(w-right,y(v));c.stroke();}
    c.strokeStyle='#9eaaa0';c.setLineDash([3,4]);c.beginPath();c.moveTo(left,y(0));c.lineTo(w-right,y(0));c.stroke();c.setLineDash([]);
    c.save();c.beginPath();c.rect(left,top,w-left-right,mainBottom-top);c.clip();
    if(o.p25&&o.p75){c.fillStyle='rgba(67,93,82,.13)';c.beginPath();time.forEach((t,i)=>i?c.lineTo(x(t),y(o.p25[i])):c.moveTo(x(t),y(o.p25[i])));for(let i=time.length-1;i>=0;i--)c.lineTo(x(time[i]),y(o.p75[i]));c.closePath();c.fill();}
    for(const [arr,color,width]of [[o.observed,'#24483f',compact?1.1:1.8],[o.predicted,'#d17843',compact?1.2:1.9]])if(arr){c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.beginPath();let drawing=false;time.forEach((t,i)=>{if(!Number.isFinite(arr[i])){drawing=false;return;}if(drawing)c.lineTo(x(t),y(arr[i]));else c.moveTo(x(t),y(arr[i]));drawing=true;});c.stroke();}c.restore();
    c.font='600 12px system-ui';c.fillStyle='#24483f';c.textAlign='left';c.fillText(o.lead,left,17);
    if(!compact){
      c.font='12px ui-monospace,monospace';c.fillStyle='#596d63';c.textAlign='right';
      const tick=(high-low)>4?1:.5;for(let v=Math.ceil(low/tick)*tick;v<=high;v+=tick)c.fillText(v.toFixed(1),left-7,y(v)+4);c.fillText('mV',left-7,17);
      const labelCount=Math.max(2,Math.floor((w-left-right)/62)),labelStep=Math.max(100,Math.ceil(span/labelCount/100)*100);c.textAlign='center';for(let t=Math.ceil(time[0]/labelStep)*labelStep;t<=time.at(-1);t+=labelStep)c.fillText(t,x(t),h-24);
      c.textAlign='right';c.fillText(o.timeLabel,w-right,h-6);
    }
    if(residual){
      const center=h-62,half=13;let bound=.1;for(let i=0;i<time.length;i++)if(Number.isFinite(o.predicted?.[i])&&Number.isFinite(o.observed?.[i]))bound=Math.max(bound,Math.abs(o.predicted[i]-o.observed[i]));this.residualBound=bound;
      c.fillStyle='#f3f4ee';c.fillRect(left,center-half,w-left-right,half*2);c.strokeStyle='#cbd5ca';c.beginPath();c.moveTo(left,center);c.lineTo(w-right,center);c.stroke();
      c.strokeStyle='#9caa98';c.lineWidth=1;c.beginPath();let drawing=false;time.forEach((t,i)=>{if(!Number.isFinite(o.predicted?.[i])||!Number.isFinite(o.observed?.[i])){drawing=false;return;}const yy=center-(o.predicted[i]-o.observed[i])/bound*half;if(drawing)c.lineTo(x(t),yy);else c.moveTo(x(t),yy);drawing=true;});c.stroke();
      c.fillStyle='#596d63';c.textAlign='left';c.font='12px system-ui';c.fillText(w<390?'Residual':'Residual · model − recorded',left,center-half-7);c.textAlign='right';c.fillText('±'+bound.toFixed(2)+' mV',w-right,center-half-7);
    }
    this.dirty=false;
  }
  draw(time=this.time){
    if(!this.alive||!this.resize())return;this.time=time;if(this.dirty)this.build();
    const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);c.drawImage(this.cache,0,0,this.width,this.height);
    if(!this.options.compact){const x=this.x(time);c.strokeStyle='rgba(209,91,83,.7)';c.lineWidth=1.3;c.beginPath();c.moveTo(x,23);c.lineTo(x,this.height-45);c.stroke();c.fillStyle='#cf766c';c.beginPath();c.moveTo(x-4,21);c.lineTo(x+4,21);c.lineTo(x,27);c.closePath();c.fill();}
    if(this.options.onSeek){const now=String(Math.round(time));if(this.canvas.getAttribute('aria-valuenow')!==now)this.canvas.setAttribute('aria-valuenow',now);}
  }
  destroy(){this.alive=false;this.observer.disconnect();for(const [name,fn]of Object.entries(this.events))this.canvas.removeEventListener(name,fn);}
}

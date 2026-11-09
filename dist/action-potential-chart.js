import {getFiducials} from './ecg.js';
import {AP_SITES,actionPotentialAt,actionPotentialState} from './action-potentials.js';
import {electricalFieldRevision} from './electrical-field.js';

const DEFAULTS={
  siteId:'sa',bpm:72,time:0,onSeek:null,
  voltageMin:-100,voltageMax:40,yTicks:[-100,-50,0,40],
  yLabels:true,xLabels:true,left:32,right:16,
  // The optional sampler lets an aligned surface-ECG reference use the same
  // clock and interaction without confusing extracellular and cellular scales.
  sampleValue:null,sampleKey:0,color:null,label:null,
};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mod=(value,period)=>((value%period)+period)%period;
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const formatVoltage=value=>{
  if(Math.abs(value)<1e-10)return '0';
  const magnitude=Number(Math.abs(value).toFixed(Math.abs(value)<1?2:1));
  return (value<0?'−':'+')+magnitude;
};
const managedAttributes=['tabindex','role','aria-label','aria-orientation','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','aria-keyshortcuts'];

/**
 * One stationary heartbeat, with a shared-clock cursor and a local voltage dot.
 *
 * set({time}) / render(time) reuse the cached waveform and grid. Changing bpm,
 * site, scale or sampleKey rebuilds the cache. For a generic reference, supply
 * sampleValue(t,bpm), voltageMin/Max, yTicks, color and label. Increment sampleKey
 * when a sampler closes over changed lead/region state.
 *
 * onSeek receives seconds within the beat; the owner seeks its shared clock and continues playback.
 * The canvas owns no animation timer, so every row follows the same instant.
 */
export class ActionPotentialChart{
  constructor(canvas,options={}){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('ActionPotentialChart requires a canvas.');
    this.canvas=canvas;this.ctx=canvas.getContext('2d');
    if(!this.ctx)throw new Error('A 2D canvas context is required for action-potential charts.');
    this.options={...DEFAULTS,...options};
    if('yLabel'in options&&!('yLabels'in options))this.options.yLabels=!!options.yLabel;
    this._normalizeOptions();
    this.time=finite(this.options.time,0);this.lastTime=this.time;this.destroyed=false;
    this.width=0;this.height=0;this.pixelRatio=1;this.scale=null;
    this._cache=null;this._cacheValid=false;this._activePointer=null;this._accessibleDirty=true;
    this._originalAttributes=new Map(managedAttributes.map(name=>[name,canvas.getAttribute(name)]));
    this._originalStyles={touchAction:canvas.style.touchAction,cursor:canvas.style.cursor};
    this._listeners={
      pointerdown:event=>this._pointerDown(event),
      pointermove:event=>this._pointerMove(event),
      pointerup:event=>this._pointerUp(event),
      pointercancel:event=>this._pointerUp(event),
      lostpointercapture:event=>this._pointerUp(event),
      keydown:event=>this._keyDown(event),
    };
    for(const [name,listener]of Object.entries(this._listeners))canvas.addEventListener(name,listener);
    this._syncAccessibility();
    this.resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(!this.destroyed)this.render(this.time);}):null;
    this.resizeObserver?.observe(canvas);this.render(this.time);
  }

  _normalizeOptions(){
    const o=this.options;
    o.bpm=clamp(finite(o.bpm,72),45,120);
    // A supplied sampler is its own signal source. In particular, the surface
    // ECG reference has no corresponding cellular AP site or phase metadata.
    this.site=typeof o.sampleValue==='function'
      ? {id:o.siteId,label:'Surface ECG reference',color:'#315f49'}
      : AP_SITES.find(site=>site.id===o.siteId);
    if(!this.site)throw new RangeError('Unknown action-potential site: '+o.siteId);
    o.voltageMin=finite(o.voltageMin,-100);o.voltageMax=finite(o.voltageMax,40);
    if(o.voltageMax<=o.voltageMin)throw new RangeError('The voltage maximum must exceed the minimum.');
    o.left=Math.max(0,finite(o.left,32));o.right=Math.max(0,finite(o.right,16));
    o.yTicks=Array.isArray(o.yTicks)?o.yTicks.filter(value=>Number.isFinite(Number(value))).map(Number):[o.voltageMin,0,o.voltageMax];
    this.color=o.color||this.site.chartColor||this.site.color;
    this.label=o.label||this.site.label;
    this.period=getFiducials(o.bpm).rr;
    this.endTime=Math.max(0,this.period-1e-6);
  }

  set(patch={}){
    if(this.destroyed)return this;
    const previous=this.options;
    // Playback usually patches only time: no curve samples, grid layout or
    // static accessibility text need to be recreated for a moving cursor.
    const timeOnly=Object.keys(patch).every(key=>key==='time');
    this.options={...previous,...patch};
    if('yLabel'in patch&&!('yLabels'in patch))this.options.yLabels=!!patch.yLabel;
    if(!timeOnly){
      const keys=['siteId','bpm','voltageMin','voltageMax','yTicks','yLabels','xLabels','left','right','sampleValue','sampleKey','color','label'];
      if(keys.some(key=>this.options[key]!==previous[key]))this._cacheValid=false;
      this._normalizeOptions();this._syncAccessibility();
    }
    return this.render('time'in patch?finite(patch.time,0):this.time);
  }

  _size(){
    const rect=this.canvas.getBoundingClientRect();
    const width=Math.round(rect.width),height=Math.round(rect.height);
    if(width<1||height<1)return false;
    const ratio=Math.min(Math.max(1,globalThis.devicePixelRatio||globalThis.window?.devicePixelRatio||1),2);
    const backingWidth=Math.max(1,Math.round(width*ratio)),backingHeight=Math.max(1,Math.round(height*ratio));
    if(this.width!==width||this.height!==height||this.pixelRatio!==ratio||this.canvas.width!==backingWidth||this.canvas.height!==backingHeight){
      this.width=width;this.height=height;this.pixelRatio=ratio;
      this.canvas.width=backingWidth;this.canvas.height=backingHeight;this._cacheValid=false;
    }
    this.ctx.setTransform(ratio,0,0,ratio,0,0);
    const left=Math.min(this.options.left,Math.max(0,width-2)),right=Math.min(this.options.right,Math.max(0,width-left-1));
    const top=Math.min(8,height*.15),bottom=Math.min(19,height*.3);
    this.scale={left,right,top,bottom,plotWidth:Math.max(1,width-left-right),plotHeight:Math.max(1,height-top-bottom)};
    return true;
  }

  _x(time){return this.scale.left+time/this.period*this.scale.plotWidth;}
  _y(voltage){return this.scale.top+(this.options.voltageMax-voltage)/(this.options.voltageMax-this.options.voltageMin)*this.scale.plotHeight;}
  _value(time){return typeof this.options.sampleValue==='function'?Number(this.options.sampleValue(time,this.options.bpm)):actionPotentialAt(time,this.options.siteId,this.options.bpm);}

  _buildCache(){
    this._cache??=document.createElement('canvas');
    this._cache.width=this.canvas.width;this._cache.height=this.canvas.height;
    const ctx=this._cache.getContext('2d');ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    const s=this.scale,o=this.options;
    ctx.fillStyle='#fffdf9';ctx.fillRect(0,0,this.width,this.height);
    const tickStep=[.05,.1,.2,.25,.5,1,2].find(step=>step/this.period*s.plotWidth>=55)||2;
    const minorStep=tickStep/2;
    ctx.lineWidth=.8;
    for(let i=0;i*minorStep<=this.period+1e-9;i++){
      const x=this._x(i*minorStep);ctx.strokeStyle=i%2===0?'#e4e9df':'#eff1e9';
      ctx.beginPath();ctx.moveTo(x,s.top);ctx.lineTo(x,s.top+s.plotHeight);ctx.stroke();
    }
    for(const value of o.yTicks){
      if(value<o.voltageMin||value>o.voltageMax)continue;
      ctx.strokeStyle=Math.abs(value)<1e-9?'#bbc8b5':'#e6ebe1';ctx.lineWidth=Math.abs(value)<1e-9?1:.8;
      const y=this._y(value);ctx.beginPath();ctx.moveTo(s.left,y);ctx.lineTo(s.left+s.plotWidth,y);ctx.stroke();
    }
    ctx.save();ctx.beginPath();ctx.rect(s.left,s.top,s.plotWidth,s.plotHeight);ctx.clip();
    // Sub-millisecond sampling preserves narrow upstrokes even in small rows.
    const count=Math.min(8000,Math.max(2000,Math.ceil(s.plotWidth*3)));
    ctx.beginPath();let begun=false;
    for(let i=0;i<=count;i++){
      const time=i/count*this.period,value=this._value(time);
      if(!Number.isFinite(value)){begun=false;continue;}
      const x=this._x(time),y=this._y(value);
      if(begun)ctx.lineTo(x,y);else{ctx.moveTo(x,y);begun=true;}
    }
    ctx.lineCap='round';ctx.lineJoin='round';
    // The quiet dark under-stroke keeps light site colors legible on paper.
    ctx.strokeStyle='#244834';ctx.globalAlpha=.13;ctx.lineWidth=3.5;ctx.stroke();
    ctx.strokeStyle=this.color;ctx.globalAlpha=1;ctx.lineWidth=1.9;ctx.stroke();ctx.restore();
    ctx.fillStyle='#60725e';ctx.font='12px "DM Sans",sans-serif';ctx.textBaseline='middle';
    if(o.yLabels){
      ctx.textAlign='right';
      for(const value of o.yTicks)if(value>=o.voltageMin&&value<=o.voltageMax)ctx.fillText(formatVoltage(value),s.left-3,this._y(value));
    }
    if(o.xLabels){
      const labelY=this.height-7;
      const endLabel=Math.round(this.period*1000)+' ms',endX=s.left+s.plotWidth;
      const endLeft=endX-ctx.measureText(endLabel).width;
      let previousRight=s.left+ctx.measureText('0').width;
      if(endLeft>=previousRight+12){ctx.textAlign='left';ctx.fillText('0',s.left,labelY);}
      for(let i=1;i*tickStep<this.period;i++){
        const time=i*tickStep,x=this._x(time);
        const label=String(Math.round(time*1000)),halfWidth=ctx.measureText(label).width/2;
        if(x-halfWidth<previousRight+12||x+halfWidth>endLeft-12)continue;
        ctx.textAlign='center';ctx.fillText(label,x,labelY);previousRight=x+halfWidth;
      }
      ctx.textAlign='right';ctx.fillText(endLabel,endX,labelY);
    }
    this._cacheValid=true;
  }

  render(timeSeconds=this.time){
    const electricalRevision=electricalFieldRevision();
    if(this._electricalRevision!==electricalRevision){this._electricalRevision=electricalRevision;this._cacheValid=false;}
    if(this.destroyed)return this;
    this.time=finite(timeSeconds,0);this.lastTime=this.time;this.options.time=this.time;
    if(!this._size())return this;
    if(!this._cacheValid)this._buildCache();
    const ctx=this.ctx,s=this.scale;
    ctx.clearRect(0,0,this.width,this.height);ctx.drawImage(this._cache,0,0,this.width,this.height);
    // Exactly the same beat phase drives every row and the anatomical model.
    this.phaseTime=mod(this.time,this.period);this.voltage=this._value(this.phaseTime);
    const x=this._x(this.phaseTime);
    ctx.save();ctx.beginPath();ctx.rect(s.left,s.top-3,s.plotWidth,s.plotHeight+6);ctx.clip();
    ctx.strokeStyle='#cf706b';ctx.globalAlpha=.78;ctx.lineWidth=1.25;
    ctx.beginPath();ctx.moveTo(x,s.top);ctx.lineTo(x,s.top+s.plotHeight);ctx.stroke();
    if(Number.isFinite(this.voltage)){
      const y=this._y(this.voltage);ctx.globalAlpha=.15;ctx.fillStyle='#cf706b';ctx.beginPath();ctx.arc(x,y,6.5,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=1;ctx.fillStyle=this.color;ctx.strokeStyle='#fffdf9';ctx.lineWidth=1.7;
      ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    ctx.restore();this._updateAccessibleValue();return this;
  }

  _canSeek(){return typeof this.options.onSeek==='function';}

  _syncAccessibility(){
    const interactive=this._canSeek();
    this.canvas.setAttribute('role',interactive?'slider':'img');
    const generic=typeof this.options.sampleValue==='function';
    this.canvas.setAttribute('aria-label',`${this.label}. ${generic?'Surface ECG reference':'Illustrative cellular action potential'}. Stationary one-beat waveform; time in milliseconds, voltage in millivolts from ${this.options.voltageMin} to ${this.options.voltageMax}.`+(interactive?' Click or drag to continue playback from that instant. Left/right arrows move 2 milliseconds; Shift moves 100 milliseconds. Home/End move to the beat boundaries.':''));
    if(interactive){
      this.canvas.setAttribute('tabindex','0');this.canvas.setAttribute('aria-orientation','horizontal');
      this.canvas.setAttribute('aria-valuemin','0');this.canvas.setAttribute('aria-valuemax',String(Number((this.endTime*1000).toFixed(3))));
      this.canvas.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight Home End');
      this.canvas.style.touchAction='none';this.canvas.style.cursor='crosshair';
    }else{
      const original=this._originalAttributes.get('tabindex');if(original===null)this.canvas.removeAttribute('tabindex');else this.canvas.setAttribute('tabindex',original);
      for(const name of ['aria-orientation','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext','aria-keyshortcuts'])this.canvas.removeAttribute(name);
      this.canvas.style.touchAction=this._originalStyles.touchAction;this.canvas.style.cursor=this._originalStyles.cursor;
    }
    this._accessibleDirty=true;
  }

  _updateAccessibleValue(force=false){
    if(!this._canSeek())return;
    const now=globalThis.performance?.now?.()??Date.now();
    if(!force&&!this._accessibleDirty&&now-(this._lastAccessibleUpdate??0)<200)return;
    const phase=typeof this.options.sampleValue==='function'?null:actionPotentialState(this.phaseTime,this.options.siteId,this.options.bpm);
    const voltage=Number.isFinite(this.voltage)?formatVoltage(this.voltage)+' millivolts':'voltage unavailable';
    this.canvas.setAttribute('aria-valuenow',String(Number((this.phaseTime*1000).toFixed(3))));
    this.canvas.setAttribute('aria-valuetext',`${Math.round(this.phaseTime*1000)} milliseconds; ${voltage}${phase?.phaseLabel?'; '+phase.phaseLabel:''}.`);
    this._accessibleDirty=false;this._lastAccessibleUpdate=now;
  }

  _timeAt(event){
    const rect=this.canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*this.width/Math.max(1,rect.width);
    return clamp((x-this.scale.left)/this.scale.plotWidth*this.period,0,this.endTime);
  }

  _seek(time){
    const target=clamp(time,0,this.endTime);this._accessibleDirty=true;this.render(target);
    this.options.onSeek?.(target);return target;
  }

  _pointerDown(event){
    if(!this._canSeek()||!this.scale||event.isPrimary===false||(event.button!==undefined&&event.button!==0))return;
    this._activePointer=event.pointerId;this.canvas.focus({preventScroll:true});
    try{this.canvas.setPointerCapture?.(event.pointerId);}catch{}
    this._seek(this._timeAt(event));event.preventDefault();
  }

  _pointerMove(event){
    if(this._activePointer===null||event.pointerId!==this._activePointer||!this._canSeek())return;
    this._seek(this._timeAt(event));event.preventDefault();
  }

  _pointerUp(event){
    if(this._activePointer===null||event.pointerId!==this._activePointer)return;
    this._activePointer=null;
    if(this.canvas.hasPointerCapture?.(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
  }

  _keyDown(event){
    // A listener on the canvas alone does not intercept global shortcuts. The
    // focus guard also rejects programmatically bubbled events from elsewhere.
    if(!this._canSeek()||!this.scale||event.target!==this.canvas||document.activeElement!==this.canvas||event.altKey||event.ctrlKey||event.metaKey)return;
    let target=mod(this.time,this.period);
    if(event.key==='Home')target=0;
    else if(event.key==='End')target=this.endTime;
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight')target+=(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?.1:.002);
    else return;
    event.preventDefault();event.stopPropagation();this._seek(target);
  }

  destroy(){
    if(this.destroyed)return;
    this.destroyed=true;this.resizeObserver?.disconnect();
    if(this._activePointer!==null&&this.canvas.hasPointerCapture?.(this._activePointer))this.canvas.releasePointerCapture(this._activePointer);
    this._activePointer=null;
    for(const [name,listener]of Object.entries(this._listeners))this.canvas.removeEventListener(name,listener);
    for(const [name,value]of this._originalAttributes){if(value===null)this.canvas.removeAttribute(name);else this.canvas.setAttribute(name,value);}
    this.canvas.style.touchAction=this._originalStyles.touchAction;this.canvas.style.cursor=this._originalStyles.cursor;
    if(this._cache){this._cache.width=0;this._cache.height=0;this._cache=null;}
  }
}

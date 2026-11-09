import { leadState, fieldPotential } from './model.js';

// A sampled quasi-static volume-conductor field. No particles carry a signal
// from the tissue to an electrode: both electrodes sample this same field.
const C = {
  bg: '#071a22', white: '#edf5f3', muted: '#87a7af', grid: '#173640',
  positive: '#55dcc3', negative: '#f38c7c', gold: '#efc48b'
};
const scene = { w: 1000, h: 610, x: 500, y: 272, scale: 110 };
const cache = { key: '', canvas: null, contours: [], zero: [] };
const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b, v));
const screen = p => ({ x: scene.x + p.x * scene.scale, y: scene.y - p.y * scene.scale });
const mv = value => `${Math.abs(value) < .0005 ? '0.000' : (value > 0 ? '+' : '') + value.toFixed(3)}`;
const rounded = (ctx,x,y,w,h,r=10) => { ctx.beginPath(); ctx.roundRect(x,y,w,h,r); };

function label(ctx,text,x,y,color=C.muted,size=12,align='left',weight=400) {
  ctx.fillStyle=color; ctx.font=`${weight} ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign=align; ctx.textBaseline='middle'; ctx.fillText(text,x,y);
}

function updateField(state, s) {
  const key = `${Math.round(s.progress*170)}:${s.recovery}:${s.uniform ? 1:0}:${Number(s.offset||0).toFixed(3)}`;
  if (cache.key === key && cache.canvas) return;
  if (!cache.canvas) cache.canvas = document.createElement('canvas');
  const w=193,h=109,x0=14,y0=14,spanX=972,spanY=500;
  cache.canvas.width=w; cache.canvas.height=h;
  const cx=cache.canvas.getContext('2d'), img=cx.createImageData(w,h);
  const values=new Float32Array(w*h);
  const sources=state.sources.filter(c=>Math.abs(c.I)>1e-7);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const xx=x0+x/(w-1)*spanX, yy=y0+y/(h-1)*spanY;
    const v=fieldPotential(sources,(xx-scene.x)/scene.scale,(scene.y-yy)/scene.scale)+(s.offset||0);
    values[y*w+x]=v;
    const intensity=Math.tanh(Math.abs(v)*1.45);
    const edge=clamp(Math.min(x/(w*.09),(w-1-x)/(w*.09),y/(h*.12),(h-1-y)/(h*.12)));
    const k=(y*w+x)*4;
    img.data[k]=v>=0?55:243;
    img.data[k+1]=v>=0?220:140;
    img.data[k+2]=v>=0?195:124;
    img.data[k+3]=Math.round(128*Math.pow(intensity,.74)*edge);
  }
  cx.putImageData(img,0,0);
  cache.contours=[];
  const thresholds=[-1.2,-.6,-.3,-.15,-.075,-.03,0,.03,.075,.15,.3,.6,1.2];
  for(const level of thresholds) {
    const lines=[];
    for(let y=1;y<h-2;y++) for(let x=1;x<w-2;x++) {
      const q=[values[y*w+x],values[y*w+x+1],values[(y+1)*w+x+1],values[(y+1)*w+x]];
      const xy=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]], points=[];
      for(let a=0;a<4;a++) {
        const b=(a+1)%4;
        if((q[a]>=level)===(q[b]>=level)) continue;
        const f=(level-q[a])/(q[b]-q[a]);
        points.push([x0+(xy[a][0]+(xy[b][0]-xy[a][0])*f)/(w-1)*spanX,
          y0+(xy[a][1]+(xy[b][1]-xy[a][1])*f)/(h-1)*spanY]);
      }
      if(points.length===2) lines.push(points);
      else if(points.length===4) lines.push([points[0],points[1]],[points[2],points[3]]);
    }
    cache.contours.push({level,lines});
  }
  cache.key=key;
}

function drawMedium(ctx,state,s) {
  const radial=ctx.createRadialGradient(500,272,15,500,272,470);
  radial.addColorStop(0,'#0c2933');radial.addColorStop(1,C.bg);
  ctx.fillStyle=radial;ctx.fillRect(0,0,1000,610);
  ctx.lineWidth=.6;ctx.strokeStyle='rgba(100,160,170,.055)';
  ctx.beginPath();
  for(let x=38;x<1000;x+=28){ctx.moveTo(x,50);ctx.lineTo(x,510);}
  for(let y=48;y<520;y+=28){ctx.moveTo(18,y);ctx.lineTo(982,y);}
  ctx.stroke();
  if(s.showField !== false){
    updateField(state,s);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(cache.canvas,14,14,972,500);
    for(const contour of cache.contours){
      if(contour.level===0){ctx.strokeStyle='rgba(188,213,216,.14)';ctx.setLineDash([3,6]);}
      else {ctx.strokeStyle=contour.level>0?'rgba(85,220,195,.20)':'rgba(243,140,124,.20)';ctx.setLineDash([]);}
      ctx.lineWidth=.75;ctx.beginPath();
      for(const [a,b] of contour.lines){ctx.moveTo(...a);ctx.lineTo(...b);}
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  label(ctx,'EXTRACELLULAR CONDUCTING MEDIUM',34,30,C.muted,11,'left',600);
  label(ctx,'Potential relative to a chosen zero',966,30,'#718e97',11,'right');
}

function drawCells(ctx,state) {
  // Each small capsule represents a group of model elements, not a literal
  // scale drawing. Colour encodes membrane activation, not external polarity.
  const x0=388,w=224,n=13,gap=2,cellW=(w-gap*(n-1))/n;
  ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowBlur=16;
  rounded(ctx,x0-13,scene.y-34,w+26,68,21);
  ctx.fillStyle='rgba(4,18,25,.93)';ctx.fill();
  ctx.strokeStyle='rgba(135,167,175,.20)';ctx.lineWidth=1;ctx.stroke();ctx.shadowBlur=0;
  for(let row=-1;row<=1;row++)for(let k=0;k<n;k++){
    const sample=state.cells[Math.round(k/(n-1)*(state.cells.length-1))];
    const f=sample.fraction, x=x0+k*(cellW+gap),y=scene.y+row*17-6;
    const grad=ctx.createLinearGradient(x,y,x,y+12);
    grad.addColorStop(0,`rgb(${Math.round(34+137*f)},${Math.round(74+72*f)},${Math.round(84+29*f)})`);
    grad.addColorStop(.45,`rgb(${Math.round(23+103*f)},${Math.round(52+57*f)},${Math.round(65+23*f)})`);
    grad.addColorStop(1,`rgb(${Math.round(16+80*f)},${Math.round(38+43*f)},${Math.round(49+18*f)})`);
    rounded(ctx,x,y,cellW,12,4);ctx.fillStyle=grad;ctx.fill();
    ctx.lineWidth=.8;ctx.strokeStyle=f>.1?`rgba(239,196,139,${.3+.35*f})`:'rgba(115,175,187,.38)';ctx.stroke();
    ctx.strokeStyle='rgba(2,14,20,.25)';ctx.lineWidth=.5;ctx.beginPath();
    for(let z=4;z<cellW-1;z+=3){ctx.moveTo(x+z,y+2);ctx.lineTo(x+z,y+10);}ctx.stroke();
    ctx.fillStyle=f>.1?'rgba(239,213,165,.45)':'rgba(126,174,184,.4)';
    ctx.beginPath();ctx.ellipse(x+cellW*.52,y+6,2,1.25,0,0,Math.PI*2);ctx.fill();
  }
  // Show the strongest signed source and sink close to the physical front.
  const plus=state.sources.reduce((a,b)=>b.I>a.I?b:a,state.sources[0]);
  const minus=state.sources.reduce((a,b)=>b.I<a.I?b:a,state.sources[0]);
  const amplitude=Math.max(Math.abs(plus.I),Math.abs(minus.I));
  if(amplitude>1e-5){
    for(const [source,col,sign,vertical] of [[plus,C.positive,'+',-1],[minus,C.negative,'−',1]]){
      const p=screen(source),yy=scene.y+vertical*47;
      const glow=ctx.createRadialGradient(p.x,yy,0,p.x,yy,21);
      glow.addColorStop(0,col+'66');glow.addColorStop(1,col+'00');
      ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.x,yy,21,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=col+'88';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.x,yy-vertical*10);ctx.lineTo(p.x,scene.y+vertical*28);ctx.stroke();
      ctx.fillStyle=C.bg;ctx.beginPath();ctx.arc(p.x,yy,9,0,Math.PI*2);ctx.fill();ctx.strokeStyle=col;ctx.stroke();
      label(ctx,sign,p.x,yy,col,14,'center',600);
    }
  }
  label(ctx,'CARDIAC TISSUE',500,scene.y+81,'#b0c5c8',10,'center',600);
}

function terminal(ctx,p,positive,value) {
  const color=positive?C.positive:C.negative;
  ctx.shadowColor=color+'55';ctx.shadowBlur=20;
  ctx.fillStyle=C.bg;ctx.strokeStyle=color;ctx.lineWidth=1.7;
  ctx.beginPath();ctx.arc(p.x,p.y,15,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;
  ctx.strokeStyle=color+'35';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,22,0,Math.PI*2);ctx.stroke();
  label(ctx,positive?'+':'−',p.x,p.y,color,20,'center',500);
  // Place a compact readout outward from the tissue, retaining edge padding.
  const side=p.x>=500?1:-1;
  let x=p.x+side*34,y=p.y;
  if(p.y<87){x=p.x+side*34;y=p.y+7;}
  const align=side>0?'left':'right';
  label(ctx,`${positive?'φ₊':'φ₋'}  ${mv(value)} mV`,x,y,color,12,align,500);
}

function drawElectrodes(ctx,state) {
  const plus=screen(state.plus),minus=screen(state.minus),r=2.15*scene.scale;
  ctx.setLineDash([2,7]);ctx.strokeStyle='rgba(172,201,209,.22)';ctx.lineWidth=1;
  ctx.beginPath();ctx.arc(scene.x,scene.y,r,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([5,7]);ctx.strokeStyle='rgba(168,199,205,.22)';
  ctx.beginPath();ctx.moveTo(minus.x,minus.y);ctx.lineTo(plus.x,plus.y);ctx.stroke();ctx.setLineDash([]);
  terminal(ctx,minus,false,state.vn);terminal(ctx,plus,true,state.vp);
}

function drawAmplifier(ctx,state) {
  const y=554;
  ctx.fillStyle='rgba(5,20,27,.96)';rounded(ctx,177,519,646,72,12);ctx.fill();
  ctx.strokeStyle='rgba(133,172,181,.16)';ctx.lineWidth=1;ctx.stroke();
  label(ctx,'φ₊',205,y-14,C.positive,14,'left',600);
  label(ctx,'φ₋',205,y+14,C.negative,14,'left',600);
  label(ctx,`${mv(state.vp)}`,242,y-14,'#a3c7c6',13,'left',500);
  label(ctx,`${mv(state.vn)}`,242,y+14,'#cba69f',13,'left',500);
  for(const [dy,color] of [[-14,C.positive],[14,C.negative]]){
    ctx.strokeStyle=color+'88';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(306,y+dy);ctx.lineTo(353,y+dy);ctx.stroke();
  }
  ctx.fillStyle='#0d2934';ctx.strokeStyle='#6b939e';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(353,y-25);ctx.lineTo(353,y+25);ctx.lineTo(397,y);ctx.closePath();ctx.fill();ctx.stroke();
  label(ctx,'+',362,y-13,C.positive,11,'center');label(ctx,'−',362,y+13,C.negative,11,'center');
  ctx.strokeStyle='#688d98';ctx.beginPath();ctx.moveTo(397,y);ctx.lineTo(425,y);ctx.stroke();
  label(ctx,'Vlead = φ₊ − φ₋',441,y-11,'#acc2c6',12,'left',500);
  label(ctx,'Differential measurement',441,y+12,'#648792',10);
  const color=Math.abs(state.voltage)<.0005?C.white:state.voltage>0?C.positive:C.negative;
  ctx.font='500 26px "SFMono-Regular", Consolas, monospace';ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle=color;
  ctx.fillText(mv(state.voltage),748,y);
  label(ctx,'mV',760,y+3,'#809da5',12);
  label(ctx,'Illustrative amplitude · contours show equal potential',500,603,'#617f8a',10,'center');
}

export function renderField(ctx,W,H,s) {
  const state=leadState(s.progress,s.angle??0,s.polarity??1,s.recovery??'reverse',s.offset??0,!!s.uniform);
  ctx.save();ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  const scale=Math.min(W/scene.w,H/scene.h);
  ctx.translate((W-scene.w*scale)/2,(H-scene.h*scale)/2);ctx.scale(scale,scale);
  drawMedium(ctx,state,s);
  drawElectrodes(ctx,state);
  drawCells(ctx,state);
  drawAmplifier(ctx,state);
  ctx.restore();
}

import {humanValue} from './heart-data.js';
import {SITE_COLORS,getComparisonSites,comparisonRows} from './site-comparison.js';

const C={ink:'#071a22',panel:'#0b242d',mint:'#9be7cc',gold:'#e9c58f',violet:'#c3b1f5',coral:'#f1a08c',cream:'#edf2e9',muted:'#92adb4',line:'rgba(151,195,202,.16)'};
const MAP={x:63,y:110,w:434,h:434};
const cache=new WeakMap();
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const finite=x=>Number.isFinite(x);
function label(c,t,x,y,size=13,color=C.cream,align='left',weight=400){c.font=`${weight} ${size}px "DM Sans", Inter, system-ui, sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(t,x,y);}
function box(c,x,y,w,h,r=12,fill='rgba(4,18,26,.55)',stroke=C.line){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function color(v,timing=false){
  const knots=timing?[[.0,[88,133,192]],[.40,[105,187,197]],[.70,[157,227,190]],[1,[241,160,140]]]:[[0,[25,66,80]],[.3,[40,113,129]],[.65,[109,208,180]],[1,[245,212,155]]];
  v=clamp(v);let k=0;while(k<knots.length-2&&v>knots[k+1][0])k++;
  const a=knots[k],b=knots[k+1],f=(v-a[0])/(b[0]-a[0]);return a[1].map((n,i)=>Math.round(n+(b[1][i]-n)*f));
}
function rgb(v,timing=false){return `rgb(${color(v,timing).join(',')})`;}
function plotPath(c,d,node,g,single,colorValue,width=1.6,alpha=1){
  c.save();c.beginPath();c.rect(g.x,g.y,g.w,g.h);c.clip();c.beginPath();
  for(let i=0;i<d.frames;i++){const p=i/(d.frames-1),v=humanValue(d,node,p,single),x=g.x+p*g.w,y=g.y+(1.12-v)/1.35*g.h;i?c.lineTo(x,y):c.moveTo(x,y);}
  c.strokeStyle=colorValue;c.globalAlpha=alpha;c.lineWidth=width;c.stroke();c.restore();
}
function stats(d,key){const m=d.meta.statistics?.[key];return m?[m.p05,m.p95]:[0,600];}
function prepared(d){
  if(cache.has(d))return cache.get(d);
  const off=document.createElement('canvas');off.width=100;off.height=100;const context=off.getContext('2d'),pixels=context.createImageData(100,100);
  const p={off,context,pixels,lastKey:null};cache.set(d,p);return p;
}
function mapInfo(d,mode){
  if(mode==='activation'){const [lo,hi]=stats(d,'AT');return {map:0,lo,hi,title:'ACTIVATION TIME',units:'ms',early:'earlier',late:'later',timing:true};}
  if(mode==='recovery'){const [lo,hi]=stats(d,'RT80');return {map:1,lo,hi,title:'RECOVERY TIME · RT80',units:'ms',early:'earlier',late:'later',timing:true};}
  if(mode==='apd'){const [lo,hi]=stats(d,'APD80');return {map:2,lo,hi,title:'ACTION-POTENTIAL DURATION · APD80',units:'ms',early:'shorter',late:'longer',timing:true};}
  return {map:null,lo:0,hi:1,title:'LIVE OPTICAL SIGNAL',units:'normalized',early:'resting',late:'depolarized',timing:false};
}
function drawMap(c,d,s,p,info){
  const progress=clamp(s.progress??0),single=!!(s.singleBeat&&d.single),frame=Math.round(progress*(d.frames-1)*2)/2;
  const key=`${s.heartMap}|${info.timing?'static':frame}|${single}`;
  if(key!==p.lastKey){
    const a=p.pixels.data;a.fill(0);
    for(const node of d.valid){
      const value=info.timing?d.timings[info.map*10000+node]:humanValue(d,node,progress,single);
      const z=(value-info.lo)/(info.hi-info.lo||1),col=color(z,info.timing),i=node*4;
      a[i]=col[0];a[i+1]=col[1];a[i+2]=col[2];a[i+3]=finite(value)?231:0;
    }
    p.context.putImageData(p.pixels,0,0);p.lastKey=key;
  }
  c.save();c.beginPath();c.roundRect(MAP.x,MAP.y,MAP.w,MAP.h,5);c.clip();
  c.fillStyle='#03151c';c.fillRect(MAP.x,MAP.y,MAP.w,MAP.h);
  if(d.background){c.globalAlpha=.52;c.drawImage(d.background,MAP.x,MAP.y,MAP.w,MAP.h);c.globalAlpha=1;}
  c.imageSmoothingEnabled=false;c.drawImage(p.off,MAP.x,MAP.y,MAP.w,MAP.h);c.imageSmoothingEnabled=true;
  // Small corner marks indicate the original camera field without inventing anatomical orientation.
  c.strokeStyle='rgba(222,244,232,.30)';c.lineWidth=1;
  for(const[x,y,dx,dy]of[[MAP.x+6,MAP.y+6,1,1],[MAP.x+MAP.w-6,MAP.y+6,-1,1],[MAP.x+6,MAP.y+MAP.h-6,1,-1],[MAP.x+MAP.w-6,MAP.y+MAP.h-6,-1,-1]]){c.beginPath();c.moveTo(x+14*dx,y);c.lineTo(x,y);c.lineTo(x,y+14*dy);c.stroke();}
  c.restore();
}
function markerPlacements(sites){
  const placed=[];
  return sites.map((node,i)=>{
    const x=MAP.x+((node%100)+.5)/100*MAP.w,y=MAP.y+(Math.floor(node/100)+.5)/100*MAP.h;
    let chosen=null;
    for(const r of [18,35,52]){
      for(const [dx,dy] of [[1,-1],[-1,-1],[1,1],[-1,1],[0,-1],[0,1],[1,0],[-1,0]]){
        const q={x:clamp(x+dx*r-10,MAP.x+3,MAP.x+MAP.w-23),y:clamp(y+dy*r-9,MAP.y+3,MAP.y+MAP.h-21),w:20,h:18};
        if(!placed.some(a=>q.x<a.x+a.w+3&&q.x+q.w+3>a.x&&q.y<a.y+a.h+3&&q.y+q.h+3>a.y)){chosen=q;break;}
      }
      if(chosen)break;
    }
    const q=chosen??{x:x+10,y:y-27,w:20,h:18};placed.push(q);return q;
  });
}
function marker(c,node,title,colorValue,large=false,tag){
  const x=MAP.x+((node%100)+.5)/100*MAP.w,y=MAP.y+(Math.floor(node/100)+.5)/100*MAP.h;
  c.save();c.shadowBlur=large?12:3;c.shadowColor=colorValue;c.beginPath();c.arc(x,y,large?7:4.5,0,Math.PI*2);c.fillStyle='rgba(3,19,26,.8)';c.fill();c.strokeStyle=colorValue;c.lineWidth=large?2:1.5;c.stroke();c.shadowBlur=0;
  if(large){c.strokeStyle='rgba(237,242,233,.55)';c.lineWidth=1;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){c.beginPath();c.moveTo(x+dx*10,y+dy*10);c.lineTo(x+dx*15,y+dy*15);c.stroke();}}
  const q=tag??{x:x+9,y:y-23,w:20,h:18};
  c.strokeStyle=colorValue;c.globalAlpha=.55;c.lineWidth=.8;c.beginPath();c.moveTo(x,y);c.lineTo(q.x+q.w/2,q.y+q.h/2);c.stroke();c.globalAlpha=1;
  box(c,q.x,q.y,q.w,q.h,4,'rgba(3,19,26,.94)',null);label(c,title,q.x+q.w/2,q.y+13,11,colorValue,'center',600);c.restore();
}

export function pickOptical(xVirtual,yVirtual,s,d){
  if(!d||xVirtual<MAP.x||xVirtual>=MAP.x+MAP.w||yVirtual<MAP.y||yVirtual>=MAP.y+MAP.h)return null;
  const x=Math.floor((xVirtual-MAP.x)/MAP.w*100),y=Math.floor((yVirtual-MAP.y)/MAP.h*100),node=y*100+x;
  return d.mask[node]?node:null;
}

export function renderOptical(ctx,W,H,s,d){
  const scale=Math.min(W/1000,H/610);ctx.save();ctx.translate((W-1000*scale)/2,(H-610*scale)/2);ctx.scale(scale,scale);const c=ctx;
  c.fillStyle=C.ink;c.fillRect(0,0,1000,610);
  const bg=c.createRadialGradient(330,300,20,330,300,620);bg.addColorStop(0,'#12323b');bg.addColorStop(1,C.ink);c.fillStyle=bg;c.fillRect(0,0,1000,610);
  if(!d){label(c,'Loading measured human action potentials…',500,300,18,C.mint,'center');ctx.restore();return;}
  const p=prepared(d),sites=getComparisonSites(s,d).filter(q=>d.mask[q]).slice(0,6);
  const rows=comparisonRows(s,d).filter(r=>sites.includes(r.node));
  const node=sites.includes(s.selectedPixel)?s.selectedPixel:(sites.at(-1)??null);
  const active=rows.find(r=>r.node===node),activeColor=active?.color??C.mint;
  const progress=clamp(s.progress??0),single=!!(s.singleBeat&&d.single),duration=(d.frames-1)*d.dt,ms=progress*duration;
  const map=mapInfo(d,s.heartMap),value=node===null?NaN:humanValue(d,node,progress,single);
  label(c,'HUMAN LV  /  MEASURED OPTICAL RECORDING',42,33,14,C.mint,'left',600);
  label(c,`Donor ${d.donor} · isolated endocardial wedge · epicardial pacing at 1,000 ms`,42,57,13,C.muted);
  box(c,732,18,226,46,10,'rgba(155,231,204,.06)','rgba(155,231,204,.23)');
  label(c,`${d.valid.length.toLocaleString()} accepted camera pixels`,845,46,12,C.mint,'center',600);
  label(c,map.title,45,84,12,C.cream,'left',600);label(c,'Select up to 6 sites',515,84,11,C.muted,'right');
  box(c,42,97,476,481,12,'rgba(3,17,25,.53)');drawMap(c,d,s,p,map);
  const placements=markerPlacements(sites);
  rows.forEach((row,i)=>marker(c,row.node,row.label,row.color??SITE_COLORS[i],row.node===node,placements[i]));
  // Preserve the original spatial sample grid; the background is the measured fluorescence image.
  const legend={x:70,y:554,w:420,h:6};const grad=c.createLinearGradient(legend.x,0,legend.x+legend.w,0);for(let i=0;i<=12;i++)grad.addColorStop(i/12,rgb(i/12,map.timing));c.fillStyle=grad;c.fillRect(legend.x,legend.y,legend.w,legend.h);
  label(c,map.timing?`${Math.round(map.lo)} ms · ${map.early}`:'0 · resting',legend.x,573,11,C.muted);
  label(c,map.timing?'5th–95th percentile color range':'Normalized fluorescence',legend.x+legend.w/2,573,11,C.muted,'center');
  label(c,map.timing?`${Math.round(map.hi)} ms · ${map.late}`:'1 · depolarized',legend.x+legend.w,573,11,C.muted,'right');

  box(c,548,97,410,286,12,'rgba(3,17,25,.58)');
  label(c,'SELECTED SITES · ONE RECORDING CLOCK',567,122,12,C.cream,'left',600);
  label(c,`${sites.length} / 6 sites`,938,122,11,C.muted,'right');
  if(active){
    label(c,`Active ${active.label} · camera x=${node%100}, y=${Math.floor(node/100)}`,567,145,12,activeColor);
    label(c,`${value.toFixed(2)} at ${Math.round(ms)} ms`,938,145,12,C.cream,'right',500);
  }else label(c,'Click colored tissue to choose your first site.',567,145,12,C.mint);
  const g={x:590,y:175,w:346,h:142};
  const yVal=v=>g.y+(1.12-v)/1.35*g.h;
  for(const v of[0,.5,1]){const y=yVal(v);c.strokeStyle='rgba(145,188,195,.13)';c.lineWidth=1;c.beginPath();c.moveTo(g.x,y);c.lineTo(g.x+g.w,y);c.stroke();label(c,v===.5?'0.5':String(v),g.x-10,y+4,11,C.muted,'right');}
  for(const t of[0,250,500,750,duration]){const x=g.x+t/duration*g.w;c.strokeStyle='rgba(145,188,195,.08)';c.beginPath();c.moveTo(x,g.y);c.lineTo(x,g.y+g.h);c.stroke();label(c,t===duration?`${duration} ms`:String(t),x,g.y+g.h+19,11,C.muted,t===duration?'right':t===0?'left':'center');}
  label(c,'normalized optical signal',g.x,g.y-10,11,C.muted);
  const stimulusX=g.x+100/duration*g.w;c.strokeStyle='rgba(233,197,143,.30)';c.setLineDash([2,4]);c.beginPath();c.moveTo(stimulusX,g.y);c.lineTo(stimulusX,g.y+g.h);c.stroke();c.setLineDash([]);
  rows.filter(r=>r.node!==node).forEach((row,i)=>plotPath(c,d,row.node,g,single,row.color??SITE_COLORS[i],1.7,.83));
  if(active)plotPath(c,d,node,g,single,activeColor,2.6,1);
  const cursorX=g.x+progress*g.w;c.strokeStyle='rgba(237,242,233,.65)';c.lineWidth=1;c.beginPath();c.moveTo(cursorX,g.y-1);c.lineTo(cursorX,g.y+g.h);c.stroke();
  rows.forEach((row,i)=>{const v=humanValue(d,row.node,progress,single);c.beginPath();c.arc(cursorX,clamp(yVal(v),g.y,g.y+g.h),row.node===node?3.6:2.4,0,Math.PI*2);c.fillStyle=row.color??SITE_COLORS[i];c.fill();});
  rows.forEach((row,i)=>{
    const x=568+(i%3)*126,y=354+Math.floor(i/3)*19,col=row.color??SITE_COLORS[i];
    c.strokeStyle=col;c.lineWidth=row.node===node?3:2;c.beginPath();c.moveTo(x,y-4);c.lineTo(x+13,y-4);c.stroke();
    label(c,`${row.label} (${row.node%100}, ${Math.floor(row.node/100)})`,x+19,y,11,col,'left',row.node===node?600:400);
  });
  if(!rows.length){
    box(c,616,221,292,66,8,'rgba(4,22,30,.94)',null);
    label(c,'Choose sites on the tissue map',762,247,14,C.mint,'center',500);
    label(c,'Their measured APs will appear together.',762,268,12,C.muted,'center');
    label(c,'Click a selected site again to remove it.',568,362,11,C.muted);
  }

  label(c,active?`ACTIVE ${active.label} · TIMING FROM FOUR-BEAT ENSEMBLE`:'SELECT A SITE TO INSPECT ITS TIMING',550,400,11,C.muted,'left',500);
  if(active)label(c,`SNR ${d.timings[50000+node].toFixed(1)}`,958,400,11,C.muted,'right');
  const metrics=[['ACTIVATION',active?.at,'AT'],['RECOVERY',active?.rt,'RT80'],['DURATION',active?.apd,'APD80']];
  metrics.forEach(([name,val,abbrev],i)=>{const x=548+i*139;box(c,x,410,132,70,10,'rgba(3,17,25,.54)');label(c,name,x+12,430,11,C.muted,'left',500);label(c,finite(val)?`${Math.round(val)} ms`:'—',x+12,455,20,active?activeColor:C.muted,'left',500);label(c,abbrev,x+120,470,11,C.muted,'right');});
  box(c,548,492,410,86,10,'rgba(155,231,204,.035)');
  label(c,single?'ONE MEASURED BEAT':'FOUR MEASURED BEATS, GLOBALLY ALIGNED',566,514,11,single?C.gold:C.mint,'left',600);
  label(c,'Every selected site keeps its measured activation time.',566,535,12,C.muted);
  label(c,'Optical fluorescence is normalized; it is not mV.',566,555,12,C.muted);
  label(c,'100 × 100 camera · 1,000 Hz native · 2 ms display',42,600,11,C.muted);
  label(c,'No documented simultaneous ECG',958,600,12,C.gold,'right',500);
  ctx.restore();
  return [{...g,start:0,end:1}];
}

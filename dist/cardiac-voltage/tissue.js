import {waveState,waveCellVoltage} from './wave-model.js';
const C={ink:'#071a22',mint:'#9be7cc',coral:'#f1a08c',muted:'#8ca8af',cream:'#edf2e9',violet:'#c3b1f5',gold:'#e9c58f'};
function text(c,t,x,y,size=16,color=C.cream,align='left',weight=400){c.font=`${weight} ${size}px Inter, system-ui, sans-serif`;c.fillStyle=color;c.textAlign=align;c.fillText(t,x,y);}
function rounded(c,x,y,w,h,r=12){c.beginPath();c.roundRect(x,y,w,h,r);}
function arrow(c,x1,y1,x2,y2,color,width=2,head=8){c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();const a=Math.atan2(y2-y1,x2-x1);c.beginPath();c.moveTo(x2,y2);c.lineTo(x2-head*Math.cos(a-.45),y2-head*Math.sin(a-.45));c.lineTo(x2-head*Math.cos(a+.45),y2-head*Math.sin(a+.45));c.closePath();c.fill();}
function capsule(c,x,y,w,h,cell){
  const f=cell.fraction,rest=[25,54,64],active=cell.recovering?[114,97,154]:cell.earlyRecovering?[146,118,79]:[66,146,126];
  const rgb=rest.map((v,i)=>Math.round(v+(active[i]-v)*f));
  const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,`rgba(${rgb.join(',')},.67)`);g.addColorStop(.38,`rgba(${rgb.map(v=>Math.min(255,v+20)).join(',')},.98)`);g.addColorStop(1,`rgba(${rgb.join(',')},.4)`);
  rounded(c,x,y,w,h,8);c.fillStyle=g;c.fill();c.strokeStyle=cell.recovering?'rgba(195,177,245,.5)':cell.earlyRecovering?'rgba(233,197,143,.45)':`rgba(155,231,204,${.16+.5*f})`;c.lineWidth=1;c.stroke();
  c.save();rounded(c,x,y,w,h,8);c.clip();
  // Transverse striations across elongated working myocytes; geometry remains schematic.
  for(let j=1;j<11;j++){c.strokeStyle=`rgba(210,240,226,${.045+.07*f})`;c.beginPath();c.moveTo(x+j*w/11,y+3);c.lineTo(x+j*w/11+.8,y+h-3);c.stroke();}
  c.fillStyle='rgba(5,21,30,.36)';c.beginPath();c.ellipse(x+w*.52,y+h*.53,w*.17,h*.14,-.3,0,Math.PI*2);c.fill();c.restore();
  c.fillStyle='rgba(162,216,205,.46)';for(let j=0;j<3;j++)c.fillRect(x+w-1,y+h*.31+j*4,3,1.5);
}
const fmt=x=>Number.isInteger(x)?String(x):x.toFixed(1);

export function renderTissue(ctx,W,H,s){
  const scale=Math.min(W/1000,H/610);ctx.save();ctx.translate((W-1000*scale)/2,(H-610*scale)/2);ctx.scale(scale,scale);const c=ctx;
  c.fillStyle=C.ink;c.fillRect(0,0,1000,610);
  const bg=c.createRadialGradient(500,240,25,500,240,540);bg.addColorStop(0,'#12343b');bg.addColorStop(1,C.ink);c.fillStyle=bg;c.fillRect(0,0,1000,610);
  c.fillStyle='rgba(140,195,196,.07)';for(let x=24;x<1000;x+=28)for(let y=25;y<610;y+=28)c.fillRect(x,y,1,1);
  const options={geometry:s.waveGeometry??'distant',earlyRepolarization:!!s.waveNotch};
  const m=waveState(s.progress,s.shortening??60,s.uniform,s.wavePreset??'human',81,options);
  const order=m.recoveryOrder;
  const orderColor=order==='reverse'?C.violet:order==='same'?C.gold:C.mint;
  const phaseColor=m.phaseDetail==='early-repolarization'?C.gold:m.phaseDetail==='recovery'?C.violet:m.phaseDetail==='activation'?C.mint:C.muted;
  const badge={rest:'REST',activation:'ACTIVATION','early-repolarization':'EARLY REPOLARIZATION · MODEL',plateau:'PLATEAU',recovery:'FINAL RECOVERY'}[m.phaseDetail];
  text(c,'RECOVERY = ACTIVATION + AP DURATION',42,32,14,C.cream,'left',600);
  text(c,m.preset==='human'?'Human timing · simulated cells':'Explore cellular timing',42,55,12,C.muted);
  rounded(c,710,15,248,46,10);c.fillStyle=phaseColor+'12';c.fill();c.strokeStyle=phaseColor+'40';c.lineWidth=1;c.stroke();text(c,badge,834,43,m.phaseDetail==='early-repolarization'?10.5:12,phaseColor,'center',600);
  text(c,`${Math.round(m.timeMs)} ms`,958,82,13,C.cream,'right',500);

  const n=12,x0=86,width=828,step=width/n,cellW=step-2.1;
  for(let row=0;row<3;row++){
    c.globalAlpha=row===1?1:.63;
    for(let i=0;i<n;i++)capsule(c,x0+i*step+(row-1)*2,165+row*34,cellW,30,m.cells[Math.round(i/(n-1)*(m.cells.length-1))]);
  }c.globalAlpha=1;
  // Endpoint colors match the AP traces and timing bars below.
  for(const[x,label,color]of[[64,'A',C.gold],[936,'B',C.mint]]){
    c.beginPath();c.arc(x,214,11,0,Math.PI*2);c.fillStyle=color+'20';c.fill();c.strokeStyle=color+'80';c.stroke();text(c,label,x,218,12,color,'center',600);
  }

  const sx=500+m.sourceCentroids.source.x*410,kx=500+m.sourceCentroids.sink.x*410;
  // Direction view is deliberately a readable schematic. Its arrow dimensions
  // and animation speed do not encode magnitude. Contextual help provides the
  // fixed-reference magnitude. Strength view keeps the earlier scaling.
  const directionView=s.currentDisplay!=='strength';
  const strength=Math.sqrt(m.currentRelative),glyph=directionView?1:strength;
  const hasCurrent=m.currentRelative>1e-9;
  if(hasCurrent&&s.showCurrents!==false){
    c.save();c.globalAlpha=directionView?.92:strength;
    for(const[x,color,sign]of[[sx,C.mint,'+'],[kx,C.coral,'−']]){
      const glow=c.createRadialGradient(x,151,2,x,151,38);glow.addColorStop(0,color+'55');glow.addColorStop(1,color+'00');c.fillStyle=glow;c.fillRect(x-38,113,76,76);
      c.beginPath();c.arc(x,151,12*glyph,0,Math.PI*2);c.fillStyle=C.ink;c.fill();c.strokeStyle=color;c.lineWidth=1.2*glyph;c.stroke();if(glyph>.2)text(c,sign,x,156,18*glyph,color,'center',500);
    }
    const sign=sx>kx?1:-1,top=132,bottom=214;
    c.strokeStyle=directionView?'rgba(208,239,227,.92)':'rgba(182,221,211,.65)';c.lineWidth=(directionView?2:1.7)*glyph;c.beginPath();c.moveTo(kx,bottom);c.lineTo(sx,bottom);c.bezierCurveTo(sx+sign*25,bottom,sx+sign*25,top,sx,top);c.lineTo(kx,top);c.bezierCurveTo(kx-sign*25,top,kx-sign*25,bottom,kx,bottom);c.stroke();
    // Conventional current enters at the extracellular sink, travels through
    // the cells to the source, then returns through the extracellular space.
    arrow(c,kx+(sx-kx)*.32,bottom,kx+(sx-kx)*.68,bottom,C.mint,2*glyph,8*glyph);arrow(c,sx+(kx-sx)*.28,top,sx+(kx-sx)*.72,top,C.cream,(directionView?2:1.5)*glyph,8*glyph);
    const drift=((s.elapsed??0)*.17*(directionView?1:strength))%1,count=directionView?6:Math.round(8*strength);
    for(let i=0;i<count;i++){
      const u=(drift+i/count)%1;let x,y;
      if(u<.33){x=kx+(sx-kx)*u/.33;y=bottom;}
      else if(u<.5){const v=(u-.33)/.17;x=sx+sign*24*Math.sin(v*Math.PI);y=bottom+(top-bottom)*v;}
      else if(u<.83){x=sx+(kx-sx)*(u-.5)/.33;y=top;}
      else{const v=(u-.83)/.17;x=kx-sign*24*Math.sin(v*Math.PI);y=top+(bottom-top)*v;}
      c.fillStyle=C.mint;c.shadowColor=C.mint;c.shadowBlur=5*glyph;c.beginPath();c.arc(x,y,2*glyph,0,Math.PI*2);c.fill();c.shadowBlur=0;
    }c.restore();
  }
  text(c,'VOLTAGE ALONG THE CELLS',86,280,10,C.muted,'left',500);
  const pad=Math.max(1,m.vmSpread*.08),vmin=m.vmRange.min-pad,vmax=m.vmRange.max+pad;
  c.strokeStyle='rgba(155,231,204,.12)';c.lineWidth=1;c.beginPath();c.moveTo(86,296);c.lineTo(914,296);c.stroke();
  c.beginPath();m.cells.forEach((cell,i)=>{const x=86+828*cell.u,y=306-(cell.vm-vmin)/(vmax-vmin)*19;i?c.lineTo(x,y):c.moveTo(x,y);});c.strokeStyle=phaseColor;c.lineWidth=1.8;c.stroke();
  text(c,'A',86,323,11,C.gold);
  if(m.vmSpread<1e-7)text(c,'Equal voltage → no spatial current',500,323,11,C.muted,'center');
  text(c,'B',914,323,11,C.mint,'right');

  for(const[x,w]of[[42,439],[499,459]]){rounded(c,x,334,w,232,12);c.fillStyle='rgba(2,15,23,.47)';c.fill();c.strokeStyle='rgba(152,197,200,.14)';c.lineWidth=1;c.stroke();}
  text(c,'ACTION POTENTIALS',59,359,11,C.muted,'left',600);
  const g={x:95,y:386,w:362,h:101};
  for(const v of[20,-68,-90]){
    const y=g.y+(20-v)/110*g.h;c.strokeStyle=v===-68?'rgba(195,177,245,.18)':'rgba(150,191,197,.14)';c.setLineDash(v===-68?[3,4]:[]);c.beginPath();c.moveTo(g.x,y);c.lineTo(g.x+g.w,y);c.stroke();c.setLineDash([]);text(c,String(v).replace('-','−'),g.x-9,y+4,10,C.muted,'right');
  }
  const eps=[m.endpoints.first,m.endpoints.last];
  eps.forEach((ep,i)=>{
    c.beginPath();for(let t=0;t<=600;t+=1){const x=g.x+t/600*g.w,y=g.y+(20-waveCellVoltage(t,ep.at,ep.apd,options))/110*g.h;t?c.lineTo(x,y):c.moveTo(x,y);}
    c.strokeStyle=i?C.mint:C.gold;c.lineWidth=2;c.stroke();
    const x=g.x+ep.rt/600*g.w,y=g.y+(20+68)/110*g.h;c.fillStyle=i?C.mint:C.gold;c.beginPath();c.arc(x,y,3.3,0,Math.PI*2);c.fill();
  });
  const cursorX=g.x+m.timeMs/600*g.w;c.strokeStyle='rgba(237,242,233,.48)';c.lineWidth=1;c.beginPath();c.moveTo(cursorX,g.y-6);c.lineTo(cursorX,g.y+g.h);c.stroke();
  text(c,'mV',62,379,10,C.muted);text(c,'0',g.x,502,10,C.muted,'center');text(c,'300',g.x+g.w/2,502,10,C.muted,'center');text(c,'600 ms',g.x+g.w,502,10,C.muted,'right');
  for(const[x,t,col]of[[61,'Site A',C.gold],[184,'Site B',C.mint]]){c.strokeStyle=col;c.lineWidth=2;c.beginPath();c.moveTo(x,535);c.lineTo(x+16,535);c.stroke();text(c,t,x+23,539,12,col);}

  text(c,'ACTIVATION → RECOVERY',518,359,11,C.muted,'left',600);
  const bx=553,bw=376,axisY=505;
  for(const t of[0,100,200,300,400,500,600]){const x=bx+t/600*bw;c.strokeStyle='rgba(145,185,190,.1)';c.beginPath();c.moveTo(x,379);c.lineTo(x,490);c.stroke();if(t%200===0)text(c,t===600?'600 ms':String(t),x,axisY,10,C.muted,t===600?'right':'center');}
  eps.forEach((ep,i)=>{
    const y=411+i*61,col=i?C.mint:C.gold,xa=bx+ep.at/600*bw,xr=bx+ep.rt/600*bw;
    text(c,i?'B':'A',531,y+4,13,col,'center',600);
    rounded(c,xa,y-8,xr-xa,16,4);c.fillStyle=col+'30';c.fill();c.strokeStyle=col+'60';c.lineWidth=1;c.stroke();
    c.fillStyle=col;c.beginPath();c.arc(xa,y,4,0,Math.PI*2);c.fill();
    c.beginPath();c.moveTo(xr,y-6);c.lineTo(xr+6,y);c.lineTo(xr,y+6);c.lineTo(xr-6,y);c.closePath();c.fill();
    text(c,`AT ${fmt(ep.at)}`,xa,y-17,10,col,'center');text(c,`RT ${fmt(ep.rt)}`,xr,y-17,10,col,'center');text(c,`APD₈₀ ${fmt(ep.apd)} ms`,(xa+xr)/2,y+4,11,col,'center',500);
  });
  const tx=bx+m.timeMs/600*bw;c.strokeStyle='rgba(237,242,233,.45)';c.beginPath();c.moveTo(tx,378);c.lineTo(tx,490);c.stroke();
  text(c,order==='synchronized'?'Both sites recover together':`${order==='reverse'?'B':'A'} recovers ${fmt(Math.abs(m.recoverySpan))} ms earlier`,518,539,13,orderColor,'left',500);
  text(c,'Hover over an info marker for details',42,589,10,C.muted);
  c.restore();
  // These panels share the animation's time axis. The spatial Vₘ profile
  // above them is deliberately excluded: its horizontal axis is location.
  return [{...g,start:0,end:1},{x:bx,y:379,w:bw,h:111,start:0,end:1}];
}

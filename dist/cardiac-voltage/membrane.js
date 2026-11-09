// A structure-informed membrane cartoon. Particle positions are deterministic;
// only the surface excess charge represents membrane charge separation.
import {CHANNEL_LAYOUT,drawChannel,membraneY,membraneChannelState} from './channel-art.js';
export {membraneChannelState,membraneChannelAt} from './channel-art.js';
const C = {
  bg: '#071a22', ink: '#e4f1ed', muted: '#8ca9ac', faint: '#49676e',
  sodium: '#f8ba79', potassium: '#9ce4cc', calcium: '#b8b9f4', anion: '#7894b1',
};
const TAU = Math.PI * 2;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
const memY = membraneY;
const random = n => { const a = Math.sin(n*127.1+51.7)*43758.5453; return a-Math.floor(a); };

function rounded(ctx,x,y,w,h,r=8) {
  ctx.beginPath(); ctx.roundRect(x,y,w,h,r);
}
function text(ctx,str,x,y,size=12,color=C.muted,weight=400,align='left') {
  ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle=color; ctx.textAlign=align; ctx.textBaseline='alphabetic'; ctx.fillText(str,x,y);
}
function line(ctx,points,color,width=1,dash=[]) {
  ctx.strokeStyle=color; ctx.lineWidth=width; ctx.setLineDash(dash);
  ctx.beginPath(); points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p)); ctx.stroke(); ctx.setLineDash([]);
}
function arrow(ctx,x,y,dx,dy,color,alpha=1) {
  ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=1.5;
  const a=Math.atan2(dy,dx), ex=x+dx,ey=y+dy;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();
  ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-6*Math.cos(a-.48),ey-6*Math.sin(a-.48));ctx.lineTo(ex-6*Math.cos(a+.48),ey-6*Math.sin(a+.48));ctx.closePath();ctx.fill();ctx.restore();
}
function ion(ctx,x,y,r,color,sign='+',alpha=1,glow=true) {
  ctx.save();ctx.globalAlpha=alpha;
  if(glow){const g=ctx.createRadialGradient(x,y,0,x,y,r*2.5);g.addColorStop(0,color+'25');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*2.5,0,TAU);ctx.fill();}
  const g=ctx.createRadialGradient(x-r*.35,y-r*.4,r*.08,x,y,r);
  g.addColorStop(0,color);g.addColorStop(.55,color+'bc');g.addColorStop(1,color+'55');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
  ctx.strokeStyle=color+'b0';ctx.lineWidth=.7;ctx.stroke();
  if(sign){ctx.fillStyle='#06202a';ctx.font=`700 ${r*1.45}px Inter,system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(sign,x,y+.4);}
  ctx.restore();
}
function apVm(p){
  if(p<.16)return -90;
  if(p<.22)return -90+115*smooth((p-.16)/.06);
  if(p<.52)return 25-12*(p-.22)/.30;
  if(p<.78)return 13-103*smooth((p-.52)/.26);
  return -90;
}

export function renderMembrane(ctx,W,H,s={}) {
  const p=Math.max(0,Math.min(1,s.progress||0)), time=s.reduceMotion?0:(s.elapsed||0);
  const vm=Number.isFinite(s.vm)?s.vm:apVm(p);
  const phase=s.phase||'rest', ions=s.showIons!==false,charges=s.showCharges!==false;
  ctx.save();ctx.fillStyle=C.bg;ctx.fillRect(0,0,W,H);
  const z=Math.min(W/1000,H/610);ctx.translate((W-1000*z)/2,(H-610*z)/2);ctx.scale(z,z);

  // Fluid is shaded, not given a net positive or negative bulk charge.
  let grad=ctx.createLinearGradient(0,0,0,610);
  grad.addColorStop(0,'#0a2029');grad.addColorStop(.42,'#0c2730');grad.addColorStop(.53,'#10302f');grad.addColorStop(1,'#071a22');
  ctx.fillStyle=grad;ctx.fillRect(0,0,1000,610);
  let glow=ctx.createRadialGradient(470,283,20,470,283,480);
  glow.addColorStop(0,'#397c6c20');glow.addColorStop(1,'#397c6c00');ctx.fillStyle=glow;ctx.fillRect(0,0,1000,610);
  // Subtle reproducible texture prevents flat fills without a noisy image asset.
  for(let i=0;i<160;i++){
    ctx.fillStyle=`rgba(144,198,198,${.018+random(i+19)*.035})`;
    ctx.beginPath();ctx.arc(random(i*2+11)*1000,random(i*2+12)*477,.4+random(i+45)*.8,0,TAU);ctx.fill();
  }
  text(ctx,'A MEMBRANE, AT MOLECULAR SCALE',55,37,10,C.muted,600);
  text(ctx,'Extracellular fluid',62,83,18,C.ink,500);
  text(ctx,'Na⁺ rich · electrically neutral in bulk',62,103,11,C.muted);
  text(ctx,'Intracellular fluid',62,402,18,C.ink,500);
  text(ctx,'K⁺ rich · electrically neutral in bulk',62,422,11,C.muted);

  // Counterions accompany the cations in BOTH compartments.
  if(ions){
    for(let i=0;i<24;i++){
      let x=80+random(i+130)*650,y=130+random(i+330)*92;
      x+=Math.sin(time*.31+i*2.2)*3;y+=Math.cos(time*.35+i*1.7)*2;
      const minority=i%9===0, col=minority?C.potassium:C.sodium;
      ion(ctx,x,y,minority?6.3:7.2,col,'+',.5+random(i+77)*.24);
      ion(ctx,x+13+random(i+5)*10,y-8+random(i+9)*16,5.3,C.anion,'−',.43,false);
    }
    // Lower bulk excludes the chapter labels and the electrode tip.
    for(let i=0;i<17;i++){
      let x=318+random(i+530)*490,y=432+random(i+730)*25;
      x+=Math.sin(time*.29+i*1.8)*2.5;y+=Math.cos(time*.27+i*2.3)*2;
      const col=i%9===0?C.sodium:C.potassium;
      ion(ctx,x,y,6.8,col,'+',.53+random(i+88)*.19);
      ion(ctx,x+10+random(i+16)*9,y-7+random(i+15)*13,5.1,C.anion,'−',.42,false);
    }
  }

  // Lipid bilayer with a hydrophobic core and lit head groups.
  ctx.beginPath();ctx.moveTo(65,memY(65));
  for(let x=65;x<=935;x+=5)ctx.lineTo(x,memY(x));
  for(let x=935;x>=65;x-=5)ctx.lineTo(x,memY(x)+56);ctx.closePath();
  grad=ctx.createLinearGradient(0,254,0,321);
  grad.addColorStop(0,'#80b0a9');grad.addColorStop(.18,'#2d716e');grad.addColorStop(.47,'#153f46');grad.addColorStop(.52,'#133941');grad.addColorStop(.82,'#2c6b69');grad.addColorStop(1,'#73a69c');
  ctx.fillStyle=grad;ctx.fill();
  ctx.save();ctx.shadowColor='#77d2b750';ctx.shadowBlur=20;ctx.strokeStyle='#8dd9c34a';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  for(let x=70,i=0;x<932;x+=10.6,i++){
    // Pores replace local membrane rather than lying on top of intact lipid.
    if(CHANNEL_LAYOUT.some(c=>Math.abs(c.x-x)<61))continue;
    const y=memY(x),wob=Math.sin(i*2.8)*1.1;
    for(const side of [-1,1]){
      const yy=side<0?y:y+56, dir=side<0?1:-1;
      ctx.lineWidth=1.15;
      line(ctx,[[x-1.8,yy+dir*3],[x-3.7,yy+dir*9],[x-1.5,yy+dir*17],[x-3.3+wob,yy+dir*26]],'#80ad9c67',1.1);
      line(ctx,[[x+1.6,yy+dir*3],[x+3.8,yy+dir*9],[x+1.6,yy+dir*17],[x+4+wob,yy+dir*26]],'#8ab5a66b',1.1);
      const head=ctx.createRadialGradient(x-1.3,yy-1.6,.2,x,yy,4.8);
      head.addColorStop(0,'#d2e4ce');head.addColorStop(.42,'#95b9ad');head.addColorStop(1,'#376869');
      ctx.fillStyle=head;ctx.beginPath();ctx.arc(x,yy,4.5,0,TAU);ctx.fill();
      ctx.strokeStyle='#c3eddd25';ctx.lineWidth=.5;ctx.stroke();
    }
  }

  if(charges){
    // Q = C Vm: the density/opacity of paired excess charges follows |Vm|.
    // Positive Vm reverses the sides. No net charge is created.
    const magnitude=Math.min(Math.abs(vm)/90,1),outerSign=vm<=0?'+':'−',innerSign=vm<=0?'−':'+';
    for(let i=0;i<39;i++){
      const x=80+i*22;
      if(CHANNEL_LAYOUT.some(c=>Math.abs(c.x-x)<63))continue;
      const ranked=(i*.61803398875)%1;
      const a=Math.max(0,Math.min(1,(magnitude-ranked)*8))*.8;
      if(a<.01)continue;
      const y=memY(x);
      // Set alpha on BOTH signs consistently.
      ctx.save();ctx.globalAlpha=a;
      text(ctx,outerSign,x,y-13,12,vm<=0?C.sodium:C.potassium,500,'center');
      // Soft glow marks just the surface layer, never the fluid volume.
      ion(ctx,x,y-18,7,vm<=0?C.sodium:C.potassium,'',.10,false);
      text(ctx,innerSign,x,y+76,12,vm<=0?C.potassium:C.sodium,500,'center');
      ctx.restore();
    }
  }

  const channels=membraneChannelState({...s,phase,progress:p});
  CHANNEL_LAYOUT.forEach(({id,x})=>drawChannel(ctx,x,channels[id],{focus:s.channelFocus===id}));

  // Only conducting pores receive streams. The aperture and the stream read
  // the same state, and deterministic motion freezes on pause or scrubbing.
  if(ions){
    for(const {id,x} of CHANNEL_LAYOUT){
      const ch=channels[id];if(!ch.flow)continue;
      const speed=id==='sodium'?.72:id==='calcium'?.23:phase==='repolarization'?.42:.22;
      const n=id==='calcium'?2:3,top=memY(x)-105,bottom=memY(x)+101;
      arrow(ctx,x-31,195,0,ch.direction===1?30:-30,ch.color,.45+.4*ch.flow);
      for(let k=0;k<n;k++){
        const q=(time*speed+k/n)%1,y=ch.direction===1?top+q*(bottom-top):bottom-q*(bottom-top);
        const mouth=memY(x)+28;
        const lateral=Math.max(0,Math.abs(y-mouth)-57)*.045*Math.sin(q*TAU+k);
        const alpha=(.2+.8*Math.sin(q*Math.PI))*(.55+.45*ch.flow);
        ion(ctx,x+lateral,y,id==='calcium'?5.8:5.3,ch.color,id==='calcium'?'2+':'+',alpha);
      }
    }
  }

  // Two genuine measurement endpoints: outside reference and inside probe.
  line(ctx,[[799,187],[799,214],[840,214]],'#6c8f9a',1.8);
  line(ctx,[[902,187],[945,187],[945,431],[858,431],[843,414]],'#a6dac9',1.8);
  ctx.save();ctx.shadowColor='#b2eedb66';ctx.shadowBlur=8;
  line(ctx,[[840,214],[854,219]],'#e2f5e9',3);
  line(ctx,[[843,414],[830,407]],'#e2f5e9',3);ctx.restore();
  ion(ctx,854,219,3,C.muted,'',1,false);ion(ctx,830,407,3,C.potassium,'',1,false);
  text(ctx,'φₑ',875,225,13,C.muted,500);text(ctx,'φᵢ',851,399,13,C.potassium,500);
  // Instrument housing is anchored in the upper-right, leaving the ion field open.
  ctx.save();ctx.shadowColor='#0008';ctx.shadowBlur=23;ctx.shadowOffsetY=9;
  rounded(ctx,757,55,185,134,13);ctx.fillStyle='#16323a';ctx.fill();ctx.restore();
  rounded(ctx,757,55,185,134,13);ctx.strokeStyle='#628b8b55';ctx.lineWidth=1;ctx.stroke();
  rounded(ctx,770,68,159,78,7);ctx.fillStyle='#071a21';ctx.fill();ctx.strokeStyle='#ffffff07';ctx.stroke();
  text(ctx,'MEMBRANE VOLTAGE',781,86,9,C.muted,600);
  const sign=vm>0?'+':vm<0?'−':'';
  text(ctx,sign+Math.abs(vm).toFixed(0),873,124,36,C.ink,400,'right');
  text(ctx,'mV',883,122,12,C.muted,500);
  text(ctx,'Vₘ = φᵢ − φₑ',849,167,13,C.ink,500,'center');
  ion(ctx,799,187,4.7,C.muted,'−',1,false);ion(ctx,902,187,4.7,C.potassium,'+',1,false);

  // A modest dimensional cue explicitly labels this as a schematic.
  line(ctx,[[82,348],[82,364],[116,364]],C.faint,1);
  text(ctx,'Lipid bilayer · ~5 nm',124,368,10,C.muted);
  text(ctx,'Protein cutaways · structural cartoons · ions enlarged',938,467,9,C.faint,400,'right');
  line(ctx,[[55,480],[945,480]],'#7a9c9c26',1);

  // Capacitor inset: paired surface excess changes with Vm; bulk charge does not.
  text(ctx,'THE MEMBRANE IS A CAPACITOR',62,506,9,C.muted,600);
  line(ctx,[[87,542],[266,542]],'#8eaaa7',2);
  line(ctx,[[87,556],[266,556]],'#8eaaa7',2);
  const capMagnitude=Math.min(Math.abs(vm)/90,1);
  for(let i=0;i<7;i++){
    const a=charges?Math.max(0,Math.min(1,(capMagnitude-i/7)*7)):0;
    ctx.save();ctx.globalAlpha=a;
    text(ctx,vm<=0?'+':'−',98+i*24,535,13,vm<=0?C.sodium:C.potassium,500,'center');
    text(ctx,vm<=0?'−':'+',98+i*24,577,13,vm<=0?C.potassium:C.sodium,500,'center');
    ctx.restore();
  }
  text(ctx,'outside',70,535,9,C.faint,400,'right');
  text(ctx,'inside',70,577,9,C.faint,400,'right');
  text(ctx,'Qᵢ = CₘVₘ',325,538,23,C.ink,400);
  text(ctx,'Equal and opposite surface charges.',325,562,12,C.muted);
  text(ctx,'The bulk fluid stays nearly neutral.',325,581,12,C.muted);
  line(ctx,[[704,516],[704,584]],'#7a9c9c26',1);
  const labels={
    rest:['RESTING','A thin layer of charge','creates a membrane voltage.'],
    depolarization:['DEPOLARIZATION','Na⁺ enters the cell.','Vₘ rapidly becomes positive.'],
    plateau:['PLATEAU','Ca²⁺ enters; K⁺ leaves.','Vₘ stays above resting level.'],
    repolarization:['REPOLARIZATION','Net outward K⁺ current','returns Vₘ toward rest.'],
  };
  const current=labels[phase]||labels.rest;
  const col=phase==='depolarization'?C.sodium:phase==='plateau'?C.calcium:C.potassium;
  ion(ctx,729,527,3,col,'',1);text(ctx,current[0],740,530,10,col,600);
  text(ctx,current[1],727,554,12,C.ink);text(ctx,current[2],727,573,12,C.muted);
  ctx.restore();
}

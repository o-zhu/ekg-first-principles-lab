/* A structural cartoon, not an atomic reconstruction. Four-domain NaV/CaV
 * and tetrameric Kv architectures inform the bundles; the section removes
 * the front wall so the selectivity filter and cytoplasmic gate stay legible.
 */
const TAU=Math.PI*2;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const rgba=(color,a)=>{const n=parseInt(color.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`;};
const rgb=(color,k,white=0)=>{const n=parseInt(color.slice(1),16);return `rgb(${[n>>16,(n>>8)&255,n&255].map(v=>Math.round(Math.min(255,v*k+(255-v)*white))).join(',')})`;};
function path(ctx,points){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);}
function ellipse(ctx,x,y,rx,ry,fill,stroke=null,width=1){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function label(ctx,str,x,y,size,color,weight=400){ctx.font=`${weight} ${size}px Inter,ui-sans-serif,system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=color;ctx.fillText(str,x,y);}

/** The simplified lesson's gate state. Gate motion follows the cycle cursor,
 * not elapsed wall time, so paused/scrubbed images and ion flow agree. */
export function membraneChannelState(s={}){
  const fallback={rest:.08,depolarization:.195,plateau:.39,repolarization:.65};
  const p=Number.isFinite(s.progress)?clamp(s.progress):fallback[s.phase]??.08;
  const phase=s.phase||(p<.16||p>=.78?'rest':p<.22?'depolarization':p<.52?'plateau':'repolarization');
  const na=phase==='depolarization'?smooth((p-.16)/.009)*(1-smooth((p-.212)/.008)):0;
  const ca=phase==='plateau'?.88*(.25+.75*smooth((p-.22)/.018)):0;
  const k=phase==='repolarization'?1-.85*smooth((p-.752)/.028):phase==='plateau'?.34*(.3+.7*smooth((p-.22)/.1)):0;
  const inactive=phase==='plateau'||phase==='repolarization';
  return {
    sodium:{id:'sodium',label:'Fast Na⁺',protein:'NaV1.5',color:'#f8ba79',open:na,inactivated:inactive,status:inactive?'inactivated':phase==='depolarization'&&p>.212?'inactivating':na>.55?'open':na>.02?'opening':'closed',direction:1,flow:na>.32?na:0},
    calcium:{id:'calcium',label:'L-type Ca²⁺',protein:'CaV1.2',color:'#b8b9f4',open:ca,inactivated:false,status:ca>.6?'open':ca>.02?'opening':'closed',direction:1,flow:ca>.24?ca:0},
    potassium:{id:'potassium',label:'Delayed K⁺',protein:'Iₖᵣ + Iₖₛ',color:'#9ce4cc',open:k,inactivated:false,status:k>.6?'open':k>.02?'partly open':'closed',direction:-1,flow:k>.06?k:0},
  };
}

export const CHANNEL_LAYOUT=Object.freeze([
  {id:'sodium',x:350}, {id:'calcium',x:515}, {id:'potassium',x:680},
]);
export const membraneY=x=>254+Math.sin((x-65)/870*Math.PI)*10;
export function membraneChannelAt(point,W,H){
  const z=Math.min(W/1000,H/610);if(!(z>0))return null;
  const x=(point.x-(W-1000*z)/2)/z,y=(point.y-(H-610*z)/2)/z;
  const item=CHANNEL_LAYOUT.find(c=>Math.abs(x-c.x)<65&&y>membraneY(c.x)-45&&y<membraneY(c.x)+141);
  return item?.id||null;
}

// A gently bent alpha-helix cartoon. A rounded protein core, continuous
// helical ribbon, and restrained edge highlights give depth without atom noise.
function helix(ctx,x0,y0,x1,y1,r,color,{back=false,bow=0,turns=5,phase=0}={}){
  const middle=(x0+x1)/2+bow,minX=Math.min(x0,x1,middle)-r*1.3,maxX=Math.max(x0,x1,middle)+r*1.3;
  const g=ctx.createLinearGradient(minX,0,maxX,0);
  g.addColorStop(0,rgb(color,.23));g.addColorStop(.22,rgb(color,back?.46:.65));
  g.addColorStop(.43,rgb(color,back?.7:.95,back?0:.08));g.addColorStop(.68,rgb(color,back?.48:.69));g.addColorStop(1,rgb(color,.24));
  ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo(middle,(y0+y1)/2,x1,y1);
  ctx.strokeStyle='#020e1660';ctx.lineWidth=r*2+2.5;ctx.stroke();
  ctx.strokeStyle=g;ctx.lineWidth=r*2;ctx.stroke();
  const center=t=>(1-t)*(1-t)*x0+2*(1-t)*t*middle+t*t*x1;
  // Bands are split into front/back halves of the same projected ribbon.
  for(let i=0;i<turns*2;i++){
    const t0=i/(turns*2),t1=(i+1)/(turns*2),front=i%2===0;
    ctx.beginPath();
    for(let j=0;j<=14;j++){
      const t=t0+(t1-t0)*j/14,a=t*turns*TAU+phase;
      const px=center(t)+Math.sin(a)*r*.77,py=y0+(y1-y0)*t+Math.cos(a)*r*.3;
      if(!j)ctx.moveTo(px,py);else ctx.lineTo(px,py);
    }
    ctx.strokeStyle=front?rgba(color,back?.2:.48):'#03151c38';ctx.lineWidth=front?2.6:1.1;ctx.stroke();
    if(front&&!back){ctx.strokeStyle='rgba(255,255,245,.15)';ctx.lineWidth=.65;ctx.stroke();}
  }
  ctx.beginPath();ctx.moveTo(x0-r*.42,y0+2);ctx.quadraticCurveTo(middle-r*.42,(y0+y1)/2,x1-r*.42,y1-1);
  ctx.strokeStyle=rgba(color,back?.12:.43);ctx.lineWidth=.8;ctx.stroke();
  ellipse(ctx,x0,y0,r*.77,r*.38,rgb(color,back?.58:.94,.04),rgba(color,.3),.5);
}

function loop(ctx,points,color,width=2){
  ctx.beginPath();ctx.moveTo(...points[0]);
  for(let i=1;i<points.length;i+=3)ctx.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);
  ctx.lineCap='round';ctx.strokeStyle=rgba(color,.22);ctx.lineWidth=width+2;ctx.stroke();
  ctx.strokeStyle=rgba(color,.67);ctx.lineWidth=width;ctx.stroke();
  ctx.strokeStyle=rgba('#fff5de',.12);ctx.lineWidth=.7;ctx.stroke();
}

/** Draw one front-open protein cartoon in the membrane cross-section. */
export function drawChannel(ctx,x,state,{focus=false}={}){
  const top=membraneY(x),cy=top+28,c=state.color,open=clamp(state.open);
  // Enlarged teaching ions must fit through every depicted conducting gate.
  // The open fraction controls current emphasis; it is not an atomic radius.
  const aperture=state.flow>0?Math.max(.65,open):open,gate=1.4+aperture*12;
  ctx.save();ctx.translate(x,cy);
  const halo=ctx.createRadialGradient(0,1,5,0,1,92);
  halo.addColorStop(0,rgba(c,focus?.20:.035+open*.09));halo.addColorStop(1,rgba(c,0));
  ctx.fillStyle=halo;ctx.fillRect(-96,-91,192,203);
  // Contact shadow and the back rim seat the protein inside the bilayer.
  ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=11;
  ellipse(ctx,0,6,62,48,'#03151c');ctx.restore();
  ellipse(ctx,0,-27,57,12,'#071b23',rgba(c,.28),1.1);
  ellipse(ctx,0,29,57,13,'#06181f',rgba(c,.2),.8);

  // Rear pore-forming domains: visible through the front-open section.
  helix(ctx,-12,-50,-21,52,9,c,{back:true,bow:-8,turns:6});
  helix(ctx,12,-50,21,52,9,c,{back:true,bow:8,turns:6,phase:Math.PI});
  const pore=ctx.createLinearGradient(0,-53,0,60);
  pore.addColorStop(0,'#041119');pore.addColorStop(.35,'#102b34');pore.addColorStop(.7,'#061820');pore.addColorStop(1,open>.2?'#143a3e':'#041219');
  ctx.beginPath();ctx.moveTo(-13,-54);ctx.bezierCurveTo(-11,-39,-7,-31,-7,-19);ctx.bezierCurveTo(-8,8,-12,31,-gate,55);
  ctx.lineTo(gate,55);ctx.bezierCurveTo(12,31,8,8,7,-19);ctx.bezierCurveTo(7,-31,11,-39,13,-54);ctx.closePath();
  ctx.fillStyle=pore;ctx.fill();
  if(open>.1){const g=ctx.createLinearGradient(0,-48,0,65);g.addColorStop(0,rgba(c,0));g.addColorStop(.35,rgba(c,.07+open*.11));g.addColorStop(1,rgba(c,0));ctx.fillStyle=g;ctx.fillRect(-5,-48,10,113);}

  // Two voltage-sensor bundles flank the pore. Four repeats/subunits wrap
  // around it in 3-D; a section exposes only parts of those assemblies.
  const sensorRise=open*2.2;
  for(const side of [-1,1]){
    helix(ctx,side*47,-35-sensorRise,side*43,29-sensorRise,6.7,c,{back:true,bow:side*4,turns:4});
    helix(ctx,side*37,-41-sensorRise,side*34,37-sensorRise,7.3,c,{bow:-side*3,turns:5,phase:Math.PI/3});
    helix(ctx,side*26,-46,side*26,48,7.3,c,{back:true,bow:side*5,turns:5});
    // Selectivity-loop crown turns inward at the extracellular entrance.
    loop(ctx,[[side*35,-43],[side*34,-64],[side*21,-64],[side*13,-49]],c,2.2);
    // Front S6-like inner helices splay at their intracellular ends.
    helix(ctx,side*17,-32,side*(gate+5),53,7.2,c,{bow:side*6,turns:5,phase:side<0?0:Math.PI});
  }

  // A narrow filter is distinct from the wider activation gate below.
  ellipse(ctx,0,-41,11.8,5.6,'#03131c',rgba(c,.74),1.5);
  ellipse(ctx,0,-41,6.2,2.8,'#142e39',rgba('#f3f5e6',.24),.7);
  for(const side of [-1,1]){
    const oxygen=ctx.createRadialGradient(side*6.4-.7,-30-.7,.2,side*6.4,-30,2.4);
    oxygen.addColorStop(0,'#fff4dc');oxygen.addColorStop(.45,rgb(c,1,.27));oxygen.addColorStop(1,rgb(c,.43));
    ellipse(ctx,side*6.4,-30,2.3,3.5,oxygen);
    ellipse(ctx,side*5.7,-22.5,1.7,2.7,rgb(c,.85,.2));
  }

  // Lower gate. The bright two halves actually meet when shut. No false
  // conducting stream is painted through a visually closed aperture.
  for(const side of [-1,1]){
    ctx.beginPath();ctx.moveTo(side*(gate+5),49);ctx.quadraticCurveTo(side*(gate+2),55,side*gate,58);
    ctx.lineCap='round';ctx.strokeStyle=rgb(c,.83);ctx.lineWidth=5.4;ctx.stroke();
    ctx.strokeStyle=rgba('#fff6df',.3);ctx.lineWidth=1;ctx.stroke();
  }
  // NaV fast inactivation: an intracellular linker docks laterally. It is
  // deliberately not drawn as a ball obstructing the central aqueous pore.
  if(state.id==='sodium'){
    const dock=state.inactivated?1:0,tx=34-dock*9,ty=77-dock*18;
    loop(ctx,[[41,35],[63,55],[52,79],[tx,ty]],c,1.8);
    ctx.save();ctx.translate(tx,ty);ctx.rotate(dock?-.42:.18);
    ctx.beginPath();ctx.roundRect(-7,-3.8,14,7.6,3);ctx.fillStyle=rgb(c,.88,.08);ctx.fill();ctx.strokeStyle=rgba('#fff4d7',.5);ctx.lineWidth=.7;ctx.stroke();
    for(const q of [-3.5,0,3.5])ellipse(ctx,q,0,1,1,rgba('#14232b',.6));ctx.restore();
    if(dock){ctx.beginPath();ctx.arc(26,58,9,-.9,1.4);ctx.strokeStyle=rgba(c,.55);ctx.lineWidth=1;ctx.stroke();}
  }else if(state.id==='calcium'){
    // An extracellular crown gives the L-type channel its own silhouette;
    // accessory proteins are omitted from this small membrane section.
    loop(ctx,[[-18,-51],[-14,-64],[-4,-66],[0,-59],[4,-66],[15,-64],[18,-51]],c,2.1);
    loop(ctx,[[-31,45],[-40,64],[-15,73],[-10,60]],c,2.4);
  }else{
    // Small flanking accessory fins suggest the IKs structural reference.
    // The current depicted by the lesson still combines delayed rectifiers.
    helix(ctx,-58,-27,-56,31,3.6,c,{back:true,turns:3});
    helix(ctx,58,-27,56,31,3.6,c,{back:true,turns:3,phase:Math.PI});
    loop(ctx,[[-24,47],[-25,69],[-9,74],[-3,63]],c,2);
    loop(ctx,[[24,47],[25,69],[9,74],[3,63]],c,2);
  }

  const labelY=88;
  label(ctx,state.label,0,labelY,13.5,c,650);
  const status=state.status,active=state.flow>0;
  ctx.font='500 9px Inter,ui-sans-serif,system-ui,sans-serif';
  const pillWidth=ctx.measureText(status).width+25;
  ctx.beginPath();ctx.roundRect(-pillWidth/2,labelY+7,pillWidth,19,9.5);
  ctx.fillStyle=active?rgba(c,.11):'#ffffff05';ctx.fill();ctx.strokeStyle=rgba(c,active?.28:.11);ctx.lineWidth=.7;ctx.stroke();
  ellipse(ctx,-pillWidth/2+9,labelY+16.5,2,2,active?c:state.inactivated?'#d79e6b':'#5e777c');
  label(ctx,status,4,labelY+20,9,active?rgb(c,.95,.08):'#9bb2b5',500);
  if(focus){
    ctx.strokeStyle=rgba(c,.65);ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(-73,-78,146,203,16);ctx.stroke();
    label(ctx,'SELECTED',0,-85,8,rgba(c,.8),600);
  }
  ctx.restore();
}

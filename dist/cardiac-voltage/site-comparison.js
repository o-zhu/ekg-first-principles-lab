import {humanValue,modelValue,modelVariant,modelChamber} from './heart-data.js';
import {heartDataDuration,heartDisplayDuration} from './heart-time.js';

// The order is shared by anatomy markers, curves, comparison chips, and timing rows.
export const SITE_COLORS=Object.freeze(['#f2c46f','#77e1c3','#b6a1ff','#ff937d','#7ec6ff','#f6a6d4']);
const CHAMBER_NAMES={RA:'Right atrium',LA:'Left atrium',RV:'Right ventricle',LV:'Left ventricle'};
const C={background:'#071a22',panel:'#0b242d',ink:'#edf2e9',muted:'#92adb4',line:'#29454e'};
const measured=(s,d)=>s.heartMode==='measured'||!!d?.mask;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function getComparisonSites(s,d){
  if(!d)return [];
  const human=measured(s,d),chosen=human?s.selectedHumanSites?.[d.donor??s.donor]:s.selectedModelSites;
  if(!Array.isArray(chosen))return [];
  const seen=new Set(),sites=[];
  for(const node of chosen){
    if(!Number.isInteger(node)||seen.has(node)||node<0)continue;
    if(human?!d.mask[node]:node>=d.nodeCount)continue;
    sites.push(node);seen.add(node);if(sites.length===SITE_COLORS.length)break;
  }
  return sites;
}

export function comparisonRows(s,d){
  if(!d)return [];
  const human=measured(s,d),variant=human?null:modelVariant(d,s);
  const active=human?null:clamp(Number.isInteger(s.selectedNode)?s.selectedNode:0,0,d.nodeCount-1);
  return getComparisonSites(s,d).map((node,i)=>{
    const source=!human&&s.uniformHeart?active:node,chamber=human?'':modelChamber(d,node);
    return {node,label:String.fromCharCode(65+i),color:SITE_COLORS[i],chamber,chamberName:human?'':CHAMBER_NAMES[chamber]||chamber,
      at:human?d.timings[source]:d.nodes.activationMs[source],
      apd:human?d.timings[20000+source]:(variant.apd90Ms||d.nodes.apd90Ms)[source],
      rt:human?d.timings[10000+source]:(variant.recoveryMs||d.nodes.recoveryMs)[source]};
  });
}

function label(c,text,x,y,size=13,color=C.ink,align='left',weight=400){
  c.font=`${weight} ${size}px "DM Sans",system-ui,sans-serif`;c.fillStyle=color;c.textAlign=align;c.fillText(text,x,y);
}
function segment(c,x1,y1,x2,y2,color,width=1){
  c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width;c.stroke();
}
function windowFor(rows,d,range,s){
  const end=heartDisplayDuration(d,s);
  if(range==='full'||!rows.length)return [0,end];
  const times=rows.map(r=>range==='activation'?r.at:r.rt).filter(Number.isFinite);
  if(!times.length)return [0,end];
  const padding=range==='activation'?20:70;
  return [clamp(Math.min(...times)-padding,0,end),clamp(Math.max(...times)+padding,0,end)];
}
function tickStep(span,count=6){
  const target=span/count,power=10**Math.floor(Math.log10(target));
  return ([1,2,2.5,5,10].find(v=>v*power>=target)??10)*power;
}
function wrappedLines(c,text,width,size=11){
  c.font=`400 ${size}px "DM Sans",system-ui,sans-serif`;
  const lines=[];let current='';
  for(const word of text.split(' ')){const next=current?`${current} ${word}`:word;if(current&&c.measureText(next).width>width){lines.push(current);current=word;}else current=next;}
  if(current)lines.push(current);return lines;
}

// Every trace uses the same acquisition/model clock. Cropping never realigns sites.
// AP values are read through the native loaders, including their documented decoding.
export function renderComparison(ctx,W,H,s,d,range='full'){
  if(!(W>0&&H>0))return;
  ctx.save();ctx.fillStyle=C.background;ctx.fillRect(0,0,W,H);
  // W/H are CSS pixels; the caller supplies the device-pixel-ratio transform.
  // Lay out directly in this space so type never shrinks with a virtual canvas.
  const c=ctx;
  if(!d){label(c,'Loading action potentials…',W/2,H/2,16,C.muted,'center');ctx.restore();return;}
  const human=measured(s,d),rows=comparisonRows(s,d),uniform=!human&&s.uniformHeart,single=!!(s.singleBeat&&d.single);
  const [start,end]=windowFor(rows,d,['activation','recovery'].includes(range)?range:'full',s);
  const duration=heartDataDuration(d),displayDuration=heartDisplayDuration(d,s),span=end-start||1,active=clamp(Number.isInteger(s.selectedNode)?s.selectedNode:0,0,(d.nodeCount||1)-1);
  const valueAt=(node,time)=>human?humanValue(d,node,time/duration,single):modelValue(d,uniform?active:node,time/duration,s.modelVariant);
  const mobile=W<560,stacked=W<760,pad=mobile?16:24,cols=mobile?(W<320?1:2):(W<720?2:3),legendRows=Math.ceil(rows.length/cols);
  const title=mobile?(human?'MEASURED HUMAN APs':'MODELED ACTION POTENTIALS'):(human?'MEASURED HUMAN ACTION POTENTIALS':'MODELED ACTION POTENTIALS');
  label(c,title,pad,25,13,human?'#77e1c3':'#f2c46f','left',600);
  const activeLabel=rows.find(row=>row.node===active)?.label;
  const sub=human?`Donor ${d.donor} · ${single?'one recorded beat':'four-beat ensemble'}`:
    uniform?`Identical Vₘ · ${activeLabel?'site '+activeLabel:'active site'}’s AP`:d.schemaVersion>=2?'Selected atrial & ventricular sites · modeled mV':'Selected ventricular sites · assumed mV';
  label(c,sub,pad,46,mobile?11:12,C.muted);
  const rangeLabel=range==='activation'?'Activation detail':range==='recovery'?'Recovery detail':'Full common clock';
  if(stacked)label(c,`${rangeLabel} · ${Math.round(start)}–${Math.round(end)} ms`,pad,66,11,C.ink);
  else{
    label(c,rangeLabel.toUpperCase(),W-pad,25,11,C.muted,'right',600);
    label(c,`${Math.round(start)}–${Math.round(end)} ms · no site alignment`,W-pad,46,12,C.ink,'right');
  }
  const footer=human?'AT / APD₈₀ / RT₈₀: four-beat ensemble. Optical amplitude is relative.':
    uniform?'All curves and timing rows use the active AP. Spatial source and ECG: zero.':'AT / APD₉₀ / RT₉₀ are modeled. The ECG uses the full spatial field.';
  const footerLines=wrappedLines(c,footer,W-2*pad),footerY=H-14-(footerLines.length-1)*15;
  const legendY=footerY-24-Math.max(0,legendRows-1)*23,plotBottom=(legendRows?legendY:footerY-4)-53;
  const g={x:mobile?45:56,y:stacked?100:81,w:W-(mobile?45:56)-pad,h:Math.max(55,plotBottom-(stacked?100:81))},vmin=human?-.25:-95,vmax=human?1.25:35;
  const xx=t=>g.x+(t-start)/span*g.w,yy=v=>g.y+(vmax-v)/(vmax-vmin)*g.h;
  c.fillStyle=C.panel;c.fillRect(g.x,g.y,g.w,g.h);
  label(c,human?'Normalized optical signal':d.schemaVersion>=2?'Vₘ · modeled mV':'Vₘ · assumed mV',g.x,g.y-13,11,C.muted);
  const yTicks=human?[0,.5,1]:[-85,-40,0,25];
  for(const v of yTicks){segment(c,g.x,yy(v),g.x+g.w,yy(v),C.line,.7);label(c,String(v),g.x-12,yy(v)+4,11,C.muted,'right');}
  const step=tickStep(span,clamp(Math.floor(g.w/70),2,7)),ticks=[];
  for(let t=Math.ceil(start/step)*step;t<=end+step*1e-6;t+=step)ticks.push(t);
  for(const t of ticks){segment(c,xx(t),g.y,xx(t),g.y+g.h,'#29454e80',.7);label(c,String(Math.round(t*10)/10),xx(t),g.y+g.h+20,11,C.muted,'center');}
  label(c,mobile?'Time · ms (shared clock)':'Time from shared recording/model origin · ms',g.x+g.w/2,g.y+g.h+39,11,C.muted,'center');
  c.save();c.beginPath();c.rect(g.x,g.y,g.w,g.h);c.clip();
  // Include the exact crop endpoints and all retained sample times in between.
  const times=[start];for(let i=Math.ceil(start/d.dt);i<d.frames&&i*d.dt<end;i++)if(i*d.dt>start)times.push(i*d.dt);times.push(end);
  rows.forEach((row,index)=>{
    c.beginPath();let started=false;
    for(const t of times){const v=valueAt(row.node,t);if(!Number.isFinite(v)){started=false;continue;}if(started)c.lineTo(xx(t),yy(v));else{c.moveTo(xx(t),yy(v));started=true;}}
    c.strokeStyle=row.color;c.lineWidth=2;c.lineJoin='round';
    if(uniform&&rows.length>1){c.setLineDash([9,9*(rows.length-1)]);c.lineDashOffset=-index*9;}
    c.stroke();c.setLineDash([]);c.lineDashOffset=0;
  });
  const now=clamp(s.progress??0,0,1)*displayDuration;
  if(rows.length&&now>=start&&now<=end){
    segment(c,xx(now),g.y,xx(now),g.y+g.h,'#edf2e977',1);
    for(const row of rows){const v=valueAt(row.node,now);if(!Number.isFinite(v))continue;c.beginPath();c.arc(xx(now),yy(v),2.8,0,Math.PI*2);c.fillStyle=row.color;c.fill();}
  }
  c.restore();
  if(!rows.length){
    const empty=wrappedLines(c,'Select up to six tissue locations to compare their APs on the same clock.',g.w-30,13),top=g.y+g.h/2-(empty.length-1)*10;
    empty.forEach((text,i)=>label(c,text,g.x+g.w/2,top+i*20,13,C.ink,'center'));
  }
  rows.forEach((row,index)=>{
    const x=pad+(index%cols)*(W-2*pad)/cols,y=legendY+Math.floor(index/cols)*23;
    segment(c,x,y-4,x+15,y-4,row.color,2.4);
    const name=human?(W<800?`x${row.node%100}, y${Math.floor(row.node/100)}`:`camera x=${row.node%100}, y=${Math.floor(row.node/100)}`):(row.chamberName||row.chamber||'Modeled site');
    label(c,`${row.label} · ${name}`,x+23,y,12,row.color,'left',600);
  });
  footerLines.forEach((text,i)=>label(c,text,pad,footerY+i*15,11,C.muted));
  ctx.restore();
  return {...g,start:start/displayDuration,end:end/displayDuration};
}

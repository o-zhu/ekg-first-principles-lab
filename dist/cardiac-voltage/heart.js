import {datasets,heartReady,modelValue,modelVariant,modelFrame,modelTrace} from './heart-data.js';
import {HeartSurface,mapColor,colorCSS} from './heart3d.js';
import {renderOptical,pickOptical} from './optical-view.js';
import {comparisonRows} from './site-comparison.js';
import {heartDisplayDuration,heartDataProgress} from './heart-time.js';
import {leadAxisDefinition} from './lead-axis.js';
const C={bg:'#071a22',mint:'#a9eccd',gold:'#f2d28e',violet:'#c5b5ee',ink:'#e6f2e9',muted:'#87a2aa',line:'#29454e'};
let surface=null,modelIdentity=null,paintValues=null;
const stage={x:36,y:90,w:630,h:460};
function label(c,t,x,y,size=13,color=C.ink,align='left',weight=400){c.font=`${weight} ${size}px "DM Sans",system-ui,sans-serif`;c.fillStyle=color;c.textAlign=align;c.fillText(t,x,y);}
function box(c,x,y,w,h){c.beginPath();c.roundRect(x,y,w,h,10);c.fillStyle='#0e252e';c.fill();c.strokeStyle=C.line;c.lineWidth=.8;c.stroke();}
function line(c,points,color=C.line,width=1){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function dot(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
function timing(d,s,node){const v=modelVariant(d,s);return {at:d.nodes.activationMs[node],apd:(v.apd90Ms||d.nodes.apd90Ms)[node],rt:(v.recoveryMs||d.nodes.recoveryMs)[node]};}
function background(c){c.fillStyle=C.bg;c.fillRect(0,0,1000,610);const g=c.createRadialGradient(340,340,40,340,340,410);g.addColorStop(0,'#13323b');g.addColorStop(1,C.bg);c.fillStyle=g;c.fillRect(0,0,1000,610);c.fillStyle='#79a8ad12';for(let x=25;x<670;x+=25)for(let y=80;y<560;y+=25)c.fillRect(x,y,1,1);}
function selectedPlot(c,d,s,node){
  const x=718,y=306,w=238,h=101,rows=comparisonRows(s,d),duration=heartDisplayDuration(d,s),dataProgress=heartDataProgress(d,s);
  box(c,687,250,285,205);label(c,s.uniformHeart?'IDENTICAL Vₘ · ALL SITES COINCIDE':'SELECTED MODELED SITES',704,273,s.uniformHeart?9.5:11,C.muted,'left',600);label(c,'Vₘ · mV',704,293,10,C.muted);label(c,d.schemaVersion>=2?'atrial & ventricular APs':'assumed amplitude scale',954,293,9,C.muted,'right');
  const xx=p=>x+w*p,yy=v=>y+3+(h-6)*(25-v)/110;
  for(const v of [-85,0,25]){line(c,[[x,yy(v)],[x+w,yy(v)]],'#45626933',.7);label(c,String(v),x-6,yy(v)+3,9,C.muted,'right');}
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
  rows.forEach((row,index)=>{
    const source=s.uniformHeart?node:row.node,trace=modelTrace(d,source,s.modelVariant);c.beginPath();
    for(let i=0;i<d.frames&&i*d.dt<=duration;i++){const p=i*d.dt/duration,v=trace[i];i?c.lineTo(xx(p),yy(v)):c.moveTo(xx(0),yy(v));}
    c.strokeStyle=row.color;c.lineWidth=row.node===node?2:1.5;
    if(s.uniformHeart&&rows.length>1){c.setLineDash([6,6*(rows.length-1)]);c.lineDashOffset=-index*6;}
    c.stroke();c.setLineDash([]);c.lineDashOffset=0;
  });
  if(rows.length){line(c,[[xx(s.progress),y],[xx(s.progress),y+h]],'#bde9d77a',1);for(const row of rows)dot(c,xx(s.progress),yy(modelValue(d,s.uniformHeart?node:row.node,dataProgress,s.modelVariant)),2.5,row.color);}
  c.restore();
  if(!rows.length){label(c,'Click tissue to add an AP.',x+w/2,y+44,12,C.muted,'center');label(c,'Up to six sites · common clock',x+w/2,y+64,10,C.muted,'center');}
  label(c,'0',x,y+h+16,10,C.muted);label(c,`${duration} ms`,x+w,y+h+16,10,C.muted,'right');
  rows.forEach((row,i)=>{const lx=706+i*43;line(c,[[lx,439],[lx+10,439]],row.color,2);label(c,row.label,lx+13,442,10,row.color,'left',600);if(row.chamber)label(c,row.chamber,lx+13,452,8,C.muted);});
  return {x,y,w,h,start:0,end:1};
}
function leadInset(c,d,s){
  box(c,687,78,285,156);label(c,'VIRTUAL ELECTRODES',704,101,11,C.muted,'left',600);
  const cx=785,cy=164;
  c.strokeStyle='#7ba5ae66';c.lineWidth=1.1;c.beginPath();c.moveTo(cx-15,119);c.lineTo(cx-19,129);c.lineTo(cx-55,139);c.quadraticCurveTo(cx-62,143,cx-57,183);c.lineTo(cx-48,209);c.moveTo(cx+15,119);c.lineTo(cx+19,129);c.lineTo(cx+55,139);c.quadraticCurveTo(cx+62,143,cx+57,183);c.lineTo(cx+48,209);c.stroke();
  const q={RA:[cx-66,145],LA:[cx+66,145],LL:[cx+47,204]};
  const lead=s.heartLead,pair={I:['LA','RA'],II:['LL','RA'],III:['LL','LA']}[lead];
  const augmented={aVR:'RA',aVL:'LA',aVF:'LL'}[lead],chest=/^V[1-6]$/.test(lead);
  const definition={I:'LA − RA',II:'LL − RA',III:'LL − LA',aVR:'RA − ½(LA + LL)',aVL:'LA − ½(RA + LL)',aVF:'LL − ½(RA + LA)'}[lead]||(chest?`C${lead.slice(1)} − WCT`:'');
  if(pair){line(c,[q[pair[1]],q[pair[0]]],'#a5d7c447',1);}
  for(const [name,p] of Object.entries(q)){const active=pair?.includes(name)||augmented||chest,positive=pair?name===pair[0]:name===augmented,col=active?(positive?C.mint:'#ed9d8e'):C.muted;dot(c,...p,active?4:3,col);label(c,name,p[0],p[1]-11,10,col,'center');}
  // This small silhouette is deliberately separate from the actual ventricular mesh.
  c.fillStyle='#b38a68';c.beginPath();c.ellipse(cx+5,168,13,19,-.3,0,Math.PI*2);c.fill();
  if(chest){
    const points=[[777,160,768,156],[790,160,790,149],[802,171,804,160],[814,183,808,198],[829,181,829,171],[843,176,850,187]];
    for(let i=0;i<points.length;i++){const [x,y,lx,ly]=points[i],active=i+1===Number(lead.slice(1)),col=active?C.mint:C.muted;dot(c,x,y,active?4.5:2.5,col);label(c,`C${i+1}`,lx,ly,8.5,col,'center',active?600:400);}
  }
  label(c,lead,909,148,28,C.mint,'center',500);label(c,definition,909,174,10,C.ink,'center',500);
  if(chest){label(c,'WCT =',909,190,9,C.muted,'center');label(c,'(RA + LA + LL)/3',909,204,9,C.muted,'center');}
  else label(c,'electrode potentials',909,194,9,C.muted,'center');
  label(c,'Finite torso · schematic electrode positions',704,222,9,C.muted);
}
function drawLeadAxis(c,d,s){
  if(!s.showLeadAxis||!surface?.rows)return;
  const axis=leadAxisDefinition(d,s.heartLead,s.polarity);if(!axis)return;
  // Parallel-translate the electrode/reference direction through the heart.
  // The actual body electrodes are outside this magnified anatomical view.
  const center=surface.center,half=surface.range*.66;
  const project=p=>{const q=surface.project(p);return{x:stage.x+q.x,y:stage.y+q.y};};
  const middle=project(center),negative=project(center.map((v,k)=>v-axis.direction[k]*half)),positive=project(center.map((v,k)=>v+axis.direction[k]*half));
  const axisBottom=stage.y+stage.h-36; // Leave room for the interaction hint.
  const dx=positive.x-middle.x,dy=positive.y-middle.y,projectedLength=2*Math.hypot(dx,dy);
  c.save();c.beginPath();c.rect(stage.x,stage.y,stage.w,stage.h);c.clip();
  const axisLabel=(text,x,y,align='left')=>{
    c.font='500 12px "DM Sans",system-ui,sans-serif';const width=c.measureText(text).width;
    if(align==='right')x-=width;
    x=Math.max(stage.x+8,Math.min(stage.x+stage.w-width-8,x));y=Math.max(stage.y+17,Math.min(axisBottom-4,y));
    c.textAlign='left';c.lineJoin='round';c.strokeStyle='#071a22d9';c.lineWidth=2.5;c.strokeText(text,x,y);
    c.fillStyle=C.gold;c.fillText(text,x,y);
  };
  const name=`Lead ${axis.lead}${axis.reversed?' · reversed':''}`;
  if(projectedLength<36){
    const toward=surface.rows[2].reduce((sum,v,k)=>sum+v*axis.direction[k],0)>0;
    c.strokeStyle=C.gold;c.lineWidth=1.4;c.beginPath();c.arc(middle.x,middle.y,7,0,2*Math.PI);c.stroke();
    if(toward)dot(c,middle.x,middle.y,2,C.gold);else{line(c,[[middle.x-3,middle.y-3],[middle.x+3,middle.y+3]],C.gold,1.3);line(c,[[middle.x-3,middle.y+3],[middle.x+3,middle.y-3]],C.gold,1.3);}
    axisLabel(`${name} · ${toward?'toward you':'away'}`,middle.x+14,middle.y+4);c.restore();return;
  }
  let fraction=1;const margin=22;
  for(const p of [negative,positive]){
    const px=p.x-middle.x,py=p.y-middle.y;
    if(px>0)fraction=Math.min(fraction,(stage.x+stage.w-margin-middle.x)/px);
    if(px<0)fraction=Math.min(fraction,(stage.x+margin-middle.x)/px);
    if(py>0)fraction=Math.min(fraction,(axisBottom-margin-middle.y)/py);
    if(py<0)fraction=Math.min(fraction,(stage.y+margin-middle.y)/py);
  }
  const a={x:middle.x+(negative.x-middle.x)*fraction,y:middle.y+(negative.y-middle.y)*fraction};
  const b={x:middle.x+(positive.x-middle.x)*fraction,y:middle.y+(positive.y-middle.y)*fraction};
  const angle=Math.atan2(b.y-a.y,b.x-a.x),tip=10,ux=Math.cos(angle),uy=Math.sin(angle);
  const gradient=c.createLinearGradient(a.x,a.y,b.x,b.y);
  gradient.addColorStop(0,'#f2d28e45');gradient.addColorStop(.55,'#f2d28eab');gradient.addColorStop(1,C.gold);
  c.lineCap='round';c.lineJoin='round';c.setLineDash([]);c.shadowColor='#031018cc';c.shadowBlur=3;
  line(c,[[a.x,a.y],[b.x,b.y]],gradient,1.6);
  line(c,[[b.x-tip*Math.cos(angle-.42),b.y-tip*Math.sin(angle-.42)],[b.x,b.y],[b.x-tip*Math.cos(angle+.42),b.y-tip*Math.sin(angle+.42)]],C.gold,1.6);
  c.shadowBlur=0;
  // One light label at the positive arrowhead; electrode names stay in the inset.
  const nx=uy,ny=-ux;
  axisLabel(name,b.x+nx*13+ux*4,b.y+ny*13+uy*4+4,nx>=0?'left':'right');
  c.restore();
}
function modelView(c,s,d){
  if(modelIdentity!==d){surface=new HeartSurface(d);modelIdentity=d;paintValues=new Float32Array(d.nodeCount);}
  const node=Math.min(d.nodeCount-1,s.selectedNode??0),tm=timing(d,s,node),variant=modelVariant(d,s),mode=s.heartMap,rows=comparisonRows(s,d);
  const map=mode==='activation'?d.nodes.activationMs:mode==='recovery'?(variant.recoveryMs||d.nodes.recoveryMs):(variant.apd90Ms||d.nodes.apd90Ms);
  let lo=mode==='activation'?0:mode==='recovery'?350:340,hi=mode==='activation'?130:mode==='recovery'?580:450;
  if(mode!=='voltage'){lo=Math.floor(Math.min(...map)/10)*10;hi=Math.ceil(Math.max(...map)/10)*10;if(hi===lo)hi=lo+20;}
  const dataProgress=heartDataProgress(d,s),min=d.encoding?.minMv??d.encoding?.min??-85,max=d.encoding?.maxMv??d.encoding?.max??25,frame=mode==='voltage'&&!s.uniformHeart?modelFrame(d,dataProgress,s.modelVariant):null;
  const uniformVm=modelValue(d,node,dataProgress,s.modelVariant);
  for(let k=0;k<d.nodeCount;k++)paintValues[k]=mode==='voltage'?((s.uniformHeart?uniformVm:frame[k])-min)/(max-min):(map[s.uniformHeart?node:k]-lo)/(hi-lo);
  const count=d.computationalNodeCount??d.nodeCount,time=s.progress*heartDisplayDuration(d,s);
  label(c,d.schemaVersion>=2?'CT-DERIVED FOUR-CHAMBER ANATOMY':'HUMAN VENTRICULAR GEOMETRY',36,34,13,C.ink,'left',600);label(c,d.sourceFieldNodeCount?`${count.toLocaleString('en-US')} activation nodes · ${d.sourceFieldNodeCount.toLocaleString('en-US')} voltage samples`:`${count.toLocaleString('en-US')} simulated sites · ${d.elementCount.toLocaleString('en-US')} tetrahedra`,36,55,11,C.muted);label(c,'CALIBRATED FORWARD MODEL',966,34,11,C.gold,'right',600);label(c,`${Math.round(time)} ms`,966,55,14,C.ink,'right',500);
  const events=variant.events||d.events,event=Array.isArray(events)?events.find(e=>time>=e.startMs&&time<e.endMs):null;
  if(d.schemaVersion>=2)label(c,event?.label||'Electrical rest',36,79,11,event?.key==='qrs'?C.gold:event?.key==='t'?C.violet:C.mint,'left',500);
  const img=surface.render(paintValues,s,stage.w,stage.h);
  if(img){c.drawImage(img,stage.x,stage.y,stage.w,stage.h);if(s.cutaway)surface.drawCutBoundary(c,stage.x,stage.y);}else label(c,'3D graphics are unavailable on this browser.',350,305,15,C.muted,'center');
  if(img)drawLeadAxis(c,d,s);
  // Grounded projected reticle follows the selected anatomical node during rotation.
  if(img){
    for(const chamber of d.chambers||[]){
      if(!chamber.position)continue;const p=surface.project(chamber.position),name=chamber.abbreviation||({1:'LV',2:'RV',3:'LA',4:'RA'})[chamber.id]||chamber.name;
      const x=stage.x+p.x,y=stage.y+p.y;c.save();c.font='600 12px "DM Sans",system-ui,sans-serif';const width=c.measureText(name).width;c.fillStyle='#071a22bd';c.beginPath();c.roundRect(x-width/2-7,y-12,width+14,23,5);c.fill();label(c,name,x,y+4,12,C.ink,'center',600);c.restore();
    }
    if(!s.cutaway&&s.showAppendage!==false&&d.appendage?.labelPositionMm){
      const p=surface.project(d.appendage.labelPositionMm),px=stage.x+p.x,py=stage.y+p.y;
      const lx=Math.max(stage.x+52,Math.min(stage.x+stage.w-80,px+53)),ly=Math.max(stage.y+20,py-25);
      line(c,[[px,py],[lx-7,ly+3]],'#add7c68a',1);dot(c,px,py,2.5,C.mint);
      c.fillStyle='#071a22db';c.fillRect(lx-5,ly-11,108,29);label(c,'LAA',lx,ly,11,C.mint,'left',600);label(c,'reconstructed pouch',lx,ly+13,8.5,C.muted);
    }
    if(s.showSamples)for(const point of d.samples||[]){const n=point.nearestNode??point.nodeIndex??point.node??0,p=surface.project(n);if((s.cutaway&&surface.isCutHidden(p))||(s.showAppendage===false&&surface.isAppendageNode(n)))continue;c.globalAlpha=p.z>0?.8:.25;dot(c,stage.x+p.x,stage.y+p.y,2.4,C.ink);}c.globalAlpha=1;
    const marks=rows.map(r=>({...r,active:r.node===node}));
    if(rows.length&&!rows.some(r=>r.node===node))marks.push({node,label:'active',color:C.ink,active:true});
    for(const mark of marks){
      const p=surface.project(mark.node);if((s.cutaway&&surface.isCutHidden(p))||(s.showAppendage===false&&surface.isAppendageNode(mark.node)))continue;
      const px=stage.x+p.x,py=stage.y+p.y;c.save();c.globalAlpha=p.z>0?1:.55;c.strokeStyle=mark.color;c.lineWidth=mark.active?1.8:1.4;c.beginPath();c.arc(px,py,mark.active?8:5.5,0,Math.PI*2);c.stroke();dot(c,px,py,2.3,mark.color);
      const text=mark.label;
      c.font='600 12px "DM Sans",system-ui,sans-serif';const tw=c.measureText(text).width,lx=Math.min(stage.x+stage.w-tw-7,Math.max(stage.x+7,px+12)),ly=Math.max(stage.y+13,py-10);c.textAlign='left';c.strokeStyle='#071a22df';c.lineWidth=2.5;c.lineJoin='round';c.strokeText(text,lx,ly);label(c,text,lx,ly,12,mark.color,'left',600);c.restore();
    }
  }
  label(c,'Drag to rotate · click to add/remove an AP · scroll to zoom',350,536,11,C.muted,'center');
  // Axis triad is computed in the same orientation as the anatomy.
  if(surface.rows){const origin={x:84,y:487};const axes=[['L',[1,0,0],C.mint],['A',[0,-1,0],C.violet],['S',[0,0,1],C.gold]];for(const [name,v,col] of axes){const px=surface.rows[0].reduce((z,k,i)=>z+k*v[i],0),py=surface.rows[1].reduce((z,k,i)=>z+k*v[i],0);line(c,[[origin.x,origin.y],[origin.x+px*25,origin.y-py*25]],col,1.2);label(c,name,origin.x+px*34,origin.y-py*34+3,10,col,'center');}}
  leadInset(c,d,s);const selectedAPPlot=selectedPlot(c,d,s,node);
  box(c,687,470,285,79);if(rows.length){const active=rows.find(row=>row.node===node);label(c,active?`Site ${active.label} · ${active.chamberName}`:'Active site',704,488,11,C.ink,'left',500);label(c,'AT + APD₉₀ = RT₉₀',704,505,10,C.muted);label(c,`${tm.at.toFixed(1)} + ${tm.apd.toFixed(1)} = ${tm.rt.toFixed(1)} ms`,704,532,17,C.ink);}else{label(c,'NO COMPARISON SITES SELECTED',704,493,11,C.muted,'left',600);label(c,'Click tissue to add up to six APs.',704,520,13,C.ink);}
  let title=mode==='voltage'?'MODELED MEMBRANE VOLTAGE':mode==='activation'?'ACTIVATION TIME':mode==='recovery'?'RECOVERY TIME · RT₉₀':'ACTION-POTENTIAL DURATION · APD₉₀';
  label(c,title,36,568,10,C.muted,'left',600);const grad=c.createLinearGradient(300,0,540,0);for(let i=0;i<=4;i++)grad.addColorStop(i/4,colorCSS(i/4));c.fillStyle=grad;c.fillRect(300,559,240,8);label(c,mode==='voltage'?`${min} mV`:`${lo} ms`,300,586,10,C.muted);label(c,mode==='voltage'?`+${max} mV`:`${hi} ms`,540,586,10,C.muted,'right');
  label(c,d.schemaVersion>=2?'Chamber APs → full 3D source field → calculated electrode differences':'Optical AP shape → modeled 3D field → computed electrode differences',966,584,10,C.muted,'right');
  return [selectedAPPlot];
}
export function renderHeart(ctx,W,H,s){
  const d=heartReady(s);if(s.heartMode==='measured'&&d)return renderOptical(ctx,W,H,s,d);
  const z=Math.min(W/1000,H/610);ctx.save();ctx.translate((W-1000*z)/2,(H-610*z)/2);ctx.scale(z,z);background(ctx);
  let plots=[];
  if(!d){label(ctx,datasets.error||'Loading the recorded data and anatomical model…',500,300,17,C.muted,'center');label(ctx,'The controls become available as the data load.',500,329,12,C.muted,'center');}else plots=modelView(ctx,s,d);ctx.restore();return plots;
}
export function pickHeart(x,y,s){const d=heartReady(s);if(!d)return null;if(s.heartMode==='measured')return pickOptical(x,y,s,d);if(!surface||x<stage.x||x>stage.x+stage.w||y<stage.y||y>stage.y+stage.h)return null;let selected=null,nearest=121;for(const row of comparisonRows(s,d)){const p=surface.project(row.node);if((s.cutaway&&surface.isCutHidden(p))||(s.showAppendage===false&&surface.isAppendageNode(row.node)))continue;const distance=(x-stage.x-p.x)**2+(y-stage.y-p.y)**2;if(distance<nearest){nearest=distance;selected=row.node;}}return selected??surface.pick(x-stage.x,y-stage.y,s.cutaway,s.showAppendage!==false);}

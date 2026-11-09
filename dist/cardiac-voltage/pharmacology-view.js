// Fixed experimental C-alpha/ligand coordinates; camera interaction only.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const shade=(h,k)=>`rgb(${rgb(h).map(x=>Math.round(clamp(x*k,0,255))).join(',')})`;
const sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b,s=1)=>a.map((x,i)=>x+b[i]*s);
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const spline=(a,b,c,d,t)=>b.map((x,i)=>.5*((2*x)+(-a[i]+c[i])*t+(2*a[i]-5*x+4*c[i]-d[i])*t*t+(-a[i]+3*x-3*c[i]+d[i])*t*t*t));
function ribbonSide(a,b,c,d,t){const tangent=b.map((x,i)=>(-a[i]+c[i])+2*(2*a[i]-5*x+4*c[i]-d[i])*t+3*(-a[i]+3*x-3*c[i]+d[i])*t*t),curve=b.map((x,i)=>2*(2*a[i]-5*x+4*c[i]-d[i])+6*(-a[i]+3*x-3*c[i]+d[i])*t);return unit(cross(tangent,curve));}

export function drawBindingOverlay(ctx,record,project,scale,W,H){
 const site=record?.ligand?.center||record?.region?.center;if(!site)return;
 const p=project(site),color='#f4ca78',radius=record.ligand?Math.max(13,scale*7):Math.max(14,scale*record.region.radius);
 const halo=ctx.createRadialGradient(p[0],p[1],2,p[0],p[1],radius*1.8);halo.addColorStop(0,'#ffd48a24');halo.addColorStop(1,'#ffd48a00');ctx.fillStyle=halo;ctx.fillRect(p[0]-radius*2,p[1]-radius*2,radius*4,radius*4);
 ctx.strokeStyle=record.ligand?'#f8d79585':'#f8d79570';ctx.lineWidth=1;ctx.setLineDash(record.ligand?[2,4]:[5,5]);ctx.beginPath();ctx.ellipse(p[0],p[1],radius,radius*.76,-.15,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
 if(record.ligand){
  const atoms=record.ligand.atoms.map(a=>({...a,p:project(a.position)}));
  ctx.lineCap='round';
  for(const [a,b]of record.ligand.bonds){ctx.beginPath();ctx.moveTo(...atoms[a].p.slice(0,2));ctx.lineTo(...atoms[b].p.slice(0,2));ctx.strokeStyle='#081c24';ctx.lineWidth=Math.max(2.4,scale*.66);ctx.stroke();ctx.strokeStyle='#eed7a7';ctx.lineWidth=Math.max(1.3,scale*.38);ctx.stroke();}
  for(const a of atoms.sort((a,b)=>a.p[2]-b.p[2])){const c={C:'#e9c47b',N:'#a7c9f4',O:'#f09791',F:'#b8df9f',S:'#edcf82',P:'#d7adf5'}[a.element]||color,r=clamp(scale*.62,1.7,6.5);const g=ctx.createRadialGradient(a.p[0]-r*.3,a.p[1]-r*.4,.1,a.p[0],a.p[1],r);g.addColorStop(0,'#fff4d8');g.addColorStop(.4,c);g.addColorStop(1,shade(c,.52));ctx.beginPath();ctx.arc(a.p[0],a.p[1],r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();}
 }
 const label=record.ligand?'Observed bound medicine':'Supported binding region',tx=clamp(p[0]+radius+22,25,W-175),ty=clamp(p[1]-radius-17,40,H-45);
 ctx.strokeStyle='#e2c58c99';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p[0]+radius*.7,p[1]-radius*.5);ctx.lineTo(tx-8,ty+3);ctx.lineTo(tx+122,ty+3);ctx.stroke();ctx.fillStyle='#f6dfac';ctx.textAlign='left';ctx.font='500 10px system-ui,sans-serif';ctx.fillText(label,tx,ty-4);
}

function drawSchematic(ctx,W,H,drug){
 const c='#a9d7c7',cx=W*.5,cy=H*.41;
 ctx.fillStyle='#90b6ab';ctx.textAlign='center';ctx.font='9px system-ui,sans-serif';ctx.fillText('MECHANISM CARTOON · NO ATOMIC POSE',cx,29);
 if(drug?.primaryTarget==='beta1'){
  for(let row of[-1,1])for(let i=-7;i<=7;i++){ctx.beginPath();ctx.arc(cx+i*22,cy+row*35,4,0,Math.PI*2);ctx.fillStyle='#87b8a323';ctx.fill();ctx.strokeStyle='#87b8a338';ctx.beginPath();ctx.moveTo(cx+i*22,cy+row*31);ctx.lineTo(cx+i*22+3,cy+row*7);ctx.stroke();}
  for(let i=0;i<7;i++){const x=cx+(i-3)*12;ctx.beginPath();ctx.moveTo(x-4,cy-55);ctx.bezierCurveTo(x+5,cy-15,x-5,cy+20,x+4,cy+55);ctx.strokeStyle=i%2?'#72ad9e':'#a5d2bd';ctx.lineWidth=9;ctx.lineCap='round';ctx.stroke();}
  ctx.beginPath();ctx.ellipse(cx,cy-36,18,11,0,0,Math.PI*2);ctx.fillStyle='#edc67e';ctx.fill();ctx.fillStyle='#f0dab3';ctx.font='11px system-ui,sans-serif';ctx.fillText('β receptor',cx,cy+85);
  ctx.strokeStyle='#9ac5b277';ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(cx,cy+98);ctx.lineTo(cx,cy+127);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=c;ctx.fillText('↓ cAMP signaling',cx,cy+146);ctx.font='10px system-ui,sans-serif';ctx.fillStyle='#89aaa1';ctx.fillText('Less acceleration of HCN and Ca²⁺ currents',cx,cy+168);
 }else if(drug?.id==='magnesium'){
  for(let i=0;i<7;i++){const a=i*Math.PI*2/7,x=cx+Math.cos(a)*84,y=cy+Math.sin(a)*66;ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.fillStyle='#9cd5c012';ctx.fill();ctx.strokeStyle='#9cd5c048';ctx.stroke();ctx.fillStyle='#c2e2d3';ctx.font='10px system-ui,sans-serif';ctx.fillText('Mg²⁺',x,y+4);}
  ctx.fillStyle='#e5d5b4';ctx.font='18px Georgia,serif';ctx.fillText('Many ionic processes',cx,cy+112);ctx.fillStyle='#8faea5';ctx.font='11px system-ui,sans-serif';ctx.fillText('No single validated antiarrhythmic binding pose',cx,cy+138);
 }else{
  ctx.strokeStyle='#86b9b357';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(cx-130,cy-35);ctx.lineTo(cx+130,cy-35);ctx.moveTo(cx-130,cy+35);ctx.lineTo(cx+130,cy+35);ctx.stroke();
  for(let i=-1;i<=1;i++){ctx.fillStyle=i===0?'#e4bd7b':'#74a9a2';ctx.beginPath();ctx.roundRect(cx+i*60-12,cy-55,24,110,10);ctx.fill();}
  ctx.fillStyle='#dce8df';ctx.font='18px Georgia,serif';ctx.fillText('Longer inward current',cx,cy+99);ctx.fillStyle='#8faea5';ctx.font='11px system-ui,sans-serif';ctx.fillText('A longer action potential can have several causes',cx,cy+125);
 }
}

export function createPharmacologyViewer(canvas){
 const ctx=canvas.getContext('2d');let record=null,drug=null,geometry=[],bounds=null,yaw=.25,pitch=.12,zoom=1,focus=false,pointer=null,frame=null;
 const mark=()=>{if(!frame)frame=requestAnimationFrame(draw);};
 function compile(){geometry=[];bounds=null;if(!record)return;const points=[];
  for(const chain of record.chains){if(chain.role==='accessory')continue;
   for(const segment of chain.segments){const ps=[];for(let i=0;i<segment.positions.length;i+=3){const p=segment.positions.slice(i,i+3);ps.push(p);points.push(p);}
    for(let i=0;i<ps.length-1;i++){const controls=[ps[Math.max(0,i-1)],ps[i],ps[i+1],ps[Math.min(ps.length-1,i+2)]],helix=segment.secondary[i]==='H'&&segment.secondary[i+1]==='H';
     for(let j=0;j<3;j++){const t=j/3,u=(j+1)/3,p=spline(...controls,t),q=spline(...controls,u),g={a:p,b:q,color:chain.color||'#a8d4be'};if(helix){const n=ribbonSide(...controls,t),m=ribbonSide(...controls,u);g.vertices=[add(p,n,1.12),add(q,m,1.12),add(q,m,-1.12),add(p,n,-1.12)];g.normal=unit(cross(sub(q,p),add(n,m)));}geometry.push(g);}
    }
   }
  }
  const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))),center=min.map((v,k)=>(v+max[k])/2);bounds={center,radius:Math.max(...points.map(p=>Math.hypot(...sub(p,center))))};
 }
 function draw(){frame=null;const rect=canvas.getBoundingClientRect(),W=rect.width,H=rect.height,dpr=Math.min(devicePixelRatio||1,2);if(!W||!H)return;if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const ambient=ctx.createRadialGradient(W*.5,H*.45,5,W*.5,H*.45,W*.5);ambient.addColorStop(0,'#7fc0ad16');ambient.addColorStop(1,'#7fc0ad00');ctx.fillStyle=ambient;ctx.fillRect(0,0,W,H);
  if(!record||!bounds){drawSchematic(ctx,W,H,drug);return;}
  const site=record.ligand?.center||record.region?.center,center=focus&&site?site:bounds.center,radius=focus&&site?27:bounds.radius,scale=Math.min(W*.44,H*.43)/radius*zoom*(focus?1:1.25),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  function project(p){const[x,y,z]=sub(p,center),xx=x*cy+z*sy,zz=z*cy-x*sy,yy=y*cp-zz*sp;return[W/2+xx*scale,H*.48-yy*scale,y*sp+zz*cp];}
  const segments=geometry.map(g=>({...g,p:project(g.a),q:project(g.b)})).sort((a,b)=>(a.p[2]+a.q[2])-(b.p[2]+b.q[2]));ctx.lineJoin='round';ctx.lineCap='round';
  for(const g of segments){if((g.p[0]<-30&&g.q[0]<-30)||(g.p[0]>W+30&&g.q[0]>W+30)||(g.p[1]<-30&&g.q[1]<-30)||(g.p[1]>H+30&&g.q[1]>H+30))continue;const depth=clamp(((g.p[2]+g.q[2])*.5/radius+1)/2,0,1);
   if(g.vertices){const face=g.vertices.map(project),n=g.normal,nx=n[0]*cy+n[2]*sy,nz=n[2]*cy-n[0]*sy,ny=n[1]*cp-nz*sp,nzz=n[1]*sp+nz*cp,light=Math.abs(nx*-.32+ny*.47+nzz*.82),color=shade(g.color,.32+.35*depth+.4*light);ctx.beginPath();ctx.moveTo(...face[0].slice(0,2));for(const p of face.slice(1))ctx.lineTo(...p.slice(0,2));ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=.4;ctx.stroke();}
   else{ctx.beginPath();ctx.moveTo(...g.p.slice(0,2));ctx.lineTo(...g.q.slice(0,2));ctx.strokeStyle=shade(g.color,.35+.4*depth);ctx.lineWidth=clamp(scale*.5,.6,2.5);ctx.stroke();}
  }
  drawBindingOverlay(ctx,record,project,scale,W,H);
  const len=20*scale;if(len<W*.4){ctx.strokeStyle='#8cad9d77';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(22,H-25);ctx.lineTo(22+len,H-25);ctx.stroke();ctx.fillStyle='#8ead9e';ctx.font='9px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText('2 nm',22,H-10);}
 }
 canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});});
 canvas.addEventListener('pointermove',e=>{if(pointer?.id!==e.pointerId)return;yaw+=(e.clientX-pointer.x)*.008;pitch=clamp(pitch+(e.clientY-pointer.y)*.008,-1.5,1.5);pointer.x=e.clientX;pointer.y=e.clientY;mark();});
 const release=e=>{if(pointer?.id===e.pointerId){pointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}};canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',()=>pointer=null);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.5,3);mark();},{passive:false});
 canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')yaw-=.12;else if(e.key==='ArrowRight')yaw+=.12;else if(e.key==='ArrowUp')pitch=clamp(pitch-.12,-1.5,1.5);else if(e.key==='ArrowDown')pitch=clamp(pitch+.12,-1.5,1.5);else if(e.key==='+'||e.key==='=')zoom=clamp(zoom*1.15,.5,3);else if(e.key==='-')zoom=clamp(zoom/1.15,.5,3);else if(e.key==='Home'){yaw=.25;pitch=.12;zoom=1;}else return;e.preventDefault();e.stopPropagation();mark();});
 new ResizeObserver(mark).observe(canvas);
 return{set(next,item){record=next;drug=item;focus=false;zoom=1;yaw=.25;pitch=.12;compile();mark();},focus(value){focus=value;zoom=1;mark();},zoomBy(f){zoom=clamp(zoom*f,.5,3);mark();},reset(){yaw=.25;pitch=.12;zoom=1;focus=false;mark();},refresh:mark};
}

// Deliberately reduced educational models. Units and limitations are in the Sources panel.
export const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b,x));
export const smooth = x => {x=clamp(x);return x*x*(3-2*x);};
export const lerp = (a,b,t)=>a+(b-a)*t;

export function membraneState(p) {
  if (p<.16) return {vm:-90,phase:'rest',label:'Resting membrane'};
  if (p<.22) return {vm:lerp(-90,25,smooth((p-.16)/.06)),phase:'depolarization',label:'Na⁺ enters · depolarization'};
  if (p<.52) return {vm:lerp(25,5,(p-.22)/.30),phase:'plateau',label:'Ca²⁺ in, K⁺ out · plateau'};
  if (p<.78) return {vm:lerp(5,-90,smooth((p-.52)/.26)),phase:'repolarization',label:'K⁺ exits · repolarization'};
  return {vm:-90,phase:'rest',label:'Resting membrane'};
}

export function tissueState(p, recovery='reverse', uniform=false, count=41) {
  const cells=Array.from({length:count},(_,i)=>{
    const u=i/(count-1);
    const activation=.12+.27*u;
    const rec=.57+.20*(recovery==='reverse'?1-u:u);
    const a=smooth((p-activation)/.034);
    const r=smooth((p-rec)/.09);
    const fraction=uniform?smooth((p-.12)/.06)*(1-smooth((p-.58)/.15)):a*(1-r);
    return {x:(u-.5)*2, y:0, u,vm:-90+110*fraction, fraction, recovering:r>0&&r<1};
  });
  const edge=Array(count+1).fill(0);
  for(let i=0;i<count-1;i++) edge[i+1]=-(cells[i+1].vm-cells[i].vm);
  const sources=cells.map((c,i)=>({...c,I:edge[i]-edge[i+1]}));
  let dipole=sources.reduce((a,c)=>a+c.I*c.x,0);
  let phase=p<.12?'rest':p<.424?'depolarization':p<.57?'plateau':p<.86?'repolarization':'rest';
  if(uniform) phase=p<.12?'rest':p<.18?'depolarization':p<.58?'plateau':p<.73?'repolarization':'rest';
  return {cells,edge,sources,dipole,phase};
}

function rawPotential(sources,x,y) {
  let v=0;
  for (const c of sources) {
    // Three parallel strands form a small sheet. Softening avoids singular drawing pixels.
    for(const sy of [-.12,0,.12]) v+=c.I/(3*Math.sqrt((x-c.x)**2+(y-sy)**2+.06**2));
  }
  return v;
}
const reference=tissueState(.27).sources;
const fieldScale=.85/(rawPotential(reference,2.15,0)-rawPotential(reference,-2.15,0));
export function fieldPotential(sources,x,y){return rawPotential(sources,x,y)*fieldScale;}
export function leadState(p,angle=0,polarity=1,recovery='reverse',offset=0,uniform=false){
  const tissue=tissueState(p,recovery,uniform);
  const a=angle*Math.PI/180, r=2.15;
  const plus={x:r*Math.cos(a)*polarity,y:r*Math.sin(a)*polarity};
  const minus={x:-plus.x,y:-plus.y};
  const vp=fieldPotential(tissue.sources,plus.x,plus.y)+offset;
  const vn=fieldPotential(tissue.sources,minus.x,minus.y)+offset;
  return {...tissue,plus,minus,vp,vn,voltage:vp-vn};
}


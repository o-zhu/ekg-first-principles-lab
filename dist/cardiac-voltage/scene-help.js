import {tissueHelpAt,tissueHelpRegions} from './wave-help.js';

// Contextual canvas help also has keyboard- and touch-accessible HTML buttons.
// The overlay never captures ordinary plot clicks or tissue interactions.
export function createSceneHelp(canvas,getState){
  const host=canvas.parentElement;
  const layer=document.createElement('div');layer.className='scene-help-layer';layer.hidden=true;
  const tooltip=document.createElement('div');tooltip.className='scene-help-tooltip';tooltip.id='scene-context-help';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
  const title=document.createElement('strong'),body=document.createElement('p');tooltip.append(title,body);
  host.append(layer);document.body.append(tooltip);
  let activeId=null,pinned=false,timer=null,anchor=null,insideTooltip=false;
  const buttons=new Map();
  const active=()=>getState().chapter===1;
  function hide(){clearTimeout(timer);timer=null;activeId=null;pinned=false;tooltip.hidden=true;for(const b of buttons.values()){b.setAttribute('aria-expanded','false');b.removeAttribute('aria-describedby');}}
  function place(point){
    const width=tooltip.offsetWidth,height=tooltip.offsetHeight;
    const x=Math.max(12,Math.min(innerWidth-width-12,point.x-width/2));
    const preferred=point.y+18;
    const y=preferred+height<innerHeight-12?preferred:Math.max(12,point.y-height-18);
    tooltip.style.left=x+'px';tooltip.style.top=y+'px';
  }
  function show(region,point,keep=false){
    if(!active()||!region)return hide();
    clearTimeout(timer);timer=null;activeId=region.id;pinned=keep;anchor=point;
    title.textContent=region.title;body.textContent=region.body;tooltip.hidden=false;
    for(const [id,b] of buttons){b.setAttribute('aria-expanded',String(id===region.id));if(id===region.id)b.setAttribute('aria-describedby',tooltip.id);else b.removeAttribute('aria-describedby');}
    place(point);
  }
  function region(id){return tissueHelpRegions(getState()).find(r=>r.id===id);}
  function buttonPoint(b){const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};}
  function layout(){
    const r=canvas.getBoundingClientRect(),z=Math.min(r.width/1000,r.height/610);
    for(const item of tissueHelpRegions(getState())){
      const b=buttons.get(item.id);if(!b)continue;
      b.style.left=((r.width-1000*z)/2+item.anchorX*z)+'px';
      b.style.top=((r.height-610*z)/2+item.anchorY*z)+'px';
    }
    if(!tooltip.hidden&&anchor)place(anchor);
  }
  function refresh(){
    layer.hidden=!active();if(!active()){hide();return;}
    for(const item of tissueHelpRegions(getState())){
      if(buttons.has(item.id))continue;
      const b=document.createElement('button');b.type='button';b.className='scene-help-button';b.textContent='i';b.dataset.help=item.id;
      b.setAttribute('aria-label','About '+item.title.toLowerCase());b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls',tooltip.id);
      b.addEventListener('pointerenter',()=>{if(!pinned)show(region(item.id),buttonPoint(b));});
      b.addEventListener('pointerleave',()=>{if(!pinned&&!b.matches(':focus-visible')){clearTimeout(timer);timer=setTimeout(()=>{if(!insideTooltip)hide();},120);}});
      b.addEventListener('focus',()=>show(region(item.id),buttonPoint(b)));
      b.addEventListener('blur',()=>{if(!pinned&&!insideTooltip)hide();});
      b.addEventListener('click',()=>{if(pinned&&activeId===item.id)hide();else show(region(item.id),buttonPoint(b),true);});
      layer.append(b);buttons.set(item.id,b);
    }
    layout();
  }
  function update(){
    if(tooltip.hidden||!activeId)return;
    const item=region(activeId);if(!item)return hide();
    body.textContent=item.body;
    if(anchor)place(anchor);
  }
  canvas.addEventListener('pointermove',e=>{
    if(!active()||e.buttons||e.pointerType==='touch'){if(!pinned)hide();return;}
    if(pinned)return;
    const r=canvas.getBoundingClientRect(),z=Math.min(r.width/1000,r.height/610);
    const item=tissueHelpAt((e.clientX-r.left-(r.width-1000*z)/2)/z,(e.clientY-r.top-(r.height-610*z)/2)/z,getState());
    if(!item){hide();return;}
    if(activeId===item.id)return;
    clearTimeout(timer);timer=setTimeout(()=>show(item,{x:e.clientX,y:e.clientY}),350);
  });
  canvas.addEventListener('pointerdown',hide);
  canvas.addEventListener('pointerleave',()=>{if(!pinned){clearTimeout(timer);timer=setTimeout(()=>{if(!insideTooltip)hide();},120);}});
  tooltip.addEventListener('pointerenter',()=>{insideTooltip=true;clearTimeout(timer);});
  tooltip.addEventListener('pointerleave',()=>{insideTooltip=false;if(!pinned)hide();});
  document.addEventListener('pointerdown',e=>{if(!layer.contains(e.target)&&!tooltip.contains(e.target))hide();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!tooltip.hidden){hide();e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('scroll',()=>{if(!pinned)hide();},true);
  return {refresh,layout,hide,update};
}

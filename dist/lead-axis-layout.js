// A warm-started layout for the small names beside projected lead arrowheads.
// Labels move continuously with their anchors; no per-frame search among remote
// candidate slots. Pair contacts retain their separation direction until clear.
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const key=(a,b)=>a.id+'|'+b.id;

export function layoutLeadLabels(items,{width,height,obstacles=[]},previous=null){
  const signature=JSON.stringify([width,height,items,obstacles]);
  if(previous?.signature===signature)return previous;
  const margin=12,gapX=7,gapY=5;
  const constrain=p=>{
    p.x=clamp(p.x,margin+p.w/2,width-margin-p.w/2);
    p.y=clamp(p.y,margin+p.h/2,height-margin-p.h/2);
  };
  const positions=items.map(item=>{
    const old=previous?.positions.get(item.id);
    // Retain the previous offset from this same arrowhead, then gently release
    // displacement once space becomes available. Tiny view changes stay tiny.
    const x=old?old.x+item.anchorX-old.anchorX:item.x;
    const y=old?old.y+item.anchorY-old.anchorY:item.y;
    const travel=old?Math.hypot(item.anchorX-old.anchorX,item.anchorY-old.anchorY):0;
    const release=Math.min(.16,travel/64);
    const p={...item,x:x+(item.x-x)*release,y:y+(item.y-y)*release};
    constrain(p);return p;
  });
  const contacts=new Map();
  if(!previous){
    // Find a feasible starting arrangement once, on selection/preset changes.
    // Subsequent camera frames keep these names and move them continuously.
    // Candidate coordinates are adjacent to occupied rectangle edges, so even
    // a crowded corner has a nearby usable position without a long relaxation.
    const occupied=[...obstacles];
    for(const p of [...positions].sort((a,b)=>Number(!!b.focused)-Number(!!a.focused))){
      const xs=new Set([p.x,margin+p.w/2,width-margin-p.w/2]),ys=new Set([p.y,margin+p.h/2,height-margin-p.h/2]);
      for(const o of occupied){xs.add(o.x-(o.w+p.w)/2-gapX-.02);xs.add(o.x+(o.w+p.w)/2+gapX+.02);ys.add(o.y-(o.h+p.h)/2-gapY-.02);ys.add(o.y+(o.h+p.h)/2+gapY+.02);}
      const candidates=[];
      for(const x of xs)for(const y of ys)if(x>=margin+p.w/2&&x<=width-margin-p.w/2&&y>=margin+p.h/2&&y<=height-margin-p.h/2)candidates.push({x,y,distance:(x-p.x)**2+(y-p.y)**2});
      candidates.sort((a,b)=>a.distance-b.distance);
      const best=candidates.find(c=>occupied.every(o=>Math.abs(c.x-o.x)>=(p.w+o.w)/2+gapX||Math.abs(c.y-o.y)>=(p.h+o.h)/2+gapY));
      p.visible=!!best;if(best){p.x=best.x;p.y=best.y;occupied.push(p);}
    }
    return {positions:new Map(positions.map(p=>[p.id,p])),contacts,signature};
  }
  const separate=(a,b,fixed=false)=>{
    const dx=b.x-a.x,dy=b.y-a.y;
    const overlapX=(a.w+b.w)/2+gapX-Math.abs(dx);
    const overlapY=(a.h+b.h)/2+gapY-Math.abs(dy);
    const id=key(a,b);let old=contacts.get(id)||previous?.contacts.get(id);
    // Once labels pass each other without touching, their old ordering no
    // longer constrains a later contact. Keeping that obsolete sign would
    // force them to swap back suddenly when a small camera turn reunites them.
    if(old&&(old.axis==='x'?overlapY<=0:overlapX<=0)&&(old.axis==='x'?dx:dy)*old.sign<0){contacts.delete(id);old=null;}
    if(overlapX<=0||overlapY<=0){
      // A small dead band prevents a contact from changing sides when the
      // camera oscillates around a just-touching position.
      if(old&&overlapX>-12&&overlapY>-12)contacts.set(id,old);
      return false;
    }
    let axis=old?.axis||(overlapX<overlapY?'x':'y');
    let sign=old?.sign||((axis==='x'?dx:dy)>=0?1:-1);
    // A remembered contact is a preference, not a permanent lane. If two
    // labels graze on their other edges later, use that much smaller correction
    // instead of snapping them sideways to restore an obsolete contact axis.
    const remembered=axis==='x'?(a.w+b.w)/2+gapX-sign*dx:(a.h+b.h)/2+gapY-sign*dy;
    if(old&&remembered>Math.min(overlapX,overlapY)+4){axis=overlapX<overlapY?'x':'y';sign=(axis==='x'?dx:dy)>=0?1:-1;}
    const amount=(axis==='x'?(a.w+b.w)/2+gapX-sign*dx:(a.h+b.h)/2+gapY-sign*dy)+.01;
    const move=amount/(fixed?1:2);
    a[axis]-=sign*move;if(!fixed)b[axis]+=sign*move;
    constrain(a);if(!fixed)constrain(b);
    contacts.set(id,{axis,sign});return true;
  };
  // Position-based constraints need no force/velocity integration, so a paused
  // model settles in the same update and never jitters while its camera rests.
  for(let pass=0;pass<64;pass++){
    let changed=false;
    for(let i=0;i<positions.length;i++){
      for(const obstacle of obstacles)changed=separate(positions[i],obstacle,true)||changed;
      for(let j=i+1;j<positions.length;j++)changed=separate(positions[i],positions[j])||changed;
    }
    if(!changed)break;
  }
  // If a very small viewport has no room for every caption, keep a clear
  // focused name and the arrows rather than draw names on top of one another.
  // This is only a last resort after geometric separation, not a frame-by-frame
  // priority reshuffle. Hidden names re-enter only with a little extra space.
  const accepted=[];
  const overlaps=(a,b,pad=0)=>Math.abs(a.x-b.x)<(a.w+b.w)/2+pad&&Math.abs(a.y-b.y)<(a.h+b.h)/2+pad;
  for(const p of [...positions].sort((a,b)=>Number(!!b.focused)-Number(!!a.focused))){
    const pad=previous?.positions.get(p.id)?.visible===false?5:1;
    p.visible=!obstacles.some(o=>overlaps(p,o,pad))&&!accepted.some(o=>overlaps(p,o,pad));
    if(p.visible)accepted.push(p);
  }
  return {positions:new Map(positions.map(p=>[p.id,p])),contacts,signature};
}

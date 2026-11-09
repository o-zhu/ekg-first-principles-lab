// Plot coordinates are CSS pixels (or the renderer's shared virtual space).
// The renderer supplies its actual bounds and normalized time window, so
// labels, margins and cropped comparison axes never distort seek positions.
export function progressAtPlotPoint(plot,x,y,{dragging=false}={}){
  if(!plot||!(plot.w>0)||!(plot.h>0)||!Number.isFinite(x)||!Number.isFinite(y))return null;
  if(!dragging&&(x<plot.x||x>plot.x+plot.w||y<plot.y||y>plot.y+plot.h))return null;
  const fraction=Math.max(0,Math.min(1,(x-plot.x)/plot.w));
  return (plot.start??0)+fraction*((plot.end??1)-(plot.start??0));
}

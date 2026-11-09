// Display cropping is independent of the stored scientific model clock.
// The source data retain their original samples and action-potential timing.
const clamp01=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
export function heartDataDuration(d){
  if(d&&Number.isFinite(d.frames)&&Number.isFinite(d.dt))return Math.max(1,(d.frames-1)*d.dt);
  return Math.max(1,d?.duration||1000);
}
export function heartDisplayDuration(d,s){
  const recorded=s?.heartMode==='measured'||!!d?.mask;
  return recorded?heartDataDuration(d):Math.min(800,heartDataDuration(d));
}
export function heartDataProgress(d,s,p=s?.progress??0){
  return clamp01(p)*heartDisplayDuration(d,s)/heartDataDuration(d);
}
export function heartDisplayProgress(d,s,timeMs){
  return clamp01(timeMs/heartDisplayDuration(d,s));
}

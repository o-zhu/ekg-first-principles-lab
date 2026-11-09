/** Calibrated, common scales for the original clinical recordings. */
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
export const CLINICAL_GRID_MM_PX=5;

/** Every lead shows the same stationary interval. Only a page boundary moves it. */
export function clinicalWindow(record,time=0,requestedSeconds=2.5){
  const total=Math.max(1/(record.fs||500),Number(record.seconds)||0);
  const seconds=Number(requestedSeconds)>0?Math.min(total,Number(requestedSeconds)):total;
  const count=Math.max(1,Math.ceil(total/seconds-1e-10));
  const index=clamp(Math.floor(clamp(time,0,Math.max(0,total-1e-9))/seconds),0,count-1);
  const start=index*seconds,end=Math.min(total,start+seconds);
  return {start,end,duration:end-start,index,count,pageSeconds:seconds,total};
}

/**
 * Original mV values, one gain and one zero line across all panels. Full-record
 * extrema keep the scale and row height stable while paging and prevent even
 * isolated artifacts / large pathological complexes from being silently cut.
 */
export function clinicalGridScale(record,leads,gain=10){
  let low=0,high=0;
  for(const lead of leads)for(const value of record.signals?.[lead]||[]){
    if(Number.isFinite(value)){low=Math.min(low,value);high=Math.max(high,value);}
  }
  const pxPerMV=CLINICAL_GRID_MM_PX*gain;
  // ECGChart compact margins are 10 px above and 14 px below the plot. An
  // additional 24 px at either extreme leaves room for the lead name and ink.
  const height=Math.ceil(Math.max(168,(high-low)*pxPerMV+72));
  const plotHeight=height-24;
  const baselineFraction=(high*pxPerMV+(plotHeight-(high-low)*pxPerMV)/2)/plotHeight;
  return {gain,mmPx:CLINICAL_GRID_MM_PX,pxPerMV,height,baselineFraction,low,high};
}

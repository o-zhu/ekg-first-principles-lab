/**
 * A fast-pathway event is distinct from the myocardium's current beat clock.
 * His activation begins before QRS onset, while the previous myocardium may
 * still be recovering. Select only an explicitly scheduled / annotated event;
 * never extrapolate a new beat from the final RR interval.
 */
export const CONDUCTION_EVENT_LOOKAHEAD=.055;
const ventricularOrigins=new Set(['vt','torsades','ventricular-ectopy','vf']);

export function conductionEventAt(ventricles,time,atria=[]){
  let selected=null;
  for(const candidate of ventricles){
    const onset=candidate.onset??candidate.qrsOnset;
    if(onset<=time+CONDUCTION_EVENT_LOOKAHEAD)selected=candidate;else break;
  }
  if(!selected)return null;
  const v=selected,onset=v.onset??v.qrsOnset,f=v.timing||v;
  const a=atria.find(p=>p.conducted&&Number.isFinite(p.linkedQrsOnset)&&
    Math.abs(p.linkedQrsOnset-onset)<1e-7&&(v.atrialId==null||v.atrialId===p.id));
  const atrialEvent=a?{id:a.id,onset:a.onset,relativeTime:time-a.onset,pStart:0,pEnd:a.duration,
    duration:a.duration,conducted:true,dropped:false,blockedByAv:false,
    pr:a.pr??onset-a.onset,plannedPR:a.plannedPR??a.pr??onset-a.onset,linkedQrsOnset:onset}:null;
  return {
    id:v.id??'ventricular-'+v.index,onset,relativeTime:time-onset,
    qrsStart:0,qrsEnd:v.qrsDuration??f.qrsEnd??.09,tStart:f.tStart??.20,tEnd:f.tEnd??v.qt??.38,
    lvDelay:v.lvDelay??0,rvDelay:v.rvDelay??.008,
    ectopic:!!v.ectopic,escape:!!v.escape,escapeOrigin:v.escapeOrigin||null,
    suppressNormalVentricularConduction:ventricularOrigins.has(v.kind),
    atrialId:atrialEvent?.id??v.atrialId??null,pr:atrialEvent?.pr??v.pr??null,atrialEvent,
  };
}

// Qualitative teaching curves, deliberately not a calibrated drug or patient model.
// The numerical shape parameters serve legibility; strength is NOT concentration.
export const PHARM_DURATION=800;
const clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a,b,x)=>a+(b-a)*smooth(x);
const IA=new Set(['quinidine','procainamide','disopyramide']);
const IB=new Set(['lidocaine','mexiletine']);
const IC=new Set(['flecainide','propafenone']);
const BETA=new Set(['esmolol','metoprolol','atenolol','propranolol']);
const III=new Set(['dofetilide','sotalol','amiodarone','dronedarone','ibutilide']);
const CALCIUM=new Set(['verapamil','diltiazem']);
export function defaultAPMode(drug){return drug?.apMode?.startsWith('nodal')?'nodal':'ventricular';}

export function illustrativeAP(drugId,t,strength=0,mode='ventricular'){
 const s=clamp(strength),isBeta=BETA.has(drugId),isCa=CALCIUM.has(drugId),isMulti=['sotalol','amiodarone','dronedarone'].includes(drugId);
 if(mode==='nodal'){
  const directNode=isBeta||isCa||isMulti||drugId==='adenosine'||drugId==='digoxin';
  const effect=directNode?s:0,period=420*(1+effect*(drugId==='adenosine'?.9:.54));
  const vmin=-61-(drugId==='adenosine'?effect*11:0),up=28+(isCa?effect*36:isMulti?effect*14:0),phase4=220+(period-420)*.82;
  const tt=((t%period)+period)%period;
  // At the strongest adenosine setting a nodal impulse fails to reach threshold.
  // This is an illustrative AV nodal pause, not sinus arrest or atrial silence.
  if(drugId==='adenosine'&&s>.82)return vmin+15*Math.sin(Math.PI*Math.min(1,tt/period))**2;
  if(tt<phase4)return vmin+(-39-vmin)*(tt/phase4)**1.15;
  if(tt<phase4+up)return mix(-39,8-effect*(isCa?9:3),(tt-phase4)/up);
  if(tt<phase4+up+112)return mix(8-effect*(isCa?9:3),vmin,(tt-phase4-up)/112);
  return vmin;
 }
 let rise=3,apd=292,peak=31,plateau=13;
 if(IA.has(drugId)){rise+=s*14;peak-=s*7;apd*=1+.32*s;}
 if(IB.has(drugId)){rise+=s*2;peak-=s*2;apd*=1-.16*s;}
 if(IC.has(drugId)){rise+=s*26;peak-=s*9;}
 if(III.has(drugId))apd*=1+s*(drugId==='dronedarone'?.28:.48);
 if(['amiodarone','dronedarone'].includes(drugId)){rise+=s*6;plateau-=s*4;}
 if(isCa)plateau-=s*5;
 if(drugId==='digoxin')apd*=1-.1*s;
 // A prolonged baseline with an EAD is used only for the magnesium example.
 if(drugId==='magnesium')apd=420;
 const u=t-45;
 let v;
 if(u<0)v=-88;
 else if(u<rise)v=mix(-88,peak,u/rise);
 else if(u<rise+12)v=mix(peak,plateau,(u-rise)/12);
 else if(u<apd*.65)v=plateau-(plateau+3)*(u-rise-12)/(apd*.65-rise-12);
 else if(u<apd)v=mix(-3,-88,(u-apd*.65)/(apd*.35));
 else v=-88;
 if(drugId==='magnesium'&&u>150&&u<420)v+=30*(1-.82*s)*Math.exp(-(((u-320)/28)**2));
 return v;
}

export function apPhase(t,mode,drugId,strength){
 if(mode==='nodal')return drugId==='adenosine'&&strength>.82?'Illustrative nodal pause':'Nodal pacing and calcium-dependent excitation';
 if(t<45)return 'Resting membrane';
 if(t<80)return 'Phase 0 · the fast upstroke';
 if(t<245)return 'Plateau · competing inward and outward currents';
 if(t<480)return drugId==='magnesium'?'Recovery · suppressing a triggered oscillation':'Repolarization · returning toward rest';
 return 'Resting membrane';
}

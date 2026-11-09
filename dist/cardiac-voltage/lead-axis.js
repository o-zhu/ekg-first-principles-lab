// Geometric electrode-reference axis in the same millimetre coordinates as
// the anatomical mesh. This is an explanatory direction, not the spatially
// varying reciprocal lead field used by the forward calculation.
const mean=points=>[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/points.length);
const limbNames={RA:'right arm',LA:'left arm',LL:'left leg'};

export function leadAxisDefinition(data,lead='II',polarity=1){
  const e=data.virtualElectrodes||data.operators?.torso?.electrodePositionsMm;
  if(!e)return null;
  let positive,negative,positiveLabel,negativeLabel;
  const pair={I:['LA','RA'],II:['LL','RA'],III:['LL','LA']}[lead];
  if(pair){
    [positive,negative]=pair.map(k=>e[k]);
    [positiveLabel,negativeLabel]=pair.map(k=>limbNames[k]);
  }else if(['aVR','aVL','aVF'].includes(lead)){
    const name={aVR:'RA',aVL:'LA',aVF:'LL'}[lead],others=['RA','LA','LL'].filter(k=>k!==name);
    if(others.some(k=>!e[k]))return null;
    positive=e[name];negative=mean(others.map(k=>e[k]));
    positiveLabel=limbNames[name];negativeLabel='limb reference';
  }else if(/^V[1-6]$/.test(lead)){
    if(['RA','LA','LL'].some(k=>!e[k]))return null;
    positive=e['C'+lead.slice(1)];negative=mean(['RA','LA','LL'].map(k=>e[k]));
    positiveLabel=lead;negativeLabel='Wilson reference';
  }else return null;
  if(!positive||!negative)return null;
  if(polarity<0){[positive,negative]=[negative,positive];[positiveLabel,negativeLabel]=[negativeLabel,positiveLabel];}
  const vector=positive.map((v,k)=>v-negative[k]),length=Math.hypot(...vector);
  if(!(length>1e-8))return null;
  return {lead,positive,negative,positiveLabel,negativeLabel,direction:vector.map(v=>v/length),reversed:polarity<0};
}

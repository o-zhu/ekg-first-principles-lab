/** Native-source evaluator for the offline, lead-field ECG fits.
 * Rendered Vm is interpolated AFTER evaluating each source action potential.
 * The ECG itself is the offline volume-conductor integral, not a sum of pixels.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let basePromise;
export function loadFitBase(){
  return basePromise??=(async()=>{
    const response=await fetch(new URL('./cardiac-voltage/data/heart-model.json',import.meta.url));
    if(!response.ok)throw Error('The reference heart model could not load.');
    return response.json();
  })().catch(error=>{basePromise=null;throw error;});
}

export class FittedField {
  constructor(base,fit,approach=null){
    this.base=base;this.fit=fit;this.geometry=base.geometry;
    this.indices=base.field.renderIndices;this.weights=base.field.renderWeights;
    this.nodeCount=base.renderNodeCount||base.nodeCount;
    this.sourceValues=new Float32Array(base.field.sourceGlobalIds.length);
    this.sourceSlopes=new Float32Array(this.sourceValues.length);
    this.voltage=new Float32Array(this.nodeCount);this.values=new Float32Array(this.nodeCount);
    this.nodeAT=new Float32Array(this.nodeCount);this.nodeAPD=new Float32Array(this.nodeCount);
    this.nodeRT=new Float32Array(this.nodeCount);this.nodeLesion=new Float32Array(this.nodeCount);
    this.setApproach(approach);
  }
  setApproach(approach){
    this.field=approach?.field||this.fit.field;
    const f=this.field,b=this.base;
    this.at=f.sourceActivationMs;this.apd=f.sourceApd90Ms;
    this.rest=f.sourceRestMv;this.amplitude=f.sourceAmplitudeMv;
    this.plateauShape=f.sourcePlateauFraction||f.sourcePlateauGamma||null;
    this.plateauShapeFamily=f.plateauShapeFamily||'rational';
    this.type=f.sourceType||b.field.sourceType;
    this.lesion=f.sourceLesionWeight||f.lesionWeight||[];
    this.templates=approach?.templates||this.fit.templates||b.templates;
    this.templateRestAge={};
    for(const key of ['ventricular','atrial']){const t=this.templates[key];let i=t.normalized.length-1;while(i>0&&t.normalized[i]<=0)i--;this.templateRestAge[key]=(i+1)*t.dtMs-t.activationMs;}
    this.rr=this.fit.rrMs||this.fit.periodMs||1000;
    this.cycles=f.neighboringBeatCycles||this.fit.neighboringBeatCycles||[-1,0,1];
    this.eventStreams=f.temporalMode==='event-schedule'?(f.eventStreams||[]):null;
    this.sourceChamber=f.sourceChamber||null;this.sourceRegion=f.sourceRegion||null;
    if(!Array.isArray(this.at)||this.at.length!==this.sourceValues.length)throw Error('Fitted source indices do not match the reference mesh.');
    for(const key of ['apd','rest','amplitude'])if(!this[key]||this[key].length!==this.at.length)throw Error('The fitted source field is incomplete.');
    for(let n=0;n<this.nodeCount;n++){
      let at=0,apd=0,lesion=0;
      for(let j=0;j<4;j++){const k=n*4+j,s=this.indices[k],w=this.weights[k];at+=w*this.at[s];apd+=w*this.apd[s];lesion+=w*(this.lesion[s]||0);}
      this.nodeAT[n]=at;this.nodeAPD[n]=apd;this.nodeRT[n]=at+apd;this.nodeLesion[n]=lesion;
    }
    this.ranges={voltage:[-85,25],fronts:[-1,1],activation:finiteRange(this.nodeAT),recovery:finiteRange(this.nodeRT),apd:finiteRange(this.nodeAPD),injury:[0,1]};
    this.lastTime=null;this.lastView=null;
  }
  normalizedAP(age,apd,type,shape=1){
    const t=this.templates[type?'atrial':'ventricular'],anchor=t.warpAnchorMs??4;
    let warped=age<=anchor?age:anchor+(age-anchor)*(t.apd90Ms-anchor)/Math.max(1,apd-anchor);
    const early=type===0&&this.plateauShapeFamily==='early-plateau';
    if(early&&age>apd){const rest=this.templateRestAge.ventricular,span=rest-t.apd90Ms;if(warped<rest){const h=(shape-.1)/.9,v=clamp((warped-t.apd90Ms)/span,0,1);warped=t.apd90Ms+span*(h*v+(1-h)*(2*v*v-v*v*v));}}
    else if(!early&&age>anchor&&shape!==1){const u=(age-anchor)/Math.max(1,apd-anchor),w=u<=1?u/(shape+(1-shape)*u):1+shape*(u-1);warped=anchor+w*(t.apd90Ms-anchor);}
    const index=(warped+t.activationMs)/t.dtMs,a=t.normalized;
    if(index<0||index>a.length-1)return 0;
    const i=Math.floor(index),u=index-i;let q=a[i]*(1-u)+a[Math.min(i+1,a.length-1)]*u;
    if(early&&age>anchor&&age<=apd){const h=(shape-.1)/.9,v=clamp((age-anchor)/(30-anchor),0,1);q=.1+(q-.1)*(1-(1-h)*v*v*(3-2*v));}
    return q;
  }
  sourceAt(source,time){
    let excursion=0;
    if(this.eventStreams){
      for(const stream of this.eventStreams){
        if(stream.type!==this.type[source]||(stream.chamber!==undefined&&stream.chamber!==this.sourceChamber?.[source])||(stream.region!==undefined&&stream.region!==this.sourceRegion?.[source]))continue;
        const at=stream.sourceActivationMs?.[source]??this.at[source],apd=stream.sourceApd90Ms?.[source]??this.apd[source];
        if(stream.periodMs){
          const period=stream.periodMs,phase=((time%period)+period)%period;
          for(const k of [-1,0,1])excursion+=this.normalizedAP(phase-at-k*period,apd,this.type[source],this.plateauShape?.[source]??1);
        }else{
          for(const event of stream.eventsMs||[]){
            const age=time-event-at;if(age < -12||age > 1400)continue;
            excursion+=this.normalizedAP(age,apd,this.type[source],this.plateauShape?.[source]??1);
          }
        }
      }
    }else for(const k of this.cycles)excursion+=this.normalizedAP(time-this.at[source]-k*this.rr,this.apd[source],this.type[source],this.plateauShape?.[source]??1);
    return this.rest[source]+this.amplitude[source]*excursion;
  }
  voltageAtNode(node,time){
    let vm=0;for(let j=0;j<4;j++){const k=node*4+j;vm+=this.weights[k]*this.sourceAt(this.indices[k],time);}return vm;
  }
  sample(time,view='voltage'){
    if(this.lastTime===time&&this.lastView===view)return this.values;
    const dynamic=view==='voltage'||view==='fronts';
    if(dynamic){
      for(let s=0;s<this.sourceValues.length;s++){
        this.sourceValues[s]=this.sourceAt(s,time);
        if(view==='fronts')this.sourceSlopes[s]=(this.sourceAt(s,time+1.5)-this.sourceAt(s,time-1.5))/3;
      }
      for(let n=0;n<this.nodeCount;n++){
        let vm=0;for(let j=0;j<4;j++){const k=n*4+j;vm+=this.weights[k]*this.sourceValues[this.indices[k]];}this.voltage[n]=vm;
        if(view==='voltage')this.values[n]=clamp((vm+85)/110,0,1);
        else{
          let slope=0;for(let j=0;j<4;j++){const k=n*4+j;slope+=this.weights[k]*this.sourceSlopes[this.indices[k]];}
          this.values[n]=slope>=0?clamp(slope/18,0,1):-clamp(-slope/1.1,0,1);
        }
      }
    }else{
      const arr={activation:this.nodeAT,recovery:this.nodeRT,apd:this.nodeAPD,injury:this.nodeLesion}[view]||this.nodeAT;
      const [low,high]=this.ranges[view]||this.ranges.activation;
      for(let n=0;n<this.nodeCount;n++)this.values[n]=clamp((arr[n]-low)/Math.max(.001,high-low),0,1);
    }
    this.lastTime=time;this.lastView=view;return this.values;
  }
  nodeInfo(node,time){
    const chamber=({1:'Left ventricle',2:'Right ventricle',3:'Left atrium',4:'Right atrium'})[this.base.nodes.chamber[node]]||'Myocardium';
    return {node,chamber,voltage:this.voltageAtNode(node,time),activation:this.nodeAT[node],apd:this.nodeAPD[node],recovery:this.nodeRT[node],lesion:this.nodeLesion[node]};
  }
}

function finiteRange(values){
  let low=Infinity,high=-Infinity;for(const v of values)if(Number.isFinite(v)&&Math.abs(v)<10000){low=Math.min(low,v);high=Math.max(high,v);}
  return Number.isFinite(low)?[Math.floor(low/10)*10,Math.ceil(high/10)*10]:[0,1];
}

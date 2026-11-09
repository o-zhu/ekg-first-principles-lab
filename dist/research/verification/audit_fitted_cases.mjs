import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.argv[2]||path.join(here,'../..'));
const {FittedField}=await import(pathToFileURL(path.join(root,'fit-model.js')));
const base=JSON.parse(fs.readFileSync(path.join(root,'cardiac-voltage/data/heart-model.json'),'utf8'));
const records=new Map();
for(const f of fs.readdirSync(path.join(root,'data')).filter(x=>/^clinical.*\.json$/.test(x))){for(const r of JSON.parse(fs.readFileSync(path.join(root,'data',f),'utf8')).records||[])records.set(r.id,r);}
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const output=process.argv[3]||path.join(here,'fitted-case-audit.json');
const modelHash=hash(fs.readFileSync(path.join(root,'fit-model.js')));
const verifierHash=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
const baseHash=hash(fs.readFileSync(path.join(root,'cardiac-voltage/data/heart-model.json')));
const recordHash=hash(Buffer.concat(fs.readdirSync(path.join(root,'data')).filter(x=>/^clinical.*\.json$/.test(x)).sort().map(f=>fs.readFileSync(path.join(root,'data',f)))));
let previous;try{previous=JSON.parse(fs.readFileSync(output,'utf8'));}catch{}
const report={generatedAt:new Date().toISOString(),verifierSha256:verifierHash,evaluatorSha256:modelHash,baseModelSha256:baseHash,clinicalSourceSha256:recordHash,expectedDisplaySources:base.field.sourceGlobalIds.length,cases:[],parsePending:[]};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/pathology-fits/manifest.json'),'utf8'));
report.expectedCaseCount=manifest.cases.length;
report.manifestSha256=hash(fs.readFileSync(path.join(root,'data/pathology-fits/manifest.json')));
const good=x=>typeof x==='number'&&Number.isFinite(x);
function metric(a,b,time,leads,window){let n=0,se=0;for(const l of leads)for(let i=0;i<time.length;i++)if((!window||(time[i]>=window[0]&&time[i]<=window[1]))&&good(a?.[l]?.[i])&&good(b?.[l]?.[i])){n++;se+=(a[l][i]-b[l][i])**2;}return {rmse:n?Math.sqrt(se/n):null,n};}
function maxError(a,b){let max=0;for(let i=0;i<a.length;i++)if(good(a[i])&&good(b[i]))max=Math.max(max,Math.abs(a[i]-b[i]));return max;}
for(const name of fs.readdirSync(path.join(root,'data/pathology-fits/cases')).filter(x=>x.endsWith('.json')).sort()){
 let fit,bytes;try{bytes=fs.readFileSync(path.join(root,'data/pathology-fits/cases',name));fit=JSON.parse(bytes.toString('utf8'));}catch{report.parsePending.push(name);continue;}
 const sourceHash=hash(bytes),cached=previous?.cases.find(c=>c.id===fit.recordId&&c.sourceSha256===sourceHash);
 if(cached&&previous.evaluatorSha256===modelHash&&previous.verifierSha256===verifierHash&&previous.baseModelSha256===baseHash&&previous.clinicalSourceSha256===recordHash){report.cases.push(cached);continue;}
 const r=records.get(fit.recordId),time=fit.timeMs||fit.ecg.timeMs,obs=fit.ecg.observed,leads=fit.availableLeads||Object.keys(obs),ind=fit.independentLeads||['I','II','V1','V2','V3','V4','V5','V6'];
 const out={id:fit.recordId,sourceSha256:sourceHash,reconstructed:!!fit.reconstructed,timeReference:fit.timeReference||'r-anchor',timeSamples:time.length,timeRange:[time[0],time.at(-1)],nativeFs:fit.target?.nativeFs,originalFs:r?.fs,leads,issues:[],approaches:[]};
 if(r&&JSON.stringify([...leads].sort())!==JSON.stringify(Object.keys(r.signals).sort()))out.issues.push('Available channels differ from original record');
 if(r&&fit.reconstructed&&fit.target?.nativeFs!==r.fs)out.issues.push('Native sampling metadata differs from original');
 if(time.some((v,i)=>!good(v)||(i&&v<=time[i-1])))out.issues.push('Invalid/nonmonotonic time axis');
 for(const l of leads)if(obs[l]?.length!==time.length)out.issues.push(`Observed length mismatch ${l}`);
 const approaches=fit.approaches?.filter(a=>a.field)||[{id:'selected',field:fit.field,ecg:fit.ecg.predicted}];
 for(const a of approaches){
  const f=a.field||fit.field,sub={id:a.id,fieldLengths:{},sourceRange:[Infinity,-Infinity],nodeRange:[Infinity,-Infinity],sourceNonfinite:0,nodeNonfinite:0,issues:[]};
  for(const k of ['sourceActivationMs','sourceApd90Ms','sourceRestMv','sourceAmplitudeMv','sourceLesionWeight','sourceType','sourceChamber','sourceRegion']){sub.fieldLengths[k]=f[k]?.length;if(f[k]&&f[k].length!==report.expectedDisplaySources)sub.issues.push(`Wrong source field length: ${k}`);if(f[k]?.some(v=>!good(v)))sub.issues.push(`Nonfinite source field: ${k}`);}
  for(const k of ['sourceActivationMs','sourceApd90Ms','sourceRestMv','sourceAmplitudeMv','sourceType'])if(!f[k])sub.issues.push(`Missing required source field: ${k}`);
  for(const stream of f.eventStreams||[]){
   if(stream.chamber!==undefined&&!f.sourceChamber)sub.issues.push('Chamber stream has no sourceChamber map');
   if(stream.region!==undefined&&!f.sourceRegion)sub.issues.push('Region stream has no sourceRegion map');
   if(stream.periodMs!==undefined&&(!good(stream.periodMs)||stream.periodMs<=0))sub.issues.push('Invalid period');
   for(const key of ['sourceActivationMs','sourceApd90Ms'])if(stream[key]&&(stream[key].length!==report.expectedDisplaySources||stream[key].some(v=>!good(v))))sub.issues.push('Invalid event stream source override');
  }
  try{
   const evaluator=new FittedField(base,fit,a);
   const samples=new Set(Array.from({length:17},(_,i)=>time[0]+(time.at(-1)-time[0])*i/16));
   for(const stream of f.eventStreams||[]){for(const t of (stream.eventsMs||[]).filter(t=>t>=time[0]&&t<=time.at(-1)).slice(0,10))for(const dt of [0,40,150])if(t+dt<=time.at(-1))samples.add(t+dt);}
   for(const t of samples){
    evaluator.sample(t,'voltage');
    for(const v of evaluator.sourceValues){if(!good(v))sub.sourceNonfinite++;else{sub.sourceRange[0]=Math.min(sub.sourceRange[0],v);sub.sourceRange[1]=Math.max(sub.sourceRange[1],v);}}
    for(const v of evaluator.voltage){if(!good(v))sub.nodeNonfinite++;else{sub.nodeRange[0]=Math.min(sub.nodeRange[0],v);sub.nodeRange[1]=Math.max(sub.nodeRange[1],v);}}
   }
   sub.timePointsTested=samples.size;
   for(const view of ['fronts','activation','recovery','apd','injury']){const values=evaluator.sample(time[Math.floor(time.length/2)],view);if(values.some(v=>!good(v)))sub.issues.push(`Nonfinite rendered view: ${view}`);}
   if(sub.sourceRange[0]<-150||sub.sourceRange[1]>80)sub.issues.push('Source voltage outside broad physiological screening range [-150,80] mV');
   if(sub.nodeRange[0]<-150||sub.nodeRange[1]>80)sub.issues.push('Rendered voltage outside broad physiological screening range [-150,80] mV');
   if(sub.sourceNonfinite||sub.nodeNonfinite)sub.issues.push('Nonfinite evaluated membrane voltage');
  }catch(e){sub.issues.push('Evaluator error: '+e.message);}
  const pred=a.ecg?.predicted||a.ecg||a.predicted||fit.ecg.predicted;
  for(const l of leads)if(pred?.[l]?.length!==time.length||pred[l]?.some(v=>!good(v)))sub.issues.push(`Invalid predicted channel: ${l}`);
  sub.training=metric(fit.ecg.train||obs,pred,time,ind,fit.trainingWindowMs||fit.target?.analysisWindowMs);
  sub.heldOut=metric(fit.ecg.heldOut,pred,time,ind,fit.heldOutWindowMs||fit.target?.analysisWindowMs);
  const storedTrain=a.metrics?.training?.wholeBeat?.independentLeadRmseMv,storedTest=a.metrics?.heldOut?.wholeBeat?.independentLeadRmseMv;
  if(good(storedTrain)&&Math.abs(storedTrain-sub.training.rmse)>2e-5)sub.issues.push(`Stored training RMSE mismatch: stored=${storedTrain}, actual=${sub.training.rmse}`);
  if(good(storedTest)&&Math.abs(storedTest-sub.heldOut.rmse)>2e-5)sub.issues.push(`Stored held-out RMSE mismatch: stored=${storedTest}, actual=${sub.heldOut.rmse}`);
  if(leads.includes('I')&&leads.includes('II')){
   const expected={III:pred.II.map((x,i)=>x-pred.I[i]),aVR:pred.II.map((x,i)=>-(x+pred.I[i])/2),aVL:pred.I.map((x,i)=>x-pred.II[i]/2),aVF:pred.II.map((x,i)=>x-pred.I[i]/2)};
   sub.limbIdentityMaxErrorMv=Math.max(...Object.keys(expected).filter(k=>pred[k]).map(k=>maxError(pred[k],expected[k])));
   if(sub.limbIdentityMaxErrorMv>5e-6)sub.issues.push('Predicted limb-lead identity error exceeds rounding tolerance');
  }
  sub.temporalMode=f.temporalMode||'periodic';
  sub.streams=(f.eventStreams||[]).map(s=>({type:s.type,chamber:s.chamber,region:s.region,periodMs:s.periodMs,eventCount:s.eventsMs?.length,eventsPreview:s.eventsMs?.slice(0,8),activationOverrideLength:s.sourceActivationMs?.length,apdOverrideLength:s.sourceApd90Ms?.length}));
  out.approaches.push(sub);
 }
 report.cases.push(out);
}
report.failed=report.cases.filter(c=>c.issues.length||c.approaches.some(a=>a.issues.length)).map(c=>c.id);
report.coverageIssues=[];
for(const c of manifest.cases)if(!report.cases.some(r=>r.id===c.recordId))report.coverageIssues.push(`Missing manifest case ${c.recordId}`);
for(const c of report.cases)if(!manifest.cases.some(r=>r.recordId===c.id))report.coverageIssues.push(`Unlisted case ${c.id}`);
report.pass=!report.failed.length&&!report.parsePending.length&&!report.coverageIssues.length;
fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({caseCount:report.cases.length,failed:report.failed,parsePending:report.parsePending,coverageIssues:report.coverageIssues,pass:report.pass,issues:report.cases.filter(c=>c.issues.length||c.approaches.some(a=>a.issues.length)).map(c=>({id:c.id,issues:c.issues,approaches:c.approaches.filter(a=>a.issues.length).map(a=>({id:a.id,issues:a.issues,sourceRange:a.sourceRange,nodeRange:a.nodeRange}))}))},null,2));
process.exitCode=report.pass?0:1;

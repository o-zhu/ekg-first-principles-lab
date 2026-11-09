import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const output=process.argv[3];if(!output)throw Error('Output path is required');
const {FittedField}=await import(pathToFileURL(path.join(root,'fit-model.js')));
const base=JSON.parse(fs.readFileSync(path.join(root,'cardiac-voltage/data/heart-model.json'),'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const fixture={evaluatorSha256:hash(fs.readFileSync(path.join(root,'fit-model.js'))),cases:[]};
for(const name of fs.readdirSync(path.join(root,'data/pathology-fits/cases')).filter(n=>n.endsWith('.json')).sort()){
 const bytes=fs.readFileSync(path.join(root,'data/pathology-fits/cases',name)),fit=JSON.parse(bytes),time=fit.timeMs||fit.ecg.timeMs;
 const test={id:fit.recordId,sourceSha256:hash(bytes),approaches:[]};
 for(const a of fit.approaches.filter(a=>a.field)){
  const field=new FittedField(base,fit,a),f=field.field;
  const sourceIds=new Set(Array.from({length:48},(_,i)=>Math.floor((field.at.length-1)*i/47)));
  for(const arr of [f.sourceType,f.sourceChamber,f.sourceRegion])if(arr)for(const group of new Set(arr)){
   const ids=arr.map((v,i)=>v===group?i:-1).filter(i=>i>=0);for(const q of [0,.3,.7,1])sourceIds.add(ids[Math.floor((ids.length-1)*q)]);
  }
  const ids=[...sourceIds].sort((a,b)=>a-b);
  const times=new Set(Array.from({length:17},(_,i)=>time[0]+(time.at(-1)-time[0])*i/16));
  for(const s of ids.slice(0,12))for(const dt of [-1,4,40,field.apd[s],field.apd[s]+40]){
   let t=field.at[s]+dt;if(t>=time[0]&&t<=time.at(-1))times.add(t);
  }
  for(const stream of f.eventStreams||[])for(const e of (stream.eventsMs||[]).filter(t=>t>=time[0]&&t<=time.at(-1)).slice(0,6))for(const dt of [-1,5,50,200])if(e+dt>=time[0]&&e+dt<=time.at(-1))times.add(e+dt);
  const tt=[...times].sort((a,b)=>a-b),nodes=new Set(base.defaultSites||[]);
  for(const chamber of [1,2,3,4]){const nn=base.nodes.chamber.map((v,i)=>v===chamber?i:-1).filter(i=>i>=0);for(const q of [0,.33,.67,1])nodes.add(nn[Math.floor((nn.length-1)*q)]);}
  const nodeIds=[...nodes].filter(n=>Number.isInteger(n)&&n>=0);
  test.approaches.push({id:a.id,sourceIds:ids,nodeIds,times:tt,sourceVoltage:tt.map(t=>ids.map(s=>field.sourceAt(s,t))),nodeVoltage:tt.map(t=>nodeIds.map(n=>field.voltageAtNode(n,t)))});
 }
 fixture.cases.push(test);
}
fs.writeFileSync(output,JSON.stringify(fixture));

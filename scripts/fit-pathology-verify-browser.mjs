/** Verify the actual browser Vm evaluator against independently exported Python fixtures. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {FittedField} from '../dist/fit-model.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const base=read('dist/cardiac-voltage/data/heart-model.json');
const results=[];
const waveformAuditPath='data-source/pathology-fitting/ap-shape-waveform-audit.json';
let waveformAudit=null;
for(const id of ['ptbxl-03155','acs-00004']){
  const file=`dist/data/pathology-fits/cases/${id}.json`;
  if(!fs.existsSync(path.join(root,file)))continue;
  const fit=read(file);if(fit.provisional)continue;
  const approach=fit.approaches.find(a=>a.id===fit.selectedApproachId);
  const field=new FittedField(base,fit,approach),tests=fit.evaluatorVerification;
  if(waveformAudit===null&&fs.existsSync(path.join(root,waveformAuditPath))){
    const audit=read(waveformAuditPath),priorFamily=field.plateauShapeFamily;let maxError=0,tests=0;
    for(const f of audit.javascriptFixtures){
      field.plateauShapeFamily=f.family;
      for(let i=0;i<f.ageMs.length;i++){
        maxError=Math.max(maxError,Math.abs(field.normalizedAP(f.ageMs[i],f.durationMs,0,f.shapeParameter)-f.normalizedVm[i]));tests++;
      }
    }
    field.plateauShapeFamily=priorFamily;
    if(maxError>audit.tolerance)throw Error('Python/JS AP-shape family mismatch');
    waveformAudit={tests,maxNormalizedError:maxError,tolerance:audit.tolerance};
  }
  let sourceError=0,renderError=0,count=0;
  for(const f of tests.sourceFixtures)for(let i=0;i<f.timeMs.length;i++){
    sourceError=Math.max(sourceError,Math.abs(field.sourceAt(f.sourceIndex,f.timeMs[i])-f.vmMv[i]));count++;
  }
  for(const f of tests.renderFixtures)for(let i=0;i<f.timeMs.length;i++){
    renderError=Math.max(renderError,Math.abs(field.voltageAtNode(f.renderNode,f.timeMs[i])-f.vmMv[i]));count++;
  }
  if(sourceError>tests.toleranceMv||renderError>tests.toleranceMv)throw Error(`${id}: Python/JS Vm mismatch`);
  let algebra=0;
  let alternativeFixtureCount=0;
  for(const a of fit.approaches){
    const source=new FittedField(base,fit,a),values=source.sample(50,'voltage');
    if(!values.every(Number.isFinite))throw Error(`${id}/${a.id}: nonfinite render field`);
    if(a.field.sourceActivationMs.length!==base.field.sourceGlobalIds.length)throw Error('Source index mismatch');
    const e=a.ecg;
    for(let i=0;i<fit.timeMs.length;i++){
      algebra=Math.max(algebra,Math.abs(e.III[i]-(e.II[i]-e.I[i])));
      algebra=Math.max(algebra,Math.abs(e.aVR[i]+(e.I[i]+e.II[i])/2));
    }
    if(a.deliverySites&&a.deliverySites.fittedDelaysMs.some((v,i)=>v!==a.parameters.siteDelays[i]))throw Error('Delivery timing metadata mismatch');
    if(a.evaluatorVerification){
      const checks=a.evaluatorVerification;
      for(const fixture of checks.sourceFixtures)for(let i=0;i<fixture.timeMs.length;i++){
        const error=Math.abs(source.sourceAt(fixture.sourceIndex,fixture.timeMs[i])-fixture.vmMv[i]);
        if(error>checks.toleranceMv)throw Error(`${id}/${a.id}: source shape evaluator mismatch`);
        sourceError=Math.max(sourceError,error);alternativeFixtureCount++;
      }
      for(const fixture of checks.renderFixtures)for(let i=0;i<fixture.timeMs.length;i++){
        const error=Math.abs(source.voltageAtNode(fixture.renderNode,fixture.timeMs[i])-fixture.vmMv[i]);
        if(error>checks.toleranceMv)throw Error(`${id}/${a.id}: render shape evaluator mismatch`);
        renderError=Math.max(renderError,error);alternativeFixtureCount++;
      }
    }
  }
  if(algebra>2e-6)throw Error(`${id}: lead algebra exceeded published trace rounding`);
  const result={recordId:id,sourceMaxErrorMv:sourceError,renderMaxErrorMv:renderError,
    fixtureCount:count,alternativeFixtureCount,toleranceMv:tests.toleranceMv,comparedApproaches:fit.approaches.length,
    leadAlgebraMaxErrorMv:algebra,finiteFieldCheck:true};
  results.push(result);console.log(result);
}
fs.writeFileSync(path.join(root,'data-source/pathology-fitting/browser-evaluator-verification.json'),JSON.stringify({results,waveformAudit},null,2)+'\n');

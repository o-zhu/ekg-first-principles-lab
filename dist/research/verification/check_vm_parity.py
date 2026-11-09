#!/usr/bin/env python3
"""Compare browser FittedField with the original Python forward-model AP function.

This checks the exported source evaluator and interpolation. It does not test
identifiability, clinical diagnosis, or the accuracy of the physiological model.
"""
import argparse, ast, hashlib, json, pathlib, subprocess, tempfile, types, zipfile
import numpy as np

HERE=pathlib.Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=HERE.parent.parent)
parser.add_argument('--fit-script',type=pathlib.Path);parser.add_argument('--output',type=pathlib.Path,default=HERE/'vm-parity-report.json')
args=parser.parse_args();root=args.root.resolve()
if args.fit_script:
    source_bytes=args.fit_script.read_bytes();reference=str(args.fit_script)
else:
    archive=root/'data/pathology-fits/propagation-research.zip'
    with zipfile.ZipFile(archive) as bundle:
        source_bytes=bundle.read('scripts/fit-pathology-model.py')
    reference='data/pathology-fits/propagation-research.zip!scripts/fit-pathology-model.py'
# Execute the original function verbatim from its AST, without importing the
# unrelated optimizer or creating research caches. This check needs only NumPy.
tree=ast.parse(source_bytes.decode('utf-8'),filename=reference)
q_at=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='q_at')
namespace={'np':np};exec(compile(ast.Module(body=[q_at],type_ignores=[]),reference,'exec'),namespace)
fm=types.SimpleNamespace(q_at=namespace['q_at'])
base=json.loads((root/'cardiac-voltage/data/heart-model.json').read_text())
with tempfile.TemporaryDirectory(prefix='ekg-vm-parity-') as temp:
    fixtures=pathlib.Path(temp)/'fixture.json'
    subprocess.run(['node',str(HERE/'emit_vm_fixture.mjs'),str(root),str(fixtures)],check=True,capture_output=True)
    fixture=json.loads(fixtures.read_text())

def source_values(fit,approach,ids,times):
    f=approach.get('field',fit['field']);ids=np.asarray(ids);tt=np.asarray(times)[:,None]
    at=np.asarray(f['sourceActivationMs'])[ids];apd=np.asarray(f['sourceApd90Ms'])[ids]
    rest=np.asarray(f['sourceRestMv'])[ids];amp=np.asarray(f['sourceAmplitudeMv'])[ids]
    types=np.asarray(f.get('sourceType',base['field']['sourceType']))[ids]
    shape=np.asarray(f.get('sourcePlateauFraction',f.get('sourcePlateauGamma',[1.]*len(f['sourceActivationMs']))))[ids]
    templates=approach.get('templates',fit.get('templates',base['templates']))
    family=f.get('plateauShapeFamily','rational');q=np.zeros((len(times),len(ids)))
    streams=f.get('eventStreams',[]) if f.get('temporalMode')=='event-schedule' else None
    if streams is not None:
        for s in streams:
            mask=types==s['type']
            if 'chamber' in s:mask&=np.asarray(f['sourceChamber'])[ids]==s['chamber']
            if 'region' in s:mask&=np.asarray(f['sourceRegion'])[ids]==s['region']
            if not mask.any():continue
            sat=np.asarray(s['sourceActivationMs'])[ids][mask] if 'sourceActivationMs' in s else at[mask]
            sapd=np.asarray(s['sourceApd90Ms'])[ids][mask] if 'sourceApd90Ms' in s else apd[mask]
            tpl=templates['atrial' if s['type'] else 'ventricular'];ff='rational' if s['type'] else family
            if s.get('periodMs'):
                period=s['periodMs'];phase=np.mod(tt,period)
                for k in [-1,0,1]:q[:,mask]+=fm.q_at(phase-sat-k*period,sapd,tpl,shape[mask],ff)
            else:
                for event in s.get('eventsMs',[]):
                    age=tt-event-sat
                    q[:,mask]+=fm.q_at(age,sapd,tpl,shape[mask],ff)
    else:
        rr=fit.get('rrMs',fit.get('periodMs',1000));cycles=f.get('neighboringBeatCycles',fit.get('neighboringBeatCycles',[-1,0,1]))
        for typ,key in [(0,'ventricular'),(1,'atrial')]:
            mask=types==typ
            if not mask.any():continue
            for k in cycles:q[:,mask]+=fm.q_at(tt-at[mask]-k*rr,apd[mask],templates[key],shape[mask],'rational' if typ else family)
    return rest+amp*q

report={'evaluatorSha256':fixture['evaluatorSha256'],'pythonReference':reference,'pythonForwardSha256':hashlib.sha256(source_bytes).hexdigest(),'sourceComparisonCount':0,'renderedNodeComparisonCount':0,'maximumSourceErrorMv':0.,'maximumRenderedErrorMv':0.,'cases':[]}
for test in fixture['cases']:
    p=root/'data/pathology-fits/cases'/f"{test['id']}.json";blob=p.read_bytes()
    if hashlib.sha256(blob).hexdigest()!=test['sourceSha256']:
        report['cases'].append({'id':test['id'],'pending':'File changed during audit; rerun after fitting completes.'});continue
    fit=json.loads(blob);case={'id':test['id'],'sourceSha256':test['sourceSha256'],'approaches':[]}
    for result in test['approaches']:
        a=next(a for a in fit['approaches'] if a['id']==result['id'])
        values=source_values(fit,a,result['sourceIds'],result['times']);delta=np.abs(values-np.asarray(result['sourceVoltage']))
        weights=np.asarray(base['field']['renderWeights']).reshape(-1,4)[result['nodeIds']]
        indices=np.asarray(base['field']['renderIndices']).reshape(-1,4)[result['nodeIds']]
        src=source_values(fit,a,indices.ravel(),result['times']).reshape(len(result['times']),len(result['nodeIds']),4)
        nodes=(src*weights).sum(axis=2);node_delta=np.abs(nodes-np.asarray(result['nodeVoltage']))
        maximum=float(np.max(delta));node_maximum=float(np.max(node_delta))
        report['sourceComparisonCount']+=int(delta.size);report['renderedNodeComparisonCount']+=int(node_delta.size)
        report['maximumSourceErrorMv']=max(report['maximumSourceErrorMv'],maximum);report['maximumRenderedErrorMv']=max(report['maximumRenderedErrorMv'],node_maximum)
        case['approaches'].append({'id':a['id'],'sourceComparisons':int(delta.size),'renderedComparisons':int(node_delta.size),'maximumSourceErrorMv':maximum,'maximumRenderedErrorMv':node_maximum,'pass':bool(np.isfinite(delta).all() and np.isfinite(node_delta).all() and maximum<1e-7 and node_maximum<1e-7)})
    report['cases'].append(case)
report['pass']=all(not c.get('pending') and all(a['pass'] for a in c['approaches']) for c in report['cases'])
args.output.write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='cases'},indent=2))
raise SystemExit(0 if report['pass'] else 1)

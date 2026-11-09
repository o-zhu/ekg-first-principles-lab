#!/usr/bin/env python3
"""Compare a modest interventricular recovery prior with the voltage-fit winner.

The chosen bounds are an explicit modeling prior, not universal normal ranges
or measurements of this STEMI patient. Healthy human mapping studies support
modest average LV/RV recovery differences but do not uniquely define APD here.
Geometry, delivery support and activation stay fixed. Two injury-recovery
initializations explore shortening and prolongation without assigning a stage.
"""
from pathlib import Path
import copy
import importlib.util
import json
import numpy as np
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data-source/pathology-fitting';CACHE=BASE/'cache'
SPEC=importlib.util.spec_from_file_location('pathology_model',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(fm)


def main():
    identifier='acs-00004'
    with threadpool_limits(limits=2):
        path=BASE/f'fit-{identifier}-native.json';history=json.loads(path.read_text())
        case=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases'] if c['id']==identifier)
        winner=next(a for a in history['approaches'] if a['id']==history['selectedApproachId'])
        forward=fm.Forward();fit=fm.Fit(forward,case,'stemi')
        key=winner.get('operatorKey','pose')
        forward.weights=np.load(CACHE/f'{identifier}-{key}-native-weights.npy')
        candidates=[]
        for suffix,start in [('prolonged',-60.),('shortened',80.)]:
            p=copy.deepcopy(winner['parameters']);p['rvApdOffset']=-25.;p['injuryShortening']=start
            names=['apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin','injuryMv','injuryShortening','lesionPhi','lesionWidth','lesionZmax','lesionDepth']
            bounds=[(240,380),(0,80),(-50,60),(-35,40),(-35,35),(-35,35),(0,78),(-100,120),(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35)]
            p=fit.fitblock(p,names,bounds,'wholeBeat',winner['rvTravelFactor'],max_nfev=65,dt=.75,db=6.,label=f'conservative RV prior / {suffix} injury initialization')
            result=fit.result(f'recovery-prior-{suffix}',f'Modest RV recovery prior ({suffix} APD initialization)',p,winner['rvTravelFactor'])
            result.pop('nativePrediction',None)
            for key2 in ['pose','operatorKey','deliverySites','complexityCaveat']:
                if key2 in winner:result[key2]=copy.deepcopy(winner[key2])
            result['recoveryPrior']={'rvOffsetBoundsMs':[-35,40],'globalApdParameterBoundsMs':[240,380],
                'transmuralContrastBoundsMs':[0,80],'apicobasalContrastBoundsMs':[-50,60],
                'lvAngularContrastBoundsMs':[-35,35],
                'status':'Explicit conservative model prior; not a validated physiological range or recovered patient APD.',
                'sources':[{'title':'Ramanathan et al.2006; seven healthy adults; average LV epicardial ARI about32ms longer than RV','url':'https://pubmed.ncbi.nlm.nih.gov/16606830/'},
                           {'title':'Orini et al.2013; normal ventricles during rate acceleration; modest mean LV/RV APD-proxy difference','url':'https://pubmed.ncbi.nlm.nih.gov/23284948/'},
                           {'title':'Stoks et al.2024; strong between-person activation/recovery variability and similar population LV/RV recovery times','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC11226755/'}],
                'caveat':'ARI and other recovery proxies are not direct cellular APD. Absolute duration depends on rate, location and experimental setting. Bounds were chosen for this explanatory model.'}
            fields=forward.fields(p,'stemi',winner['rvTravelFactor'])
            for chamber,label in [(1,'LV'),(2,'RV')]:
                d=fields[1][forward.chamber==chamber]
                result['recoveryPrior'][label+'ApdSummaryMs']={'min':float(d.min()),'p05':float(np.quantile(d,.05)),'median':float(np.median(d)),'p95':float(np.quantile(d,.95)),'max':float(d.max())}
            candidates.append(result)
        history['approaches']=[a for a in history['approaches'] if not a['id'].startswith('recovery-prior-')]+candidates
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals
        # Teaching selection was reviewed independently: the small voltage
        # error cost avoids explaining an LV injury through extreme RV APD.
        # The numerical winner remains available with its exact source field.
        history['bestNumericalApproachId']=min(history['approaches'][1:],key=lambda a:a['metrics']['training']['wholeBeat']['independentLeadRmseMv'])['id']
        history['teachingDefaultApproachId']='recovery-prior-shortened'
        history['recoveryPriorComparisonPending']=False
        history['teachingSelectionReason']='A modest interventricular recovery prior avoids the relaxed model’s extreme RV APD offset at a small training-error cost. This is a prior-informed teaching choice, not a uniquely recovered patient map.'
        for a in history['approaches']:
            if a['id']=='alternating-pose-source':
                a['label']='Closest voltage match · relaxed RV recovery prior'
                a['physiologyNote']='This numerical comparison reaches an RV APD offset near −100 ms and modeled RV APD90 about139–190ms. The recovery field is poorly identified; it is not evidence that LAD STEMI caused this RV pattern.'
            elif a['id'].startswith('recovery-prior-'):
                a['physiologyNote']='A stronger, explicit recovery prior limits the RV offset and regional gradients. It accepts a small voltage-error increase to avoid extreme unmeasured RV shortening. These bounds are modeling assumptions, not a universal normal range or patient ground truth.'
                if a['id']=='recovery-prior-shortened':a['label']='Teaching default · modest RV recovery prior'
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        for a in [winner,*candidates]:
            fm.emit(json.dumps({'id':a['id'],'trainingWhole':a['metrics']['training']['wholeBeat']['independentLeadRmseMv'],
                   'heldOutWhole':a['metrics']['heldOut']['wholeBeat']['independentLeadRmseMv'],
                   'heldOutSTT':a['metrics']['heldOut']['ST_T']['independentLeadRmseMv'],
                   'RV':a.get('recoveryPrior',{}).get('RVApdSummaryMs')}))


if __name__=='__main__':main()

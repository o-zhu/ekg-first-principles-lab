#!/usr/bin/env python3
"""One alternating local geometry/source refinement with unchanged pose bounds."""
from pathlib import Path
import argparse
import copy
import importlib.util
import json
import numpy as np
from scipy.optimize import least_squares
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('pose_model',Path(__file__).with_name('fit-pathology-pose.py'))
pm=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(pm)
fm=pm.fm;BASE=pm.BASE;CACHE=pm.CACHE


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',required=True,choices=['ptbxl-03155','acs-00004'])
    args=parser.parse_args()
    with threadpool_limits(limits=2):
        path=BASE/f'fit-{args.case}-native.json';history=json.loads(path.read_text())
        case=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases'] if c['id']==args.case)
        selected=next(a for a in history['approaches'] if a['id']==history['selectedApproachId'])
        p=copy.deepcopy(selected['parameters']);rv=selected['rvTravelFactor']
        operators=pm.PoseOperators();forward=fm.Forward();fit=fm.Fit(forward,case,history['kind'])
        forward.weights=np.load(CACHE/f'{args.case}-pose-native-weights.npy')
        origin=np.r_[selected['pose']['anglesDeg'],selected['pose']['translationMm']]
        steps=np.ones(6)*3.
        folder=CACHE/f'{args.case}-pose-refine';folder.mkdir(exist_ok=True)
        derivatives=[]
        for i in range(6):
            pair=[]
            for sign in [-1,1]:
                dest=folder/f'{i}-{sign:+d}.npy'
                if dest.exists() and dest.stat().st_size>100:
                    w=np.load(dest)
                else:
                    pose=origin.copy();pose[i]+=sign*steps[i]
                    w,_=operators.build(pose);np.save(dest,w)
                pair.append(w)
            derivatives.append((pair[1]-pair[0])/2)
        derivatives=np.array(derivatives)
        prediction0=fit.calculate(p,rv,dt=.75,db=6.)
        columns=np.array([forward.predict(p,fit.kind,fit.time,fit.rr,fit.baseline,rv,
                          weights=derivatives[i],dt=.75,db=6.)[:,fm.INDEP] for i in range(6)])
        window=case['analysisWindowMs'];mask=(fit.time>=window[0])&(fit.time<=window[1])
        temporal=np.ones(len(fit.time))
        temporal[(fit.time>=fit.windows['QRS'][0])&(fit.time<=fit.windows['QRS'][1])]=1.7
        if fit.kind=='stemi':temporal[(fit.time>=fit.windows['ST'][0])&(fit.time<=fit.windows['ST'][1])]=1.8
        weight=temporal[mask,None]/fit.lead_scale
        def fun(delta):
            pred=prediction0[:,fm.INDEP]+np.tensordot(delta/steps,columns,axes=(0,0))
            return np.r_[((pred[mask]-fit.train[mask][:,fm.INDEP])*weight).ravel(),.15*(origin+delta)/pm.BOUNDS]
        lower=-pm.BOUNDS-origin;upper=pm.BOUNDS-origin
        x0=np.clip(np.zeros(6),lower+1e-7,upper-1e-7)
        res=least_squares(fun,x0,bounds=(lower,upper),max_nfev=40,ftol=1e-8,xtol=1e-8,gtol=1e-8)
        pose=origin+res.x
        w,_=operators.build(pose);forward.weights=w
        np.save(CACHE/f'{args.case}-pose2-native-weights.npy',w)
        exact_before=fit.calculate(p,rv,dt=.5,db=3.)
        approximate=prediction0[:,fm.INDEP]+np.tensordot(res.x/steps,columns,axes=(0,0))
        check={'linearizedToExactRmseMv':float(np.sqrt(np.mean((approximate[mask]-exact_before[mask][:,fm.INDEP])**2))),
               'originalAnglesDeg':origin[:3].tolist(),'originalTranslationMm':origin[3:].tolist(),
               'localDerivativeStep':steps.tolist(),'sameParameterBounds':True,
               'baselineLinearityCaveat':'Derivative columns have separately computed median PR baselines. The exact new operator and a newly computed common PR reference are used in the final model.'}
        qon=fit.windows['QRS'][0]+10
        nsites=len(p['siteDelays']);original=selected.get('deliverySites',{}).get('originalSiteCount',nsites)
        names=['onset','speed','gain']+[f'site{i}'for i in range(1,nsites)]
        bounds=[(qon-25,qon+20),(.60,1.8),(.2,3.8)]+[(0,40)]*(original-1)+[(8,50)]*(nsites-original)
        if fit.kind=='stemi':names+=['injuryMv','injuryDelay'];bounds +=[(0,78),(0,40)]
        p=fit.fitblock(p,names,bounds,'QRS',rv,max_nfev=55,dt=.75,db=6.,label='alternating pose/source exact QRS refit')
        p=fit.atria(p,rv);p=fit.recovery(p,rv,extended=True)
        if fit.kind=='stemi':
            names=['lesionPhi','lesionWidth','lesionZmax','lesionDepth','injuryMv','injuryShortening','apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin']
            bounds=[(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35),(0,78),(-100,140),(180,430),(0,130),(-90,100),(-100,80),(-65,65),(-65,65)]
            p=fit.fitblock(p,names,bounds,'wholeBeat',rv,max_nfev=50,dt=.75,db=6.,label='alternating pose/source injury recovery')
        result=fit.result('alternating-pose-source','Alternating geometry + anatomical source refinement',p,rv)
        result.pop('nativePrediction',None);result['operatorKey']='pose2'
        result['pose']={**selected['pose'],'anglesDeg':pose[:3].tolist(),'rotationMatrix':operators.matrix(pose).ravel().tolist(),'translationMm':pose[3:].tolist()}
        result['geometryVerification']=check
        if selected.get('deliverySites'):
            result['deliverySites']=copy.deepcopy(selected['deliverySites'])
            result['deliverySites']['fittedDelaysMs']=p['siteDelays']
        if selected.get('complexityCaveat'):result['complexityCaveat']=selected['complexityCaveat']
        history['approaches']=[a for a in history['approaches'] if a['id']!='alternating-pose-source']+[result]
        history['selectedApproachId']=min(history['approaches'][1:],key=lambda a:a['metrics']['training']['wholeBeat']['independentLeadRmseMv'])['id']
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals+7
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        fm.emit(f'ALTERNATING selected {history["selectedApproachId"]}')
        w,mw=operators.build(pose,midpoint=True)
        np.save(CACHE/f'{args.case}-pose2-native-weights.npy',w)
        np.save(CACHE/f'{args.case}-pose2-midpoint-weights.npy',mw)


if __name__=='__main__':main()

#!/usr/bin/env python3
"""Independent early-plateau suppression with preserved upstroke and APD90.

The source AP descends monotonically from its preserved peak to an adjustable
plateau by 30 ms. This explores dome-suppression-like morphology without an
additive output ECG term, a secondary upstroke, or an unbounded recovery tail.
"""
from pathlib import Path
import copy, importlib.util, json
import numpy as np
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'data-source/pathology-fitting';CACHE=BASE/'cache'
spec=importlib.util.spec_from_file_location('plateau',Path(__file__).with_name('fit-pathology-plateau.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);fm=module.fm


def main():
    path=BASE/'fit-acs-00004-native.json';history=json.loads(path.read_text())
    source=next(a for a in history['approaches']if a['id']=='recovery-prior-shortened')
    case=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases']if c['id']=='acs-00004')
    weights=(1.2,4.,3.)
    names=['injuryMv','injuryShortening','injuryPlateauFraction','apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin','lesionPhi','lesionWidth','lesionZmax','lesionDepth']
    bounds=[(0,60),(-140,120),(.15,1.),(240,380),(0,80),(-50,60),(-35,40),(-35,35),(-35,35),(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35)]
    with threadpool_limits(limits=2):
        forward=fm.Forward();forward.weights=np.load(CACHE/f'acs-00004-{source["operatorKey"]}-native-weights.npy')
        fit=fm.Fit(forward,case,'stemi');fit.windows['wholeBeat']=case['analysisWindowMs'];fit.windows['lateRecovery']=[180.,480.]
        results=[]
        for init,shortening,fraction in [('deep-prolonged',-100.,.3),('moderate-prolonged',-60.,.7),('shortened',60.,.65)]:
            p=copy.deepcopy(source['parameters']);p.update(plateauShapeFamily='early-plateau',plateauFraction=1.,injuryPlateauFraction=fraction,shapeBin=.05,injuryShortening=shortening)
            p=module.optimize(fit,p,names,bounds,f'early plateau / {init}',weights=weights,max_nfev=65)
            r=fit.result(f'early-plateau-seed-{init}',f'Early plateau · {init}',p);r.pop('nativePrediction',None);results.append(r)
        def loss(a):
            e=fm.matrix(a['ecg']);mask=(fit.time>=-230)&(fit.time<=520);tt=fit.time[mask];rw=np.ones(len(tt))
            rw[(tt>=-50)&(tt<=60)]=weights[0];rw[(tt>=70)&(tt<=130)]=weights[1];rw[(tt>=180)&(tt<=480)]=weights[2]
            return np.mean(((e[mask][:,fm.INDEP]-fit.train[mask][:,fm.INDEP])/fit.lead_scale*rw[:,None])**2)
        chosen=min(results,key=loss);p=copy.deepcopy(chosen['parameters'])
        extra=['onset','speed','gain','injuryDelay']
        eb=[(-70,-30),(.65,1.6),(.4,1.6),(0,70)]
        p=module.optimize(fit,p,names+extra,bounds+eb,'early plateau / coupled activation and shared source gain',weights=weights,max_nfev=65)
        r=fit.result('early-plateau-coupled','Early plateau suppression + coupled activation',p);r.pop('nativePrediction',None);results.append(r)
        # A separate, stronger QRS weight quantifies the ST/T versus activation
        # tradeoff. It is not selected using held-out beats.
        p=module.optimize(fit,p,names+extra,bounds+eb,'early plateau / QRS-balanced comparison',weights=(2.5,3.,2.),max_nfev=65)
        r=fit.result('early-plateau-balanced','Early plateau suppression · QRS-balanced',p);r.pop('nativePrediction',None);results.append(r)
        for r in results:
            for key in ['pose','operatorKey','deliverySites','complexityCaveat','recoveryPrior']:
                if key in source:r[key]=copy.deepcopy(source[key])
            r['plateauShapeModel']={'type':'early-plateau','upstrokeAnchorMs':4.,'plateauReachedAtMs':30.,
                'formula':'For4<age<=APD90, q_new=.1+(q_original-.1)*[1-(1-h)*smoothstep((age-4)/26)], h=(plateauFraction-.1)/.9. AfterAPD90, a monotone Hermite template-age warp starts with slope h and returns to the original rest endpoint with slope1.',
                'interpretation':'A monotone phenomenological early plateau suppression with unchanged rapid upstroke and local APD90. This does not model a literal notch/dome, phase2 re-entry, ion-channel conductances or a patient ischemia stage.',
                'sources':[{'title':'Di Diego and Antzelevitch 2003; canine wedge ischemic ST/T mechanisms','url':'https://pubmed.ncbi.nlm.nih.gov/14716579/'},{'title':'Ionic mechanisms of ST segment elevation during acute myocardial infarction','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/'}]}
            r['selectionObjective']='Training-only lead-balanced phase loss; see selectionPhaseWeights. Weights multiply residuals, and are squared in least squares. The raw mV metrics retain fixed declared windows.'
            r['selectionPhaseWeights']={'QRS':2.5 if r['id']=='early-plateau-balanced'else 1.2,'ST':3. if r['id']=='early-plateau-balanced'else 4.,'lateRecovery180to480ms':2. if r['id']=='early-plateau-balanced'else 3.,'other':1.}
            r['physiologyNote']='Early plateau suppression is fitted separately from APD90 with the rapid upstroke preserved. The curve is monotone and returns to rest at the original endpoint. Bounds and waveform form are explicit modeling sensitivities, not recovered patient ion dynamics.'
        retained=[r for r in results if r['id']in ['early-plateau-coupled','early-plateau-balanced']]
        history['approaches']=[a for a in history['approaches']if not a['id'].startswith('early-plateau-')]+retained
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals
        history['earlyPlateauCandidateInitializations']=[r for r in results if r['id'].startswith('early-plateau-seed-')]
        history['plateauSelectionPending']=True
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        for r in retained:fm.emit(json.dumps({'id':r['id'],'training':{k:v['independentLeadRmseMv']for k,v in r['metrics']['training'].items()},'heldOut':{k:v['independentLeadRmseMv']for k,v in r['metrics']['heldOut'].items()}}))


if __name__=='__main__':main()

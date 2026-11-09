#!/usr/bin/env python3
"""Mechanistic AP-shape alternatives for the anterior STEMI source fit.

A monotone rational template-age transform changes plateau triangularity while
preserving the intrinsic upstroke and local APD90. The bounded transform is a
phenomenological sensitivity experiment, not a fitted ion-channel model.
"""
from pathlib import Path
import copy, importlib.util, json, time
import numpy as np
from scipy.optimize import least_squares
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'data-source/pathology-fitting';CACHE=BASE/'cache'
spec=importlib.util.spec_from_file_location('fm',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(spec);spec.loader.exec_module(fm)


def optimize(fit,p,names,bounds,label,weights=(1.2,3.,2.),max_nfev=45,window='wholeBeat'):
    p=copy.deepcopy(p);lo=np.array([b[0]for b in bounds]);hi=np.array([b[1]for b in bounds])
    def get(k):return p['siteDelays'][int(k[4:])]if k.startswith('site')else p[k]
    x0=np.clip([get(k)for k in names],lo+1e-5,hi-1e-5)
    def unpack(x):
        trial=copy.deepcopy(p)
        for k,v in zip(names,x):
            if k.startswith('site'):trial['siteDelays'][int(k[4:])]=float(v)
            else:trial[k]=float(v)
        return trial
    mask=(fit.time>=fit.windows[window][0])&(fit.time<=fit.windows[window][1]);tt=fit.time[mask]
    rw=np.ones(len(tt));qlo,qhi=fit.windows['QRS'];slo,shi=fit.windows['ST']
    rw[(tt>=qlo)&(tt<=qhi)]=weights[0];rw[(tt>=slo)&(tt<=shi)]=weights[1];rw[(tt>=180)&(tt<=480)]=weights[2]
    calls=0;t0=time.time()
    def fun(x):
        nonlocal calls
        calls+=1
        pred=fit.calculate(unpack(x),dt=1.,db=8.)
        diff=(pred[mask][:,fm.INDEP]-fit.train[mask][:,fm.INDEP])/fit.lead_scale
        prior=.10*(x-x0)/(hi-lo)
        return np.r_[(diff*rw[:,None]).ravel(),prior]
    res=least_squares(fun,x0,bounds=(lo,hi),diff_step=.004,x_scale=(hi-lo)/4,
        max_nfev=max_nfev,ftol=3e-5,xtol=3e-5,gtol=1e-5)
    fitted=unpack(res.x);pred=fit.calculate(fitted,dt=.75,db=4.)
    score=fm.metrics(pred,fit.train,fit.time,fit.windows)
    hist={'label':label,'parameters':names,'initial':x0.tolist(),'fitted':res.x.tolist(),'bounds':bounds,
          'residualCalls':calls,'optimizerNfev':res.nfev,'trainingWindow':window,
          'trainingWindowMs':list(fit.windows[window]),
          'trainingRmseMv':score[window]['independentLeadRmseMv'],'seconds':time.time()-t0,
          'rvTravelFactor':1.,'success':bool(res.success),'message':res.message,
          'activationBinMs':1.,'durationBinMs':8.,'shapeBin':p['shapeBin'],
          'loss':'Training only; per-lead1/max(QRS_RMS,.2mV); non-overlapping weightsQRS/ST/lateT; weak normalized parameter prior.',
          'phaseWeights':{'QRS':weights[0],'ST':weights[1],'lateT180to480ms':weights[2],'other':1.}}
    fit.history.append(hist)
    fm.emit(json.dumps({'stage':label,'calls':calls,'seconds':hist['seconds'],'train':{k:v['independentLeadRmseMv']for k,v in score.items()},'parameters':{k:fitted[k]for k in names if not k.startswith('site')}}))
    return fitted


def main():
    identifier='acs-00004';path=BASE/f'fit-{identifier}-native.json';history=json.loads(path.read_text())
    prior=BASE/'fit-acs-00004-pre-plateau.json'
    if not prior.exists():prior.write_text(json.dumps(history,indent=2)+'\n')
    source=next(a for a in history['approaches']if a['id']=='recovery-prior-shortened')
    case=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases']if c['id']==identifier)
    with threadpool_limits(limits=2):
        forward=fm.Forward();forward.weights=np.load(CACHE/f'{identifier}-{source["operatorKey"]}-native-weights.npy')
        fit=fm.Fit(forward,case,'stemi');fit.windows['wholeBeat']=case['analysisWindowMs']
        results=[]
        for init,shortening,gamma in [('prolonged',-80.,.55),('shortened',60.,.70)]:
            p=copy.deepcopy(source['parameters']);p.update(plateauGamma=1.,injuryPlateauGamma=gamma,shapeBin=.125,injuryShortening=shortening)
            p=optimize(fit,p,['injuryMv','injuryShortening','injuryPlateauGamma'],[(0,60),(-140,120),(.45,1.)],
                       f'injured plateau shape / {init} initialization',max_nfev=38)
            r=fit.result(f'plateau-seed-{init}',f'Injury plateau shape · {init} initialization',p)
            r.pop('nativePrediction',None);results.append(r)
        # Choose start using the prespecified training weighted loss only.
        def loss(a):
            e=fm.matrix(a['ecg']);mask=(fit.time>=-230)&(fit.time<=520);tt=fit.time[mask];rw=np.ones(len(tt));rw[(tt>=-50)&(tt<=60)]=1.2;rw[(tt>=70)&(tt<=130)]=3.;rw[(tt>=180)&(tt<=480)]=2.
            return np.mean(((e[mask][:,fm.INDEP]-fit.train[mask][:,fm.INDEP])/fit.lead_scale*rw[:,None])**2)
        chosen=min(results,key=loss);p=copy.deepcopy(chosen['parameters'])
        names=['injuryMv','injuryShortening','injuryPlateauGamma','apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin','lesionPhi','lesionWidth','lesionZmax','lesionDepth']
        bounds=[(0,60),(-140,120),(.45,1.),(240,380),(0,80),(-50,60),(-35,40),(-35,35),(-35,35),(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35)]
        p=optimize(fit,p,names,bounds,'regional plateau + constrained recovery',max_nfev=50)
        candidate=fit.result('plateau-regional','Regional plateau depression + constrained recovery',p);candidate.pop('nativePrediction',None);results.append(candidate)
        # A broader shape sensitivity family retains modest regional APD priors.
        broad=copy.deepcopy(p)
        broad=optimize(fit,broad,names+['plateauGamma'],bounds[:2]+[(.45,2.2)]+bounds[3:]+[(.8,1.25)],
                       'reference and injured plateau-shape sensitivity',max_nfev=45)
        candidate=fit.result('plateau-general','Reference and injury plateau-shape sensitivity',broad);candidate.pop('nativePrediction',None);results.append(candidate)
        for r in results:
            for key in ['pose','operatorKey','deliverySites','complexityCaveat','recoveryPrior']:
                if key in source:r[key]=copy.deepcopy(source[key])
            r['plateauShapeModel']={'type':'monotone-rational-template-age','upstrokeAnchorMs':4.,
              'formula':'u=(age-4)/(APD90-4); w=u/(gamma+(1-gamma)*u) for0<u<=1; w=1+gamma*(u-1) after1; templateAge=4+w*(templateAPD90-4). Ages<=4 unchanged.',
              'interpretation':'Gamma<1 produces a more triangular/depressed plateau while preserving the local APD90; gamma>1 prolongs the high plateau. Gamma is an assumed waveform-shape parameter, not measured ionic conductance.',
              'sources':[{'title':'Di Diego and Antzelevitch 2003; acute ischemic ST/T mechanisms in canine wedge','url':'https://pubmed.ncbi.nlm.nih.gov/14716579/'},{'title':'Ionic mechanisms of ST segment elevation during acute myocardial infarction','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/'}]}
            r['selectionObjective']='Training only: QRSweight1.2,STweight3,lateT180to480msweight2,other1 after1/max(trainingQRSRMS,.20mV)leadweight. Held-out beats never tune parameters or select the hypothesis.'
            r['physiologyNote']='The local plateau shape and recovery duration are distinct fitted hypotheses. The upstroke and APD90 are preserved by a monotone transformation; no second depolarization is introduced. Bounds are phenomenological, not measured ion-channel properties.'
        # Initializations remain in compact history; retain only the two fully
        # refined shape families in the public comparison to control size.
        retained=[r for r in results if r['id']in ['plateau-regional','plateau-general']]
        history['approaches']=[a for a in history['approaches']if not a['id'].startswith('plateau-')]+retained
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals
        history['plateauCandidateInitializations']=[r for r in results if r['id'].startswith('plateau-seed-')]
        history['plateauSelectionPending']=True
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        fm.emit('FINAL_NATIVE_SHAPE_CANDIDATES')
        for r in retained:fm.emit(json.dumps({'id':r['id'],'training':{k:v['independentLeadRmseMv']for k,v in r['metrics']['training'].items()},'heldOut':{k:v['independentLeadRmseMv']for k,v in r['metrics']['heldOut'].items()}}))

if __name__=='__main__':main()

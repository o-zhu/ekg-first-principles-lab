#!/usr/bin/env python3
"""One bounded delivery-timing refit of the new ST/T-focused source basin.

This uses exactly the existing graph, delivery locations and timing bounds.
It tests whether the QRS penalty of a recovery-focused candidate is simply a
consequence of leaving its delivery timings at the previous source optimum.
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
    source=next(a for a in history['approaches']if a['id']=='early-plateau-coupled')
    case=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases']if c['id']=='acs-00004')
    with threadpool_limits(limits=2):
        forward=fm.Forward();forward.weights=np.load(CACHE/f'acs-00004-{source["operatorKey"]}-native-weights.npy')
        fit=fm.Fit(forward,case,'stemi');fit.windows['wholeBeat']=case['analysisWindowMs'];fit.windows['lateRecovery']=[180.,480.]
        p=copy.deepcopy(source['parameters']);original=source['deliverySites']['originalSiteCount'];nsites=len(p['siteDelays'])
        names=['onset','speed','gain']+[f'site{i}'for i in range(1,nsites)]
        bounds=[(-65,-20),(.60,1.8),(.2,3.8)]+[(0,40)]*(original-1)+[(8,50)]*(nsites-original)
        p=fit.fitblock(p,names,bounds,'QRS',1.,max_nfev=45,dt=.75,db=6.,label='ST/T-focused basin: existing delivery timings QRS refit')
        result=fit.result('phase-focused-activation','Regional prolongation · existing delivery timings refitted',p);result.pop('nativePrediction',None)
        for key in ['pose','operatorKey','deliverySites','complexityCaveat','recoveryPrior','plateauShapeModel','physiologyNote']:
            if key in source:result[key]=copy.deepcopy(source[key])
        result['selectionObjective']='Training-only phase-focused recovery basin followed by a QRS-only refit of the existing delivery timings, onset, common speed and common ventricular gain. No new sites or direct output-waveform terms.'
        result['physiologyNote']='The early-plateau sensitivity converged back to the original shape. Its distinct result is a prolonged injured-region APD field with an explicitly stronger ST/T objective; refitting the existing delivery timings tests the accompanying QRS penalty. It is a sensitivity comparison, not measured patient recovery.'
        result['deliverySites']['fittedDelaysMs']=p['siteDelays']
        history['approaches']=[a for a in history['approaches']if a['id']!=result['id']]+[result]
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        fm.emit(json.dumps({'id':result['id'],'training':{k:v['independentLeadRmseMv']for k,v in result['metrics']['training'].items()},'heldOut':{k:v['independentLeadRmseMv']for k,v in result['metrics']['heldOut'].items()}}))


if __name__=='__main__':main()

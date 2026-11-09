#!/usr/bin/env python3
"""Additional fast-endocardium and signed injury-recovery source hypotheses.

The homogeneous-torso source operator stays fixed at the explicitly fitted
rigid heart pose.  These experiments alter propagation graph travel or local
AP duration before evaluating membrane potentials and the source integral.
"""
from pathlib import Path
import argparse
import copy
import importlib.util
import json
import time
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data-source/pathology-fitting'
CACHE=BASE/'cache'
SPEC=importlib.util.spec_from_file_location('pathology_model',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(fm)


def distances(f,endo,kind,rv):
    suffix=f'rbbb-{rv:.2f}' if kind=='rbbb' else 'normal'
    dest=CACHE/f'endo-{endo:.2f}-{suffix}.npz'
    if dest.exists() and dest.stat().st_size>100:
        return
    a=np.load(CACHE/'anatomy.npz');e=a['edges'];mask=(e[:,0]<f.nv)&(e[:,1]<f.nv)
    e=e[mask];travel=a['travel'][mask]
    base_endo=json.loads(str(a['info']))['travelSpeedMmPerMs']['endocardialSurrogate']
    fast=(f.rho[e[:,0]]<.04)&(f.rho[e[:,1]]<.04)
    travel[fast]*=base_endo/endo
    if kind=='rbbb':
        re=((f.chamber[e[:,0]]==2).astype(float)+(f.chamber[e[:,1]]==2))/2
        travel*=1+(1/rv-1)*re
    graph=coo_matrix((np.r_[travel,travel],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(f.nv,f.nv)).tocsr()
    ds=np.asarray(dijkstra(graph,directed=False,indices=[s['node']for s in f.seeds[:9 if kind=='rbbb' else 15]]),np.float32)
    np.savez_compressed(dest,D=ds,endoSpeedMmPerMs=endo,rvFactor=rv)
    fm.emit(f'New graph {endo:.2f} mm/ms endocardial surrogate: {kind}')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',required=True,choices=['ptbxl-03155','acs-00004'])
    args=parser.parse_args()
    with threadpool_limits(limits=2):
        path=BASE/f'fit-{args.case}-native.json';history=json.loads(path.read_text())
        target=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases'] if c['id']==args.case)
        best=next(a for a in history['approaches'] if a['id']==history['selectedApproachId'])
        forward=fm.Forward();fit=fm.Fit(forward,target,history['kind'])
        if best.get('pose'):
            forward.weights=np.load(CACHE/f'{args.case}-pose-native-weights.npy')
        rv=best['rvTravelFactor'];qon=fit.windows['QRS'][0]+10
        candidates=[]
        for endo in [2.5,3.5]:
            distances(forward,endo,fit.kind,rv)
            p=copy.deepcopy(best['parameters']);p['endocardialSpeedMmPerMs']=endo
            names=['onset','speed','gain']+[f'site{i}'for i in range(1,9 if fit.kind=='rbbb' else 15)]
            bounds=[(qon-25,qon+20),(.6,1.45),(.2,3.5)]+[(0,40)]*(8 if fit.kind=='rbbb' else 14)
            if fit.kind=='stemi':
                names+=['injuryMv','injuryDelay'];bounds +=[(0,78),(0,40)]
            p=fit.fitblock(p,names,bounds,'QRS',rv,max_nfev=60,dt=.75,db=8.,label=f'fast endocardial substrate {endo:.1f} mm/ms')
            p=fit.recovery(p,rv,extended=True)
            if fit.kind=='stemi':
                # The signed response is a distinct hypothesis, supported by
                # stage-dependent ischemia/reperfusion recovery changes. It
                # does not assert which stage applies to this specific ECG.
                p=fit.fitblock(p,['injuryShortening','injuryMv','apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin'],
                    [(-100,140),(0,78),(180,430),(0,130),(-90,100),(-100,80),(-65,65),(-65,65)],
                    'ST_T',rv,max_nfev=45,dt=.75,db=6.,label=f'signed regional APD response {endo:.1f}')
            result=fit.result(f'fast-endo-{endo:.1f}',f'Faster endocardial delivery ({endo:.1f} mm/ms) + regional recovery',p,rv)
            result.pop('nativePrediction',None)
            if best.get('pose'):result['pose']=best['pose']
            result['mechanismAlternative']={'endocardialSpeedMmPerMs':endo,
                  'interpretation':'Fast endocardial delivery surrogate, further multiplied by fitted common speed and RV slowing. Not an explicitly reconstructed Purkinje tree.',
                  'signedInjuryApdResponse':fit.kind=='stemi',
                  'signedInjuryApdSources':['https://pubmed.ncbi.nlm.nih.gov/17394962/','https://pmc.ncbi.nlm.nih.gov/articles/PMC6095129/'],
                  'parameterCaveat':'Negative injuryShortening means modeled prolongation; positive means shortening. Neither is a direct patient AP measurement.'}
            candidates.append(result)
        history['approaches']=[a for a in history['approaches'] if not a['id'].startswith('fast-endo-')]+candidates
        history['selectedApproachId']=min(history['approaches'][1:],key=lambda a:a['metrics']['training']['wholeBeat']['independentLeadRmseMv'])['id']
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        fm.emit(f'ALTERNATIVES selected {history["selectedApproachId"]}')


if __name__=='__main__':main()

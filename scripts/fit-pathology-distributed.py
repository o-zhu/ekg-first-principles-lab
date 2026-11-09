#!/usr/bin/env python3
"""Fit a broader, explicitly assumed LV endocardial delivery distribution.

Twelve additional ventricular endocardial junction surrogates span six angular
sectors at two apicobasal levels. They have bounded 8–50 ms delivery delays.
All reach tissue through the same anisotropic travel graph. Complete RBBB
retains zero direct RV delivery sites. These are alternative generative
assumptions, never measured or uniquely reconstructed Purkinje junctions.
"""
from pathlib import Path
import argparse
import copy
import importlib.util
import json
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data-source/pathology-fitting';CACHE=BASE/'cache'
SPEC=importlib.util.spec_from_file_location('pathology_model',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(fm)


def prepare(f,kind,rv):
    name=f'distributed-{kind}-rv{rv:.2f}.npz';dest=CACHE/name
    if dest.exists() and dest.stat().st_size>100:
        return name,json.loads(str(np.load(dest)['metadata']))
    a=np.load(CACHE/'anatomy.npz');edges=a['edges'];mask=(edges[:,0]<f.nv)&(edges[:,1]<f.nv)
    edges=edges[mask];travel=a['travel'][mask]
    if kind=='rbbb':
        re=((f.chamber[edges[:,0]]==2).astype(float)+(f.chamber[edges[:,1]]==2))/2
        travel*=1+(1/rv-1)*re
    graph=coo_matrix((np.r_[travel,travel],(np.r_[edges[:,0],edges[:,1]],np.r_[edges[:,1],edges[:,0]])),shape=(f.nv,f.nv)).tocsr()
    pool=np.flatnonzero((f.chamber==1)&(f.rho<.002))
    extra=[]
    for z in [.35,.70]:
        for phi in [-2.5,-1.5,-.5,.5,1.5,2.5]:
            angular=np.abs(np.angle(np.exp(1j*(f.phi[pool]-phi))))
            score=((f.z[pool]-z)/.12)**2+(angular/.5)**2
            node=int(pool[np.argmin(score)])
            extra.append({'node':node,'positionMm':f.points[node].tolist(),'chamber':'LV',
                          'targetPhiRad':phi,'targetApicobasal':z,
                          'actualPhiRad':float(f.phi[node]),'actualApicobasal':float(f.z[node]),
                          'delayBoundsMs':[8,50],'status':'assumed additional endocardial delivery location'})
    original=f.seeds[:9 if kind=='rbbb' else 15]
    nodes=[s['node']for s in original]+[s['node']for s in extra]
    ds=np.asarray(dijkstra(graph,directed=False,indices=nodes),np.float32)
    metadata={'additionalSites':extra,'originalSiteCount':len(original),'totalVentricularSiteCount':len(nodes),
              'directRvSiteCount':0 if kind=='rbbb' else 6,'description':__doc__,
              'sourceNodeOrder':nodes,'scope':'This expands a priori delivery support, while fitting timing only. It does not recover an anatomically explicit Purkinje network.'}
    np.savez_compressed(dest,D=ds,metadata=json.dumps(metadata))
    return name,metadata


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',required=True,choices=['ptbxl-03155','acs-00004'])
    args=parser.parse_args()
    with threadpool_limits(limits=2):
        path=BASE/f'fit-{args.case}-native.json';history=json.loads(path.read_text())
        target=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases'] if c['id']==args.case)
        # Keep the original endocardial speed; faster-layer experiments are
        # separately compared and do not silently alter this new family.
        base=next(a for a in history['approaches'] if a['id']=='posed-anatomy')
        forward=fm.Forward();fit=fm.Fit(forward,target,history['kind'])
        forward.weights=np.load(CACHE/f'{args.case}-pose-native-weights.npy')
        rv=base['rvTravelFactor'];name,delivery=prepare(forward,fit.kind,rv)
        original=delivery['originalSiteCount'];qon=fit.windows['QRS'][0]+10
        candidates=[]
        for start in range(2):
            p=copy.deepcopy(base['parameters'])
            p['distributedDeliveryCache']=name
            p['siteDelays']=p['siteDelays'][:original]+([22.]*12 if start==0 else np.random.default_rng(7364).uniform(10,40,12).tolist())
            names=['onset','speed','gain']+[f'site{i}'for i in range(original,original+12)]
            bounds=[(qon-25,qon+20),(.60,1.8),(.2,3.8)]+[(8,50)]*12
            p=fit.fitblock(p,names,bounds,'QRS',rv,max_nfev=45,dt=.75,db=8.,label=f'distributed LV support start {start+1}')
            names=['onset','speed','gain']+[f'site{i}'for i in range(1,original+12)]
            bounds=[(qon-25,qon+20),(.60,1.8),(.2,3.8)]+[(0,40)]*(original-1)+[(8,50)]*12
            if fit.kind=='stemi':
                names+=['injuryMv','injuryDelay'];bounds +=[(0,78),(0,40)]
            p=fit.fitblock(p,names,bounds,'QRS',rv,max_nfev=65,dt=.75,db=6.,label=f'distributed all-site timing start {start+1}')
            p=fit.recovery(p,rv,extended=True)
            if fit.kind=='stemi':
                names=['lesionPhi','lesionWidth','lesionZmax','lesionDepth','injuryMv','injuryShortening','apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin']
                bounds=[(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35),(0,78),(-100,140),(180,430),(0,130),(-90,100),(-100,80),(-65,65),(-65,65)]
                p=fit.fitblock(p,names,bounds,'wholeBeat',rv,max_nfev=50,dt=.75,db=6.,label=f'distributed injury / signed APD start {start+1}')
            result=fit.result(f'distributed-support-{start+1}','Broader LV delivery support + regional recovery',p,rv)
            result.pop('nativePrediction',None);result['pose']=base['pose']
            result['deliverySites']=copy.deepcopy(delivery)
            result['deliverySites']['fittedDelaysMs']=p['siteDelays']
            result['complexityCaveat']='Twelve extra assumed LV endocardial delivery sites increase flexibility. A better ECG match does not validate their positions or the unique displayed activation pattern.'
            candidates.append(result)
        history['approaches']=[a for a in history['approaches'] if not a['id'].startswith('distributed-support-')]+candidates
        history['selectedApproachId']=min(history['approaches'][1:],key=lambda a:a['metrics']['training']['wholeBeat']['independentLeadRmseMv'])['id']
        history['history']+=fit.history;history['totalForwardEvaluations']+=fit.evals
        path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
        fm.emit(f'DISTRIBUTED selected {history["selectedApproachId"]}')


if __name__=='__main__':main()

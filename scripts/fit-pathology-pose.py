#!/usr/bin/env python3
"""Sensitivity-guided rigid heart-pose fitting, checked by exact torso operators.

The entire heart and its intracellular conductivity tensors rotate/translate
inside the same finite insulating torso. Electrodes stay fixed. Small pose
perturbations provide a fast search approximation; the accepted pose always
gets an independently rebuilt source operator. This is an explicit geometry
nuisance experiment, not independent gains or corrections for ECG leads.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import sys
import time
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data-source/pathology-fitting'
CACHE=BASE/'cache'
WORK=BASE/'model-work'
SRC=WORK/'data-source/four-chamber'
STEPS=np.array([15.,15.,15.,12.,12.,12.])
BOUNDS=np.array([25.,25.,25.,18.,18.,18.])
MODULE=importlib.util.spec_from_file_location('pathology_model',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(MODULE);MODULE.loader.exec_module(fm)


class PoseOperators:
    def __init__(self):
        sys.path.insert(0,str(WORK/'scripts'))
        from appendage_anatomy import load_extended_anatomy
        from refine_source_field import electrical_geometry
        from build_torso_operator import prepare_torso
        geo,_=load_extended_anatomy(SRC)
        self.points,self.tet,self.ids,self.nv=electrical_geometry(geo)
        self.tags=geo['tags']
        self.fibers=geo['fibers'].astype(float)
        self.fibers/=np.linalg.norm(self.fibers,axis=1)[:,None]
        c=np.load(SRC/'operators-cache.npz')
        self.info=json.loads(str(c['operatorInfo']))
        self.edges=c['edges']
        self.center=np.average(self.points,axis=0,weights=c['nodalVolume'])
        self.torso,self.gradient,self.torso_info=prepare_torso()
        self.encoded=self.edges[:,0].astype(np.int64)*len(self.points)+self.edges[:,1]

    def matrix(self,pose):
        return Rotation.from_euler('xyz',np.asarray(pose)[:3],degrees=True).as_matrix()

    def build(self,pose,midpoint=False):
        begin=time.time()
        rotation=self.matrix(pose)
        translation=np.asarray(pose)[3:]
        n=len(self.points)
        w=np.zeros((n,8))
        mw=np.zeros((len(self.edges),8)) if midpoint else None
        conductivity=self.info['sourceConductivitySm']
        import itertools
        pairs=list(itertools.combinations(range(4),2))
        for start in range(0,len(self.tet),40000):
            end=min(start+40000,len(self.tet))
            tt=self.tet[start:end];pp=self.points[tt]
            A=pp[:,1:]-pp[:,0,None]
            volume=np.abs(np.linalg.det(A))/6
            G=np.empty((len(tt),4,3))
            G[:,1:]=np.linalg.inv(A).transpose(0,2,1)
            G[:,0]=-G[:,1:].sum(axis=1)
            f=self.fibers[start:end]
            atrial=self.tags[start:end]>2
            sl=np.where(atrial,conductivity['atrialIsotropic'],conductivity['ventricularLongitudinal'])
            st=np.where(atrial,conductivity['atrialIsotropic'],conductivity['ventricularTransverse'])
            cent=(pp.mean(axis=1)-self.center)@rotation.T+self.center+translation
            elements=self.torso.find_simplex(cent)
            if np.any(elements<0):
                raise ValueError('Posed myocardium lies outside torso')
            # Move reciprocal gradients back into the original myocardial
            # frame; this rotates both fiber conductivity and voltage gradient.
            kernel=self.gradient[elements]@rotation
            ra,la,ll=kernel[:,0],kernel[:,1],kernel[:,2]
            wct=(ra+la+ll)/3
            k=np.stack([la-ra,ll-ra,*[kernel[:,j]-wct for j in range(3,9)]],axis=1)
            flux=st[:,None,None]*k+(sl-st)[:,None,None]*f[:,None,:]*np.sum(f[:,None,:]*k,axis=2)[:,:,None]
            local=-volume[:,None,None]*np.einsum('tik,tek->tie',G,flux)
            np.add.at(w,tt.ravel(),local.reshape(-1,8))
            if midpoint:
                for i,j in pairs:
                    a,b=np.minimum(tt[:,i],tt[:,j]),np.maximum(tt[:,i],tt[:,j])
                    idx=np.searchsorted(self.encoded,a.astype(np.int64)*n+b)
                    np.add.at(mw,idx,.75*(local[:,i]+local[:,j]))
        null=float(np.max(np.abs(w.sum(axis=0)))*110)
        assert null<1e-8
        if midpoint:
            assert np.max(np.abs(.25*w.sum(0)+mw.sum(0)))*110<1e-8
        fm.emit(f'Exact pose {np.round(pose,2).tolist()}: {time.time()-begin:.1f} s; constant Vm null {null:.3g} mV')
        return w,mw

    def basis(self):
        directory=CACHE/'pose-basis';directory.mkdir(exist_ok=True)
        zero=np.zeros(6)
        for i in range(6):
            for sign in [-1,1]:
                name=f'{i}-{sign:+d}.npy';dest=directory/name
                if dest.exists() and dest.stat().st_size>100:
                    continue
                pose=zero.copy();pose[i]=sign*STEPS[i]
                w,_=self.build(pose)
                np.save(dest,w)
        (directory/'geometry.json').write_text(json.dumps({'centerMm':self.center.tolist(),'steps':STEPS.tolist(),'bounds':BOUNDS.tolist(),'description':__doc__},indent=2)+'\n')


def score_pose(fit,p,rv,base,basis,pose,dt=.75,db=6.):
    weights=base+np.tensordot(pose/STEPS,basis,axes=(0,0))
    return fit.f.predict(p,fit.kind,fit.time,fit.rr,fit.baseline,rv,False,dt,db,weights=weights)


def fit_case(identifier,operators):
    data=json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())
    case=next(c for c in data['cases'] if c['id']==identifier)
    native_path=BASE/f'fit-{identifier}-native.json'
    native=json.loads(native_path.read_text())
    best=next(a for a in native['approaches'] if a['id']==native['selectedApproachId'])
    forward=fm.Forward();fit=fm.Fit(forward,case,native['kind'])
    p=best['parameters'];rv=best['rvTravelFactor']
    folder=CACHE/'pose-basis'
    basis=np.array([(np.load(folder/f'{i}-+1.npy')-np.load(folder/f'{i}--1.npy'))/2 for i in range(6)])
    base=forward.weights
    window=case['analysisWindowMs']
    mask=(fit.time>=window[0])&(fit.time<=window[1])
    qrs=(fit.time>=fit.windows['QRS'][0])&(fit.time<=fit.windows['QRS'][1])
    temporal=np.ones(len(fit.time));temporal[qrs]=1.7
    if fit.kind=='stemi':
        temporal[(fit.time>=fit.windows['ST'][0])&(fit.time<=fit.windows['ST'][1])]=1.8
    # With fixed physiology, the raw first-order source model is linear in
    # pose. Separate median-PR baselining of derivative columns is not exactly
    # linear; this is another reason to rebuild and refit the exact operator.
    # These columns are DERIVATIVES OF THE SOURCE OPERATOR, not freely fitted
    # lead-specific waveform bases. Bounds have physical mm/degree units.
    predictions=[]
    for i in range(6):
        pred=forward.predict(p,fit.kind,fit.time,fit.rr,fit.baseline,rv,weights=basis[i],dt=.75,db=6.)
        predictions.append(pred[:,fm.INDEP])
    pred0=fit.calculate(p,rv,dt=.75,db=6.)[:,fm.INDEP]
    columns=np.array(predictions)
    weight=temporal[mask,None]/fit.lead_scale
    def residual(x):
        pred=pred0+np.tensordot(x/STEPS,columns,axes=(0,0))
        data_error=((pred[mask]-fit.train[mask][:,fm.INDEP])*weight).ravel()
        return np.r_[data_error,.15*x/BOUNDS]
    res=least_squares(residual,np.zeros(6),bounds=(-BOUNDS,BOUNDS),max_nfev=40,xtol=1e-8,ftol=1e-8,gtol=1e-8)
    pose=res.x
    approximate=score_pose(fit,p,rv,base,basis,pose)
    exact,_=operators.build(pose)
    np.save(CACHE/f'{identifier}-pose-native-weights.npy',exact)
    forward.weights=exact
    exact_before=fit.calculate(p,rv,dt=.5,db=3.)
    geometry_check={'linearizedToExactRmseMv':float(np.sqrt(np.mean((approximate[mask][:,fm.INDEP]-exact_before[mask][:,fm.INDEP])**2))),
                    'baselineLinearityCaveat':'Raw source projection is linear in operator weights, but separately median-PR-referenced derivative columns are only an approximation. The accepted waveform uses the exact posed operator and a newly computed PR reference.',
                    'linearizedTraining':fm.metrics(approximate,fit.train,fit.time,fit.windows),
                    'exactBeforePhysiologyRefit':fm.metrics(exact_before,fit.train,fit.time,fit.windows)}
    # Refine activation/recovery against the exact moved-heart source operator.
    qon=fit.windows['QRS'][0]+10
    qnames=['onset','speed','gain']+[f'site{i}' for i in range(1,9 if fit.kind=='rbbb' else 15)]
    qbounds=[(qon-25,qon+20),(.6,1.8),(.20,3.5)]+[(0,40)]*(8 if fit.kind=='rbbb' else 14)
    if fit.kind=='stemi':
        qnames+=['injuryMv','injuryDelay'];qbounds +=[(0,78),(0,40)]
    p=fit.fitblock(p,qnames,qbounds,'QRS',rv,max_nfev=55,dt=.75,db=8.,label='exact posed torso / distributed delivery')
    p=fit.atria(p,rv)
    p=fit.recovery(p,rv,extended=True)
    if fit.kind=='stemi':
        names=['lesionPhi','lesionWidth','lesionZmax','lesionDepth','injuryMv','injuryShortening','apd','transmural','apicobasal','rvApdOffset','apdCos','apdSin']
        bounds=[(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35),(0,78),(0,140),(180,430),(0,130),(-90,100),(-100,80),(-65,65),(-65,65)]
        p=fit.fitblock(p,names,bounds,'wholeBeat',rv,max_nfev=55,dt=.75,db=6.,label='exact posed torso / injury recovery')
    result=fit.result('posed-anatomy','Anatomical source fit + rigid heart pose',p,rv)
    result.pop('nativePrediction',None)
    result['pose']={'anglesDeg':pose[:3].tolist(),'rotationMatrix':operators.matrix(pose).ravel().tolist(),
                    'translationMm':pose[3:].tolist(),'rotationCenterMm':operators.center.tolist(),
                    'definition':'p_posed = R (p_native − center) + center + translation; electrodes and torso fixed',
                    'bounds':{'rotationDeg':[-25,25],'translationMm':[-18,18]},
                    'status':'Fitted nuisance geometry of generic anatomy; not a measured patient heart orientation.'}
    result['geometryVerification']=geometry_check
    native['approaches']=[a for a in native['approaches'] if a['id']!='posed-anatomy']+[result]
    native['selectedApproachId']=min(native['approaches'][1:],key=lambda a:a['metrics']['training']['wholeBeat']['independentLeadRmseMv'])['id']
    native['history']+=fit.history
    native['totalForwardEvaluations']+=fit.evals+7
    native_path.write_text(json.dumps(fm.plain(native),indent=2)+'\n')
    fm.emit(f'POSE RESULT {identifier}: {result["metrics"]["training"]["wholeBeat"]["independentLeadRmseMv"]:.4f} mV, selected {native["selectedApproachId"]}')
    # Dense operator is rebuilt even when the pose candidate does not win, so
    # its comparison can be shown with a precisely matched 3D source field.
    w,mw=operators.build(pose,midpoint=True)
    np.save(CACHE/f'{identifier}-pose-native-weights.npy',w)
    np.save(CACHE/f'{identifier}-pose-midpoint-weights.npy',mw)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--basis',action='store_true')
    parser.add_argument('--case',choices=['ptbxl-03155','acs-00004'])
    args=parser.parse_args()
    with threadpool_limits(limits=2):
        operators=PoseOperators()
        if args.basis:operators.basis()
        if args.case:fit_case(args.case,operators)


if __name__=='__main__':main()

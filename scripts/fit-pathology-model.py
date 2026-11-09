#!/usr/bin/env python3
"""Constrained, multilead anatomical source fitting to recorded ECG median beats.

Parameters change myocardial activation, local AP duration or membrane voltage
excursion before applying the finite-torso reciprocal source operator.  There
are no fitted ECG basis waves, lead-specific gains, time warps, or inserted
recorded samples.  This is an educational inverse model, not a unique recovery
of the patient's electrophysiology.
"""
from pathlib import Path
import argparse
import json
import sys
import time
import warnings
import numpy as np
from scipy.fft import rfft, irfft, next_fast_len
from scipy.optimize import least_squares
from scipy.special import expit
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data-source/pathology-fitting'
CACHE = BASE / 'cache'
OUT = ROOT / 'dist/data/pathology-fits'
LEADS = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6']
INDEP = np.array([0,1,6,7,8,9,10,11])


def emit(s):
    print(s, flush=True)


def plain(x):
    if isinstance(x, dict):
        return {k:plain(v) for k,v in x.items()}
    if isinstance(x, (list,tuple)):
        return [plain(v) for v in x]
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, np.generic):
        return x.item()
    return x


def q_at(age, duration, template, shape=1., family='rational'):
    anchor = template.get('warpAnchorMs', 4.)
    if family=='early-plateau' and np.all(np.asarray(shape)==1.):
        family='rational';shape=1.
    if family=='early-plateau':
        # A monotone phase-1/2 suppression, independent of the rapid upstroke
        # and APD90. The plateau fraction is reached 30 ms after activation.
        # After APD90 a monotone Hermite age warp matches the new slope while
        # retaining the original template's return-to-rest endpoint.
        age=np.asarray(age);duration=np.asarray(duration);shape=np.asarray(shape)
        warped=np.where(age<=anchor,age,anchor+(age-anchor)*(template['apd90Ms']-anchor)/(duration-anchor))
        h=(shape-.1)/.9
        positive=np.flatnonzero(np.asarray(template['normalized'])>0)
        rest_age=(positive[-1]+1)*template['dtMs']-template['activationMs']
        span=rest_age-template['apd90Ms'];v=np.clip((warped-template['apd90Ms'])/span,0,1)
        tail=template['apd90Ms']+span*(h*v+(1-h)*(2*v*v-v*v*v))
        warped=np.where((age>duration)&(warped<rest_age),tail,warped)
        q=np.interp((warped+template['activationMs'])/template['dtMs'],
                    np.arange(len(template['normalized'])),template['normalized'],left=0,right=0)
        phase=np.clip((age-anchor)/(30.-anchor),0,1)
        taper=1-(1-h)*phase*phase*(3-2*phase)
        return np.where((age>anchor)&(age<=duration),.1+(q-.1)*taper,q)
    if np.isscalar(shape) and shape == 1.:
        warped = np.where(age <= anchor, age, anchor + (age-anchor) *
                          (template['apd90Ms']-anchor)/(np.asarray(duration)-anchor))
    else:
        # Positive rational phase warp: monotone, identity at gamma=1,
        # identical endpoints and matched derivative at the APD90 boundary.
        # The rapid intrinsic upstroke through 4 ms is never reshaped.
        u = np.maximum(0., (age-anchor)/(np.asarray(duration)-anchor))
        inside = np.minimum(u, 1.)
        w = inside/(np.asarray(shape)+(1-np.asarray(shape))*inside)
        w = np.where(u>1., 1.+np.asarray(shape)*(u-1.), w)
        warped = np.where(age<=anchor,age,anchor+w*(template['apd90Ms']-anchor))
    return np.interp((warped+template['activationMs'])/template['dtMs'],
                     np.arange(len(template['normalized'])), template['normalized'], left=0, right=0)


def matrix(d):
    return np.column_stack([d[k] for k in LEADS])


def lead_dict(a, precision=6):
    return {name:np.round(a[:,i], precision).tolist() for i,name in enumerate(LEADS)}


def all_leads(independent):
    i, ii = independent[:,0], independent[:,1]
    return np.column_stack([i,ii,ii-i,-(i+ii)/2,i-ii/2,ii-i/2,independent[:,2:]])


class Forward:
    def __init__(self):
        a = np.load(CACHE/'anatomy.npz')
        self.nv = int(a['ventricularCount'])
        for key in ['points','chamber','rho','z','phi','W','activation','edges','nodalVolume']:
            setattr(self,key,a[key])
        self.seeds = json.loads(str(a['seeds']))
        self.n = len(self.points)
        self.base = json.loads((ROOT/'dist/cardiac-voltage/data/heart-model.json').read_text())
        self.tpl = self.base['templates']
        self.D = np.load(CACHE/'ventricular-distances.npz')['D']
        self.rbbb = {float(p.stem.rsplit('-',1)[-1]):np.load(p)['D']
                     for p in CACHE.glob('rbbb-distances-*.npz')}
        self.atrial_start = self.activation[self.nv:].min()
        self.atrial_travel = self.activation[self.nv:] - self.atrial_start
        self.types = (self.chamber>2).astype(np.int8)
        self.weights = np.ascontiguousarray(self.W[:,INDEP])
        # Scaling a connected chamber's complete source operator retains the
        # uniform-Vm nullspace. Only a single common ventricular gain is fitted.
        self.kernels = {}
        self.additional_distances = {}

    def hist(self, activation, apd, amplitude, weights, template, times, rr,
             dt=1., db=6.):
        """Bilinear AT/APD deposition; every signed source weight is retained."""
        origin = -450.
        dt, db = float(dt), float(db)
        ai = (np.asarray(activation)-origin)/dt
        a0 = np.floor(ai).astype(np.int32)
        af = ai-a0
        if a0.min()<0:
            raise ValueError('Activation outside histogram domain')
        na = int(a0.max())+3
        di = np.asarray(apd)/db
        d0 = np.floor(di).astype(np.int32)
        df = di-d0
        low, high = int(d0.min()), int(d0.max())+1
        nd = high-low+1
        bins = np.zeros((weights.shape[1],nd,na))
        wa = np.asarray(amplitude)[:,None]*weights
        for delta_d, fraction_d in [(0,1-df),(1,df)]:
            for delta_a, fraction_a in [(0,1-af),(1,af)]:
                index = (d0+delta_d-low)*na+a0+delta_a
                fraction = fraction_d*fraction_a
                for k in range(weights.shape[1]):
                    bins[k] += np.bincount(index,weights=wa[:,k]*fraction,
                                           minlength=nd*na).reshape(nd,na)
        pre=10.
        ages=np.arange(-pre,1150+dt/2,dt)
        nf=next_fast_len(na+len(ages)-1)
        # Caching uses actual template identity and precise bin sizes.
        key=(id(template),low,high,dt,db,nf)
        kernel=self.kernels.get(key)
        if kernel is None:
            k=np.array([q_at(ages,j*db,template) for j in range(low,high+1)])
            kernel=rfft(k,nf,axis=-1)
            if len(self.kernels)>80:
                self.kernels.clear()
            self.kernels[key]=kernel
        spectrum=(rfft(bins,nf,axis=-1)*kernel[None,:,:]).sum(axis=1)
        value=irfft(spectrum,nf,axis=-1)
        axis=origin-pre+np.arange(nf)*dt
        output=np.empty((len(times),weights.shape[1]))
        for k in range(weights.shape[1]):
            output[:,k]=sum(np.interp(times-shift*rr,axis,value[k],left=0,right=0)
                            for shift in [-1,0,1])
        return output

    def hist_shape(self, activation, apd, amplitude, shape, weights, template, times, rr,
                   dt=1., db=6., dg=.10,family='rational'):
        """Trilinear AT/APD/shape deposition, preserving every signed weight."""
        origin=-450.;dt=float(dt);db=float(db);dg=float(dg)
        ai=(np.asarray(activation)-origin)/dt;a0=np.floor(ai).astype(np.int32);af=ai-a0
        di=np.asarray(apd)/db;d0=np.floor(di).astype(np.int32);df=di-d0
        gi=np.asarray(shape)/dg;g0=np.floor(gi).astype(np.int32);gf=gi-g0
        dl,dh=int(d0.min()),int(d0.max())+1;gl,gh=int(g0.min()),int(g0.max())+1
        na=int(a0.max())+3;nd=dh-dl+1;ng=gh-gl+1
        if a0.min()<0 or gl<=0:raise ValueError('Source field outside shape histogram domain')
        bins=np.zeros((weights.shape[1],ng,nd,na));wa=np.asarray(amplitude)[:,None]*weights
        for delta_g,fraction_g in [(0,1-gf),(1,gf)]:
            for delta_d,fraction_d in [(0,1-df),(1,df)]:
                for delta_a,fraction_a in [(0,1-af),(1,af)]:
                    index=((g0+delta_g-gl)*nd+d0+delta_d-dl)*na+a0+delta_a
                    fraction=fraction_g*fraction_d*fraction_a
                    for k in range(weights.shape[1]):
                        bins[k]+=np.bincount(index,weights=wa[:,k]*fraction,minlength=ng*nd*na).reshape(ng,nd,na)
        pre=10.;ages=np.arange(-pre,1150+dt/2,dt);nf=next_fast_len(na+len(ages)-1)
        key=('shape',family,id(template),dl,dh,gl,gh,dt,db,dg,nf)
        kernel=self.kernels.get(key)
        if kernel is None:
            k=np.array([[q_at(ages,d*db,template,g*dg,family)for d in range(dl,dh+1)]for g in range(gl,gh+1)])
            kernel=rfft(k,nf,axis=-1)
            if len(self.kernels)>30:self.kernels.clear()
            self.kernels[key]=kernel
        spectrum=(rfft(bins,nf,axis=-1)*kernel[None,:,:,:]).sum(axis=(1,2))
        value=irfft(spectrum,nf,axis=-1);axis=origin-pre+np.arange(nf)*dt
        output=np.empty((len(times),weights.shape[1]))
        for k in range(weights.shape[1]):
            output[:,k]=sum(np.interp(times-shift*rr,axis,value[k],left=0,right=0)for shift in [-1,0,1])
        return output

    def lesion(self,p,kind):
        if kind!='stemi':
            return np.zeros(self.n)
        angular=np.abs(np.angle(np.exp(1j*(self.phi-p['lesionPhi']))))
        wall=expit((p['lesionWidth']-angular)/.18)
        # Apex is connected to the same anterior territory, rather than an
        # independent ECG component. Smooth borders avoid Vm discontinuities.
        apex=.55*expit((.17-self.z)/.035)
        axial=expit((p['lesionZmax']-self.z)/.065)
        transmural=expit((self.rho-(1-p['lesionDepth']))/.10)
        return (self.chamber==1)*np.maximum(wall,apex)*axial*transmural

    def fields(self,p,kind,rv_factor=1.,healthy=False):
        nv=self.nv
        alternate=p.get('endocardialSpeedMmPerMs')
        if kind=='rbbb' and not healthy:
            d=self.rbbb[rv_factor]
            delays=np.asarray(p['siteDelays'][:9])
        else:
            d=self.D
            delays=np.asarray(p['siteDelays'])
        if alternate is not None:
            suffix=f'rbbb-{rv_factor:.2f}' if kind=='rbbb' and not healthy else 'normal'
            name=f'endo-{alternate:.2f}-{suffix}.npz'
            if name not in self.additional_distances:
                self.additional_distances[name]=np.load(CACHE/name)['D']
            d=self.additional_distances[name]
        if p.get('distributedDeliveryCache'):
            name=p['distributedDeliveryCache']
            if name not in self.additional_distances:
                self.additional_distances[name]=np.load(CACHE/name)['D']
            d=self.additional_distances[name]
            delays=np.asarray(p['siteDelays'])
        atv=np.min(d/p['speed']+delays[:,None],axis=0)+p['onset']
        lesion=self.lesion(p,kind if not healthy else 'healthy')
        atv=atv+p.get('injuryDelay',0)*lesion[:nv]
        ata=p['atrialOnset']+self.atrial_travel/p['atrialSpeed']
        at=np.r_[atv,ata]
        apd=(p['apd']+p['transmural']*(.5-self.rho)+
             p['apicobasal']*(self.z-.5)+p['rvApdOffset']*(self.chamber==2))
        # Optional low-dimensional regional APD field remains upstream of ECG.
        apd+=p.get('apdCos',0)*np.cos(self.phi)*(self.chamber==1)
        apd+=p.get('apdSin',0)*np.sin(self.phi)*(self.chamber==1)
        apd-=p.get('injuryShortening',0)*lesion
        apd[nv:]=self.tpl['atrial']['apd90Ms']+12*(self.chamber[nv:]==3)-6*(self.chamber[nv:]==4)
        apd=np.clip(apd,120,480)
        rest=np.where(self.types==0,self.tpl['ventricular']['restMv'],self.tpl['atrial']['restMv'])
        amplitude=np.where(self.types==0,self.tpl['ventricular']['peakMv']-self.tpl['ventricular']['restMv'],
                           self.tpl['atrial']['peakMv']-self.tpl['atrial']['restMv'])
        injury=p.get('injuryMv',0)*lesion
        # Only the total lost AP excursion is identified after PR subtraction.
        # The 60:40 rest/plateau attribution is a disclosed illustrative prior.
        rest=rest+.6*injury
        amplitude=amplitude-injury
        if p.get('plateauShapeFamily')=='early-plateau':
            reference=p.get('plateauFraction',1.)
            shape=np.where(self.types==0,reference,1.)+(p.get('injuryPlateauFraction',reference)-reference)*lesion
            return at,apd,rest,amplitude,lesion,shape
        if 'plateauGamma' in p or 'injuryPlateauGamma' in p:
            reference=p.get('plateauGamma',1.)
            shape=np.where(self.types==0,reference,1.)+(p.get('injuryPlateauGamma',reference)-reference)*lesion
            return at,apd,rest,amplitude,lesion,shape
        return at,apd,rest,amplitude,lesion

    def predict(self,p,kind,times,rr,baseline,rv_factor=1.,healthy=False,dt=1.,db=6.,weights=None,field_override=None):
        fields=(field_override if field_override is not None else self.fields(p,kind,rv_factor,healthy))
        at,apd,rest,amplitude,lesion=fields[:5]
        shape=fields[5] if len(fields)>5 else None
        weights=self.weights if weights is None else weights
        types=self.types if len(at)==self.n else np.r_[self.types,self.types[self.edges[:,0]]]
        result=np.zeros((len(times),8))
        for typ,key in enumerate(['ventricular','atrial']):
            mask=types==typ
            gain=p['gain'] if typ==0 else p['atrialGain']
            if shape is not None and typ==0:
                result+=self.hist_shape(at[mask],apd[mask],amplitude[mask]*gain,shape[mask],weights[mask],self.tpl[key],times,rr,dt,db,p.get('shapeBin',.10),p.get('plateauShapeFamily','rational'))
            else:
                result+=self.hist(at[mask],apd[mask],amplitude[mask]*gain,weights[mask],self.tpl[key],times,rr,dt,db)
        # The static resting-voltage source cancels with the constant PR
        # baseline subtraction; it is retained in exported Vm for illustration.
        bm=(times>=baseline[0])&(times<=baseline[1])
        result-=np.median(result[bm],axis=0)
        return all_leads(result)


def default_parameters(f,kind,case):
    fid=case.get('fiducialsMs',{})
    onset=float(fid.get('qrsOnset',-45) or -45)
    pon=float(fid.get('pOnset',-210) or -210)
    qend=float(fid.get('qrsOffset',90) or 90)
    tend=float(fid.get('tOffset',430) or 430)
    if isinstance(fid.get('qrsOnset'),dict):
        raise TypeError('Adapt fiducial metadata')
    seeds=np.array([s['timeMs'] for s in f.seeds[:15]])
    delays=(seeds-seeds.min()).tolist()
    return dict(onset=onset+4,siteDelays=delays,speed=1.,gain=1.,
                apd=np.clip(tend-onset-45,240,370),transmural=50.,apicobasal=10.,
                rvApdOffset=-15.,apdCos=0.,apdSin=0.,atrialOnset=max(-360,pon+5),
                atrialSpeed=1.,atrialGain=1.,lesionPhi=1.2,lesionWidth=1.1,
                lesionZmax=.80,lesionDepth=1.1,injuryMv=25. if kind=='stemi' else 0.,
                injuryShortening=45. if kind=='stemi' else 0.,injuryDelay=6. if kind=='stemi' else 0.)


def metrics(pred,observed,times,windows):
    result={}
    for name,(lo,hi) in windows.items():
        m=(times>=lo)&(times<=hi)
        a,b=pred[m],observed[m]
        diff=a-b
        rmse=np.sqrt(np.mean(diff*diff,axis=0))
        cor=[]
        for i in range(12):
            cor.append(float(np.corrcoef(a[:,i],b[:,i])[0,1]) if np.std(a[:,i])>1e-8 and np.std(b[:,i])>1e-8 else None)
        result[name]={'startMs':float(lo),'endMs':float(hi),
                      'independentLeadRmseMv':float(np.sqrt(np.mean(diff[:,INDEP]**2))),
                      'allLeadRmseMv':float(np.sqrt(np.mean(diff**2))),
                      'perLeadRmseMv':dict(zip(LEADS,rmse.tolist())),
                      'perLeadCorrelation':dict(zip(LEADS,cor)),
                      'medianIndependentLeadCorrelation':float(np.nanmedian([cor[i] for i in INDEP if cor[i] is not None]))}
    return result


class Fit:
    def __init__(self,forward,case,kind):
        self.f=forward;self.case=case;self.kind=kind
        self.time=np.asarray(case['sampleGridMs'],float)
        self.train=matrix(case['trainMv']);self.test=matrix(case['testMv'])
        self.observed=matrix(case['samplesMv'])
        self.rr=float(case.get('medianRrMs',case.get('medianRRMs',1000)))
        self.baseline=case.get('baselineWindowMs',[-80,-60] if kind=='rbbb' else [-95,-65])
        fid=case.get('fiducialsMs',{})
        qon=float(fid.get('qrsOnset',-45));qoff=float(fid.get('qrsOffset',100 if kind=='rbbb' else 70))
        pon=float(fid.get('pOnset',-230));tend=float(fid.get('tOffset',540 if kind=='rbbb' else 440))
        self.windows={'wholeBeat':(max(-250,pon-15),min(tend+30,650,self.rr+pon-20)),
                      'P':(max(-250,pon-15),qon-20),'QRS':(qon-10,qoff+10),
                      'ST_T':(qoff+10,min(tend+30,650,self.rr+pon-20)),
                      'ST':(qoff+20,qoff+80)}
        qmask=(self.time>=qon-10)&(self.time<=qoff+10)
        scale=np.sqrt(np.mean(self.train[qmask][:,INDEP]**2,axis=0))
        self.lead_scale=np.maximum(scale,.20)
        self.history=[];self.evals=0

    def calculate(self,p,rv=1.,healthy=False,dt=1.,db=6.):
        self.evals+=1
        return self.f.predict(p,self.kind,self.time,self.rr,self.baseline,rv,healthy,dt,db)

    def fitblock(self,p,names,bounds,window='wholeBeat',rv=1.,healthy=False,max_nfev=30,dt=1.,db=6.,label=''):
        import copy
        p=copy.deepcopy(p)
        def get(k):
            return p['siteDelays'][int(k[4:])] if k.startswith('site') else p[k]
        x0=np.array([get(k) for k in names])
        lo=np.array([b[0] for b in bounds]);hi=np.array([b[1] for b in bounds])
        x0=np.clip(x0,lo+1e-5,hi-1e-5)
        def unpack(x):
            trial=copy.deepcopy(p)
            for k,v in zip(names,x):
                if k.startswith('site'):trial['siteDelays'][int(k[4:])]=float(v)
                else:trial[k]=float(v)
            return trial
        low,high=self.windows[window]
        mask=(self.time>=low)&(self.time<=high)
        # P, QRS and recovery each retain meaningful influence despite their
        # different durations. No per-lead amplitude normalization is applied
        # to the resulting waveform; these are only optimization weights.
        residual_weights=np.ones(mask.sum())
        tt=self.time[mask]
        if window=='wholeBeat':
            residual_weights[(tt>=self.windows['QRS'][0])&(tt<=self.windows['QRS'][1])]=1.6
            if self.kind=='stemi':
                residual_weights[(tt>=self.windows['ST'][0])&(tt<=self.windows['ST'][1])]=2.
        calls=0
        def fun(x):
            nonlocal calls
            calls+=1
            trial=unpack(x)
            pred=self.calculate(trial,rv,healthy,dt,db)
            diff=(pred[mask][:,INDEP]-self.train[mask][:,INDEP])/self.lead_scale
            result=(diff*residual_weights[:,None]).ravel()
            # Weak parameter priors prevent invisible spatial oscillations.
            prior=[]
            for k,v,v0,span in zip(names,x,x0,hi-lo):
                if k.startswith('site') or k in ['apdCos','apdSin']:
                    prior.append(.12*(v-v0)/span)
            return np.r_[result,prior]
        begin=time.time()
        res=least_squares(fun,x0,bounds=(lo,hi),x_scale=np.maximum((hi-lo)/4,.01),
                          diff_step=.003,max_nfev=max_nfev,ftol=2e-5,xtol=2e-5,gtol=1e-5)
        fitted=unpack(res.x)
        pred=self.calculate(fitted,rv,healthy,dt,db)
        score=float(np.sqrt(np.mean((pred[mask][:,INDEP]-self.train[mask][:,INDEP])**2)))
        item={'label':label,'parameters':names,'initial':x0.tolist(),'fitted':res.x.tolist(),
              'bounds':bounds,'residualCalls':calls,'optimizerNfev':res.nfev,
              'trainingWindow':window,'trainingRmseMv':score,'seconds':time.time()-begin,
              'rvTravelFactor':rv,'success':bool(res.success),'message':res.message,
              'activationBinMs':dt,'durationBinMs':db}
        self.history.append(item)
        emit(f"{self.case['id']} {label}: {score:.4f} mV, {calls} calls, {time.time()-begin:.1f} s")
        return fitted

    def atria(self,p,rv=1.,healthy=False):
        return self.fitblock(p,['atrialOnset','atrialSpeed','atrialGain'],
            [(-350,-110),(.55,1.7),(.15,4.)],'P',rv,healthy,30,label='atrial timing / speed / source conductivity')

    def recovery(self,p,rv=1.,healthy=False,extended=False):
        names=['apd','transmural','apicobasal','rvApdOffset']
        bounds=[(180,430),(0,130),(-90,100),(-100,80)]
        if extended:
            names+=['apdCos','apdSin'];bounds +=[(-65,65),(-65,65)]
        if self.kind=='stemi' and not healthy:
            names+=['injuryMv','injuryShortening'];bounds +=[(0,78),(0,140)]
        return self.fitblock(p,names,bounds,'ST_T',rv,healthy,40,label='regional recovery / injury')

    def result(self,name,label,p,rv=1.,healthy=False):
        pred=self.calculate(p,rv,healthy,dt=.5,db=3.)
        return dict(id=name,label=label,parameters=p,rvTravelFactor=rv,healthy=healthy,
                    metrics={'training':metrics(pred,self.train,self.time,self.windows),
                             'heldOut':metrics(pred,self.test,self.time,self.windows)},
                    ecg=lead_dict(pred),nativePrediction=pred)

    def run(self):
        import copy
        p=default_parameters(self.f,self.kind,self.case)
        qon=self.windows['QRS'][0]+10
        onset_bounds=(qon-25,qon+20)
        # Approach 1 is an aligned healthy prior, with only common source gain,
        # onset and APD-family adjustment. It is an explicit comparison model.
        baseline=self.fitblock(p,['onset','gain'],[onset_bounds,(.25,2.8)],'QRS',healthy=True, max_nfev=25,label='healthy prior alignment')
        baseline=self.atria(baseline,healthy=True)
        baseline=self.recovery(baseline,healthy=True)
        results=[self.result('healthy-prior','Aligned healthy source model',baseline,healthy=True)]
        if self.kind=='rbbb':
            candidates=[]
            for rv in sorted(self.f.rbbb):
                trial=copy.deepcopy(baseline)
                names=['onset','speed','gain','site3','site6']
                bounds=[onset_bounds,(.60,1.60),(.25,2.8),(0,28),(0,28)]
                trial=self.fitblock(trial,names,bounds,'QRS',rv,max_nfev=28,dt=1.,db=10.,label=f'RBBB blocked branch / RV speed {rv:.2f}')
                pred=self.calculate(trial,rv,dt=1.,db=6.)
                m=(self.time>=self.windows['QRS'][0])&(self.time<=self.windows['QRS'][1])
                loss=np.mean(((pred[m][:,INDEP]-self.train[m][:,INDEP])/self.lead_scale)**2)
                candidates.append((loss,rv,trial))
            candidates.sort(key=lambda x:x[0])
            _,rv,blocked=candidates[0]
            blocked=self.atria(blocked,rv)
            blocked=self.recovery(blocked,rv)
            results.append(self.result('blocked-rv','Blocked right bundle, shared regional recovery',blocked,rv))
            refined_candidates=[]
            for index,(_,rvc,pc) in enumerate(candidates[:2]):
                trial=copy.deepcopy(blocked)
                trial.update({k:copy.deepcopy(pc[k]) for k in ['onset','speed','gain','siteDelays']})
                names=['onset','speed','gain']+[f'site{i}' for i in range(1,9)]
                bounds=[onset_bounds,(.60,1.60),(.25,2.8)]+[(0,32)]*8
                trial=self.fitblock(trial,names,bounds,'QRS',rvc,max_nfev=45,dt=.75,db=8.,label=f'distributed LV delivery start {index+1}')
                trial=self.recovery(trial,rvc,extended=True)
                result=self.result(f'distributed-rv-{rvc:.2f}',f'Distributed LV delivery + regional recovery (RV {rvc:.2f})',trial,rvc)
                refined_candidates.append(result)
            results+=refined_candidates
        else:
            fixed=copy.deepcopy(baseline)
            fixed.update({k:p[k] for k in ['injuryMv','injuryShortening','injuryDelay']})
            qnames=['onset','speed','gain','site3','site6','site9','site12','injuryMv']
            qbounds=[onset_bounds,(.6,1.7),(.25,3.5),(0,30),(0,30),(0,40),(5,60),(0,78)]
            fixed=self.fitblock(fixed,qnames,qbounds,'QRS',max_nfev=40,label='fixed anterior injury / activation')
            fixed=self.atria(fixed)
            fixed=self.recovery(fixed)
            results.append(self.result('fixed-injury','Fixed anterior injury region',fixed))
            flexible=[]
            for index,phi in enumerate([.8,1.4,2.0]):
                trial=copy.deepcopy(fixed);trial['lesionPhi']=phi
                names=['lesionPhi','lesionWidth','lesionZmax','lesionDepth','injuryMv','injuryShortening','injuryDelay','apd','transmural','apicobasal','rvApdOffset']
                bounds=[(.45,2.5),(.35,2.3),(.45,.98),(.35,1.35),(0,78),(0,140),(0,40),(180,420),(0,130),(-90,100),(-100,80)]
                trial=self.fitblock(trial,names,bounds,'wholeBeat',max_nfev=42,dt=1.,db=8.,label=f'variable LAD region start {index+1}')
                trial=self.fitblock(trial,qnames+['injuryDelay'],qbounds+[(0,40)],'QRS',max_nfev=35,dt=.75,db=8.,label=f'joint injury / delivery start {index+1}')
                trial=self.recovery(trial,extended=True)
                flexible.append(self.result(f'variable-injury-{index+1}','Fitted anterior injury extent + regional recovery',trial))
            results+=flexible
        # Selection uses training only; held-out beats are reported afterwards.
        selected=min(results[1:],key=lambda r:r['metrics']['training']['wholeBeat']['independentLeadRmseMv'])
        out={'recordId':self.case.get('sourceRecordId',self.case['id']), 'targetId':self.case['id'],
             'kind':self.kind,'selectedApproachId':selected['id'],'windows':self.windows,
             'baselineWindowMs':self.baseline,'rrMs':self.rr,'timeMs':self.time.tolist(),
             'approaches':[{k:v for k,v in r.items() if k!='nativePrediction'} for r in results],
             'history':self.history,'totalForwardEvaluations':self.evals}
        dest=BASE/f"fit-{self.case['id']}-native.json"
        dest.write_text(json.dumps(plain(out),indent=2)+'\n')
        emit(f'Selected {selected["id"]}; native results {dest}')
        return out


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',required=True,choices=['ptbxl-03155','acs-00004'])
    parser.add_argument('--benchmark',action='store_true')
    args=parser.parse_args()
    data=json.loads((OUT/'targets-v1.json').read_text())
    case=next(c for c in data['cases'] if c['id']==args.case or c.get('sourceRecordId')==args.case)
    kind='rbbb' if '03155' in case['id'] or 'rbbb' in case['id'].lower() else 'stemi'
    with threadpool_limits(limits=2):
        forward=Forward();fit=Fit(forward,case,kind)
        if args.benchmark:
            p=default_parameters(forward,kind,case)
            for dt,db in [(2.,10.),(1.,6.),(.5,3.)]:
                start=time.time();pred=fit.calculate(p,dt=dt,db=db)
                emit(f'{dt}/{db} bins: {time.time()-start:.3f} s; max {np.max(np.abs(pred)):.3f} mV')
        else:
            fit.run()


if __name__=='__main__':
    main()

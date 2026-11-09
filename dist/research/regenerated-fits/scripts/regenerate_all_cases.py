#!/usr/bin/env python3
"""Recover the remaining clinical fits with the original finite-torso operator.

This intentionally exports model mismatch. Parameters change tissue fields,
never add recorded waveform samples or unconstrained ECG basis functions.
"""
from pathlib import Path
import argparse, copy, hashlib, importlib.util, json, time, warnings, os
import numpy as np
from scipy.optimize import least_squares
from scipy.special import expit
from scipy.signal import periodogram
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
SITE=Path(os.environ['EKG_LAB_SITE']) if 'EKG_LAB_SITE' in os.environ else ROOT.parent/'ekg-lab-recovered'
OUT=SITE/'data/pathology-fits/cases'
CACHE=ROOT/'data-source/pathology-fitting/cache'
spec=importlib.util.spec_from_file_location('original_fit',ROOT/'scripts/fit-pathology-model.py')
fm=importlib.util.module_from_spec(spec);spec.loader.exec_module(fm)
LEADS=fm.LEADS; INDEP=fm.INDEP
EVENT_CONDITIONS={'afib','af-rvr','pvc','mobitz1','mobitz2','complete','vt','flutter','svt','vf','torsades'}
COLLECTIONS=['clinical-ecgs','clinical-extra','clinical-mobitz2','clinical-stemi','clinical-tachyarrhythmias','clinical-torsades']
SOURCES=[
 {'title':'Rodero et al. · CT-derived four-chamber anatomy','url':'https://doi.org/10.1371/journal.pcbi.1008851','data':'https://zenodo.org/records/4593739','license':'CC BY 4.0'},
 {'title':'Gillette et al. · whole-heart electrophysiology and bundle branch block','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC9539798/'},
 {'title':'Ionic mechanisms of ST segment elevation during acute myocardial infarction','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/'},
 {'title':'Di Diego and Antzelevitch · ischemic changes in cellular action potentials','url':'https://pubmed.ncbi.nlm.nih.gov/14716579/'},
 {'title':'Optical mapping of ventricular fibrillation in isolated human hearts','url':'https://pubmed.ncbi.nlm.nih.gov/17369453/'},
 {'title':'Human ventricular fibrillation: Purkinje triggers and myocardial substrate','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC8934691/'},
 {'title':'Human ventricular optical recordings','url':'https://zenodo.org/records/3986725','license':'CC0'},
]
def plain(x):
 if isinstance(x,dict):return {str(k):plain(v) for k,v in x.items()}
 if isinstance(x,(list,tuple)):return [plain(v) for v in x]
 if isinstance(x,np.ndarray):return x.tolist()
 if isinstance(x,np.generic):return x.item()
 return x
def as_dict(a,names):return {l:np.round(a[:,i],6).tolist() for i,l in enumerate(names)}
def corr(a,b):
 return float(np.corrcoef(a,b)[0,1]) if np.std(a)>1e-9 and np.std(b)>1e-9 else None
def score(a,b,mask,names,fit_names):
 a,b=a[mask],b[mask]; ids=[names.index(l) for l in fit_names]
 c={l:corr(a[:,i],b[:,i]) for i,l in enumerate(names)}
 return {'independentLeadRmseMv':float(np.sqrt(np.mean((a[:,ids]-b[:,ids])**2))),
   'allLeadRmseMv':float(np.sqrt(np.mean((a-b)**2))),
   'perLeadRmseMv':{l:float(np.sqrt(np.mean((a[:,i]-b[:,i])**2))) for i,l in enumerate(names)},
   'perLeadCorrelation':c,'medianIndependentLeadCorrelation':float(np.nanmedian([c[l] for l in fit_names if c[l] is not None])) if any(c[l] is not None for l in fit_names) else None}

class Target:
 def __init__(self,record,event):
  self.record,self.event=record,event;self.id=record['id'];self.kind=event['conditionId']
  self.names=list(record['signals']);self.fit_names=[l for l in self.names if l in ['I','II','V1','V2','V3','V4','V5','V6']] if len(self.names)==12 else self.names[:]
  self.full=self.kind in EVENT_CONDITIONS;self.osc=self.kind in ['vf','torsades'];self.fs=record['fs']
  raw=np.column_stack([record['signals'][l] for l in self.names]);rawt=np.arange(len(raw))/self.fs*1000
  beats=event.get('beats',[]);self.beats=beats;anchors=np.array([b['time']*1000 for b in beats])
  self.rr=float(np.median(np.diff(anchors))) if len(anchors)>1 else 220.
  self.minrr=float(np.percentile(np.diff(anchors),5)) if len(anchors)>1 else 220.
  self.qrs_onset=float(np.median([(b.get('qrsOnset',b['time']-.04)-b['time'])*1000 for b in beats])) if beats else -45.
  self.trainingWindow=None;self.heldOutWindow=None
  if self.full:
   start=8000. if self.kind=='torsades' else 0.;end=rawt[-1]
   self.time=np.arange(start,end+.01,max(4.,1000/self.fs))
   fraction=.88 if self.kind=='pvc' else .65
   self.train_mask=self.time<start+fraction*(end-start);self.test_mask=~self.train_mask
   self.trainingWindow=[float(start),float(self.time[self.train_mask][-1])];self.heldOutWindow=[float(self.time[self.test_mask][0]),float(self.time[-1])]
   observed=np.column_stack([np.interp(self.time,rawt,raw[:,i]) for i in range(len(self.names))])
   self.reference=np.median(observed[self.train_mask],axis=0);observed-=self.reference
   self.observed=self.train=self.test=observed;self.p25=self.p75=None
   self.baseline=None
   self.quality={'summary':'Full recording window; no beat averaging. First 65% of the displayed window fits waveform parameters; the remaining 35% is a conditional waveform holdout. Ventricular event timing is supplied from the recording when available, including in the holdout. This does not predict future beat timing or establish an anatomical activation map.',
    'split':'Chronological time-window split; supplied event clocks retained in both partitions.',
    'trainBeatCount':None,'heldoutBeatCount':None,'acceptedBeatCount':None,'baselineDefinition':'One constant per recorded channel: median of the training portion. No additional waveform filter or ST correction.',
    'iqrMeaning':'No ensemble IQR: the unaveraged recording is displayed.'}
   if self.kind=='pvc':self.quality['summary']='Full unaveraged recording. First 88% fits the source, including the single illustrated premature ventricular event; the last 12% is a conditional normal-beat waveform holdout. There is no independent held-out ectopic beat, so the ventricular focus is not validated.'
  else:
   lo=-min(300.,self.rr*.37);hi=min(600.,self.rr*.60)
   self.time=np.arange(np.ceil(lo/5)*5,hi+1,5.)
   self.baseline=[max(self.time[0],-85.),-60.]
   segments=[];accepted=[]
   for anchor in anchors:
    ts=anchor+self.time
    if ts[0]<rawt[0] or ts[-1]>rawt[-1]:continue
    v=np.column_stack([np.interp(ts,rawt,raw[:,i]) for i in range(len(self.names))])
    m=(self.time>=self.baseline[0])&(self.time<=self.baseline[1]);v-=np.median(v[m],axis=0)
    segments.append(v);accepted.append(float(anchor/1000))
   if not segments:raise ValueError('No complete beat window')
   b=np.array(segments);self.observed=np.median(b,axis=0);self.train=np.median(b[::2],axis=0);self.test=np.median(b[1::2],axis=0) if len(b)>1 else self.train.copy();self.p25=np.percentile(b,25,axis=0);self.p75=np.percentile(b,75,axis=0)
   self.train_mask=self.test_mask=np.ones(len(self.time),bool)
   self.reference=None
   self.quality={'summary':f'{len(b)} complete beats aligned using existing QRS visualization anchors. Alternating beats form training and held-out medians; no morphology rejection or independent P/T time warping. Original recording samples remain unchanged.',
    'acceptedBeatCount':len(b),'trainBeatCount':len(b[::2]),'heldoutBeatCount':len(b[1::2]),'completeBeatCount':len(b),'detectedBeatCount':len(anchors),'excludedBeatCount':len(anchors)-len(b),
    'split':'Alternating complete beats, separated before median construction. Only training waveform values determine fitted parameters. Same-record repeatability, not independent patient validation.',
    'anchorSeconds':accepted,'anchorStatus':'Existing source or visually estimated visualization QRS anchors; not newly validated clinical fiducials.',
    'iqrMeaning':'25th–75th percentiles of complete aligned beats; includes biological variation and noise, not uncertainty in the anatomical fit.'}
  if self.osc:
   f,power=periodogram(self.train[self.train_mask,0],fs=1000/np.median(np.diff(self.time)))
   allowed=(f>=3)&(f<=9);self.cycle=1000/f[allowed][np.argmax(power[allowed])]
  else:self.cycle=None
  self.scale=np.maximum(np.sqrt(np.mean(self.train[self.train_mask]**2,axis=0)),.12)
  self.baseline_note='A common-time PR reference is subtracted per beat and per modeled lead.' if not self.full else 'Training-window median reference; absolute extracellular DC voltage is not identified.'

class Engine:
 def __init__(self):
  self.f=fm.Forward();f=self.f
  self.native={k:getattr(f,k) for k in ['points','chamber','rho','z','phi']}
  self.native.update(W=f.weights,activation=f.activation,D=f.D,nv=f.nv,n=f.n)
  self.native['atrialTravel']=f.activation[f.nv:]-f.activation[f.nv:].min()
  # Bounded acceleration: spatial cells preserve EVERY signed physical source
  # weight, unlike dropping low-amplitude or poorly fitted surface regions.
  keys=np.column_stack([f.chamber,np.floor((f.points-f.points.min(0))/8),np.floor(np.clip(f.rho,0,.9999)*4)]).astype(int)
  unique,inv=np.unique(keys,axis=0,return_inverse=True);counts=np.bincount(inv);g=len(counts)
  def mean(v):return np.bincount(inv,weights=v,minlength=g)/counts
  W=np.column_stack([np.bincount(inv,weights=f.weights[:,k],minlength=g) for k in range(8)])
  chamber=unique[:,0];nv=int(np.sum(chamber<3))
  coarse={'n':g,'nv':nv,'chamber':chamber,'W':W,'points':np.column_stack([mean(f.points[:,k]) for k in range(3)]),'rho':mean(f.rho),'z':mean(f.z),'phi':np.arctan2(mean(np.sin(f.phi)),mean(np.cos(f.phi))),
    'activation':mean(f.activation),'D':np.array([mean(np.r_[d,np.zeros(f.n-f.nv)])[:nv] for d in f.D])}
  coarse['atrialTravel']=coarse['activation'][nv:]-f.activation[f.nv:].min();self.coarse=coarse
  self.delays=np.array([s['timeMs'] for s in f.seeds[:15]]);self.delays-=self.delays.min()
  self.denseW=None
  print(f'Physical operator: {f.n:,} nodes. Optimization grouping: {g:,} signed-weight cells.',flush=True)
 def dense_weights(self):
  if self.denseW is None:self.denseW=np.vstack([.25*self.f.weights,np.load(CACHE/'midpoint-weights.npy',mmap_mode='r')[:,INDEP]])
  return self.denseW
 def fields(self,p,target,geo,variant='pathology',focus=10):
  nv=geo['nv'];n=geo['n'];ch=geo['chamber'];rho,z,phi=geo['rho'],geo['z'],geo['phi'];kind=target.kind
  delays=self.delays.copy();delays[9:]+=p.get('rightDelay',0);delays[3:6]+=p.get('anteriorDelay',0);delays[6:9]+=p.get('posteriorDelay',0)
  selected=np.arange(15)
  if variant!='healthy':
   if kind=='lbbb':selected=np.arange(9,15)
   elif kind=='mobitz2':selected=np.arange(9)
   elif kind=='leftaxis':selected=np.array([0,1,2,6,7,8,9,10,11,12,13,14])
   elif kind=='rightaxis':selected=np.array([0,1,2,3,4,5,9,10,11,12,13,14])
   elif kind=='vt':selected=np.array([focus])
  atv=np.min(geo['D'][selected]/p['speed']+delays[selected,None],axis=0)+p['onset']
  atrial_onset=p['onset']-p['avDelay'] if not target.full else p['atrialOnset']
  ata=geo['atrialTravel']/p['atrialSpeed']+atrial_onset;at=np.r_[atv,ata]
  lesion=np.zeros(n)
  if kind.startswith('stemi') and variant!='healthy':
   xyz=geo['points'];xx=(xyz[:,0]-xyz[:,0].mean())/30;yy=(xyz[:,1]-xyz[:,1].mean())/30
   if 'inferior' in kind:
    lesion=(ch==1)*expit((.40-z)/.10)*expit((yy+.45)/.30)
   elif 'lateral' in kind:
    lesion=(ch==1)*expit((xx-.20)/.30)*expit((.9-z)/.12)
   else:lesion=(ch==1)*expit((-yy-.25)/.30)*expit((.85-z)/.1)
   lesion*=expit((rho-.25)/.12)
  at+=p.get('injuryDelay',0)*lesion
  maxapd=min(480.,max(125.,target.minrr*.73)) if not target.osc else 160.
  apd=p['apd']+p.get('transmural',40)*(.5-rho)+p.get('apicobasal',0)*(z-.5)+p.get('rvApd',0)*(ch==2)+p.get('apdCos',0)*np.cos(phi)*(ch==1)+p.get('apdSin',0)*np.sin(phi)*(ch==1)
  apd-=p.get('injuryShortening',0)*lesion;apd=np.clip(apd,80.,maxapd)
  apd[nv:]=min(290.,target.minrr*.66) if kind in ['tachy','svt'] else 285.
  rest=np.where(ch<3,-85.,-81.);amp=np.where(ch<3,110.,105.)
  injury=p.get('injuryMv',0)*lesion;rest+=.6*injury;amp-=injury
  streams=[]
  if target.full:
   ve=np.array([b['time']*1000 for b in target.beats]);ae=np.array([e['onset']*1000 for e in target.event.get('atrialEvents',[])])
   if kind=='pvc':
    regular=[b['time']*1000 for b in target.beats if not b.get('ectopic')];ectopic=[b['time']*1000 for b in target.beats if b.get('ectopic')]
    ect=np.r_[geo['D'][focus]/max(.55,p['speed']*.7)+p['onset'],np.zeros(n-nv)]
    streams.append({'type':0,'eventsMs':regular});streams.append({'type':0,'eventsMs':ectopic,'activation':ect,'label':'Single-focus ventricular-origin hypothesis'})
   elif not target.osc:streams.append({'type':0,'eventsMs':ve.tolist()})
   if kind in ['afib','af-rvr','flutter']:
    # Ordered macroreentry is one flutter hypothesis; AF has different regional
    # cycle lengths. Neither is an invasive map inferred from two surface leads.
    atrial_region=(ch>2).astype(int)+(ch==4).astype(int)
    for chamber in [3,4]:
     group=(ch==chamber);period=p.get('atrialCycle',200.)*(1 if kind=='flutter' else (1.0 if chamber==3 else 1.17))
     phase=(np.arctan2(geo['points'][:,1]-5,geo['points'][:,0]+25)/(2*np.pi)+.5)*period
     local=at.copy();local[group]=np.mod(phase[group]+p['atrialOnset'],period);at[group]=local[group];apd[group]=min(period*.65,130.)
     streams.append({'type':1,'chamber':chamber,'periodMs':period,'activation':local,'startMs':target.time[0]-period,'endMs':target.time[-1]+period})
   elif len(ae):streams.append({'type':1,'eventsMs':ae.tolist()})
   elif kind not in ['vt','vf','torsades']:
    # No measured P-wave series is available for these records. The sinus
    # timing prior must not manufacture a P-wave locked to an ectopic PVC.
    atrial_anchors=regular if kind=='pvc' else ve.tolist()
    streams.append({'type':1,'eventsMs':atrial_anchors})
   if target.osc:
    # Four bounded regional rotating-wave sources, not a solved excitable-tissue
    # PDE. Their local APs generate the ECG through the same torso operator.
    regions=np.where(ch==2,2+(z>.5).astype(int),(z>.5).astype(int))
    for groupid in range(4):
     group=(ch<3)&(regions==groupid);period=p[f'cycle{groupid}']
     phase=(np.mod(phi/(2*np.pi)+.35*z,1))*period
     local=at.copy();local[group]=np.mod(phase[group]+p.get(f'phase{groupid}',0),period);at[group]=local[group]
     apd[group]=period*p.get('duty',.60)
     streams.append({'type':0,'region':groupid,'periodMs':period,'activation':local,'startMs':target.time[0]-period,'endMs':target.time[-1]+period})
    amp[ch>2]=0
   else:regions=None
  else:regions=None
  return {'at':at,'apd':apd,'rest':rest,'amp':amp,'lesion':lesion,'chamber':ch,'streams':streams,'regions':regions}
 def physical(self,p,t,geo,variant='pathology',focus=10,dt=2.,db=8.,fields=None):
  f=fields or self.fields(p,t,geo,variant,focus);at,apd,amp=f['at'],f['apd'],f['amp'];ch=f['chamber'];weights=geo['W'];out=np.zeros((len(t.time),8))
  if not t.full:
   for typ,key in [(0,'ventricular'),(1,'atrial')]:
    mask=(ch>2)==bool(typ);gain=p['atrialGain'] if typ else p['gain']
    out+=self.f.hist(at[mask],apd[mask],amp[mask]*gain,weights[mask],self.f.tpl[key],t.time,t.rr,dt,db)
   bm=(t.time>=t.baseline[0])&(t.time<=t.baseline[1]);out-=np.median(out[bm],axis=0)
  else:
   axis=np.arange(-450.,1550.01,dt)
   for stream in f['streams']:
    typ=stream['type'];mask=(ch>2)==bool(typ);key='atrial' if typ else 'ventricular';gain=p['atrialGain'] if typ else p['gain']
    if 'chamber' in stream:mask&=ch==stream['chamber']
    if 'region' in stream:mask&=f['regions']==stream['region']
    if not np.any(mask) or gain==0:continue
    local=stream.get('activation',at)
    if 'periodMs' in stream:
     period=stream['periodMs'];phase=np.mod(t.time,period)
     out+=self.f.hist(local[mask],apd[mask],amp[mask]*gain,weights[mask],self.f.tpl[key],phase,period,dt,db)
    else:
     kernel=self.f.hist(local[mask],apd[mask],amp[mask]*gain,weights[mask],self.f.tpl[key],axis,100000.,dt,db)
     for event in stream['eventsMs']:
      out+=np.column_stack([np.interp(t.time-event,axis,kernel[:,k],left=0,right=0) for k in range(8)])
   out-=np.median(out[t.train_mask],axis=0)
  return out
 def project(self,physical,t,coefficients=None,fit=True):
  standard=fm.all_leads(physical)
  if len(t.names)==12:return standard,None
  # No missing standard leads are presented. Unknown channels get a fixed,
  # low-dimensional nuisance readout fit on training samples only.
  basis=np.column_stack([physical[:,0],physical[:,1],physical[:,3]-physical[:,6]])
  predicted=np.empty_like(t.observed);coefs={}
  for k,name in enumerate(t.names):
   if name in LEADS:
    predicted[:,k]=standard[:,LEADS.index(name)];continue
   if coefficients is not None:coef=np.asarray(coefficients[name])
   else:
    x=basis[t.train_mask]/t.scale[k];y=t.train[t.train_mask,k]/t.scale[k]
    coef=np.linalg.solve(x.T@x+.015*np.eye(3),x.T@y)
    coef=np.clip(coef,-5,5)
   predicted[:,k]=basis@coef;coefs[name]=coef.tolist()
  return predicted,coefs

def initial(engine,t):
 maxapd=min(400.,max(120.,t.minrr*.66));onset=float(np.clip(t.qrs_onset,-90,-10))
 p=dict(onset=onset,speed=.8 if t.kind=='lbbb' else 1.,gain=1.,atrialOnset=0. if t.full and t.event.get('atrialEvents') else -260. if t.kind=='avblock1' else -205.,atrialSpeed=1.,atrialGain=0. if t.kind in ['vt','vf','torsades'] else 1.,
  apd=maxapd,transmural=45.,apicobasal=10.,rvApd=-15.,apdCos=0.,apdSin=0.,rightDelay=0.,anteriorDelay=0.,posteriorDelay=0.,
  injuryMv=28. if t.kind.startswith('stemi') else 0.,injuryShortening=50. if t.kind.startswith('stemi') else 0.,injuryDelay=8. if t.kind.startswith('stemi') else 0.,atrialCycle=195. if t.kind=='flutter' else 165.,duty=.60,avDelay=245. if t.kind=='avblock1' else 165.)
 if t.kind=='leftaxis':p['anteriorDelay']=40
 if t.kind=='rightaxis':p['posteriorDelay']=40
 if t.osc:
  for i,factor in enumerate([.94,1.,1.08,1.17]):p['cycle'+str(i)]=float(np.clip(t.cycle*factor,110,320));p['phase'+str(i)]=i*30.
  p['atrialOnset']=0
 return p

def fit_parameters(engine,t,p,names,bounds,variant='pathology',focus=10,nfev=22,native=False,label=''):
 p=copy.deepcopy(p);x0=np.clip(np.array([p[k] for k in names]),np.array([b[0] for b in bounds])+1e-5,np.array([b[1] for b in bounds])-1e-5)
 geo=engine.native if native else engine.coarse;calls=0;begin=time.time()
 def unpack(x):return {**p,**{k:float(v) for k,v in zip(names,x)}}
 fitidx=[t.names.index(l) for l in t.fit_names]
 mask=t.train_mask.copy()
 # Waveform samples are untouched; these weights only balance optimization.
 temporal=np.ones(mask.sum())
 if not t.full:temporal[(t.time[mask]>-60)&(t.time[mask]<130)]=1.5
 if t.kind=='pvc':
  for b in t.beats:
   if b.get('ectopic'):temporal[(t.time[mask]>b['time']*1000-130)&(t.time[mask]<b['time']*1000+450)]=2.5
 def fun(x):
  nonlocal calls;calls+=1
  trial=unpack(x);physical=engine.physical(trial,t,geo,variant,focus);pred,_=engine.project(physical,t)
  residual=((pred[mask][:,fitidx]-t.train[mask][:,fitidx])/t.scale[fitidx])*temporal[:,None]
  regularity=np.array([(v-v0)/max(hi-lo,1) for v,v0,(lo,hi) in zip(x,x0,bounds)])*.08
  return np.r_[residual.ravel(),regularity]
 res=least_squares(fun,x0,bounds=tuple(np.array(bounds).T),x_scale=np.maximum(np.ptp(bounds,axis=1)/4,.1),diff_step=.005,max_nfev=nfev,ftol=4e-4,xtol=4e-4,gtol=1e-4)
 fitted=unpack(res.x);pred,coeff=engine.project(engine.physical(fitted,t,geo,variant,focus),t)
 metrics=score(pred,t.train,t.train_mask,t.names,t.fit_names)
 meta={'label':label,'parameters':names,'initial':x0.tolist(),'fitted':res.x.tolist(),'bounds':bounds,'evaluations':calls,'optimizerNfev':int(res.nfev),'seconds':time.time()-begin,'converged':bool(res.success),'optimizerMessage':str(res.message),'trainingRmseMv':metrics['independentLeadRmseMv'],'operator': 'all native nodes' if native else 'all signed weights spatially aggregated for optimization'}
 print(t.id,label,round(metrics['independentLeadRmseMv'],4),'mV;',calls,'calls;',round(time.time()-begin,1),'s',flush=True)
 return fitted,meta

def refined_field(engine,f):
 edges=engine.f.edges;nv=engine.f.nv
 out={k:np.r_[f[k],f[k][edges].mean(axis=1)] for k in ['at','apd','rest','amp','lesion']}
 # Electrical AV interfaces are duplicated; no edge crosses chamber types.
 out['chamber']=np.r_[f['chamber'],f['chamber'][edges[:,0]]]
 out['regions']=None if f['regions'] is None else np.r_[f['regions'],f['regions'][edges[:,0]]]
 out['streams']=[]
 for s in f['streams']:
  a={k:v for k,v in s.items() if k!='activation'}
  if 'activation' in s:
   arr=s['activation'];mid=arr[edges].mean(axis=1)
   # Circular interpolation at a wrapping phase boundary avoids a spurious
   # half-cycle delay at midpoint quadrature sites.
   if 'periodMs' in s:
    per=s['periodMs'];phase=2*np.pi*arr[edges]/per
    mid=np.angle(np.exp(1j*phase).sum(axis=1))*per/(2*np.pi);mid=np.mod(mid,per)
   a['activation']=np.r_[arr,mid]
  out['streams'].append(a)
 return out

def export_field(engine,f,p):
 ids=np.asarray(engine.f.base['field']['sourceGlobalIds']);ch=f['chamber'][ids]
 result={'sourceActivationMs':np.round(f['at'][ids],5).tolist(),'sourceApd90Ms':np.round(f['apd'][ids],5).tolist(),'sourceRestMv':np.round(f['rest'][ids],5).tolist(),'sourceAmplitudeMv':np.round(f['amp'][ids],5).tolist(),'sourceLesionWeight':np.round(f['lesion'][ids],6).tolist(),'sourceType':(ch>2).astype(int).tolist(),'sourceChamber':ch.astype(int).tolist(),'neighboringBeatCycles':[-1,0,1],
  'sourceIndexing':'Identical order to base.field.sourceGlobalIds; native and edge-midpoint source quadrature.',
  'sourceGain':{'ventricular':p['gain'],'atrial':p['atrialGain']}}
 if f['streams']:
  result['temporalMode']='event-schedule';result['eventStreams']=[]
  if f['regions'] is not None:result['sourceRegion']=f['regions'][ids].astype(int).tolist()
  for s in f['streams']:
   v={k:plain(x) for k,x in s.items() if k!='activation'}
   if 'activation' in s:v['sourceActivationMs']=np.round(s['activation'][ids],5).tolist()
   result['eventStreams'].append(v)
  result['evaluation']='Each source follows only its chamber/region event streams. Periodic streams use circular phase; recorded events use explicit timestamps. AP excursions use the existing normalized templates and fitted local duration. The ECG is the physical source integral of these fields.'
 return result

def fits_for_case(engine,t):
 p=initial(engine,t);history=[];candidates=[]
 apdhi=min(460,max(140,t.minrr*.73));apdlo=min(180,apdhi-30)
 atrial_bounds=(-80,80) if t.full and t.event.get('atrialEvents') else (-350,-110)
 atrial_parameter='atrialOnset' if t.full else 'avDelay'
 if not t.full:atrial_bounds=(120,210) if t.kind in ['normal','brady','tachy'] else (100,230)
 if t.kind in ['afib','af-rvr','flutter']:atrial_bounds=(0,200);p['atrialOnset']=60
 if t.kind=='avblock1':atrial_bounds=(205,370)
 onset_bounds=(-90.,10.)
 if t.osc:
  # Candidate wave families differ before fitting; phase/frequency are then
  # estimated on training samples, with fixed readout for the holdout.
  for index in range(2):
   trial=copy.deepcopy(p)
   for i in range(4):trial['cycle'+str(i)]=float(np.clip(trial['cycle'+str(i)]*(1+.08*index*(-1)**i),105,325))
   names=[f'cycle{i}' for i in range(4)]+[f'phase{i}' for i in range(4)]+['duty']
   bounds=[(105,330)]*4+[(-160,200)]*4+[(.42,.72)]
   trial,m=fit_parameters(engine,t,trial,names,bounds,nfev=18,label=f'Regional rotating-wave candidate {index+1}');history.append(m)
   candidates.append((f'rotating-waves-{index+1}',f'Regional rotating-wave hypothesis {index+1}',trial,'pathology',10))
 else:
  names=['onset','speed','gain','apd',atrial_parameter,'atrialGain'];bounds=[onset_bounds,(.55,1.65),(.15,4),(apdlo,apdhi),atrial_bounds,(0,3)]
  if t.kind=='vt':names=['onset','speed','gain','apd'];bounds=[(-110,20),(.35,1.5),(.15,4),(80,apdhi)]
  prior,m=fit_parameters(engine,t,p,names,bounds,variant='healthy',nfev=20,label='Aligned reference hypothesis');history.append(m)
  candidates.append(('reference-prior','Aligned reference hypothesis',prior,'healthy',10))
  trial=copy.deepcopy(prior)
  if t.kind.startswith('stemi'):trial.update(injuryMv=28.,injuryShortening=50.,injuryDelay=8.)
  names=['onset','speed','gain','apd','transmural','apicobasal','rvApd','rightDelay','anteriorDelay','posteriorDelay']
  bounds=[onset_bounds,(.45,1.85),(.15,4),(apdlo,apdhi),(0,110),(-70,70),(-70,70),(0,90),(0,90),(0,90)]
  if t.kind=='vt':names=names[:7];bounds=[(-120,20),(.35,1.65),(.15,4),(80,apdhi),(0,80),(-50,50),(-50,50)]
  if t.kind.startswith('stemi'):
   names+=['injuryMv','injuryShortening','injuryDelay'];bounds +=[(0,65),(0,130),(0,45)]
  focus=10
  if t.kind in ['pvc','vt']:
   trials=[]
   for focus_i in [1,7,10]:
    pp,mm=fit_parameters(engine,t,trial,['onset','speed','gain'],[(-110,20),(.35,1.8),(.15,4)],focus=focus_i,nfev=12,label=f'Ventricular-origin candidate {focus_i}');history.append(mm);trials.append((mm['trainingRmseMv'],pp,focus_i))
   _,trial,focus=min(trials,key=lambda a:a[0])
  trial,m=fit_parameters(engine,t,trial,names,bounds,focus=focus,nfev=25,label='Pathology-constrained source');history.append(m)
  candidates.append(('pathology-source','Pathology-constrained source',trial,'pathology',focus))
  flex=copy.deepcopy(trial);names2=['apdCos','apdSin','atrialSpeed',atrial_parameter,'atrialGain'];bounds2=[(-60,60),(-60,60),(.6,1.7),atrial_bounds,(0,3)]
  if t.kind in ['afib','af-rvr','flutter']:names2+=['atrialCycle'];bounds2 +=[(135,250)]
  if t.kind=='vt':names2=['apdCos','apdSin'];bounds2=[(-45,45),(-45,45)]
  flex,m=fit_parameters(engine,t,flex,names2,bounds2,focus=focus,nfev=18,label='Regional recovery and atrial refinement');history.append(m)
  candidates.append(('regional-refinement','Regional recovery and atrial refinement',flex,'pathology',focus))
 # Exact native scoring selects among model experiments. Keep all experiments.
 scored=[]
 for cid,label,params,variant,focus in candidates:
  pred,coefs=engine.project(engine.physical(params,t,engine.native,variant,focus,dt=1.,db=4.),t)
  loss=score(pred,t.train,t.train_mask,t.names,t.fit_names)['independentLeadRmseMv'];scored.append((loss,cid,label,params,variant,focus,coefs))
 requires_pathology=t.kind in ['lbbb','mobitz2','leftaxis','rightaxis','vt'] or t.kind.startswith('stemi')
 best=min([a for a in scored if not requires_pathology or a[4]!='healthy'],key=lambda a:a[0])
 # Resolve spatial aggregation error on the actual native operator.
 if not t.osc:
  keys=['onset','speed','gain','apd'];bounds=[onset_bounds,(.4,1.9),(.15,4),(80 if t.kind=='vt' else apdlo,apdhi)]
  refined,m=fit_parameters(engine,t,best[3],keys,bounds,variant=best[4],focus=best[5],nfev=12,native=True,label='All-node physical refinement');history.append(m)
  scored[-1]=(0,'all-node-refinement','All-node physical refinement',refined,best[4],best[5],None)
 # Export each physical candidate using the refined 2.4M-source quadrature.
 approaches=[];best_score=float('inf');selected=None;selection=None
 for _,cid,label,params,variant,focus,_ in scored:
  if not t.full:params['atrialOnset']=params['onset']-params['avDelay']
  fields=refined_field(engine,engine.fields(params,t,engine.native,variant,focus));geo={'W':engine.dense_weights()}
  physical=engine.physical(params,t,geo,variant,focus,dt=.75,db=3.,fields=fields)
  pred,coefs=engine.project(physical,t)
  tr=score(pred,t.train,t.train_mask,t.names,t.fit_names);ho=score(pred,t.test,t.test_mask,t.names,t.fit_names)
  obj={'id':cid,'label':label,'mechanismVariant':variant,'parameters':params,'field':export_field(engine,fields,params),'ecg':as_dict(pred,t.names),'metrics':{'training':{'wholeBeat':tr},'heldOut':{'wholeBeat':ho}},'recordingProjection':coefs,'description':'Source parameters are applied before the original finite-torso operator. No recorded ECG samples are inserted into the prediction.'}
  approaches.append(obj)
  if tr['independentLeadRmseMv']<best_score and (not requires_pathology or variant!='healthy'):best_score=tr['independentLeadRmseMv'];selected=cid;selection=(params,variant,focus,fields,pred,coefs)
 params,variant,focus,fields,pred,coefs=selection
 # Independent all-site matrix products at selected instants. This tests the
 # histogram quadrature against the same displayed field, not clinical truth.
 sample_indices=np.unique(np.linspace(0,len(t.time)-1,7).astype(int));verification=verify_direct(engine,t,params,fields,physical=None,predicted=pred,coefs=coefs,indices=sample_indices)
 selected_obj=next(a for a in approaches if a['id']==selected)
 limitations=[
  'An ECG does not uniquely determine an internal activation map. This is a constrained explanatory hypothesis on a generic CT-derived heart, not a patient-specific digital twin or an invasive measurement.',
  'The anatomy, optical action-potential template and clinical ECG come from different people. Torso conductivity, electrode placement, ischemic extent and precise Purkinje anatomy are not known for these recordings.',
  'Activation follows a graph surrogate or an explicitly declared oscillator hypothesis. This is not a coupled bidomain ionic-tissue simulation, and the animation does not establish a patient’s mechanical function.',
  'A normalized human optical ventricular waveform informs recovery shape. Absolute resting/peak voltages, local AP durations, source gains and regional timing are model assumptions fitted within declared bounds.',
  'The reconstruction explores fewer anatomical and pose alternatives than the two retained deep RBBB/anterior STEMI experiments. Poor agreement remains visible and is not evidence that a particular proposed circuit is correct.',
 ]
 if t.full:limitations.append('Event times in the holdout are supplied from source annotations or existing visualization anchors. The holdout tests waveform shape conditional on that clock, not prediction of arrhythmia onset or future beat timing.')
 if coefs:limitations.append('Unknown channel geometry is represented by a three-dimensional fixed linear recording projection fitted on training samples. ECG1/ECG2 and MLII retain their source names; no standard lead identity or measured 3D axis is inferred.')
 if t.osc:limitations.append('VF/TdP use four bounded regional rotating-wave hypotheses. The physiological literature supports diverse organized and disorganized mechanisms, but this surface recording cannot identify these particular rotors. Spectral initialization is descriptive; a low waveform error would not validate the circuit.')
 if t.kind=='complete':limitations.append('A complete measured P-wave series is unavailable. The atrial clock is the lesson’s independent 98/min prior with fitted phase; it is not coupled to ventricular escape events.')
 if t.kind=='pvc':limitations.append('The atrial timing prior follows regular ventricular anchors only. No atrial impulse is inserted at the PVC anchor; actual sinus activity or retrograde conduction during the ectopic beat is not identified. The single ectopic event is in training, so its source focus has no independent ectopic-beat validation.')
 if t.kind.startswith('stemi'):limitations.append('The model combines reduced AP excursion, depolarized rest, shortened AP duration and delayed activation within a smooth territory. The fixed 60:40 rest/plateau attribution cannot be separately identified after baseline subtraction. Ischemia is distinct from electrically inert scar; the model does not turn an infarct label into a measured scar map.')
 bounds_by_name={}
 for attempt in history:
  for key,(lo,hi) in zip(attempt['parameters'],attempt['bounds']):
   previous=bounds_by_name.get(key,(lo,hi));bounds_by_name[key]=(min(lo,previous[0]),max(hi,previous[1]))
 boundary_flags=[]
 for key,(lo,hi) in bounds_by_name.items():
  value=params[key];fraction=(value-lo)/max(hi-lo,1e-9)
  if fraction<=.02 or fraction>=.98:boundary_flags.append({'parameter':key,'value':value,'bounds':[lo,hi],'boundary':'lower' if fraction<=.02 else 'upper'})
 physiology=[]
 if not t.full:
  delay_bounds=(205,370) if t.kind=='avblock1' else (120,210) if t.kind in ['normal','brady','tachy'] else (100,230)
  physiology.append(f'The nominal atrial-to-ventricular source-timing delay is {params["avDelay"]:.0f} ms within a {delay_bounds[0]}–{delay_bounds[1]} ms physiological prior. Local graph travel and sampled source positions can shift the actual first-activation gap by several milliseconds. This timing parameter is not a measured ECG PR interval.')
 if boundary_flags:physiology.append('Boundary-limited parameters: '+', '.join(flag['parameter'] for flag in boundary_flags)+'. These limits describe the model search, not measured tissue properties; waveform residuals and alternative explanations remain relevant.')
 if t.kind.startswith('stemi'):physiology.append('Ischemic AP shortening, conduction delay and the injury amplitude are bounded illustrative assumptions. No invasive tissue measurement identifies their individual values in this recording.')
 if t.osc:physiology.append('Only the training window initializes the frequency prior. Regional phases are explanatory hypotheses; poor held-out agreement limits any interpretation of the proposed dynamics.')
 physiology_note=' '.join(physiology)
 title={'lbbb':'Delayed left-ventricular recruitment','afib':'Irregular ventricular timing and asynchronous atria','af-rvr':'Rapid irregular ventricular response','mobitz1':'Atrial impulses with grouped ventricular conduction','mobitz2':'Dropped atrial conduction with a delayed right ventricle','complete':'Independent atrial and ventricular clocks','pvc':'A premature ventricular-origin activation','vt':'Rapid ventricular-origin activation','flutter':'Repetitive atrial activity and variable conduction','vf':'Competing ventricular activation hypotheses','torsades':'Changing ventricular-wave projection','lvh':'A high-voltage ventricular source pattern','rvh':'Right-ventricular pattern and recovery differences','leftaxis':'Altered anterior-fascicular delivery','rightaxis':'Altered posterior-fascicular delivery'}.get(t.kind,t.record['title'])
 description=t.event['profile'].get('electrical') or t.event['profile'].get('summary') or t.record.get('description') or 'Compare a fitted tissue-source hypothesis with the recorded ECG.'
 method='Original finite-torso reciprocal volume operator; 340,582 native electrical nodes and 2,400,926 refined Vm quadrature sites. Spatial aggregation accelerates optimization; exported traces use all source weights. Bounded local activation/APD/injury parameters precede the ECG calculation.'
 target={'quality':t.quality,'source':{k:t.record[k] for k in ['source','sourceUrl','recordUrl','downloadUrl','license','licenseUrl','recordSha256','checksumVerified','attribution','sourceLabels'] if k in t.record},'nativeFs':t.fs,'baselineWindowMs':t.baseline,'analysisWindowMs':[float(t.time[0]),float(t.time[-1])],'fiducialsMs':{} if t.full else {'pOnset':-260 if t.kind=='avblock1' else -205,'qrsOnset':t.qrs_onset,'qrsOffset':120 if t.kind=='lbbb' else 70,'tOffset':min(float(t.time[-1]),float(params['apd']+70))},'fiducialProvenance':'Approximate initialization landmarks; not validated clinical interval measurements.','anchorDefinition':'Milliseconds from recording start' if t.full else 'One common existing QRS anchor for every simultaneous lead; no independent P or T time warping.','interpolation':f'Linear display interpolation from the original {t.fs} Hz samples; it does not create new measurement resolution.','baselineDefinition':t.baseline_note}
 ecg={'observed':as_dict(t.observed,t.names),'train':as_dict(t.train,t.names),'heldOut':as_dict(t.test,t.names),'predicted':as_dict(pred,t.names),'residual':as_dict(pred-t.observed,t.names)}
 if t.p25 is not None:ecg.update(p25=as_dict(t.p25,t.names),p75=as_dict(t.p75,t.names))
 payload={'schemaVersion':2,'reconstructed':True,'recordId':t.id,'title':title,'description':description,'methodSummary':method,'physiologyNote':physiology_note,'parameterBoundaryFlags':boundary_flags,'kind': 'stemi' if t.kind.startswith('stemi') else t.kind,'conditionId':t.kind,'timeMs':t.time.tolist(),'rrMs':t.rr,'timeReference':'recording' if t.full else 'r-anchor','availableLeads':t.names,'independentLeads':t.fit_names,'representativeLead':t.record.get('recommendedLead',t.names[0]),'selectedApproachId':selected,'selectionReason':'Minimum raw-mV training error among source experiments compatible with the declared pathology; an aligned reference is retained for comparison. Held-out waveform values were not used for selection.','field':selected_obj['field'],'ecg':ecg,'approaches':approaches,'metrics':selected_obj['metrics'],'parameters':params,'target':target,'comparisonWindowsMs':{'wholeBeat':[float(t.time[0]),float(t.time[-1])]},'sourceSummary':{'method':method,'sourceSiteCount':2400926,'nativeNodeCount':engine.f.n,'displaySourceSiteCount':len(engine.f.base['field']['sourceGlobalIds']),'fitScope':'Conditional source-field hypothesis; not uniquely identified anatomy.'},'provenance':{'sources':SOURCES,'sourceRecord':t.id,'originalSignalFileUnmodified':True,'reconstructionScript':'research/regenerated-fits/scripts/regenerate_all_cases.py','objective':'Training waveform error on available independent channels; bounded source fields. Unknown-channel readout coefficients fit training samples only.','referenceDefinition':t.baseline_note},'limitations':limitations,'numericalVerification':verification,'optimizationHistory':history,'recordingProjection':coefs,'trainingWindowMs':t.trainingWindow,'heldOutWindowMs':t.heldOutWindow}
 OUT.mkdir(parents=True,exist_ok=True);(OUT/(t.id+'.json')).write_text(json.dumps(plain(payload),separators=(',',':'),allow_nan=False))
 return {'id':t.id,'condition':t.kind,'selectedApproachId':selected,'approaches':len(approaches),'trainingRmseMv':selected_obj['metrics']['training']['wholeBeat']['independentLeadRmseMv'],'heldOutRmseMv':selected_obj['metrics']['heldOut']['wholeBeat']['independentLeadRmseMv'],'heldOutCorrelation':selected_obj['metrics']['heldOut']['wholeBeat']['medianIndependentLeadCorrelation'],'directCheck':verification,'timeReference':payload['timeReference']}

def verify_direct(engine,t,p,f,physical,predicted,coefs,indices):
 # Compute Vm at seven representative instants and one matched reference.
 # For full windows, the stored model median reference is inferred from the
 # dense histogram; report derivative-free shape agreement after one offset.
 W=engine.dense_weights();ch=f['chamber'];types=ch>2;weights=W*np.where(types,p['atrialGain'],p['gain'])[:,None]
 values=[]
 for index in indices:
  time_ms=t.time[index];q=np.zeros(len(ch))
  if f['streams']:
   for s in f['streams']:
    mask=types==bool(s['type'])
    if 'chamber' in s:mask&=ch==s['chamber']
    if 'region' in s:mask&=f['regions']==s['region']
    at=s.get('activation',f['at'])[mask];apd=f['apd'][mask];tpl=engine.f.tpl['atrial' if s['type'] else 'ventricular']
    if 'periodMs' in s:
     per=s['periodMs'];age=np.mod(time_ms,per)-at;v=sum(fm.q_at(age-k*per,apd,tpl) for k in [-1,0,1])
    else:v=sum((fm.q_at(time_ms-e-at,apd,tpl) for e in s['eventsMs'] if -450<time_ms-e<1550),np.zeros(mask.sum()))
    q[mask]+=v
  else:
   for typ,key in [(0,'ventricular'),(1,'atrial')]:
    mask=types==bool(typ);q[mask]=sum(fm.q_at(time_ms-f['at'][mask]-k*t.rr,f['apd'][mask],engine.f.tpl[key]) for k in [-1,0,1])
  values.append((f['rest']+f['amp']*q)@weights)
 raw=np.array(values)
 if len(t.names)==12:arr=fm.all_leads(raw)
 else:
  standard=fm.all_leads(raw);basis=np.column_stack([raw[:,0],raw[:,1],raw[:,3]-raw[:,6]])
  arr=np.column_stack([standard[:,LEADS.index(l)] if l in LEADS else basis@np.asarray(coefs[l]) for l in t.names])
 delta=arr-predicted[indices];offset=np.median(delta,axis=0);err=delta-offset
 return {'sourceSiteCount':len(ch),'directSampleCount':len(indices),'sampleTimesMs':t.time[indices].tolist(),'shapeRmseMv':float(np.sqrt(np.mean(err**2))),'shapeMaxAbsoluteMv':float(np.max(np.abs(err))),'referenceNote':'A single constant per channel aligns the model baseline for this independent sparse matrix-product check; no time-dependent correction is applied. Final curves use a 0.75 ms activation / 3 ms APD histogram.','predictionMethod':'Every refined source weight is included; Vm uses the same temporal event model and normalized templates as the browser.'}

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--case');parser.add_argument('--start',type=int,default=0);parser.add_argument('--limit',type=int);args=parser.parse_args()
 records=[r for n in COLLECTIONS for r in json.loads((SITE/'data'/f'{n}.json').read_text())['records']]
 events={r['id']:r for r in json.loads((ROOT/'clinical-events.json').read_text())}
 records=[r for r in records if r['id'] not in ['ptbxl-03155','acs-00004'] and (not args.case or r['id']==args.case)][args.start:]
 if args.limit:records=records[:args.limit]
 engine=Engine();report=[]
 for r in records:
  start=time.time();print('FITTING',r['id'],r['title'],flush=True)
  result=fits_for_case(engine,Target(r,events[r['id']]));result['seconds']=time.time()-start;report.append(result)
  dest=SITE/'data/pathology-fits'/f'reconstruction-summary-{args.case or str(args.start)}.json';dest.write_text(json.dumps(plain(report),indent=2,allow_nan=False));print('EXPORTED',json.dumps(result),flush=True)
 if not args.case and args.start==0 and not args.limit:(SITE/'data/pathology-fits/reconstruction-summary.json').write_text(json.dumps(plain(report),indent=2))

if __name__=='__main__':
 with threadpool_limits(limits=2):main()

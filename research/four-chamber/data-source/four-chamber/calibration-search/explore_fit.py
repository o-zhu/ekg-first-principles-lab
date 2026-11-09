from pathlib import Path
import json,time,sys
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.optimize import differential_evolution,minimize,least_squares
from scipy.signal import fftconvolve
from scipy.interpolate import PchipInterpolator

import os
ROOT=Path(__file__).resolve().parents[3]
WORK=Path(os.environ.get('ECG_CALIBRATION_WORKDIR', '/tmp/cardiac-calibration-replay')); WORK.mkdir(parents=True, exist_ok=True)
model=json.loads((WORK/'baseline-heart-model.json').read_text())
c=np.load(WORK/'baseline-operators.npz')
W=c['W'];at0=c['activation'];seeds=json.loads(str(c['seeds']))
N=len(at0);NV=250416
geo=np.load(ROOT/'data-source/four-chamber/rodero-myocardium.npz')
v_ids=np.unique(geo['tetrahedra'][geo['tags']<3]);a_ids=np.unique(geo['tetrahedra'][geo['tags']>2]);point_ids=np.r_[v_ids,a_ids]
rho=np.clip(geo['rho'][point_ids],0,1);z=np.clip(geo['z'][point_ids],0,1)
chamber=np.zeros(N,np.int8);vmapping=np.full(len(geo['points']),-1,int);amapping=vmapping.copy();vmapping[v_ids]=np.arange(NV);amapping[a_ids]=NV+np.arange(len(a_ids))
for k in [1,2]:chamber[vmapping[np.unique(geo['tetrahedra'][geo['tags']==k])]]=k
for k in [3,4]:chamber[amapping[np.unique(geo['tetrahedra'][geo['tags']==k])]]=k
contrast=40*(.5-rho)+30*(z-.5)-12*(chamber==2);contrast-=np.median(contrast[:NV])
apd0=np.where(np.arange(N)<NV,305+contrast,model['templates']['atrial']['apd90Ms']+12*(chamber==3)-6*(chamber==4))
T=np.arange(1001.)
reference=json.loads((ROOT/'data-source/four-chamber/ptb-healthy-reference.json').read_text())
target=np.interp(T-231,np.arange(-300,600),reference['leadIIMv'],left=0,right=0)
base=np.array(model['variants']['heterogeneous']['ecg']['II']);base_a=np.array(model['variants']['heterogeneous']['ecgAtrial']['II'])

def distances():
 path=WORK/'root-distances.npz'
 if path.exists():return np.load(path)['D']
 e=c['edges'];tr=c['travel'];mask=(e[:,0]<NV)&(e[:,1]<NV);e=e[mask];tr=tr[mask]
 graph=coo_matrix((np.r_[tr,tr],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(NV,NV)).tocsr()
 D=np.empty((12,NV),np.float32)
 for i,s in enumerate(seeds[:12]):
  D[i]=dijkstra(graph,directed=False,indices=s['node']);print('Distance',i,flush=True)
 np.savez_compressed(path,D=D)
 return D

def shape(age,apd=305,typ='ventricular',smooth=0,shape50=.62):
 t=model['templates'][typ];anchor=t['warpAnchorMs']
 warped=np.where(age<=anchor,age,anchor+(age-anchor)*(t['apd90Ms']-anchor)/(apd-anchor))
 optical=np.interp((warped+t['activationMs'])/t['dtMs'],np.arange(len(t['normalized'])),t['normalized'],left=0,right=0)
 if not smooth or typ!='ventricular':return optical
 # Sigmoidal repolarization with exact normalized APD90 and prescribed APD50.
 # Plateau decline derives from the membrane waveform, not the ECG.
 width=apd*(1-shape50)/np.log(9)
 down=1/(1+np.exp(np.clip((age-shape50*apd)/width,-80,80)))
 # Rest and peak are fixed, so normalize the post-upstroke recovery branch.
 peak=1/(1+np.exp((4-shape50*apd)/width))
 down=np.minimum(down/peak,1)
 rise=.5*(1+np.tanh(age/.9102392266));rise=np.where(age<-5,0,rise)
 smoothed=np.where(age<=4,rise,down)
 # Tail correction reaches rest smoothly at APD90+150ms rather than infinity.
 tail=np.clip((apd+220-age)/80,0,1);tail=tail*tail*(3-2*tail)
 smoothed*=tail
 return optical*(1-smooth)+smoothed*smooth

def fast(ats,apds,weights,typ='ventricular',dt=.25,db=1.,smooth=0,shape50=.62):
 # Bilinear deposit in activation time and duration; no source-node reduction.
 # All signed source weights retained. Independent exact calculation follows fit.
 na=int(1000/dt)+1;ad=np.asarray(apds)/db;a0=np.floor(ad).astype(int);af=ad-a0
 lo=int(a0.min());hi=int(a0.max())+1;ns=hi-lo+1
 at=np.asarray(ats)/dt;i=np.floor(at).astype(int);frac=at-i
 bins=np.zeros((ns,na))
 for da,aw in [(0,1-af),(1,af)]:
  for ds,sw in [(0,1-frac),(1,frac)]:
   ix=(a0+da-lo)*na+i+ds
   bins+=np.bincount(ix,weights=weights*aw*sw,minlength=ns*na).reshape(ns,na)
 ages=np.arange(-10,801+dt/2,dt)
 kernels=np.array([shape(ages,k*db,typ,smooth,shape50) for k in range(lo,hi+1)])
 ans=fftconvolve(bins,kernels,axes=1).sum(axis=0)
 shift=round(10/dt);ans=ans[shift:shift+na]
 t=model['templates'][typ];ans*=t['peakMv']-t['restMv']
 return np.interp(T,np.arange(na)*dt,ans)

def exact(ats,apds,weights,typ='ventricular',smooth=0,shape50=.62):
 out=[];tt=model['templates'][typ];scale=tt['peakMv']-tt['restMv']
 for t in T:
  out.append(shape(t-ats,apds,typ,smooth,shape50)@weights*scale)
 return np.array(out)

def errors(ecg):
 windows={'whole':(0,700),'p':(10,180),'qrs':(185,310),'stt':(310,700)}
 return {k:float(np.sqrt(np.mean((ecg[a:b]-target[a:b])**2))) for k,(a,b) in windows.items()}

if __name__=='__main__':
 print('BASE',errors(base),flush=True)
 print('surrogate check start',flush=True);start=time.time()
 q=fast(at0[:NV],apd0[:NV],W[:NV,1])+base_a
 print('surrogate',time.time()-start,'maxerr',abs(q-base).max(),errors(q),flush=True)
 D=distances()
 # Four regional onset shifts, shared propagation-speed scale; relative extents.
 x0=np.array([200,202,204,207,1.])
 bounds=[(185,215),(185,220),(185,220),(185,225),(.75,1.28)]
 count=0;best=[1e3]
 def calculate(x,full=False):
  ats=np.min(D/x[4]+np.repeat(x[:4],3)[:,None],axis=0)
  e=fast(ats,apd0[:NV],W[:NV,1],dt=.5,db=4.)+base_a
  return (e,ats) if full else e
 def fun(x):
  global count
  e=calculate(x);qrs=np.mean((e[185:310]-target[185:310])**2)
  penalty=.00015*np.mean(((x[:4]-[200,202,204,207])/12)**2)
  loss=qrs+penalty;count+=1
  if loss<best[0]:
   best[0]=loss
   if count%10==0:print('best',count,loss,x.tolist(),flush=True)
  return loss
 result=differential_evolution(fun,bounds,popsize=6,maxiter=24,tol=.002,polish=False,seed=731)
 res=minimize(fun,result.x,method='Nelder-Mead',bounds=bounds,options={'maxiter':180,'xatol':.02})
 e,ats=calculate(res.x,True)
 out={'x':res.x.tolist(),'loss':float(res.fun),'errors':errors(e),'baseErrors':errors(base),'evaluations':count,'leadII':e.tolist(),'description':'4 regional activation onsets plus global graph speed'}
 (WORK/'fit1-regions.json').write_text(json.dumps(out,indent=2));np.save(WORK/'fit1-activation.npy',ats)
 print('FINAL',out['x'],out['errors'],out['evaluations'],flush=True)

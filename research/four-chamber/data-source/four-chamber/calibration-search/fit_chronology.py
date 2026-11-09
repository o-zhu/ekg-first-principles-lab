from explore_fit import *
D=distances();best=[1e3];count=0
# common onset, anterior LV delta, inferior LV delta, RV delay, velocity scale,
# shared ventricular source-conductivity scale. No ECG waveform scale.
bounds=[(180,212),(-5,5),(-5,5),(3,12),(.70,1.28),(.7,1.5)]
def calculate(x,full=False):
 onsets=x[0]+np.array([0,x[1],x[2],x[3]])
 ats=np.min(D/x[4]+np.repeat(onsets,3)[:,None],axis=0)
 e=fast(ats,apd0[:NV],W[:NV,1]*x[5],dt=.5,db=4.)+base_a
 return (e,ats) if full else e
def fun(x):
 global count
 e=calculate(x);loss=np.mean((e[185:310]-target[185:310])**2)+.0002*((x[4]-1)/.3)**2+.0003*((x[5]-1)/.5)**2
 count+=1
 if loss<best[0]:
  best[0]=loss
  if count%10==0:print('best',count,loss,x.tolist(),flush=True)
 return loss
res=differential_evolution(fun,bounds,popsize=7,maxiter=35,tol=.002,polish=False,seed=732)
res=minimize(fun,res.x,method='Nelder-Mead',bounds=bounds,options={'maxiter':250,'xatol':.01})
e,ats=calculate(res.x,True)
out={'x':res.x.tolist(),'loss':float(res.fun),'errors':errors(e),'baseErrors':errors(base),'evaluations':count,'leadII':e.tolist(),'description':'4 regional activation onsets constrained to mapping chronology, global graph speed, ventricular source conductivity'}
(WORK/'fit2-chronology.json').write_text(json.dumps(out,indent=2));np.save(WORK/'fit2-activation.npy',ats)
print('FINAL',out['x'],out['errors'],out['evaluations'],flush=True)

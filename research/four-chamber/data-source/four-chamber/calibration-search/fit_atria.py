from explore_fit import *
path=WORK/'atrial-root-distances.npz'
if path.exists():D=np.load(path)['D']
else:
 e=c['edges'];tr=c['travel'];mask=(e[:,0]>=NV)&(e[:,1]>=NV);e=e[mask]-NV;tr=tr[mask]
 graph=coo_matrix((np.r_[tr,tr],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(N-NV,N-NV)).tocsr()
 D=np.array([dijkstra(graph,directed=False,indices=s['node']-NV)for s in seeds[12:]],np.float32)
 np.savez_compressed(path,D=D)
bounds=[(15,55),(12,45),(.5,1.10),(.025,.14)]
count=0;best=[1e3]
def calc(x,full=False):
 ats=np.min(D/x[2]+np.array([x[0],x[0]+x[1]])[:,None],axis=0)
 e=fast(ats,apd0[NV:],W[NV:,1]*x[3]/.11,typ='atrial',dt=.5,db=4.)
 return (e,ats)if full else e
def fun(x):
 global count
 e=calc(x);loss=np.mean((e[5:180]-target[5:180])**2)
 # Require completion before ventricular activation, with a real PR interval.
 duration=(np.min(D/x[2]+np.array([x[0],x[0]+x[1]])[:,None],axis=0)).max()
 loss+=max(0,duration-185)**2*.0001
 count+=1
 if loss<best[0]:best[0]=loss
 return loss
res=differential_evolution(fun,bounds,popsize=6,maxiter=24,tol=.001,polish=False,seed=733)
res=minimize(fun,res.x,method='Nelder-Mead',bounds=bounds,options={'maxiter':150,'xatol':.01})
e,ats=calc(res.x,True)
out={'x':res.x.tolist(),'loss':float(res.fun),'pRmse':float(np.sqrt(np.mean((e[5:180]-target[5:180])**2))),'baselinePRmse':float(np.sqrt(np.mean((base_a[5:180]-target[5:180])**2))),'evaluations':count,'leadIIAtrial':e.tolist(),'activationRange':[float(ats.min()),float(ats.max())],'description':'Sinus onset, interatrial delay, isotropic atrial graph speed, and atrial source conductivity'}
(WORK/'fit-atria.json').write_text(json.dumps(out,indent=2));np.save(WORK/'fit-atria-activation.npy',ats)
print('ATRIAL FIT',{k:v for k,v in out.items()if k!='leadIIAtrial'},flush=True)

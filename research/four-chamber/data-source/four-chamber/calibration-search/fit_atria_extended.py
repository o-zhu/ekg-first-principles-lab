from explore_fit import *
ac=np.load(os.environ['ECG_EXTENDED_OPERATOR']);aw=ac['W'][NV:,1];ae=ac['edges'];atr=ac['travel'];AN=len(aw)
apd=np.r_[apd0[NV:],np.full(AN-(N-NV),model['templates']['atrial']['apd90Ms']+12)]
path=WORK/'extended-atrial-root-distances.npz'
if path.exists():D=np.load(path)['D']
else:
 mask=(ae[:,0]>=NV)&(ae[:,1]>=NV);e=ae[mask]-NV;tr=atr[mask]
 graph=coo_matrix((np.r_[tr,tr],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(AN,AN)).tocsr()
 D=np.array([dijkstra(graph,directed=False,indices=s['node']-NV)for s in seeds[12:]],np.float32);np.savez_compressed(path,D=D)
bounds=[(0,55),(20,45),(.5,1.1),(.025,.14)];count=0
def calc(x,full=False):
 ats=np.min(D/x[2]+np.array([x[0],x[0]+x[1]])[:,None],axis=0)
 e=fast(ats,apd,aw*x[3]/.11,typ='atrial',dt=.5,db=4.)
 return (e,ats)if full else e
def fun(x):
 global count
 e=calc(x);loss=np.mean((e[5:180]-target[5:180])**2);ats=np.min(D/x[2]+np.array([x[0],x[0]+x[1]])[:,None],axis=0)
 loss+=max(0,ats.max()-180)**2*.0001;count+=1
 return loss
res=differential_evolution(fun,bounds,popsize=6,maxiter=24,tol=.001,polish=False,seed=733)
res=minimize(fun,res.x,method='Nelder-Mead',bounds=bounds,options={'maxiter':150,'xatol':.01})
e,ats=calc(res.x,True)
out={'x':res.x.tolist(),'loss':float(res.fun),'pRmse':float(np.sqrt(np.mean((e[5:180]-target[5:180])**2))),'baselinePRmse':float(np.sqrt(np.mean((base_a[5:180]-target[5:180])**2))),'evaluations':count,'leadIIAtrial':e.tolist(),'activationRange':[float(ats.min()),float(ats.max())],'description':'ExtendedLAA;sinusonset,interatrialdelay20–45ms,atrialgraphspeed,sourceconductivity'}
(WORK/'fit-atria-extended.json').write_text(json.dumps(out,indent=2));np.save(WORK/'fit-atria-extended-activation.npy',ats)
print('ATRIAL EXTENDED',{k:v for k,v in out.items()if k!='leadIIAtrial'},flush=True)

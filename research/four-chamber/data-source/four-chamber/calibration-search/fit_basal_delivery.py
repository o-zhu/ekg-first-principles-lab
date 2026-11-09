from explore_fit import *
from scipy.signal import find_peaks,peak_prominences
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--template',default='optical');args=parser.parse_args()
if args.template=='pooled':
 model['templates']['ventricular']=json.loads((ROOT/'data-source/four-chamber/pooled-human-ventricular-template.json').read_text())
elif args.template!='optical':
 template=json.loads((ROOT/'data-source/four-chamber'/('tt06-'+args.template+'-template.json')).read_text());template['warpAnchorMs']=4.
 age=np.arange(len(template['normalized']))*template['dtMs']-template['activationMs'];q=np.clip(template['normalized'],0,1);q[age<-3]=0;q*=np.clip((900-age)/100,0,1);template['normalized']=q.tolist();model['templates']['ventricular']=template
path=WORK/'basal-root-distances.npz'
if path.exists():saved=np.load(path);D=saved['D'];nodes=saved['nodes']
else:
 p=geo['points'][v_ids];lv=np.flatnonzero((chamber[:NV]==1)&(rho[:NV]<.001));rv=np.flatnonzero((chamber[:NV]==2)&(rho[:NV]<.001));long=np.array([-43.,50.,56.]);long/=np.linalg.norm(long);sep=p[rv].mean(0)-p[lv].mean(0);sep-=long*np.dot(sep,long);sep/=np.linalg.norm(sep);cross=np.cross(long,sep)
 nodes=[]
 for z0 in [.65,.80,.92]:
  pool=rv[np.abs(z[rv]-z0)<.045];center=p[pool].mean(0);targetp=center-14*sep;node=int(pool[np.argmin(np.linalg.norm(p[pool]-targetp,axis=1))]);nodes.append(node)
 e=c['edges'];tr=c['travel'];mask=(e[:,0]<NV)&(e[:,1]<NV);e=e[mask];tr=tr[mask]
 graph=coo_matrix((np.r_[tr,tr],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(NV,NV)).tocsr()
 new=np.array([dijkstra(graph,directed=False,indices=int(n))for n in nodes],np.float32);D=np.r_[distances(),new];np.savez_compressed(path,D=D,nodes=nodes)
fit=json.loads((WORK/'fit3-distributed.json').read_text());afit=json.loads((WORK/('fit-atria-extended.json' if args.template=='pooled' else 'fit-atria.json')).read_text());atrial=np.array(afit['leadIIAtrial'])
x0=np.r_[fit['x'][:12],[20,28,35],fit['x'][-2:]]
if args.template=='pooled':
 x0=np.array(json.loads((WORK/'fit5-basal-optical.json').read_text())['x']);poolfile=WORK/'fit-pooled-fit5-basal-optical-apd.npy'
 if poolfile.exists():apd0[:NV]=np.load(poolfile)
elif args.template!='optical':x0[-1]*=110/(template['peakMv']-template['restMv'])
lo=np.r_[175,np.zeros(8),np.ones(3)*3,[10,10,10],.65,.7];hi=np.r_[215,np.ones(8)*8,np.ones(3)*14,[45,45,45],1.05,1.7]
count=0
def calc(x,full=False):
 ats=np.min(D/x[-2]+(x[0]+np.r_[0,x[1:15]])[:,None],axis=0)
 e=fast(ats,apd0[:NV],W[:NV,1]*x[-1],dt=.5,db=4.)+atrial
 return(e,ats)if full else e
def residual(x):
 global count
 e=calc(x);err=e[185:310]-target[185:310];count+=1
 deriv=2*np.diff(e[210:305]-target[210:305])
 # Penalize a renewed upward slope after the main R; this is an explicit
 # normal single-R prior on parameter selection, not a waveform filter.
 positive=2*np.maximum(np.diff(e[240:305]),0)
 return np.r_[err,deriv,positive,.015*(x[-2]-1)/.3,.02*(x[-1]-1)/.5,.001*(x[1:15]-x0[1:15])]
best=None
for seed in range(1 if args.template=='pooled' else 3):
 start=x0.copy()if seed==0 else np.clip(best.x+np.random.default_rng(741+seed).normal(0,np.r_[1,np.ones(11)*1.2,np.ones(3)*4,.03,.03]),lo+.0001,hi-.0001)
 res=least_squares(residual,start,bounds=(lo,hi),diff_step=.002,x_scale=np.r_[10,np.ones(11)*4,np.ones(3)*10,.2,.4],max_nfev=90,ftol=1e-6,xtol=1e-5,gtol=1e-6)
 if best is None or np.sum(res.fun**2)<np.sum(best.fun**2):best=res
 print('RUN',seed,errors(calc(res.x)),flush=True)
e,ats=calc(best.x,True)
out={'x':best.x.tolist(),'extraSeedNodes':nodes.tolist()if hasattr(nodes,'tolist')else nodes,'errors':errors(e),'evaluations':count,'leadII':e.tolist(),'template':args.template,'description':'Three additional RVbasalendocardialdeliverysites at10–45msdelay,12originalPMJs,upstreamsingle-Rprior'}
stem='fit5-basal-'+args.template;(WORK/(stem+'.json')).write_text(json.dumps(out,indent=2));np.save(WORK/(stem+'-activation.npy'),ats)
print('FINAL',{k:v for k,v in out.items()if k!='leadII'},flush=True)

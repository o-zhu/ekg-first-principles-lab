from explore_fit import *
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--myocardium',type=float,default=.65);parser.add_argument('--endocardium',type=float,default=2.);parser.add_argument('--template',default='optical');args=parser.parse_args()
stem=f'fit4-myo{args.myocardium:.2f}-endo{args.endocardium:.2f}-{args.template}'
if args.template!='optical':
 template=json.loads((ROOT/'data-source/four-chamber'/('tt06-'+args.template+'-template.json')).read_text());template['warpAnchorMs']=4.
 age=np.arange(len(template['normalized']))*template['dtMs']-template['activationMs'];q=np.clip(template['normalized'],0,1);q[age<-3]=0;q*=np.clip((900-age)/100,0,1);template['normalized']=q.tolist();model['templates']['ventricular']=template
path=WORK/f'dist-myo{args.myocardium:.2f}-endo{args.endocardium:.2f}.npz'
if path.exists():D=np.load(path)['D']
else:
 e=c['edges'];tr=c['travel'];m=(e[:,0]<NV)&(e[:,1]<NV);e=e[m];tr=tr[m]/args.myocardium;f=(rho[e[:,0]]<.04)&(rho[e[:,1]]<.04);tr[f]=c['travel'][m][f]*2/args.endocardium
 graph=coo_matrix((np.r_[tr,tr],(np.r_[e[:,0],e[:,1]],np.r_[e[:,1],e[:,0]])),shape=(NV,NV)).tocsr()
 D=np.array([dijkstra(graph,directed=False,indices=s['node']) for s in seeds[:12]],np.float32);np.savez_compressed(path,D=D)
fit=json.loads((WORK/'fit3-distributed.json').read_text());afit=json.loads((WORK/'fit-atria.json').read_text());atrial=np.array(afit['leadIIAtrial'])
x0=np.r_[fit['x'][:12],fit['x'][-1]]
if args.template!='optical':x0[-1]*=110/(template['peakMv']-template['restMv'])
lo=np.r_[175,np.zeros(8),np.ones(3)*3,.7];hi=np.r_[220,np.ones(8)*8,np.ones(3)*14,1.7]
count=0
def calc(x,full=False):
 ats=np.min(D+(x[0]+np.r_[0,x[1:12]])[:,None],axis=0)
 e=fast(ats,apd0[:NV],W[:NV,1]*x[-1],dt=.5,db=4.)+atrial
 return (e,ats)if full else e
def residual(x):
 global count
 e=calc(x);err=e[185:310]-target[185:310]
 # A single broad R is the teaching prior; penalize rapid post-R reversals
 # via discrepancies in first derivative, still modifying only source times.
 derivative=.7*np.diff(e[210:305]-target[210:305])
 penalty=np.r_[.025*(x[-1]-1)/.5,.002*(x[1:12]-x0[1:12])]
 count+=1
 return np.r_[err,derivative,penalty]
best=None
for seed in range(2):
 start=x0.copy() if seed==0 else np.clip(best.x+np.random.default_rng(736).normal(0,np.r_[1,np.ones(11)*1.5,.03]),lo+.0001,hi-.0001)
 res=least_squares(residual,start,bounds=(lo,hi),diff_step=.002,x_scale=np.r_[10,np.ones(11)*4,.4],max_nfev=90,ftol=1e-6,xtol=1e-5,gtol=1e-6)
 if best is None or np.sum(res.fun**2)<np.sum(best.fun**2):best=res
 print('RUN',stem,seed,errors(calc(res.x)),flush=True)
e,ats=calc(best.x,True)
out={'x':best.x.tolist(),'myocardialScale':args.myocardium,'endocardialSpeed':args.endocardium,'errors':errors(e),'evaluations':count,'leadII':e.tolist(),'template':args.template,'description':'Independent endocardial/myocardial speed,12deliveryonsets,sourceconductivity; derivative discrepancy prior'}
(WORK/(stem+'.json')).write_text(json.dumps(out,indent=2));np.save(WORK/(stem+'-activation.npy'),ats)
print('FINAL',{k:v for k,v in out.items()if k!='leadII'},flush=True)

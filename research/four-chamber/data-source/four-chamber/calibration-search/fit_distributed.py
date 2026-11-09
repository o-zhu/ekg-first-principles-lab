from explore_fit import *
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--template',default='optical');args=parser.parse_args()
if args.template!='optical':
 template=json.loads((ROOT/'data-source/four-chamber'/('tt06-'+args.template+'-template.json')).read_text());template['warpAnchorMs']=4.
 age=np.arange(len(template['normalized']))*template['dtMs']-template['activationMs'];q=np.clip(template['normalized'],0,1);q[age<-3]=0;q*=np.clip((900-age)/100,0,1);template['normalized']=q.tolist();model['templates']['ventricular']=template
D=distances();fit=json.loads((WORK/'fit2-chronology.json').read_text());apfit=json.loads((WORK/'fit-atria.json').read_text());atrial=np.array(apfit['leadIIAtrial'])
# A finer delivery-time field: root0 anchors common onset, other LV roots
# remain within8ms, RV roots begin3–14ms later.
x=fit['x'];x0=np.r_[x[0],np.repeat([0,x[1],x[2],x[3]],3)[1:],x[4],x[5]]
if args.template!='optical':x0[-1]*=110/(template['peakMv']-template['restMv'])
lower=np.r_[175,np.zeros(8),np.ones(3)*3,.65,.70]
upper=np.r_[215,np.ones(8)*8,np.ones(3)*14,1.28,1.7]
count=0
def calc(x,full=False):
 onsets=x[0]+np.r_[0,x[1:12]]
 ats=np.min(D/x[12]+onsets[:,None],axis=0)
 e=fast(ats,apd0[:NV],W[:NV,1]*x[13],dt=.5,db=4.)+atrial
 return (e,ats)if full else e
def residual(x):
 global count
 e=calc(x);err=e[185:310]-target[185:310]
 penalty=np.r_[.025*(x[12]-1)/.3,.025*(x[13]-1)/.5,.002*(x[1:12]-x0[1:12])]
 count+=1
 return np.r_[err,penalty]
best=None
for seed in range(3):
 start=x0.copy() if seed==0 else np.clip(best.x+np.random.default_rng(734+seed).normal(0,np.r_[1,np.ones(11)*1.2,.03,.03]),lower+.0001,upper-.0001)
 res=least_squares(residual,start,bounds=(lower,upper),diff_step=.002,x_scale=np.r_[10,np.ones(11)*4,.2,.4],max_nfev=100,ftol=1e-6,xtol=1e-5,gtol=1e-6)
 if best is None or np.sum(res.fun**2)<np.sum(best.fun**2):best=res
 print('RUN',seed,errors(calc(res.x)),res.x.tolist(),flush=True)
e,ats=calc(best.x,True)
out={'x':best.x.tolist(),'errors':errors(e),'evaluations':count,'leadII':e.tolist(),'description':'12 delivery-site times within LV8ms/RV3–14ms, global speed and source conductivity'}
(WORK/('fit3-distributed.json' if args.template=='optical' else 'fit3-'+args.template+'.json')).write_text(json.dumps(out,indent=2));np.save(WORK/('fit3-activation.npy' if args.template=='optical' else 'fit3-'+args.template+'-activation.npy'),ats)
print('FINAL',{k:v for k,v in out.items()if k!='leadII'},flush=True)

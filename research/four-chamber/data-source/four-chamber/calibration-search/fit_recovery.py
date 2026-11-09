from explore_fit import *
import argparse
pa=argparse.ArgumentParser();pa.add_argument('--template',default='optical');pa.add_argument('--activation',default='fit3');args=pa.parse_args()
path=WORK/(args.activation+'-distributed.json' if args.activation=='fit3' else args.activation+'.json' if args.activation=='fit3-endo' else args.activation+'-chronology.json')
fit=json.loads(path.read_text());ats=np.load(WORK/(args.activation+'-activation.npy'))
vscale=fit['x'][-1];afit=json.loads((WORK/'fit-atria.json').read_text());atrial=np.array(afit['leadIIAtrial'])
if args.template in ('endo','epi'):
 other=json.loads((ROOT/'data-source/four-chamber'/('tt06-'+args.template+'-template.json')).read_text())
 print('TTkeys',list(other),flush=True)
 # Filled after official generator's format is inspected.
 other['warpAnchorMs']=4.;age=np.arange(len(other['normalized']))*other['dtMs']-other['activationMs'];q=np.clip(other['normalized'],0,1);q[age<-3]=0;q*=np.clip((900-age)/100,0,1);other['normalized']=q.tolist();model['templates']['ventricular']=other
smooth=1 if args.template=='sigmoid' else 0
lower=[270,0,-30,-35];upper=[340,100,100,30];x0=[305,40,30,-12]
if smooth:lower+=[.68];upper+=[.92];x0+=[.80]
count=0
def calc(x,full=False):
 con=x[1]*(.5-rho[:NV])+x[2]*(z[:NV]-.5)+x[3]*(chamber[:NV]==2);con-=np.median(con)
 apd=x[0]+con
 e=fast(ats,apd,W[:NV,1]*vscale,dt=.5,db=2.,smooth=smooth,shape50=x[4]if smooth else .8)+atrial
 return (e,apd)if full else e
def fun(x):
 global count
 e=calc(x);err=e[315:680]-target[315:680];count+=1
 return np.r_[err,.005*(np.array(x[:4])-x0[:4])/np.array([30,40,30,30])]
res=least_squares(fun,x0,bounds=(lower,upper),diff_step=.002,x_scale=[20,40,40,20]+([.1]if smooth else[]),max_nfev=100,ftol=1e-7,xtol=1e-6,gtol=1e-6)
e,apd=calc(res.x,True)
out={'x':res.x.tolist(),'errors':errors(e),'evaluations':count,'leadII':e.tolist(),'template':args.template,'activation':args.activation,'apdRange':[float(apd.min()),float(apd.max())],'description':'APDmedian,transmural,apicobasal,RVcontrast fit to referenceST/T'}
(WORK/('fit-recovery-'+args.template+'.json')).write_text(json.dumps(out,indent=2));np.save(WORK/('fit-recovery-'+args.template+'-apd.npy'),apd)
print('RECOVERY',{k:v for k,v in out.items()if k!='leadII'},flush=True)

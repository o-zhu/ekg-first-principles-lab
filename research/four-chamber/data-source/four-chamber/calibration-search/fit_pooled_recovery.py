from explore_fit import *
import argparse
pa=argparse.ArgumentParser();pa.add_argument('--activation',default='fit5-basal-optical');pa.add_argument('--kind',default='smooth');args=pa.parse_args()
fit=json.loads((WORK/(args.activation+'.json')).read_text());ats=np.load(WORK/(args.activation+'-activation.npy'));vscale=fit['x'][-1]
afit=json.loads((WORK/'fit-atria-extended.json').read_text());atrial=np.array(afit['leadIIAtrial'])
model['templates']['ventricular']=json.loads((ROOT/'data-source/four-chamber/pooled-human-ventricular-template.json').read_text())
if args.kind=='direct':model['templates']['ventricular']=model['templates']['ventricular']['alternatives']['equalDonorDirect']
lo=[260,0,-30,-35];hi=[365,100,100,40];x0=[330,50,20,-6];count=0
def calc(x,full=False):
 con=x[1]*(.5-rho[:NV])+x[2]*(z[:NV]-.5)+x[3]*(chamber[:NV]==2);con-=np.median(con);apd=x[0]+con
 e=fast(ats,apd,W[:NV,1]*vscale,dt=.5,db=2.)+atrial
 return(e,apd)if full else e
def residual(x):
 global count
 e=calc(x);count+=1
 return np.r_[e[315:620]-target[315:620],.003*(np.array(x)-x0)/np.array([30,40,30,30])]
res=least_squares(residual,x0,bounds=(lo,hi),diff_step=.002,x_scale=[30,40,40,20],max_nfev=130,ftol=1e-7,xtol=1e-6,gtol=1e-6)
e,apd=calc(res.x,True)
out={'x':res.x.tolist(),'errors':errors(e),'evaluations':count,'leadII':e.tolist(),'template':'Equal-donor pooled human optical recovery; Richards fit without ECG information','activation':args.activation,'apdRange':[float(apd.min()),float(apd.max())],'description':'Four APDfieldparameters fitted; pooledhumanmembraneshape heldfixed'}
stem='fit-pooled-'+args.activation+('-direct' if args.kind=='direct' else '');(WORK/(stem+'.json')).write_text(json.dumps(out,indent=2));np.save(WORK/(stem+'-apd.npy'),apd)
print('POOLED',{k:v for k,v in out.items()if k!='leadII'},flush=True)

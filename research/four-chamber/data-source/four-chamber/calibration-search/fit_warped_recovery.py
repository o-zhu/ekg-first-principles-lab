from explore_fit import *
from scipy.special import expit
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--activation',default='fit3-endo');args=parser.parse_args()
fit=json.loads((WORK/(args.activation+'.json')).read_text());ats=np.load(WORK/(args.activation+'-activation.npy'));vscale=fit['x'][-1]
afit=json.loads((WORK/'fit-atria.json').read_text());atrial=np.array(afit['leadIIAtrial'])
native=json.loads((ROOT/'data-source/four-chamber/tt06-endo-template.json').read_text());native['warpAnchorMs']=4.
native_age=np.arange(len(native['normalized']))*native['dtMs']-native['activationMs'];native_q=np.clip(native['normalized'],0,1);native_q[native_age<-3]=0;native_q*=np.clip((900-native_age)/100,0,1)
def warped(ratio):
 apd=native['apd90Ms'];new50=ratio*apd;old50=native['apdMs']['50']
 f=PchipInterpolator([-4,4,new50,apd,apd+100,1000],[-4,4,old50,apd,apd+100,1000])
 source_age=np.where(native_age<=4,native_age,f(native_age));q=np.interp(source_age,native_age,native_q,left=0,right=0)
 out={k:native[k]for k in ['dtMs','activationMs','apd90Ms','restMv','peakMv','warpAnchorMs']};out['normalized']=q.tolist()
 return out
lo=[260,0,-30,-35,.68];hi=[355,100,100,40,.95];x0=[310,40,30,-12,.82]
count=0
def calc(x,full=False):
 con=x[1]*(.5-rho[:NV])+x[2]*(z[:NV]-.5)+x[3]*(chamber[:NV]==2);con-=np.median(con);apd=x[0]+con
 model['templates']['ventricular']=warped(x[4])
 e=fast(ats,apd,W[:NV,1]*vscale,dt=.5,db=2.)+atrial
 return (e,apd)if full else e
def residual(x):
 global count
 e=calc(x);count+=1
 return np.r_[e[315:620]-target[315:620],.003*(np.array(x[:4])-x0[:4])/np.array([30,40,30,30])]
res=least_squares(residual,x0,bounds=(lo,hi),diff_step=.002,x_scale=[30,40,40,20,.1],max_nfev=150,ftol=1e-7,xtol=1e-6,gtol=1e-6)
e,apd=calc(res.x,True)
out={'x':res.x.tolist(),'errors':errors(e),'evaluations':count,'leadII':e.tolist(),'template':'TT06endo with APD50 timewarp','activation':args.activation,'apdRange':[float(apd.min()),float(apd.max())],'description':'NativeTT06upstroke andvoltage; bounded smooth APD50/APD90 recoveryshape fit plusAPDfield; notunmodifiedionicoutput','templateOutput':warped(res.x[4])}
(WORK/('fit-warped-'+args.activation+'.json')).write_text(json.dumps(out,indent=2));np.save(WORK/('fit-warped-'+args.activation+'-apd.npy'),apd)
print('WARPEDRECOVERY',{k:v for k,v in out.items()if k not in ['leadII','templateOutput']},flush=True)

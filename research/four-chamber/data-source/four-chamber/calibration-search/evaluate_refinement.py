from explore_fit import *
m=np.load(os.environ['ECG_BASELINE_MIDPOINT_OPERATOR'])
edges=m['edges'];w=m['W'][:,1];mtypes=(edges[:,0]>=NV)
ats=(at0[edges[:,0]]+at0[edges[:,1]])*.5;apds=(apd0[edges[:,0]]+apd0[edges[:,1]])*.5
start=time.time();m_v=fast(ats[~mtypes],apds[~mtypes],w[~mtypes]);m_a=fast(ats[mtypes],apds[mtypes],w[mtypes],typ='atrial')
e=.25*base+m_v+m_a
print('refined',time.time()-start,errors(e),'vsbaseRMS',np.sqrt(np.mean((e-base)**2)),'QRSdiffmax',abs(e[180:310]-base[180:310]).max(),flush=True)
(WORK/'refined-baseline.json').write_text(json.dumps({'errors':errors(e),'leadII':e.tolist(),'leadIIAtrial':(.25*base_a+m_a).tolist()},indent=2))
for name in ['fit1','fit2']:
 fit=json.loads((WORK/('fit1-regions.json'if name=='fit1'else'fit2-chronology.json')).read_text());a=np.load(WORK/(name+'-activation.npy'));vscale=fit['x'][-1]if name=='fit2' else 1
 ma=(a[edges[~mtypes,0]]+a[edges[~mtypes,1]])*.5
 v=.25*fast(a,apd0[:NV],W[:NV,1]*vscale)+fast(ma,apds[~mtypes],w[~mtypes]*vscale)
 ecg=v+.25*base_a+m_a
 print(name,errors(ecg),'R',ecg.max(),ecg.argmax(),flush=True)
 (WORK/(name+'-refined.json')).write_text(json.dumps({'errors':errors(ecg),'leadII':ecg.tolist()},indent=2))

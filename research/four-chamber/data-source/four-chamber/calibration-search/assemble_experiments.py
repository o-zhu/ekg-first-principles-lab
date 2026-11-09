from explore_fit import *
from scipy.signal import find_peaks, peak_prominences
import hashlib
records=[
 ('baseline','Previous published model',None,'Baseline: 330,758 source nodes, 12 simultaneous regional delivery sites, single-pixel optical recovery.','baseline'),
 ('source_refinement','Eight sub-tetrahedra per source element','refined-baseline.json','All parameters fixed; source-field evaluation increased to2,336,903 sites. Changes numerical sampling, not propagation.','No material fit improvement'),
 ('unrestricted_regions','Four regional timing and speed fit','fit1-regions.json','Four region timings and global graph speed; retained as an explicit unconstrained sensitivity case.','Rejected: fitted regional chronology too far from mapping assumptions'),
 ('bounded_regions','Mapping-constrained four-region fit','fit2-chronology.json','LV region onset spread±5ms, RV3–12ms later, global travel speed and ventricular source conductivity.','Improves fit but residual shoulders'),
 ('twelve_deliveries','Twelve individually timed delivery sites','fit3-distributed.json','Original12positions, LVwithin8ms andRV3–14ms; fitted atrial activation and conductivity.','Improved, small terminal shoulders remain'),
 ('fast_endocardium','Separately faster endocardial propagation','fit4-myo0.65-endo2.00-optical.json','Endocardial2mm/ms with slower myocardium; constrained12site timing and source conductivity.','Worse than the12site global-speed fit'),
 ('fifteen_deliveries','Fifteen coordinated delivery sites','fit5-basal-optical.json','Three RV basal endocardial delivery sites added; bounded delays; waveform slope prior acts only through activation/source parameters.','Selected activation family: single dominant R'),
 ('optical_recovery_fit','Single-pixel optical APD-gradient fit','fit-recovery-optical.json','12siteactivation; fit APDmedian/transmural/apex-base/RVcontrasts; existing optical shape unchanged.','Improves T but single-pixel shape has slope variation'),
 ('ionic_recovery','Published TT06 endocardial AP','fit-recovery-endo.json','TT06nativeupstroke/voltage;12siteactivationrefit thenfourAPDparameters. Ionic conductances unmodified.','Independent AP-family comparison; steeper recovery'),
 ('ionic_shape_fit','TT06 plus APD50/90 shape fit','fit-warped-fit3-endo.json','Smooth time-warp changes repolarization shape, preserving native rise.','Rejected as default: fittedAPD50/APD90reaches.68 versusnative.906'),
 ('sigmoid_recovery','Smooth phenomenological AP recovery','fit-recovery-sigmoid.json','Two-ms intrinsic rise; single smooth sigmoidal membrane recovery andAPDgradientfit. NoECGfilter.','Exploratory model; lessdirectly tiedtorecordedAPshape'),
]
def metrics(y):
 r=int(np.argmax(y[185:310])+185)
 refaligned=np.interp(T-r,np.arange(-300,600),reference['leadIIMv'],left=0,right=0)
 peaks,_=find_peaks(y[185:310],prominence=.01);pr=peak_prominences(y[185:310],peaks)[0];peaks+=185
 positives=[{'timeMs':int(i+30),'voltageMv':float(y[i]),'prominenceMv':float(p)}for i,p in zip(peaks,pr)if y[i]>0]
 return {'fixedTargetClockRMSEMv':errors(y),'rAlignedWholeRMSEMv':float(np.sqrt(np.mean((y[:700]-refaligned[:700])**2))),
  'rPeakMs':r+30,'rPeakMv':float(y[r]),'positiveQRSPeaks':positives,
  'secondaryPositiveQRSPeakProminenceMv':max([p['prominenceMv']for p in positives if p['timeMs']!=r+30],default=0.)}
methods=[]
for key,title,file,description,disposition in records:
 q={}if file is None else json.loads((WORK/file).read_text())
 y=base if file is None else np.asarray(q['leadII'])
 params={k:v for k,v in q.items()if k not in ['leadII','leadIIAtrial','templateOutput','errors','baseErrors']}
 methods.append({'id':key,'title':title,'description':description,'disposition':disposition,'parameters':params,'metrics':metrics(y),'leadII':np.interp(T-30,T,y,left=0,right=0).tolist()})
out={'schemaVersion':1,'status':'Selected pooled recovery and extended source-field verification pending','title':'Lead-II forward-model calibration experiments','clock':{'timeMs':T.tolist(),'displayClockOffsetMs':30,'targetReferenceRTimeMs':261,'comparison':'Every experimental trace and target translated by the same30ms. No amplitude normalization or time warping.'},
 'reference':{'record':reference['record'],'sourceUrl':reference['sourceUrl'],'role':'Fitting target, not independent validation','processing':reference['processing'],'lateTailCaveat':'The raw reference retains a positive late post-T offset. A physiological AP model is not forced to represent this as persistent myocardial depolarization.'},
 'targetLeadII':np.interp(T-261,np.arange(-300,600),reference['leadIIMv'],left=0,right=0).tolist(),
 'baseline':{'sourceCommit':'e732cb67fb0cafb795dd9a7f0cd76844dae793e5','modelSha256':hashlib.sha256((WORK/'baseline-heart-model.json').read_bytes()).hexdigest()},
 'numericalSearch':{'method':'Bilinear activation-time/APD source-weight histograms convolved with membrane AP templates; every signed source weight retained. Final selected model recomputed independently over all source sites.','coarseSearchBinMs':{'activation':.5,'APD90':4},'verificationBinMs':{'activation':.25,'APD90':1},'baselineMaximumDifferenceFromPublishedDirectMv':.00009591661838098675},
 'fitWindowsBeforeDisplayShiftMs':{'P':[5,180],'QRS':[185,310],'recovery':[315,620]},
 'metricsWindowsBeforeDisplayShiftMs':{'whole':[0,700],'P':[10,180],'QRS':[185,310],'ST_T':[310,700]},
 'interpretation':['These are parameter-calibration experiments on a reduced forward model. A closerleadII fit is not evidence that fitted junctions, conductivities, orAPDs are the actual physiology of the reference person.','The source anatomy, optical donors, and reference ECG are different people.','All computed ECGs remain spatial source integrals. No reference ECG samples, artificial P/QRS/T components, or post-hoc ECG smoothing are inserted into their calculated traces.','The reference ECG does enter the optimizer objective; model parameters and one explicit single-R morphology prior are fitted.'],
 'methods':methods}
(ROOT/'dist/data/lead-ii-fidelity-experiments.json').write_text(json.dumps(out,indent=2)+'\n')
(ROOT/'data-source/four-chamber/lead-ii-fidelity-experiments.json').write_text(json.dumps(out,indent=2)+'\n')
print('Consolidated',len(methods),'methods',flush=True)

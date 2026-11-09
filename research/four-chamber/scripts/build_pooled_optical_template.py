#!/usr/bin/env python3
"""Pool both retained human optical donor recordings before constructing an AP.

Reprocess the original MAT files without 8-bit movie quantization, verify against
the shipped masks/timing/movie exports, then compare equal-donor and equal-pixel
pooling after AT/APD90 shape alignment. This creates a model AP template only;
it never changes the measured movies or timing maps. No ECG enters this script.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from scipy.io import loadmat
from scipy.signal import iirnotch, filtfilt, savgol_filter
from scipy.ndimage import gaussian_filter1d
from scipy.optimize import isotonic_regression, least_squares

ROOT=Path(__file__).resolve().parents[1]


def digest(path, kind='sha256'):
    return hashlib.new(kind,Path(path).read_bytes()).hexdigest()


def crossing(x,y,level):
    candidates=np.flatnonzero((y[:-1]>=level)&(y[1:]<level))
    if not len(candidates): raise ValueError('No descending AP threshold')
    k=int(candidates[0])
    return float(x[k]+(level-y[k])*(x[k+1]-x[k])/(y[k+1]-y[k]))


def recover_unquantized(raw_path, movie_dir, donor, phase):
    meta=json.loads((movie_dir/f'donor{donor}-metadata.json').read_text())
    if digest(raw_path,'md5')!=meta['raw_md5']:
        raise ValueError('Original MAT checksum mismatch')
    mask=np.fromfile(movie_dir/meta['mask_file'],np.uint8).reshape(100,100).astype(bool)
    timing=np.fromfile(movie_dir/meta['timing_file'],'<f4').reshape(6,100,100)
    raw=loadmat(raw_path)['cmosData'][mask].astype(np.float32)
    b,a=iirnotch(60,30,fs=1000)
    clean=filtfilt(b,a,raw,axis=1).astype(np.float32)
    starts=meta['ensemble_source_start_indices']
    segment=np.mean(np.stack([clean[:,s:s+1000]for s in starts]),axis=0)
    smooth=savgol_filter(segment,11,3,axis=1,mode='interp')
    pre=np.median(smooth[:,10:50],axis=1)
    post=np.median(smooth[:,800:950],axis=1)
    drift=pre[:,None]+(post-pre)[:,None]*(np.arange(1000)-29.5)/845
    signal=smooth-drift
    baseline=np.median(signal[:,10:50],axis=1)
    amplitude=np.max(signal[:,100:450],axis=1)-baseline
    normalized=(signal-baseline[:,None])/np.maximum(amplitude[:,None],1)
    reproduced=np.round((np.clip(normalized[:,::2],-.25,1.25)+.25)/1.5*255).astype(np.uint8)
    shipped=np.fromfile(movie_dir/meta['voltage_file'],np.uint8).reshape(500,100,100)[:,mask].T
    differences=np.abs(reproduced.astype(int)-shipped.astype(int))
    if differences.max()!=0:
        raise ValueError('Reprocessed unquantized signal does not reproduce the shipped movie bytes')
    at=timing[0,mask].astype(float)
    apd90=timing[4,mask].astype(float)
    derived_at=np.argmax(savgol_filter(signal,11,3,deriv=1,axis=1)[:,100:300],axis=1)+100
    if not np.array_equal(derived_at,at):
        raise ValueError('Reprocessed activation differs from the shipped timing map')
    aligned=np.asarray([np.interp(aa+phase*dd,np.arange(1000),row,left=np.nan,right=np.nan)
                        for row,aa,dd in zip(normalized,at,apd90)])
    # Each trace still has the original local baseline/peak normalization.
    # Sites are aligned ONLY here, for pooling a shape, never in the viewer.
    median=np.nanmedian(aligned,axis=0)
    return aligned,median,{
        'donor':donor,'acceptedOpticalPixels':int(mask.sum()),
        'sourceFile':raw_path.name,'sourceUrl':f'https://zenodo.org/records/3986725/files/{raw_path.name}',
        'sourceSha256':digest(raw_path),'sourceMd5':meta['raw_md5'],
        'maskSha256':digest(movie_dir/meta['mask_file']),
        'timingSha256':digest(movie_dir/meta['timing_file']),
        'movieSha256':digest(movie_dir/meta['voltage_file']),
        'nativeSampleIntervalMs':1,'ensembleBeats':len(starts),'ensembleSourceStartIndices':starts,
        'unquantizedReprocessingMatchesShippedMovieBytes':True,
        'activationMapsMatchExactly':True,
        'measuredApd90MedianMs':float(np.median(apd90)),
        'measuredApd90RangeMs':[float(apd90.min()),float(apd90.max())],
        'alignedPhaseFiniteSitesMin':int(np.sum(np.isfinite(aligned),axis=0).min()),
        'validSitesThroughoutFitPhaseRange':int(np.sum((at+.04*apd90>=0)&(at+1.5*apd90<=999))),
        'rawOpticalAmplitudeCalibratedToMv':False,
    }


def condition_recovery(phase,pooled):
    peak_index=int(np.argmax(pooled[(phase>=0)&(phase<.5)]))+int(np.flatnonzero(phase>=0)[0])
    peak=float(pooled[peak_index])
    plateau=pooled.copy()/peak
    plateau[:peak_index+1]=1.
    plateau=np.clip(plateau,0,1)
    monotone=isotonic_regression(plateau,increasing=False).x
    sigma_phase=.015
    smooth=gaussian_filter1d(monotone,sigma_phase/(phase[1]-phase[0]),mode='nearest')
    smooth/=smooth[np.flatnonzero(phase>=0)[0]]
    phase90=crossing(phase,smooth,.1)
    aligned=np.interp(phase*phase90,phase,smooth,left=1,right=0)
    aligned[phase<=0]=1
    return aligned,{'pooledPeakBeforeRenormalization':peak,'pooledPeakPhase':float(phase[peak_index]),
        'gaussianSigmaPhase':sigma_phase,'gaussianSigmaAt300Ms':4.5,
        'conditionedPhase90BeforeRenormalization':phase90,
        'method':'Normalize the pooled peak; retain a plateau before its optical peak; decreasing isotonic regression followed by Gaussian smoothing (sigma 0.015 APD90); rescale shape phase so the 10% crossing is phase 1. This conditions an AP template; no ECG is filtered.'}


def richards(u,params):
    # Exactly q(0)=1 and q(1)=0.1; two shape parameters, no waveform gain.
    nu,extra=params
    logB=np.log(10)/nu
    k=logB+extra
    logA=np.log(np.expm1(logB))-k-np.log1p(-np.exp(logB-k))
    return np.exp(nu*(np.logaddexp(0,logA)-np.logaddexp(0,logA+k*np.maximum(u,0))))


def make_template(phase,shape,method,provenance):
    dt=.25;activation=10.;anchor=4.;apd=300.
    times=np.arange(0,910.0001,dt)
    age=times-activation
    recovery_phase=(age-anchor)/(apd-anchor)
    if method=='richards':
        fit_mask=(phase>=.04)&(phase<=1.5)
        fitted=least_squares(lambda p:richards(phase[fit_mask],p)-shape[fit_mask],
                            [.7,8.],bounds=([.15,.05],[8.,40.]),ftol=1e-13,xtol=1e-13,gtol=1e-13)
        recovery=richards(recovery_phase,fitted.x)
        fitcurve=richards(phase,fitted.x)
        fitinfo={'method':'Two-parameter endpoint-constrained Richards recovery fitted only to pooled optical AP shape. No ECG samples used.',
                 'nu':float(fitted.x[0]),'extraSlope':float(fitted.x[1]),'fitPhaseRange':[.04,1.5],
                 'fitTarget':'Conditioned equal-donor or equal-pixel optical recovery, as identified by the containing template.',
                 'parameterBounds':{'nu':[.15,8.],'extraSlope':[.05,40.]},
                 'parametersAtBound':[name for name,value,lo,hi in zip(['nu','extraSlope'],fitted.x,[.15,.05],[8.,40.])if abs(value-lo)<1e-5 or abs(value-hi)<1e-5],
                 'normalizedRecoveryRmse':float(np.sqrt(np.mean((fitcurve[fit_mask]-shape[fit_mask])**2))),
                 'normalizedRecoveryMaxError':float(np.max(np.abs(fitcurve[fit_mask]-shape[fit_mask])))}
    else:
        recovery=np.interp(recovery_phase,phase,shape,left=1,right=0)
        fitinfo={'method':'Direct interpolation of conditioned pooled optical recovery.'}
    q=np.where(age<anchor,.5*(1+np.tanh(age/.9102392266)),recovery)
    q[age<-5]=0
    # Discard only an asymptotic sub-0.0001 residual so a finite movie cycle
    # has a resting baseline; the taper is smooth and occurs after recovery.
    q*=np.clip((900-age)/40,0,1)
    q=np.round(np.clip(q,0,1),8)
    duration={f'apd{level}Ms':crossing(age[age>=anchor],q[age>=anchor],1-level/100)for level in [50,80,90]}
    return {'title':'Pooled human ventricular optical recovery · two donor preparations',
        'normalized':q.tolist(),'dtMs':dt,'activationMs':activation,'warpAnchorMs':anchor,
        'restMv':-85.,'peakMv':25.,**duration,
        'apd50To90Ratio':duration['apd50Ms']/duration['apd90Ms'],
        'provenance':provenance,'shapeFit':fitinfo,
        'voltageScaleStatus':'Assumed −85/+25 mV for tissue modeling; optical recordings provide relative fluorescence only.',
        'upstrokeStatus':'Assumed 2 ms intrinsic tanh upstroke (10–90%) replaces the rise broadened by optical scattering and filtering; activation occurs at 50% rise. Optical shape supplies recovery.',
        'durationStatus':'Reference APD90 is set to 300 ms for the reusable shape. Local model APD fields are assigned separately; neither optical donor is claimed to have had 300 ms APD90.'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir',type=Path,required=True)
    parser.add_argument('--movie-dir',type=Path,default=ROOT/'dist/data/human')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'data-source/four-chamber')
    args=parser.parse_args()
    phase=np.arange(-.1,2.00001,.001)
    matrices=[];medians=[];sources=[]
    for donor in [1,2]:
        aligned,median,info=recover_unquantized(args.raw_dir/f'Patient{donor}_CL1000.mat',args.movie_dir,donor,phase)
        matrices.append(aligned);medians.append(median);sources.append(info)
        print('Recovered unquantized donor',donor,info['acceptedOpticalPixels'],flush=True)
    # Donor1 contributes84.6% of sites; equal donor weighting prevents camera
    # coverage/quality-mask size from becoming a claim of biological prevalence.
    pools={'equal_donor':np.mean(medians,axis=0),'all_pixels':np.nanmedian(np.vstack(matrices),axis=0)}
    results={};curves={}
    provenance='Smirnov et al. 2020; native 1 ms unquantized ensembles of four beats reprocessed for 2,493 and 455 accepted optical pixels from two isolated human LV endocardial wedges. AT/APD90 alignment is used only to pool an AP shape; measured movie timings remain unchanged.'
    for name,pool in pools.items():
        conditioned,conditioning=condition_recovery(phase,pool)
        direct=make_template(phase,conditioned,'direct',provenance)
        fitted=make_template(phase,conditioned,'richards',provenance)
        results[name]={'conditioning':conditioning,'direct':direct,'richards':fitted}
        curves[name]={'rawPooled':np.round(pool,7).tolist(),'conditioned':np.round(conditioned,7).tolist()}
    output={**results['equal_donor']['richards'],
        'pooling':'Equal weight for each donor median: 50% donor 1 and 50% donor 2. This is not an estimator for the healthy population.',
        'allPixelDonorWeights':{'donor1':sources[0]['acceptedOpticalPixels']/sum(s['acceptedOpticalPixels']for s in sources),'donor2':sources[1]['acceptedOpticalPixels']/sum(s['acceptedOpticalPixels']for s in sources)},
        'sources':sources,'totalAcceptedOpticalPixels':sum(s['acceptedOpticalPixels']for s in sources),
        'donorCount':2,'citation':'Smirnov et al. 2020. PLoS ONE 15(5):e0231695.',
        'paperUrl':'https://doi.org/10.1371/journal.pone.0231695','dataUrl':'https://zenodo.org/records/3986725','license':'CC0-1.0',
        'conditioning':results['equal_donor']['conditioning'],
        'limitations':['Pixels spatially average tissue volumes and are not independent cells.','Only two donor preparations, one pacing condition, and an endocardial wedge surface are represented.','APD/AT alignment discards spatial timing for shape pooling; it cannot validate a whole-heart recovery map.','Aligning the first 10% crossings also aligns threshold noise at phase 1. Template conditioning smooths this feature; it does not establish an intracellular notch.','Postprocessing and a fitted recovery shape reduce measurement noise but cannot restore unmeasured intracellular physiology.','Neither absolute membrane voltage, 300 ms APD90, nor the 2 ms upstroke is measured by these optical data.'],
        'alternatives':{'equalDonorDirect':results['equal_donor']['direct'],'allPixelsDirect':results['all_pixels']['direct'],'allPixelsRichards':results['all_pixels']['richards']},
        'phaseAlignedEvidence':{'phase':np.round(phase,4).tolist(),'donorMedians':[np.round(x,7).tolist()for x in medians],**curves},
        'scriptSha256':digest(__file__)}
    args.output_dir.mkdir(parents=True,exist_ok=True)
    for name in ['pooled-optical-template.json','pooled-human-ventricular-template.json']:
        (args.output_dir/name).write_text(json.dumps(output,separators=(',',':'))+'\n')
    print(json.dumps({'totalSites':output['totalAcceptedOpticalPixels'],'apd50To90Ratio':output['apd50To90Ratio'],
        'shapeFit':output['shapeFit'],'equalDonorDirectRatio':output['alternatives']['equalDonorDirect']['apd50To90Ratio'],
        'allPixelRichardsRatio':output['alternatives']['allPixelsRichards']['apd50To90Ratio']},indent=2),flush=True)


if __name__=='__main__':main()

from pathlib import Path
import json, hashlib
import numpy as np
from scipy.signal import butter,sosfiltfilt,find_peaks
P=Path(__file__).resolve().parent
sha=lambda x:hashlib.sha256(P.joinpath(x).read_bytes()).hexdigest()
# Retain calibrated mV. Filter is used ONLY to identify R peaks; displayed beat values are raw.
raw=np.fromfile(P/'s0306lre.dat',dtype='<i2').reshape(-1,12)/2000.
filt=sosfiltfilt(butter(3,[.5,40],fs=1000,btype='bandpass',output='sos'),raw[:,1])
peaks,_=find_peaks(filt,prominence=.3,distance=500)
peaks=np.array([i-8+np.argmax(raw[i-8:i+9,1]) for i in peaks if i>=8 and i<len(raw)-9])
peaks=peaks[(peaks>5000)&(peaks<len(raw)-5000)]
t=np.arange(-300,600)
beats=np.array([raw[i-300:i+600] for i in peaks])
beats-=np.median(beats[:,:60,:],axis=1)[:,None,:]
med=np.median(beats,axis=0)
lo,hi=np.percentile(beats[:,:,1],[10,90],axis=0)
lead_names=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6']
meta={
 'title':'Measured healthy-control ECG · PTB patient104 / s0306lre',
 'record':'patient104/s0306lre','classification':'Healthy control (original header)',
 'sourceUrl':'https://physionet.org/content/ptbdb/1.0.0/patient104/',
 'datasetUrl':'https://physionet.org/content/ptbdb/1.0.0/',
 'datasetDoi':'10.13026/C28C71',
 'license':'Open Data Commons Attribution License v1.0','licenseUrl':'https://opendatacommons.org/licenses/by/1-0/',
 'credit':'PTB Diagnostic ECG Database; Michael Oeff, Hans Koch, Ralf Bousseljot, Dieter Kreiseler and contributors; PhysioNet.',
 'selection':'First entry in the official CONTROLS manifest. Not selected by resemblance to a model output.',
 'nativeSampleRateHz':1000,'nativeAdcGainUnitsPerMv':2000,'dtMs':1,'startRelativeRMs':-300,'endRelativeRMs':599,'sampleCount':900,
 'beatCount':int(len(beats)),'rrMedianMs':float(np.median(np.diff(peaks))),'heartRateBpm':float(60000/np.median(np.diff(peaks))),
 'rPeakSamples':peaks.tolist(),
 'processing':'R peaks detected with a 0.5–40 Hz third-order zero-phase Butterworth filter and refined to the local raw maximum within ±8 ms. Displayed samples come from unfiltered calibrated raw signals. Each 900-ms segment is R-aligned and has its own pre-P baseline (median from −300 to −241 ms) subtracted. Pointwise median across all 108 eligible beats, excluding the first and last 5 s. No amplitude normalization, time warping, polynomial smoothing, or synthetic P/QRS/T components.',
 'interpretation':'One healthy-control recording, not a population ideal. Median-beat processing reduces noise and suppresses beat-to-beat variation. Not paired with the donor AP recordings or the anatomical model.',
 'units':'mV','referenceTime':'R maximum = 0 ms; a display may translate the entire trace in time without warping it.',
 'leadIIMv':np.round(med[:,1],6).tolist(),'leadII10thPercentileMv':np.round(lo,6).tolist(),'leadII90thPercentileMv':np.round(hi,6).tolist(),
 'allLeadsMv':{k:np.round(med[:,i],6).tolist() for i,k in enumerate(lead_names)},
 'sourceFiles':{'s0306lre.dat':sha('s0306lre.dat'),'s0306lre.hea':sha('s0306lre.hea'),'PTB_CONTROLS.txt':sha('PTB_CONTROLS.txt')}
}
P.joinpath('ptb-healthy-reference.json').write_text(json.dumps(meta,separators=(',',':')))
# Native atrial ionic-model waveform.
z=np.load(P/'courtemanche_40beats.npz');t=z['times_ms'];v=z['voltage_mV'];prev=z['previous_voltage']
at=float(t[np.argmax(np.gradient(v,t))]);peak=int(np.argmax(v));rest=float(np.median(v[t<45]));top=float(v.max())
def apd(percent):
 level=rest+(top-rest)*(1-percent/100)
 i=int(np.flatnonzero((v[peak:-1]>=level)&(v[peak+1:]<level))[0]+peak)
 return float(t[i]+(level-v[i])/(v[i+1]-v[i])*(t[i+1]-t[i])-at)
atrial={
 'title':'Courtemanche–Ramirez–Nattel human atrial ionic model · 40th beat at 1 Hz',
 'evidenceType':'Published human-data-based ionic model output; not a measured atrial trace',
 'citation':'Courtemanche M, Ramirez RJ, Nattel S. Ionic mechanisms underlying human atrial action potential properties: insights from a mathematical model. Am J Physiol. 1998;275:H301–H321.',
 'paperUrl':'https://pubmed.ncbi.nlm.nih.gov/9688927/','doi':'10.1152/ajpheart.1998.275.1.H301',
 'modelUrl':'https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65',
 'license':'Creative Commons Attribution 3.0 Unported','licenseUrl':'https://creativecommons.org/licenses/by/3.0/',
 'conditioningBeats':40,'cycleLengthMs':1000,'stimulusStartMs':50,'stimulusDurationMs':2,'stimulusAmplitudePa':-2000,'temperatureK':310,
 'solver':'SciPy solve_ivp BDF; rtol 2e-7, atol 2e-9, max step 10ms; segmented at stimulus start and end; dense output at 0.5ms.',
 'parameters':'Original published CellML parameters and initial states. Stimulus end time extended to allow 40 full cycles; no ionic conductance fitted to the whole-heart ECG.',
 'dtMs':.5,'sampleCount':int(len(v)),'startMs':0,'activationMs':at,'restMv':rest,'peakMv':top,
 'apd50Ms':apd(50),'apd80Ms':apd(80),'apd90Ms':apd(90),
 'conditioningLimit':'40 paced conditioning beats; not certified ionic steady state. Maximum pointwise voltage difference from beat 39 is reported.',
 'lastBeatMaxVoltageDifferenceMv':float(np.max(np.abs(v-prev))),
 'voltageMv':np.round(v,6).tolist(),'normalized':np.round((v-rest)/(top-rest),8).tolist(),
 'sourceSha256':{'courtemanche_ramirez_nattel_1998.cellml':sha('courtemanche_ramirez_nattel_1998.cellml'),'courtemanche_generated.py':sha('courtemanche_generated.py')}
}
P.joinpath('courtemanche-atrial-template.json').write_text(json.dumps(atrial,separators=(',',':')))
print(json.dumps({'referenceBeats':len(beats),'referenceR':float(med[:,1].max()),'referenceRange':[float(med[:,1].min()),float(med[:,1].max())],'atrialAT':at,'atrialAPD90':apd(90)}))

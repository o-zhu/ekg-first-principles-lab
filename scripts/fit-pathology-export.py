#!/usr/bin/env python3
"""Verify dense-source predictions and export matched native CT/ECG cases."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import time
import numpy as np
from threadpoolctl import threadpool_limits

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'data-source/pathology-fitting'
CACHE=BASE/'cache'
OUT=ROOT/'dist/data/pathology-fits'
SPEC=importlib.util.spec_from_file_location('pathology_model',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(fm)

SOURCES=[
 {'title':'Rodero et al. 2021 · virtual cohort of four-chamber heart anatomies','url':'https://doi.org/10.1371/journal.pcbi.1008851','data':'https://zenodo.org/records/4593739','license':'CC BY 4.0'},
 {'title':'Gillette et al. 2022 · personalized whole-heart electrophysiology / bundle branch block','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC9539798/'},
 {'title':'Ionic mechanisms of ST segment elevation during acute myocardial infarction','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/'},
 {'title':'Di Diego and Antzelevitch 2003 · cellular basis for acute ischemic ST/T changes in a canine wedge','url':'https://pubmed.ncbi.nlm.nih.gov/14716579/'},
 {'title':'Pezzuto et al. · evaluation of a rapid anisotropic ECG simulation model','url':'https://pubmed.ncbi.nlm.nih.gov/28512434/'},
 {'title':'Smirnov et al. · human ventricular optical recordings','url':'https://zenodo.org/records/3986725','license':'CC0'},
]


def readable_metadata(value):
    """Refresh visible prose, including reused verified-result metadata."""
    if isinstance(value,dict):return {key:readable_metadata(item)for key,item in value.items()}
    if isinstance(value,list):return [readable_metadata(item)for item in value]
    if not isinstance(value,str):return value
    for old,new in [('returned to1','returned to 1'),('its140ms','its 140 ms'),
                    ('Direct1ms','Direct 1 ms'),('all2,400,926','all 2,400,926'),
                    ('is500Hz','is 500 Hz'),('The1ms','The 1 ms'),('create1kHz','create 1 kHz')]:
        value=value.replace(old,new)
    return value


def refined(fields,edges):
    return tuple(np.r_[a,a[edges].mean(axis=1)] for a in fields)


def dense_weights(forward,identifier,operator_key):
    if operator_key:
        native=np.load(CACHE/f'{identifier}-{operator_key}-native-weights.npy')
        middle=np.load(CACHE/f'{identifier}-{operator_key}-midpoint-weights.npy',mmap_mode='r')
    else:
        native=forward.W[:,fm.INDEP]
        middle=np.load(CACHE/'midpoint-weights.npy',mmap_mode='r')[:,fm.INDEP]
    result=np.vstack([.25*native,middle])
    assert np.max(np.abs(result.sum(axis=0)))*110<1e-8
    assert np.isfinite(result).all()
    return result


def direct(forward,fields,weights,p,times,rr,baseline):
    """Independent all-site Vm matrix products, without AT/APD histogram bins."""
    at,apd,rest,amplitude,lesion=fields[:5]
    shape=fields[5] if len(fields)>5 else None
    types=np.r_[forward.types,forward.types[forward.edges[:,0]]]
    gains=np.where(types==0,p['gain'],p['atrialGain'])
    physical_weights=weights*gains[:,None]
    rest_ecg=rest@physical_weights
    result=np.empty((len(times),8))
    masks=[np.flatnonzero(types==typ) for typ in [0,1]]
    begin=time.time()
    for start in range(0,len(times),4):
        end=min(start+4,len(times))
        voltage=np.broadcast_to(rest,(end-start,len(rest))).copy()
        for typ,key in enumerate(['ventricular','atrial']):
            ids=masks[typ];tpl=forward.tpl[key]
            age=times[start:end,None]-at[ids][None,:]
            local_shape=shape[ids][None,:] if shape is not None and typ==0 else 1.
            family=p.get('plateauShapeFamily','rational') if typ==0 else 'rational'
            excursion=fm.q_at(age,apd[ids][None,:],tpl,local_shape,family)
            for cycle in [-1,1]:
                shifted=age-cycle*rr
                # Entirely resting cycles need no enormous interpolation.
                if shifted.max()<-5 or shifted.min()>1050:
                    continue
                excursion+=fm.q_at(shifted,apd[ids][None,:],tpl,local_shape,family)
            voltage[:,ids]+=excursion*amplitude[ids][None,:]
        result[start:end]=voltage@physical_weights
        if start%200==0:
            fm.emit(f'Direct {start}/{len(times)} samples, {time.time()-begin:.1f} s')
    bm=(times>=baseline[0])&(times<=baseline[1])
    reference=np.median(result[bm],axis=0)
    result-=reference
    return fm.all_leads(result),fm.all_leads(rest_ecg[None,:])[0],fm.all_leads(reference[None,:])[0]


def field_payload(forward,fields,parameters):
    at,apd,rest,amplitude,lesion=fields[:5]
    source=np.asarray(forward.base['field']['sourceGlobalIds'])
    typ=np.r_[forward.types,forward.types[forward.edges[:,0]]]
    chamber=np.r_[forward.chamber,forward.chamber[forward.edges[:,0]]]
    # Five decimal digits in time/voltage make display round-off negligible;
    # the source integration itself retains unrounded float64 values.
    result={'sourceActivationMs':np.round(at[source],5).tolist(),
            'sourceApd90Ms':np.round(apd[source],5).tolist(),
            'sourceRestMv':np.round(rest[source],5).tolist(),
            'sourceAmplitudeMv':np.round(amplitude[source],5).tolist(),
            'sourceLesionWeight':np.round(lesion[source],6).tolist(),
            'sourceType':typ[source].tolist(),'sourceChamber':chamber[source].tolist(),
            'neighboringBeatCycles':[-1,0,1],
            'sourceIndexing':'Identical order to cardiac-voltage/data/heart-model.json field.sourceGlobalIds',
            'evaluation':'Vm = rest + amplitude × sum(q(t − AT − cycle × RR, APD), cycle = −1,0,1). Evaluate q at source sites before applying base.field.renderIndices/renderWeights.',
            'apShape':'Same base.templates[type]; ages through 4 ms unwarped, later age = 4 + (age−4) × (template.apd90Ms−4)/(local.apd90Ms−4); linear interpolation of normalized template.'}
    if len(fields)>5:
        early=parameters.get('plateauShapeFamily')=='early-plateau'
        result['sourcePlateauFraction' if early else 'sourcePlateauGamma']=np.round(fields[5][source],6).tolist()
        result['plateauShapeFamily']='early-plateau' if early else 'rational'
        result['apShape']=('Preserve upstroke through4ms and APD90; smoothly depress early plateau by30ms; slope-matched monotone Hermite tail retains original return-to-rest endpoint.' if early else
            'Preserve upstroke through4ms and APD90; monotone rational age warp u/(gamma+(1−gamma)u) before APD90; slope-matched linear extension afterwards. Gamma1 recovers the original template.')
    return result


def morphology(pred,observed,case,times):
    result={'st':{}}
    for name,data in case['stMetrics'].items():
        lo,hi=data['averagingWindowMs'];mask=(times>=lo)&(times<=hi)
        estimate=np.mean(pred[mask],axis=0);truth=np.mean(observed[mask],axis=0)
        result['st'][name]={'centerMs':data['centerMs'],'averagingWindowMs':[lo,hi],
                           'modeledMv':dict(zip(fm.LEADS,estimate.tolist())),
                           'observedMedianMv':dict(zip(fm.LEADS,truth.tolist())),
                           'errorMv':dict(zip(fm.LEADS,(estimate-truth).tolist())),
                           'independentLeadRmseMv':float(np.sqrt(np.mean((estimate[fm.INDEP]-truth[fm.INDEP])**2))),
                           'fiducialStatus':'Uses the same approximate reviewed J point as the target; not expert-annotated or automatically exact.'}
    if '03155' in case['id']:
        terminal=(times>=20)&(times<=110)
        early=(times>=-40)&(times<=20)
        features={}
        for name,lead,mask,maximum in [('terminalV1Rprime','V1',terminal,True),('earlyV1r','V1',early,True),
                                     ('terminalLeadIS','I',terminal,False),('terminalV6S','V6',terminal,False)]:
            k=fm.LEADS.index(lead);ix=np.flatnonzero(mask)
            pi=ix[np.argmax(pred[mask,k]) if maximum else np.argmin(pred[mask,k])]
            oi=ix[np.argmax(observed[mask,k]) if maximum else np.argmin(observed[mask,k])]
            features[name]={'lead':lead,'modeledMv':float(pred[pi,k]),'modeledTimeMs':float(times[pi]),
                            'observedMv':float(observed[oi,k]),'observedTimeMs':float(times[oi]),
                            'amplitudeErrorMv':float(pred[pi,k]-observed[oi,k])}
        result['rbbbMorphology']=features
    if case['id']=='acs-00004':
        mask=(times>=250)&(times<=480);ids=np.flatnonzero(mask);features={}
        for lead in ['V1','V2','V3','V4','V5','V6']:
            k=fm.LEADS.index(lead);pi=ids[np.argmin(pred[mask,k])];oi=ids[np.argmin(observed[mask,k])]
            features[lead]={'modeledMv':float(pred[pi,k]),'modeledTimeMs':float(times[pi]),
                'observedMv':float(observed[oi,k]),'observedTimeMs':float(times[oi]),
                'amplitudeErrorMv':float(pred[pi,k]-observed[oi,k])}
        result['terminalTWindow']={'windowMs':[250,480],'minimumByLead':features,
            'status':'Descriptive minimum in a fixed late-T window, not an expert-annotated T-wave peak or a new fitting target. Existing training selection was complete before this feature was summarized.'}
    return result


def source_summary(forward,fields,parameters):
    at,apd,rest,amplitude,lesion=fields[:5]
    native=slice(0,forward.n)
    out={'chambers':{},'apdClippedAt120Fraction':float(np.mean(apd[native]<=120.000001)),
         'apdClippedAt480Fraction':float(np.mean(apd[native]>=479.999999)),
         'membraneVoltageScaleStatus':'Modeled −85/+25 mV ventricular reference, not measured patient Vm. Optical AP template supplies a normalized recovery shape.',
         'injuryRestPlateauAttribution':'Illustrative fixed 60:40 split of fitted AP excursion loss into resting depolarization and peak/plateau depression; surface ECG after PR subtraction does not identify these separately.'}
    for k,label in [(1,'LV'),(2,'RV'),(3,'LA'),(4,'RA')]:
        mask=forward.chamber==k
        out['chambers'][label]={'activationRangeMs':[float(at[native][mask].min()),float(at[native][mask].max())],
                                'activationMedianMs':float(np.median(at[native][mask])),
                                'apd90RangeMs':[float(apd[native][mask].min()),float(apd[native][mask].max())],
                                'recoveryRangeMs':[float((at+apd)[native][mask].min()),float((at+apd)[native][mask].max())]}
    nv=forward.nv
    out['injuryWeightedMyocardialVolumeMl']=float(np.sum(lesion[:nv]*forward.nodalVolume[:nv])/1000)
    out['injuryCoreVolumeMl']=float(np.sum(forward.nodalVolume[:nv][lesion[:nv]>.5])/1000)
    out['injuryWeightedVentricularFraction']=float(np.sum(lesion[:nv]*forward.nodalVolume[:nv])/forward.nodalVolume[:nv].sum())
    core=(lesion[:nv]>.5)&(forward.chamber[:nv]==1)
    if np.any(core):
        out['injuryCoreApd90Ms']=dict(zip(['minimum','p05','median','p95','maximum'],np.quantile(apd[:nv][core],[0,.05,.5,.95,1]).tolist()))
        out['injuryCoreDefinition']='LV native source nodes with modeled smooth lesion weight>0.5; a hypothesis, not a measured infarct border.'
    out['rvMinusLvMedianActivationMs']=out['chambers']['RV']['activationMedianMs']-out['chambers']['LV']['activationMedianMs']
    if len(fields)>5:
        shape=fields[5][:forward.nv];family=parameters.get('plateauShapeFamily','rational')
        out['plateauShape']={'family':family,'localParameterRange':[float(shape.min()),float(shape.max())],
            'interpretation':'Phenomenological source AP shape, not a measured ion conductance or an inferred patient ischemia stage.'}
        # Solve the actual modified waveform, rather than equating a parameter
        # with a voltage crossing. All native ventricular sources are included.
        landmarks={}
        for percent,threshold in [(20,.8),(50,.5),(90,.1)]:
            lo=np.full(forward.nv,4.);hi=apd[:forward.nv].copy()
            for unused in range(25):
                mid=(lo+hi)/2;q=fm.q_at(mid,apd[:forward.nv],forward.tpl['ventricular'],shape,family)
                lo=np.where(q>threshold,mid,lo);hi=np.where(q>threshold,hi,mid)
            values=(lo+hi)/2
            landmarks[f'apd{percent}Ms']={label:dict(zip(['minimum','median','maximum'],[float(v.min()),float(np.median(v)),float(v.max())]))
                for chamber,label in [(1,'LV'),(2,'RV')] for v in [values[forward.chamber[:forward.nv]==chamber]]}
        out['plateauShape']['actualVoltageCrossings']=landmarks
        q90=fm.q_at(apd[:forward.nv],apd[:forward.nv],forward.tpl['ventricular'],shape,family)
        out['plateauShape']['apd90NormalizedVoltageMaxError']=float(np.max(np.abs(q90-.1)))
    return out


def bound_flags(history):
    flags=[]
    for stage in history:
        for name,value,bounds in zip(stage['parameters'],stage['fitted'],stage['bounds']):
            fraction=(value-bounds[0])/(bounds[1]-bounds[0])
            if fraction<.01 or fraction>.99:
                flags.append({'stage':stage['label'],'parameter':name,'value':value,
                              'bounds':bounds,'side':'lower' if fraction<.01 else 'upper'})
    return flags


def evaluator_fixtures(forward,field,rr):
    """Cross-language samples include rapid/early/late phases and cycle tails."""
    sat=np.asarray(field['sourceActivationMs']);sd=np.asarray(field['sourceApd90Ms'])
    sr=np.asarray(field['sourceRestMv']);sa=np.asarray(field['sourceAmplitudeMv']);sty=np.asarray(field['sourceType'])
    family=field.get('plateauShapeFamily','rational')
    shape=np.asarray(field.get('sourcePlateauFraction',field.get('sourcePlateauGamma',np.ones(len(sat)))))
    source_ids=np.asarray(forward.base['field']['sourceGlobalIds'])
    indices=sorted(set([0,len(sat)-1,int(np.argmin(sat)),int(np.argmax(sat)),int(np.argmin(sd)),int(np.argmax(sd)),int(np.argmin(shape)),int(np.argmax(field['sourceLesionWeight']))]))
    def source_vm(index,t):
        template=forward.tpl['ventricular' if sty[index]==0 else 'atrial']
        local_family=family if sty[index]==0 else 'rational';local_shape=shape[index] if sty[index]==0 else 1.
        return float(sr[index]+sa[index]*sum(fm.q_at(t-sat[index]-cycle*rr,sd[index],template,local_shape,local_family)for cycle in [-1,0,1]))
    fixtures=[]
    for index in indices:
        times=[float(sat[index]+offset)for offset in [-3,0,4,15,30,60,float(sd[index])*.5,float(sd[index])-.1,float(sd[index]),float(sd[index])+.1,float(sd[index])*1.4,rr-20]]
        fixtures.append({'sourceIndex':index,'sourceGlobalId':int(source_ids[index]),'timeMs':times,'vmMv':[source_vm(index,t)for t in times]})
    render_indices=np.asarray(forward.base['field']['renderIndices']).reshape(-1,4)
    render_weights=np.asarray(forward.base['field']['renderWeights']).reshape(-1,4)
    renders=[]
    for node in np.linspace(0,len(render_indices)-1,8,dtype=int):
        times=[-200,0,30,80,200,350,500]
        values=[sum(source_vm(int(i),t)*w for i,w in zip(render_indices[node],render_weights[node]))for t in times]
        renders.append({'renderNode':int(node),'timeMs':times,'vmMv':values})
    return {'sourceFixtures':fixtures,'renderFixtures':renders,'toleranceMv':.0001,
        'meaning':'Evaluate exported source arrays with base templates and the optional declared plateau-shape transform, sum neighboring-cycle AP excursions, then interpolate Vm to render vertices. Never interpolate activation/APD first.'}


def export_case(identifier,preview=False,reuse_verified=False):
    target_data=json.loads((OUT/'targets-v1.json').read_text())
    case=next(c for c in target_data['cases'] if c['id']==identifier)
    fit=json.loads((BASE/f'fit-{identifier}-native.json').read_text())
    prior_path=OUT/'cases'/f'{identifier}.json'
    prior_case=json.loads(prior_path.read_text()) if prior_path.exists() else None
    prior_approaches={a['id']:a for a in prior_case.get('approaches',[])} if prior_case else {}
    forward=fm.Forward();fitter=fm.Fit(forward,case,fit['kind'])
    times=fitter.time
    windows=fitter.windows.copy();windows['wholeBeat']=case['analysisWindowMs']
    if fit['kind']=='stemi':windows['lateRecovery']=[180.,480.]
    observed=fitter.observed;train=fitter.train;test=fitter.test
    baseline=case['baselineWindowMs'];rr=fitter.rr
    output_approaches=[]
    cache_weights={}
    approximate_predictions={}
    # All approach comparisons are recalculated on the same dense source
    # quadrature; only physiology and the explicitly labeled pose differ.
    for approach in fit['approaches']:
        p=approach['parameters'];operator_key=approach.get('operatorKey','pose' if approach.get('pose') else None)
        if operator_key not in cache_weights:
            cache_weights[operator_key]=dense_weights(forward,identifier,operator_key)
        weights=cache_weights[operator_key]
        fields=refined(forward.fields(p,fit['kind'],approach['rvTravelFactor'],approach['healthy']),forward.edges)
        start=time.time()
        numerical_parameters=dict(p)
        if len(fields)>5:numerical_parameters['shapeBin']=.025
        prediction=forward.predict(numerical_parameters,fit['kind'],times,rr,baseline,approach['rvTravelFactor'],
                                   approach['healthy'],dt=.5,db=3.,weights=weights,field_override=fields)
        fm.emit(f'Dense {identifier} {approach["id"]}: {time.time()-start:.1f} s')
        original=fm.matrix(approach['ecg'])
        comparison={'nativeToDenseIndependentRmseMv':float(np.sqrt(np.mean((prediction[:,fm.INDEP]-original[:,fm.INDEP])**2))),
                    'nativeToDenseMaxAbsoluteMv':float(np.max(np.abs(prediction-original))),
                    'predictionMethod':'Bilinear AT/APD source histogram (0.5 ms / 3 ms) over all 2,400,926 sites; signed source weights retained.'}
        if len(fields)>5:
            comparison['predictionMethod']='Trilinear AT/APD/shape source histogram (0.5ms/3ms/0.025) over all 2,400,926 sites; signed source weights retained.'
            comparison['shapeBin']=.025
        row={k:v for k,v in approach.items() if k not in ['ecg','metrics']}
        if row.get('deliverySites'):
            row['deliverySites']['fittedDelaysMs']=p['siteDelays']
        row.update({'field':field_payload(forward,fields,p),'ecg':fm.lead_dict(prediction),
                    'metrics':{'training':fm.metrics(prediction,train,times,windows),
                               'heldOut':fm.metrics(prediction,test,times,windows)},
                    'morphology':morphology(prediction,observed,case,times),
                    'numericalVerification':comparison,'sourceSummary':source_summary(forward,fields,p)})
        if row.get('recoveryPrior'):
            row['recoveryPrior']['actualFieldSummary']=row['sourceSummary']['chambers']
            for chamber,label in [(1,'LV'),(2,'RV')]:
                values=fields[1][:forward.n][forward.chamber==chamber]
                row['recoveryPrior'][f'{label}ApdSummaryMs']=dict(zip(['min','p05','median','p95','max'],np.quantile(values,[0,.05,.5,.95,1]).tolist()))
        if len(fields)>5:row['evaluatorVerification']=evaluator_fixtures(forward,row['field'],rr)
        previous=prior_approaches.get(row['id'])
        if previous and previous.get('numericalVerification',{}).get('directAllSiteVmProduct') and previous['parameters']==p and previous.get('pose')==row.get('pose') and previous['field']==row['field']:
            # Preserve an already verified numerical winner when a different
            # prior-informed teaching candidate becomes the new default.
            verified=fm.matrix(previous['ecg'])
            row['ecg']=previous['ecg'];row['numericalVerification']=previous['numericalVerification']
            row['metrics']={'training':fm.metrics(verified,train,times,windows),'heldOut':fm.metrics(verified,test,times,windows)}
            row['morphology']=morphology(verified,observed,case,times)
        elif approach.get('directVerify') and not preview:
            verified,rest_signal,pr_reference=direct(forward,fields,weights,p,times,rr,baseline)
            row['ecg']=fm.lead_dict(verified)
            row['metrics']={'training':fm.metrics(verified,train,times,windows),'heldOut':fm.metrics(verified,test,times,windows)}
            row['morphology']=morphology(verified,observed,case,times)
            row['numericalVerification'].update({'directAllSiteVmProduct':True,'directSampleSpacingMs':1,
                'publishedTraceQuantizationMv':.000001,'sourceSiteCount':len(fields[0]),
                'displaySourceSiteCount':len(row['field']['sourceActivationMs']),'renderNodeCount':forward.base['renderNodeCount'],
                'histogramToDirectIndependentRmseMv':float(np.sqrt(np.mean((prediction[:,fm.INDEP]-verified[:,fm.INDEP])**2))),
                'histogramToDirectMaxAbsoluteMv':float(np.max(np.abs(prediction-verified))),
                'staticRestingSourceMv':dict(zip(fm.LEADS,rest_signal.tolist())),
                'prReferenceBeforeSubtractionMv':dict(zip(fm.LEADS,pr_reference.tolist())),
                'predictionMethod':'Direct 1 ms all-source Vm × physical reciprocal lead-field products; no histogram approximation in this published comparison.'})
        output_approaches.append(row);approximate_predictions[row['id']]=prediction
    # Reselect using TRAINING error only on the explicitly agreed full analysis
    # window. Held-out beats do not choose model family, pose or parameters.
    numerical_winner=min(output_approaches[1:],key=lambda a:a['metrics']['training']['wholeBeat']['independentLeadRmseMv'])
    selected=next((a for a in output_approaches if a['id']==fit.get('teachingDefaultApproachId')),numerical_winner)
    p=selected['parameters'];operator_key=selected.get('operatorKey','pose' if selected.get('pose') else None)
    fields=refined(forward.fields(p,fit['kind'],selected['rvTravelFactor'],selected['healthy']),forward.edges)
    approximate=approximate_predictions[selected['id']]
    if preview:
        exact=approximate
        rest_signal=pr_reference=np.zeros(12)
    elif reuse_verified:
        prior=json.loads((OUT/'cases'/f'{identifier}.json').read_text())
        assert not prior.get('provisional') and prior['numericalVerification']['directAllSiteVmProduct']
        assert prior['selectedApproachId']==selected['id'] and prior['parameters']==p
        assert prior.get('pose')==selected.get('pose') and prior['field']==selected['field']
        exact=fm.matrix(prior['ecg']['predicted'])
        rest_signal=np.array([prior['numericalVerification']['staticRestingSourceMv'][k]for k in fm.LEADS])
        pr_reference=np.array([prior['numericalVerification']['prReferenceBeforeSubtractionMv'][k]for k in fm.LEADS])
        fm.emit('Reusing direct all-site verification only after identical parameters, pose and exported source fields were asserted.')
    else:
        exact,rest_signal,pr_reference=direct(forward,fields,cache_weights[operator_key],p,times,rr,baseline)
    numerical=selected['numericalVerification']
    numerical.update({'directAllSiteVmProduct':not preview,'directSampleSpacingMs':1,
                      'directVerificationReusedFromIdenticalFields':reuse_verified,
                      'publishedTraceQuantizationMv':.000001,
                      'histogramToDirectIndependentRmseMv':float(np.sqrt(np.mean((approximate[:,fm.INDEP]-exact[:,fm.INDEP])**2))),
                      'histogramToDirectMaxAbsoluteMv':float(np.max(np.abs(approximate-exact))),
                      'predictionMethod':'Direct 1 ms all-source Vm × physical reciprocal lead-field products; no histogram approximation in the selected published trace.',
                      'sourceSiteCount':len(fields[0]),'displaySourceSiteCount':len(selected['field']['sourceActivationMs']),
                      'renderNodeCount':forward.base['renderNodeCount'],
                      'staticRestingSourceMv':dict(zip(fm.LEADS,rest_signal.tolist())),
                      'prReferenceBeforeSubtractionMv':dict(zip(fm.LEADS,pr_reference.tolist()))})
    if preview:
        numerical['predictionMethod']='PROVISIONAL: all-site AT/APD histogram at0.5ms/3ms. Direct Vm verification is still running; this file will be replaced before publication.'
        numerical.pop('staticRestingSourceMv');numerical.pop('prReferenceBeforeSubtractionMv')
    selected['ecg']=fm.lead_dict(exact)
    selected['metrics']={'training':fm.metrics(exact,train,times,windows),'heldOut':fm.metrics(exact,test,times,windows)}
    selected['morphology']=morphology(exact,observed,case,times)
    if selected['id'].startswith('recovery-prior-'):
        st=selected['morphology']['st']['jPlus60'];best_st=numerical_winner['morphology']['st']['jPlus60']
        selected['physiologyNote']=('A stronger, explicit recovery prior limits the RV offset and regional gradients; these are modeling assumptions, not patient ground truth. '
            f'The small aggregate error penalty hides a larger local ST tradeoff: V2 at J +60 ms is {st["modeledMv"]["V2"]:.3f} mV here, '
            f'{st["observedMedianMv"]["V2"]:.3f} mV recorded, and {best_st["modeledMv"]["V2"]:.3f} mV in the best numerical comparison. '
            'Inspect ST-window errors and the overlay; neither model fully reproduces this STEMI.')
    # Render field reconstructs exactly the sites entering the forward model;
    # it is never independently retimed to match a measured trace.
    source_ids=np.asarray(forward.base['field']['sourceGlobalIds'])
    sample_times=np.linspace(-250,650,37)
    maximum_error=0.
    for typ,key in enumerate(['ventricular','atrial']):
        mask=np.asarray(selected['field']['sourceType'])==typ
        at0,apd0,rest0,amp0=(fields[i][source_ids][mask] for i in range(4))
        at1,apd1,rest1,amp1=(np.asarray(selected['field'][key1])[mask] for key1 in ['sourceActivationMs','sourceApd90Ms','sourceRestMv','sourceAmplitudeMv'])
        family=p.get('plateauShapeFamily','rational') if typ==0 else 'rational'
        shape0=fields[5][source_ids][mask] if len(fields)>5 and typ==0 else 1.
        shape_key='sourcePlateauFraction' if family=='early-plateau' else 'sourcePlateauGamma'
        shape1=np.asarray(selected['field'][shape_key])[mask] if shape_key in selected['field'] and typ==0 else 1.
        for t in sample_times:
            v0=rest0+amp0*sum(fm.q_at(t-at0-cycle*rr,apd0,forward.tpl[key],shape0,family) for cycle in [-1,0,1])
            v1=rest1+amp1*sum(fm.q_at(t-at1-cycle*rr,apd1,forward.tpl[key],shape1,family) for cycle in [-1,0,1])
            maximum_error=max(maximum_error,float(np.max(np.abs(v0-v1))))
    numerical['exportedSourceFieldRoundingMaxVmErrorMv']=maximum_error
    assert maximum_error<.01
    summary={'schemaVersion':1,'provisional':preview,'recordId':identifier,'title':case['title'],'kind':fit['kind'],
             'timeMs':times.tolist(),'rrMs':rr,'selectedApproachId':selected['id'],
             'bestNumericalApproachId':numerical_winner['id'],
             'selectionReason':fit.get('teachingSelectionReason','Lowest declared-window training RMSE among explored pathology candidates.'),
             'physiologyNote':selected.get('physiologyNote'),
             'field':selected['field'],'pose':selected.get('pose'),
             'ecg':{'observed':case['samplesMv'],'train':case['trainMv'],'heldOut':case['testMv'],
                    'p25':case['iqrLowMv'],'p75':case['iqrHighMv'],'predicted':selected['ecg'],
                    'original':{lead:np.interp(times,case['native']['sampleGridMs'],values).round(6).tolist() for lead,values in case['representativeOriginalBeat']['baselineCorrectedNativeSamplesMv'].items()},
                    'originalRaw':{lead:np.interp(times,case['native']['sampleGridMs'],values).round(6).tolist() for lead,values in case['representativeOriginalBeat']['nativeSamplesMv'].items()},
                    'residual':fm.lead_dict(exact-observed)},
             'approaches':output_approaches,'metrics':selected['metrics'],'parameters':p,
             'morphology':selected['morphology'],'numericalVerification':numerical,
             'sourceSummary':selected['sourceSummary'],
             'target':{k:case[k] for k in ['quality','source','baselineWindowMs','analysisWindowMs','fiducialsMs','fiducialUncertaintyMs','fiducialProvenance','stMetrics','anchorDefinition','nativeFs','nativeResolutionMs','interpolation','neighboringBeat','limitations']},
             'comparisonWindowsMs':windows,
             'targetRepeatability':fm.metrics(train,test,times,windows),
             'parameterBoundaryFlags':bound_flags(fit['history']),
             'parameterBoundaryFlagsScope':'Across all search stages, including losing candidates and the healthy prior; these are not necessarily boundaries of the selected final parameters.',
             'uncertainty':{'interpretation':'Candidate/start spread and bounds describe model sensitivity, not statistical confidence or patient-specific identifiable physiology.',
                            'alternativeCandidateCount':len(output_approaches)-1,
                            'selection':'bestNumericalApproachId minimizes raw-mV training RMSE across I,II,V1–V6 on analysisWindowMs. selectedApproachId may instead be an explicitly prior-informed teaching default. Held-out beats do not fit or select source parameters.',
                            'validationScope':'Held-out alternating beats from the same short recording test within-record reproducibility. They are not independent patients, external clinical validation or an invasive-map comparison.'},
             'provenance':{'anatomy':'Generic Rodero CT-average four-chamber mesh; not this patient’s imaging.',
                           'meshSource':SOURCES[0],'sources':SOURCES,'targetRecord':case['source'],
                           'sourceReleaseSha256':json.loads((BASE/'operator-provenance.json').read_text())['sourceReleaseSha256'],
                           'script':'scripts/fit-pathology-model.py; fit-pathology-pose.py; fit-pathology-export.py',
                           'objective':'Eight independent channels I,II,V1–V6. Phase fits use weights1/max(QRS target RMS,0.20mV); common source gains only. Original whole optimization weightsQRS1.6/ST2.0. New AP-shape sensitivities retain their explicit selectionPhaseWeights/selectionObjective; weights multiply residuals. Numerical ranking uses raw-mV whole-window training RMSE. Teaching selection may use an explicitly disclosed recovery prior and phase tradeoff.',
                           'referenceDefinition':'Each modeled and observed lead has the same constant pre-QRS PR reference subtracted. Static injury-resting source is included before subtraction. No high-pass filtering, waveform time-warping or output-waveform basis adjustment.',
                           'mechanism':'Anisotropic shortest-path myocardial activation with endocardial fast-layer surrogate and discrete delivery sites; prescribed human ventricular optical AP family and human atrial ionic-model AP; finite homogeneous torso reciprocal FEM source integral.',
                           'totalForwardEvaluations':fit['totalForwardEvaluations'],
                           'reproducibility':'Run fit-pathology-prepare.py --midpoint, fit-pathology-model.py --case RECORD, fit-pathology-pose.py --basis, fit-pathology-pose.py --case RECORD, fit-pathology-export.py --case RECORD.'},
             'limitations':[
                 'This is a constrained explanatory best guess on generic anatomy. Twelve surface leads do not uniquely determine activation, Purkinje anatomy, APD, conductivity, injury extent or heart pose.',
                 'The ECG, generic CT mesh and optical AP template come from different people. No patient-specific torso, electrode coordinates, activation mapping or transmembrane recordings are available.',
                 'A shortest-path/lead-field reduced model is not a coupled bidomain ionic simulation. It omits detailed Purkinje junctions, scar, lungs/blood conductivity heterogeneity and electromechanical feedback.',
                 'The fitted common source gains are effective amplitude parameters, not measured intracellular conductivities. Rest/plateau attribution is a fixed illustrative prior, not separately inferred physiology.',
                 'Posed variants move the entire generic heart and conductivity tensors inside fixed virtual electrodes; this is fitted nuisance geometry, distinct from rotating the viewing camera.',
                 'Remaining QRS/ST/T morphology errors and parameters at bounds show model limitations. A low aggregate error does not prove that the displayed propagation is the patient’s true propagation.',
                 'Held-out beats belong to the same short recording. This evaluates repeatability, not clinical diagnostic performance or independently validated patient physiology.',
                 'The original recording is 500 Hz. The 1 ms target display grid interpolates those samples and does not create 1 kHz measured resolution.',
             ]}
    summary['target']['representativeOriginalBeat']={k:case['representativeOriginalBeat'][k] for k in ['sourceAnchorSeconds','sourceAnchorSample','baselineMv','selection']}
    summary['parameterDefinitions']={'lesionDepth':'Dimensionless sigmoid boundary/extent parameter. Values above1 saturate the modeled wall involvement; this is not a literal percentage or measured transmural depth.',
                                    'rvApdOffset':'Additive RV APD parameter within the prescribed recovery field, not a direct measurement or by itself the full LV/RV APD difference.',
                                    'gain':'Effective common ventricular source gain, not an independently measured tissue conductivity.',
                                    'plateauGamma':'Positive dimensionless rational template-age shape parameter;1 is the original shape. Local APD90 and the rapid upstroke are preserved. It is not an ion-channel conductance.',
                                    'injuryPlateauGamma':'Injury-region rational-shape endpoint, blended by the smooth lesion weight. Bounds are sensitivity assumptions.',
                                    'injuryPlateauFraction':'Injury-region normalized early-plateau target after the preserved upstroke. Actual local values blend with reference1 by lesion weight. The30ms transition and waveform family are prescribed, not recovered ionic dynamics.',
                                    'shapeBin':'Numerical interpolation grid for AP-shape convolution during fitting; not a biological parameter.'}
    if case.get('externalAutomaticDelineation'):
        summary['target']['externalAutomaticDelineation']=case['externalAutomaticDelineation']
    if selected.get('pose'):
        pose=selected['pose'];pose_flags=[]
        for kind,values,bound in [('rotationDeg',pose['anglesDeg'],25),('translationMm',pose['translationMm'],18)]:
            for axis,value in zip('xyz',values):
                if abs(value)>=.99*bound:
                    pose_flags.append({'parameter':f'{kind}.{axis}','value':value,'bounds':[-bound,bound]})
        summary['uncertainty']['poseBoundaryFlags']=pose_flags
    comparison_set=[a for a in output_approaches[1:] if a['metrics']['training']['wholeBeat']['independentLeadRmseMv']<=1.25*selected['metrics']['training']['wholeBeat']['independentLeadRmseMv']]
    summary['uncertainty']['candidateSetRule']='Pathology candidates with training whole-window RMSE no more than25% above the selected model; a sensitivity set, not a confidence region.'
    summary['uncertainty']['candidateIds']=[a['id']for a in comparison_set]
    summary['uncertainty']['parameterRangesAcrossCandidates']={key:[float(min(a['parameters'][key]for a in comparison_set)),float(max(a['parameters'][key]for a in comparison_set))] for key,value in p.items() if isinstance(value,(int,float)) and all(key in a['parameters'] for a in comparison_set)}
    if len(comparison_set)>1:
        at_spread=np.ptp(np.array([a['field']['sourceActivationMs']for a in comparison_set]),axis=0)
        apd_spread=np.ptp(np.array([a['field']['sourceApd90Ms']for a in comparison_set]),axis=0)
        summary['uncertainty']['activationSpreadQuantilesMs']=dict(zip(['median','p90','max'],np.quantile(at_spread,[.5,.9,1]).tolist()))
        summary['uncertainty']['apdSpreadQuantilesMs']=dict(zip(['median','p90','max'],np.quantile(apd_spread,[.5,.9,1]).tolist()))
        summary['uncertainty']['scope']='Spread among a finite set of explored source-model candidates. It omits untested anatomies, noise models and many other physiologies; it understates total inverse uncertainty.'
    summary['evaluatorVerification']=evaluator_fixtures(forward,selected['field'],rr)
    summary['provenance']['reproducibility']='Run fit-pathology-prepare.py --midpoint; fit-pathology-model.py --case RECORD; fit-pathology-pose.py --basis; fit-pathology-pose.py --case RECORD; fit-pathology-alternatives.py --case RECORD; fit-pathology-distributed.py --case RECORD; fit-pathology-pose-refine.py --case RECORD. ForACS, add fit-pathology-conservative.py, fit-pathology-plateau.py and fit-pathology-early-plateau.py before fit-pathology-export.py --case RECORD. Target preparation and public download checks are documented in TARGET_METHODS.md.'
    if fit['kind']=='stemi':
        summary['limitations'].append('The angiographic culprit is a source label acquired later than the ECG; it is not simultaneous validation of the modeled electrical injury region. AP excursion, APD and delay are fitted phenomenological source changes, not measured ion concentrations or a definitive infarct boundary.')
    else:
        summary['limitations'].append('Automated PTB-XL+ measurements of this same recording report QRS138/142/159ms and RR1038/1039/1042ms across three systems, but QT476/486/626ms and PR180/182/287ms disagree. The reviewed late recovery/T–U endpoint is uncertain; this fit does not make a QT diagnosis or treat automatic delineation as activation ground truth.')
        summary['target']['automatedMeasurementCrosscheck']={'dataset':'PTB-XL+1.0.1','url':'https://physionet.org/content/ptb-xl-plus/1.0.1/',
            'qrsDurationMs':[138,142,159],'rrMs':[1038,1039,1042],'qtMs':[476,486,626],'prMs':[180,182,287],
            'interpretation':'Corroboration of a wide QRS and RR interval; algorithm-dependent PR/QT disagreement. Automated measurements, not expert labels or activation mapping.'}
    directory=OUT/'cases';directory.mkdir(exist_ok=True)
    summary=readable_metadata(summary)
    temporary=directory/f'.{identifier}.json.tmp'
    temporary.write_text(json.dumps(fm.plain(summary),separators=(',',':'))+'\n')
    temporary.replace(directory/f'{identifier}.json')
    compact={k:summary[k] for k in ['recordId','title','kind','selectedApproachId','bestNumericalApproachId','selectionReason','metrics','morphology','numericalVerification','sourceSummary','targetRepeatability','parameterBoundaryFlags','uncertainty']}
    (BASE/f'verification-{identifier}.json').write_text(json.dumps(fm.plain(compact),indent=2)+'\n')
    manifest_path=OUT/'manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'schemaVersion':1,'cases':[]}
    manifest['baseModelUrl']='cardiac-voltage/data/heart-model.json'
    manifest['title']='Recorded ECGs and anatomical source-model fits'
    manifest['cases']=[c for c in manifest['cases'] if c['recordId']!=identifier]+[{'recordId':identifier,'title':case['title'],'kind':fit['kind'],'file':f'data/pathology-fits/cases/{identifier}.json','selectedApproachId':selected['id'],'heldOutRmseMv':summary['metrics']['heldOut']['wholeBeat']['independentLeadRmseMv']}]
    manifest['cases'].sort(key=lambda c:(0 if c['kind']=='rbbb' else 1,c['recordId']))
    temporary_manifest=OUT/'.manifest.json.tmp'
    temporary_manifest.write_text(json.dumps(manifest,indent=2)+'\n')
    temporary_manifest.replace(manifest_path)
    fm.emit(f'EXPORTED {identifier}: {selected["id"]}; held-out {summary["metrics"]["heldOut"]["wholeBeat"]["independentLeadRmseMv"]:.4f} mV')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case',required=True,choices=['ptbxl-03155','acs-00004'])
    parser.add_argument('--preview',action='store_true')
    parser.add_argument('--reuse-verified',action='store_true',help='Refresh metadata only when a direct-verified case has identical parameters, pose and source fields')
    args=parser.parse_args()
    with threadpool_limits(limits=2):export_case(args.case,args.preview,args.reuse_verified)


if __name__=='__main__':main()

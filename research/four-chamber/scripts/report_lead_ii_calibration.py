#!/usr/bin/env python3
"""Assemble the exact selected-model calibration report after the full build."""
from pathlib import Path
import json, hashlib, os
import numpy as np
from scipy.signal import find_peaks, peak_prominences

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT/'data-source/four-chamber'
OUT = ROOT/'dist/data'
SEARCH = SRC/'calibration-search'
TIME = np.arange(1001.)


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a)-np.asarray(b))**2)))


def main():
    model = read(OUT/'heart-model.json')
    assert model.get('calibration'), 'Run the calibrated full-source builder first'
    cfg = read(SRC/'lead-ii-calibration.json')
    assert model['inputSha256']['lead-ii-calibration.json'] == sha(SRC/'lead-ii-calibration.json')
    baseline = read(SRC/'lead-ii-fit-baseline.json')
    reference = read(SRC/'ptb-healthy-reference.json')
    previous = read(SRC/'lead-ii-fidelity-experiments.json')
    shift = cfg['displayClockOffsetMs']
    anchor = cfg['targetReferenceRTimeMs']
    ref_time = np.arange(reference['sampleCount']) * reference['dtMs'] + reference['startRelativeRMs']
    reference_leads = reference['allLeadsMv']
    reference_leads['II'] = reference['leadIIMv']
    fixed_windows = {'whole': (30, 730), 'p': (40, 210),
                     'qrs': (215, 340), 'stt': (340, 730)}
    relative_windows = {'whole': (-231, 469), 'p': (-221, -51),
                        'qrs': (-46, 79), 'stt': (79, 469)}

    def reference_on_clock(lead, r_time=anchor):
        return np.interp(TIME-r_time, ref_time, reference_leads[lead], left=0, right=0)

    def translated(values):
        return np.interp(TIME-shift, TIME, values, left=0, right=0)

    def main_r(values):
        return int(np.argmax(np.asarray(values)[205:350])+205)

    def metrics(values, lead='II', r_time=None):
        values = np.asarray(values)
        if r_time is None:
            r_time = main_r(values)
        fixed_ref = reference_on_clock(lead)
        fixed = {key: rmse(values[a:b], fixed_ref[a:b])
                 for key, (a,b) in fixed_windows.items()}
        aligned = {}
        for key,(a,b) in relative_windows.items():
            relative = np.arange(a,b,dtype=float)
            candidate = np.interp(relative+r_time, TIME, values)
            ref = np.interp(relative, ref_time, reference_leads[lead])
            aligned[key] = rmse(candidate, ref)
        return {'fixedTargetClockRMSEMv': fixed,
                'rAlignedRMSEMv': aligned, 'alignmentRTimeMs': r_time}

    def morphology(values):
        values = np.asarray(values)
        r = main_r(values)
        p = int(np.argmax(values[40:210])+40)
        t = int(np.argmax(values[380:700])+380)
        region = values[215:340]
        indices,_ = find_peaks(region, prominence=.01)
        prominences = peak_prominences(region,indices)[0]
        peaks = [{'timeMs': int(i+215), 'voltageMv': float(values[i+215]),
                  'prominenceMv': float(pr)}
                 for i,pr in zip(indices,prominences) if values[i+215]>0]
        secondary = [q['prominenceMv'] for q in peaks if q['timeMs']!=r]
        return {'pPeakMs':p, 'pPeakMv':float(values[p]),
                'rPeakMs':r, 'rPeakMv':float(values[r]),
                'tPeakMs':t, 'tPeakMv':float(values[t]),
                'rToTPeakMs':t-r,
                'qMinimumMv':float(values[215:r+1].min()),
                'positiveQRSPeaks':peaks,
                'secondaryPositiveQRSPeakProminenceMv':max(secondary,default=0.)}

    # Rewrite human-facing historical descriptions, preserving exact parameters.
    descriptions = {
      'baseline': ('Previous published model', 'The preceding 330,758-node model with 12 regional delivery sites and one optical-pixel AP recovery shape.', 'Baseline'),
      'source_refinement': ('Denser source-field evaluation', 'Original parameters and anatomy, with every tetrahedral edge midpoint added: 2,336,903 source-field sites.', 'Numerical improvement; essentially no morphology-fit gain'),
      'unrestricted_regions': ('Unrestricted four-region fit', 'Fit four regional onset times and a common propagation-speed scale.', 'Rejected: regional chronology deviated too far from the mapping assumptions'),
      'bounded_regions': ('Four regions with timing constraints', 'Keep LV regions near simultaneous onset and a short RV delay; fit propagation speed and effective ventricular source conductivity.', 'Improved fit; residual R shoulders'),
      'twelve_deliveries': ('Twelve individually timed delivery sites', 'Fit bounded onset differences at the 12 existing sites, plus atrial parameters.', 'Improved fit; terminal QRS shoulders remain'),
      'fast_endocardium': ('Faster endocardial propagation', 'Retain slower myocardium but raise endocardial speed to 2 mm/ms and refit the 12 sites.', 'Not selected: a larger QRS error'),
      'fifteen_deliveries': ('Fifteen coordinated delivery sites', 'Add three basal RV delivery sites. Fit bounded arrivals with an explicit single-R morphology prior acting through source-model parameters.', 'Selected activation family'),
      'optical_recovery_fit': ('Single-pixel optical duration fit', 'Fit four APD-field parameters while retaining the preceding single-pixel optical AP family and 12-site activation.', 'Improved recovery timing; single-pixel slope variation remains'),
      'ionic_recovery': ('Published TT06 ionic AP family', 'Use the native TT06 endocardial voltage scale and upstroke, with refitted activation and four APD-field parameters.', 'Independent AP-family comparison; steeper terminal recovery'),
      'ionic_shape_fit': ('TT06 with fitted APD50 shape', 'Smoothly warp TT06 recovery while retaining its native rise, then fit the APD field.', 'Rejected as default: the fitted APD50/APD90 ratio reached 0.68, far from native 0.906'),
      'sigmoid_recovery': ('Phenomenological smooth recovery', 'Use a smooth sigmoid membrane recovery with the same assumed 2 ms intrinsic upstroke; fit the APD field.', 'Exploratory comparison; less directly tied to the recorded AP shape'),
    }
    methods = previous['methods']
    for method in methods:
        title, description, disposition = descriptions[method['id']]
        method.update(title=title, description=description, disposition=disposition)
        method['metrics'] = {**metrics(method['leadII']), **morphology(method['leadII'])}
        method['parameters'].pop('description',None)

    for key, title, filename, disposition in [
        ('pooled_richards', 'Equal-donor pooled AP: Richards fit',
         'fit-pooled-fit5-basal-pooled.json',
         'Valid data-derived alternative; its T wave is broader and lower than the target'),
        ('pooled_direct', 'Equal-donor pooled AP: direct recovery',
         'fit-pooled-fit5-basal-pooled-direct.json',
         'Selected AP family; the AP shape was derived without ECG information'),
    ]:
        q = read(SEARCH/filename)
        values = translated(q['leadII'])
        methods.append({'id':key, 'title':title,
          'description':'Fixed recovery shape pooled from 2,948 accepted human optical sites across two donors with equal donor weighting; only the spatial APD field is fitted to lead II.',
          'disposition':disposition,
          'parameters':{'durationField':dict(zip(['medianMs','transmuralContrastMs','apicobasalContrastMs','rvOffsetMs'],q['x'])),
                        'activationModel':'Fifteen delivery sites, plus the reconstructed appendage and fitted atrial parameters'},
          'metrics':{**metrics(values),**morphology(values)},'leadII':values.tolist()})

    selected = np.asarray(model['variants']['heterogeneous']['ecg']['II'])
    old = translated(baseline['ecg']['II'])
    selected_r = main_r(selected)
    old_r = main_r(old)
    selected_metrics = {**metrics(selected), **morphology(selected)}
    baseline_metrics = {**metrics(old), **morphology(old)}
    improvement = {key: 1-selected_metrics['fixedTargetClockRMSEMv'][key]/
                   baseline_metrics['fixedTargetClockRMSEMv'][key]
                   for key in fixed_windows}
    methods.append({'id':'selected_complete','title':'Selected full-source model',
       'description':'The chosen 15-site delivery model and direct pooled human recovery, with the connected reconstructed appendage and all native plus midpoint source-field sites. This is the exact published model output.',
       'disposition':'Default displayed simulation','parameters':cfg,
       'metrics':selected_metrics,'leadII':selected.tolist()})

    all_leads = {}
    for lead in model['leads']:
        before = metrics(translated(baseline['ecg'][lead]),lead,old_r)
        after = metrics(model['variants']['heterogeneous']['ecg'][lead],lead,selected_r)
        all_leads[lead]={'usedAsFitTarget':lead=='II','before':before,'after':after,
          'fixedClockWholeRmseChangeFraction':1-after['fixedTargetClockRMSEMv']['whole']/before['fixedTargetClockRMSEMv']['whole']}
    worsened = [lead for lead, q in all_leads.items()
                if lead != 'II' and q['fixedClockWholeRmseChangeFraction'] < 0]

    report = {
      'schemaVersion':2,'title':'Lead II calibration: methods, numerical checks, and limits',
      'status':'Exact selected model evaluated after all-source recomputation',
      'modelSha256':sha(OUT/'heart-model.json'),
      'calibrationSha256':sha(SRC/'lead-ii-calibration.json'),
      'templateSha256':sha(SRC/cfg['ventricularTemplateFile']),
      'timeMs':TIME.tolist(),'referenceRTimeMs':anchor,'displayClockOffsetMs':shift,
      'reference':{'record':reference['record'],'sourceUrl':reference['sourceUrl'],
                   'role':'Fitting target; not independent validation',
                   'processing':reference['processing'],
                   'lateTailCaveat':'The raw median retains a positive late post-T offset. The model is not forced to explain this as persistent myocardial depolarization.'},
      'targetLeadII':reference_on_clock('II').tolist(),
      'baseline':{**{key:baseline[key]for key in ['sourceCommit','modelSha256']},'metrics':baseline_metrics},
      'selected':{'metrics':selected_metrics,'fixedClockRmseReductionFraction':improvement,
                  'electricalNodes':model['computationalNodeCount'],
                  'sourceFieldSites':model['sourceFieldNodeCount'],
                  'myocardialTetrahedra':model['elementCount'],
                  'variant':'heterogeneous'},
      'metricDefinitions':{'units':'Raw mV; no amplitude scaling or normalization',
        'fixedClockWindowsMs':{k:list(v)for k,v in fixed_windows.items()},
        'rAlignedWindowsRelativeMs':{k:list(v)for k,v in relative_windows.items()},
        'fixedClock':'Both the optimization clock and all historical traces receive the same 30 ms translation. The target R anchor is 261 ms.',
        'rAligned':'Translate the whole reference to each candidate lead-II R maximum. No stretching or amplitude change. The same R shift is used for every lead.',
        'secondaryR':'Largest prominence of a secondary positive maximum in 215–340 ms, with a 0.01 mV minimum prominence; a descriptive metric, not a diagnostic criterion.'},
      'search':previous['numericalSearch'],
      'specifiedDeliverySiteTerritories':{
        'definition':'Count of native ventricular nodes whose earliest-arrival route comes from each specified site, before the common display-clock translation.',
        'nodeCounts':[20998,7313,12473,28310,8373,22812,5119,0,53800,33671,8996,12927,0,12242,23382],
        'specifiedSites':15,'nonemptyTerritories':13,
        'interpretation':'Two specified delivery times are superseded by propagation from other sites. Two of the three added basal RV sites supply nonempty earliest-arrival territories. This is one example of parameter nonuniqueness, not a measured Purkinje map.'},
      'methods':methods,'allLeadComparison':all_leads,
      'nonTargetLeadCheck':{'worsenedLeads':worsened,'worsenedCount':len(worsened),
        'nonTargetLeadCount':len(all_leads)-1,
        'interpretation':'The improved lead-II fit does not generalize across the full 12-lead reference. This is a material limit of a single-lead calibration with unmatched anatomy and a simplified torso.'},
      'limitations':[
        'The target ECG, CT-derived anatomy, and optical AP recordings come from different people. This is an educational calibrated model, not a patient digital twin.',
        'Lead II is used in parameter selection. Better fit is calibration performance, not independent clinical validation; other leads are not optimized.',
        'The 15 delivery sites and their arrivals are assumed Purkinje-delivery surrogates, not measured junctions. The atrial model uses a published ionic template and reduced conduction rules.',
        'Source conductivity is an effective fitted parameter. It is independently parameterized from graph propagation in this reduced model, rather than coupled through an ionic tissue PDE.',
        'The pooled human AP shape is data-derived, while its absolute voltage, intrinsic upstroke, and spatial duration field include stated assumptions or fitted parameters.',
        'The fitted RV APD offset reaches its −35 ms bound, underscoring parameter uncertainty and nonuniqueness.',
        'The inferred appendage geometry is not a recovered scan. More field sites improve integration of the specified model but do not add biological measurements.',
        'A homogeneous ellipsoidal torso and virtual electrodes remain; lungs, blood compartments, an anatomical torso, and mechanical contraction are not represented.'
      ],
      'sources':[
        {'title':'Measured PTB control ECG','url':reference['sourceUrl']},
        {'title':'Smirnov human optical AP recordings','url':'https://zenodo.org/records/3986725'},
        {'title':'Rodero CT-derived four-chamber anatomy','url':'https://doi.org/10.1371/journal.pcbi.1008851'},
        {'title':'Durrer human ventricular activation','url':'https://pubmed.ncbi.nlm.nih.gov/5482907/'},
        {'title':'Cranford regional delivery sensitivity','url':'https://pubmed.ncbi.nlm.nih.gov/29549620/'},
        {'title':'TT06 ionic model implementation','url':'https://models.cellml.org/e/80d'}
      ]
    }
    for dest in [SRC/'lead-ii-fit-study.json',OUT/'lead-ii-fit-study.json']:
        dest.write_text(json.dumps(report,indent=2)+'\n')

    phase_rows='\n'.join(f"| {label} | {baseline_metrics['fixedTargetClockRMSEMv'][key]:.5f} | {selected_metrics['fixedTargetClockRMSEMv'][key]:.5f} | {100*improvement[key]:.1f}% |"
                         for key,label in [('whole','700-ms window'),('p','P wave'),('qrs','QRS'),('stt','ST / T')])
    method_rows='\n'.join(f"| {q['title']} | {q['metrics']['fixedTargetClockRMSEMv']['whole']:.4f} | {q['metrics']['fixedTargetClockRMSEMv']['qrs']:.4f} | {q['disposition']} |"for q in methods)
    lead_rows='\n'.join(f"| {lead} | {q['before']['fixedTargetClockRMSEMv']['whole']:.4f} | {q['after']['fixedTargetClockRMSEMv']['whole']:.4f} | {'Fit target' if q['usedAsFitTarget'] else 'Not fitted'} |"for lead,q in all_leads.items())
    notes=f"""# Lead II: calibration methods and limits

The updated signal is a full spatial forward calculation from prescribed local
membrane action potentials. It uses **{model['sourceFieldNodeCount']:,} source-field
sites**, including tetrahedral edge midpoints, on the connected four-chamber
geometry with its inferred left atrial appendage. The 15 specified ventricular
delivery locations, their timing, conduction speeds, effective source
conductivities, and spatial APD field were calibrated to lead II from the
measured PTB healthy-control record `{reference['record']}`.

This target was used in parameter selection. Improved agreement is calibration
performance, not an independent validation of the inferred physiology. Anatomy,
optical recordings, and ECG come from different people.

## Quantitative comparison

The comparison uses raw mV. The optimization clock and both model traces receive
the same 30 ms translation; the fixed target R anchor is 261 ms. The full JSON
also reports a separate R-aligned comparison using a rigid time translation.
Neither comparison scales amplitudes or stretches time.

| Comparison | Previous RMSE, mV | Updated RMSE, mV | Reduction |
|---|---:|---:|---:|
{phase_rows}

The selected R maximum is {selected_metrics['rPeakMv']:.4f} mV at
{selected_metrics['rPeakMs']} ms; the T maximum is
{selected_metrics['tPeakMv']:.4f} mV at {selected_metrics['tPeakMs']} ms.
The measured reference has a 1.15375 mV R maximum and a 0.4035 mV T maximum.
The largest secondary positive QRS peak has a prominence of
{selected_metrics['secondaryPositiveQRSPeakProminenceMv']:.5f} mV under the
declared 0.01 mV detection threshold. This descriptive metric is not a clinical
diagnostic criterion.

## What produced the improvement

Increasing source-field resolution alone had little effect on the preceding
signal: the controlled midpoint refinement changed whole-beat RMS voltage by
about 0.00108 mV and left QRS fitting error essentially unchanged. It improves
integration of the specified membrane field; it does not add biological data or
solve a more complete propagation model.

The main QRS improvement came from coordinating ventricular delivery. The
preceding model allowed a late basal RV contribution to create a separate R
shoulder. Fitting bounded timing at the existing 12 locations helped; adding
three modeled basal RV delivery locations helped more. The source model uses
the earliest arrival from any site, so 13 of the 15 specified sites have
nonempty earliest-arrival territories. Two sites are superseded by other
fronts. This illustrates why an ECG fit cannot uniquely identify a Purkinje
network.

The recovery template now pools **2,948 accepted optical sites from two human
donor LV wedges**: 2,493 sites from donor 1 and 455 from donor 2. Sites were
aligned by activation and normalized APD for shape estimation, then pooled
within each donor and given equal donor weight. These are optically sampled
tissue sites, not independent individual-cell recordings. The selected direct
pooled recovery shape was derived without ECG information. Its local duration
field was subsequently fitted to the ECG; no whole-heart measured APD map is
claimed. The intrinsic 2 ms upstroke and −85/+25 mV membrane scale remain
explicit assumptions because optical fluorescence does not calibrate either.

The direct pooled recovery gave a closer T wave than a smooth Richards fit to
the same optical pool. Published TT06 endocardial ionic output was also tested
with its native voltage scale and rapid upstroke. It gave a steeper terminal
recovery and did not improve the chosen fit. A further APD50 time-warp fit
required a large distortion of the native ionic shape and was rejected as the
default. All these alternatives are retained in the numerical study.

## Explored alternatives

These are staged experiments, not a factorial comparison: some stages add
atrial fitting or the appendage, while others isolate source-field sampling or
an AP family. The complete parameters, source clock, traces, and disposition
are in `lead-ii-fit-study.json` and `calibration-search/`.

| Method | Whole-window RMSE, mV | QRS RMSE, mV | Interpretation |
|---|---:|---:|---|
{method_rows}

## Parameter and validation limits

The effective ventricular source conductivities are
{.20*cfg['ventricularConductivityScale']:.5f} S/m longitudinally and
{.05*cfg['ventricularConductivityScale']:.5f} S/m transversely. The isotropic
atrial value is {cfg['atrialConductivitySm']:.5f} S/m. These are fitted source
parameters, not measured conductivities from either donor. They are independent
of the graph travel speeds in this reduced model; this is not a coupled ionic
tissue PDE.

The selected ventricular APD90 median is
{cfg['durationParameters']['medianMs']:.2f} ms. The RV offset reaches its
−35 ms fit bound, so it should be treated as uncertain. The torso remains a
homogeneous ellipsoid with virtual electrodes. Fine anatomy, blood and lung
conductivity compartments, and mechanical contraction are not represented.

The measured reference retains a late positive post-T offset. A perfect fit to
that tail was not imposed as persistent myocardial depolarization. Small
remaining ST and P-wave differences should be interpreted alongside the source
and measurement assumptions.

Only lead II was optimized. The table below exposes what happened to the other
leads under the same model and the same reference R clock. It is not an
independent clinical validation; all leads come from the same reference person.
**{len(worsened)} of the {len(all_leads)-1} non-target leads have a larger
whole-window error after this lead-II calibration.** The improved fit therefore
does not establish a generally more accurate 12-lead heart model.

| Lead | Previous whole-window RMSE, mV | Updated RMSE, mV | Role |
|---|---:|---:|---|
{lead_rows}

## Reproduction and provenance

`scripts/build_four_chamber_model.py` rebuilds the selected model from
`lead-ii-calibration.json`, the pooled template, anatomy, and torso inputs.
`scripts/report_lead_ii_calibration.py` creates this report from its exact output.
`scripts/audit_four_chamber_model.py` independently checks the source field,
forward integration, source mapping, timing, and browser AP evaluation. The
historical bounded searches and rejected alternatives are retained in
`data-source/four-chamber/calibration-search/` with their input requirements.

- Model SHA-256: `{report['modelSha256']}`
- Calibration SHA-256: `{report['calibrationSha256']}`
- Selected AP template SHA-256: `{report['templateSha256']}`

Primary sources: [PTB ECG]({reference['sourceUrl']}),
[Smirnov human optical data](https://zenodo.org/records/3986725),
[Rodero anatomy](https://doi.org/10.1371/journal.pcbi.1008851),
[Durrer human activation](https://pubmed.ncbi.nlm.nih.gov/5482907/),
[Cranford delivery sensitivity](https://pubmed.ncbi.nlm.nih.gov/29549620/), and
[TT06 ionic implementation](https://models.cellml.org/e/80d).
"""
    (OUT/'LEAD_II_CALIBRATION.md').write_text(notes)
    (SRC/'LEAD_II_CALIBRATION.md').write_text(notes)

    os.environ.setdefault('MPLCONFIGDIR','/tmp/cardiac-matplotlib')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,
                         'axes.spines.top':False,'axes.spines.right':False})
    fig = plt.figure(figsize=(13.5,9.2),facecolor='#f7f8f4',layout='constrained')
    grid=fig.add_gridspec(3,2,height_ratios=[1.15,1,.75])
    full=fig.add_subplot(grid[0,:]);qrs=fig.add_subplot(grid[1,0]);twave=fig.add_subplot(grid[1,1]);bar=fig.add_subplot(grid[2,:])
    colors={'old':'#cc7366','new':'#137b68','ref':'#8c7034'}
    for ax in [full,qrs,twave]:
        ax.set_facecolor('#ffffff');ax.axhline(0,color='#778181',lw=.65)
        ax.plot(TIME-old_r,old,color=colors['old'],lw=1.7,label='Previous model')
        ax.plot(ref_time,reference['leadIIMv'],color=colors['ref'],lw=1.6,ls='--',label='Measured fitting target')
        ax.plot(TIME-selected_r,selected,color=colors['new'],lw=2.2,label='Updated calculated signal')
        ax.grid(alpha=.16);ax.set_ylabel('Lead II · mV');ax.set_xlabel('Time from each lead-II R maximum · ms')
    full.set_xlim(-250,450);full.legend(loc='upper right',frameon=False,ncol=3,fontsize=9)
    full.set_title('A closer lead II, calculated from the membrane-voltage field',loc='left',fontweight='bold',fontsize=16,pad=15)
    full.text(.0,1.02,'R-aligned comparison · no amplitude normalization · calibration to one measured healthy-control record',transform=full.transAxes,fontsize=9,color='#596563')
    qrs.set_xlim(-65,105);qrs.set_title('Coordinated delivery removes the exaggerated R shoulder',loc='left',fontsize=11,fontweight='bold')
    twave.set_xlim(100,410);twave.set_ylim(-.12,.56);twave.set_title('Pooled human recovery improves the T wave',loc='left',fontsize=11,fontweight='bold')
    chosen=['baseline','source_refinement','twelve_deliveries','fifteen_deliveries','selected_complete']
    labels=['Previous model','Denser field alone','12 fitted arrivals','15 coordinated arrivals','Selected pooled-AP model']
    values=[next(q for q in methods if q['id']==key)['metrics']['fixedTargetClockRMSEMv']['qrs']for key in chosen]
    yy=np.arange(len(values));bar.barh(yy,values,color=[colors['old'],'#b9bcb4','#8eb0a4','#4f9d88',colors['new']],height=.62)
    bar.set_yticks(yy,labels);bar.invert_yaxis();bar.set_xlim(0,max(values)*1.18);bar.set_xlabel('QRS RMSE against the fixed-clock target · mV (lower is closer)')
    bar.set_title('The largest gains came from physiology assumptions and calibration',loc='left',fontsize=11,fontweight='bold')
    bar.spines[['top','right','left']].set_visible(False);bar.grid(axis='x',alpha=.15)
    for i,v in enumerate(values):bar.text(v+.004,i,f'{v:.3f} mV',va='center',fontsize=9)
    fig.suptitle(f"{model['sourceFieldNodeCount']:,} source-field sites · 15 modeled delivery sites · 2,948 optical sites across two donors",fontsize=10,color='#52615c')
    fig.savefig(OUT/'lead-ii-fit-comparison.png',dpi=180,facecolor=fig.get_facecolor())
    plt.close(fig)
    print(json.dumps({'modelSha256':report['modelSha256'],'selected':report['selected'],
                      'otherLeadsWorsened':[k for k,v in all_leads.items()if v['fixedClockWholeRmseChangeFraction']<0]},indent=2))


if __name__=='__main__':
    main()

#!/usr/bin/env python3
"""Freeze the AP-shape sensitivity comparisons without changing the default.

Selection is deliberately conservative: neither new family improves the
training whole-beat/QRS fit enough to replace the prior-informed source model.
The phase-focused alternative is retained because it exposes a different,
useful ST/T hypothesis, with its larger QRS residual plainly disclosed.
"""
from pathlib import Path
import copy, importlib.util, json
import numpy as np

ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'data-source/pathology-fitting'
spec=importlib.util.spec_from_file_location('fm',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(spec);spec.loader.exec_module(fm)


def main():
    path=BASE/'fit-acs-00004-native.json';history=json.loads(path.read_text())
    before=json.loads((BASE/'fit-acs-00004-pre-plateau.json').read_text())
    original={a['id']for a in before['approaches']};retain={'plateau-regional','early-plateau-coupled'}
    retired=[a for a in history['approaches']if a['id']not in original|retain]
    existing={a['id']:a for a in history.get('plateauRetiredComparisons',[])}
    existing.update({a['id']:a for a in retired});history['plateauRetiredComparisons']=list(existing.values())
    history['approaches']=[a for a in history['approaches']if a['id']in original|retain]
    comparison_windows=copy.deepcopy(history['windows']);comparison_windows.update(wholeBeat=[-230,520],lateRecovery=[180,480])
    history['plateauComparisonWindowsMs']=comparison_windows
    # Preserve historical original-fit windows; mark the new search windows
    # explicitly so compact native metrics are never mistaken for old ones.
    for stage in history['history'][len(before['history']):]:
        stage['trainingWindowMs']=comparison_windows[stage['trainingWindow']]
    for collection in ['approaches','plateauCandidateInitializations','earlyPlateauCandidateInitializations','plateauRetiredComparisons']:
        for candidate in history.get(collection,[]):
            if candidate['id']not in original:candidate['nativeMetricsWindowsMs']=comparison_windows
    forward=fm.Forward()
    for a in history['approaches']:
        if a['id']not in retain:continue
        p=a['parameters']
        if a['id']=='early-plateau-coupled':
            assert abs(p['injuryPlateauFraction']-1.)<1e-10
            p['injuryPlateauFraction']=1.
            a['parameterCanonicalization']='A plateau fraction within1e-10 of the exact upper bound1 was represented as1. This removes floating-point noise; the waveform is the original plateau family.'
            a['label']='ST/T-focused regional prolongation · QRS tradeoff'
            a['directVerify']=True
            a['physiologyNote']=('This alternative captures the negative terminal T through a much longer regional recovery hypothesis. '
                'The early-plateau fraction returned to 1, so early plateau suppression was not supported by this optimization. '
                'The injury-APD extension coefficient reaches its 140 ms sensitivity bound; actual local durations and clipping are reported. '
                'This large prolongation is not calibrated by human ischemia measurements and does not identify the patient’s ischemia stage. '
                'The stronger training ST/T objective lowers phase error but worsens QRS and whole-beat error. The conservative model remains the initial teaching default.')
        else:
            a['label']='Rational plateau depression · failed improvement'
            a['physiologyNote']=('The bounded rational plateau-shape search produced a small ST/T change but worsened QRS/whole-beat error. '
                'It is retained as a negative mechanistic comparison, not evidence for the patient’s ionic physiology. '
                'The local upstroke and APD90 remain intact and no secondary upstroke is introduced.')
        fields=forward.fields(p,'stemi')
        for chamber,label in [(1,'LV'),(2,'RV')]:
            values=fields[1][forward.chamber==chamber]
            a['recoveryPrior'][f'{label}ApdSummaryMs']=dict(zip(['min','p05','median','p95','max'],np.quantile(values,[0,.05,.5,.95,1]).tolist()))
        a['recoveryPrior']['injuryApdShorteningBoundsMs']=[-140,120]
        a['recoveryPrior']['injuryBoundCaveat']='Signed sensitivity range; the140ms extension bound is not calibrated patient or human ischemia physiology.'
    history['selectedApproachId']=before['selectedApproachId']
    history['teachingDefaultApproachId']=before['teachingDefaultApproachId']
    history['teachingSelectionReason']=before['teachingSelectionReason']+' Subsequent plateau-shape and phase-focused recovery searches did not improve the training QRS/whole-beat tradeoff sufficiently to replace this default. A separately labeled ST/T-focused regional-prolongation alternative is preserved with its own field, waveform and errors.'
    history['plateauSelectionPending']=False
    history['plateauSearchConclusion']={
        'retainedComparisonIds':sorted(retain),'retainedDefault':history['teachingDefaultApproachId'],
        'selectionData':'Training median only; held-out beats report within-record reproducibility.',
        'negativeResult':'Rational shape depression worsened the aggregate fit. The explicit early-plateau family converged back to plateau fraction1 after coupled fitting.',
        'usefulAlternative':'A phase-focused prolonged-injury APD basin captures the negative terminal T and improves ST/T, but worsens QRS/whole error and reaches the uncalibrated 140 ms extension bound.',
        'followup':'A final refit of the existing delivery timings modestly improved QRS but lost late-T accuracy; stored in plateauRetiredComparisons.',
        'allOutcomes':'Initializations are in plateauCandidateInitializations and earlyPlateauCandidateInitializations; additional refined comparisons are in plateauRetiredComparisons; every optimizer stage remains in history.'}
    path.write_text(json.dumps(fm.plain(history),indent=2)+'\n')
    print(json.dumps(history['plateauSearchConclusion'],indent=2))


if __name__=='__main__':main()

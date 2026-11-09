#!/usr/bin/env python3
"""Write a source-backed, quantitative report from the final exported cases."""
from pathlib import Path
import json
import platform
import re
import numpy as np
import scipy

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/data/pathology-fits'
BASE=ROOT/'data-source/pathology-fitting'


def readable_prose(text):
    """Keep URLs/code and lead identifiers intact while spacing prose units."""
    pieces=re.split(r'(```[\s\S]*?```)',text)
    for index in range(0,len(pieces),2):
        protected={}
        def protect(match):
            key=chr(0xe000+len(protected));protected[key]=match.group(0);return key
        part=re.sub(r'\[[^\]]*\]\([^)]*\)|`[^`]+`|https?://[^\s)>]+|\bV[1-6]\b|\b(?:template|local)?APD90\b',protect,pieces[index])
        part=re.sub(r'([A-Za-z])(\d)',r'\1 \2',part)
        part=re.sub(r'(\d)([A-Za-z])',r'\1 \2',part)
        part=re.sub(r'([A-Za-z])([−±])(?=\d)',r'\1 \2',part)
        part=re.sub(r'(?<=[A-Za-z%.]),(?=\S)',', ',part)
        part=re.sub(r'(?<=\d)×(?=\d)',' × ',part)
        for key,value in protected.items():part=part.replace(key,value)
        pieces[index]=part
    return ''.join(pieces)


def main():
    cases=[json.loads((OUT/'cases'/f'{i}.json').read_text()) for i in ['ptbxl-03155','acs-00004']]
    assert all(not c.get('provisional') for c in cases),'Wait for final direct verification'
    parts=['''# Anatomical forward fitting of recorded ECGs

## What was achieved, and what remains uncertain

Two real 500 Hz, twelve-lead ECG recordings were reduced to aligned median beats, then fitted with a generative electrical source model on a generic four-chamber CT heart. The selected displayed waveform is recomputed from the same local membrane-voltage fields that color the native CT model. Measured samples were never inserted into the model waveform, and its P, QRS, ST and T components were not independently warped or scaled.

The result is an exploratory, constrained explanation of the recording. It is **not a patient-specific reconstruction or a validated digital twin**. The actual subject's heart/torso geometry, electrode positions, invasive activation map, Purkinje system and membrane recordings are unavailable. Substantial morphology residuals remain, especially in the anterior STEMI QRS. The website exposes those residuals, alternative models and held-out-beat errors instead of presenting the inferred map as ground truth.

The main requested examples are complete RBBB (PTB-XL03155) and anterior STEMI (ACS00004, source label associated with a proximal LAD culprit). A third inferior STEMI ensemble (ACS18206) was prepared and quality checked, but no matching inverse source fit is claimed for it. The two requested fits received the computational effort.

## Recorded targets and validation split

The original500Hz recordings, calibration, SHA-256 checks, source labels, licenses and beat exclusions are documented in [TARGET_METHODS.md](TARGET_METHODS.md) and [targets-v1.json](targets-v1.json). Beats retain their measured voltage scale. Alignment uses one QRS anchor per complete beat; there is no separate P/QRS/T time warp. Each lead receives only a constant reference from a reviewed pre-QRS PR segment; no ST-removing high-pass filter or amplitude normalization is applied. Median and interquartile envelopes are computed after this alignment. A1ms display grid interpolates the2ms recorded samples and does not increase measured resolution.

Accepted beats are alternated into training and held-out partitions. Optimization and candidate selection use the training median only. Held-out beats are from the same short recording: this tests within-record reproducibility, not independent clinical validation. The observed training-versus-held-out difference is reported on exactly the same scoring windows as model error. Beat IQR is descriptive variability, not a confidence interval for a recovered activation map.
''']
    parts.append('| Recording | Accepted beats | Training / held out | Analysis window, ms from QRS anchor | PR reference window, ms | RR, ms |\n|---|---:|---:|---|---|---:|')
    for c in cases:
        q=c['target']['quality'];parts.append(f"| {c['recordId']} | {q['acceptedBeatCount']} | {q['trainBeatCount']} / {q['heldoutBeatCount']} | {c['target']['analysisWindowMs']} | {c['target']['baselineWindowMs']} | {c['rrMs']:.0f} |")
    parts.append('''
The same RBBB recording has external automated PTB-XL+ measurements: QRS138/142/159ms and RR1038/1039/1042ms across three systems. PR180/182/287ms and QT476/486/626ms disagree substantially. Those measurements corroborate a wide QRS and approximate rate, but do not resolve the late T/U endpoint or establish a QT diagnosis. The reviewed central fiducials and fitting windows were kept fixed; their uncertainty is explicit. Source: [PTB-XL+1.0.1](https://physionet.org/content/ptb-xl-plus/1.0.1/).

## Forward model

The immutable imported Module1 source release supplies a Rodero population-average CT heart with340,582 electrically distinct nodes and1,562,432 myocardial tetrahedra. Atrial and ventricular interface nodes are electrically separated. One left-atrial appendage portion is an explicitly reconstructed anatomical extension. The mesh is generic, not an image of either ECG subject. Geometry source: [Rodero et al., PLOS Computational Biology2021](https://doi.org/10.1371/journal.pcbi.1008851), [Zenodo anatomy release](https://zenodo.org/records/4593739).

Activation follows anisotropic shortest-path travel through myocardium with a fast endocardial layer and assumed delivery locations. This is a reduced eikonal-like graph model, not a coupled monodomain/bidomain ionic propagation simulation or an explicit recovered Purkinje tree. Related rapid anisotropic/lead-field methods are described in [Pezzuto et al.](https://pubmed.ncbi.nlm.nih.gov/28512434/). Atrial onset, travel speed and effective source gain are adjusted separately, retaining the sinus-region/left-atrial entry assumptions of the imported model.

For each source site i, the prescribed local voltage is

    Vm_i(t) = rest_i + amplitude_i × Σ q(t − activation_i − k × RR, APD_i)

where k=−1,0,+1 includes neighboring-cycle tails. Ventricular q uses the imported equal-donor pooled human optical recovery template; the rapid intrinsic upstroke and−85/+25mV scale are explicit assumptions. Optical fluorescence is not a patient membrane-voltage measurement. The atrial template is a human atrial ionic-model AP. The first4ms of cell age are unwarped; later template age is4+(age−4)×(templateAPD90−4)/(localAPD90−4). Recovery therefore follows local activation plus local AP duration, rather than a globally reversed animation. Template source: [human ventricular optical recordings](https://zenodo.org/records/3986725).

The finite homogeneous ellipsoidal torso has50,932 nodes and327,148 tetrahedra, insulating outer boundary and conductivity0.20S/m. Nine fixed virtual electrodes produce the twelve standard lead differences. Reciprocal FEM lead fields evaluate

    V_lead(t) = −∫ grad(Z_lead) · sigma_i · grad(Vm(t)) dV.

Every signed source weight is retained. A spatially uniform membrane voltage cancels. Adding all myocardial edge midpoints produces2,400,926 source-voltage sites, equivalent to12,499,456 fixed-parent source sub-tetrahedra. Activation and AP parameters are interpolated to those sites before evaluating the nonlinear AP. This refines source quadrature; it does not refine the activation graph or prove tissue-PDE/torso convergence.

The browser receives the20,957 source sites needed to interpolate20,436 native render vertices. It evaluates Vm at those source sites first, then applies the original four-source interpolation weights. It does not average activation/APD first, paste a recorded trace onto an unrelated animation or retime the model separately from its ECG.

## Pathology mechanisms

**RBBB.** All direct right-ventricular delivery sites are removed. Activation reaches the RV through the connected ventricular graph from LV delivery sites. Five right-ventricular travel-speed factors0.45,0.60,0.80,1.00,1.20 were compared. Regional LV delivery delays, a common propagation-speed factor and APD gradients were then fitted. The mechanism follows the blocked-right-branch/retrograde-activation principle demonstrated in [Gillette et al.,2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9539798/), while our graph and torso are simpler than that study's model.

**Anterior STEMI.** A smooth anterior/apical LV region changes local membrane rest, AP excursion, AP duration and activation delay before source integration. Regional AP excursion is reduced by injuryMv×regionWeight; for illustration,60% of that lost excursion is assigned to resting depolarization and40% to peak/plateau depression. After subtracting a constant PR reference, these two contributions are not independently identified by the surface ECG. This fixed60:40 split is a prior, not a fitted ion concentration or measured patient voltage. The mechanism is motivated by [ionic/bidomain investigations of ST elevation](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/), which demonstrate the importance of resting, plateau and reference-potential gradients.

The initial regional APD hypothesis allowed shortening. A separately labeled alternative permits a signed APD response: negative injuryShortening means prolongation. This broadens the hypothesis without assuming the clinical ischemia stage. Initial QT/APD prolongation followed by other recovery responses has been observed under specific experimental conditions, including [human balloon occlusion](https://pubmed.ncbi.nlm.nih.gov/17394962/) and [metabolic-inhibition experiments](https://pmc.ncbi.nlm.nih.gov/articles/PMC6095129/). These studies do not identify the APD change in this recording.

The ACS angiographic culprit is a later source association, not simultaneous validation of an electrical injury map. Fitted region size or APD changes must not be called a confirmed infarct boundary or recovered ischemia stage. The lesionDepth input is a dimensionless sigmoid boundary/extent parameter; a value above1 saturates modeled wall involvement and does not mean more than100% anatomical transmural depth.

## Search strategy and comparison families

The loss uses eight independent channels—I, II and V1–V6. The other four limb leads are algebraically derived and are not counted again. Optimization weights are1/max(training QRS RMS,0.20mV) per independent lead; this balances fitting influence but never rescales the displayed traces. Whole-wave optimization additionally weights QRS residuals1.6 and the STEMI ST window2.0. Only one common ventricular effective source gain and one common atrial gain are allowed; there are no independent lead gains or arbitrary finished-waveform corrections. Weak parameter-shift penalties and explicit bounds regularize timing/gradient choices.

The comparison families were:

1. An unblocked, target-aligned healthy source prior, with target-adjusted onset, common gains and recovery parameters. This is a comparison model, not an independent healthy recording.
2. A pathology mechanism with restricted regional support: blocked RV delivery for RBBB; fixed anterior injury for STEMI.
3. More flexible source timing/recovery or injury extent, with multiple starts and RV-speed alternatives.
4. Rigid heart-pose nuisance fitting. The complete heart and its fiber-conductivity tensors move within the unchanged finite torso and fixed electrodes. Bounds are±25° per rotation axis and±18mm per translation axis. Small-perturbation operators guide the search; the proposed pose receives a freshly assembled exact source operator and source-parameter refit. Separately median-PR-referenced derivative columns are only a search approximation, so exact rebuilding is essential.
5. Faster endocardial-layer alternatives at2.5 and3.5mm/ms before the fitted common speed/RV factors. These were retained as negative comparisons when they worsened the fit.
6. Broader LV delivery support: twelve extra assumed endocardial junction locations at six angular sectors and two apicobasal levels, with8–50ms delays. Complete RBBB still has zero direct RV delivery. Better matching does not validate those locations; it increases model flexibility.
7. One final alternating pose/source refinement using local operator derivatives around the current pose, the same bounds, an exact new source operator and a new source fit. This adds no new pose degrees of freedom.
8. A conservative recovery-prior comparison for STEMI. The numerical winner drove the RV offset to approximately−100ms, producing RV APD90 about139–190ms despite the modeled injury being in the LV. The additional prior restricts the RV offset to−35..+40ms, global APD parameter to240..380ms, transmural contrast to0..80ms, apicobasal contrast to−50..+60ms and angular contrasts to±35ms. Two injury-APD initializations (shortening and prolongation) test local-search dependence while geometry and activation topology remain fixed.

The conservative recovery prior is a modeling choice, not a universal normal range or this patient's measured APD. [Ramanathan et al.2006](https://pubmed.ncbi.nlm.nih.gov/16606830/) found a modest average LV/RV epicardial activation–recovery interval difference in seven healthy adults; [Orini et al.2013](https://pubmed.ncbi.nlm.nih.gov/23284948/) reported a modest average difference in recovery proxies during rate acceleration. ARI/proxies are not direct cellular APD measurements. A larger [2024 ECGI study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11226755/) found marked between-person activation/recovery variability and similar population-average LV/RV recovery times. Recovery time and APD are distinct quantities; these studies justify caution, not a uniquely established recovery map.

All source parameters and multistarts use training data only. The numerical ranking minimizes unweighted raw-mV error across the eight independent channels over the declared whole-beat window, stored as bestNumericalApproachId. A better aggregate QRS-dominated fit can have a worse ST/T subwindow; separate phase errors remain visible. For STEMI, selectedApproachId deliberately chooses the conservative-prior teaching default after reviewing its small training-error tradeoff. The numerical winner is preserved and clearly labeled. Held-out beats do not determine the fit or the prior. Neither selection establishes a global inverse optimum or patient physiology.

### Independent AP-shape and phase-focused recovery experiments

Two further source-level waveform families were tested because a fixed optical shape ties the early plateau too tightly to recovery duration. Neither family adds an offset or basis function to the finished ECG. The rapid upstroke through4ms and the actual local90% recovery crossing remain fixed.

The first family applies a positive rational template-age warp. With `u=(age−4)/(APD90−4)`, the normalized template age is `u/(gamma+(1−gamma)u)` until APD90 and `1+gamma×(u−1)` afterwards. Gamma1 is the original shape; smaller gamma depresses the middle plateau and makes the waveform more triangular. Two injury-duration starts, an injury-only shape refinement, and a broader reference/injury shape sensitivity were tested. Their explicit training residual weights are QRS1.2, ST3 and late recovery2. The bounded rational family produced only a small ST/T improvement while worsening aggregate/QRS error. It is retained as a negative comparison.

The second family permits stronger early plateau suppression. A smooth monotone transition from4to30ms multiplies the portion of normalized Vm above0.1, leaving the upstroke and APD90 intact. A monotone Hermite template-age tail matches the reduced slope at APD90 and ends at the original return-to-rest time. There is no artificial second upstroke, tail jump or extended rest endpoint. This family models a prescribed dome-suppression-like sensitivity; it does not reproduce a literal notch-and-dome, phase2 re-entry or ion-channel kinetics. Three initializations, a coupled onset/speed/common-gain/injury-delay refinement, a QRS-balanced comparison and one final existing-delivery-timing refit were explored.

The main new objective multiplies residuals by QRS1.2, ST4, late recovery3 and other times1, after the existing training-derived lead balancing; these multipliers are squared in least squares. The QRS-balanced comparison uses2.5,3and2. The new late-recovery report window is180–480ms and is evaluated for every retained model and target repeatability. These objectives intentionally emphasize ST/T more strongly than the original search; their raw-mV whole/QRS/ST/T tradeoffs are shown, rather than ranking unlike losses as though they were identical.

The strongest phase-focused result converged back to early-plateau fraction1. Its useful new negative terminal T therefore comes from a distinct regional recovery hypothesis, **not support for early plateau suppression**. The injury-APD extension reaches the broadened140ms sensitivity bound. This is a large, uncalibrated modeling choice; it is not a patient measurement or an established acute-ischemia response. Actual local APD distributions and clipping are reported below. The old conservative teaching default and whole-error numerical winner remain preserved.

Experimental evidence motivates testing shape and recovery separately, not fitting a unique ionic mechanism: [Di Diego and Antzelevitch2003](https://pubmed.ncbi.nlm.nih.gov/14716579/) describes ischemic ST/T mechanisms in a canine wedge, and [whole-heart ionic simulations](https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/) examine regional effects of ischemic current changes. Human data also constrain the interpretation: [Redwood et al.1996](https://pubmed.ncbi.nlm.nih.gov/8962564/) observed modest initial monophasic-AP prolongation under a specific brief-ischemia protocol; [Sutton et al.2000](https://pubmed.ncbi.nlm.nih.gov/10995401/) found that AP duration shortened while effective refractory period lengthened during global ischemia. Refractoriness and APD cannot be substituted for one another. None of these studies calibrates the fitted140ms regional extension in ACS00004.

Every initialization and optimizer stage remains in the native history. Only two representative new full-field comparisons are exported to the browser; additional outcomes retain parameters, native ECGs and metrics in the compact research package. See the REPRODUCE.md included in the [research source package](propagation-research.zip) for the exact command order and selection-freezing step.
''')
    for c in cases:
        parts.append(f"\n## Results: {c['title']}\n\nSelected: **{c['selectedApproachId']}**. All values below are raw millivolts and use the declared phase windows.")
        winner=next(a for a in c['approaches'] if a['id']==c.get('bestNumericalApproachId',c['selectedApproachId']))
        if winner['id']!=c['selectedApproachId']:
            selected_train=c['metrics']['training']['wholeBeat']['independentLeadRmseMv'];winner_train=winner['metrics']['training']['wholeBeat']['independentLeadRmseMv']
            parts.append(f"\nThis is the **prior-informed teaching default**. The best numerical match is **{winner['id']}**. On the declared analysis window, training RMSE changes from {winner_train:.6f} to {selected_train:.6f}mV ({100*(selected_train/winner_train-1):.2f}% increase). The full top-level field, waveform, parameters, metrics and source summary refer to the teaching default. The alternative numerical winner retains its own directly verified field and waveform.")
            st=c['morphology']['st']['jPlus60'];bst=winner['morphology']['st']['jPlus60']
            parts.append(f"\n**The small aggregate penalty hides a larger local ST tradeoff.** V2 at J +60ms is {st['modeledMv']['V2']:.3f}mV in the teaching default, {st['observedMedianMv']['V2']:.3f}mV recorded and {bst['modeledMv']['V2']:.3f}mV in the numerical winner. Held-out ST-window RMSE is {c['metrics']['heldOut']['ST']['independentLeadRmseMv']:.6f}mV versus {winner['metrics']['heldOut']['ST']['independentLeadRmseMv']:.6f}mV. Neither model fully reproduces this STEMI; the prior improves interpretability, not every signal feature.")
        phase=next((a for a in c['approaches']if a['id']=='early-plateau-coupled'),None)
        if phase:
            ph=phase['metrics']['heldOut'];old=c['metrics']['heldOut'];ps=phase['sourceSummary'];nv=phase['numericalVerification']
            parts.append('\n### A useful ST/T improvement with a clear QRS tradeoff\n\nThe new phase-focused regional-prolongation comparison is directly recomputed from its own source field. The early-plateau fraction returned to1; this is a different recovery hypothesis, not a successful estimate of early dome suppression. It remains an optional comparison.')
            parts.append('| Model | Training whole | Held-out whole | Held-out QRS | Held-out ST | Held-out ST/T | Held-out late recovery |\n|---|---:|---:|---:|---:|---:|---:|')
            for a in [next(a for a in c['approaches']if a['id']==c['selectedApproachId']),phase]:
                tr=a['metrics']['training'];ho=a['metrics']['heldOut']
                parts.append(f"| {a['label']} | {tr['wholeBeat']['independentLeadRmseMv']:.6f} | {ho['wholeBeat']['independentLeadRmseMv']:.6f} | {ho['QRS']['independentLeadRmseMv']:.6f} | {ho['ST']['independentLeadRmseMv']:.6f} | {ho['ST_T']['independentLeadRmseMv']:.6f} | {ho['lateRecovery']['independentLeadRmseMv']:.6f} |")
            reduction=lambda key:100*(1-ph[key]['independentLeadRmseMv']/old[key]['independentLeadRmseMv'])
            parts.append(f"\nRelative to the unchanged teaching default, held-out ST RMSE falls {reduction('ST'):.1f}% and ST/T RMSE falls {reduction('ST_T'):.1f}%. Whole-beat error rises {-reduction('wholeBeat'):.1f}% and QRS error rises {-reduction('QRS'):.1f}%. Those losses prevent an unqualified claim of a better overall reconstruction.")
            st=phase['morphology']['st']['jPlus60']
            parts.append(f"The phase-focused V2 J +60ms estimate is {st['modeledMv']['V2']:.3f}mV against {st['observedMedianMv']['V2']:.3f}mV recorded. Its terminal negative T is substantially closer in timing and polarity, while important amplitude differences remain across other leads.")
            parts.append('\n| Lead | Original default late-window minimum | New phase-focused minimum | Recorded minimum |\n|---|---:|---:|---:|')
            old_t=c['morphology']['terminalTWindow']['minimumByLead'];new_t=phase['morphology']['terminalTWindow']['minimumByLead']
            for lead in ['V1','V2','V3','V4']:
                o=old_t[lead];n=new_t[lead]
                parts.append(f"| {lead} | {o['modeledMv']:+.3f}mV at{o['modeledTimeMs']:.0f}ms | {n['modeledMv']:+.3f}mV at{n['modeledTimeMs']:.0f}ms | {n['observedMv']:+.3f}mV at{n['observedTimeMs']:.0f}ms |")
            core=ps.get('injuryCoreApd90Ms');lv=ps['chambers']['LV']['apd90RangeMs'];rv=ps['chambers']['RV']['apd90RangeMs']
            parts.append(f"\nThese are descriptive minima in250–480ms, not expert T-peak annotations or a fitting target added after seeing the held-out data. In the new hypothesis, actual native LV APD90 spans {lv[0]:.1f}–{lv[1]:.1f}ms and RV APD90 spans {rv[0]:.1f}–{rv[1]:.1f}ms; clipping fractions at120/480ms are {ps['apdClippedAt120Fraction']:.5f}/{ps['apdClippedAt480Fraction']:.5f}.")
            if core:parts.append(f"The modeled injury core (smooth lesion weight>0.5) has median APD90 {core['median']:.1f}ms, range {core['minimum']:.1f}–{core['maximum']:.1f}ms. This long regional recovery is an explicit, nonunique sensitivity hypothesis. It is not an identified infarct border or measured patient APD.")
            parts.append(f"The phase comparison's all-site search-histogram versus direct-product disagreement is {nv['histogramToDirectIndependentRmseMv']:.6f}mV RMS (maximum {nv['histogramToDirectMaxAbsoluteMv']:.6f}mV). Its source/render evaluator fixtures are checked independently in JavaScript.")
        parts.append('| Approach | Training whole RMSE | Held-out whole RMSE | Held-out QRS RMSE | Held-out ST/T RMSE |\n|---|---:|---:|---:|---:|')
        for a in c['approaches']:
            tr=a['metrics']['training'];ho=a['metrics']['heldOut']
            parts.append(f"| {a['id']} | {tr['wholeBeat']['independentLeadRmseMv']:.4f} | {ho['wholeBeat']['independentLeadRmseMv']:.4f} | {ho['QRS']['independentLeadRmseMv']:.4f} | {ho['ST_T']['independentLeadRmseMv']:.4f} |")
        r=c['targetRepeatability'];parts.append(f"\nThe observed training-versus-held-out median difference is **{r['wholeBeat']['independentLeadRmseMv']:.4f}mV** over the same whole window and **{r['QRS']['independentLeadRmseMv']:.4f}mV** in QRS. Model errors substantially above this floor remain structural model mismatch, not an explanation based only on noisy examples.")
        parts.append('\n| Lead | Held-out whole RMSE | Held-out QRS RMSE | Modeled J +60ms (mV) | Observed J +60ms (mV) |\n|---|---:|---:|---:|---:|')
        st=c['morphology']['st']['jPlus60'];ho=c['metrics']['heldOut']
        for lead in ['I','II','V1','V2','V3','V4','V5','V6']:
            parts.append(f"| {lead} | {ho['wholeBeat']['perLeadRmseMv'][lead]:.4f} | {ho['QRS']['perLeadRmseMv'][lead]:.4f} | {st['modeledMv'][lead]:+.3f} | {st['observedMedianMv'][lead]:+.3f} |")
        if 'rbbbMorphology' in c['morphology']:
            parts.append('\n### Terminal QRS features\n\n| RBBB feature | Modeled amplitude / time | Observed amplitude / time |\n|---|---|---|')
            for name,v in c['morphology']['rbbbMorphology'].items():
                label={'terminalV1Rprime':'Terminal V1 R′','earlyV1r':'Early V1 r','terminalLeadIS':'Terminal lead I S','terminalV6S':'Terminal V6 S'}[name]
                parts.append(f"| {label} | {v['modeledMv']:+.3f}mV / {v['modeledTimeMs']:.0f}ms | {v['observedMv']:+.3f}mV / {v['observedTimeMs']:.0f}ms |")
        p=c['parameters'];s=c['sourceSummary'];pose=c.get('pose')
        parts.append(f"\nFitted effective ventricular source gain: {p['gain']:.3f}; common propagation factor: {p['speed']:.3f}. Median RV activation occurs {s['rvMinusLvMedianActivationMs']:.1f}ms after median LV activation. The APD clipping fractions at120/480ms are {s['apdClippedAt120Fraction']:.5f}/{s['apdClippedAt480Fraction']:.5f}. These are model inputs/outputs, not independent patient measurements.")
        parts.append(f"The displayed RV APD90 range is {s['chambers']['RV']['apd90RangeMs'][0]:.1f}–{s['chambers']['RV']['apd90RangeMs'][1]:.1f}ms. This checks the actual field, not only the additive RV offset parameter; spatial gradients can otherwise compensate for an apparently tighter offset.")
        if c['kind']=='stemi':
            parts.append(f"The selected AP excursion-loss coefficient is {p['injuryMv']:.2f}mV, regional APD-shortening parameter {p['injuryShortening']:.2f}ms (negative would mean prolongation), and regional activation-delay coefficient {p['injuryDelay']:.2f}ms. Their inferred values changed across source/pose families; none establishes a uniquely identified cellular injury mechanism.")
        if pose:
            parts.append(f"The modeled rigid pose uses xyz Euler angles {np.round(pose['anglesDeg'],2).tolist()} degrees and translation {np.round(pose['translationMm'],2).tolist()}mm around the specified native center. Bound hits: `{json.dumps(c['uncertainty'].get('poseBoundaryFlags',[]))}`. Camera rotation is separate from this modeled pose.")
        v=c['numericalVerification']
        parts.append(f"\nThe selected published waveform uses direct all-site Vm products at1ms spacing. Its search histogram differs from that direct result by **{v['histogramToDirectIndependentRmseMv']:.6f}mV RMS** across independent leads (maximum absolute difference {v['histogramToDirectMaxAbsoluteMv']:.6f}mV). The browser field's five-decimal serialization produced at most {v['exportedSourceFieldRoundingMaxVmErrorMv']:.6f}mV Vm discrepancy on the exported verification samples. Source and render fixtures are included for the independent JavaScript evaluator check.")
        parts.append(f"\nDownload [matched case data](cases/{c['recordId']}.json). The file includes every retained approach's own source field and waveform, original/median/held-out traces, IQR, residuals, phase and per-lead errors, ST/terminal-QRS features, numerical checks, parameter bounds and finite-candidate sensitivity summaries.")
    parts.append('''
## Numerical verification and limits

The zero-pose operator independently rebuilt by the pose code agrees with the imported native operator to a maximum source-weight difference6.10×10⁻²⁰ (relative RMS9.25×10⁻¹⁶). Uniform-Vm cancellation is checked for every native/dense posed operator. All twelve predicted leads satisfy their algebraic relations by construction. The selected trace is directly recomputed from every dense source site, not merely accepted because the search approximation looked good.

The selected display fields and source ECG have one time origin and one AP evaluator. Source/render Vm test fixtures permit a cross-language check at0.0001mV tolerance, including every retained new shape family. The retained numerical winner and ST/T-focused comparison have their own direct checks where flagged; other comparisons retain the disclosed all-site AT/APD or AT/APD/shape histogram approximation. Neither dense quadrature nor floating-point agreement validates the physiology or anatomical assumptions.

Parameter-at-bound flags across the entire search history are labeled as historical; selected pose bounds are listed separately. Sensitivity summaries use explored pathology candidates within25% of the best training RMSE. Their parameter/activation/APD spread is not a confidence interval and understates uncertainty from untested anatomy, conductivities, ion-channel dynamics and electrode placement. More flexible models can fit the same recording with different local fields.

The homogeneous torso omits lung, blood and other conductivity heterogeneity. The model has no patient-specific imaging, invasive activation map, ionic excitation/conduction coupling, scar or electromechanical feedback. Regional injury activation delay is phenomenological. Vessel deformation and the separate illustrative anatomy are not part of this inverse electrical solve. A good visual resemblance cannot establish the patient’s real circuit.

## Reproduce the experiment

From the repository root, with Python, NumPy, SciPy, VTK, Matplotlib and threadpoolctl installed:

```bash
python scripts/prepare_pathology_targets.py
python scripts/fit-pathology-prepare.py --midpoint
python scripts/fit-pathology-pose.py --basis
python scripts/fit-pathology-model.py --case ptbxl-03155
python scripts/fit-pathology-pose.py --case ptbxl-03155
python scripts/fit-pathology-alternatives.py --case ptbxl-03155
python scripts/fit-pathology-distributed.py --case ptbxl-03155
python scripts/fit-pathology-pose-refine.py --case ptbxl-03155
python scripts/fit-pathology-export.py --case ptbxl-03155
```

Repeat the case-specific commands for acs-00004, then run fit-pathology-conservative.py. For the new sensitivity extension run fit-pathology-plateau.py, fit-pathology-early-plateau.py, fit-pathology-activation-pareto.py and fit-pathology-finalize-shapes.py in that order before its final export. The finalizer preserves the earlier teaching default and records the new phase tradeoff. Finish with fit-pathology-report.py and fit-pathology-verify-browser.mjs. The exact command sequence is in the research package's REPRODUCE.md; target download/preparation requirements are in TARGET_METHODS.md. The anatomy preparation script downloads the checksum-pinned public58MB archive and verifies eleven canonical arrays. The immutable Module1 source ZIP is extracted only into an isolated work directory. Rebuildable mesh/operator caches are ignored by Git; provenance, scripts, target records, parameter histories, comparison outputs and final browser artifacts are retained. No imported Module1 files were changed.

The full native search history is saved in data-source/pathology-fitting/fit-RECORD-native.json; numerical summaries are in verification-RECORD.json. The published case JSON files are the complete reviewable deliverable. This report is generated from those final files, not manually transcribed from progress logs.
''')
    text=readable_prose('\n'.join(parts)+'\n')
    (OUT/'FORWARD_FIT_METHODS.md').write_text(text)
    (BASE/'README.md').write_text(text)
    (BASE/'software-versions.json').write_text(json.dumps({'python':platform.python_version(),'numpy':np.__version__,'scipy':scipy.__version__},indent=2)+'\n')
    print(OUT/'FORWARD_FIT_METHODS.md')


if __name__=='__main__':main()

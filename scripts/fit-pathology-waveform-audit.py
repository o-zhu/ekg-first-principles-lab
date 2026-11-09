#!/usr/bin/env python3
"""Audit source AP shape invariants and export independent Python/JS fixtures."""
from pathlib import Path
import importlib.util,json
import numpy as np

ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'data-source/pathology-fitting'
spec=importlib.util.spec_from_file_location('fm',Path(__file__).with_name('fit-pathology-model.py'))
fm=importlib.util.module_from_spec(spec);spec.loader.exec_module(fm)


def main():
    forward=fm.Forward();tpl=forward.tpl['ventricular'];template_rest=579.
    results=[];fixtures=[]
    for family,shapes in [('rational',[.45,.55,.8,1.,1.25,2.2]),('early-plateau',[.15,.3,.5,.7,1.])]:
        for duration in [120.,140.,200.,300.,480.]:
            for shape in shapes:
                endpoint=duration+(template_rest-tpl['apd90Ms'])*(duration-4)/(tpl['apd90Ms']-4)/(shape if family=='rational' else 1.)
                age=np.arange(4.,endpoint+1.,.05);q=fm.q_at(age,duration,tpl,shape,family)
                q90=float(fm.q_at(duration,duration,tpl,shape,family))
                up=np.arange(-10.,4.01,.1)
                up_error=float(np.max(np.abs(fm.q_at(up,duration,tpl,shape,family)-fm.q_at(up,duration,tpl))))
                error=max(abs(q90-.1),max(0,float(q.max())-1),max(0,-float(q.min())),max(0,float(np.diff(q).max())),up_error)
                assert error<1e-10,(family,duration,shape,error)
                assert abs(float(fm.q_at(endpoint,duration,tpl,shape,family)))<1e-10
                crossings={}
                for pct,threshold in [(20,.8),(50,.5),(90,.1)]:
                    lo,hi=4.,duration
                    for unused in range(36):
                        mid=(lo+hi)/2
                        if fm.q_at(mid,duration,tpl,shape,family)>threshold:lo=mid
                        else:hi=mid
                    crossings[f'apd{pct}Ms']=(lo+hi)/2
                results.append({'family':family,'durationMs':duration,'shapeParameter':shape,
                    'invariantMaxError':error,'restEndpointMs':endpoint,'actualVoltageCrossings':crossings})
                ages=[-3.,0.,4.,15.,30.,60.,120.,duration-.1,duration,duration+.1,endpoint-.1,endpoint,endpoint+1]
                fixtures.append({'family':family,'durationMs':duration,'shapeParameter':shape,'ageMs':ages,
                    'normalizedVm':[float(fm.q_at(t,duration,tpl,shape,family))for t in ages]})
    history=json.loads((BASE/'fit-acs-00004-native.json').read_text());target=next(c for c in json.loads((ROOT/'dist/data/pathology-fits/targets-v1.json').read_text())['cases']if c['id']=='acs-00004')
    rr=target['medianRRMs'];cycle_checks=[]
    for a in history['approaches']:
        fields=forward.fields(a['parameters'],'stemi')
        if len(fields)<6:continue
        at,apd,rest,amp,lesion,shape=fields;family=a['parameters'].get('plateauShapeFamily','rational')
        tail=amp[:forward.nv]*fm.q_at(rr+4,apd[:forward.nv],tpl,shape[:forward.nv],family)
        cycle_checks.append({'approachId':a['id'],'rrMs':rr,'maximumPriorCycleVmAtNextPeakMv':float(tail.max()),
            'fractionOfNativeVentricleAbove0_1MvAtNextPeak':float(np.mean(tail>.1)),
            'meaning':'Old-cycle contribution at the next local age4ms, not the isolated-cell APD definition.'})
    out={'passed':True,'templateRestEndpointMs':template_rest,'waveformSweepCount':len(results),
        'checks':'Preserved intrinsic upstroke through4ms, exact q(APD90)=0.1, normalized bounds0..1, no post-anchor secondary upstroke, continuous return to zero at the declared endpoint.',
        'results':results,'neighboringCycleChecks':cycle_checks,'javascriptFixtures':fixtures,'tolerance':1e-10}
    (BASE/'ap-shape-waveform-audit.json').write_text(json.dumps(out,indent=2)+'\n')
    print(json.dumps({'passed':True,'waveformSweepCount':len(results),'neighboringCycleChecks':cycle_checks},indent=2))


if __name__=='__main__':main()

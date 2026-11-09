#!/usr/bin/env python3
"""CT-derived four-chamber reduced forward model; see FOUR_CHAMBER_METHODS.md.

This is a calibrated graph-activation / prescribed-AP / volume-source model.
Upstream parameters are fitted to a measured lead-II target. No finished ECG
waveform is inserted or filtered. This is not a bidomain simulation. The
electrical AV interface is split despite shared anatomical interface nodes.
"""
from pathlib import Path
import json, hashlib, shutil, itertools, time, argparse
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra, connected_components
from scipy.interpolate import PchipInterpolator
from scipy.spatial import cKDTree
from scipy.signal import find_peaks, peak_prominences
from build_torso_operator import prepare_torso, config_hash as torso_config_hash
from appendage_anatomy import load_extended_anatomy, load_extended_render
from refine_source_field import midpoint_weights
from refine_render_mapping import refine_render_mapping
from lead_ii_calibration import ventricular_durations

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT/'data-source/four-chamber'
OUT = ROOT/'dist/data'
CACHE = SRC/'operators-cache.npz'
MIDPOINT_CACHE = SRC/'midpoint-source-operator.npz'
CALIBRATION = SRC/'lead-ii-calibration.json'
OUT.mkdir(exist_ok=True, parents=True)

def emit(s): print(s, flush=True)
def array(a, digits=5): return np.round(np.asarray(a), digits).tolist()
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def descending(a, level, dt, after):
    k=np.flatnonzero((a[:-1]>=level)&(a[1:]<level)&(np.arange(len(a)-1)*dt>after))[0]
    return (k+(a[k]-level)/(a[k]-a[k+1]))*dt

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--operators-only',action='store_true',help='Prepare the physical source/travel operator, then stop before waveform generation.')
args=parser.parse_args()
calibration=json.loads(CALIBRATION.read_text()) if CALIBRATION.exists() else {}
myocardial_speed_scale=float(calibration.get('myocardialSpeedScale',1.))
endocardial_speed=float(calibration.get('endocardialSpeedMmPerMs',2.))
atrial_speed=float(calibration.get('atrialTravelSpeedMmPerMs',1.))
ventricular_sigma_scale=float(calibration.get('ventricularConductivityScale',1.))
source_conductivity={'ventricularLongitudinal':.20*ventricular_sigma_scale,
 'ventricularTransverse':.05*ventricular_sigma_scale,
 'atrialIsotropic':float(calibration.get('atrialConductivitySm',.11))}
geo,appendage_info=load_extended_anatomy(SRC)
render=load_extended_render(SRC)
original_p=geo['points'].astype(float)
original_t=geo['tetrahedra']; tag=geo['tags']; M=len(tag)
vent_ids=np.unique(original_t[tag<3]); atrial_ids=np.unique(original_t[tag>2])
vent_map=np.full(len(original_p),-1,np.int32);vent_map[vent_ids]=np.arange(len(vent_ids))
atrial_map=np.full(len(original_p),-1,np.int32);atrial_map[atrial_ids]=len(vent_ids)+np.arange(len(atrial_ids))
point_ids=np.concatenate([vent_ids,atrial_ids])
p=original_p[point_ids]; N=len(p); nvent=len(vent_ids)
tet=np.where((tag<3)[:,None],vent_map[original_t],atrial_map[original_t]).astype(np.int32)
types=np.zeros(N,np.int8);types[nvent:]=1
chamber=np.zeros(N,np.int8)
for k in range(1,5):chamber[np.unique(tet[tag==k])]=k
rho=np.clip(geo['rho'][point_ids],0,1).astype(float)
z=np.clip(geo['z'][point_ids],0,1).astype(float)
phi=geo['phi'][point_ids].astype(float)
fibers=geo['fibers'].astype(float)
fibers/=np.maximum(np.linalg.norm(fibers,axis=1)[:,None],1e-12)
emit(f'{N:,} electrically distinct nodes; {M:,} myocardial tetrahedra; {N-len(original_p):,} duplicated AV interface nodes')

# Cache provenance includes the input mesh and both implementation files. A
# geometry, conduction, conductivity, electrode or operator edit invalidates it.
cache_inputs={
 'geometry':sha(SRC/'rodero-myocardium.npz'),
 'appendageGeometry':sha(SRC/'laa-extension.npz'),
 'appendageLoader':sha(Path(__file__).with_name('appendage_anatomy.py')),
 'builder':sha(__file__),
 'torsoBuilder':sha(Path(__file__).with_name('build_torso_operator.py')),
 'torsoConfiguration':torso_config_hash(),
 'calibration':sha(CALIBRATION) if CALIBRATION.exists() else None}
cache_fingerprint=hashlib.sha256(json.dumps(cache_inputs,sort_keys=True).encode()).hexdigest()
c=np.load(CACHE) if CACHE.exists() else None
cache_valid=c is not None and 'cacheFingerprint' in c and str(c['cacheFingerprint'])==cache_fingerprint
if cache_valid:
    W=c['W'];volumes=c['volumes'];nodal_volume=c['nodalVolume'];at=c['activation'];edges=c['edges'];travel=c['travel'];seeds=json.loads(str(c['seeds']));operator_info=json.loads(str(c['operatorInfo']))
    torso_info=operator_info['torso']
    electrodes={k:np.array(v,float)for k,v in torso_info['electrodePositionsMm'].items()}
    electrode_names=torso_info['electrodeNames']
    emit('Loaded fingerprint-verified source operator and activation cache')
else:
    if c is not None:c.close()
    # Source coordinates are millimeters, unchanged from the CT-derived mean.
    # The body FEM includes its insulating boundary and source-to-electrode
    # attenuation. The common return and voltage gauge cancel in every lead.
    torso_mesh,gradient_z,torso_info=prepare_torso()
    electrodes={k:np.array(v,float)for k,v in torso_info['electrodePositionsMm'].items()}
    electrode_names=torso_info['electrodeNames']
    phi_weights=np.zeros((N,len(electrodes)),float)
    volumes=np.empty(M,float);nodal_volume=np.zeros(N,float)
    fiber_moments=np.zeros((N,6),float)
    uniform_gradient_error=0.
    for start in range(0,M,50000):
        end=min(M,start+50000);tt=tet[start:end]; pp=p[tt]
        A=pp[:,1:]-pp[:,0,None]; det=np.linalg.det(A);vol=np.abs(det)/6
        assert np.all(vol>1e-12)
        volumes[start:end]=vol
        G=np.zeros((len(tt),4,3));G[:,1:]=np.linalg.inv(A).transpose(0,2,1);G[:,0]=-G[:,1:].sum(1)
        uniform_gradient_error=max(uniform_gradient_error,float(np.abs(G.sum(1)).max()))
        f=fibers[start:end]
        fm=np.column_stack([f[:,0]**2,f[:,1]**2,f[:,2]**2,f[:,0]*f[:,1],f[:,0]*f[:,2],f[:,1]*f[:,2]])
        for k in range(4):
            np.add.at(nodal_volume,tt[:,k],vol/4)
            for j in range(6):np.add.at(fiber_moments[:,j],tt[:,k],vol*fm[:,j]/4)
        cent=pp.mean(1)
        is_atrial=tag[start:end]>2
        # Ventricular intracellular conductivity follows supplied rule-based
        # fibers. Atrial placeholder fibers are deliberately NOT interpreted as
        # measured anatomy: the atrial source and travel metrics are isotropic.
        sl=np.where(is_atrial,source_conductivity['atrialIsotropic'],source_conductivity['ventricularLongitudinal'])
        st=np.where(is_atrial,source_conductivity['atrialIsotropic'],source_conductivity['ventricularTransverse'])
        body_elements=torso_mesh.find_simplex(cent)
        assert np.all(body_elements>=0), 'Myocardial source outside finite torso'
        for e,name in enumerate(electrode_names):
            kernel=gradient_z[body_elements,e]
            sigma_kernel=st[:,None]*kernel+(sl-st)[:,None]*f*np.sum(f*kernel,axis=1)[:,None]
            # gradient_z already includes the one required S/m-to-S/mm
            # conversion. No infinite-body factor or amplitude gain is used.
            local=-vol[:,None]*np.einsum('tij,tj->ti',G,sigma_kernel)
            np.add.at(phi_weights[:,e],tt.ravel(),local.ravel())
        if start%250000==0:emit(f'Volume-source operator {end:,}/{M:,} elements')
    fiber_moments/=np.maximum(nodal_volume[:,None],1e-20)
    ww={name:phi_weights[:,i] for i,name in enumerate(electrode_names)}
    wct=(ww['RA']+ww['LA']+ww['LL'])/3
    lead_weights={'I':ww['LA']-ww['RA'],'II':ww['LL']-ww['RA'],'III':ww['LL']-ww['LA'],
     'aVR':ww['RA']-(ww['LA']+ww['LL'])/2,'aVL':ww['LA']-(ww['RA']+ww['LL'])/2,
     'aVF':ww['LL']-(ww['RA']+ww['LA'])/2,**{f'V{i}':ww[f'C{i}']-wct for i in range(1,7)}}
    W=np.column_stack(list(lead_weights.values()))
    del phi_weights,ww,lead_weights,torso_mesh,gradient_z
    emit('Building anisotropic myocardial travel graph')
    edges=np.unique(np.sort(np.concatenate([tet[:,pair] for pair in itertools.combinations(range(4),2)]),axis=1),axis=0)
    delta=p[edges[:,1]]-p[edges[:,0]];length=np.linalg.norm(delta,axis=1);direction=delta/length[:,None]
    a,b=edges.T;fm=(fiber_moments[a]+fiber_moments[b])/2;u=direction
    cos2=np.clip(fm[:,0]*u[:,0]**2+fm[:,1]*u[:,1]**2+fm[:,2]*u[:,2]**2+2*fm[:,3]*u[:,0]*u[:,1]+2*fm[:,4]*u[:,0]*u[:,2]+2*fm[:,5]*u[:,1]*u[:,2],0,1)
    travel=length*np.sqrt(cos2/(.70*myocardial_speed_scale)**2+(1-cos2)/(.30*myocardial_speed_scale)**2)
    atrial_edge=(a>=nvent)&(b>=nvent);travel[atrial_edge]=length[atrial_edge]/atrial_speed
    fast=(a<nvent)&(b<nvent)&(rho[a]<.04)&(rho[b]<.04)
    travel[fast]=np.minimum(travel[fast],length[fast]/endocardial_speed)
    both=np.concatenate([edges,edges[:,::-1]])
    graph=coo_matrix((np.tile(travel,2),(both[:,0],both[:,1])),shape=(N,N)).tocsr()
    nc,components=connected_components(graph,directed=False)
    emit(f'Graph has {nc} components; sizes '+str(sorted(np.bincount(components).tolist(),reverse=True)[:8]))
    # Literature-informed regional Purkinje delivery. Durrer 1970 describes
    # basal-anterior, mid-septal and inferior-posterior LV onset, followed by
    # the RV anterior free wall. Cranford 2018 shows why regional extent,
    # rather than simply increasing the count of myocardial points, matters.
    # These coordinates initialize the prior regional scenario. The explicit
    # calibration below replaces delivery nodes/timings when provided.
    lv=np.flatnonzero((chamber==1)&(rho<.001));rv=np.flatnonzero((chamber==2)&(rho<.001))
    lvcenter=p[lv].mean(0);rvcenter=p[rv].mean(0)
    long=np.array([-43.,50.,56.]);long/=np.linalg.norm(long)
    sep=rvcenter-lvcenter;sep-=long*np.dot(sep,long);sep/=np.linalg.norm(sep)
    transverse=np.cross(long,sep)
    def ventricular_seed(ids,z0,angle):
        pool=ids[np.abs(z[ids]-z0)<.045]
        center=p[pool].mean(0)
        target=center+14*(np.cos(angle)*sep+np.sin(angle)*transverse)
        return int(pool[np.argmin(np.linalg.norm(p[pool]-target,axis=1))])
    regions=[('LV midseptum',lv,.45,0.,200.),
             ('LV basal anterior paraseptal',lv,.85,.8,202.),
             ('LV inferior posterior paraseptal',lv,.33,-.8,204.),
             ('RV anterior free-wall delivery',rv,.40,np.pi,207.)]
    seeds=[]
    for name,ids,z0,angle,when in regions:
        central=ventricular_seed(ids,z0,angle)
        for offset,suffix in [(-.07,' · apical extent'),(0.,''),(.07,' · basal extent')]:
            node=ventricular_seed(ids,z0+offset,angle)
            seeds.append({'name':name+suffix,'region':name,'node':node,'timeMs':when,
              'regionalOffsetZ':offset,'targetApicobasalCoordinate':z0+offset,
              'actualApicobasalCoordinate':float(z[node]),
              'distanceFromRegionalCenterMm':float(np.linalg.norm(p[node]-p[central]))})
    if calibration.get('ventricularSeeds'):
        seeds=[dict(s) for s in calibration['ventricularSeeds']]
        assert all(0<=s['node']<nvent for s in seeds)
    ra=np.flatnonzero(chamber==4);la=np.flatnonzero(chamber==3)
    san_target=np.array([-43.,-1.,46.]);bb_target=np.array([-26.,16.,48.])
    sinus_onset=float(calibration.get('sinusOnsetMs',40.))
    seeds += [{'name':'Sinus-node region','node':int(ra[np.argmin(np.linalg.norm(p[ra]-san_target,axis=1))]),'timeMs':sinus_onset},
              {'name':'LA Bachmann-bundle entry','node':int(la[np.argmin(np.linalg.norm(p[la]-bb_target,axis=1))]),'timeMs':sinus_onset+float(calibration.get('laEntryDelayMs',30.))}]
    at=np.full(N,np.inf)
    for seed in seeds:
        seed['position']=array(p[seed['node']]);dist=dijkstra(graph,directed=False,indices=seed['node']);at=np.minimum(at,dist+seed['timeMs'])
    assert np.isfinite(at).all(), 'An unseeded disconnected tissue component remains'
    operator_info={'uniformBasisGradientSum':uniform_gradient_error,'sourceConductivitySm':source_conductivity,'bodyConductivitySm':.20,
       'edgeLengthMm':array(np.quantile(length,[0,.05,.5,.95,1])), 'graphComponents':nc,
       'travelSpeedMmPerMs':{'ventricularLongitudinal':.70*myocardial_speed_scale,'ventricularTransverse':.30*myocardial_speed_scale,'endocardialSurrogate':endocardial_speed,'atrialIsotropic':atrial_speed},
       'torso':torso_info,'sourceIntegral':'Vlead = −Σtet volume · grad(Vm) · sigma_i · grad(Zlead); centroid quadrature',
       'activationMethod':f'{len(seeds)-2} calibrated ventricular endocardial delivery sites, plus sinus and LA entry; anisotropic graph travel. Delivery sites/timings are model assumptions, not measured Purkinje junctions.',
       'conductivityStatus':'Effective source conductivities calibrated to the lead-II target; not measured subject-specific intracellular conductivities. Travel speeds are separate reduced-model parameters.',
       'cacheFingerprint':cache_fingerprint,'cacheFingerprintInputs':cache_inputs}
    np.savez_compressed(CACHE,W=W,volumes=volumes,nodalVolume=nodal_volume,activation=at,edges=edges,travel=travel,seeds=json.dumps(seeds),operatorInfo=json.dumps(operator_info),cacheFingerprint=cache_fingerprint)
    emit('Saved operators and activation cache')

if args.operators_only:
    emit('Physical source and activation operators prepared; waveform generation skipped.')
    raise SystemExit(0)

lead_names=['I','II','III','aVR','aVL','aVF']+[f'V{i}'for i in range(1,7)]
times=np.arange(0,1000.01,1.)
emit('Activation ranges '+str({str(k):array([at[chamber==k].min(),at[chamber==k].max()],2)for k in range(1,5)}))

# Separate AP templates. Recovery is derived locally as AT+APD, never an
# imposed globally reversed activation ordering. No ECG P/QRS/T basis is used.
optical=json.loads((ROOT/'data-source/heart-model/donor1-ap-template-1ms.json').read_text())
raw=np.array(optical['samples'],float);opt_at=optical['at_ms']
ages=np.r_[4.,np.arange(20.,481.,20.),510.,550.]
qs=[1.]
for age in ages[1:]:
    ix=int(opt_at+age); qs.append(float(np.median(raw[max(0,ix-10):min(len(raw),ix+11)])))
qs=np.minimum.accumulate(np.clip(qs,0,1));qs[-2:]=0
f=PchipInterpolator(ages,qs,extrapolate=False)
dt=.25;template_times=np.arange(0,650+dt/2,dt);template_at=10.
age=template_times-template_at
q=np.where(age<4,.5*(1+np.tanh(age/.9102392266)),f(np.clip(age,4,550)))
q[age<-5]=0;q[age>550]=0
vapd=descending(q,.1,dt,template_at+20)-template_at
atrial_raw=json.loads((SRC/'courtemanche-atrial-template.json').read_text())
aq=np.array(atrial_raw['normalized']);adt=atrial_raw['dtMs'];aat=atrial_raw['activationMs']
# Taper only the minuscule resting baseline drift; keep the original AP shape.
aa=np.arange(len(aq))*adt-aat
aq[aa<-3]=0;aq*=np.clip((900-aa)/100,0,1);aq=np.clip(aq,0,1)
aapd=descending(aq,.1,adt,aat+20)-aat
templates={'ventricular':{'normalized':array(q,7),'dtMs':dt,'activationMs':template_at,'apd90Ms':vapd,'warpAnchorMs':4.,'restMv':-85.,'peakMv':25.,
 'provenance':'Monotone PCHIP fit to median bins of the measured human ventricular recovery template; replaced broadened optical rise with an assumed 2 ms 10–90% intrinsic upstroke. Duration assigned separately.'},
 'atrial':{'normalized':array(aq,7),'dtMs':adt,'activationMs':aat,'apd90Ms':aapd,'warpAnchorMs':4.,'restMv':atrial_raw['restMv'],'peakMv':atrial_raw['peakMv'],
 'provenance':'Courtemanche–Ramirez–Nattel 1998 human-data-based ionic model, beat 40 at 1 Hz; not a measured human atrial recording.'}}
optical_templates=templates
template_file=calibration.get('ventricularTemplateFile')
if template_file:
    selected_template=json.loads((SRC/template_file).read_text())
    selected_template={k:v for k,v in selected_template.items() if k not in ['alternatives','phaseAlignedEvidence']}
    templates={'ventricular':selected_template,'atrial':optical_templates['atrial']}

def vm(time_values,ats,apds,ty,template_set=None):
    template_set=template_set or templates
    ans=np.empty((len(time_values),len(ats)),float)
    for typ,key in enumerate(['ventricular','atrial']):
        ids=np.flatnonzero(ty==typ);t=template_set[key];age=time_values[:,None]-ats[ids][None,:];anchor=t['warpAnchorMs']
        warped=np.where(age<=anchor,age,anchor+(age-anchor)*(t['apd90Ms']-anchor)/(apds[ids][None,:]-anchor))
        vals=np.interp(((warped+t['activationMs'])/t['dtMs']).ravel(),np.arange(len(t['normalized'])),t['normalized'],left=0,right=0).reshape(age.shape)
        ans[:,ids]=t['restMv']+(t['peakMv']-t['restMv'])*vals
    return ans

def ecg_for(ats,apds,ty,weights,components=False,template_set=None):
    ecg=np.empty((len(times),12)); ae=np.empty_like(ecg) if components else None
    for start in range(0,len(times),8):
        end=min(start+8,len(times));v=vm(times[start:end],ats,apds,ty,template_set);ecg[start:end]=v@weights
        if components:ae[start:end]=v[:,ty==1]@weights[ty==1]
    return ecg,ae

duration_parameters={'medianMs':305.,'transmuralContrastMs':40.,'apicobasalContrastMs':30.,'rvOffsetMs':-12.,
 'atrialLaOffsetMs':12.,'atrialRaOffsetMs':-6.,**calibration.get('durationParameters',{})}
atrial_duration=aapd+duration_parameters['atrialLaOffsetMs']*(chamber==3)+duration_parameters['atrialRaOffsetMs']*(chamber==4)
apd=np.where(types==0,ventricular_durations(rho,z,chamber,nvent,duration_parameters),atrial_duration)
equal_parameters={**duration_parameters,'transmuralContrastMs':0.,'apicobasalContrastMs':0.,'rvOffsetMs':0.}
equal=np.where(types==0,duration_parameters['medianMs'],atrial_duration)
optical_parameters={**duration_parameters,'medianMs':392.59}
optical_duration=np.where(types==0,ventricular_durations(rho,z,chamber,nvent,optical_parameters),atrial_duration)

# Sample the sharp AP front inside each original tetrahedron, retaining the
# parent conductivity/torso gradient and the same activation solution.
midpoint_inputs={'nativeSourceCacheFingerprint':cache_fingerprint,
 'refinementScript':sha(Path(__file__).with_name('refine_source_field.py')),
 'renderMappingScript':sha(Path(__file__).with_name('refine_render_mapping.py'))}
midpoint_fingerprint=hashlib.sha256(json.dumps(midpoint_inputs,sort_keys=True).encode()).hexdigest()
mc=np.load(MIDPOINT_CACHE) if MIDPOINT_CACHE.exists() else None
mcmeta=json.loads(str(mc['metadata'])) if mc is not None else {}
if mc is not None and mcmeta.get('fingerprint')==midpoint_fingerprint:
    midpoint_W=mc['W'];midpoint_checks=mcmeta['checks'];emit('Loaded verified refined source-field operator')
else:
    if mc is not None:mc.close()
    midpoint_W,midpoint_checks=midpoint_weights(p,tet,tag,fibers,edges,source_conductivity,W)
    mcmeta={'fingerprint':midpoint_fingerprint,'fingerprintInputs':midpoint_inputs,'checks':midpoint_checks,
      'sourceConductivitySm':source_conductivity,'originalWeightFactor':.25}
    np.savez_compressed(MIDPOINT_CACHE,W=midpoint_W,edges=edges,originalWeightFactor=.25,metadata=json.dumps(mcmeta))
field_at=np.r_[at,at[edges].mean(1)]
field_types=np.r_[types,types[edges[:,0]]]
field_W=np.vstack([.25*W,midpoint_W]);del midpoint_W
field_p=np.vstack([p,p[edges].mean(1)])
field_count=len(field_at)
def refined_duration(native):return np.r_[native,native[edges].mean(1)]
source_refinement={'originalWeightFactor':.25,'midpointNodeCount':len(edges),'fieldSiteCount':field_count,
 'equivalentRefinedTetrahedra':8*M,'fingerprint':midpoint_fingerprint,'fingerprintInputs':midpoint_inputs,
 'checks':midpoint_checks,
 'method':'Each myocardial tetrahedron is subdivided through its six edge midpoints. AT and APD are interpolated before evaluating the nonlinear AP, and the resulting piecewise-linear Vm source is integrated. Parent conductivity and reciprocal torso gradient are fixed.',
 'scope':'Source-field refinement only; the activation graph and torso mesh are not refined. Added samples are numerical sites, not new measured cells.'}
emit(f'Refined source field: {field_count:,} voltage samples / {8*M:,} equivalent sub-tetrahedra')

# The browser receives only the source sites needed by its decimated surface
# and true-tet section; all 1.526 million elements still enter the ECG.
raw_render_indices=render['renderSourceIds'].astype(int)
render_chamber=render['chamber'];ri=np.where((render_chamber<3)[:,None],vent_map[raw_render_indices],atrial_map[raw_render_indices])
rw=render['renderSourceWeights'].astype(float)
assert np.all(ri[rw>0]>=0)
ri,rw=refine_render_mapping(ri,rw,edges,N)
source_nodes=np.unique(ri[rw>0]);lookup=np.full(field_count,-1,int);lookup[source_nodes]=np.arange(len(source_nodes));ri=lookup[ri];ri[rw==0]=0
def display_field(a):return np.sum(a[source_nodes][ri]*rw,axis=1)
R=len(rw)
emit(f'Browser: {R:,} render vertices; {len(source_nodes):,} contributing electrical source sites')

variants={};validation={};summaries={};all_ecgs={}
amin,amax=float(at[nvent:].min()),float(at[nvent:].max());vmin,vmax=float(at[:nvent].min()),float(at[:nvent].max())
specifications=[('heterogeneous','Calibrated human AP family',apd,duration_parameters,templates,
 'Pooled human optical recovery shape and spatial AP durations calibrated to lead II; intrinsic upstroke and absolute membrane voltage scale are explicit assumptions.'),
 ('equal_apd',f"Equal ventricular APD₉₀ · {duration_parameters['medianMs']:.0f} ms",equal,equal_parameters,templates,
 'The same cellular shape and activation pattern with equal ventricular APD90. The resulting ECG is recalculated.'),
 ('optical_duration','Original optical donor · ~393 ms',optical_duration,optical_parameters,optical_templates,
 'Original donor-1 single-site recovery shape and 392.59 ms median APD90; spatial duration contrasts retained from the calibrated model. This is not rate correction or a recovered donor map.')]
for key,title,durations,parameters,template_set,description in specifications:
    emit('Computing '+key)
    field_duration=refined_duration(durations)
    ecg,ae=ecg_for(field_at,field_duration,field_types,field_W,True,template_set);ve=ecg-ae;all_ecgs[key]=ecg
    rt=at+durations
    qrs=(times>=at[:nvent].min()-10)&(times<=at[:nvent].max()+20)
    tw=(times>at[:nvent].max()+40)&(times<rt[:nvent].max()+70)
    pw=(times>=amin-5)&(times<=min(amax+5,vmin-5))
    p_idx=np.flatnonzero(pw)[np.argmax(np.abs(ae[pw,1]))]
    r_idx=np.flatnonzero(qrs)[np.argmax(ecg[qrs,1])]
    # Preserve an inverted T wave's sign; argmax alone would select its tail.
    t_idx=np.flatnonzero(tw)[np.argmax(np.abs(ecg[tw,1]))]
    vt=template_set['ventricular'];last_active_age=np.flatnonzero(np.asarray(vt['normalized'])>1e-3)[-1]*vt['dtMs']-vt['activationMs'];anchor=vt['warpAnchorMs']
    recovery_end=int(np.ceil(np.max(at[:nvent]+anchor+(last_active_age-anchor)*(durations[:nvent]-anchor)/(vt['apd90Ms']-anchor))))
    t_start=max(vmax+6,float(np.min(at[:nvent]+.55*durations[:nvent])))
    events=[{'key':'rest','startMs':0,'endMs':amin-2,'label':'Rest · polarized myocardium'},
     {'key':'p','startMs':amin-2,'endMs':amax+3,'label':'Atrial depolarization · P wave'},
     {'key':'av','startMs':amax+3,'endMs':vmin-2,'label':'AV conduction delay · PR segment'},
     {'key':'qrs','startMs':vmin-2,'endMs':vmax+4,'label':'Ventricular depolarization · QRS'},
     {'key':'st','startMs':vmax+4,'endMs':t_start,'label':'Ventricular plateau · ST segment'},
     {'key':'t','startMs':t_start,'endMs':recovery_end,'label':'Ventricular recovery · T wave'},
     {'key':'rest','startMs':recovery_end,'endMs':1000,'label':'Rest · next beat follows'}]
    summary={'ventricularApd90RangeMs':array([durations[:nvent].min(),durations[:nvent].max()],2),
      'ventricularApd90MedianMs':round(float(np.median(durations[:nvent])),2),'atrialApd90RangeMs':array([durations[nvent:].min(),durations[nvent:].max()],2),
      'recoveryRangeMs':array([rt.min(),rt.max()],2),'pPeakMs':int(times[p_idx]),'pPeakMv':float(ae[p_idx,1]),
      'rPeakMs':int(times[r_idx]),'rPeakMv':float(ecg[r_idx,1]),'tPeakMs':int(times[t_idx]),'tPeakMv':float(ecg[t_idx,1]),
      'leadIIRangeMv':array([ecg[:,1].min(),ecg[:,1].max()],6)}
    variants[key]={'label':title,'description':description,'durationParameters':parameters,
        'apd90Ms':array(display_field(field_duration),3),'recoveryMs':array(display_field(field_at+field_duration),3),'sourceApd90Ms':array(field_duration[source_nodes],5),
        'ecg':{l:array(ecg[:,i],7) for i,l in enumerate(lead_names)},'ecgAtrial':{l:array(ae[:,i],7)for i,l in enumerate(lead_names)},'ecgVentricular':{l:array(ve[:,i],7)for i,l in enumerate(lead_names)},'summary':summary,'events':events}
    if template_set is not templates:variants[key]['templates']=template_set
    validation[key]={'einthovenMaxErrorMv':float(np.abs(ecg[:,0]+ecg[:,2]-ecg[:,1]).max()),'componentSumMaxErrorMv':float(np.abs(ae+ve-ecg).max()),'baselineStartMaxMv':float(np.abs(ecg[0]).max()),'baselineEndMaxMv':float(np.abs(ecg[-1]).max())}
    summaries[key]=summary;emit(json.dumps(summary))

# Controlled source-sampling sensitivity: anatomy, source operator, AP family,
# conductivity and original graph activation are fixed. Spatial bins merge
# their source weights and use volume-weighted AT/APD. This is NOT a separate
# remeshing/eikonal-convergence experiment.
sampling={'native':{'label':'Dense field','nodeCount':field_count,'binSizeMm':0,'ecg':variants['heterogeneous']['ecg'],'relativeRmsErrorLeadII':0.,'maxErrorLeadIIMv':0.}}
original_ecg,_=ecg_for(at,apd,types,W)
original_error=original_ecg-all_ecgs['heterogeneous']
sampling['original']={'label':'Original mesh','nodeCount':N,'binSizeMm':0,
 'ecg':{l:array(original_ecg[:,i],7) for i,l in enumerate(lead_names)},
 'relativeRmsErrorLeadII':float(np.linalg.norm(original_error[:,1])/np.linalg.norm(all_ecgs['heterogeneous'][:,1])),
 'maxErrorLeadIIMv':float(np.max(np.abs(original_error[:,1])))}
for spacing in [2.,4.]:
    emit(f'Source sampling check {spacing:g} mm bins')
    keys=np.column_stack([np.floor(p/spacing).astype(int),types])
    unique,g=np.unique(keys,axis=0,return_inverse=True);ng=len(unique)
    weights=np.zeros((ng,12));vol=np.bincount(g,weights=nodal_volume,minlength=ng)
    for i in range(12):weights[:,i]=np.bincount(g,weights=W[:,i],minlength=ng)
    gat=np.bincount(g,weights=at*nodal_volume,minlength=ng)/vol
    gapd=np.bincount(g,weights=apd*nodal_volume,minlength=ng)/vol
    grouped,_=ecg_for(gat,gapd,unique[:,3],weights)
    native=all_ecgs['heterogeneous'];err=grouped-native
    sampling[f'bin{int(spacing)}']={'label':f'{spacing:g} mm source bins','nodeCount':ng,'binSizeMm':spacing,'ecg':{l:array(grouped[:,i],7)for i,l in enumerate(lead_names)},
     'relativeRmsErrorLeadII':float(np.linalg.norm(err[:,1])/np.linalg.norm(native[:,1])),
     'maxErrorLeadIIMv':float(np.max(np.abs(err[:,1]))),'rPeakMv':float(grouped[:,1].max()),'rPeakMs':int(np.argmax(grouped[:,1]))}
    emit(json.dumps({k:v for k,v in sampling[f'bin{int(spacing)}'].items()if k!='ecg'}))

geometry={k:array(render[k].ravel(),5 if k=='positions' else 6)for k in ['positions','normals']}
geometry.update({k:render[k].ravel().tolist()for k in ['triangles','cutTriangles']})
normal=render['cutNormal'];geometry.update({'cutNormal':array(normal,10),'cutOffset':float(render['cutOffset']),
 'defaultView':{'yaw':float(np.arctan2(normal[0],-normal[1])),'pitch':float(np.arcsin(normal[2])),'zoom':1.},
 'coordinateUnit':'mm','orientation':'Inferred +X patient left, +Y posterior, +Z superior; original CT-derived mean coordinates unchanged.'})
chambers=[{'id':k,'name':name,'position':array(p[chamber==k].mean(0))}for k,name in enumerate(['LV','RV','LA','RA'],1)]
rp=render['positions'];samples=[];default_sites=[]
for ch in [4,3,1,2]:
    ids=np.flatnonzero(render_chamber==ch);mean=next(c['position']for c in chambers if c['id']==ch)
    # Prefer actual cap tissue for an immediately inspectable cutaway point.
    cap=np.unique(render['cutTriangles']);choices=np.intersect1d(ids,cap)
    if not len(choices):choices=ids
    node=int(choices[np.argmin(np.linalg.norm(rp[choices]-mean,axis=1))]);default_sites.append(node)
    samples.append({'name':next(c['name']for c in chambers if c['id']==ch),'node':node,'position':array(rp[node])})
for seed in seeds:
    if seed.get('regionalOffsetZ',0)!=0:continue
    typ=types[seed['node']];ids=np.flatnonzero((render_chamber>2)==bool(typ));node=int(ids[np.argmin(np.linalg.norm(rp[ids]-seed['position'],axis=1))]);samples.append({'name':seed['name'],'node':node,'position':array(rp[node])})

events=variants['heterogeneous']['events']
validation.update({'uniformVmMaxErrorMv':float(np.abs(np.ones(N)@W).max()*110),
 'atrialConstantVmMaxErrorMv':float(np.abs(W[nvent:].sum(0)).max()*110),
 'ventricularConstantVmMaxErrorMv':float(np.abs(W[:nvent].sum(0)).max()*110),
 'allNodesReachable':bool(np.isfinite(at).all()),'minimumTetVolumeMm3':float(volumes.min()),
 'myocardialVolumeMl':float(volumes.sum()/1000),'renderInterpolationWeightError':float(np.abs(rw.sum(1)-1).max()),
 'AVInterfaceDuplicatedNodes':int(N-len(original_p)), 'baselineLeadWeightsZero':float(np.abs(W.sum(0)).max())})
validation['refinedUniformVmMaxErrorMv']=float(np.max(np.abs(field_W.sum(0)))*110)
validation['sourceRefinement']=source_refinement
assert validation['uniformVmMaxErrorMv']<1e-8
assert all(validation[k]['einthovenMaxErrorMv']<1e-9 for k in variants)

refinement={'description':'Upstream physiological parameters calibrated to the measured PTB lead-II target; not independent patient-specific validation.',
 'change':'Fifteen modeled ventricular delivery sites include basal RV coverage; calibrated regional timing, conduction speeds, effective source conductivity and cellular recovery. A connected inferred LAA is included in the atrial source.',
 'ventricularDeliverySiteCount':len(seeds)-2,
 'calibrationFile':'lead-ii-calibration.json','fitStudyFile':'lead-ii-fit-study.json',
 'sourceFieldRefinement':source_refinement,
 'references':['https://pubmed.ncbi.nlm.nih.gov/5482907/','https://pubmed.ncbi.nlm.nih.gov/29549620/','https://doi.org/10.1016/j.compbiomed.2025.111222'],
 'limitations':'The target comes from a different person than the mean anatomy and optical preparations. A one-lead fit cannot uniquely identify activation, APD, conductivity or anatomy. No measured ECG samples or post-hoc ECG filter enter the forward signal; its upstream parameters have been calibrated.'}
validation['activationRefinement']=refinement
appendage_info={**appendage_info,'representativeActivationMs':float(np.median(at[-appendage_info['newNodeCount']:])),
 'activationRangeMs':array([at[-appendage_info['newNodeCount']:].min(),at[-appendage_info['newNodeCount']:].max()],3)}

metadata={'schemaVersion':2,'title':'CT-derived four-chamber anatomy · data-informed APs · computed 12-lead ECG',
 'kind':'calibrated_data_informed_four_chamber_forward_model','nodeCount':R,'computationalNodeCount':N,'sourceFieldNodeCount':field_count,'anatomicalNodeCount':len(original_p),'elementCount':M,'sourceRefinement':source_refinement,'appendage':appendage_info,'durationParameters':duration_parameters,'calibration':calibration,
 'renderNodeCount':R,'geometry':geometry,'nodes':{'activationMs':array(display_field(field_at),3),'chamber':render_chamber.tolist(),'transmuralCoordinate':array(display_field(refined_duration(rho)),5)},
 'field':{'sourceGlobalIds':source_nodes.tolist(),'sourceActivationMs':array(field_at[source_nodes],5),'sourceType':field_types[source_nodes].tolist(),'renderIndices':ri.ravel().tolist(),'renderWeights':array(rw.ravel(),8)},
 'templates':templates,'time':{'startMs':0,'endMs':1000,'dtMs':1,'frames':len(times)},'encoding':{'minMv':-85,'maxMv':25,'unit':'modeled mV'},
 'variants':variants,'sourceSampling':sampling,'sourceSamplingMethod':'Dense midpoint Vm sampling versus original-node interpolation and coarser spatial source bins. Activation, source parameters and torso are fixed. This tests source-field sampling, not tissue-PDE, graph or torso convergence.',
 'chambers':chambers,'samples':samples,'defaultSites':default_sites,'seeds':seeds,'events':events,'virtualElectrodes':{k:array(v)for k,v in electrodes.items()},'leads':lead_names,
 'activationSummary':{'atrialRangeMs':[amin,amax],'ventricularRangeMs':[vmin,vmax],'nominalPRMs':vmin-amin,'ventricularActivationDurationMs':vmax-vmin},
 'operators':operator_info,'validation':validation,'activationRefinement':refinement,'referenceECGFile':'ptb-healthy-reference.json',
 'sources':[{'title':'Rodero et al. 2021 CT-derived population-average four-chamber anatomy','url':'https://zenodo.org/records/4593739','paper':'https://doi.org/10.1371/journal.pcbi.1008851','license':'CC BY 4.0'},
 {'title':'Smirnov et al. 2020 human ventricular optical recordings','url':'https://zenodo.org/records/3986725','license':'CC0 1.0'},
 {'title':'Courtemanche et al. 1998 human atrial ionic model','url':'https://models.cellml.org/exposure/0e03bbe01606be5811691f9d5de10b65','license':'CC BY 3.0'},
 {'title':'Franz et al. 1987 human APD90 mapping','url':'https://pubmed.ncbi.nlm.nih.gov/3802441/'},
 {'title':'Durrer et al. 1970 human activation','url':'https://pubmed.ncbi.nlm.nih.gov/5482907/'},
 {'title':'Cranford et al. 2018 regional Purkinje-delivery sensitivity','url':'https://pubmed.ncbi.nlm.nih.gov/29549620/'},
 {'title':'Cardone-Noott et al. 2016 activation-sequence and QRS variability','url':'https://doi.org/10.1093/europace/euw346'},
 {'title':'de Ponti et al. 2002 atrial mapping','url':'https://pubmed.ncbi.nlm.nih.gov/11843475/'},
 {'title':'Mapping-informed biatrial conduction model, 2012','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC3437366/'},
 {'title':'Measured ECG reference intervals','url':'https://pmc.ncbi.nlm.nih.gov/articles/PMC4832775/'}],
 'limitations':['Population-average CT-derived geometry, not the optical or ECG donor. The source directly segmented LV wall; RV and atrial wall thicknesses were prescribed by the source authors.',
 'Graph shortest-path activation, fast endocardial surrogate, and assumed AV delay; no ionic tissue PDE, explicit Purkinje tree or AV-node tissue simulation.',
 'The default ventricular recovery template pools measured human optical waveforms after alignment and duration normalization for shape estimation. Its local APD field is calibrated, its intrinsic upstroke and voltage scale assumed. Original donor shape/duration remains optional.',
 'Atrial APs are published model output, not measured atrial optical recordings. Atrial conduction and source conductivity are isotropic; source atrial fibers were placeholders.',
 'Finite homogeneous ellipsoidal torso with insulating boundary; no patient-derived torso, blood/lung conductivity compartments, measured electrodes or mechanical contraction.',
 'The measured PTB lead-II waveform is a calibration target for activation, recovery and effective source conductivities. Better fit is not independent validation and does not recover unique true physiology. Other leads are not optimized. More numerical points do not add biological measurements.',
 'The added left atrial appendage has an exact source ostium but an inferred body. It contributes to both the activation graph and ECG; its missing native shape cannot be reconstructed uniquely from this dataset.'],
 'inputSha256':{f:sha(SRC/f) for f in ['rodero-myocardium.npz','laa-extension.npz','laa-ostium-interface.npz','rodero-appendage-render.npz','courtemanche-atrial-template.json','lead-ii-calibration.json']+([template_file] if template_file else [])}}
(OUT/'heart-model.json').write_text(json.dumps(metadata,separators=(',',':')))
(SRC/'validation.json').write_text(json.dumps({'checks':validation,'summaries':summaries,'sourceSampling':{k:{n:v for n,v in q.items() if n!='ecg'}for k,q in sampling.items()}},indent=2))
shutil.copyfile(SRC/'ptb-healthy-reference.json',OUT/'ptb-healthy-reference.json')
shutil.copyfile(SRC/'RODERO_ATTRIBUTION.txt',OUT/'four-chamber-geometry-attribution.txt')
shutil.copyfile(CALIBRATION,OUT/'lead-ii-calibration.json')
if template_file:shutil.copyfile(SRC/template_file,OUT/template_file)
shutil.copyfile(SRC/'pooled-human-ventricular-template.json',OUT/'pooled-human-ventricular-template.json')
(OUT/'left-atrial-appendage.json').write_text(json.dumps(appendage_info,indent=2)+'\n')
emit('Wrote '+str(OUT/'heart-model.json')+' '+str((OUT/'heart-model.json').stat().st_size)+' bytes')

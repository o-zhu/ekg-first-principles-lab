#!/usr/bin/env python3
"""Independent numerical consistency audit for the published four-chamber model.

This script does not import the model generator or its AP evaluator. It rebuilds
electrical indexing from anatomy, evaluates the published AP definition against
the retained full source matrix, and separately reassembles a bounded subset of
that matrix from tetrahedral geometry and cached reciprocal torso potentials.
It verifies numerical consistency, not clinical accuracy or PDE convergence.
"""
from pathlib import Path
import argparse
import hashlib
import itertools
import json
import subprocess
from datetime import datetime, timezone

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import Delaunay
from threadpoolctl import threadpool_limits
from appendage_anatomy import load_extended_anatomy, load_extended_render

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-source/four-chamber'
MODEL = ROOT / 'dist/data/heart-model.json'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def magnitude(a):
    return float(np.max(np.abs(a)))


def require(condition, description):
    if not condition:
        raise AssertionError(description)


def action_potentials(clock, activation, duration, tissue_type, templates):
    """Piecewise-linear interpolation of serialized normalized AP samples.

    The post-anchor duration warp is performed in the template's time units;
    its inverse map is evaluated without the generator's np.interp routine.
    """
    result = np.empty((len(clock), len(activation)))
    for code, name in enumerate(('ventricular', 'atrial')):
        mask = np.flatnonzero(tissue_type == code)
        definition = templates[name]
        phase = np.asarray(clock)[:, None] - activation[mask]
        anchor = definition['warpAnchorMs']
        phase = np.minimum(phase, anchor) + np.maximum(phase - anchor, 0) * (
            definition['apd90Ms'] - anchor) / (duration[mask] - anchor)
        coordinate = (phase + definition['activationMs']) / definition['dtMs']
        samples = np.asarray(definition['normalized'])
        inside = (coordinate >= 0) & (coordinate <= len(samples) - 1)
        left = np.clip(np.floor(coordinate).astype(int), 0, len(samples) - 1)
        right = np.minimum(left + 1, len(samples) - 1)
        fraction = coordinate - left
        normalized = np.where(inside, samples[left] + fraction * (samples[right] - samples[left]), 0)
        result[:, mask] = definition['restMv'] + normalized * (
            definition['peakMv'] - definition['restMv'])
    return result


def crossing(samples, level, dt, start, direction):
    samples = np.asarray(samples)
    condition = ((samples[:-1] >= level) & (samples[1:] < level)) if direction == 'down' else (
        (samples[:-1] <= level) & (samples[1:] > level))
    positions = np.flatnonzero(condition & (np.arange(len(samples) - 1) * dt >= start))
    require(len(positions) > 0, 'AP threshold crossing missing')
    i = positions[0]
    return float((i + (level - samples[i]) / (samples[i + 1] - samples[i])) * dt)


def duration_field(parameters, tissue_type, chamber, rho, height, templates, equal=False):
    """Derive native APDs only from the published parameter definition."""
    ventricular = tissue_type == 0
    h = (parameters['transmuralContrastMs'] * (.5-rho) +
         parameters['apicobasalContrastMs'] * (height-.5) +
         parameters['rvOffsetMs'] * (chamber == 2))
    h -= np.median(h[ventricular])
    if equal:
        h[:] = 0
    atrial = (templates['atrial']['apd90Ms'] +
              parameters['atrialLaOffsetMs'] * (chamber == 3) +
              parameters['atrialRaOffsetMs'] * (chamber == 4))
    return np.where(ventricular, parameters['medianMs'] + h, atrial)


def twelve_leads(electrode_weights):
    ra, la, ll = [electrode_weights[..., k] for k in range(3)]
    wct = (ra+la+ll)/3
    return np.stack([la-ra,ll-ra,ll-la,ra-(la+ll)/2,la-(ra+ll)/2,ll-(ra+la)/2,
                     *[electrode_weights[..., k]-wct for k in range(3,9)]], axis=-1)


def assemble_selected(global_ids, local_weights, selected):
    """Assemble only the selected rows, without allocating a dense source matrix."""
    ids=np.asarray(global_ids).ravel()
    local=np.asarray(local_weights).reshape(-1,12)
    index=np.searchsorted(selected,ids)
    included=(index<len(selected)) & (selected[np.minimum(index,len(selected)-1)]==ids)
    result=np.zeros((len(selected),12))
    np.add.at(result,index[included],local[included])
    return result


# Independent explicit child assembly is used below instead of the midpoint
# coefficient formula implemented in refine_source_field.py.
PAIRS = np.array(list(itertools.combinations(range(4),2)),dtype=int)
CHILDREN = np.array([[0,4,5,6],[1,4,7,8],[2,5,7,9],[3,6,8,9],
                     [4,5,6,9],[4,5,7,9],[4,6,8,9],[4,7,8,9]])


def cartesian_render_reference(parent_ids,parent_weights,points,edges,n,edge_keys):
    """Choose a refined simplex independently in Cartesian coordinates."""
    combined={}
    for node,weight in zip(parent_ids,parent_weights):
        if weight>0:
            combined[int(node)]=combined.get(int(node),0)+float(weight)
    nodes=list(combined);w=np.array(list(combined.values()));w/=w.sum()
    count=len(nodes)
    if count==1:
        return np.array(nodes,dtype=int),np.ones(1)
    pairs=np.array(list(itertools.combinations(range(count),2)))
    local_positions=np.vstack([points[nodes],points[np.array(nodes)[pairs]].mean(axis=1)])
    mids=[]
    for pair in np.array(nodes)[pairs]:
        a,b=sorted(pair);key=int(a)*n+int(b);j=int(np.searchsorted(edge_keys,key))
        require(j<len(edges) and int(edge_keys[j])==key,'Reference midpoint absent')
        mids.append(n+j)
    local_ids=np.r_[nodes,mids]
    children={2:np.array([[0,2],[2,1]]),
              3:np.array([[0,3,4],[1,3,5],[2,4,5],[3,4,5]]),4:CHILDREN}[count]
    target=np.r_[1.,w@points[nodes]]
    for child in children:
        basis=np.column_stack([np.ones(count),local_positions[child]])
        weights=np.linalg.lstsq(basis.T,target,rcond=None)[0]
        if min(weights)>=-1e-9 and max(weights)<=1+1e-9 and magnitude(weights@basis-target)<1e-8:
            return local_ids[child],weights
    raise AssertionError('Cartesian reference could not locate refined rendering point')


def main(output):
    stable_paths = [MODEL, SRC / 'operators-cache.npz', SRC / 'torso-operator.npz',
                    SRC / 'midpoint-source-operator.npz', SRC / 'laa-extension.npz',
                    SRC / 'rodero-myocardium.npz', SRC / 'rodero-appendage-render.npz',
                    ROOT / 'scripts/build_four_chamber_model.py',ROOT / 'scripts/build_torso_operator.py',
                    ROOT / 'scripts/appendage_anatomy.py',ROOT / 'scripts/refine_source_field.py',
                    ROOT / 'scripts/refine_render_mapping.py',ROOT / 'dist/heart-data.js',Path(__file__)]
    initial_hashes = {str(path.relative_to(ROOT)): sha(path) for path in stable_paths}
    model = json.loads(MODEL.read_text())
    cache = np.load(SRC / 'operators-cache.npz')
    geometry, appendage = load_extended_anatomy(SRC)
    rendering = load_extended_render(SRC)
    midpoint_cache = np.load(SRC / 'midpoint-source-operator.npz')
    body = np.load(SRC / 'torso-operator.npz')
    cached_info = json.loads(str(cache['operatorInfo']))
    require(cached_info == model['operators'], 'Published operator metadata and cache differ')
    fingerprint_inputs = dict(model['operators']['cacheFingerprintInputs'])
    required_fingerprints = {
        'geometry': sha(SRC / 'rodero-myocardium.npz'),
        'appendageGeometry': sha(SRC / 'laa-extension.npz'),
        'appendageLoader': sha(ROOT / 'scripts/appendage_anatomy.py'),
        'builder': sha(ROOT / 'scripts/build_four_chamber_model.py'),
        'torsoBuilder': sha(ROOT / 'scripts/build_torso_operator.py'),
        'torsoConfiguration': str(body['configHash']),
    }
    for name,digest in required_fingerprints.items():
        require(fingerprint_inputs[name] == digest, f'Operator input changed: {name}')
    calibration_file = SRC / model.get('calibrationFile', 'lead-ii-calibration.json')
    require(fingerprint_inputs['calibration'] == sha(calibration_file), 'Calibration fingerprint differs')
    stable_paths.append(calibration_file)
    initial_hashes[str(calibration_file.relative_to(ROOT))] = sha(calibration_file)
    expected_cache = hashlib.sha256(json.dumps(fingerprint_inputs, sort_keys=True).encode()).hexdigest()
    require(expected_cache == str(cache['cacheFingerprint']) == model['operators']['cacheFingerprint'],
            'Input/implementation fingerprint does not match cached operator')
    for name, digest in model['inputSha256'].items():
        path=SRC/name
        require(sha(path)==digest,f'Input hash mismatch: {name}')
        if path not in stable_paths:
            stable_paths.append(path)
            initial_hashes[str(path.relative_to(ROOT))]=digest

    anatomical_tets, tags = geometry['tetrahedra'], geometry['tags']
    ventricular = np.unique(anatomical_tets[tags < 3])
    atrial = np.unique(anatomical_tets[tags >= 3])
    anatomical_ids = np.r_[ventricular, atrial]
    n, nv = len(anatomical_ids), len(ventricular)
    vent_map = np.full(len(geometry['points']), -1, dtype=int)
    atrial_map = vent_map.copy()
    vent_map[ventricular] = np.arange(nv)
    atrial_map[atrial] = np.arange(len(atrial)) + nv
    tets = np.where(tags[:, None] < 3, vent_map[anatomical_tets], atrial_map[anatomical_tets])
    points = geometry['points'][anatomical_ids].astype(float)
    tissue_type = (np.arange(n) >= nv).astype(int)
    chamber = np.zeros(n, dtype=int)
    for code in range(1, 5):
        chamber[np.unique(tets[tags == code])] = code
    activation, weights = cache['activation'], cache['W']
    require(np.isfinite(activation).all() and weights.shape == (n, 12), 'Invalid source arrays')
    require(n == model['computationalNodeCount'], 'Electrical node count differs')

    edges = cache['edges']
    midpoint_weights = midpoint_cache['W']
    require(np.array_equal(edges, midpoint_cache['edges']), 'Native/refined electrical edges differ')
    require(midpoint_weights.shape == (len(edges),12), 'Invalid midpoint source matrix')
    midpoint_metadata = json.loads(str(midpoint_cache['metadata']))
    midpoint_inputs={
        'nativeSourceCacheFingerprint':expected_cache,
        'refinementScript':sha(ROOT/'scripts/refine_source_field.py'),
        'renderMappingScript':sha(ROOT/'scripts/refine_render_mapping.py'),
    }
    require(midpoint_metadata['fingerprintInputs']==model['sourceRefinement']['fingerprintInputs']==midpoint_inputs,
            'Midpoint input fingerprints differ')
    midpoint_fingerprint=hashlib.sha256(json.dumps(midpoint_inputs,sort_keys=True).encode()).hexdigest()
    require(midpoint_metadata['fingerprint'] == model['sourceRefinement']['fingerprint'],
            'Midpoint operator provenance differs')
    require(midpoint_metadata['fingerprint']==midpoint_fingerprint and
            midpoint_metadata['sourceConductivitySm']==model['operators']['sourceConductivitySm'],
            'Midpoint operator hash or conductivity differs')
    factor = model['sourceRefinement']['originalWeightFactor']
    require(factor == midpoint_metadata['originalWeightFactor']==float(midpoint_cache['originalWeightFactor'])==.25,
            'Unsupported source refinement corner factor')
    require(model['sourceFieldNodeCount'] == n+len(edges) == model['sourceRefinement']['fieldSiteCount'],
            'Refined source count differs')
    require(model['sourceRefinement']['equivalentRefinedTetrahedra'] == 8*len(tags),
            'Equivalent refined element count differs')
    dense_activation = np.r_[activation, activation[edges].mean(axis=1)]
    midpoint_type = tissue_type[edges[:,0]]
    dense_type = np.r_[tissue_type, midpoint_type]
    cross_av = int(np.count_nonzero(tissue_type[edges[:, 0]] != tissue_type[edges[:, 1]]))
    graph = coo_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(n, n)).tocsr()
    component_count, labels = connected_components(graph, directed=False)
    require(cross_av == 0 and component_count == 2, 'Electrical AV insulation failed')

    # Derive the duration scenarios from their disclosed physiological inputs,
    # independently of the generator's temporary arrays.
    rho = np.clip(geometry['rho'][anatomical_ids], 0, 1).astype(float)
    height = np.clip(geometry['z'][anatomical_ids], 0, 1).astype(float)
    durations = {}
    for key,variant in model['variants'].items():
        duration = duration_field(variant['durationParameters'], tissue_type, chamber, rho, height,
                                  variant.get('templates',model['templates']), key == 'equal_apd')
        durations[key] = np.r_[duration,duration[edges].mean(axis=1)]
    clocks = sorted(set([0, 50, 75, 125, 200, 220, 236, 243, 249, 270, 380, 520, 640, 900, 1000] +
                        [int(v['summary'][key]) for v in model['variants'].values()
                         for key in ['pPeakMs', 'rPeakMs', 'tPeakMs']]))
    ecg_errors, identities, summaries = {}, {}, {}
    leads = model['leads']
    for key, duration in durations.items():
        variant = model['variants'][key]
        evaluated,atrial_ecg = [],[]
        # One instant at a time keeps the 2.4-million-site audit bounded in RAM.
        for clock in clocks:
            voltage = action_potentials([clock], dense_activation, duration, dense_type,
                                         variant.get('templates',model['templates']))
            evaluated.append((factor*voltage[:,:n]@weights + voltage[:,n:]@midpoint_weights)[0])
            atrial_ecg.append((factor*voltage[:,nv:n]@weights[nv:] +
                               (voltage[:,n:]*midpoint_type)@midpoint_weights)[0])
        evaluated,atrial_ecg=np.array(evaluated),np.array(atrial_ecg)
        ventricular_ecg=evaluated-atrial_ecg
        record = {}
        for name, values in [('ecg', evaluated), ('ecgAtrial', atrial_ecg), ('ecgVentricular', ventricular_ecg)]:
            published = np.column_stack([variant[name][lead] for lead in leads])
            error = magnitude(values - published[clocks])
            require(error < 5.1e-8, f'{key}/{name}: full-source ECG differs from published samples')
            record[name + 'MaxErrorMv'] = error
        ecg_errors[key] = record
        published = {name: np.column_stack([variant[name][lead] for lead in leads])
                     for name in ('ecg', 'ecgAtrial', 'ecgVentricular')}
        identity = {
            'einthovenMaxErrorMv': magnitude(published['ecg'][:, 0] + published['ecg'][:, 2] - published['ecg'][:, 1]),
            'componentSumMaxErrorMv': magnitude(published['ecg'] - published['ecgAtrial'] - published['ecgVentricular']),
            'startMaxMv': magnitude(published['ecg'][0]),
            'endMaxMv': magnitude(published['ecg'][-1]),
        }
        require(identity['einthovenMaxErrorMv'] < 2e-7 and identity['componentSumMaxErrorMv'] < 2e-7,
                'Serialized lead/component identities failed')
        require(identity['endMaxMv'] < .001, 'Unexpected end-of-cycle residual')
        identities[key] = identity
        for previous, next_event in zip(variant['events'][:-1], variant['events'][1:]):
            require(previous['startMs'] <= previous['endMs'] == next_event['startMs'], 'Event intervals not contiguous')
        require(variant['events'][0]['startMs'] == 0 and variant['events'][-1]['endMs'] == 1000,
                'Event intervals do not span the cycle')
        for label, source in [('p', 'ecgAtrial'), ('r', 'ecg'), ('t', 'ecg')]:
            t = variant['summary'][label + 'PeakMs']
            require(abs(variant[source]['II'][t] - variant['summary'][label + 'PeakMv']) < 5.1e-8,
                    'Peak button timing disagrees with waveform')
        summaries[key] = variant['summary']

    uniform = {
        'allSites110Mv': magnitude((factor*weights.sum(axis=0)+midpoint_weights.sum(axis=0))*110),
        'ventricular110Mv': magnitude((factor*weights[:nv].sum(axis=0)+midpoint_weights[midpoint_type==0].sum(axis=0))*110),
        'atrial110Mv': magnitude((factor*weights[nv:].sum(axis=0)+midpoint_weights[midpoint_type==1].sum(axis=0))*110),
    }
    require(max(uniform.values()) < 1e-8, 'Uniform spatial fields fail to cancel')

    original_render_sources = rendering['renderSourceIds'].astype(int)
    render_weight = rendering['renderSourceWeights'].astype(float)
    render_weight /= render_weight.sum(axis=1)[:,None]
    electrical_render_sources = np.where(rendering['chamber'][:, None] < 3,
                                         vent_map[original_render_sources], atrial_map[original_render_sources])
    electrical_render_sources[render_weight==0]=0
    require(np.all(electrical_render_sources[render_weight>0]>=0),'Invalid parent source index')
    source_union = np.asarray(model['field']['sourceGlobalIds'],dtype=int)
    require(np.all((source_union>=0)&(source_union<n+len(edges))) and
            np.array_equal(source_union,np.unique(source_union)),'Invalid global field source IDs')
    indices = np.asarray(model['field']['renderIndices']).reshape(-1, 4)
    display_weights = np.asarray(model['field']['renderWeights']).reshape(-1, 4)
    require(indices.shape==render_weight.shape and np.all((indices>=0)&(indices<len(source_union))),
            'Invalid rendering index map')
    require(np.all(display_weights>=0) and np.isfinite(display_weights).all(),'Invalid display interpolation weights')
    require(np.array_equal(np.unique(indices[display_weights>0]),np.arange(len(source_union))),
            'Browser source list contains unused/missing entries')
    require(np.array_equal(dense_type[source_union], model['field']['sourceType']), 'Rendering tissue types differ')
    dense_positions=np.vstack([points,points[edges].mean(axis=1)])
    reconstructed_position=np.sum(dense_positions[source_union][indices]*display_weights[:,:,None],axis=1)
    parent_position=np.sum(points[electrical_render_sources]*render_weight[:,:,None],axis=1)
    interpolation = {
        'globalSourceIndexCoverageExact': True,
        'sourceTypeMappingExact': True,
        'sourceCount': len(source_union),
        'maxActivationSerializationErrorMs': magnitude(dense_activation[source_union] - model['field']['sourceActivationMs']),
        'maxCartesianPositionErrorMm':magnitude(reconstructed_position-parent_position),
        'maxSerializedWeightSumError': magnitude(display_weights.sum(axis=1) - 1),
    }
    require(interpolation['maxActivationSerializationErrorMs'] <= 5.01e-6, 'Source activation rounding exceeds five decimals')
    require(interpolation['maxCartesianPositionErrorMm']<2e-5,'Refined rendering location differs from source anatomy')
    require(interpolation['maxSerializedWeightSumError']<=2.01e-8,'Render weights do not partition unity')
    timing_error = 0
    for key, duration in durations.items():
        variant = model['variants'][key]
        require(magnitude(duration[source_union] - variant['sourceApd90Ms']) <= 5.01e-6, 'Source APD differs')
        for full, displayed in [(activation, model['nodes']['activationMs']),
                                (duration[:n], variant['apd90Ms']), (activation + duration[:n], variant['recoveryMs'])]:
            exact = np.sum(full[electrical_render_sources] * render_weight, axis=1)
            timing_error = max(timing_error, magnitude(exact - displayed))
    interpolation['maxDisplayTimingSerializationErrorMs'] = timing_error
    require(timing_error <= .000501, 'Displayed timing interpolation differs')

    template_checks = {}
    for variant_name,variant in model['variants'].items():
        for name, template in variant.get('templates',model['templates']).items():
            q = template['normalized']
            measured = crossing(q, .1, template['dtMs'], template['activationMs'] + 20, 'down') - template['activationMs']
            error = abs(measured - template['apd90Ms'])
            require(error < .0001, 'Serialized APD90 marker is inconsistent')
            result={'serializedApd90Ms': measured, 'markerErrorMs': error}
            result['rise10To90Ms']=crossing(q,.9,template['dtMs'],0,'up')-crossing(q,.1,template['dtMs'],0,'up')
            template_checks[variant_name+'/'+name]=result

    # Verify the actual nonlinear-Vm basis at deterministic section and surface
    # locations. The reference chooses child simplices using physical geometry
    # and a least-squares barycentric solve, not refine_render_mapping.py.
    nontrivial=np.flatnonzero(np.count_nonzero(render_weight,axis=1)>1)
    chosen=np.unique(np.r_[model['defaultSites'],np.linspace(0,len(render_weight)-1,32,dtype=int),
                           nontrivial[np.linspace(0,len(nontrivial)-1,min(192,len(nontrivial)),dtype=int)]])
    edge_keys=edges[:,0].astype(np.int64)*n+edges[:,1]
    require(np.all(edge_keys[1:]>edge_keys[:-1]),'Source edges are not canonically ordered')
    references=[cartesian_render_reference(electrical_render_sources[row],render_weight[row],points,edges,n,edge_keys)
                for row in chosen]
    reference_times=[75.25,205.5,232.25,249.75,475.125,530.5]
    basis_error=0.
    for key,duration in durations.items():
        templates=model['variants'][key].get('templates',model['templates'])
        for row,(global_ids,local_weights) in zip(chosen,references):
            reference=action_potentials(reference_times,dense_activation[global_ids],duration[global_ids],dense_type[global_ids],templates)@local_weights
            shown=source_union[indices[row]]
            observed=action_potentials(reference_times,dense_activation[shown],duration[shown],dense_type[shown],templates)@display_weights[row]
            basis_error=max(basis_error,magnitude(reference-observed))
    require(basis_error<1e-5,'Displayed Vm does not use the refined child basis')
    interpolation['independentCartesianChildBasisChecks']={'renderSites':len(chosen),'timesMs':reference_times,
                                                           'maxVmErrorMv':basis_error,'variants':list(durations)}

    # Reassemble every incident tetrahedron for deterministic samples of both
    # original and midpoint nodes. Explicitly build all eight child tetrahedra;
    # do not use the generator's .75*(endpoint local weights) shortcut. The
    # affine basis uses Cartesian 4x4 coordinates, distinct from its 3x3 form.
    selected = np.unique(np.r_[np.linspace(0, nv - 1, 32, dtype=int),
                                np.linspace(nv, n - 1, 32, dtype=int)])
    selected_edges=np.concatenate([ids[np.linspace(0,len(ids)-1,32,dtype=int)]
                                   for ids in [np.flatnonzero(midpoint_type==0),np.flatnonzero(midpoint_type==1)]])
    selected_edges=np.unique(selected_edges)
    selected_dense=np.r_[selected,n+selected_edges]
    incident_nodes=np.unique(np.r_[selected,edges[selected_edges].ravel()])
    incident = np.flatnonzero(np.isin(tets, incident_nodes).any(axis=1))
    local_tets = tets[incident]
    local_positions = points[local_tets]
    affine = np.concatenate([np.ones((*local_positions.shape[:2], 1)), local_positions], axis=2)
    basis = np.linalg.inv(affine)[:, 1:, :].transpose(0, 2, 1)
    volumes = np.abs(np.linalg.det(affine)) / 6
    torso = Delaunay(body['points'], qhull_options=model['operators']['torso']['qhullOptions'])
    containing = torso.find_simplex(local_positions.mean(axis=1))
    require(np.all(containing >= 0), 'Audited myocardial source outside torso')
    body_tets = torso.simplices[containing]
    body_affine = np.concatenate([np.ones((len(body_tets), 4, 1)), body['points'][body_tets]], axis=2)
    body_coefficients = np.linalg.solve(body_affine, body['nodalPotentials'][body_tets])
    gradient = body_coefficients[:, 1:, :].transpose(0, 2, 1)
    shifted_coefficients = np.linalg.solve(body_affine, body['nodalPotentials'][body_tets] + 83.7)
    gauge_error = magnitude(shifted_coefficients[:, 1:, :] - body_coefficients[:, 1:, :])
    fiber = geometry['fibers'][incident].astype(float)
    fiber /= np.linalg.norm(fiber, axis=1)[:, None]
    atrial_element = tags[incident] > 2
    conductivity=model['operators']['sourceConductivitySm']
    sigma_l = np.where(atrial_element, conductivity['atrialIsotropic'],conductivity['ventricularLongitudinal'])
    sigma_t = np.where(atrial_element, conductivity['atrialIsotropic'],conductivity['ventricularTransverse'])
    # One S/m-to-S/mm factor, matching the documented millimeter geometry.
    flux = .001 * (sigma_t[:, None, None] * gradient +
                   (sigma_l - sigma_t)[:, None, None] * fiber[:, None, :] *
                   np.sum(fiber[:, None, :] * gradient, axis=2)[:, :, None])
    electrode_weights = -volumes[:, None, None] * np.einsum('tik,tek->tie', basis, flux)
    local_weights=twelve_leads(electrode_weights)
    sparse_error = magnitude(assemble_selected(local_tets,local_weights,selected)-weights[selected])
    all_positions=np.concatenate([local_positions,local_positions[:,PAIRS].mean(axis=2)],axis=1)
    local_edges=np.sort(local_tets[:,PAIRS],axis=2)
    local_edge_keys=local_edges[:,:,0].astype(np.int64)*n+local_edges[:,:,1]
    edge_rows=np.searchsorted(edge_keys,local_edge_keys)
    require(np.array_equal(edge_keys[edge_rows],local_edge_keys),'Child assembly edge lookup failed')
    child_ids=np.column_stack([local_tets,n+edge_rows])
    refined_local=np.zeros((len(incident),10,12));volume_error=0.
    for child in CHILDREN:
        position=all_positions[:,child]
        child_affine=np.concatenate([np.ones((len(incident),4,1)),position],axis=2)
        child_volume=np.abs(np.linalg.det(child_affine))/6
        child_basis=np.linalg.inv(child_affine)[:,1:,:].transpose(0,2,1)
        local_electrodes=-child_volume[:,None,None]*np.einsum('tik,tek->tie',child_basis,flux)
        refined_local[:,child,:]+=twelve_leads(local_electrodes)
        volume_error=max(volume_error,magnitude(child_volume-volumes/8))
    refined_accumulated=assemble_selected(child_ids,refined_local,selected_dense)
    refined_expected=np.vstack([factor*weights[selected],midpoint_weights[selected_edges]])
    refined_error=magnitude(refined_accumulated-refined_expected)
    require(max(sparse_error,refined_error)<1e-11 and gauge_error<1e-10 and volume_error<1e-9,
            'Independent native/child source assembly failed')
    spatial = {'selectedOriginalNodes':len(selected),'selectedMidpointNodes':len(selected_edges),
               'incidentParentTetrahedra':len(incident),'explicitChildTetrahedra':8*len(incident),
               'maximumOriginalLeadWeightError':sparse_error,'maximumRefinedLeadWeightError':refined_error,
               'maximumChildVolumeErrorMm3':volume_error,
               'reciprocalGaugeGradientErrorOhmPerMm':gauge_error,'gaugeShiftOhm':83.7,
               'scope':'All incident elements at 64 native and 64 midpoint source nodes, with explicit eight-child assembly and retained torso potentials; no new torso solve.'}

    # Execute the shipped pure JS evaluator under Node; this is a numerical
    # library check, not a browser/UI test.
    render_sites = np.unique(np.r_[model['defaultSites'], np.linspace(0, model['nodeCount'] - 1, 6, dtype=int)])
    display_times = [0, 40.5, 102.25, 201.125, 237, 249.5, 380.75, 519.25, 900, 1000]
    cases = []
    for key, variant in model['variants'].items():
        source_values = action_potentials(display_times, np.asarray(model['field']['sourceActivationMs']),
                                         np.asarray(variant['sourceApd90Ms']),
                                         np.asarray(model['field']['sourceType']),variant.get('templates',model['templates']))
        for site in render_sites:
            reference = np.sum(source_values[:, indices[site]] * display_weights[site], axis=1)
            cases += [{'node': int(site), 'variant': key, 'time': t, 'expected': float(value)}
                      for t, value in zip(display_times, reference)]
    js = """
import fs from 'node:fs';
import {modelValue,modelFrame,modelECG} from './dist/heart-data.js';
const d=JSON.parse(fs.readFileSync('./dist/data/heart-model.json','utf8'));
d.frames=d.time.frames; d.dt=d.time.dtMs; d.duration=(d.frames-1)*d.dt;
const cases=JSON.parse(fs.readFileSync(0,'utf8'));let valueError=0,frameError=0,ecgError=0;
for(const q of cases){const p=q.time/d.duration;valueError=Math.max(valueError,Math.abs(modelValue(d,q.node,p,q.variant)-q.expected));frameError=Math.max(frameError,Math.abs(modelFrame(d,p,q.variant)[q.node]-q.expected));}
let count=0;
for(const variant of Object.keys(d.variants))for(const lead of d.leads)for(const t of [0,50.125,200.75,243,499.5,900.25,1000]){const a=d.variants[variant].ecg[lead],i=Math.floor(t),f=t-i,expected=a[i]*(1-f)+a[Math.min(i+1,a.length-1)]*f;ecgError=Math.max(ecgError,Math.abs(modelECG(d,t/1000,lead,variant)-expected));count++;}
process.stdout.write(JSON.stringify({cases:cases.length,maxModelValueErrorMv:valueError,maxModelFrameFloat32ErrorMv:frameError,ecgInterpolationCases:count,maxECGInterpolationErrorMv:ecgError}));
"""
    playback = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], input=json.dumps(cases),
                                        text=True, capture_output=True, cwd=ROOT, check=True).stdout)
    require(playback['maxModelValueErrorMv'] < 1e-9 and playback['maxModelFrameFloat32ErrorMv'] < 5e-6
            and playback['maxECGInterpolationErrorMv'] < 1e-12, 'Browser evaluator numerical mismatch')

    sampling = {}
    native = np.asarray(model['variants']['heterogeneous']['ecg']['II'])
    for key, alternative in model['sourceSampling'].items():
        difference = np.asarray(alternative['ecg']['II']) - native
        rms = float(np.linalg.norm(difference) / np.linalg.norm(native))
        error = abs(rms - alternative['relativeRmsErrorLeadII'])
        require(error < 2e-7, 'Reported source-sampling metric differs from serialized waveforms')
        maximum=magnitude(difference)
        require(abs(maximum-alternative['maxErrorLeadIIMv'])<2e-7,'Reported sampling maximum differs')
        sampling[key] = {'nodeCount': alternative['nodeCount'], 'relativeRmsDifferenceLeadII': rms,
                         'maxDifferenceLeadIIMv': maximum, 'reportedRmsMetricError': error}

    for path in stable_paths:
        require(sha(path) == initial_hashes[str(path.relative_to(ROOT))], 'An audited input changed during the audit')
    report = {
        'auditVersion': 4,
        'status': 'passed numerical consistency checks; not clinical validation',
        'createdAtUtc': datetime.now(timezone.utc).isoformat(),
        'modelSha256': initial_hashes['dist/data/heart-model.json'],
        'auditScriptSha256': sha(__file__),
        'fingerprints': {**initial_hashes, 'geometrySha256': sha(SRC / 'rodero-myocardium.npz'),
                         'renderGeometrySha256':sha(SRC/'rodero-appendage-render.npz'),
                         'appendageGeometrySha256':sha(SRC/'laa-extension.npz'),
                         'operatorCacheFingerprint': expected_cache, 'torsoConfigHash': str(body['configHash']),
                         'midpointOperatorFingerprint':midpoint_fingerprint,
                         'allFingerprintMatchesPassed': True},
        'scope': {'nativeElectricalNodes':n,'numericalSourceNodes':n+len(edges),'anatomicalNodes':len(geometry['points']),
                  'midpointSourceNodes':len(edges),'myocardialTetrahedra':len(tags),
                  'equivalentRefinedTetrahedra':8*len(tags),'fullSourceEvaluationTimesMs':clocks,
                  'fullSourceEvaluationVariants': list(durations), 'leads': leads,
                  'description':'Independent AP evaluator at all native and midpoint sites; independent sparse parent and explicit child source assembly; independent Cartesian rendering basis; shipped JS playback comparison.'},
        'AVSeparation': {'duplicatedInterfaceNodes': n - len(geometry['points']), 'crossDomainEdges': cross_av,
                         'componentCount': component_count, 'componentSizes': np.bincount(labels).tolist()},
        'uniformSourceCancellation': uniform,
        'serializedECGAgainstFullSourceEvaluation': ecg_errors,
        'allFramesLeadAndComponentIdentities': identities,
        'renderInterpolation': interpolation,
        'serializedTemplateCrossings': template_checks,
        'independentSparseSourceAssembly': spatial,
        'browserPlayback': playback,
        'sourceSampling': sampling,
        'variantLeadIISummaries': summaries,
        'activationSummary': model['activationSummary'],
        'limitations': [
            'Internal numerical consistency does not establish patient accuracy, normal ECG morphology, or biological truth.',
            'The full source matrices are retained outputs; only incident elements at 64 native and 64 midpoint nodes are independently reassembled.',
            'The reciprocal torso potential solve is not rerun here; its generator checks remain in torso-validation.json.',
            'Midpoint refinement and source-bin comparisons test spatial Vm sampling at fixed activation and torso fields, not tissue-PDE, activation-graph or torso mesh convergence.',
            'Node-based JS checks validate numerical playback; interactive controls and rendering need separate UI checks.',
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + '.tmp')
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(output)
    print(json.dumps({'output': str(output), 'modelSha256': report['modelSha256'], 'times': len(clocks),
                      'fullSourceMaxErrorMv': max(v for variant in ecg_errors.values() for v in variant.values()),
                      'sparseAssemblyMaxError': sparse_error, 'browserPlayback': playback}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist/data/whole-heart-independent-audit.json')
    args = parser.parse_args()
    with threadpool_limits(limits=2):
        main(args.output)

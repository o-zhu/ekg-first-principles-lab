#!/usr/bin/env python3
"""Extend the Rodero mean mesh with an explicitly inferred, blind-ending LAA.

The source mesh deliberately crops the left atrial appendage. The retained
502-face LA/tag18 interface is measured source geometry. Everything beyond it
is an illustrative hollow, curved, tapering appendage, NOT a recovered CT shape.
The original canonical myocardial file is never changed. New nodes/tetrahedra
are appended and share the exact original interface nodes.

The main builder and independent audit can call load_extended_anatomy(SRC).
Generate/validate the extension with this script; --render also reproduces the
surface and true-tetrahedron section using the existing VTK preprocessor.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data-source/four-chamber'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def boundary_loops(faces):
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    edges, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = edges[counts == 1]
    neighbours = {}
    for a, b in boundary:
        neighbours.setdefault(int(a), []).append(int(b))
        neighbours.setdefault(int(b), []).append(int(a))
    if any(len(v) != 2 for v in neighbours.values()):
        raise ValueError('The LAA annular interface must have simple closed loops')
    loops = []
    unused = set(neighbours)
    while unused:
        start = min(unused)
        loop = [start]
        previous, current = -1, start
        while True:
            nxt = next(x for x in neighbours[current] if x != previous)
            if nxt == start:
                break
            loop.append(nxt)
            previous, current = current, nxt
        unused.difference_update(loop)
        loops.append(np.asarray(loop, dtype=np.int32))
    return loops


def prism_tets(lower, upper, faces):
    # Sort by persistent local index: every adjacent prism then chooses the
    # same diagonal on a shared quadrilateral, avoiding cracks/nonconformity.
    a, b, c = np.sort(faces, axis=1).T
    return np.concatenate([
        np.column_stack([lower[a], lower[b], lower[c], upper[c]]),
        np.column_stack([lower[a], lower[b], upper[b], upper[c]]),
        np.column_stack([lower[a], upper[a], upper[b], upper[c]])
    ])


def make_extension(src=SRC):
    src = Path(src)
    base = np.load(src / 'rodero-myocardium.npz', allow_pickle=False)
    p = base['points'].astype(float)
    source_faces = np.load(src / 'laa-ostium-interface.npz', allow_pickle=False)['faces']
    interface_ids = np.unique(source_faces)
    remap = np.full(len(p), -1, np.int32)
    remap[interface_ids] = np.arange(len(interface_ids))
    faces = remap[source_faces]
    ring = p[interface_ids]
    center = ring.mean(0)
    _, _, basis = np.linalg.svd(ring - center, full_matrices=False)
    normal = basis[-1]
    la_center = p[np.unique(base['tetrahedra'][base['tags'] == 3])].mean(0)
    if np.dot(normal, center - la_center) < 0:
        normal = -normal
    x_axis = basis[0]
    y_axis = np.cross(normal, x_axis)
    uv = np.column_stack([(ring - center) @ x_axis, (ring - center) @ y_axis])
    axial = (ring - center) @ normal
    loops = boundary_loops(faces)
    if len(loops) != 2:
        raise ValueError('Expected exactly an inner and an outer LAA rim')
    loops.sort(key=lambda ids: np.linalg.norm(uv[ids], axis=1).mean())
    inner, outer = loops
    # A center in the small terminal lumen is used for the cap fan, after the
    # native irregular ostium has smoothly become an oval cross-section.
    lumen_center = uv[inner].mean(0)
    uv = uv - lumen_center
    center = center + lumen_center[0] * x_axis + lumen_center[1] * y_axis
    # Fair only the inferred extension, never the source seam. In particular,
    # two close nodes on the native inner rim produce a small backward fold
    # in a planar projection. A smooth transition to the fair contour avoids
    # extruding this source detail into a self-intersecting tube.
    target_uv=uv.copy()
    for loop in loops:
        contour=uv[loop].copy()
        for unused in range(24):
            contour=.6*contour+.2*np.roll(contour,1,axis=0)+.2*np.roll(contour,-1,axis=0)
        target_uv[loop]=contour
    ee=np.unique(np.sort(np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]),axis=1),axis=0)
    weights=1/np.maximum(np.linalg.norm(uv[ee[:,1]]-uv[ee[:,0]],axis=1),1e-6)
    adj=coo_matrix((np.r_[weights,weights],(np.r_[ee[:,0],ee[:,1]],np.r_[ee[:,1],ee[:,0]])),shape=(len(ring),len(ring))).tocsr()
    lap=coo_matrix((np.asarray(adj.sum(1)).ravel(),(np.arange(len(ring)),np.arange(len(ring)))),shape=adj.shape).tocsr()-adj
    boundary_ids=np.r_[inner,outer]
    interior_ids=np.setdiff1d(np.arange(len(ring)),boundary_ids)
    target_uv[interior_ids]=spsolve(lap[interior_ids][:,interior_ids],-lap[interior_ids][:,boundary_ids]@target_uv[boundary_ids])
    # This smooth illustrative centerline leaves the source ostium along its
    # fitted outward normal, then bends anteriorly/leftward and slightly down.
    # Length/shape are explicit assumptions; there is no source LAA CT here.
    target_direction = np.array([.48, -.70, -.53])
    target_direction /= np.linalg.norm(target_direction)
    bend_axis = np.cross(normal, target_direction)
    bend_axis /= np.linalg.norm(bend_axis)
    bend_angle = np.arccos(np.clip(normal @ target_direction, -1, 1))
    lengths = np.linspace(0, 30., 41)
    centers = [center.copy()]
    rotations = [np.eye(3)]
    for a, b in zip(lengths[:-1], lengths[1:]):
        theta = bend_angle * (.5 - .5 * np.cos(np.pi * (a+b)/60.))
        rot_mid = Rotation.from_rotvec(bend_axis * theta).as_matrix()
        centers.append(centers[-1] + (b-a) * (rot_mid @ normal))
        theta_end = bend_angle * (.5 - .5 * np.cos(np.pi * b/30.))
        rotations.append(Rotation.from_rotvec(bend_axis * theta_end).as_matrix())
    centers = np.asarray(centers)
    # Native ring appears once; only following rings are new geometry.
    positions = []
    layer_ids = [interface_ids]
    tetrahedra = []
    local_count = 0
    native_size = len(p)
    for k, distance in enumerate(lengths[1:], 1):
        u = distance / 30.
        blend = min(1., max(0.,distance-2.)/6.)
        blend = blend*blend*(3-2*blend)
        # Homothetic taper preserves the source annular triangulation and its
        # eccentric lumen. A broad proximal expansion provides a pouch rather
        # than a constant-diameter vessel. Wall thickness tapers with the body;
        # it is an assumption, not a measured appendage wall-thickness map.
        scale = (1 - .70*u**1.65)*(1 + .12*np.sin(np.pi*u))
        # Exactly native positions at u=0 and a rapid smooth removal of the
        # submillimetric nonplanarity of the cropped ostial interface.
        mixed_uv=uv*(1-blend)+target_uv*blend
        planar = mixed_uv[:, 0, None]*x_axis + mixed_uv[:, 1, None]*y_axis
        local = planar*scale + normal*axial[:, None]*(1-blend)
        q = centers[k] + local @ rotations[k].T
        ids = native_size + local_count + np.arange(len(q), dtype=np.int32)
        local_count += len(q)
        positions.append(q)
        tetrahedra.append(prism_tets(layer_ids[-1], ids, faces))
        layer_ids.append(ids)

    # The cavity terminates here. A solid 2.4 mm distal cap closes the lumen,
    # with successively narrower full disks and one tip. The inner cap is a
    # disk, not an open tube or zero-thickness pinch of inner/outer surfaces.
    tip_normal = rotations[-1] @ normal
    end_center = centers[-1]
    center_id = native_size + local_count
    positions.append(end_center[None, :])
    local_count += 1
    end_ids = np.r_[layer_ids[-1], center_id]
    n = len(ring)
    cap_faces = np.vstack([faces, np.column_stack([inner, np.roll(inner, -1), np.full(len(inner), n)])])
    end_ring = positions[-2] - end_center
    end_disk = np.vstack([end_ring, np.zeros(3)])
    previous = end_ids
    for distance, scale in [(1.0, .92), (1.8, .62)]:
        q = end_center + tip_normal*distance + end_disk*scale
        ids = native_size + local_count + np.arange(len(q), dtype=np.int32)
        local_count += len(q)
        positions.append(q)
        tetrahedra.append(prism_tets(previous, ids, cap_faces))
        previous = ids
    tip_id = native_size + local_count
    tip = end_center + tip_normal*2.4
    positions.append(tip[None, :])
    tetrahedra.append(np.column_stack([previous[cap_faces], np.full(len(cap_faces), tip_id)]))
    new_p = np.concatenate(positions)
    # A tiny native inner-rim overhang cannot be swept along one normal.
    # Fair its two distal counterparts into the lumen over the first 4 mm;
    # the actual source nodes and all 502 joining faces remain untouched.
    corrected_source_nodes=[261118,275931]
    for source_node in corrected_source_nodes:
        local=int(np.flatnonzero(interface_ids==source_node)[0])
        inward=center-p[source_node]
        inward-=normal*(inward@normal)
        inward/=np.linalg.norm(inward)
        for layer in range(40):
            new_p[layer*len(ring)+local]+=.6*np.exp(-layer*.75/4.)*inward
    new_p=new_p.astype(np.float32).astype(float)
    all_p = np.vstack([p, new_p])
    new_t = np.concatenate(tetrahedra).astype(np.int32)
    # Use the swept topology only to define a closed surface. A constrained
    # tetrahedralization, rather than direct prism subdivisions, accommodates
    # the native nonplanar ostium without overlapping source elements.
    swept_faces=np.sort(np.concatenate([new_t[:,[1,2,3]],new_t[:,[0,3,2]],new_t[:,[0,1,3]],new_t[:,[0,2,1]]]),axis=1)
    unique_faces,face_counts=np.unique(swept_faces,axis=0,return_counts=True)
    boundary_faces=unique_faces[face_counts==1]
    boundary_ids=np.unique(boundary_faces)
    boundary_map=np.full(len(all_p),-1,np.int32)
    boundary_map[boundary_ids]=np.arange(len(boundary_ids))
    try:
        import tetgen
    except ImportError as error:
        raise RuntimeError('Rebuilding the extension requires tetgen==0.8.4; loading the retained extension does not.') from error
    generator=tetgen.TetGen(all_p[boundary_ids],boundary_map[boundary_faces])
    nodes,elements,unused_attributes,unused_markers=generator.tetrahedralize(
        nobisect=True,nomergefacet=True,nomergevertex=True,nojettison=True,
        minratio=2.,maxvolume=.25,fixedvolume=True,docheck=True)
    if not np.array_equal(nodes[:len(boundary_ids)],all_p[boundary_ids]):
        raise ValueError('Mesher moved an original boundary point')
    original_boundary=boundary_ids[boundary_ids<native_size]
    assert np.array_equal(original_boundary,interface_ids)
    node_map=np.r_[original_boundary,native_size+np.arange(len(nodes)-len(interface_ids),dtype=np.int32)]
    new_p=nodes[len(interface_ids):].astype(np.float32)
    new_t=node_map[elements].astype(np.int32)
    all_p=np.vstack([p,new_p]).astype(float)
    det = np.linalg.det(all_p[new_t[:, 1:]] - all_p[new_t[:, 0, None]])
    negative = det < 0
    new_t[negative, 0], new_t[negative, 1] = new_t[negative, 1].copy(), new_t[negative, 0].copy()
    volume = np.abs(det) / 6
    if volume.min() < 1e-8:
        raise ValueError('Degenerate appendage tetrahedron')
    # Confirm the seam is interior to the combined volume. The interface
    # triangles each occur once in the base and once in the appended material.
    def tet_faces(t):
        return np.sort(np.concatenate([t[:, [1,2,3]], t[:, [0,3,2]], t[:, [0,1,3]], t[:, [0,2,1]]]), axis=1)
    sf, counts = np.unique(tet_faces(new_t), axis=0, return_counts=True)
    if counts.max() != 2:
        raise ValueError('Nonmanifold tetrahedral interface')
    boundary = sf[counts == 1]
    # Source + extension meet on exactly these 502 faces and share no other
    # original nodes. Each native interface triangle remains byte-identical.
    native_boundary = boundary[np.all(boundary < native_size, axis=1)]
    if not np.array_equal(np.sort(native_boundary, axis=0), np.sort(source_faces, axis=0)):
        raise ValueError('Appendage attachment differs from the source interface')
    outer_faces = boundary[~np.all(boundary < native_size, axis=1)]
    boundary_edges = np.sort(np.concatenate([outer_faces[:, [0,1]], outer_faces[:, [1,2]], outer_faces[:, [2,0]]]), axis=1)
    edge_unique, edge_count = np.unique(boundary_edges, axis=0, return_counts=True)
    if edge_count.max() != 2:
        raise ValueError('Appendage surface is not manifold')
    edge_open = edge_unique[edge_count == 1]
    if not np.all(edge_open < native_size):
        raise ValueError('A distal appendage surface hole remains')
    np.savez_compressed(src/'laa-extension.npz', points=new_p.astype(np.float32),
                        tetrahedra=new_t, interfaceNodes=interface_ids,
                        centerline=centers.astype(np.float32))
    metadata = {
        'kind': 'inferred_physical_appendage_extension',
        'label': 'LAA · reconstructed',
        'anatomicalStatus': 'Exact source ostium; inferred blind-ending appendage body. Not patient-derived LAA anatomy.',
        'whySourceHadFifthOpening': 'The source authors deliberately cropped the LAA. Source tag11 is the LAA ostium; tags12–15 are the four pulmonary-vein openings. The mitral opening is separate.',
        'source': 'https://zenodo.org/records/4593739',
        'pipelinePaper': 'https://doi.org/10.1371/journal.pone.0235145',
        'morphologyReference': 'https://pubmed.ncbi.nlm.nih.gov/33582020/',
        'construction': 'Constrained TetGen tetrahedralization of a curved tapering hollow wall and solid distal dome, attached to the exact 502-face LA/tag18 annulus. Native joining nodes/faces are preserved. No pulmonary-vein or mitral opening is altered.',
        'assumedDimensions': {'centerlineToLumenEndMm':30., 'distalCapMm':2.4, 'distalToOstialRadialScale':.30, 'wallThickness':'Inherited source ostial annulus, scaled with the taper; not an independently measured LAA wall.', 'bendAngleDegrees':float(np.degrees(bend_angle))},
        'interface': {'faces':len(source_faces), 'nodes':len(interface_ids), 'outerLoopNodes':len(outer), 'innerLoopNodes':len(inner), 'centerMm':center.tolist(), 'normal':normal.tolist()},
        'newNodeCount':len(new_p), 'newTetrahedronCount':len(new_t),
        'volumeMl':float(volume.sum()/1000),
        'minimumTetVolumeMm3':float(volume.min()),
        'mesher': {'name':'TetGen','pythonPackageVersion':tetgen.__version__,'preserveBoundaryFacets':True,'nativeSeamPositionErrorMm':0.0,'surfaceSelfIntersections':0,'transitionFairing':'Native seam untouched; inferred cross-sections fair over 2–8 mm. Two distal inner-rim counterparts receive a 0.6 mm decaying inward offset to clear a native overhang.'},
        'tipMm':tip.tolist(), 'labelPositionMm':centers[23].tolist(),
        'baseNodeCount':native_size, 'baseElementCount':len(base['tags']),
        'checks': {'conformingInterfaceFaces':len(native_boundary), 'nonmanifoldFaces':int(np.sum(counts>2)), 'distalOpenEdges':int(np.sum(np.any(edge_open>=native_size,axis=1))), 'pulmonaryVeinInterfacesUnmodified':True, 'mitralInterfaceUnmodified':True},
        'electrophysiology': 'The appended volume is atrial tissue in the same activation graph and reciprocal ECG integral, using the same atrial AP/source assumptions. Its geometry and fiber details are inferred, not measured.',
        'limitations': 'Smooth illustrative dominant lobe, without resolved pectinate muscles, patient-specific lobes, contraction, or blood flow. The original CT cohort cannot identify the missing appendage shape.',
        'inputSha256': {'baseMyocardium':sha(src/'rodero-myocardium.npz'), 'ostialInterface':sha(src/'laa-ostium-interface.npz')},
        'extensionSha256':sha(src/'laa-extension.npz'),
    }
    (src/'laa-extension.json').write_text(json.dumps(metadata, indent=2)+'\n')
    return metadata


def load_extended_anatomy(src=SRC):
    """Return (combined source-format arrays, explicit appendage metadata)."""
    src=Path(src)
    with np.load(src/'rodero-myocardium.npz', allow_pickle=False) as original:
        geo={k:original[k] for k in original.files}
    with np.load(src/'laa-extension.npz', allow_pickle=False) as extension:
        ext={k:extension[k] for k in extension.files}
    metadata=json.loads((src/'laa-extension.json').read_text())
    if sha(src/'laa-extension.npz') != metadata['extensionSha256']:
        raise ValueError('Appendage extension checksum mismatch')
    if len(geo['points']) != metadata['baseNodeCount'] or len(geo['tags']) != metadata['baseElementCount']:
        raise ValueError('Appendage extension is for a different source geometry')
    nn,nt=len(ext['points']),len(ext['tetrahedra'])
    geo['points']=np.concatenate([geo['points'],ext['points']])
    geo['tetrahedra']=np.concatenate([geo['tetrahedra'],ext['tetrahedra']])
    geo['tags']=np.r_[geo['tags'],np.full(nt,3,np.uint8)]
    for k in ['rho','phi','z','v']:
        geo[k]=np.r_[geo[k],np.full(nn,-10,np.float32)]
    # Atrial fiber vectors are placeholders. The model explicitly uses
    # isotropic atrial conduction/source conductivity, as in its parent LA.
    geo['fibers']=np.vstack([geo['fibers'],np.tile(np.array([1,0,0],np.float32),(nt,1))])
    geo['sheets']=np.vstack([geo['sheets'],np.tile(np.array([0,1,0],np.float32),(nt,1))])
    geo['sourcePointIds']=np.r_[geo['sourcePointIds'],np.full(nn,-1,np.int32)]
    geo['sourceTetIds']=np.r_[geo['sourceTetIds'],np.full(nt,-1,np.int32)]
    return geo,metadata


def load_extended_render(src=SRC):
    with np.load(Path(src)/'rodero-appendage-render.npz',allow_pickle=False) as data:
        return {k:data[k] for k in data.files}


def generate_render(src=SRC):
    src=Path(src)
    geo, metadata=load_extended_anatomy(src)
    with tempfile.TemporaryDirectory(prefix='cardiac-laa-render-') as folder:
        folder=Path(folder)
        np.savez_compressed(folder/'combined.npz',**geo)
        subprocess.run([sys.executable,str(src/'preprocess_rodero.py'),'--input',str(folder/'combined.npz'),'--output-dir',str(folder),'--metadata-extension',str(src/'laa-extension.json')],check=True)
        shutil.copyfile(folder/'rodero-render.npz',src/'rodero-appendage-render.npz')
        shutil.copyfile(folder/'rodero-preprocessing.json',src/'rodero-appendage-preprocessing.json')
    return json.loads((src/'rodero-appendage-preprocessing.json').read_text())


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--src',type=Path,default=SRC)
    parser.add_argument('--render',action='store_true')
    args=parser.parse_args()
    print(json.dumps(make_extension(args.src),indent=2),flush=True)
    if args.render:
        print(json.dumps(generate_render(args.src),indent=2),flush=True)

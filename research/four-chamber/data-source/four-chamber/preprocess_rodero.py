#!/usr/bin/env python3
"""Prepare exact-node surface and actual-tetrahedron section of Rodero mean heart.

The raw anatomical axes are preserved. Decimation removes vertices but does not
relocate retained vertices, so every rendered voltage has explicit interpolation
weights into the full myocardial mesh. Outputs default to this source directory.
Use --input and --output-dir to reproduce the rendering in a separate folder.
"""
from pathlib import Path
import argparse, json, hashlib, itertools
import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy, numpy_to_vtk, numpy_to_vtkIdTypeArray
from scipy.spatial import cKDTree

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, default=ROOT/'rodero-myocardium.npz')
parser.add_argument('--output-dir', type=Path, default=ROOT)
parser.add_argument('--metadata-extension', type=Path, help='Explicit provenance for an inferred anatomical extension')
args=parser.parse_args()
OUTPUT=args.output_dir.resolve(); OUTPUT.mkdir(parents=True,exist_ok=True)
data=np.load(args.input,allow_pickle=False)
p=data['points'].astype(np.float64); tet=data['tetrahedra']; tags=data['tags']
N=len(p)
chamber_centers=np.array([p[np.unique(tet[tags==tag])].mean(0) for tag in range(1,5)])
apex=p[(data['z']>=0)&(data['z']<.03)&(data['v']<0)].mean(0)
plane_landmarks=np.vstack([chamber_centers,apex])
plane_center=plane_landmarks.mean(0)
_,_,vh=np.linalg.svd(plane_landmarks-plane_center)
cutNormal=vh[-1]
if cutNormal[1]>0:cutNormal=-cutNormal
cutOffset=float(plane_center@cutNormal)
plane_distance=p@cutNormal-cutOffset
basis1=chamber_centers[0]-chamber_centers[1];basis1-=cutNormal*(basis1@cutNormal);basis1/=np.linalg.norm(basis1)
basis2=np.cross(cutNormal,basis1)
print('Oblique cut plane',cutNormal,cutOffset,'landmark residuals',plane_landmarks@cutNormal-cutOffset,flush=True)

pts=vtk.vtkPoints();pts.SetData(numpy_to_vtk(p,deep=True))
cells=vtk.vtkCellArray();cells.SetData(numpy_to_vtkIdTypeArray(np.arange(0,4*len(tet)+1,4,dtype=np.int64),deep=True),numpy_to_vtkIdTypeArray(tet.astype(np.int64).ravel(),deep=True))
grid=vtk.vtkUnstructuredGrid();grid.SetPoints(pts);grid.SetCells(vtk.VTK_TETRA,cells)
arr=numpy_to_vtk(tags,deep=True);arr.SetName('chamber');grid.GetCellData().AddArray(arr)
arr=numpy_to_vtk(np.arange(N,dtype=np.int32),deep=True);arr.SetName('sourceNode');grid.GetPointData().AddArray(arr)
surf=vtk.vtkDataSetSurfaceFilter();surf.SetInputData(grid);surf.Update()
rawsurf=surf.GetOutput()
print('Raw myocardial surface',rawsurf.GetNumberOfPoints(),rawsurf.GetNumberOfCells(),flush=True)

def reduce_poly(poly,reduction=.88):
    dec=vtk.vtkDecimatePro();dec.SetInputData(poly);dec.SetTargetReduction(reduction);dec.PreserveTopologyOn();dec.SplittingOff();dec.BoundaryVertexDeletionOff();dec.SetFeatureAngle(60);dec.Update()
    normal=vtk.vtkPolyDataNormals();normal.SetInputData(dec.GetOutput());normal.SplittingOff();normal.ConsistencyOn();normal.AutoOrientNormalsOn();normal.ComputePointNormalsOn();normal.Update()
    return normal.GetOutput()

def array_poly(q,faces,point_index,point_name):
    obj=vtk.vtkPolyData();pp=vtk.vtkPoints();pp.SetData(numpy_to_vtk(q,deep=True));obj.SetPoints(pp)
    cc=vtk.vtkCellArray();cc.SetData(numpy_to_vtkIdTypeArray(np.arange(0,len(faces)*3+1,3,dtype=np.int64),deep=True),numpy_to_vtkIdTypeArray(faces.astype(np.int64).ravel(),deep=True));obj.SetPolys(cc)
    aa=numpy_to_vtk(point_index.astype(np.int32),deep=True);aa.SetName(point_name);obj.GetPointData().AddArray(aa)
    return obj

surface_p=vtk_to_numpy(rawsurf.GetPoints().GetData());surface_id=vtk_to_numpy(rawsurf.GetPointData().GetArray('sourceNode'));surface_tri=vtk_to_numpy(rawsurf.GetPolys().GetConnectivityArray()).reshape(-1,3);surface_tag=vtk_to_numpy(rawsurf.GetCellData().GetArray('chamber'))
vertices=[];normals=[];srcids=[];srcw=[];chambers=[];surface_tris=[];offset=0
for tag in range(1,5):
    ff=surface_tri[surface_tag==tag];ii=np.unique(ff);mp=np.full(len(surface_p),-1,np.int32);mp[ii]=np.arange(len(ii));poly=array_poly(surface_p[ii],mp[ff],surface_id[ii],'sourceNode');obj=reduce_poly(poly,.90)
    q=vtk_to_numpy(obj.GetPoints().GetData());f=vtk_to_numpy(obj.GetPolys().GetConnectivityArray()).reshape(-1,3);ids=vtk_to_numpy(obj.GetPointData().GetArray('sourceNode')).astype(np.int32)
    assert np.max(np.linalg.norm(q-p[ids],axis=1))<1e-5
    nn=vtk_to_numpy(obj.GetPointData().GetNormals());isrc=np.zeros((len(q),4),np.int32);isrc[:,0]=ids;w=np.zeros((len(q),4));w[:,0]=1
    vertices.append(q);normals.append(nn);srcids.append(isrc);srcw.append(w);chambers.append(np.full(len(q),tag,np.uint8));surface_tris.append(f+offset);offset+=len(q)
    print('Surface chamber',tag,len(q),len(f),flush=True)

# March the plane through the original tetrahedral myocardial volumes. Every
# cap point is an interpolation between its exact source edge endpoints.
above=plane_distance[tet]>=0;cross=(above.sum(1)>0)&(above.sum(1)<4);ct=tet[cross];ctag=tags[cross]
edge_pairs=list(itertools.combinations(range(4),2));edge_rows=[];edge_owner=[]
for k,(a,b) in enumerate(edge_pairs):
    mask=(plane_distance[ct[:,a]]>=0)!=(plane_distance[ct[:,b]]>=0)
    edge_rows.append(np.sort(ct[mask][:,[a,b]],axis=1));edge_owner.append(np.flatnonzero(mask))
all_edges=np.concatenate(edge_rows);all_owner=np.concatenate(edge_owner);uniq,inv=np.unique(all_edges,axis=0,return_inverse=True)
alpha=-plane_distance[uniq[:,0]]/(plane_distance[uniq[:,1]]-plane_distance[uniq[:,0]]);cap_p=p[uniq[:,0]]*(1-alpha[:,None])+p[uniq[:,1]]*alpha[:,None]
cap_src=np.zeros((len(uniq),4),np.int32);cap_src[:,:2]=uniq;cap_w=np.zeros((len(uniq),4));cap_w[:,0]=1-alpha;cap_w[:,1]=alpha
owner_order=np.argsort(all_owner,kind='stable');owner_sorted=all_owner[owner_order];inv_sorted=inv[owner_order];starts=np.r_[0,np.flatnonzero(np.diff(owner_sorted))+1];ends=np.r_[starts[1:],len(owner_sorted)]
cap_faces=[];cap_tags=[]
for start,end in zip(starts,ends):
    ids=inv_sorted[start:end];q=cap_p[ids];center=q.mean(0);angles=np.arctan2((q-center)@basis2,(q-center)@basis1);ids=ids[np.argsort(angles)]
    cap_faces.append([ids[0],ids[1],ids[2]]);cap_tags.append(int(ctag[owner_sorted[start]]))
    if len(ids)==4:cap_faces.append([ids[0],ids[2],ids[3]]);cap_tags.append(int(ctag[owner_sorted[start]]))
cap_faces=np.asarray(cap_faces,np.int32);cap_tags=np.asarray(cap_tags,np.uint8);cut_tris=[]
for tag in range(1,5):
    ff=cap_faces[cap_tags==tag]
    if not len(ff):continue
    ii=np.unique(ff);mp=np.full(len(cap_p),-1,np.int32);mp[ii]=np.arange(len(ii));obj=reduce_poly(array_poly(cap_p[ii],mp[ff],ii,'capIndex'),.92)
    q=vtk_to_numpy(obj.GetPoints().GetData());f=vtk_to_numpy(obj.GetPolys().GetConnectivityArray()).reshape(-1,3);ids=vtk_to_numpy(obj.GetPointData().GetArray('capIndex')).astype(np.int32)
    assert np.max(np.linalg.norm(q-cap_p[ids],axis=1))<1e-5
    # Orient the new exposed face toward the removed half (+cutNormal).
    fn=np.cross(q[f[:,1]]-q[f[:,0]],q[f[:,2]]-q[f[:,0]]);flip=fn@cutNormal<0;f[flip]=f[flip][:,[0,2,1]]
    vertices.append(q);normals.append(np.tile(cutNormal,(len(q),1)));srcids.append(cap_src[ids]);srcw.append(cap_w[ids]);chambers.append(np.full(len(q),tag,np.uint8));cut_tris.append(f+offset);offset+=len(q)
    print('Cap chamber',tag,len(q),len(f),flush=True)
result={'positions':np.concatenate(vertices).astype(np.float32),'normals':np.concatenate(normals).astype(np.float32),'triangles':np.concatenate(surface_tris).astype(np.int32),'cutTriangles':np.concatenate(cut_tris).astype(np.int32),'renderSourceIds':np.concatenate(srcids),'renderSourceWeights':np.concatenate(srcw).astype(np.float32),'chamber':np.concatenate(chambers),'cutNormal':cutNormal,'cutOffset':np.array(cutOffset)}
assert np.max(np.abs(result['renderSourceWeights'].sum(1)-1))<1e-6
assert np.max(np.linalg.norm((p[result['renderSourceIds']]*result['renderSourceWeights'][:,:,None]).sum(1)-result['positions'],axis=1))<1e-4
np.savez_compressed(OUTPUT/'rodero-render.npz',**result)

rho=data['rho'];z=data['z'];v=data['v'];phi=data['phi'];epiid=np.flatnonzero((rho>.99999)&(v>-2));endoid=np.flatnonzero((rho<.00001)&(rho>=0)&(v<0)&(z>.15)&(z<.8)&(np.abs(phi)>1.5))
d=cKDTree(p[epiid]).query(p[endoid])[0]
metadata={'source':'https://zenodo.org/records/4593739','paper':'https://doi.org/10.1371/journal.pcbi.1008851','license':'CC-BY-4.0','geometryDescription':'Statistical mean of 19 asymptomatic adult CT-derived meshes; LV wall segmented, source RV and atrial thicknesses prescribed. No LAA or fine trabeculae.','coordinateUnit':'mm','orientation':'Inferred +X patient left, +Y posterior, +Z superior from chamber centers and SVC/IVC; original source coordinates retained without transform.','nodeCount':N,'tetCount':len(tet),'renderNodeCount':len(result['positions']),'renderTriangleCount':len(result['triangles']),'cutTriangleCount':len(result['cutTriangles']),'cutNormal':cutNormal.tolist(),'cutOffset':cutOffset,'cutLandmarks':plane_landmarks.tolist(),'cutDiscard':'dot(cutNormal,position) > cutOffset','chamberLabels':{'1':'LV myocardium','2':'RV myocardium','3':'LA myocardium','4':'RA myocardium'},'lvLateralNearestEndoEpiDistanceMm':{'definition':'Nearest Euclidean distance from mid-LV lateral endocardial nodes to epicardial nodes; a geometric distance check, not a formal normal-wall thickness measurement.','n':len(d),'p10medianp90':np.quantile(d,[.1,.5,.9]).tolist()},'surfaceMethod':'vtkDataSetSurfaceFilter on myocardial tets only; per-chamber topology-preserving DecimatePro retains original source-node positions.','cutMethod':'Intersections of original myocardial tetrahedra with an oblique four-chamber plane fitted through chamber means and LV apex; exact edge interpolation; topology-preserving cap decimation retains original edge intersections. Cap holes are actual ventricular/atrial lumens.'}
if args.metadata_extension:
    extension=json.loads(args.metadata_extension.read_text())
    metadata['geometryDescription']='Statistical mean of 19 asymptomatic adult CT-derived meshes, with explicitly inferred blind-ending left atrial appendage attached to the exact source ostium. LV wall segmented; source RV/atrial thicknesses prescribed. No fine trabeculae.'
    metadata['appendage']=extension
(OUTPUT/'rodero-preprocessing.json').write_text(json.dumps(metadata,indent=2))
print(json.dumps(metadata,indent=2),flush=True)

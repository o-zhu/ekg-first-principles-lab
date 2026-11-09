"""Registered source IVC segment and explicit modeled collars for source cut seams.

Original heart.glb / heart-medium.glb are never modified. The IVC is BodyParts3D
FJ3441 in the exact existing coordinate frame. Collars loft between sections of
the existing anatomy (not guessed vessel paths); they close the cut seams at the
aorta and caval entries. All runtime surfaces use one continuous motion field.
"""
import json,struct,hashlib,zipfile
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
MODELS=ROOT/'dist/models'
CENTER=np.array([21.5438,-113.22495,1245.64])

def read(file):
 raw=file.read_bytes();l=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+l]);off=28+l
 def arr(i):
  a=g['accessors'][i];b=g['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC3':3}[a['type']];dt={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];n=np.dtype(dt).itemsize
  return np.ndarray((a['count'],dim),dtype=dt,buffer=raw,offset=off+b.get('byteOffset',0)+a.get('byteOffset',0),strides=(b.get('byteStride',dim*n),n)).copy().astype(np.float64 if dim==3 else np.int64)
 out={}
 for m in g['meshes']:
  p=m['primitives'][0];out[m['name']]=(arr(p['attributes']['POSITION']),arr(p['indices']).reshape(-1,3))
 return out

def ivc():
 archive=ROOT/'research-anatomy/isa_BP3D_4.0_obj_99.zip'
 with zipfile.ZipFile(archive) as z:
  filename=next(n for n in z.namelist() if Path(n).stem=='FJ3441' and n.endswith('.obj'))
  raw=z.read(filename);text=raw.decode()
 vertices=[];faces=[]
 for line in text.splitlines():
  if line.startswith('v '):vertices.append([float(x) for x in line.split()[1:4]])
  elif line.startswith('f '):
   ids=[int(x.split('/')[0])-1 for x in line.split()[1:]]
   faces.extend([[ids[0],ids[i],ids[i+1]] for i in range(1,len(ids)-1)])
 v=np.asarray(vertices);v-=CENTER;v=v[:,[0,2,1]];v[:,2]*=-1;v*=.02
 f=np.asarray(faces);f=f[(v[f,1]>=-1.90).all(axis=1)]
 used=np.unique(f);remap=np.zeros(len(v),dtype=int);remap[used]=np.arange(len(used));v=v[used];f=remap[f]
 return (v,f),hashlib.sha256(raw).hexdigest()

def sections(mesh,y):
 v,f=mesh;segments=[]
 for faceId,ids in enumerate(f):
  tri=v[ids];points=[]
  for k in range(3):
   a,b=tri[k],tri[(k+1)%3]
   if (a[1]-y)*(b[1]-y)<0:points.append(a+(b-a)*((y-a[1])/(b[1]-a[1])))
  if len(points)==2:segments.append((points[0],points[1],faceId))
 return segments

def ring(mesh,y,center,n=64,max_radius=.42):
 segs=sections(mesh,y);points=[];anchors=[];c=np.asarray(center)
 for angle in np.arange(n)/n*2*np.pi:
  ray=np.array([np.cos(angle),np.sin(angle)]);hits=[]
  for p,q,fi in segs:
   a=p[[0,2]]-c;d=(q-p)[[0,2]];det=ray[0]*d[1]-ray[1]*d[0]
   if abs(det)<1e-10:continue
   t=(a[0]*d[1]-a[1]*d[0])/det;u=(a[0]*ray[1]-a[1]*ray[0])/det
   if 0<t<max_radius and -.00001<=u<=1.00001:hits.append((t,p+u*(q-p),fi))
  if not hits:
   points.append(None);anchors.append(None);continue
  _,pt,fi=max(hits,key=lambda h:h[0]);points.append(pt)
  verts=mesh[0][mesh[1][fi]];bary=np.linalg.lstsq(np.vstack([verts.T,np.ones(3)]),np.r_[pt,1],rcond=None)[0]
  assert np.linalg.norm(bary@verts-pt)<1e-7
  anchors.append({'triangle':int(fi),'vertices':mesh[1][fi].astype(int).tolist(),'weights':bary.tolist()})
 missing=[i for i,p in enumerate(points) if p is None]
 if len(missing)>8:raise RuntimeError(f'Too many open source-section sectors at y={y}: {len(missing)}')
 valid=[i for i,p in enumerate(points) if p is not None]
 for i in missing:
  prev=min(valid,key=lambda k:(i-k)%n);nxt=min(valid,key=lambda k:(k-i)%n);span=(nxt-prev)%n;fraction=((i-prev)%n)/span
  points[i]=(1-fraction)*points[prev]+fraction*points[nxt]
  anchors[i]={'interpolatedAcrossSourceOpening':True,'neighbors':[prev,nxt],'fraction':fraction}
 return np.asarray(points),anchors

def collar(meshes,a,ya,b,yb,center):
 ra,aa=ring(meshes[a],ya,center);rb,ab=ring(meshes[b],yb,center);n=len(ra);rows=6
 v=[]
 for q in np.linspace(0,1,rows):
  for pa,pb in zip(ra,rb):
   point=(1-q)*pa+q*pb;radial=point-np.array([center[0],point[1],center[1]]);radial/=max(np.linalg.norm(radial),1e-12)
   # Tiny overlap at the mid-seam covers mismatched source cut caps; the
   # exact source-attached end rings are unchanged.
   v.append(point+radial*(.006*np.sin(np.pi*q)))
 v=np.asarray(v)
 f=[]
 for j in range(rows-1):
  for k in range(n):
   x=j*n+k;nx=j*n+(k+1)%n
   f.extend([[x,nx,x+n],[nx,nx+n,x+n]])
 f=np.asarray(f)
 # Choose outward orientation with respect to each source-section center.
 normal=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
 centroid=v[f].mean(axis=1);radial=centroid-np.array([center[0],0,center[1]]);radial[:,1]=0
 if np.median(np.sum(normal*radial,axis=1))<0:f=f[:,[0,2,1]]
 return (v,f),{'from':a,'to':b,'planesY':[ya,yb],'radialCenterXZ':center,'anchorsA':aa,'anchorsB':ab,'rows':rows,'radialSamples':n}

def save(entries,path):
 doc={'asset':{'version':'2.0','generator':'Cardio registered junction preparation','copyright':'BodyParts3D, © The Database Center for Life Science, CC BY 4.0; modeled seam collars by Cardio'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[],'materials':[{'name':'vessel-junction','pbrMetallicRoughness':{'baseColorFactor':[.5,.6,.65,1],'metallicFactor':0,'roughnessFactor':.45},'doubleSided':True}]}
 data=bytearray()
 def ac(a,ctype,typ,target):
  while len(data)%4:data.append(0)
  bv=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':a.nbytes,'target':target});data.extend(a.tobytes())
  entry={'bufferView':bv,'componentType':ctype,'count':len(a),'type':typ}
  if typ=='VEC3':entry.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
  i=len(doc['accessors']);doc['accessors'].append(entry);return i
 for name,(v,f) in entries.items():
  normals=np.zeros_like(v);fn=np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]])
  for k in range(3):np.add.at(normals,f[:,k],fn)
  normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
  p=ac(v.astype('<f4'),5126,'VEC3',34962);n=ac(normals.astype('<f4'),5126,'VEC3',34962);ix=ac(f.flatten().astype('<u4'),5125,'SCALAR',34963)
  i=len(doc['meshes']);doc['scenes'][0]['nodes'].append(i);doc['nodes'].append({'name':name,'mesh':i});doc['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':p,'NORMAL':n},'indices':ix,'material':0}]})
 doc['buffers'][0]['byteLength']=len(data);js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data+=b'\0'*((-len(data))%4)
 raw=struct.pack('<III',0x46546c67,2,28+len(js)+len(data))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
 path.write_bytes(raw);return hashlib.sha256(raw).hexdigest()

iv,sha=ivc();manifest={'license':'CC BY 4.0','credit':'BodyParts3D, © The Database Center for Life Science','sourceUrl':'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html','ivc':{'sourceId':'FJ3441','sourceName':'inferior vena cava, cranial segment','sourceSha256':sha,'crop':'Original source triangles above model y = -1.90; lower end remains open.','transform':{'centerMm':CENTER.tolist(),'scale':.02,'axes':'[x,z,-y]'}},'collars':'Explicit modeled seam bridges lofted between intersecting cross sections of the original registered surfaces. They cover source cut seams; they are not separately segmented patient anatomy.','variants':{}}
for variant in ['', '-medium']:
 source='heart'+variant+'.glb';meshes=read(MODELS/source);meshes['inferior-vena-cava']=iv;entries={'inferior-vena-cava':iv};attachments={}
 specs=[('aortic-junction-collar','ascending-aorta',.69,'aortic-arch',.765,[-.325,.24]),('caval-superior-collar','right-atrium',.59,'superior-vena-cava',.66,[-.735,.04]),('caval-inferior-collar','inferior-vena-cava',-1.22,'right-atrium',-1.14,[-.735,.04])]
 for name,a,ya,b,yb,c in specs:
  geom,info=collar(meshes,a,ya,b,yb,c);entries[name]=geom;attachments[name]=info
 file='heart-junctions'+variant+'.glb';digest=save(entries,MODELS/file)
 manifest['variants'][variant or 'full']={'file':file,'sha256':digest,'sourceFile':source,'sourceSha256':hashlib.sha256((MODELS/source).read_bytes()).hexdigest(),'triangles':sum(len(g[1]) for g in entries.values()),'attachments':attachments}
 print(file,(MODELS/file).stat().st_size,'triangles',manifest['variants'][variant or 'full']['triangles'])
(MODELS/'heart-junctions.json').write_text(json.dumps(manifest,separators=(',',':')))

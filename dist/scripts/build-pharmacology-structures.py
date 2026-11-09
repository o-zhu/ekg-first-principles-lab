#!/usr/bin/env python3
"""Reduce public PDB snapshots to backbone/ligand teaching assets.

Usage: python3 scripts/build-pharmacology-structures.py RAW_PDB_DIRECTORY
No molecular simulation, docking or invented drug coordinates are performed.
Resolved C-alpha positions and ligand heavy atoms receive the same rigid
transformation. Missing residues remain gaps. hERG uses deposited BIOMT
operators, not a hand-built symmetric copy. Pore-region highlighting for
drugs without structures is expressly schematic.
"""
from pathlib import Path
from collections import defaultdict
import hashlib, json, re, sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = Path(sys.argv[1])
META = {
 '6LQA': dict(key='quinidineNav',pore=['B'],lig='QDN',ligchain='B',protein='Human NaV1.5',species='Human',resolution=3.3,color='#efb582'),
 '6UZ0': dict(key='flecainideNav',pore=['A'],lig='K4D',ligchain='A',protein='Rat NaV1.5 construct',species='Rat',resolution=3.24,color='#efb582'),
 '7FBS': dict(key='propafenoneNav',pore=['A'],lig='4Y4',ligchain='A',protein='Open-state rat NaV1.5 construct',species='Rat · IFM/QQQ mutation',resolution=3.4,color='#efb582'),
 '6JPA': dict(key='verapamilCav',pore=['A'],lig='4YH',ligchain='A',protein='Rabbit CaV1.1 · L-type homolog',species='Rabbit skeletal-muscle homolog',resolution=2.6,color='#b6b0ed'),
 '6JPB': dict(key='diltiazemCav',pore=['A'],lig='C9F',ligchain='A',protein='Rabbit CaV1.1 · L-type homolog',species='Rabbit skeletal-muscle homolog',resolution=3,color='#b6b0ed'),
 '7DDH': dict(key='digoxinPump',pore=['A'],include=['A','B','G'],lig='DGX',ligchain='A',protein='Pig Na+/K+-ATPase',species='Pig',resolution=3.46,color='#b9d5a2'),
 '6D9H': dict(key='adenosineA1',pore=['R'],lig='ADN',ligchain='R',protein='Human A1 receptor · Gi complex',species='Human receptor construct',resolution=3.6,color='#95d6d1'),
 '5VA1': dict(key='hERGReference',pore=['A'],protein='Human hERG / Kv11.1',species='Human',resolution=3.8,color='#97d9bb'),
}

def build(pdbid, meta):
 path=RAW/(pdbid+'.pdb');raw=path.read_bytes();lines=raw.decode().splitlines()
 atoms=[];ca=defaultdict(list);helices=defaultdict(list);ligand=[];serials={};conects=[]
 for line in lines:
  if line.startswith('HELIX '):
   try:helices[line[19]].append((int(line[21:25]),int(line[33:37])))
   except ValueError:pass
  if line.startswith(('ATOM  ','HETATM')):
   if line[16] not in (' ','A'):continue
   chain=line[21];resn=line[17:20].strip();name=line[12:16].strip();elem=line[76:78].strip() or name[0]
   if elem=='H':continue
   try:point=np.array([float(line[30:38]),float(line[38:46]),float(line[46:54])]);resid=int(line[22:26]);serial=int(line[6:11])
   except ValueError:continue
   if line.startswith('ATOM  ') and name=='CA':ca[chain].append(dict(p=point,r=resid,name=resn))
   if resn==meta.get('lig') and chain==meta.get('ligchain'):
    # One alternate conformer and one ligand instance for the selected assembly.
    if ligand and resid!=ligand[0]['resid']:continue
    serials[serial]=len(ligand);ligand.append(dict(p=point,element=elem,name=name,resid=resid))
  if line.startswith('CONECT'):
   nums=[int(x) for x in re.findall(r'\d+',line[6:])]
   if len(nums)>1:conects.extend((nums[0],x) for x in nums[1:])
 include=meta.get('include',list(ca))
 chains=[dict(id=c,pore=c in meta['pore'],atoms=items,source=c) for c,items in ca.items() if c in include]
 if pdbid=='5VA1':
  ops=defaultdict(dict)
  for line in lines:
   m=re.search(r'BIOMT([123])\s+(\d+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)',line)
   if m:ops[int(m[2])][int(m[1])-1]=[float(m[k]) for k in range(3,7)]
  chains=[]
  for op,rows in sorted(ops.items()):
   matrix=np.array([rows[k] for k in range(3)]);rotation=matrix[:,:3];offset=matrix[:,3]
   chains.append(dict(id='A'+str(op),source='A',pore=True,atoms=[dict(a,p=rotation@a['p']+offset) for a in ca['A']]))
  assert len(chains)==4,'hERG requires the deposited complete tetramer'
 # A viewing frame estimated from long helices, not an experimental membrane.
 directions=[]
 for chain in chains:
  if not chain['pore']:continue
  lookup={a['r']:a['p'] for a in chain['atoms']}
  for a,b in helices[chain['source']]:
   if b-a>=15 and a in lookup and b in lookup:
    v=lookup[b]-lookup[a];directions.append(v/np.linalg.norm(v))
 if directions:
  _,_,v=np.linalg.svd(np.asarray(directions));y=v[0]
 else:y=np.array([0.,1.,0.])
 if y[2]<0:y=-y
 reference=np.array([1.,0.,0.]) if abs(y[0])<.85 else np.array([0.,0.,1.])
 x=np.cross(reference,y);x/=np.linalg.norm(x);z=np.cross(x,y);rotation=np.vstack([x,y,z])
 porepoints=np.array([a['p'] for c in chains if c['pore'] for a in c['atoms']]);center=porepoints.mean(axis=0)
 transform=lambda p: np.round(rotation@(p-center),3).tolist()
 outchains=[]
 palettes=['#a7dfbd','#6ab4ad','#80c8c1','#c0dbb2'] if pdbid=='5VA1' else [meta['color']]
 for index,chain in enumerate(chains):
  segments=[];seg=[];prev=None
  for atom in chain['atoms']:
   if prev is not None and (atom['r']-prev['r']>1 or np.linalg.norm(atom['p']-prev['p'])>4.7):
    if seg:segments.append(seg)
    seg=[]
   seg.append(atom);prev=atom
  if seg:segments.append(seg)
  outchains.append(dict(id=chain['id'],sourceChain=chain['source'],role='pore' if chain['pore'] else 'accessory',color=palettes[index%len(palettes)] if chain['pore'] else '#6c8c96',segments=[dict(positions=[v for a in seg for v in transform(a['p'])],residueIds=[a['r'] for a in seg],secondary=''.join('H' if any(a0<=a['r']<=b0 for a0,b0 in helices[chain['source']]) else 'C' for a in seg)) for seg in segments]))
 bonds={tuple(sorted((serials[a],serials[b]))) for a,b in conects if a in serials and b in serials}
 inferred=False
 if ligand and not bonds:
  inferred=True
  radii={'C':.76,'N':.71,'O':.66,'F':.57,'S':1.05,'P':1.07}
  for a in range(len(ligand)):
   for b in range(a):
    dist=np.linalg.norm(ligand[a]['p']-ligand[b]['p'])
    if .45<dist<radii.get(ligand[a]['element'],.8)+radii.get(ligand[b]['element'],.8)+.4:bonds.add((b,a))
 ligdata=None
 if ligand:
  ligdata=dict(id=meta['lig'],atoms=[dict(element=a['element'],name=a['name'],position=transform(a['p'])) for a in ligand],bonds=sorted(bonds),bondSource='distance-inferred display bonds' if inferred else 'deposited PDB CONECT records',center=transform(np.array([a['p'] for a in ligand]).mean(axis=0)))
 region=None
 if pdbid=='5VA1':
  selected=[a['p'] for c in chains for a in c['atoms'] if a['r'] in [652,656]]
  assert len(selected)==8
  region=dict(center=transform(np.mean(selected,axis=0)),radius=9,label='Supported inner-pore region',definition='Centroid of the C-alpha atoms of Y652 and F656 in the tetramer. This regional marker is not a docked or experimentally observed drug pose.')
 elif ligdata:region=dict(center=ligdata['center'],radius=9,label='Shared pore region',definition='Broad central-cavity teaching region; the selected medicine has no atomically resolved pose in this view.')
 return dict(id=meta['key'],pdbId=pdbid,protein=meta['protein'],title=meta['protein'],species=meta['species'],resolution=meta['resolution'],method='X-ray diffraction' if pdbid=='7DDH' else 'Single-particle cryo-EM',sourceUrl='https://www.rcsb.org/structure/'+pdbid,coordinateUrl='https://files.rcsb.org/download/'+pdbid+'.pdb',sourceSha256=hashlib.sha256(raw).hexdigest(),representation='Resolved C-alpha backbone with deposited ligand heavy atoms; no docking',orientation='A rigid camera-oriented frame estimated from long helices, not an experimental membrane placement.',units='angstrom',chains=outchains,ligand=ligdata,region=region,limitations='A fixed experimental snapshot. Missing residues, side chains, glycans, water and unrelated small molecules are omitted; the camera moves but protein coordinates do not deform. A displayed regional halo never represents an atomically resolved drug pose.')

if __name__=='__main__':
 out=ROOT/'cardiac-voltage/data/pharmacology';out.mkdir(parents=True,exist_ok=True)
 for pdbid,meta in META.items():
  result=build(pdbid,meta)
  (out/(meta['key']+'.json')).write_text(json.dumps(result,separators=(',',':')))
  print(pdbid,meta['key'],'chains',len(result['chains']),'ligand atoms',len((result['ligand'] or {}).get('atoms',[])))

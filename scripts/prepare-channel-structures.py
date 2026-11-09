#!/usr/bin/env python3
"""Prepare compact, real C-alpha coordinates for the optional channel lens.

Usage: python scripts/prepare-channel-structures.py --source-dir /tmp/channel-structures14
       python scripts/prepare-channel-structures.py --download

Requires NumPy. Downloads go to a temporary cache, never the public assets.
The source hashes pin the exact experimental snapshots; no atomic animation,
missing loops, or conformational interpolation is invented here.
"""
from pathlib import Path
import argparse
import hashlib
import itertools
import json
import re
import tempfile
from urllib.request import urlopen
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'dist/cardiac-voltage/data/channel-structures.json'
PROVENANCE = ROOT / 'data-source/channel-structures/provenance.json'
SPECS = [
    dict(id='sodium', pdbId='9P24', protein='NaV1.5', title='Human cardiac sodium channel',
         resolution=3.48, state='Intermediate-open structural snapshot',
         hash='2f6a217a00ccb826cc6631808a27bbe8f731223774e577363b353de51fe28b69',
         citation=dict(title='Structural and functional mechanisms underlying activation gate dynamics and IFM motif accessibility in human NaV1.5', url='https://doi.org/10.1038/s41467-026-69672-x'),
         caveat='An intermediate-open cryo-EM snapshot; detergent may help stabilize this state. The separate animated cartoon is schematic, not a trajectory measured by cryo-EM.',
         roles={'1':('pore', 'NaV1.5 α subunit', '#e9b46f')}, expected={'pore':1, 'accessory':0}, expectedResidues=1258),
    dict(id='calcium', pdbId='8HLP', protein='CaV1.2', title='Human L-type calcium-channel complex',
         resolution=3.50, state='Apo, inactivated snapshot with a closed intracellular gate',
         hash='f788265ab0d3bc59940cab5e15d2368db586be7f5d340a789522e3d7d1888a27',
         citation=dict(title='Structural bases of inhibitory mechanism of CaV1.2 channel inhibitors', url='https://doi.org/10.1038/s41467-024-47116-8'),
         caveat='The apo structure has an inactivated, closed intracellular gate despite activated voltage sensors. It supplies architectural detail, not coordinates for an open channel.',
         roles={'1':('pore', 'CaV1.2 α1C subunit', '#b5a8ef'), '2':('accessory', 'α2δ1 extracellular accessory', '#d5c8ad'), '3':('accessory', 'β2 cytoplasmic accessory', '#8faec6')}, expected={'pore':1, 'accessory':2}, expectedResidues=2332),
    dict(id='potassium', pdbId='9UC8', protein='KCNQ1 · KCNE1', title='Human slow delayed-rectifier complex',
         resolution=3.36, state='PIP₂-bound open structural snapshot',
         hash='53dd48f8063fba8dc6cc04242a27253fd7d09fdc3574986f3547bf037cee71d2',
         citation=dict(title='Secondary structure transitions and dual PIP2 binding define cardiac KCNQ1-KCNE1 channel gating', url='https://doi.org/10.1038/s41422-025-01182-9'),
         caveat='This complex represents I_Ks specifically. The lesson’s delayed K+ current combines simplified repolarizing currents, including I_Kr and I_Ks. Only the resolved KCNE1 transmembrane fragment is present.',
         roles={'1':('pore', 'KCNQ1 pore-forming subunit', '#83d4bd'), '2':('accessory', 'Calmodulin cytoplasmic accessory', '#8faec6'), '3':('accessory', 'KCNE1 transmembrane accessory', '#e2b783')}, expected={'pore':4, 'accessory':8}, expectedResidues=2052),
]
AA = dict(zip('ALA ARG ASN ASP CYS GLN GLU GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL'.split(), 'ARNDCQEGHILKMFPSTWYV'))
AA['MSE'] = 'M'


def cif_tokens(text):
    """Tokenize CIF 1.1 including semicolon fields and quoted atom names."""
    lines=iter(text.splitlines())
    for line in lines:
        if line.startswith(';'):
            block=[line[1:]]
            for continuation in lines:
                if continuation.startswith(';'):break
                block.append(continuation)
            yield '\n'.join(block)
            continue
        i=0
        while i<len(line):
            if line[i].isspace():i+=1;continue
            if line[i]=='#':break
            if line[i] in "\"'":
                quote=line[i];start=i+1;i+=1
                while i<len(line) and not(line[i]==quote and (i+1==len(line) or line[i+1].isspace())):i+=1
                if i==len(line):raise ValueError('Unterminated CIF quoted value')
                yield line[start:i];i+=1
            else:
                start=i
                while i<len(line) and not line[i].isspace():i+=1
                yield line[start:i]


def read_cif(text):
    tokens=list(cif_tokens(text));data={};i=0
    while i<len(tokens):
        t=tokens[i]
        if t=='loop_':
            i+=1;headers=[]
            while i<len(tokens) and tokens[i].startswith('_'):headers.append(tokens[i]);i+=1
            if not headers:raise ValueError('Empty CIF loop')
            for h in headers:data[h]=[]
            while i<len(tokens):
                if tokens[i].startswith('_') or tokens[i] in ('loop_','stop_') or tokens[i].startswith(('data_','save_')):break
                row=tokens[i:i+len(headers)]
                if len(row)!=len(headers):raise ValueError('Incomplete CIF row')
                for h,v in zip(headers,row):data[h].append(v)
                i+=len(headers)
        elif t.startswith('_'):
            data[t]=[tokens[i+1]];i+=2
        else:i+=1
    return data


def rows(data, category):
    fields={k.split('.',1)[1]:v for k,v in data.items() if k.startswith(category+'.')}
    if not fields:return []
    n=len(next(iter(fields.values())))
    assert all(len(v)==n for v in fields.values()), category
    return [{k:v[i] for k,v in fields.items()} for i in range(n)]


def operation_sequences(expression):
    groups=re.findall(r'\(([^)]+)\)', expression) or [expression]
    def expand(s):
        result=[]
        for part in s.split(','):
            if re.fullmatch(r'\d+-\d+',part):
                a,b=map(int,part.split('-'));result.extend(str(x) for x in range(a,b+1))
            else:result.append(part.strip())
        return result
    return list(itertools.product(*(expand(g) for g in groups)))


def assembly_chains(data,spec):
    atoms={}
    for a in rows(data,'_atom_site'):
        if a['label_entity_id'] not in spec['roles'] or a['label_atom_id']!='CA' or a['type_symbol']!='C':continue
        if a.get('pdbx_PDB_model_num','1')!='1':continue
        chain=a['label_asym_id'];key=(int(a['label_seq_id']),a.get('pdbx_PDB_ins_code','?'))
        record=dict(labelId=key[0], residueId=int(a['auth_seq_id']), insertion=key[1], aa=AA.get(a['label_comp_id'],'X'),
                    p=np.array([float(a['Cartn_'+v]) for v in 'xyz']), occupancy=float(a['occupancy']),
                    authChain=a['auth_asym_id'], entity=a['label_entity_id'])
        old=atoms.setdefault(chain,{}).get(key)
        if old is None or record['occupancy']>old['occupancy']:atoms[chain][key]=record
    operators={}
    for r in rows(data,'_pdbx_struct_oper_list'):
        operators[r['id']]=(np.array([[float(r[f'matrix[{i}][{j}]']) for j in (1,2,3)] for i in (1,2,3)]),np.array([float(r[f'vector[{i}]']) for i in (1,2,3)]))
    chains=[];used=set();assembly=[]
    for r in rows(data,'_pdbx_struct_assembly_gen'):
        if r['assembly_id']!='1':continue
        for sequence in operation_sequences(r['oper_expression']):
            rotation=np.eye(3);translation=np.zeros(3)
            for op in reversed(sequence):
                mat,vec=operators[op];translation=mat@translation+vec;rotation=mat@rotation
            for chain in r['asym_id_list'].split(','):
                if chain not in atoms:continue
                key=(chain,sequence)
                if key in used:continue
                used.add(key);values=sorted(atoms[chain].values(),key=lambda a:a['labelId'])
                values=[{**a,'p':rotation@a['p']+translation} for a in values]
                role,name,color=spec['roles'][values[0]['entity']]
                helices=[]
                for h in rows(data,'_struct_conf'):
                    if h['beg_label_asym_id']==chain and h['end_label_asym_id']==chain and h['conf_type_id'].startswith('HELX'):
                        helices.append([int(h['beg_auth_seq_id']),int(h['end_auth_seq_id'])])
                chains.append(dict(id=chain if sequence==('1',) else chain+'_'+','.join(sequence),sourceChain=chain,
                                   authChain=values[0]['authChain'],entityId=values[0]['entity'],role=role,name=name,color=color,atoms=values,helices=helices))
                assembly.append(dict(sourceChain=chain,operators=list(sequence)))
    assert {role:sum(c['role']==role for c in chains) for role in spec['expected']}==spec['expected'], 'Incomplete biological assembly '+spec['pdbId']
    return chains,assembly


def orient(chains,data,spec):
    pore=[c for c in chains if c['role']=='pore'];vectors=[];centers=[]
    # PDB secondary-structure annotations establish real helical axes. Long
    # pore-chain helices dominate the membrane-spanning bundle, but this is
    # a geometric orientation estimate, not a fitted membrane boundary.
    for c in pore:
        for start,end in c['helices']:
            pts=[a['p'] for a in c['atoms'] if start<=a['residueId']<=end]
            if 17<=len(pts)<=45:
                v=np.mean(pts[-4:],axis=0)-np.mean(pts[:4],axis=0)
                if np.linalg.norm(v)>12:vectors.append(v/np.linalg.norm(v));centers.append(np.mean(pts,axis=0))
    assert len(vectors)>=6
    eigen,axes=np.linalg.eigh(np.asarray(vectors).T@np.asarray(vectors));axis=axes[:,-1]
    method='Dominant axis of deposited long helices in the pore-forming chain(s).'
    axis_evidence={}
    if spec['id']=='calcium':
        # The 8HLP study explicitly identifies all four EEEE-filter residues
        # and eight intracellular S6-gate residues. Their centroids define
        # a pore-specific axis without including AID/cytoplasmic helices.
        by_id={a['residueId']:a for a in pore[0]['atoms']}
        filter_ids=[363,706,1135,1464]
        gate_ids=[401,405,749,753,1182,1186,1519,1523]
        assert ''.join(by_id[n]['aa'] for n in filter_ids)=='EEEE'
        assert ''.join(by_id[n]['aa'] for n in gate_ids)=='LSLVVIFI'
        filter_pts=np.array([by_id[n]['p'] for n in filter_ids])
        gate_pts=np.array([by_id[n]['p'] for n in gate_ids])
        vector=filter_pts.mean(axis=0)-gate_pts.mean(axis=0)
        pore_axis=vector/np.linalg.norm(vector)
        _,_,filter_axes=np.linalg.svd(filter_pts-filter_pts.mean(axis=0))
        angle=lambda a,b:float(np.degrees(np.arccos(np.clip(abs(a@b),-1,1))))
        axis_evidence=dict(poreLandmarks=dict(chain=pore[0]['sourceChain'],filterResidues=filter_ids,
                                             intracellularGateResidues=gate_ids,sourceUrl=spec['citation']['url']),
                           axisValidation=dict(filterGateSeparationAngstrom=round(float(np.linalg.norm(vector)),3),
                                               changeFromLongHelixEstimateDegrees=round(angle(pore_axis,axis),3),
                                               filterPlaneNormalAgreementDegrees=round(angle(pore_axis,filter_axes[-1]),3)))
        axis=pore_axis
        method='Axis from the intracellular S6-gate centroid to the EEEE selectivity-filter centroid, using residue identities explicitly reported for 8HLP.'
    if spec['id']=='potassium':
        # Four corresponding KCNQ1 residues define planes perpendicular to
        # its C4 pore axis. Use only the known pore region to avoid flexibly
        # displaced cytoplasmic regions.
        groups={}
        for c in pore:
            for a in c['atoms']:
                if 261<=a['residueId']<=348:groups.setdefault(a['residueId'],[]).append(a['p'])
        scatter=np.zeros((3,3))
        for g in groups.values():
            if len(g)==4:
                q=np.array(g)-np.mean(g,axis=0);scatter+=q.T@q
        _,axes=np.linalg.eigh(scatter);axis=axes[:,0]
        method='C4 pore axis estimated from planes through equivalent KCNQ1 residues 261–348 in the complete tetramer.'
    center=np.mean(centers,axis=0)
    if spec['id']=='calcium':
        exterior=np.mean([a['p'] for c in chains if c['entityId']=='2' for a in c['atoms']],axis=0)
        interior=np.mean([a['p'] for c in chains if c['entityId']=='3' for a in c['atoms']],axis=0)
        sign_basis='Extracellular α2δ1 and cytoplasmic β2 accessory positions in the deposited complex.'
    elif spec['id']=='potassium':
        exterior=np.mean([a['p'] for c in pore for a in c['atoms'] if 300<=a['residueId']<=320],axis=0)
        interior=np.mean([a['p'] for c in chains if c['entityId']=='2' for a in c['atoms']],axis=0)
        sign_basis='Extracellular pore-filter region versus cytoplasmic calmodulin in the complete assembly.'
    else:
        glycans=[np.array([float(a['Cartn_'+v]) for v in 'xyz']) for a in rows(data,'_atom_site') if a['label_comp_id']=='NAG']
        exterior=np.mean(glycans,axis=0)
        interior=np.mean([a['p'] for c in pore for a in c['atoms'] if a['residueId']<90 or a['residueId']>1790],axis=0)
        sign_basis='Extracellular N-linked glycans versus resolved intracellular N/C-terminal regions.'
    if (exterior-interior)@axis<0:axis=-axis
    separation=float((exterior-interior)@axis);assert separation>15,'Unreliable extracellular-side estimate'
    x=centers[0]-center;x=x-axis*(x@axis);x=x/np.linalg.norm(x);z=np.cross(x,axis);matrix=np.array([x,axis,z])
    assert np.linalg.det(matrix)>0.9999
    # The center is a geometric reference for orbiting. No lipid plane is
    # inferred from cryo-EM detergent particles.
    return center,matrix,dict(axis='+Y',extracellularDirection='+Y',signConfidence='Inferred from known extracellular/cytoplasmic structural landmarks; not an experimental membrane fit.',
                             note='The initial side view places a geometric estimate of the pore axis vertically. The extracellular side is inferred from structural landmarks; no experimentally fitted membrane boundary is shown.',
                             signBasis=sign_basis,landmarkSeparationAngstrom=round(separation,2),method=method,
                             membraneY=None,poreCenter=[0,0,0],centerDefinition='Mean of selected pore-chain helix centers; a viewing origin, not an ion-site coordinate.',
                             sourceCenter=np.round(center,8).tolist(),sourceToViewerMatrix=np.round(matrix,8).tolist(),**axis_evidence)


def prepare(spec,path):
    source=path.read_bytes();digest=hashlib.sha256(source).hexdigest();assert digest==spec['hash'], 'Changed source '+str(path)
    data=read_cif(source.decode());chains,assembly=assembly_chains(data,spec);center,matrix,orientation=orient(chains,data,spec)
    positions=[];longest=0;count=0;segments=0
    for c in chains:
        parts=[];part=[];last=None
        for a in c.pop('atoms'):
            if last is not None and (a['labelId']!=last['labelId']+1 or np.linalg.norm(a['p']-last['p'])>4.8):
                parts.append(part);part=[]
            part.append(a);last=a
        if part:parts.append(part)
        c['segments']=[]
        for part in parts:
            q=np.array([matrix@(a['p']-center) for a in part]);positions.extend(q);count+=len(q);segments+=1
            sec=''.join('H' if any(start<=a['residueId']<=end for start,end in c['helices']) else 'C' for a in part)
            c['segments'].append(dict(positions=np.round(q,2).ravel().tolist(),residueIds=[a['residueId'] for a in part],sequence=''.join(a['aa'] for a in part),secondary=sec))
            if len(q)>1:longest=max(longest,float(np.max(np.linalg.norm(np.diff(q,axis=0),axis=1))))
    p=np.array(positions)
    assert count==spec['expectedResidues'], 'Modeled residue count disagrees with the RCSB entry'
    assert np.isfinite(p).all()
    out={k:spec[k] for k in ('id','pdbId','protein','title','resolution','state','citation','caveat')}
    out.update(method='Single-particle cryo-EM',species='Homo sapiens',sourceUrl='https://www.rcsb.org/structure/'+spec['pdbId'],coordinateUrl='https://files.rcsb.org/download/'+spec['pdbId']+'.cif',
               sourceSha256=digest,assemblyId='1',representation='Cα backbone of modeled residues only',units='ångström',chains=chains,
               bounds=dict(min=np.round(p.min(axis=0),2).tolist(),max=np.round(p.max(axis=0),2).tolist()),orientation=orientation,
               counts=dict(chains=len(chains),residues=count,segments=segments),limitations='Static experimental coordinates. Missing residues remain gaps. Ligands, ions, glycans and atomic side chains are omitted from the backbone view.')
    audit=dict(pdbId=spec['pdbId'],downloadUrl=out['coordinateUrl'],sourceBytes=len(source),sourceSha256=digest,assemblyId='1',assemblyChains=assembly,counts=out['counts'],maxJoinedCaDistanceAngstrom=round(longest,4),coordinateRoundingAngstrom=0.01,orientation=orientation)
    return out,audit


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-dir',type=Path,default=Path(tempfile.gettempdir())/'cardio-channel-structures');parser.add_argument('--download',action='store_true');args=parser.parse_args()
    args.source_dir.mkdir(parents=True,exist_ok=True);structures=[];audits=[]
    for spec in SPECS:
        path=args.source_dir/(spec['pdbId']+'.cif')
        if not path.exists():
            if not args.download:raise FileNotFoundError(str(path)+' (use --download or --source-dir)')
            path.write_bytes(urlopen('https://files.rcsb.org/download/'+spec['pdbId']+'.cif',timeout=60).read())
        structure,audit=prepare(spec,path);structures.append(structure);audits.append(audit)
    payload={'schemaVersion':1,'description':'Real experimental Cα backbones for an optional structural reference lens. The educational cartoons are separate schematic animations.','structures':structures}
    encoded=(json.dumps(payload,separators=(',',':'),ensure_ascii=False)+'\n').encode();assert len(encoded)<400000
    OUTPUT.parent.mkdir(parents=True,exist_ok=True);OUTPUT.write_bytes(encoded)
    PROVENANCE.parent.mkdir(parents=True,exist_ok=True);PROVENANCE.write_text(json.dumps({'schemaVersion':1,'output':'dist/cardiac-voltage/data/channel-structures.json','outputBytes':len(encoded),'outputSha256':hashlib.sha256(encoded).hexdigest(),'structures':audits},indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'passed':True,'bytes':len(encoded),'sha256':hashlib.sha256(encoded).hexdigest(),'structures':[dict(pdbId=s['pdbId'],**s['counts'],orientation=s['orientation']['extracellularDirection']) for s in structures]},indent=2))


if __name__=='__main__':main()

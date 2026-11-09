#!/usr/bin/env python3
"""Build causal conducting-tree / visible myocardial surface first arrivals.

Geometry is BodyParts3D, not a patient-specific cardiac conduction system.
Working muscle travels only on anatomical triangle edges. No cavity chord is
used. Junctions lie at existing visible-wall vertices so the rendered vertex
field contains their arrival times, rather than only an off-surface metadata
point. All selected source meshes and graph parameters are exported.
"""
from pathlib import Path
import hashlib,heapq,json,subprocess
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

ROOT=Path(__file__).resolve().parents[1]
source=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/conduction-source-geometry.mjs')],cwd=ROOT))
selection=json.loads((ROOT/'data-source/conduction-inner-wall-faces.json').read_text())
assert hashlib.sha256((ROOT/'dist/models/heart.glb').read_bytes()).hexdigest()==selection['sourceSha256']

class Graph:
    def __init__(self,raw,faces=None):
        p=np.asarray(raw['positions']).reshape(-1,3);f=np.asarray(raw['indices']).reshape(-1,3)
        if faces is not None:f=f[faces]
        # GLTF normals/material seams can duplicate one anatomical vertex.
        # Welding only coordinates equal to 1e-7 prevents contradictory ATs
        # at the same physical point; it is not a near-neighbor tissue bridge.
        _,first,inverse=np.unique(np.round(p,7),axis=0,return_index=True,return_inverse=True)
        source_ids=first.copy();p=p[first];f=inverse[f]
        edges=np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]);_,labels=connected_components(coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(p),len(p))),directed=False)
        component=int(np.bincount(labels[f.ravel()]).argmax());self.excludedFaces=int(np.sum(labels[f[:,0]]!=component));f=f[labels[f[:,0]]==component]
        ids=np.unique(f);lookup=np.full(len(p),-1,dtype=int);lookup[ids]=np.arange(len(ids));self.p=p[ids];self.f=lookup[f];self.source_ids=source_ids[ids]
        self.tree=cKDTree(self.p);self.adj=[{} for _ in self.p];self.face_at=[[] for _ in self.p]
        for fi,tri in enumerate(self.f):
            for i in tri:self.face_at[i].append(fi)
            for a,b in [(tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])]:
                d=float(np.linalg.norm(self.p[a]-self.p[b]));self.adj[a][b]=d;self.adj[b][a]=d
        self.sources=[]
    def vertex(self,p):return int(self.tree.query(p)[1])
    def point(self,p):return self.p[self.vertex(p)].tolist()
    def solve(self,seeds,velocity):
        n=len(self.p);at=np.full(n,np.inf);parent=np.full(n,-1,dtype=int);queue=[]
        for node,t in seeds:
            if t<at[node]:at[node]=t;heapq.heappush(queue,(t,node))
        while queue:
            t,i=heapq.heappop(queue)
            if t>at[i]+1e-12:continue
            for j,d in self.adj[i].items():
                nxt=t+d/velocity
                if nxt<at[j]-1e-12:at[j]=nxt;parent[j]=i;heapq.heappush(queue,(nxt,j))
        return at,parent
    def route(self,parent,start,end):
        route=[end]
        while route[-1]!=start and parent[route[-1]]>=0:route.append(int(parent[route[-1]]))
        assert route[-1]==start,'Disconnected route'
        return route[::-1]
    def export(self,at,velocity):
        assert np.isfinite(at).all(),'Disconnected anatomical graph'
        return {'positions':self.p.ravel().tolist(),'indices':self.f.ravel().tolist(),'arrival':np.round(at,10).tolist(),'velocity':velocity,'sources':self.sources,'sourceVertexIds':self.source_ids.tolist(),'excludedDisconnectedFaces':self.excludedFaces,'vertexWeldTolerance':1e-7}

wall=source['geometry']['ventricular-wall']
graphs={'lv':Graph(wall,selection['faceIndices']['left']),'rv':Graph(wall,selection['faceIndices']['right']),
        'la':Graph(source['geometry']['left-atrium']),'ra':Graph(source['geometry']['right-atrium'])}
paths={p['id']:{k:v for k,v in p.items() if k!='samples'} for p in source['paths']}
fast_velocity=45.0;working_velocity=10.0;junction_delay=.003

def length(points):return float(np.linalg.norm(np.diff(np.asarray(points),axis=0),axis=1).sum())
def add_path(id,points,parent=None,fraction=1,side=None,role='specialized',start=None,duration=None,polyline=False):
    p={'id':id,'points':points,'parentId':parent,'parentFraction':fraction,'side':side,'role':role,'polyline':polyline}
    if parent:
        par=paths[parent];start=par['start']+(par['end']-par['start'])*fraction
    p['start']=start or 0;p['end']=p['start']+(duration if duration is not None else length(points)/fast_velocity)
    p['knots']=[[0,p['start']],[1,p['end']]]
    if p['start']<0<p['end']:p['knots'].insert(1,[-p['start']/(p['end']-p['start']),0])
    paths[id]=p;return p

# Insulated His and proximal branches precede visible working muscle. The
# earliest LV septal daughter arrives at -3ms and its declared 3ms junction
# starts the myocardial QRS clock at zero. Other septal sites follow rapidly.
his=paths['his'];add_path('his',his['points'],start=-.049,duration=.022)
for side,key,bundle_span in [('left','lv',.040),('right','rv',.042)]:
    graph=graphs[key];old=paths[side+'-bundle'];points=old['points'];points[-1]=graph.point(points[-1])
    bundle=add_path(side+'-bundle',points,'his',side=side,duration=bundle_span)
    for p in list(paths.values()):
        if p.get('side')!=side or 'purkinje' not in p['id']:continue
        pts=[graph.point(x) for x in p['points']];pts[0]=bundle['points'][-1]
        add_path(p['id'],pts,side+'-bundle',side=side)
    for p in list(paths.values()):
        if p.get('side')!=side or 'twig' not in p['id']:continue
        par=paths[p['parentId']];fraction=p['parentFraction'];index=round(fraction*(len(par['points'])-1))
        pts=[par['points'][index],graph.point(p['points'][1]),graph.point(p['points'][-1])]
        add_path(p['id'],pts,p['parentId'],fraction,side=side)
    fractions=[.50,.60,.72] if side=='left' else [.56,.67,.78]
    original=next(x for x in source['paths'] if x['id']==side+'-bundle')
    for k,fraction in enumerate(fractions):
        # The saved spline samples keep the branch at exactly the parent
        # parameter; runtime evaluates that same parent point for the junction.
        samples=np.asarray(original['samples']);u=fraction*128;i=min(127,int(u));anchor=(samples[i]*(1-(u-i))+samples[i+1]*(u-i)).tolist()
        target=graph.point(anchor)
        add_path(side+'-septal-'+str(k),[anchor,target],side+'-bundle',fraction,side=side,duration=.004)

pmjs=[]
for p in paths.values():
    side=p.get('side')
    if not side or p['id'].endswith('bundle'):continue
    graph=graphs['lv' if side=='left' else 'rv']
    fractions=[i/(len(p['points'])-1) for i in range(1,len(p['points']))] if 'purkinje' in p['id'] else [1]
    for fraction in fractions:
        index=round(fraction*(len(p['points'])-1));position=p['points'][index];node=graph.vertex(position)
        fiber=p['start']+(p['end']-p['start'])*fraction
        pmjs.append({'id':p['id']+'@'+str(index),'pathId':p['id'],'fraction':fraction,'side':side,'vertex':node,'position':graph.p[node].tolist(),'fiberArrival':fiber,'muscleArrival':fiber+junction_delay})
assert abs(min(s['muscleArrival'] for s in pmjs))<1e-9
# The original seven posterior display fans did not cover the anterior inner
# wall. Extend fast distribution over the actual endocardial graph, choosing
# the latest uncovered region at each step. These are explicit visible paths,
# not hidden globally activated seeds. Each new route shares the apical supply
# and contains sparse junctions at real displayed-wall vertices.
for side,key in [('left','lv'),('right','rv')]:
    graph=graphs[key];bundle=paths[side+'-bundle'];apex=graph.vertex(bundle['points'][-1])
    fast_at,fast_parent=graph.solve([(apex,bundle['end'])],fast_velocity)
    for k in range(8):
        seeds=[s for s in pmjs if s['side']==side];arrival,_=graph.solve([(s['vertex'],s['muscleArrival']) for s in seeds],working_velocity)
        target=int(arrival.argmax())
        if arrival[target]<=.075:break
        nodes=graph.route(fast_parent,apex,target);id=side+'-distribution-'+str(k)
        pts=graph.p[nodes].tolist();times=fast_at[nodes]
        paths[id]={'id':id,'points':pts,'parentId':side+'-bundle','parentFraction':1,'side':side,'role':'specialized','polyline':True,'fine':True,'start':float(times[0]),'end':float(times[-1]),'knots':[[j/(len(nodes)-1),float(t)] for j,t in enumerate(times)]}
        traveled=0
        for j,node in enumerate(nodes):
            if j:traveled+=float(np.linalg.norm(graph.p[node]-graph.p[nodes[j-1]]))
            if j==0 or (traveled<.12 and j<len(nodes)-1):continue
            traveled=0;fiber=float(times[j]);pmjs.append({'id':id+'@'+str(j),'pathId':id,'fraction':j/(len(nodes)-1),'side':side,'vertex':int(node),'position':graph.p[node].tolist(),'fiberArrival':fiber,'muscleArrival':fiber+junction_delay})
surfaces={};vent_max=0
for side,key in [('left','lv'),('right','rv')]:
    graph=graphs[key];seeds=[s for s in pmjs if s['side']==side]
    at,parent=graph.solve([(s['vertex'],s['muscleArrival']) for s in seeds],working_velocity)
    for s in seeds:
        s['firstArrival']=float(at[s['vertex']]);s['recruits']=abs(s['firstArrival']-s['muscleArrival'])<1e-8
        for face in graph.face_at[s['vertex']]:graph.sources.append({'face':face,'position':s['position'],'time':s['muscleArrival'],'id':s['id']})
    surfaces[key]=graph.export(at,working_velocity);vent_max=max(vent_max,float(at.max()))

# BBB has no fast supply on the interrupted side. It is recruited through
# declared short septal muscle connections from the intact chamber, followed
# by slow surface-edge spread. Pick spatially distinct EARLY septal suppliers,
# not every nearby free-wall pair. Facing normals exclude cavity-facing chords.
# A conservative common gate waits until all selected suppliers have fired;
# its normalized time is no earlier than any supplier even when QRS widens.
def vertex_normals(graph):
    p,f=graph.p,graph.f;n=np.zeros_like(p);face=np.cross(p[f[:,1]]-p[f[:,0]],p[f[:,2]]-p[f[:,0]])
    for j in range(3):np.add.at(n,f[:,j],face)
    return n/np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-12)
normals={key:vertex_normals(graphs[key]) for key in ['lv','rv']};blocked_durations={};blocked_gates={};transfers=[]
for target,provider in [('lv','rv'),('rv','lv')]:
    graph,other=graphs[target],graphs[provider];distance,idx=other.tree.query(graph.p);direction=(graph.p-other.p[idx])/np.maximum(distance[:,None],1e-12)
    supplied=np.asarray(surfaces[provider]['arrival'])[idx]
    mask=(distance>.035)&(distance<.30)&(graph.p[:,1]<-.30)&(graph.p[:,1]>-1.10)&(supplied<=.025)&((normals[provider][idx]*direction).sum(1)<-.30)&((normals[target]*direction).sum(1)>.30)
    candidates=np.flatnonzero(mask);assert len(candidates)>=6,'Insufficient early septal connections'
    chosen=[int(candidates[np.argmin(supplied[candidates]+distance[candidates]/working_velocity)])]
    while len(chosen)<min(8,len(candidates)):
        separation=np.min(np.linalg.norm(graph.p[candidates,None,:]-graph.p[np.asarray(chosen)][None,:,:],axis=2),axis=1)
        chosen.append(int(candidates[np.argmax(separation)]))
    gate=max(float(supplied[i]) for i in chosen);seeds=[(i,float(distance[i]/working_velocity)) for i in chosen]
    blocked,_=graph.solve(seeds,working_velocity);assert np.isfinite(blocked).all()
    surfaces[target]['blockedArrival']=np.round(blocked,10).tolist();surfaces[target]['blockedSources']=[]
    for i,travel in seeds:
        transfer={'fromSide':provider,'toSide':target,'fromVertex':int(idx[i]),'toVertex':i,'fromPosition':other.p[idx[i]].tolist(),'toPosition':graph.p[i].tolist(),'distance':float(distance[i]),'travel':travel,'sourceArrival':float(supplied[i])}
        transfers.append(transfer)
        for face in graph.face_at[i]:surfaces[target]['blockedSources'].append({'face':face,'position':graph.p[i].tolist(),'time':travel})
    blocked_durations[target]=float(blocked.max())+.035;blocked_gates[target]=gate

# Atrial guides are preferential routes through working myocardium. Their
# positions and timings are the very same surface shortest paths as the P
# activation field. A short modeled Bachmann bridge joins RA and LA meshes.
ra,la=graphs['ra'],graphs['la'];sa=ra.vertex(source['nodes']['sa']);av=ra.vertex(source['nodes']['av']);ra_exit=ra.vertex([-.42,.43,-.02]);la_entry=la.vertex([-.12,.36,-.11])
ra_distance,ra_parent=ra.solve([(sa,0)],1)
atrial_velocity=float(ra_distance[av]/.070)
ra_at,ra_parent=ra.solve([(sa,0)],atrial_velocity)
bridge_length=float(np.linalg.norm(ra.p[ra_exit]-la.p[la_entry]));la_start=float(ra_at[ra_exit]+bridge_length/atrial_velocity)
la_at,la_parent=la.solve([(la_entry,la_start)],atrial_velocity)
def atrial_path(id,nodes,graph,times,parent=None,parent_fraction=1):
    points=graph.p[nodes].tolist();p={'id':id,'points':points,'parentId':parent,'parentFraction':parent_fraction,'side':None,'role':'atrial','polyline':True,'start':float(times[0]),'end':float(times[-1]),'knots':[[i/(len(nodes)-1),float(t)] for i,t in enumerate(times)]};paths[id]=p;return p
nodes=ra.route(ra_parent,sa,av);atrial_path('atrial-to-av',nodes,ra,ra_at[nodes])
ra_nodes=ra.route(ra_parent,sa,ra_exit);la_target=la.vertex([.28,.22,-.16]);la_nodes=la.route(la_parent,la_entry,la_target)
bach_points=ra.p[ra_nodes].tolist()+la.p[la_nodes].tolist();bach_times=ra_at[ra_nodes].tolist()+la_at[la_nodes].tolist()
paths['bachmann']={'id':'bachmann','points':bach_points,'parentId':None,'parentFraction':1,'side':None,'role':'atrial','polyline':True,'start':0,'end':float(bach_times[-1]),'knots':[[i/(len(bach_points)-1),float(t)] for i,t in enumerate(bach_times)]}
left_parent_fraction=len(ra_nodes)/(len(bach_points)-1)
la_end=la.vertex([.22,-.18,-.34]);nodes=la.route(la_parent,la_entry,la_end);atrial_path('left-atrium',nodes,la,la_at[nodes],'bachmann',left_parent_fraction)
for key,graph,at in [('ra',ra,ra_at),('la',la,la_at)]:surfaces[key]=graph.export(at,atrial_velocity)
atrial_duration=max(float(ra_at.max()),float(la_at.max()))
vent_duration=vent_max+.035
blocked_entry_fractions={key:value/vent_duration for key,value in blocked_gates.items()}
paths['his']['points'][0]=ra.p[av].tolist()
# Local-voltage panels use these same anatomical sites and source clocks.
atrial_probe=paths['atrial-to-av'];probe_index=max(1,round((len(atrial_probe['points'])-1)*.2))
his_probe=np.asarray(paths['his']['points'][0])*(1-6/22)+np.asarray(paths['his']['points'][1])*(6/22)
probe_sites={'sa':{'position':ra.p[sa].tolist(),'activation':-.028,'clock':'atrial','beforeP':True},
 'atrial':{'position':atrial_probe['points'][probe_index],'activation':atrial_probe['knots'][probe_index][1],'clock':'atrial'},
 'av':{'position':ra.p[av].tolist(),'activation':float(ra_at[av]),'clock':'atrial'},
 'his':{'position':his_probe.tolist(),'activation':-.043,'clock':'ventricular','pathId':'his','fraction':6/22},
 'purkinje':{'position':paths['left-septal-0']['points'][0],'activation':-.007,'clock':'ventricular','pathId':'left-septal-0','fraction':0}}
ordered=[paths[id] for id in ['atrial-to-av','bachmann','left-atrium','his','left-bundle','right-bundle']]
ordered += [p for p in paths.values() if p not in ordered]
out={'schemaVersion':1,'sourceSha256':selection['sourceSha256'],'method':'Anatomical surface-edge multi-source first arrivals. Junctions are vertices on the actually displayed inner ventricular wall. Working atria use their own surface geodesics and a declared Bachmann bridge. No ECG values are modified.',
     'reference':{'ventricularDuration':vent_duration,'atrialDuration':atrial_duration,'junctionDelay':junction_delay,'wallDepthScale':.19,'outwardMaximum':.035,'workingVelocitySceneUnitsPerSecond':working_velocity,'fastVelocitySceneUnitsPerSecond':fast_velocity,'atrialVelocitySceneUnitsPerSecond':atrial_velocity,'junctionTimingNote':'3 ms in the reference source graph; positive-QRS times scale together to each displayed QRS duration. This is a teaching assumption, not a measured human constant.','blockedDurations':blocked_durations,'blockedEntryFractions':blocked_entry_fractions,'blockedEntryNote':'A conservative gate waits until all eight chosen early intact-side septal suppliers have activated. Short facing-wall muscle connections and slow surface spread follow. The blocked-side time field then fills the displayed QRS window; no blocked Purkinje source is used. This is an explicit teaching assumption, not a measured human septal map.'},
     'nodes':{**source['nodes'],'sa':ra.p[sa].tolist(),'av':ra.p[av].tolist()},'probeSites':probe_sites,'paths':ordered,'junctions':pmjs,'septalTransfers':transfers,'surfaces':surfaces,
     'audit':{'pmjs':len(pmjs),'recruitingPmjs':sum(s['recruits'] for s in pmjs),'ventricularSurfaceCompletion':vent_max,'atrialCompletion':atrial_duration,'innerWallFaceCounts':{k:len(graphs[k].f) for k in ['lv','rv']},'allNodesReachable':True}}
target=ROOT/'dist/data/conduction-coupling.json';target.write_text(json.dumps(out,separators=(',',':'))+'\n')
subprocess.check_call(['node',str(ROOT/'scripts/finalize-conduction-geometry.mjs')],cwd=ROOT)
print(json.dumps({'output':str(target),'bytes':target.stat().st_size,'reference':out['reference'],'audit':out['audit']},indent=2))

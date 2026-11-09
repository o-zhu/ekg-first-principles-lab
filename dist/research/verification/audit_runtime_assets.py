#!/usr/bin/env python3
"""Read-only audit of known runtime requests in the recovered EKG export."""
import argparse, hashlib, json, pathlib, re
parser=argparse.ArgumentParser();parser.add_argument('--root',type=pathlib.Path,default=pathlib.Path(__file__).resolve().parents[2]);parser.add_argument('--output',type=pathlib.Path)
args=parser.parse_args();ROOT=args.root.resolve()
required=set()
def add(path):
    required.add(path)
def resolve(parent,ref):
    if ref.startswith(('http:','https:','data:','blob:','#')):return
    if ref=='three':ref='/vendor/three.module.js'
    if not ref.startswith(('./','../','/')):return
    target=ROOT/ref.lstrip('/') if ref.startswith('/') else parent.parent/ref
    try:rel=str(target.resolve().relative_to(ROOT.resolve()))
    except ValueError:return
    add(rel)
for p in ROOT.rglob('*'):
    if not p.is_file() or set(p.relative_to(ROOT).parts)&{'.git','preview','research','node_modules'}:continue
    if p.suffix=='.js':
        text=p.read_text()
        # Only actual top-level import statements; documentation examples in
        # vendor comments are excluded by requiring the start of the line.
        text=re.sub(r'/\*.*?\*/','',text,flags=re.S)
        text=re.sub(r'(?m)^\s*//.*$','',text)
        for m in re.finditer(r'''(?:^|\n)\s*import\s+(?:[^;]*?\sfrom\s*)?(['"])([^'"]+)\1''',text):resolve(p,m.group(2))
        for ref in re.findall(r'''new URL\(['"]([^'"]+\.(?:json|css|js))['"],\s*import\.meta\.url\)''',text):resolve(p,ref)
    elif p.suffix=='.css':
        for ref in re.findall(r'''url\(\s*['"]?([^)'"\s]+)''',p.read_text()):resolve(p,ref)
    elif p.suffix=='.html':
        for ref in re.findall(r'''(?:src|href)=["']([^"']+)["']''',p.read_text()):
            if re.search(r'\.(?:js|css|woff2|png|jpg|svg)$',ref):resolve(p,ref)
for p in ['index.html','app.js','cardiac-voltage/index.html','cardiac-voltage/data/heart-model.json','cardiac-voltage/data/channel-structures.json','data/electrical-atlas.json','data/conduction-coupling.json','models/heart-junctions.json']:
    add(p)
for variant in ['', '-medium']:
    for stem,extension in [('heart','.glb'),('heart-junctions','.glb'),('heart-regions','.json')]:add('models/'+stem+variant+extension)
for variant in ['', '-low']:
    for stem in ['chest-bones','chest-skin']:add('models/'+stem+variant+'.glb')
for f in ['clinical-ecgs.json','clinical-extra.json','clinical-mobitz2.json','clinical-stemi.json','clinical-tachyarrhythmias.json','clinical-torsades.json','pathology-fits/source/ptbxl-03155-500hz.json']:
    add('data/'+f)
for case in ['ptbxl-03155','acs-00004']:add('data/pathology-fits/cases/'+case+'.json')
manifest=ROOT/'data/pathology-fits/manifest.json';add(str(manifest.relative_to(ROOT)))
if manifest.exists():
    for case in json.loads(manifest.read_text()).get('cases',[]):
        add(case['file'])
for f in ['cardiac-muscle-light-200x.jpg','cardiac-gap-junction-tem.jpg','purkinje-rabbit-confocal-romero-fig2.png']:
    add('cardiac-voltage/assets/microscopy/'+f)
integrity=[]
for donor in (1,2):
    mpath=ROOT/f'cardiac-voltage/data/human/donor{donor}-metadata.json';add(str(mpath.relative_to(ROOT)))
    if not mpath.exists():continue
    m=json.loads(mpath.read_text())
    for key in ['voltage_file','single_beat_file','mask_file','background_file','timing_file']:
        if key not in m:continue
        p=mpath.parent/m[key];add(str(p.relative_to(ROOT)))
        expected={'voltage_file':m['display_samples']*10000,'single_beat_file':m['display_samples']*10000,'mask_file':10000,'timing_file':240000}.get(key)
        if p.exists() and expected is not None:integrity.append({'file':str(p.relative_to(ROOT)),'expectedBytes':expected,'actualBytes':p.stat().st_size,'ok':p.stat().st_size==expected})
apath=ROOT/'data/electrical-atlas.json'
if apath.exists():
    a=json.loads(apath.read_text());p=apath.parent/a['binaryFile'];add(str(p.relative_to(ROOT)))
    if p.exists():integrity.append({'file':str(p.relative_to(ROOT)),'expectedSha256':a['binarySha256'],'actualSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'ok':hashlib.sha256(p.read_bytes()).hexdigest()==a['binarySha256']})
model=ROOT/'cardiac-voltage/data/heart-model.json'
if model.exists():
    d=json.loads(model.read_text())
    if d.get('referenceECGFile'):add('cardiac-voltage/data/'+d['referenceECGFile'])
    for variant in d.get('variants',{}).values():
        if variant.get('vmFile'):add('cardiac-voltage/data/'+variant['vmFile'])
missing=sorted(p for p in required if not (ROOT/p).is_file())
result={'requiredRuntimeCount':len(required),'requiredRuntimeFiles':sorted(required),'missing':missing,'integrity':integrity,'pass':not missing and all(x['ok'] for x in integrity)}
if args.output:args.output.write_text(json.dumps(result,indent=2))
print(json.dumps(result if not args.output else {k:v for k,v in result.items() if k!='requiredRuntimeFiles'},indent=2))
raise SystemExit(0 if result['pass'] else 1)

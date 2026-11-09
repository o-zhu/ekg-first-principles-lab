from pathlib import Path
import urllib.request, concurrent.futures
base=Path(__file__).parent/'dist'/'vendor'
base.mkdir(parents=True, exist_ok=True)
urls={
 'three.module.js':'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
 'three.core.js':'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.core.js',
 'OrbitControls.js':'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js',
 'GLTFLoader.js':'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/loaders/GLTFLoader.js',
 'BufferGeometryUtils.js':'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/utils/BufferGeometryUtils.js',
 'THREE-LICENSE.txt':'https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE'
}
def fetch(item):
 name,url=item
 data=urllib.request.urlopen(url,timeout=45).read()
 (base/name).write_bytes(data)
 return name,len(data)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 for row in pool.map(fetch,urls.items()): print(*row)
p=base/'GLTFLoader.js'
p.write_text(p.read_text().replace('../utils/BufferGeometryUtils.js','./BufferGeometryUtils.js'))

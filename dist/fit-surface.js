// Fit-viewer adaptation of the user-supplied Cardiac Voltage surface renderer.
// The original Module 1 renderer is unchanged. This version adds a signed
// derivative palette: gold for dVm/dt > 0, cyan for dVm/dt < 0, dark at zero.
// Surface playback is separate from the full computational mesh. Cut faces are
// supplied by the model generator, with Vm interpolated from the volume mesh.
const clamp=x=>Math.max(0,Math.min(1,x));
const palette=[[.07,.18,.25],[.13,.35,.43],[.27,.61,.64],[.62,.85,.69],[1,.84,.48]];
export function mapColor(v){const q=clamp(v)*4,k=Math.min(3,Math.floor(q)),t=q-k;return palette[k].map((x,i)=>x*(1-t)+palette[k+1][i]*t);}
function frontColor(v){const q=Math.sqrt(clamp(Math.abs(v))),base=palette[0],target=v>=0?[1,.84,.48]:[.49,.86,.85];return base.map((x,i)=>x*(1-q)+target[i]*q);}
export function colorCSS(v){return 'rgb('+mapColor(v).map(x=>Math.round(x*255)).join(',')+')';}

function triangles(indices,isCap=false,appendageMask=[]){const out=[];for(let i=0;i<indices.length;i+=3){const a=indices[i],b=indices[i+1],c=indices[i+2];out.push({a,b,c,isCap,isAppendage:!!(appendageMask[a]||appendageMask[b]||appendageMask[c])});}return out;}

// Clip projected triangles at the actual anatomical section plane. Orthographic
// projection is linear, so these intersection positions and Vm weights are exact.
function clipTriangle(points){
  const out=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],insideA=a.cutDistance<=0,insideB=b.cutDistance<=0;
    if(insideA)out.push(a);
    if(insideA!==insideB){const t=a.cutDistance/(a.cutDistance-b.cutDistance);out.push({x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y),z:a.z+t*(b.z-a.z),cutDistance:0,nodeA:a.node,nodeB:b.node,mix:t});}
  }
  return out;
}

export class HeartSurface {
  constructor(data){
    this.data=data;this.canvas=document.createElement('canvas');this.canvas.width=900;this.canvas.height=850;
    this.pos=new Float32Array(data.geometry.positions);this.norm=new Float32Array(data.geometry.normals);this.values=new Float32Array(this.pos.length/3);
    this.appendageMask=new Uint8Array(this.pos.length/3);for(const n of data.appendage?.renderVertexIds||[])this.appendageMask[n]=1;this.showAppendage=true;
    this.surfaceIndices=data.geometry.triangles;this.capIndices=data.geometry.cutTriangles||[];
    this.faces=triangles(this.surfaceIndices,false,this.appendageMask);this.capFaces=triangles(this.capIndices,true,this.appendageMask);
    const capEdges=new Map();
    for(const f of this.capFaces)for(const [a,b]of [[f.a,f.b],[f.b,f.c],[f.c,f.a]]){const key=a<b?`${a}:${b}`:`${b}:${a}`,old=capEdges.get(key);if(old)old.count++;else capEdges.set(key,{a,b,count:1});}
    this.capBoundary=Array.from(capEdges.values()).filter(e=>e.count===1);
    let lower=[Infinity,Infinity,Infinity],upper=[-Infinity,-Infinity,-Infinity];for(let i=0;i<this.pos.length;i++){lower[i%3]=Math.min(lower[i%3],this.pos[i]);upper[i%3]=Math.max(upper[i%3],this.pos[i]);}
    this.center=lower.map((x,i)=>(x+upper[i])/2);this.range=Math.max(...lower.map((x,i)=>upper[i]-x));
    this.cutY=Number.isFinite(data.geometry.cutY)?data.geometry.cutY:this.center[1];
    const suppliedNormal=data.geometry.cutNormal,normalLength=suppliedNormal?Math.hypot(...suppliedNormal):1;
    this.cutNormal=suppliedNormal&&normalLength>1e-12?Array.from(suppliedNormal,v=>v/normalLength):[0,-1,0];
    this.cutOffset=suppliedNormal&&Number.isFinite(data.geometry.cutOffset)?data.geometry.cutOffset/normalLength:-this.cutY;
    const gl=this.canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:false});this.gl=gl;
    if(!gl){this.canvas=document.createElement('canvas');this.software=this.canvas.getContext('2d');return;}
    const vs=`attribute vec3 position;attribute vec3 normal;attribute float value;uniform mat3 rotation;uniform vec3 center;uniform vec2 scale;uniform float isCap;uniform vec3 cutNormal;varying vec3 n;varying float v;varying vec3 p;void main(){p=position;n=rotation*(isCap>.5?cutNormal:normal);v=value;vec3 q=rotation*(position-center);gl_Position=vec4(q.x*scale.x,q.y*scale.y,-q.z/150.0,1.0);}`;
    const fs=`precision highp float;varying vec3 n;varying float v;varying vec3 p;uniform float cut;uniform vec3 cutNormal;uniform float cutOffset;uniform float isCap;uniform float frontMode;vec3 color(float x){if(frontMode>.5){vec3 rest=vec3(.07,.18,.25),target=x>=0.?vec3(1.,.84,.48):vec3(.49,.86,.85);return mix(rest,target,sqrt(clamp(abs(x),0.,1.)));}x=clamp(x,0.0,1.0)*4.0;vec3 a=vec3(.07,.18,.25),b=vec3(.13,.35,.43),c=vec3(.27,.61,.64),d=vec3(.62,.85,.69),e=vec3(1.,.84,.48);if(x<1.)return mix(a,b,x);if(x<2.)return mix(b,c,x-1.);if(x<3.)return mix(c,d,x-2.);return mix(d,e,x-3.);}void main(){if(cut>.5&&isCap<.5&&dot(cutNormal,p)>cutOffset)discard;vec3 N=normalize(n);if(!gl_FrontFacing)N=-N;vec3 L=normalize(vec3(-.45,.8,1.4));float light=.38+.58*max(dot(N,L),0.)+.12*max(dot(N,normalize(vec3(.8,-.2,.3))),0.);float shine=(isCap>.5?.035:.15)*pow(max(dot(reflect(-L,N),vec3(0.,0.,1.)),0.),35.);vec3 base=color(v);gl_FragColor=vec4(base*light+shine,1.);}`;
    const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
    const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));this.program=prog;gl.useProgram(prog);
    this.attributes=Object.fromEntries(['position','normal','value'].map(x=>[x,gl.getAttribLocation(prog,x)]));
    this.uniforms=Object.fromEntries(['rotation','center','scale','cut','cutNormal','cutOffset','isCap','frontMode'].map(x=>[x,gl.getUniformLocation(prog,x)]));
    const uint32=!!gl.getExtension('OES_element_index_uint');
    this.batches=[];
    const buffer=(target,array,usage=gl.STATIC_DRAW)=>{const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,array,usage);return b;};
    const addBatch=(indices,nodes,isCap,use32=false,isAppendage=false)=>{
      const positions=nodes?new Float32Array(nodes.length*3):this.pos,normals=nodes?new Float32Array(nodes.length*3):this.norm;
      if(nodes)for(let k=0;k<nodes.length;k++)for(let j=0;j<3;j++){positions[k*3+j]=this.pos[nodes[k]*3+j];normals[k*3+j]=this.norm[nodes[k]*3+j];}
      const values=new Float32Array(positions.length/3);
      this.batches.push({isCap,isAppendage,nodes,values,count:indices.length,type:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,
        position:buffer(gl.ARRAY_BUFFER,positions),normal:buffer(gl.ARRAY_BUFFER,normals),value:buffer(gl.ARRAY_BUFFER,values,gl.DYNAMIC_DRAW),
        index:buffer(gl.ELEMENT_ARRAY_BUFFER,use32?new Uint32Array(indices):new Uint16Array(indices))});
    };
    const prepare=(indices,isCap,isAppendage=false)=>{
      if(!indices.length)return;let maxIndex=0;for(const i of indices)maxIndex=Math.max(maxIndex,i);
      if(maxIndex<65536||uint32){addBatch(indices,null,isCap,maxIndex>=65536,isAppendage);return;}
      // WebGL 1 devices without the uint32 extension still retain every face.
      // Partition into local 16-bit batches; global node IDs survive for picking.
      let lookup=new Map(),nodes=[],local=[];
      const flush=()=>{if(local.length)addBatch(local,new Uint32Array(nodes),isCap,false,isAppendage);lookup=new Map();nodes=[];local=[];};
      for(let i=0;i<indices.length;i+=3){
        const tri=[indices[i],indices[i+1],indices[i+2]],extra=tri.filter(n=>!lookup.has(n)).length;
        if(nodes.length+extra>65535)flush();
        for(const node of tri){if(!lookup.has(node)){lookup.set(node,nodes.length);nodes.push(node);}local.push(lookup.get(node));}
      }
      flush();
    };
    // Separate only the inferred appendage surface; every voltage sample and
    // the precomputed ECG remain unchanged by this visibility control.
    for(const [faces,isCap] of [[this.faces,false],[this.capFaces,true]])for(const isAppendage of [false,true])prepare(faces.filter(f=>f.isAppendage===isAppendage).flatMap(f=>[f.a,f.b,f.c]),isCap,isAppendage);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);
  }
  orientation(yaw,pitch){
    const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    this.rows=[[c,s,0],[-sp*s,sp*c,cp],[cp*s,-cp*c,sp]];
    return new Float32Array([c,-sp*s,cp*s,s,sp*c,-cp*c,0,cp,sp]);
  }
  render(values,s,w=540,h=470){
    this.showAppendage=s.showAppendage!==false;this.fronts=!!s.fronts;
    this.w=w;this.h=h;this.zoom=s.zoom||1;this.scaleY=2/(this.range*1.15)*this.zoom;this.scaleX=this.scaleY*h/w;
    this.viewKey=[s.yaw||0,s.pitch??.22,this.zoom,w,h,this.fronts].join('|');
    if(this.software)return this.renderSoftware(values,s,w,h);
    if(this.failed)return null;const g=this.gl;g.useProgram(this.program);g.uniform1f(this.uniforms.frontMode,this.fronts?1:0);g.viewport(0,0,this.canvas.width,this.canvas.height);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);
    g.uniformMatrix3fv(this.uniforms.rotation,false,this.orientation(s.yaw||0,s.pitch??.22));g.uniform3fv(this.uniforms.center,new Float32Array(this.center));g.uniform2f(this.uniforms.scale,this.scaleX,this.scaleY);g.uniform1f(this.uniforms.cut,s.cutaway?1:0);g.uniform3fv(this.uniforms.cutNormal,new Float32Array(this.cutNormal));g.uniform1f(this.uniforms.cutOffset,this.cutOffset);
    for(const batch of this.batches){
      if(batch.isCap&&!s.cutaway)continue;
      if(batch.isAppendage&&!this.showAppendage)continue;
      if(batch.nodes){for(let k=0;k<batch.nodes.length;k++)batch.values[k]=values[batch.nodes[k]];}else batch.values.set(values);
      g.bindBuffer(g.ARRAY_BUFFER,batch.value);g.bufferSubData(g.ARRAY_BUFFER,0,batch.values);
      for(const [name,size]of [['position',3],['normal',3],['value',1]]){g.bindBuffer(g.ARRAY_BUFFER,batch[name]);g.vertexAttribPointer(this.attributes[name],size,g.FLOAT,false,0,0);g.enableVertexAttribArray(this.attributes[name]);}
      g.uniform1f(this.uniforms.isCap,batch.isCap?1:0);g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,batch.index);g.drawElements(g.TRIANGLES,batch.count,batch.type,0);
    }
    return this.canvas;
  }
  ensureProjection(){
    if(this.projectedKey!==this.viewKey){this.projected=Array.from({length:this.pos.length/3},(_,i)=>({...this.project(i),node:i}));this.projectedKey=this.viewKey;}
    return this.projected;
  }
  renderSoftware(values,s,w,h){
    const c=this.software,dpr=1.6,W=Math.round(w*dpr),H=Math.round(h*dpr),resized=this.canvas.width!==W||this.canvas.height!==H;
    if(resized){this.canvas.width=W;this.canvas.height=H;}
    const key=this.viewKey+'|'+!!s.cutaway+'|'+this.showAppendage;
    // Playback mutates its array in place. Keep an owned value snapshot so
    // interpolation is never lost through an identity or rounded-time cache.
    if(!resized&&this.softwarePaintKey===key&&this.softwareValues?.length===values.length){let unchanged=true;for(let i=0;i<values.length;i++)if(values[i]!==this.softwareValues[i]){unchanged=false;break;}if(unchanged)return this.canvas;}
    this.orientation(s.yaw||0,s.pitch??.22);this.ensureProjection();
    if(this.projectionKey!==key){
      this.visibleFaces=[];
      for(const f of [...this.faces,...(s.cutaway?this.capFaces:[])]){
        if(f.isAppendage&&!this.showAppendage)continue;
        let vertices=[this.projected[f.a],this.projected[f.b],this.projected[f.c]];
        if(s.cutaway&&!f.isCap)vertices=clipTriangle(vertices);if(vertices.length<3)continue;
        const n=f.isCap?this.cutNormal:[0,1,2].map(k=>(this.norm[f.a*3+k]+this.norm[f.b*3+k]+this.norm[f.c*3+k])/3);
        const q=this.rows.map(row=>row.reduce((v,x,k)=>v+x*n[k],0)),mag=Math.hypot(...q)||1;for(let k=0;k<3;k++)q[k]/=mag;
        if(q[2]<0)for(let k=0;k<3;k++)q[k]*=-1;
        const L=[-.27,.48,.84],light=.38+.58*Math.max(0,q.reduce((v,x,k)=>v+x*L[k],0))+.10*Math.max(0,q[0]*.8-q[1]*.2+q[2]*.3);
        this.visibleFaces.push({vertices,z:vertices.reduce((sum,p)=>sum+p.z,0)/vertices.length,light});
      }
      this.visibleFaces.sort((a,b)=>a.z-b.z);this.projectionKey=key;
    }
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.lineJoin='round';c.lineWidth=.3;
    for(const f of this.visibleFaces){
      const vv=f.vertices.map(p=>p.node===undefined?values[p.nodeA]*(1-p.mix)+values[p.nodeB]*p.mix:values[p.node]);
      const value=vv.reduce((sum,v)=>sum+v,0)/vv.length;
      const col=(this.fronts?frontColor(value):mapColor(value)).map(v=>Math.min(255,Math.round(v*f.light*255)));
      let fill=`rgb(${col.join(',')})`;
      // A linear gradient preserves the barycentric voltage front in the
      // software fallback, including breaks in the shared color scale.
      const low=Math.min(...vv),high=Math.max(...vv);
      if(high-low>.025){
        const [a,b,d]=f.vertices,dx=b.x-a.x,dy=b.y-a.y,ex=d.x-a.x,ey=d.y-a.y,det=dx*ey-dy*ex;
        if(Math.abs(det)>1e-8){const gx=((vv[1]-vv[0])*ey-(vv[2]-vv[0])*dy)/det,gy=((vv[2]-vv[0])*dx-(vv[1]-vv[0])*ex)/det,n=gx*gx+gy*gy;
          if(n>1e-12){const k0=(low-vv[0])/n,k1=(high-vv[0])/n,gradient=c.createLinearGradient(a.x+gx*k0,a.y+gy*k0,a.x+gx*k1,a.y+gy*k1);
            for(const q of [low,...(this.fronts?[-1,-.5,0,.5,1]:[0,.25,.5,.75,1]).filter(q=>q>low&&q<high),high]){const rgb=(this.fronts?frontColor(q):mapColor(q)).map(v=>Math.min(255,Math.round(v*f.light*255)));gradient.addColorStop((q-low)/(high-low),`rgb(${rgb.join(',')})`);}fill=gradient;
          }
        }
      }
      c.beginPath();f.vertices.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=fill;c.stroke();
    }
    if(this.softwareValues?.length!==values.length)this.softwareValues=new Float64Array(values.length);this.softwareValues.set(values);this.softwarePaintKey=key;return this.canvas;
  }
  drawCutBoundary(c,x,y){
    if(!this.rows||this.rows[2].reduce((s,v,i)=>s+v*this.cutNormal[i],0)<.2)return;
    const points=this.ensureProjection();c.save();c.beginPath();
    for(const edge of this.capBoundary){if(!this.showAppendage&&(this.isAppendageNode(edge.a)||this.isAppendageNode(edge.b)))continue;const a=points[edge.a],b=points[edge.b];c.moveTo(x+a.x,y+a.y);c.lineTo(x+b.x,y+b.y);}
    c.strokeStyle='rgba(210,239,222,.30)';c.lineWidth=.7;c.stroke();c.restore();
  }
  project(i){
    const xyz=Array.isArray(i)?i:[this.pos[i*3],this.pos[i*3+1],this.pos[i*3+2]],p=xyz.map((v,k)=>v-this.center[k]),r=this.rows||[[1,0,0],[0,0,1],[0,-1,0]],q=r.map(row=>row.reduce((v,x,k)=>v+x*p[k],0));
    return {x:(.5+q[0]*this.scaleX/2)*this.w,y:(.5-q[1]*this.scaleY/2)*this.h,z:q[2],originalX:xyz[0],originalY:xyz[1],originalZ:xyz[2],cutDistance:this.cutNormal.reduce((sum,n,k)=>sum+n*xyz[k],-this.cutOffset)};
  }
  isCutHidden(point){
    if(typeof point==='number')return this.cutNormal.reduce((sum,n,k)=>sum+n*this.pos[point*3+k],-this.cutOffset)>1e-5;
    if(Number.isFinite(point.cutDistance))return point.cutDistance>1e-5;
    const xyz=Array.isArray(point)||ArrayBuffer.isView(point)?point:('originalX'in point?[point.originalX,point.originalY,point.originalZ]:[point.x,point.y,point.z]);
    return this.cutNormal.reduce((sum,n,k)=>sum+n*xyz[k],-this.cutOffset)>1e-5;
  }
  isAppendageNode(node){return !!this.appendageMask[node];}
  pick(x,y,cutaway=false,showAppendage=this.showAppendage){
    const points=this.ensureProjection();let best=null,front=-Infinity;
    for(const f of [...this.faces,...(cutaway?this.capFaces:[])]){
      if(f.isAppendage&&!showAppendage)continue;
      const a=points[f.a],b=points[f.b],c=points[f.c];
      if(x<Math.min(a.x,b.x,c.x)||x>Math.max(a.x,b.x,c.x)||y<Math.min(a.y,b.y,c.y)||y>Math.max(a.y,b.y,c.y))continue;
      const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-9)continue;
      const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,w=1-u-v;
      if(u<-.00001||v<-.00001||w<-.00001)continue;
      if(cutaway&&!f.isCap&&u*a.cutDistance+v*b.cutDistance+w*c.cutDistance>1e-5)continue;
      const depth=u*a.z+v*b.z+w*c.z;if(depth<=front)continue;
      const candidates=[a,b,c].filter(p=>!cutaway||f.isCap||!this.isCutHidden(p));
      if(!candidates.length)continue;
      best=candidates.reduce((near,p)=>(p.x-x)**2+(p.y-y)**2<(near.x-x)**2+(near.y-y)**2?p:near).node;front=depth;
    }
    return best;
  }
}

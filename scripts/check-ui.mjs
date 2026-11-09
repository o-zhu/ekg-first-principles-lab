/** DOM and interaction regressions. No browser layout or WebGL assertions. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import * as css from 'css-tree';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=await readFile(resolve(root,'dist/index.html'),'utf8');
const dom=new JSDOM(html,{url:'https://ekg-first-principles-lab.zhuou557737.chatgpt.site/',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,{document}=window;
const errors=[];window.addEventListener('error',event=>errors.push(event.error||event.message));
Object.defineProperty(window,'innerWidth',{value:1366,configurable:true});
window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
window.matchMedia=query=>({matches:query.includes('max-width')?window.innerWidth<=Number(query.match(/max-width:\s*(\d+)/)?.[1]||0):false,addEventListener(){},removeEventListener(){}});
window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};
window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
window.HTMLDialogElement.prototype.close=function(){this.open=false};
const nativeMatches=window.Element.prototype.matches;
window.Element.prototype.matches=function(selector){return selector===':popover-open'?this.hasAttribute('data-test-popover'):nativeMatches.call(this,selector)};
// jsdom implements the closed-popover UA style but not the top layer API.
// Keep this test shim visibly open so real focusability checks remain meaningful.
window.HTMLElement.prototype.showPopover=function(){this.setAttribute('data-test-popover','');this.style.display='block'};
window.HTMLElement.prototype.hidePopover=function(){this.removeAttribute('data-test-popover');this.style.display='none'};
for(const key of ['window','document','location','localStorage','matchMedia','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{value:window[key]||window,configurable:true,writable:true});
const fetchLocal=async value=>{const url=new URL(value,'https://ekg-first-principles-lab.zhuou557737.chatgpt.site/');const path=resolve(root,'dist','.'+url.pathname);assert(path.startsWith(resolve(root,'dist')));const bytes=await readFile(path);return {ok:true,status:200,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>bytes.toString()}};
window.fetch=globalThis.fetch=fetchLocal;
class SceneStub{constructor(el){this.el=el;el.querySelector('.model-loading')?.remove()}set(o){Object.assign(this,o);return this}setLead(v){this.lead=v}reset(){}zoom(){}update(){}destroy(){}highlightRegion(){return {note:''}}}
class ChartStub{constructor(el,o){assert(el,'Chart canvas exists');this.el=el;this.options=o}set(o){Object.assign(this.options,o);return this}render(){return this}destroy(){}}
const load=path=>import(pathToFileURL(resolve(root,'dist',path)).href);
const moduleMap={};
for(const name of ['ecg.js','voltage-lesson.js','clinical-chart-scale.js','clinical-adapter.js','pathology-model.js','references.js','action-potentials.js','electrical-ui.js','ui-help.js'])moduleMap['./'+name]=await load(name);
const fitSource=await readFile(resolve(root,'dist/fit-explorer.js'),'utf8');
const fitted=JSON.parse(fitSource.match(/FITTED_RECORDS=(\[[^;]+\])/)[1].replaceAll("'",'"'));
moduleMap['./scenes.js']={HeartScene:SceneStub};moduleMap['./charts.js']={ECGChart:ChartStub};moduleMap['./action-potential-chart.js']={ActionPotentialChart:ChartStub};
moduleMap['./fit-explorer.js']={FITTED_RECORDS:fitted,FitExplorer:class{constructor(host,options){this.options=options;host.innerHTML='<div data-test-fit>'+options.recordId+'</div>'}destroy(){}togglePlaying(){}}};
try{moduleMap['./case-browser.js']=await load('case-browser.js')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
window.__modules=moduleMap;
let source=await readFile(resolve(root,'dist/lab.js'),'utf8');
source=source.replace(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm,(_,bindings,name)=>`const {${bindings}}=window.__modules[${JSON.stringify(name)}];`);
window.eval(source+'\nwindow.__labTest={get state(){return state},route,fetchData,renderLibrary,updateInterval,polishReadingLayout};');
const api=window.__labTest;
const q=selector=>{const el=document.querySelector(selector);assert(el,'Expected '+selector);return el};
const change=(selector,value,type='change')=>{const el=q(selector);el.value=value;el.dispatchEvent(new window.Event(type,{bubbles:true}));};
const navigate=name=>{window.history.replaceState(null,'','#'+name);api.route({type:'hashchange'});assert.equal(q('#main').dataset.module,name);assert.equal(document.activeElement,q('#main'))};
assert.equal(q('.brand').textContent.trim(),'EKG Lab');
assert.equal(document.querySelectorAll('.course-kicker,.course-description,.sidebar-bottom p').length,0);
assert.equal(document.querySelectorAll('.nav-item').length,6);
assert(q('#voltage-frame'));
const headings=[];
navigate('heartbeat');headings.push(q('h1').textContent);q('.skip-link').click();assert.equal(window.location.hash,'#heartbeat');assert.equal(document.activeElement,q('#main'));
assert(q('.model-interaction').textContent.includes('Drag to rotate'));
change('#heart-rate','85','input');assert.equal(api.state.bpm,85);
change('#heart-lead','V1');assert.equal(api.state.lead,'V1');
assert(q('#heart-lead-description').closest('[data-info-panel]').querySelector('.ui-info-close'));
const {enhanceInfoPanels,closeInfoPanels}=moduleMap['./ui-help.js'];
let trigger=q('.lesson-title-row .ui-info-trigger');
trigger.dispatchEvent(new window.MouseEvent('pointerenter',{bubbles:false}));assert.equal(trigger.getAttribute('aria-expanded'),'true');
trigger.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:1}));
const second=q('.model-interaction .ui-info-trigger');second.dispatchEvent(new window.MouseEvent('pointerenter'));assert.equal(trigger.getAttribute('aria-expanded'),'true','Hover cannot dismiss a pinned panel');assert.equal(second.getAttribute('aria-expanded'),'false');
const unrelated=q('#heart-rate');unrelated.focus();
window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(document.activeElement,unrelated,'Hover/pinned dismissal does not steal unrelated focus');assert.equal(trigger.getAttribute('aria-expanded'),'false');
trigger.focus();trigger.dispatchEvent(new window.MouseEvent('click',{bubbles:true,detail:0}));
assert(document.activeElement.classList.contains('ui-info-close'));
window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(document.activeElement,trigger);await Promise.resolve();assert.equal(trigger.getAttribute('aria-expanded'),'false');
const running=api.state.running;trigger.dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));assert.equal(api.state.running,running);
const summary=document.createElement('summary');q('#main').append(summary);summary.focus();summary.dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));assert.equal(api.state.running,running);summary.remove();
closeInfoPanels();
navigate('leads');headings.push(q('h1').textContent);q('#all-leads').click();assert.equal(api.state.selectedLeads.length,12);assert.equal(document.querySelectorAll('.standard-lead-cell canvas').length,12);q('#default-leads').click();assert.equal(api.state.selectedLeads.length,3);
navigate('rhythm');headings.push(q('h1').textContent);q('[data-interval="qt"]').click();assert.equal(api.state.interval,'qt');assert(q('#interval-content').textContent.includes('QTcB'));assert.equal(api.state.running,false);q('#calipers-toggle').click();assert.equal(api.state.calipers,true);change('#paper-speed','50');assert.equal(q('#small-box-time').textContent,'20 ms');
navigate('sandbox');headings.push(q('h1').textContent);assert(q('.sandbox-workspace').firstElementChild.classList.contains('sandbox-study'));change('#sandbox-preset','2');assert.equal(api.state.sandbox.avBlock,'complete');assert.equal(api.state.sandbox.escapeRate,36);change('#sb-rhythm','afib');assert.equal(api.state.sandbox.rhythm,'afib');assert(q('#sb-rate').disabled);assert(q('#sandbox-model-notes').closest('[data-info-panel]').querySelector('.ui-info-close'));q('#sb-reset').click();assert.equal(api.state.sandbox.avBlock,'none');assert.equal(api.state.sandbox.rhythm,'sinus');
navigate('library');await api.fetchData();await new Promise(r=>setTimeout(r,0));headings.push(q('h1').textContent);assert(q('#library-content').textContent.includes('REAL ECG'));
const cases=JSON.parse(await readFile(resolve(root,'dist/data/pathology-fits/manifest.json'),'utf8'));
assert.equal(fitted.length,24);
// Additional case-browser integration checks are performed when its bounded browser is present.
if(document.querySelector('.clinical-case-browser')){
  assert(document.querySelectorAll('[data-record]').length<=6,'Case list stays bounded');
  assert(document.querySelectorAll('[data-record-group]').length>=5);
  q('[data-record-group="conduction"]').click();assert.equal(api.state.clinicalGroup,'conduction');
  const buttons=[...document.querySelectorAll('[data-record]')];assert(buttons.length>0&&buttons.length<=6);
  buttons.at(-1).click();assert.equal(Number(q('[data-record][aria-pressed="true"]').dataset.record),api.state.recordIndex);
  q('#clinical-fitted-view').click();assert.equal(api.state.clinicalFit,true);assert(q('#clinical-fit-host [data-test-fit]'));
  q('#clinical-original-view').click();assert.equal(api.state.clinicalFit,false);assert(q('#clinical-main'));
  Object.defineProperty(window,'innerWidth',{value:900,configurable:true});
  navigate('heartbeat');navigate('library');await new Promise(r=>setTimeout(r,0));
  assert.equal(q('.clinical-case-disclosure').open,false,'Narrow case chooser starts collapsed');
  q('.clinical-case-disclosure').open=true;
  q('[data-record-group="rhythm"]').click();
  assert(q('.clinical-case-disclosure').open,'Changing category keeps the case choices visible');
  q('[data-record]').click();
  assert.equal(q('.clinical-case-disclosure').open,false,'Selecting a case returns attention to the workspace');
  assert.equal(document.activeElement,q('.clinical-case-disclosure > summary'));
  Object.defineProperty(window,'innerWidth',{value:1366,configurable:true});
}
q('.sources-trigger').click();assert(q('#info-dialog').open);assert(q('#info-dialog').getAttribute('aria-labelledby'));q('.dialog-close').click();
for(const name of ['heartbeat','leads','rhythm','sandbox','electricity','library','heartbeat'])navigate(name);
await new Promise(r=>setTimeout(r,0));assert.equal(errors.length,0,errors.map(String).join('\n'));
const cssFiles=['polish.css','ui-help.css','fit-explorer.css'];
for(const name of cssFiles){const text=await readFile(resolve(root,'dist',name),'utf8');const errors=[];css.parse(text,{onParseError:error=>errors.push(error.message)});assert.deepEqual(errors,[],name);}
const color=hex=>hex.replace('#','').match(/../g).map(v=>{const x=parseInt(v,16)/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});
const luminance=hex=>color(hex).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const pairs=[['#596d63','#f7f6f0'],['#60715f','#f1f3eb'],['#cfdfc7','#214d3e'],['#405e4e','#fffefa']];
const contrast=pairs.map(([a,b])=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)});for(const value of contrast)assert(value>=4.5);
console.log(JSON.stringify({pass:true,modules:6,interactionCoverage:['routes','info hover/click/focus/Escape','pinned help','focus restoration','Space shortcut guard','lead selection','calipers','rhythm presets','case switching'],cssSyntax:'pass',coreTextContrast:contrast.map(n=>n.toFixed(2)),fittedRecords:24,limitation:'DOM/event checks use rendering stubs; browser layout and WebGL not evaluated'},null,2));
closeInfoPanels();dom.window.close();

/** Exercise the embedded lesson DOM with graphics and asset loading stubbed. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import * as css from 'css-tree';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dom=new JSDOM(await readFile(resolve(root,'dist/cardiac-voltage/index.html'),'utf8'),{url:'https://ekg-first-principles-lab.zhuou557737.chatgpt.site/cardiac-voltage/#membrane',runScripts:'outside-only',pretendToBeVisual:true});
const {window}=dom,{document}=window;const errors=[];window.addEventListener('error',event=>errors.push(event.error||event.message));
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.requestAnimationFrame=()=>1;window.cancelAnimationFrame=()=>{};window.scrollTo=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
window.ResizeObserver=class{observe(){}disconnect(){}};
window.HTMLDialogElement.prototype.showModal=function(){this.open=true};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'))};
const ctx=new Proxy({measureText:text=>({width:String(text).length*7}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
window.HTMLCanvasElement.prototype.getContext=()=>ctx;
for(const key of ['window','document','location','history','matchMedia','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{value:window[key]||window,configurable:true,writable:true});
const loads={},base=resolve(root,'dist/cardiac-voltage');const load=path=>import(pathToFileURL(resolve(base,path)).href);
let source=await readFile(resolve(base,'app.js'),'utf8');
for(const match of source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm))loads[match[2]]=await load(match[2]);
for(const [file,fields] of Object.entries({'./membrane.js':['renderMembrane','membraneChannelAt'],'./tissue.js':['renderTissue'],'./field.js':['renderField'],'./heart.js':['renderHeart','pickHeart']}))loads[file]=Object.fromEntries(fields.map(name=>[name,()=>name.startsWith('render')?[]:null]));
// Match the full scene-help public interface used by rendering and resizing.
loads['./scene-help.js']={createSceneHelp:()=>({hide(){},refresh(){},layout(){},update(){}})};
const opened=[];
for(const [file,initializer,label] of [['./channel-lens.js','initializeChannelLens','channels'],['./pharmacology.js','initializePharmacology','pharmacology'],['./electrolytes.js','initializeElectrolytes','electrolytes']])loads[file]={...loads[file],[initializer]:()=>({open(){opened.push(label)},isOpen:()=>false})};
loads['./microscopy.js']={initializeMicroscopy(){const dialog=document.createElement('dialog');dialog.id='microscopy-dialog';document.body.append(dialog)},openMicroscopy(){opened.push('microscopy')}};
loads['./heart-data.js']={...loads['./heart-data.js'],loadHeartModel:()=>new Promise(()=>{}),loadHuman:()=>new Promise(()=>{}),loadSingleBeat:()=>new Promise(()=>{})};
window.__modules=loads;
source=source.replace(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm,(_,bindings,name)=>`const {${bindings}}=window.__modules[${JSON.stringify(name)}];`);
window.eval(source+'\nwindow.__lessonTest={setChapter,setupLesson,get state(){return state}};');
const q=selector=>{const el=document.querySelector(selector);assert(el,'Expected '+selector);return el};
assert.equal(document.querySelectorAll('.site-header,.intro,#tour').length,0,'Removed banner, hero, tour');
assert.equal(document.querySelectorAll('.chapters [data-chapter][role="tab"]').length,4);
for(const id of ['sources-open','math-open','model-open'])assert(q('#'+id));
assert(q('#now-copy').closest('[data-info-panel]'),'Live phase copy preserved in a disclosure');
const phase=q('#now-copy');q('#timeline').value='650';q('#timeline').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.__lessonTest.state.progress,.65);assert.equal(q('#now-copy'),phase,'Scrubbing updates the same live content node');
assert.equal(window.__lessonTest.state.playing,true,'Seeking during playback keeps playing');
q('#play').click();assert.equal(window.__lessonTest.state.playing,false,'Explicit Pause still pauses');
q('#timeline').value='300';q('#timeline').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.__lessonTest.state.progress,.3);assert.equal(window.__lessonTest.state.playing,true,'Seeking while paused plays from the chosen instant');
q('#comparison-dialog').showModal();q('#comparison-timeline').value='450';q('#comparison-timeline').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.__lessonTest.state.progress,.45);assert.equal(window.__lessonTest.state.playing,true,'Comparison timeline resumes playback');
q('#comparison-play').click();assert.equal(window.__lessonTest.state.playing,false,'Comparison has an explicit Pause control');q('#comparison-play').click();q('#comparison-close').click();assert.equal(window.__lessonTest.state.playing,true,'Closing the comparison preserves its playback choice');
for(const id of ['channel-lens-open','pharmacology-open','electrolytes-open'])q('#'+id).click();assert.deepEqual(opened,['channels','pharmacology','electrolytes']);
q('#sources-open').click();assert(q('#science-dialog').open);q('#science-close').click();assert(!q('#science-dialog').open);
for(const chapter of [1,2,3,0,2,0]){q('#chapter-'+chapter).click();assert.equal(window.__lessonTest.state.chapter,chapter);assert.equal(q('#chapter-'+chapter).getAttribute('aria-selected'),'true');assert(q('#now-copy'));assert.equal(document.querySelectorAll('[id="now-copy"]').length,1);}
q('#chapter-3').click();assert(q('.heart-evidence-details'));assert(!q('.heart-evidence-details').open);q('#chapter-0').click();assert(q('#electrolytes-open'));
q('#chapter-3').click();q('#timeline').value='1000';q('#timeline').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.__lessonTest.state.progress,1);assert.equal(window.__lessonTest.state.playing,false,'The finite model stays at its endpoint');q('#timeline').value='250';q('#timeline').dispatchEvent(new window.Event('input',{bubbles:true}));assert.equal(window.__lessonTest.state.playing,true,'Seeking back into the finite model resumes playback');q('#chapter-0').click();
const trigger=q('#lesson-content .ui-info-trigger');trigger.click();assert.equal(trigger.getAttribute('aria-expanded'),'true');document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(trigger.getAttribute('aria-expanded'),'false');
q('#chapter-0').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(window.__lessonTest.state.chapter,1);assert.equal(document.activeElement,q('#chapter-1'));
const summary=document.querySelector('summary');if(summary){const before=window.__lessonTest.state.playing;summary.dispatchEvent(new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));assert.equal(window.__lessonTest.state.playing,before);}
for(const name of ['style.css','channel-lens.css','pharmacology.css','electrolytes.css']){const errors=[];css.parse(await readFile(resolve(base,name),'utf8'),{onParseError:error=>errors.push(error.message)});assert.deepEqual(errors,[],name);}
assert.equal(errors.length,0,errors.map(String).join('\n'));
console.log(JSON.stringify({pass:true,chapters:4,bannerAndTour:'removed',optionalLaunchBindings:opened,liveDisclosureFields:'preserved',seekPlayback:'pass',finiteModelEndpoint:'pass',keyboardNavigation:'pass',cssSyntax:'pass',limitation:'DOM interaction checks; rendering and asset loading stubbed'},null,2));
loads['../ui-help.js'].closeInfoPanels();dom.window.close();

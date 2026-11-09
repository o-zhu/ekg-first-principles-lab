/** Compact, category-first case navigation. Original record indices are preserved. */
const PAGE_SIZE=6;
const GROUPS=[['rhythm','Rhythm & rate'],['tachyarrhythmia','Tachyarrhythmias'],['conduction','Conduction'],['structure','Chambers & axis'],['ischemia','Ischemia']];
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const label=record=>record.title||record.name||record.profile?.name||record.id;
const normalizeGroup=(items,group,recordIndex)=>GROUPS.some(([key])=>key===group)&&items.some(item=>item.group===group)?group:items.find(item=>item.index===recordIndex)?.group||items[0]?.group||'rhythm';

function listMarkup(items,group,recordIndex,page){
  const matches=items.filter(item=>item.group===group),pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));
  const current=Math.max(0,Math.min(pages-1,page)),start=current*PAGE_SIZE,visible=matches.slice(start,start+PAGE_SIZE);
  return `<div class="clinical-case-list" aria-label="Cases in this category">${visible.map(item=>`<button type="button" class="clinical-case-button${item.index===recordIndex?' active':''}" data-record="${item.index}" aria-pressed="${item.index===recordIndex}"><span class="clinical-case-number">${String(item.index+1).padStart(2,'0')}</span><span class="clinical-case-name">${escape(item.name)}</span><span class="clinical-case-source">${escape(item.source)}</span></button>`).join('')||'<p class="clinical-case-empty">No cases in this category.</p>'}</div><div class="clinical-case-pagination"><button type="button" data-case-page="previous" aria-label="Previous page of cases"${current===0?' disabled':''}>←</button><span role="status" aria-live="polite">${matches.length?`${start+1}–${Math.min(start+PAGE_SIZE,matches.length)} of ${matches.length}`:'0 cases'}</span><button type="button" data-case-page="next" aria-label="Next page of cases"${current>=pages-1?' disabled':''}>→</button></div>`;
}

export function renderCaseBrowser(records,{recordIndex=0,group='rhythm'}={}){
  const items=records.map((record,index)=>({index,group:record.group||'rhythm',name:label(record),source:record.sourceLabel||record.id}));
  group=normalizeGroup(items,group,recordIndex);
  const position=items.filter(item=>item.group===group).findIndex(item=>item.index===recordIndex),page=Math.max(0,Math.floor(position/PAGE_SIZE));
  return `<aside class="clinical-case-browser" aria-label="Clinical case browser" data-case-items="${escape(JSON.stringify(items))}" data-case-group="${escape(group)}" data-case-selected="${recordIndex}" data-case-current-page="${page}"><div class="clinical-case-browser-heading"><h3>Choose a case</h3><span>${items.length} examples</span></div><details class="clinical-case-disclosure" open><summary><span class="clinical-case-summary-label">Change case</span><strong>${escape(items.find(item=>item.index===recordIndex)?.name||'Choose a case')}</strong><span class="clinical-case-disclosure-arrow" aria-hidden="true">⌄</span></summary><div class="clinical-case-browser-body"><div class="clinical-case-groups" role="group" aria-label="Case category">${GROUPS.map(([key,name])=>{const count=items.filter(item=>item.group===key).length;return `<button type="button" data-record-group="${key}" aria-pressed="${key===group}"${count?'':' disabled'}><span>${name}</span><span class="clinical-case-count">${count}</span></button>`;}).join('')}</div><div class="clinical-case-results">${listMarkup(items,group,recordIndex,page)}</div></div></details></aside>`;
}

export function bindCaseBrowser(root,{onSelect,onGroup}={}){
  const browser=root.matches?.('.clinical-case-browser')?root:root.querySelector('.clinical-case-browser');
  if(!browser)return()=>{};
  browser._caseBrowserCleanup?.();
  const items=JSON.parse(browser.dataset.caseItems||'[]');
  const disclosure=browser.querySelector('.clinical-case-disclosure');
  const narrow=window.matchMedia('(max-width: 1199px)');
  const syncDisclosure=()=>{disclosure.open=!narrow.matches;};
  syncDisclosure();narrow.addEventListener?.('change',syncDisclosure);
  const listener=event=>{
    const button=event.target.closest('button');if(!button||!browser.contains(button)||button.disabled)return;
    if(button.hasAttribute('data-record')){onSelect?.(Number(button.dataset.record));return;}
    if(button.hasAttribute('data-record-group')){onGroup?.(button.dataset.recordGroup);return;}
    if(!button.hasAttribute('data-case-page'))return;
    const direction=button.dataset.casePage,group=browser.dataset.caseGroup,matches=items.filter(item=>item.group===group),pages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));
    const page=Math.max(0,Math.min(pages-1,Number(browser.dataset.caseCurrentPage)+(direction==='next'?1:-1)));
    browser.dataset.caseCurrentPage=String(page);
    browser.querySelector('.clinical-case-results').innerHTML=listMarkup(items,group,Number(browser.dataset.caseSelected),page);
    const nextFocus=browser.querySelector(`[data-case-page="${direction}"]:not(:disabled)`)||browser.querySelector('.clinical-case-list button');
    nextFocus?.focus({preventScroll:true});
  };
  browser.addEventListener('click',listener);
  const cleanup=()=>{browser.removeEventListener('click',listener);narrow.removeEventListener?.('change',syncDisclosure);delete browser._caseBrowserCleanup;};
  browser._caseBrowserCleanup=cleanup;return cleanup;
}

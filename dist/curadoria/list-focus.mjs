const STORAGE_PREFIX='curadoria-list-focus:v1:';
const PULSE_CLASS='curation-focus-pulse';
const MAX_AGE_MS=30*60*1000;
const CONTROL_SELECTORS={
  glimpse:'[data-open-manager-glimpse],[data-open-top-glimpse]',
  trends:'[data-open-manager-trends],[data-open-top-trends]',
  images:'[data-open-manager-images],[data-open-top-images]',
  decision:'[data-open-manager-decision],[data-open-top-decision]'
};
const FOCUSABLE_SELECTOR=`[data-curation-focus],${Object.values(CONTROL_SELECTORS).join(',')}`;

function controlKind(element){
  if(element.dataset.curationFocus)return element.dataset.curationFocus;
  return Object.entries(CONTROL_SELECTORS).find(([,selector])=>element.matches(selector))?.[0]||'';
}

function pulse(element){
  if(!element)return;
  element.classList.remove(PULSE_CLASS);
  void element.offsetWidth;
  element.classList.add(PULSE_CLASS);
}

function readFocus(key){
  try{
    const value=JSON.parse(sessionStorage.getItem(key)||'null');
    if(!value||Date.now()-value.capturedAt>MAX_AGE_MS){sessionStorage.removeItem(key);return null}
    return value;
  }catch{return null}
}

export function mountCurationListFocus(scope,{blockingSelector='',highlightOnCapture=true}={}){
  const key=`${STORAGE_PREFIX}${scope}`;
  const listScroll=document.querySelector('.tablewrap');
  if(listScroll)listScroll.dataset.curationListScroll='';
  const restore=()=>restoreCurationListFocus(scope,{blockingSelector});
  document.addEventListener('click',event=>{
    const control=event.target?.closest?.(FOCUSABLE_SELECTOR);
    const row=control?.closest?.('[data-product],[data-offer]');
    if(!control||!row)return;
    const kind=controlKind(control);
    if(!kind)return;
    control.dataset.curationFocus=kind;
    const rowAttribute=row.hasAttribute('data-product')?'data-product':'data-offer';
    const listScroll=document.querySelector('[data-curation-list-scroll]');
    const focusState={rowAttribute,rowKey:row.getAttribute(rowAttribute),control:kind,scrollX:window.scrollX,scrollY:window.scrollY,listScroll:listScroll?{left:listScroll.scrollLeft,top:listScroll.scrollTop}:null,capturedAt:Date.now()};
    try{sessionStorage.setItem(key,JSON.stringify(focusState))}catch{}
    if(highlightOnCapture){
      pulse(row);
      pulse(control);
    }
  },true);
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#closeSheet, #managerFinishImages, #topFinishImages'))queueMicrotask(restore);
  },true);
  window.addEventListener('pageshow',restore);
  const rows=document.querySelector('#rows');
  if(rows&&typeof MutationObserver==='function')new MutationObserver(()=>queueMicrotask(restore)).observe(rows,{childList:true});
  return{restore};
}

export function restoreCurationListFocus(scope,{blockingSelector=''}={}){
  const key=`${STORAGE_PREFIX}${scope}`,state=readFocus(key);
  if(!state)return false;
  if(blockingSelector&&document.querySelector(blockingSelector))return false;
  const row=[...document.querySelectorAll('[data-product],[data-offer]')].find(element=>element.getAttribute(state.rowAttribute)===state.rowKey);
  if(!row)return false;
  window.scrollTo(state.scrollX||0,state.scrollY||0);
  const listScroll=document.querySelector('[data-curation-list-scroll]');
  if(listScroll&&state.listScroll){listScroll.scrollLeft=state.listScroll.left||0;listScroll.scrollTop=state.listScroll.top||0}
  pulse(row);
  const control=[...row.querySelectorAll(FOCUSABLE_SELECTOR)].find(element=>controlKind(element)===state.control);
  if(control)control.dataset.curationFocus=state.control;
  pulse(control);
  try{sessionStorage.removeItem(key)}catch{}
  return true;
}

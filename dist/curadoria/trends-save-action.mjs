import {RESULT_TYPES} from './trends-domain.mjs';

const countries = (values,limit=5) => [...new Set(values || [])].slice(0,limit).sort();
export function sameTrendAssessment(previous, draft, maxCountries=5) {
  return Boolean(previous) && previous.status === draft.status
    && previous.searchTerm === draft.term
    && (previous.productAge || '') === (draft.productAge || '')
    && (!Object.hasOwn(draft,'demandConcentrated') || Boolean(previous.demandConcentrated) === draft.demandConcentrated)
    && JSON.stringify(countries(previous.countries || [previous.country].filter(Boolean),maxCountries)) === JSON.stringify(countries(draft.countries,maxCountries));
}
export function trendPageState(record, previous) {
  return record?.pageDraft ? {...previous,...record.pageDraft,searchTerm:record.pageDraft.term} : previous;
}
export function showTrendsSaveFeedback(button, message, state = '') {
  const doc=button?.ownerDocument;if(!doc||!button.before)return;
  let node=button.parentElement?.querySelector('.trends-save-feedback');
  if(!node){node=doc.createElement('span');node.className='trends-save-feedback';node.setAttribute('role','status');node.setAttribute('aria-live','polite');button.before(node);}
  node.textContent=message;node.dataset.state=state;
}
// Preserve live fields through platform refreshes, without accessing storage.
const attributeValue=(node,attr)=>node.getAttribute(attr)??node.dataset?.[attr.replace(/^data-/,'').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())];
function captureEditor(scope) {
  if(!scope?.querySelectorAll)return null;
  const fields=[...scope.querySelectorAll('input[id],textarea[id]')].map(node=>({id:node.id,value:node.value,checked:node.checked}));
  const selections=['data-country','data-trend-country','data-manager-trends-country','data-trends-product-age','data-trends-result'].map(attr=>({attr,values:[...scope.querySelectorAll('['+attr+'].selected')].map(node=>attributeValue(node,attr))}));
  return {fields,selections};
}
function restoreEditor(scope,snapshot) {
  if(!snapshot)return;
  for(const field of snapshot.fields){const node=scope.querySelector('#'+field.id);if(node){node.value=field.value;node.checked=field.checked;}}
  for(const {attr,values} of snapshot.selections)for(const node of scope.querySelectorAll('['+attr+']')){
    const selected=values.includes(attributeValue(node,attr));node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));
  }
}
export function mountTrendsSaveAction({button,getContext,persist,feedback,scope=null,disableWhenClean=false,maxCountries=5,
  watch='input[id],textarea[id]',clickWatch='[data-country],[data-trend-country],[data-manager-trends-country],[data-trends-product-age]',
  autoSave=false,autosaveDelay=450,keepFeedbackAcrossTabs=false,
  isUnchanged=({previous,draft})=>sameTrendAssessment(previous,draft,maxCountries)}) {
  let busy=false,runner=null,liveEditor=null,inFlight=null,feedbackContext='',editorIdentity='',dirty=false,lastSaveFailed=false;
  let autosaveTimer=null,pendingAutoContext=null;
  const queue=new Map(),savedSignatures=new Map(),selectedStatuses=new Map();
  const signature=context=>JSON.stringify({...context.draft,countries:countries(context.draft.countries,maxCountries)});
  const operationSignature=context=>`${signature(context)}|assessment:${Boolean(context.commitAssessment)}`;
  const currentKey=()=>getContext()?.offerKey;
  const currentFor=context=>{const current=getContext();return current?.offerKey===context.offerKey&&(current.tab==='trends'||keepFeedbackAcrossTabs);};
  function sync() {
    const context=getContext(),identity=context?.offerKey||'';
    if(context?.offerKey!==editorIdentity){selectedStatuses.clear();liveEditor=null;dirty=false;lastSaveFailed=false;editorIdentity=context?.offerKey;}
    if(identity!==feedbackContext){showTrendsSaveFeedback(button,'');feedbackContext=identity;}
    if(context?.tab==='trends'){
      button.disabled=busy||(disableWhenClean&&!dirty&&!lastSaveFailed);
      if(dirty&&!busy&&!lastSaveFailed){
        const message=autoSave&&autosaveTimer?'Salvando automaticamente…':'Alterações pendentes — clique em Salvar.';
        showTrendsSaveFeedback(button,message,autoSave?'saving':'pending');
      }
    }else if(!keepFeedbackAcrossTabs||!identity)showTrendsSaveFeedback(button,'');
    for(const node of scope?.querySelectorAll?.('[data-trends-result]')||[])node.disabled=busy;
    for(const node of scope?.querySelectorAll?.('button,input,textarea,select')||[]){
      if(node.dataset?.trendsResult||node.matches?.(watch)||node.matches?.(clickWatch))continue;
      if(busy&&node.dataset&&!Object.hasOwn(node.dataset,'trendsLocked')){node.dataset.trendsLocked=String(node.disabled);node.disabled=true;}
      else if(!busy&&node.dataset&&Object.hasOwn(node.dataset,'trendsLocked')){node.disabled=node.dataset.trendsLocked==='true';delete node.dataset.trendsLocked;}
    }
  }
  function announce(message,state='') {
    feedback?.(message);showTrendsSaveFeedback(button,state==='saved'?'Salvo':message,state);
  }
  function snapshot(status,commitAssessment=false) {
    const context=getContext();if(context?.tab!=='trends'||!context.offerKey)return null;
    if(status)selectedStatuses.set(context.offerKey,status);
    const draft={...context.draft,countries:[...(context.draft.countries||[])]};
    draft.status=selectedStatuses.get(context.offerKey)||draft.status||'';
    return {...context,draft,commitAssessment};
  }
  async function drain() {
    lastSaveFailed=false;busy=true;if(button.dataset)button.dataset.trendsSaving='true';sync();
    let success=true;
    try{
      while(queue.size){
        const context=queue.values().next().value;queue.delete(context.offerKey);inFlight=context;
        const {offerKey,draft}=context,key=operationSignature(context),persistStatus=autoSave&&!context.commitAssessment?'':draft.status;
        const isCurrent=()=>currentFor(context),savedKey=savedSignatures.get(offerKey);
        if(savedKey===key||(savedKey===undefined&&isUnchanged(context))){
          savedSignatures.set(offerKey,key);if(isCurrent()){dirty=false;announce('Salvo.','saved');}continue;
        }
        if(!autoSave&&!scope&&!Object.values(RESULT_TYPES).includes(draft.status)){
          if(isCurrent())announce('Selecione um resultado da análise antes de salvar.');success=false;continue;
        }
        const editor=liveEditor?.offerKey===offerKey?liveEditor.snapshot:captureEditor(scope);
        if(isCurrent())announce('Salvando…','saving');
        try{
          const {status,...payload}=draft;
          if(await persist(offerKey,persistStatus,payload)!==true)throw new Error('Save was not confirmed');
          savedSignatures.set(offerKey,key);
          if(isCurrent()){
            lastSaveFailed=false;
            restoreEditor(scope,liveEditor?.offerKey===offerKey?liveEditor.snapshot:editor);
            if(context.commitAssessment)for(const node of scope?.querySelectorAll?.('[data-trends-result]')||[]){
              const selected=node.dataset.trendsResult===(queue.get(offerKey)?.draft.status||draft.status);
              node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));
            }
            const current=snapshot();
            dirty=Boolean(current&&signature(current)!==signature(context));
            if(dirty)announce(autoSave?'Salvando automaticamente…':'Alterações pendentes — clique em Salvar.',autoSave?'saving':'pending');
            else if(!queue.has(offerKey))announce('Salvo.','saved');
          }
        }catch{
          success=false;if(isCurrent()){dirty=true;lastSaveFailed=true;restoreEditor(scope,liveEditor?.offerKey===offerKey?liveEditor.snapshot:editor);announce('Não foi possível salvar. Suas alterações foram mantidas; tente novamente.','error');}
          queue.delete(offerKey);
        }
      }
    }finally{busy=false;runner=null;inFlight=null;if(button.dataset)button.dataset.trendsSaving='false';sync();}
    return success;
  }
  function enqueue(context) {
    if(runner&&[queue.get(context.offerKey),inFlight].some(item=>item?.offerKey===context.offerKey&&operationSignature(item)===operationSignature(context)))return runner;
    queue.set(context.offerKey,context);
    if(runner)return runner;
    busy=true;sync();
    let complete;const pending=new Promise(resolve=>{complete=resolve;});
    runner=pending;void drain().then(complete,()=>complete(false));return pending;
  }
  function save(status) {
    if(autoSave&&typeof status!=='string')return flush();
    const context=snapshot(typeof status==='string'?status:Boolean(status));if(!context)return Promise.resolve(false);
    liveEditor={offerKey:context.offerKey,snapshot:captureEditor(scope)};
    return enqueue(context);
  }
  function schedule({commitAssessment=false,immediate=false}={}) {
    const context=snapshot(null,commitAssessment);if(!context)return;
    liveEditor={offerKey:context.offerKey,snapshot:captureEditor(scope)};
    dirty=true;lastSaveFailed=false;
    if(autoSave){
      pendingAutoContext=context;
      if(autosaveTimer)clearTimeout(autosaveTimer);
      if(immediate){autosaveTimer=null;void persistPending();}
      else autosaveTimer=setTimeout(()=>{autosaveTimer=null;void persistPending();},autosaveDelay);
      announce('Salvando automaticamente…','saving');sync();return;
    }
    announce('Alterações pendentes — clique em Salvar.','pending');sync();
  }
  async function persistPending(){
    if(autosaveTimer){clearTimeout(autosaveTimer);autosaveTimer=null;}
    const context=pendingAutoContext;pendingAutoContext=null;
    if(!context)return runner?runner:true;
    return enqueue(context);
  }
  function select(status) {
    const context=snapshot(status,true);if(!context)return false;
    for(const node of scope?.querySelectorAll?.('[data-trends-result]')||[]){
      const selected=node.dataset.trendsResult===status;node.classList.toggle('selected',selected);node.setAttribute('aria-pressed',String(selected));
    }
    schedule({commitAssessment:true,immediate:autoSave});return true;
  }
  button.addEventListener('click',()=>autoSave?void flush():void save());
  scope?.addEventListener('input',event=>{if(event.target.matches(watch)&&!event.isComposing)schedule();});
  scope?.addEventListener('change',event=>{if(event.target.matches(watch))schedule();});
  scope?.addEventListener('click',event=>{if(event.target.closest(clickWatch))schedule();});
  sync();showTrendsSaveFeedback(button,'');
  return {save,select,sync,schedule,status:(fallback='')=>selectedStatuses.get(currentKey())||fallback,
    restore(){if(liveEditor?.offerKey===currentKey())restoreEditor(scope,liveEditor.snapshot);},
    reset(){if(autosaveTimer)clearTimeout(autosaveTimer);autosaveTimer=null;pendingAutoContext=null;selectedStatuses.clear();savedSignatures.clear();liveEditor=null;dirty=false;lastSaveFailed=false;feedbackContext='';showTrendsSaveFeedback(button,'');},
    async flush(){
      if(autoSave){const saved=await persistPending();if(runner)return saved&&await runner;return saved;}
      const context=snapshot();if(!context)return false;
      liveEditor={offerKey:context.offerKey,snapshot:captureEditor(scope)};
      if(runner&&await runner!==true)return false;
      return enqueue(context);
    },
    saving(message='Salvando automaticamente…'){if(autoSave&&getContext()?.offerKey)announce(message,'saving');},
    confirmed(offerKey){const context=getContext();if((context?.tab==='trends'||keepFeedbackAcrossTabs)&&(!offerKey||currentKey()===offerKey)){if(dirty)announce(autoSave?'Salvando automaticamente…':'Alterações pendentes — clique em Salvar.',autoSave?'saving':'pending');else announce('Salvo.','saved');}},
    report(message,{error=false}={}){
      const context=getContext();if(context?.tab!=='trends'&&!keepFeedbackAcrossTabs)return;
      if(error)announce(message,'error');
      else if(dirty)announce(autoSave?'Salvando automaticamente…':'Alterações pendentes — clique em Salvar.',autoSave?'saving':'pending');
      else if(/\b(?:salv[ao]s?|adicionad[ao]s?|removid[ao]s?|atualizad[ao]s?)\b/i.test(message))announce('Salvo.','saved');
    }};
}

export const DEFAULT_DECISION='Não definido';

export const DECISION_OPTIONS=Object.freeze([
  Object.freeze({value:DEFAULT_DECISION,tone:'undefined'}),
  Object.freeze({value:'Subir campanha',tone:'launch'}),
  Object.freeze({value:'Campanha no ar',tone:'live'}),
  Object.freeze({value:'Revisar',tone:'review'}),
  Object.freeze({value:'Ocultar',tone:'hide'})
]);

const LEGACY_DECISIONS=new Map([
  ['',DEFAULT_DECISION],['Novo sinal',DEFAULT_DECISION],['Não definido',DEFAULT_DECISION],
  ['Investigar oferta','Revisar'],['Investigar mais','Revisar'],['Prioritário','Revisar'],
  ['Não avançar','Ocultar'],['Arquivada','Ocultar'],['Aprovada para teste','Subir campanha']
]);

export function normalizeDecision(value,options=DECISION_OPTIONS){
  const text=String(value??'').trim();
  if(LEGACY_DECISIONS.has(text))return LEGACY_DECISIONS.get(text);
  return options.some(option=>option.value===text)?text:DEFAULT_DECISION;
}

export function decisionTone(value,options=DECISION_OPTIONS){
  const normalized=normalizeDecision(value,options);
  return options.find(option=>option.value===normalized)?.tone||'undefined';
}

export function rowClass(value,options=DECISION_OPTIONS){
  const tone=decisionTone(value,options);
  return tone==='launch'?'decision-row-launch':tone==='live'?'decision-row-live':'';
}

export function buttonHtml(value,attribute,identity,options=DECISION_OPTIONS){
  const normalized=normalizeDecision(value,options),tone=decisionTone(normalized,options);
  return `<button class="decision-badge ${tone}" ${attribute}="${identity}" data-curation-focus="decision" type="button">${normalized}</button>`;
}

export function buttonHtmlMany(values,attribute,identity,options=DECISION_OPTIONS){
  const statuses=[...new Set((Array.isArray(values)?values:[values]).map(value=>normalizeDecision(value,options)))];
  const visible=statuses.length?statuses:[DEFAULT_DECISION],label=visible.join(' · '),tone=decisionTone(visible[0],options);
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  return `<button class="decision-badge ${tone}${visible.length>1?' multiple':''}" ${attribute}="${identity}" data-curation-focus="decision" type="button" aria-label="${escape(label)}" title="${escape(label)}">${visible.map(value=>`<span>${escape(value)}</span>`).join('<span class="decision-badge-separator" aria-hidden="true"> · </span>')}</button>`;
}

function ensureDialog(){
  let dialog=document.getElementById('sharedDecisionDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='sharedDecisionDialog';
  dialog.className='decision-dialog';
  dialog.innerHTML='<div class="decision-dialog-head"><div><span class="decision-dialog-kicker">Decisão de curadoria</span><h2 id="sharedDecisionTitle"></h2><p>Escolha uma opção. A decisão será salva imediatamente.</p></div><button class="decision-dialog-close" type="button" aria-label="Fechar">×</button></div><div class="decision-dialog-page-type" id="sharedDecisionPageClassification" role="group" aria-label="Tipo de página" hidden><label><input id="sharedDecisionPageReview" type="checkbox">Página review</label><label><input id="sharedDecisionPageCookies" type="checkbox">Página de cookies</label></div><div class="decision-dialog-market-scope" id="sharedDecisionMarketScope" role="group" aria-label="Alcance geográfico" hidden><label><input id="sharedDecisionMarketWorld" type="checkbox">Mundo</label><label><input id="sharedDecisionMarketOneCountry" type="checkbox">Um país</label><label><input id="sharedDecisionMarketSomeCountries" type="checkbox">Alguns países</label></div><div class="decision-dialog-notes" id="sharedDecisionNotes" hidden><label for="sharedDecisionNote">Observação sobre a decisão (opcional)</label><textarea id="sharedDecisionNote" maxlength="5000" rows="3" placeholder="Registre o motivo ou contexto desta decisão."></textarea></div><div class="decision-dialog-actions" id="sharedDecisionActions"></div><div class="decision-dialog-commit" id="sharedDecisionCommit" hidden><span id="sharedDecisionSelectionHint" aria-live="polite"></span><div><button class="btn" id="sharedDecisionCancel" type="button">Cancelar</button><button class="btn primary" id="sharedDecisionConfirm" type="button">Confirmar</button></div></div>';
  const followup=document.createElement('div');
  followup.className='decision-dialog-followup';
  followup.id='sharedDecisionFollowup';
  followup.hidden=true;
  followup.innerHTML='<button class="btn primary" id="sharedDecisionStartDelivery" type="button">Iniciar entrega</button>';
  dialog.querySelector('#sharedDecisionActions').after(followup);
  document.body.append(dialog);
  dialog.querySelector('.decision-dialog-close').onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
  return dialog;
}

export function openDecisionPicker({title,currentValue,currentValues=null,maxSelections=0,onSelect,onError,onStartDelivery=null,startDeliveryLabel='Iniciar entrega',allowNotes=false,notes='',allowPageClassification=false,pageClassification=null,allowMarketScope=false,marketScope=null,options=DECISION_OPTIONS}){
  const dialog=ensureDialog(),current=normalizeDecision(currentValue,options),actions=dialog.querySelector('#sharedDecisionActions');
  const multiSelect=Number(maxSelections)>1,selectionLimit=Math.min(options.length,Math.floor(Number(maxSelections)||0));
  const commit=dialog.querySelector('#sharedDecisionCommit'),confirmButton=dialog.querySelector('#sharedDecisionConfirm'),cancelButton=dialog.querySelector('#sharedDecisionCancel'),selectionHint=dialog.querySelector('#sharedDecisionSelectionHint');
  let stagedValues=[];
  dialog.querySelector('#sharedDecisionTitle').textContent=title;
  const noteWrap=dialog.querySelector('#sharedDecisionNotes'),noteInput=dialog.querySelector('#sharedDecisionNote');
  const pageClassificationWrap=dialog.querySelector('#sharedDecisionPageClassification');
  const pageReviewInput=dialog.querySelector('#sharedDecisionPageReview'),pageCookiesInput=dialog.querySelector('#sharedDecisionPageCookies');
  const pageClassificationInputs=[pageReviewInput,pageCookiesInput];
  const marketScopeWrap=dialog.querySelector('#sharedDecisionMarketScope');
  const marketWorldInput=dialog.querySelector('#sharedDecisionMarketWorld'),marketOneCountryInput=dialog.querySelector('#sharedDecisionMarketOneCountry'),marketSomeCountriesInput=dialog.querySelector('#sharedDecisionMarketSomeCountries');
  const followup=dialog.querySelector('#sharedDecisionFollowup'),startDeliveryButton=dialog.querySelector('#sharedDecisionStartDelivery');
  noteWrap.hidden=!allowNotes;
  noteInput.value=allowNotes?String(notes??'').slice(0,5000):'';
  pageClassificationWrap.hidden=!allowPageClassification;
  pageReviewInput.checked=allowPageClassification&&pageClassification==='review';
  pageCookiesInput.checked=allowPageClassification&&pageClassification==='cookies';
  for(const input of pageClassificationInputs)input.disabled=!allowPageClassification;
  for(const input of pageClassificationInputs)input.onchange=()=>{if(input.checked)for(const other of pageClassificationInputs)if(other!==input)other.checked=false};
  marketScopeWrap.hidden=!allowMarketScope;
  marketWorldInput.checked=allowMarketScope&&marketScope==='world';
  marketOneCountryInput.checked=allowMarketScope&&marketScope==='one-country';
  marketSomeCountriesInput.checked=allowMarketScope&&marketScope==='some-countries';
  for(const input of [marketWorldInput,marketOneCountryInput,marketSomeCountriesInput])input.disabled=!allowMarketScope;
  const marketScopeInputs=[marketWorldInput,marketOneCountryInput,marketSomeCountriesInput];
  for(const input of marketScopeInputs)input.onchange=()=>{if(input.checked)for(const other of marketScopeInputs)if(other!==input)other.checked=false};
  const decisionCopy=allowMarketScope?'Escolha uma opção. Sua observação e as classificações serão salvas junto com a decisão.':allowNotes?'Escolha uma opção. Sua observação será salva junto com a decisão.':'Escolha uma opção. A decisão será salva imediatamente.';
  const nextStepCopy='Decisão salva. O próximo passo é iniciar a entrega.';
  dialog.querySelector('p').textContent=multiSelect?`Selecione até ${selectionLimit} opções e confirme para salvar.`:onStartDelivery&&current==='Subir campanha'?nextStepCopy:decisionCopy;
  commit.hidden=!multiSelect;
  stagedValues=[...new Set((Array.isArray(currentValues)?currentValues:[currentValue]).map(value=>normalizeDecision(value,options)))].slice(0,selectionLimit);
  const updateSelectionHint=message=>{selectionHint.textContent=message||`${stagedValues.length}/${selectionLimit} opções selecionadas. Enter confirma.`};
  updateSelectionHint();
  const syncStagedButtons=()=>{for(const optionButton of actions.querySelectorAll('.decision-option'))optionButton.classList.toggle('selected',stagedValues.includes(optionButton.dataset.decisionValue));updateSelectionHint()};
  dialog.onkeydown=event=>{if(!multiSelect||event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;event.preventDefault();if(!confirmButton.disabled)confirmButton.click()};
  cancelButton.onclick=()=>dialog.close();
  confirmButton.onclick=async()=>{
    if(!multiSelect||confirmButton.disabled)return;
    confirmButton.disabled=true;cancelButton.disabled=true;noteInput.disabled=true;
    try{
      const selectedPageClassification=pageReviewInput.checked?'review':pageCookiesInput.checked?'cookies':null;
      const selectedMarketScope=marketWorldInput.checked?'world':marketOneCountryInput.checked?'one-country':marketSomeCountriesInput.checked?'some-countries':null;
      if(allowPageClassification||allowMarketScope)await onSelect([...stagedValues],allowNotes?noteInput.value:undefined,allowPageClassification?selectedPageClassification:undefined,allowMarketScope?selectedMarketScope:undefined);
      else await onSelect([...stagedValues],allowNotes?noteInput.value:undefined);
      dialog.close();
    }catch(error){dialog.querySelector('p').textContent=error.message||'Não foi possível salvar. Tente novamente.';if(onError)onError(error)}
    finally{confirmButton.disabled=false;cancelButton.disabled=false;noteInput.disabled=false}
  };
  followup.hidden=typeof onStartDelivery!=='function'||current!=='Subir campanha';
  startDeliveryButton.textContent=String(startDeliveryLabel||'Iniciar entrega');
  startDeliveryButton.onclick=async()=>{
    if(typeof onStartDelivery!=='function'||startDeliveryButton.disabled)return;
    startDeliveryButton.disabled=true;
    try{await onStartDelivery()}
    catch(error){dialog.querySelector('p').textContent=error.message||'Não foi possível iniciar a entrega. Tente novamente.'}
    finally{startDeliveryButton.disabled=false}
  };
  actions.innerHTML='';
  actions.classList.toggle('has-app-option',options.some(option=>option.value==='App'));
  actions.classList.toggle('has-dtc-option',options.some(option=>option.value==='DTC'));
  for(const option of options){
    const button=document.createElement('button');
    button.type='button';
    button.className=`decision-option ${option.tone}${multiSelect?stagedValues.includes(option.value)?' selected':'':option.value===current?' selected':''}`;
    button.dataset.decisionValue=option.value;
    button.textContent=option.value;
    if(multiSelect){button.onclick=()=>{if(button.disabled)return;if(stagedValues.includes(option.value))stagedValues=stagedValues.filter(value=>value!==option.value);else if(stagedValues.length>=selectionLimit){updateSelectionHint(`Limite de ${selectionLimit} opções. Remova uma antes de escolher outra.`);return}else stagedValues=[...stagedValues,option.value];syncStagedButtons()};actions.append(button);continue}
    button.onclick=async()=>{
      button.disabled=true;noteInput.disabled=true;
      for(const input of pageClassificationInputs)input.disabled=true;
      for(const input of marketScopeInputs)input.disabled=true;
      try{
        const selectedPageClassification=pageReviewInput.checked?'review':pageCookiesInput.checked?'cookies':null;
        const selectedMarketScope=marketWorldInput.checked?'world':marketOneCountryInput.checked?'one-country':marketSomeCountriesInput.checked?'some-countries':null;
        if(allowPageClassification||allowMarketScope)await onSelect(option.value,allowNotes?noteInput.value:undefined,allowPageClassification?selectedPageClassification:undefined,allowMarketScope?selectedMarketScope:undefined);
        else await onSelect(option.value,allowNotes?noteInput.value:undefined);
        if(typeof onStartDelivery==='function'&&option.value==='Subir campanha'){
          for(const optionButton of actions.querySelectorAll('.decision-option'))optionButton.classList.toggle('selected',optionButton===button);
          followup.hidden=false;
          dialog.querySelector('p').textContent=nextStepCopy;
        }else dialog.close();
      }catch(error){
        dialog.querySelector('p').textContent=error.message||'Não foi possível salvar. Tente novamente.';
        if(onError)onError(error);
      }finally{
        button.disabled=false;noteInput.disabled=false;
        for(const input of pageClassificationInputs)input.disabled=!allowPageClassification;
        for(const input of marketScopeInputs)input.disabled=!allowMarketScope;
      }
    };
    actions.append(button);
  }
  dialog.showModal();
}

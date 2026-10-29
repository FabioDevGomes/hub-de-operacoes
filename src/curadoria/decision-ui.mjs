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

function ensureDialog(){
  let dialog=document.getElementById('sharedDecisionDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='sharedDecisionDialog';
  dialog.className='decision-dialog';
  dialog.innerHTML='<div class="decision-dialog-head"><div><span class="decision-dialog-kicker">Decisão de curadoria</span><h2 id="sharedDecisionTitle"></h2><p>Escolha uma opção. A decisão será salva imediatamente.</p></div><button class="decision-dialog-close" type="button" aria-label="Fechar">×</button></div><div class="decision-dialog-page-type" id="sharedDecisionPageClassification" role="group" aria-label="Tipo de página" hidden><label><input id="sharedDecisionPageReview" type="checkbox">Página review</label><label><input id="sharedDecisionPageCookies" type="checkbox">Página de cookies</label></div><div class="decision-dialog-market-scope" id="sharedDecisionMarketScope" role="group" aria-label="Alcance geográfico" hidden><label><input id="sharedDecisionMarketWorld" type="checkbox">Mundo</label><label><input id="sharedDecisionMarketOneCountry" type="checkbox">Um país</label><label><input id="sharedDecisionMarketSomeCountries" type="checkbox">Alguns países</label></div><div class="decision-dialog-notes" id="sharedDecisionNotes" hidden><label for="sharedDecisionNote">Observação sobre a decisão (opcional)</label><textarea id="sharedDecisionNote" maxlength="5000" rows="3" placeholder="Registre o motivo ou contexto desta decisão."></textarea></div><div class="decision-dialog-actions" id="sharedDecisionActions"></div>';
  document.body.append(dialog);
  dialog.querySelector('.decision-dialog-close').onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
  return dialog;
}

export function openDecisionPicker({title,currentValue,onSelect,onError,allowNotes=false,notes='',allowPageClassification=false,pageClassification=null,allowMarketScope=false,marketScope=null,options=DECISION_OPTIONS}){
  const dialog=ensureDialog(),current=normalizeDecision(currentValue,options),actions=dialog.querySelector('#sharedDecisionActions');
  dialog.querySelector('#sharedDecisionTitle').textContent=title;
  const noteWrap=dialog.querySelector('#sharedDecisionNotes'),noteInput=dialog.querySelector('#sharedDecisionNote');
  const pageClassificationWrap=dialog.querySelector('#sharedDecisionPageClassification');
  const pageReviewInput=dialog.querySelector('#sharedDecisionPageReview'),pageCookiesInput=dialog.querySelector('#sharedDecisionPageCookies');
  const marketScopeWrap=dialog.querySelector('#sharedDecisionMarketScope');
  const marketWorldInput=dialog.querySelector('#sharedDecisionMarketWorld'),marketOneCountryInput=dialog.querySelector('#sharedDecisionMarketOneCountry'),marketSomeCountriesInput=dialog.querySelector('#sharedDecisionMarketSomeCountries');
  noteWrap.hidden=!allowNotes;
  noteInput.value=allowNotes?String(notes??'').slice(0,5000):'';
  pageClassificationWrap.hidden=!allowPageClassification;
  pageReviewInput.checked=allowPageClassification&&pageClassification==='review';
  pageCookiesInput.checked=allowPageClassification&&pageClassification==='cookies';
  pageReviewInput.disabled=!allowPageClassification;
  pageCookiesInput.disabled=!allowPageClassification;
  pageReviewInput.onchange=()=>{if(pageReviewInput.checked)pageCookiesInput.checked=false};
  pageCookiesInput.onchange=()=>{if(pageCookiesInput.checked)pageReviewInput.checked=false};
  marketScopeWrap.hidden=!allowMarketScope;
  marketWorldInput.checked=allowMarketScope&&marketScope==='world';
  marketOneCountryInput.checked=allowMarketScope&&marketScope==='one-country';
  marketSomeCountriesInput.checked=allowMarketScope&&marketScope==='some-countries';
  for(const input of [marketWorldInput,marketOneCountryInput,marketSomeCountriesInput])input.disabled=!allowMarketScope;
  const marketScopeInputs=[marketWorldInput,marketOneCountryInput,marketSomeCountriesInput];
  for(const input of marketScopeInputs)input.onchange=()=>{if(input.checked)for(const other of marketScopeInputs)if(other!==input)other.checked=false};
  dialog.querySelector('p').textContent=allowMarketScope?'Escolha uma opção. Sua observação e as classificações serão salvas junto com a decisão.':allowNotes?'Escolha uma opção. Sua observação será salva junto com a decisão.':'Escolha uma opção. A decisão será salva imediatamente.';
  actions.innerHTML='';
  for(const option of options){
    const button=document.createElement('button');
    button.type='button';
    button.className=`decision-option ${option.tone}${option.value===current?' selected':''}`;
    button.textContent=option.value;
    button.onclick=async()=>{button.disabled=true;noteInput.disabled=true;pageReviewInput.disabled=true;pageCookiesInput.disabled=true;for(const input of marketScopeInputs)input.disabled=true;try{const selectedPageClassification=pageReviewInput.checked?'review':pageCookiesInput.checked?'cookies':null,selectedMarketScope=marketWorldInput.checked?'world':marketOneCountryInput.checked?'one-country':marketSomeCountriesInput.checked?'some-countries':null;if(allowPageClassification||allowMarketScope)await onSelect(option.value,allowNotes?noteInput.value:undefined,allowPageClassification?selectedPageClassification:undefined,allowMarketScope?selectedMarketScope:undefined);else await onSelect(option.value,allowNotes?noteInput.value:undefined);dialog.close()}catch(error){dialog.querySelector('p').textContent=error.message||'Não foi possível salvar. Tente novamente.';if(onError)onError(error);}finally{button.disabled=false;noteInput.disabled=false;pageReviewInput.disabled=!allowPageClassification;pageCookiesInput.disabled=!allowPageClassification;for(const input of marketScopeInputs)input.disabled=!allowMarketScope}};
    actions.append(button);
  }
  dialog.showModal();
}

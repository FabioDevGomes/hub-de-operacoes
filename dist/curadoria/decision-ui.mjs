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
  dialog.innerHTML='<div class="decision-dialog-head"><div><span class="decision-dialog-kicker">Decisão de curadoria</span><h2 id="sharedDecisionTitle"></h2><p>Escolha uma opção. A decisão será salva imediatamente.</p></div><button class="decision-dialog-close" type="button" aria-label="Fechar">×</button></div><div class="decision-dialog-notes" id="sharedDecisionNotes" hidden><label for="sharedDecisionNote">Observação sobre a decisão (opcional)</label><textarea id="sharedDecisionNote" maxlength="5000" rows="3" placeholder="Registre o motivo ou contexto desta decisão."></textarea></div><div class="decision-dialog-actions" id="sharedDecisionActions"></div>';
  document.body.append(dialog);
  dialog.querySelector('.decision-dialog-close').onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
  return dialog;
}

export function openDecisionPicker({title,currentValue,onSelect,onError,allowNotes=false,notes='',options=DECISION_OPTIONS}){
  const dialog=ensureDialog(),current=normalizeDecision(currentValue,options),actions=dialog.querySelector('#sharedDecisionActions');
  dialog.querySelector('#sharedDecisionTitle').textContent=title;
  const noteWrap=dialog.querySelector('#sharedDecisionNotes'),noteInput=dialog.querySelector('#sharedDecisionNote');
  noteWrap.hidden=!allowNotes;
  noteInput.value=allowNotes?String(notes??'').slice(0,5000):'';
  dialog.querySelector('p').textContent=allowNotes?'Escolha uma opção. Sua observação será salva junto com a decisão.':'Escolha uma opção. A decisão será salva imediatamente.';
  actions.innerHTML='';
  for(const option of options){
    const button=document.createElement('button');
    button.type='button';
    button.className=`decision-option ${option.tone}${option.value===current?' selected':''}`;
    button.textContent=option.value;
    button.onclick=async()=>{button.disabled=true;noteInput.disabled=true;try{await onSelect(option.value,allowNotes?noteInput.value:undefined);dialog.close()}catch(error){dialog.querySelector('p').textContent=error.message||'Não foi possível salvar. Tente novamente.';if(onError)onError(error);}finally{button.disabled=false;noteInput.disabled=false}};
    actions.append(button);
  }
  dialog.showModal();
}

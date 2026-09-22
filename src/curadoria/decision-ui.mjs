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

export function normalizeDecision(value){
  const text=String(value??'').trim();
  if(LEGACY_DECISIONS.has(text))return LEGACY_DECISIONS.get(text);
  return DECISION_OPTIONS.some(option=>option.value===text)?text:DEFAULT_DECISION;
}

export function decisionTone(value){
  const normalized=normalizeDecision(value);
  return DECISION_OPTIONS.find(option=>option.value===normalized)?.tone||'undefined';
}

export function rowClass(value){
  const tone=decisionTone(value);
  return tone==='launch'?'decision-row-launch':tone==='live'?'decision-row-live':'';
}

export function buttonHtml(value,attribute,identity){
  const normalized=normalizeDecision(value),tone=decisionTone(normalized);
  return `<button class="decision-badge ${tone}" ${attribute}="${identity}" type="button">${normalized}</button>`;
}

function ensureDialog(){
  let dialog=document.getElementById('sharedDecisionDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='sharedDecisionDialog';
  dialog.className='decision-dialog';
  dialog.innerHTML='<div class="decision-dialog-head"><div><span class="decision-dialog-kicker">Decisão de curadoria</span><h2 id="sharedDecisionTitle"></h2><p>Escolha uma opção. A decisão será salva imediatamente.</p></div><button class="decision-dialog-close" type="button" aria-label="Fechar">×</button></div><div class="decision-dialog-actions" id="sharedDecisionActions"></div>';
  document.body.append(dialog);
  dialog.querySelector('.decision-dialog-close').onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
  return dialog;
}

export function openDecisionPicker({title,currentValue,onSelect}){
  const dialog=ensureDialog(),current=normalizeDecision(currentValue),actions=dialog.querySelector('#sharedDecisionActions');
  dialog.querySelector('#sharedDecisionTitle').textContent=title;
  actions.innerHTML='';
  for(const option of DECISION_OPTIONS){
    const button=document.createElement('button');
    button.type='button';
    button.className=`decision-option ${option.tone}${option.value===current?' selected':''}`;
    button.textContent=option.value;
    button.onclick=async()=>{button.disabled=true;try{await onSelect(option.value);dialog.close()}finally{button.disabled=false}};
    actions.append(button);
  }
  dialog.showModal();
}

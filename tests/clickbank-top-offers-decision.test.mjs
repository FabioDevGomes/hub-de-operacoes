import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DECISION_OPTIONS,DEFAULT_DECISION,buttonHtml,decisionTone,normalizeDecision,rowClass} from '../src/curadoria/decision-ui.mjs';
import * as TopOffersDecision from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-decision.mjs';

assert.equal(TopOffersDecision.DEFAULT_DECISION,DEFAULT_DECISION);
assert.deepEqual(DECISION_OPTIONS.map(option=>option.value),['Não definido','Subir campanha','Campanha no ar','Revisar','Ocultar']);
assert.deepEqual(TopOffersDecision.OPTIONS.map(option=>option.value),['Não definido','Subir campanha','Campanha no ar','Revisar','Solicitação Enviada','Precisa de aprovação','Ocultar']);
assert.equal(TopOffersDecision.normalizeDecision('Solicitação Enviada'),'Solicitação Enviada');
assert.equal(TopOffersDecision.normalizeDecision('valor desconhecido'),DEFAULT_DECISION);
assert.equal(TopOffersDecision.normalizePageClassification('cookies'),'cookies');
assert.equal(TopOffersDecision.normalizePageClassification('review'),'review');
assert.equal(TopOffersDecision.normalizePageClassification('dtc'),null,'classificações desconhecidas não são persistidas');
assert.equal(TopOffersDecision.pageClassificationLabel('cookies'),'cookies');
assert.equal(TopOffersDecision.pageClassificationLabel('review'),'review');
assert.equal(TopOffersDecision.rowClass('Solicitação Enviada'),'');
assert.equal(TopOffersDecision.OPTIONS.find(option=>option.value==='Solicitação Enviada')?.tone,decisionTone('Revisar'));
assert.equal(TopOffersDecision.normalizeDecision('Precisa de aprovação'),'Precisa de aprovação');
assert.equal(TopOffersDecision.OPTIONS.find(option=>option.value==='Precisa de aprovação')?.tone,decisionTone('Revisar'));
assert.match(TopOffersDecision.buttonHtml('Solicitação Enviada','data-decision-key','offer-1'),/decision-badge review/);
assert.match(TopOffersDecision.buttonHtml('Solicitação Enviada','data-decision-key','offer-1'),/>Solicitação Enviada<\/button>/);
assert.match(buttonHtml('Revisar','data-decision-key','offer-1'),/decision-badge review/);
assert.equal(normalizeDecision('Solicitação Enviada'),DEFAULT_DECISION,'a nova opção não altera telas que usam o seletor compartilhado padrão');
assert.equal(rowClass('Solicitação Enviada'),'','a decisão não adiciona destaque de linha às outras telas');

const originalDocument=globalThis.document;
const buttons=[];
let shown=false;
const actionContainer={innerHTML:'',append(button){buttons.push(button)}};
const titleElement={textContent:''},noteWrap={hidden:false},noteInput={value:'',disabled:false},pageClassificationWrap={hidden:false};
const pageReviewInput={checked:false,disabled:false,onchange:null},pageCookiesInput={checked:false,disabled:false,onchange:null};
const description={textContent:''},closeButton={};
let savedDecision=null;
const dialog={
  id:'',className:'',innerHTML:'',onclick:null,
  querySelector(selector){return ({'#sharedDecisionTitle':titleElement,'#sharedDecisionNotes':noteWrap,'#sharedDecisionNote':noteInput,'#sharedDecisionPageClassification':pageClassificationWrap,'#sharedDecisionPageReview':pageReviewInput,'#sharedDecisionPageCookies':pageCookiesInput,'#sharedDecisionActions':actionContainer,'.decision-dialog-close':closeButton,'p':description})[selector]},
  showModal(){shown=true},close(){shown=false}
};
globalThis.document={
  getElementById(){return null},
  createElement(tag){return tag==='dialog'?dialog:{type:'',className:'',textContent:'',onclick:null,disabled:false}},
  body:{append(){}}
};
try{
  TopOffersDecision.openDecisionPicker({title:'Oferta de teste',currentValue:'Revisar',allowNotes:true,notes:'nota existente',allowPageClassification:true,pageClassification:'review',onSelect:async(status,notes,pageClassification)=>{savedDecision={status,notes,pageClassification}}});
  assert.equal(shown,true,'o seletor local abre o diálogo');
  assert.equal(pageClassificationWrap.hidden,false,'a classificação da página fica visível quando habilitada');
  assert.equal(pageReviewInput.checked,true,'a classificação atual reabre selecionada');
  pageCookiesInput.checked=true;
  pageCookiesInput.onchange();
  assert.equal(pageReviewInput.checked,false,'cookies desmarca review para manter a escolha exclusiva');
  pageReviewInput.checked=true;
  pageReviewInput.onchange();
  assert.equal(pageCookiesInput.checked,false,'review desmarca cookies para manter a escolha exclusiva');
  pageCookiesInput.checked=true;
  pageCookiesInput.onchange();
  noteInput.value='contexto salvo';
  assert.deepEqual(buttons.map(button=>button.textContent),TopOffersDecision.OPTIONS.map(option=>option.value));
  assert.equal(buttons[4].className,'decision-option review','Solicitação Enviada usa o mesmo tom da opção Revisar no seletor');
  assert.equal(buttons[5].className,'decision-option review','Precisa de aprovação usa o mesmo tom da opção Revisar no seletor');
  assert.match(buttons[3].className,/selected/,'a decisão atual continua selecionada');
  await buttons[0].onclick();
  assert.deepEqual(savedDecision,{status:'Não definido',notes:'contexto salvo',pageClassification:'cookies'},'a escolha é encaminhada junto com a decisão e observação');
  assert.equal(shown,false,'o diálogo fecha depois do salvamento');
}finally{
  if(originalDocument===undefined)delete globalThis.document;
  else globalThis.document=originalDocument;
}

const view=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',import.meta.url),'utf8');
const controller=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',import.meta.url),'utf8');
const storage=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs',import.meta.url),'utf8');
const decisionUI=await readFile(new URL('../src/curadoria/decision-ui.mjs',import.meta.url),'utf8');
assert.ok(view.includes("DecisionUI.openDecisionPicker({title:item.offerName,currentValue:current.currentStatus"),'a ficha abre o seletor estendido apenas na lista ClickBank');
assert.ok(view.includes('allowPageClassification:true,pageClassification:current.pageClassification')&&view.includes('actions.saveDecision(item.offerKey,status,notes,pageClassification)'),'a tela reabre e encaminha a classificação escolhida');
assert.ok(controller.includes('pageClassification:normalizedPageClassification')&&controller.includes('pageClassification:normalizedPageClassification,capturedAt'),'a decisão atual e cada entrada do histórico guardam a classificação');
assert.match(view,/pageClassifications=new Map\(state\.decisions\.map\(record=>\[record\.offerKey,record\.pageClassification\]\)\)/,'a listagem busca a classificação salva por oferta');
assert.ok(view.includes("button.textContent=button.textContent+' · '+label"),'a coluna acrescenta a classificação depois do nome da decisão com ponto central e espaços');
assert.ok(decisionUI.includes('id="sharedDecisionPageReview" type="checkbox"')&&decisionUI.includes('id="sharedDecisionPageCookies" type="checkbox"'),'o diálogo contém os dois checkboxes solicitados');
assert.ok(decisionUI.includes("pageCookiesInput.onchange=()=>{if(pageCookiesInput.checked)pageReviewInput.checked=false}"),'os dois checkboxes são mutuamente exclusivos');
assert.ok(controller.includes('TopOffersDecision.normalizeDecision(status)'),'o salvamento normaliza a escolha local antes de gravá-la');
assert.match(storage,/DECISION_VALUES = new Set\(\[[^\]]*'Precisa de aprovação'/,'a store e a validação de backups aceitam o novo status');
console.log('clickbank top offers decisions ok');

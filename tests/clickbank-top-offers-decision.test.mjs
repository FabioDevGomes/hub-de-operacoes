import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DECISION_OPTIONS,DEFAULT_DECISION,buttonHtml,decisionTone,normalizeDecision,rowClass} from '../src/curadoria/decision-ui.mjs';
import * as TopOffersDecision from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-decision.mjs';

assert.equal(TopOffersDecision.DEFAULT_DECISION,DEFAULT_DECISION);
assert.deepEqual(DECISION_OPTIONS.map(option=>option.value),['Não definido','Subir campanha','Campanha no ar','Revisar','Ocultar']);
assert.deepEqual(TopOffersDecision.OPTIONS.map(option=>option.value),['Não definido','Subir campanha','Campanha no ar','Revisar','Solicitação Enviada','Ocultar']);
assert.equal(TopOffersDecision.normalizeDecision('Solicitação Enviada'),'Solicitação Enviada');
assert.equal(TopOffersDecision.normalizeDecision('valor desconhecido'),DEFAULT_DECISION);
assert.equal(TopOffersDecision.rowClass('Solicitação Enviada'),'');
assert.equal(TopOffersDecision.OPTIONS.find(option=>option.value==='Solicitação Enviada')?.tone,decisionTone('Revisar'));
assert.match(TopOffersDecision.buttonHtml('Solicitação Enviada','data-decision-key','offer-1'),/decision-badge review/);
assert.match(TopOffersDecision.buttonHtml('Solicitação Enviada','data-decision-key','offer-1'),/>Solicitação Enviada<\/button>/);
assert.match(buttonHtml('Revisar','data-decision-key','offer-1'),/decision-badge review/);
assert.equal(normalizeDecision('Solicitação Enviada'),DEFAULT_DECISION,'a nova opção não altera telas que usam o seletor compartilhado padrão');
assert.equal(rowClass('Solicitação Enviada'),'','a decisão não adiciona destaque de linha às outras telas');

const originalDocument=globalThis.document;
const buttons=[];
let shown=false;
const actionContainer={innerHTML:'',append(button){buttons.push(button)}};
const titleElement={textContent:''},noteWrap={hidden:false},noteInput={value:'',disabled:false},description={textContent:''},closeButton={};
const dialog={
  id:'',className:'',innerHTML:'',onclick:null,
  querySelector(selector){return ({'#sharedDecisionTitle':titleElement,'#sharedDecisionNotes':noteWrap,'#sharedDecisionNote':noteInput,'#sharedDecisionActions':actionContainer,'.decision-dialog-close':closeButton,'p':description})[selector]},
  showModal(){shown=true},close(){shown=false}
};
globalThis.document={
  getElementById(){return null},
  createElement(tag){return tag==='dialog'?dialog:{type:'',className:'',textContent:'',onclick:null,disabled:false}},
  body:{append(){}}
};
try{
  TopOffersDecision.openDecisionPicker({title:'Oferta de teste',currentValue:'Revisar',onSelect:async()=>{}});
  assert.equal(shown,true,'o seletor local abre o diálogo');
  assert.deepEqual(buttons.map(button=>button.textContent),TopOffersDecision.OPTIONS.map(option=>option.value));
  assert.equal(buttons[4].className,'decision-option review','Solicitação Enviada usa o mesmo tom da opção Revisar no seletor');
  assert.match(buttons[3].className,/selected/,'a decisão atual continua selecionada');
}finally{
  if(originalDocument===undefined)delete globalThis.document;
  else globalThis.document=originalDocument;
}

const view=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',import.meta.url),'utf8');
const controller=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',import.meta.url),'utf8');
const storage=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs',import.meta.url),'utf8');
assert.ok(view.includes("DecisionUI.openDecisionPicker({title:item.offerName,currentValue:current.currentStatus"),'a ficha abre o seletor estendido apenas na lista ClickBank');
assert.ok(controller.includes('TopOffersDecision.normalizeDecision(status)'),'o salvamento normaliza a escolha local antes de gravá-la');
assert.match(storage,/DECISION_VALUES = new Set\(\[[^\]]*'Solicitação Enviada'/,'a store e a validação de backups aceitam o novo status');
console.log('clickbank top offers decisions ok');

import assert from'node:assert/strict';
import{DECISION_OPTIONS,DEFAULT_DECISION,normalizeDecision,decisionTone,rowClass,buttonHtml}from'../src/curadoria/decision-ui.mjs';

assert.deepEqual(DECISION_OPTIONS.map(option=>option.value),['Não definido','Subir campanha','Campanha no ar','Revisar','Ocultar']);
assert.equal(DEFAULT_DECISION,'Não definido');
assert.equal(normalizeDecision('Novo sinal'),'Não definido');
assert.equal(normalizeDecision('Investigar oferta'),'Revisar');
assert.equal(normalizeDecision('Aprovada para teste'),'Subir campanha');
assert.equal(normalizeDecision('Arquivada'),'Ocultar');
assert.equal(normalizeDecision('valor desconhecido'),'Não definido');
assert.equal(decisionTone('Subir campanha'),'launch');
assert.equal(rowClass('Subir campanha'),'decision-row-launch');
assert.equal(rowClass('Campanha no ar'),'decision-row-live');
assert.equal(rowClass('Revisar'),'');
assert.match(buttonHtml('Campanha no ar','data-example','123'),/decision-badge live/);
assert.match(buttonHtml('Campanha no ar','data-example','123'),/>Campanha no ar<\/button>/);
console.log('decision ui ok');

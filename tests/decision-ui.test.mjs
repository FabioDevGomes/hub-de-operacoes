import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{DECISION_OPTIONS,DEFAULT_DECISION,normalizeDecision,decisionTone,rowClass,buttonHtml}from'../src/curadoria/decision-ui.mjs';

const styles=await readFile(new URL('../src/curadoria/trends-sheet.css',import.meta.url),'utf8');

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
assert.ok(styles.includes('.decision-badge.launch,.decision-option.launch{border-color:#8a6f18;background:#332b0f;color:#ffe46d}'),'Subir campanha não usa o tom amarelo nos botões');
assert.ok(styles.includes('.decision-badge.live,.decision-option.live{border-color:#276249;background:#102d24;color:#83e5bb}'),'Campanha no ar não usa o tom verde nos botões');
assert.ok(styles.includes('.decision-row-launch>td{background:rgba(171,130,35,.2)}'),'linha de Subir campanha não usa destaque amarelo');
assert.ok(styles.includes('.decision-row-live>td{background:rgba(16,74,54,.25)}'),'linha de Campanha no ar não usa destaque verde');
console.log('decision ui ok');

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
assert.match(buttonHtml('Campanha no ar','data-example','123'),/data-curation-focus="decision"/);
assert.match(buttonHtml('Campanha no ar','data-example','123'),/>Campanha no ar<\/button>/);
assert.ok(styles.includes('.decision-badge.launch,.decision-option.launch{border-color:#8a6f18;background:#332b0f;color:#ffe46d}'),'Subir campanha não usa o tom amarelo nos botões');
assert.ok(styles.includes('.decision-badge.live,.decision-option.live{border-color:#276249;background:#102d24;color:#83e5bb}'),'Campanha no ar não usa o tom verde nos botões');
assert.ok(styles.includes('html body .decision-badge{box-shadow:0 3px 9px rgba(0,0,0,.16)}'),'o selo compartilhado ganha sombra leve sem perder as cores semânticas');
assert.ok(styles.includes('html body #rows tr>td:last-child>.status{box-shadow:0 3px 9px rgba(0,0,0,.16)}'),'o status manual próprio do SpyHero recebe a mesma sombra');
assert.ok(styles.includes('#rows tr.decision-row-launch>td{background:rgba(171,130,35,.2)}'),'a mesma decisão Subir campanha deve usar o fundo dourado compartilhado mesmo diante de estilos locais');
assert.ok(styles.includes('#rows tr.decision-row-live>td{background:rgba(16,74,54,.25)}'),'a mesma decisão Campanha no ar deve usar o fundo verde compartilhado mesmo diante de estilos locais');
assert.ok(styles.includes('#rows tr.decision-row-launch:hover>td{background:rgba(190,145,40,.32)!important}')&&styles.includes('#rows tr.decision-row-live:hover>td{background:rgba(20,92,66,.34)!important}'),'o estado de hover mantém os mesmos tons semânticos em todas as listas');
console.log('decision ui ok');

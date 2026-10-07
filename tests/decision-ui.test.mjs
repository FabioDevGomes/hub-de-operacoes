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
assert.ok(styles.includes('.decision-badge.undefined,.decision-option.undefined{border-color:transparent;background:var(--curation-decision-neutral-bg);color:var(--curation-decision-neutral-text)}'),'Não definido deve usar o tom neutro compartilhado');
assert.ok(styles.includes('.decision-badge.launch,.decision-option.launch{border-color:#8a6f18;background:var(--curation-decision-launch-bg);color:var(--curation-decision-launch-text)}'),'Subir campanha não usa o tom amarelo compartilhado');
assert.ok(styles.includes('.decision-badge.live,.decision-option.live{border-color:#276249;background:var(--curation-decision-live-bg);color:var(--curation-decision-live-text)}'),'Campanha no ar não usa o tom verde compartilhado');
assert.ok(styles.includes('.decision-badge.review,.decision-option.review{border-color:#684f25;background:var(--curation-decision-review-bg);color:var(--curation-decision-review-text)}'),'Revisar não usa o tom de alerta compartilhado');
assert.ok(styles.includes('.decision-badge.hide,.decision-option.hide{border-color:#714153;background:var(--curation-decision-hide-bg);color:var(--curation-decision-hide-text)}'),'Ocultar não usa o tom vermelho compartilhado');
assert.ok(styles.includes('button.decision-badge{border:0;font-weight:400;cursor:pointer}'),'o selo compartilhado deve ser uma cápsula sem borda e com texto regular');
assert.ok(styles.includes('html body .decision-badge{box-shadow:0 4px 9px rgba(0,0,0,.55)}'),'o selo compartilhado usa a sombra preta global da tabela');
assert.ok(styles.includes('html body #rows tr td:nth-last-child(2)>.status{padding:5px 9px;border:0;font-size:.74rem;font-weight:400;box-shadow:0 4px 9px rgba(0,0,0,.55)}'),'o status manual próprio do SpyHero acompanha a geometria da cápsula sem mudar suas opções');
assert.ok(styles.includes('#rows tr.decision-row-launch>td{background:var(--curation-decision-launch-row)}'),'a mesma decisão Subir campanha deve usar o fundo dourado compartilhado mesmo diante de estilos locais');
assert.ok(styles.includes('#rows tr.decision-row-live>td{background:var(--curation-decision-live-row)}'),'a mesma decisão Campanha no ar deve usar o fundo verde compartilhado mesmo diante de estilos locais');
assert.ok(styles.includes('#rows tr.decision-row-launch:hover>td{background:var(--curation-decision-launch-row-hover)!important}')&&styles.includes('#rows tr.decision-row-live:hover>td{background:var(--curation-decision-live-row-hover)!important}'),'o estado de hover mantém os mesmos tons semânticos em todas as listas');

const curatedListPages=['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','smartadv-offers/index.html','clickbank-top-offers/index.html'];
for(const pagePath of curatedListPages){
  const page=await readFile(new URL('../src/curadoria/'+pagePath,import.meta.url),'utf8');
  assert.ok(page.includes('trends-sheet.css?v=20261006-curation-decision-column'),`${pagePath} precisa carregar o padrão compartilhado atualizado`);
}
console.log('decision ui ok');

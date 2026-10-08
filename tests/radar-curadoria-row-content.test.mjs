import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [source, built] = await Promise.all([
  read('../src/curadoria/index.html'),
  read('../dist/curadoria/index.html'),
]);
assert.equal(built, source, 'o build publica a fonte canônica');

const rowTemplate = source.match(/\$\('#rows'\)\.innerHTML=filtered\.map\([\s\S]*?\.join\(''\);/)?.[0];
assert.ok(rowTemplate, 'a renderização das linhas do Radar SpyHero continua presente');
assert.doesNotMatch(rowTemplate, /importedAtLabel|SpyHero ·|class="score"|signal\.score/,
  'as linhas não repetem a origem/data nem exibem a pontuação numérica do sinal');
assert.match(rowTemplate, /signalClass\(signal\.decision\)/,
  'o selo textual do sinal automático permanece visível');
assert.match(rowTemplate, /<td class="radar-product-cell hub-edit-host"><div class="product-line"><div class="product">\$\{safe\(x\.name\)\}<\/div><\/div><button type="button" class="hub-corner-edit" data-product-visibility=/,
  'o nome continua na primeira coluna, com Ocultar discreto no canto da célula');
assert.doesNotMatch(rowTemplate, /copy-product|data-copy-product|⧉/,
  'os ícones de copiar foram removidos das linhas');
assert.doesNotMatch(source, /data-copy-product|navigator\.clipboard\.writeText\(product\.name\)/,
  'as linhas não mantêm um listener de cópia para o controle removido');

assert.match(rowTemplate, /<span class="status radar-status-no-dot \$\{signalClass\(signal\.decision\)\}">\$\{safe\(signal\.decision\)\}<\/span>/,
  'sinal automático continua informativo e mantém sua classificação, sem bolinha');
assert.match(rowTemplate, /<button type="button" data-open-radar-decision="\$\{safe\(x\.id\)\}" data-curation-focus="decision" aria-label="Abrir decisão manual de \$\{safe\(x\.name\)\}" class="status radar-status-no-dot /,
  'decisão manual é um botão nativo, identifica a origem e reutiliza o padrão da tabela');
assert.match(rowTemplate, /\$\{safe\(x\.status\)\}<\/button>/,
  'o rótulo da decisão salvo permanece intacto');
assert.ok(source.includes('#rows .radar-status-no-dot::before{content:none}'),
  'somente as etiquetas solicitadas nas linhas perdem o ponto decorativo');
assert.ok(source.includes("document.querySelectorAll('[data-open-radar-decision]').forEach(button=>button.onclick=event=>{event.stopPropagation();openProductSheet(button.dataset.openRadarDecision)})"),
  'a decisão abre a mesma ficha uma única vez, sem propagar o clique para a linha');
assert.ok(source.includes('hub-table-button-behavior'), 'o efeito vem da folha compartilhada, sem cópia local');

console.log('radar curation row content ok');

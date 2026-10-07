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
assert.match(rowTemplate, /<td><div class="product-line"><div class="product">\$\{safe\(x\.name\)\}<\/div><\/div><\/td>/,
  'o nome continua na primeira coluna sem controle adicional ao lado');
assert.doesNotMatch(rowTemplate, /copy-product|data-copy-product|⧉/,
  'os ícones de copiar foram removidos das linhas');
assert.doesNotMatch(source, /data-copy-product|navigator\.clipboard\.writeText\(product\.name\)/,
  'as linhas não mantêm um listener de cópia para o controle removido');

console.log('radar curation row content ok');

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
assert.match(rowTemplate, /class="movement-compact \$\{c\.kind==='Subiu'\?'is-up':c\.kind==='Caiu'\?'is-down':''\}"/,
  'movimento tem texto compacto e cores verdes/vermelhas sem reaproveitar o selo');
assert.match(rowTemplate, /↑ \$\{c\.positionDelta\}[^]*↓ \$\{Math\.abs\(c\.positionDelta\)\}[^]*= 0[^]*safe\(c\.label\)/,
  'subidas, quedas, estabilidade e primeira coleta mantêm sinalização textual');
assert.match(source, /\.movement-compact\.is-up\{color:var\(--green\)\}/);
assert.match(source, /\.movement-compact\.is-down\{color:var\(--red\)\}/);

console.log('radar curation movement display ok');

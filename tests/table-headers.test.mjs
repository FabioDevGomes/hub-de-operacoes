import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entryPages = [
  ['../src/index.template.html', 5],
  ['../src/asset-studio/index.html', 4],
  ['../src/curadoria/glimpse/index.html', 4],
  ['../dist/preparador-MCC/index.html', 4],
];
for (const [file, version] of entryPages) {
  const html = await readFile(new URL(file, import.meta.url), 'utf8');
  assert.match(html, new RegExp(`href="/table-headers\\.css\\?v=${version}"`), `${file} não carrega os estilos globais de tabelas atualizados`);
}

for (const file of [
  '../src/curadoria/index.html',
  '../src/curadoria/gerentes/index.html',
  '../src/curadoria/top-performance/index.html',
  '../src/curadoria/hot-offers-ms/index.html',
  '../src/curadoria/smartadv-offers/index.html',
  '../src/curadoria/clickbank-top-offers/index.html',
]) {
  const html = await readFile(new URL(file, import.meta.url), 'utf8');
  assert.match(html, /trends-sheet\.css\?v=20261006-curation-header-color/, `${file} não carrega a folha compartilhada de curadoria atualizada`);
}
const curationStyles = await readFile(new URL('../src/curadoria/trends-sheet.css', import.meta.url), 'utf8');
assert.match(curationStyles, /^@import url\("\/table-headers\.css\?v=4"\);/, 'as listas de curadoria não importam o padrão global');

const css = await readFile(new URL('../src/table-headers.css', import.meta.url), 'utf8');
assert.match(css, /table thead th[\s\S]*?font-weight:\s*400\s*!important/i);
assert.match(css, /table thead th \*[\s\S]*?font-weight:\s*400\s*!important/i);
assert.match(css, /text-transform:\s*lowercase\s*!important/i);
assert.match(css, /table thead th::first-letter[\s\S]*?text-transform:\s*uppercase\s*!important/i);
assert.match(css, /letter-spacing:\s*normal\s*!important/i);
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?min-height:\s*28px\s*!important/i, 'ações em células de tabela devem compartilhar a altura compacta');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?font-weight:\s*400\s*!important/i, 'ações em células de tabela devem usar peso regular');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?border:\s*0\s*!important/i, 'ações em células de tabela devem ficar sem borda');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?box-shadow:\s*0 4px 9px rgba\(0, 0, 0, \.55\)\s*!important/i, 'ações em células de tabela devem compartilhar a sombra preta aprovada');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\):is\(:hover, :focus-visible\)[\s\S]*?box-shadow:\s*0 5px 12px rgba\(0, 0, 0, \.65\)\s*!important/i, 'hover e foco das ações em tabela devem reforçar apenas a sombra preta');
assert.doesNotMatch(css, /box-shadow:[^;]*(?:rgba\(37,\s*117,\s*205|rgba\(115,\s*159,\s*207)/i, 'o padrão das ações em tabela não deve incluir brilho colorido ou claro');
assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid rgba\(101, 169, 255, \.45\)/i, 'o foco de teclado deve permanecer visível, separado da sombra');
assert.match(css, /\.hub-table-toolbar-actions \.btn[\s\S]*?font-weight:\s*400\s*!important[\s\S]*?border:\s*0\s*!important[\s\S]*?box-shadow:\s*0 4px 9px rgba\(0, 0, 0, \.55\)\s*!important/i, 'ações opcionais no canto da tabela reutilizam peso regular, sem borda e sombra padrão');
assert.match(css, /\.hub-table-toolbar-actions \.btn:is\(:hover, :focus-visible\)[\s\S]*?box-shadow:\s*0 5px 12px rgba\(0, 0, 0, \.65\)\s*!important/i, 'a sombra das ações de canto aumenta em hover/foco');

const build = await readFile(new URL('../build.mjs', import.meta.url), 'utf8');
assert.match(build, /src\/table-headers\.css"\), resolve\(root, "dist\/table-headers\.css"\)/, 'o build não publica o CSS compartilhado');

console.log('table header styles ok');

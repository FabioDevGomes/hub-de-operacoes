import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entryPages = [
  '../src/index.template.html',
  '../src/asset-studio/index.html',
  '../src/curadoria/glimpse/index.html',
  '../dist/preparador-MCC/index.html',
];
for (const file of entryPages) {
  const html = await readFile(new URL(file, import.meta.url), 'utf8');
  assert.match(html, /href="\/table-headers\.css\?v=1"/, `${file} não carrega os estilos globais dos cabeçalhos`);
}

for (const file of ['../src/curadoria/index.html', '../src/curadoria/gerentes/index.html', '../src/curadoria/top-performance/index.html']) {
  const html = await readFile(new URL(file, import.meta.url), 'utf8');
  assert.match(html, /trends-sheet\.css/, `${file} não carrega a folha compartilhada de curadoria`);
}
const curationStyles = await readFile(new URL('../src/curadoria/trends-sheet.css', import.meta.url), 'utf8');
assert.match(curationStyles, /^@import url\("\/table-headers\.css\?v=1"\);/, 'as listas de curadoria não importam o padrão global');

const css = await readFile(new URL('../src/table-headers.css', import.meta.url), 'utf8');
assert.match(css, /table thead th[\s\S]*?font-weight:\s*400\s*!important/i);
assert.match(css, /table thead th \*[\s\S]*?font-weight:\s*400\s*!important/i);
assert.match(css, /text-transform:\s*lowercase\s*!important/i);
assert.match(css, /table thead th::first-letter[\s\S]*?text-transform:\s*uppercase\s*!important/i);
assert.match(css, /letter-spacing:\s*normal\s*!important/i);

const build = await readFile(new URL('../build.mjs', import.meta.url), 'utf8');
assert.match(build, /src\/table-headers\.css"\), resolve\(root, "dist\/table-headers\.css"\)/, 'o build não publica o CSS compartilhado');

console.log('table header styles ok');

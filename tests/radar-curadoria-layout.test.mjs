import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [source, built, layout] = await Promise.all([
  read('../src/curadoria/index.html'),
  read('../dist/curadoria/index.html'),
  read('../src/curadoria/curation-list-layout.css'),
]);
assert.equal(built, source, 'o build publica a fonte canônica');
assert.match(source, /<main class="hub-curation-viewport">/);
assert.ok(source.includes('/curadoria/curation-list-layout.css?v=1'));
assert.doesNotMatch(source, /main:has\(#rows\) \.tablewrap\{max-height:calc\(100vh - 290px\)/,
  'a compensação antiga não pode encobrir o layout compartilhado');
assert.match(layout, /--hub-curation-bottom-gap:\s*8px/);
assert.match(layout, /height:\s*100dvh/);
assert.match(layout, /> \.surface > \.tablewrap\s*\{[^}]*max-height:\s*none/);
assert.match(layout, /@media \(max-width:\s*980px\), \(max-height:\s*599px\)[\s\S]*max-height:\s*none/);

console.log('shared curation viewport layout ok');

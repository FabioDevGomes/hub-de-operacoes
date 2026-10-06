import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const lists = ['index.html', 'gerentes/index.html', 'top-performance/index.html',
  'hot-offers-ms/index.html', 'smartadv-offers/index.html', 'clickbank-top-offers/index.html'];

test('the six curation lists load the same viewport/footer layout in source and build', async () => {
  const css = await read('src/curadoria/curation-list-layout.css');
  assert.equal(await read('dist/curadoria/curation-list-layout.css'), css);
  for (const path of lists) {
    const source = await read(`src/curadoria/${path}`);
    assert.equal(await read(`dist/curadoria/${path}`), source, path);
    assert.match(source, /<main(?: id="[^"]*")? class="hub-curation-viewport">/, path);
    assert.equal((source.match(/hub-curation-viewport/g) || []).length, 1, path);
    assert.ok(source.includes('href="/curadoria/curation-list-layout.css?v=2"'), path);
  }
});

test('desktop uses the actual remaining height rather than a hardcoded header estimate', async () => {
  const css = await read('src/curadoria/curation-list-layout.css');
  assert.match(css, /min-width:\s*981px/);
  assert.match(css, /min-height:\s*600px/);
  assert.match(css, /--hub-curation-bottom-gap:\s*8px/);
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /padding-bottom:\s*var\(--hub-curation-bottom-gap\)\s*!important/);
  assert.match(css, /> \.surface\s*\{[^}]*flex:\s*1 1 0%;[^}]*min-height:\s*0/);
  assert.match(css, /> \.surface > \.tablewrap\s*\{[^}]*flex:\s*1 1 0%;[^}]*max-height:\s*none;[^}]*overflow:\s*auto/);
  assert.doesNotMatch(css, /calc\(100(?:d)?vh\s*-/);
});

test('filters, descriptions and real feedback keep their space, with normal mobile page flow', async () => {
  const css = await read('src/curadoria/curation-list-layout.css');
  assert.match(css, /> \.surface > :not\(\.tablewrap\)\s*\{\s*flex:\s*0 0 auto/);
  assert.match(css, /> :not\(\.surface\)\s*\{\s*flex-shrink:\s*0/);
  assert.match(css, /> \.message:empty\s*\{\s*min-height:\s*0;\s*margin-block:\s*0/);
  assert.match(css, /@media \(max-width:\s*980px\), \(max-height:\s*599px\)[\s\S]*max-height:\s*none/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:main|\.surface|\.tablewrap|table|body)\s*\{/);
  assert.doesNotMatch(css, /(?:color|background|position|font-size)\s*:/);
});

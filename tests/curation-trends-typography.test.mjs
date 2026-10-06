import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const css = await readFile(new URL('src/curadoria/trends-typography.css', root), 'utf8');
const hosts = '#offerSheet [data-panel="trends"],#managerTrendsPanel,#trendsSheetPanel';

test('escala única de Trends tem texto legível sem alterar paleta ou fontes globais', () => {
  assert.ok(css.includes(`html body :is(${hosts}){`));
  for (const [name,value] of [['body','.9rem'],['detail','.875rem'],['heading','1.125rem'],['tag','.75rem']]) {
    assert.ok(css.includes(`--trends-font-${name}:${value};`));
    assert.ok(css.includes(`font-size:var(--trends-font-${name});`));
  }
  assert.match(css,/font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif/);
  assert.match(css,/font-family:inherit/);
  assert.match(css,/line-height:1\.45/);
  assert.doesNotMatch(css,/(?:background|color|border|box-shadow):/);
  for (const selector of css.split('}').filter(block=>block.includes('{'))) {
    assert.ok(selector.includes('html body :is('),'cada regra deve ficar restrita aos hosts Trends');
  }
});

test('controles mantêm alinhamento, alvos legíveis e resultado pode quebrar texto', () => {
  assert.match(css,/display:inline-flex;\s*align-items:center;\s*justify-content:center;\s*min-height:36px/);
  assert.match(css,/\.control\{\s*min-height:38px/);
  assert.match(css,/\.trends-result-action\{\s*min-height:40px;\s*white-space:normal/);
  assert.match(css,/:has\(\[data-panel="trends"\]:not\(\.hidden\)\)/);
  assert.match(css,/:has\(#managerTrendsPanel:not\(\.hidden\)\)/);
  assert.match(css,/:has\(#trendsSheetPanel:not\(\.hidden\)\)/);
});

test('seis hosts carregam a folha versionada, import tipográfico e publicação idêntica', async () => {
  for (const path of ['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','smartadv-offers/index.html','clickbank-top-offers/index.html']) {
    const page = await readFile(new URL(`src/curadoria/${path}`,root),'utf8');
    assert.match(page,/trends-sheet\.css\?v=20261006-curation-header-color/);
    assert.ok(page.includes(path==='index.html'?'id="trendsSheetPanel"':path==='gerentes/index.html'?'id="managerTrendsPanel"':'data-panel="trends"'));
  }
  assert.match(await readFile(new URL('src/curadoria/trends-sheet.css',root),'utf8'),/@import url\("\.\/trends-typography\.css\?v=1"\)/);
  assert.equal(await readFile(new URL('dist/curadoria/trends-typography.css',root),'utf8'),css);
});

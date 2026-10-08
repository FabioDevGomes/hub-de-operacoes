import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('overview campaign cells have another 10% less vertical padding without changing horizontal spacing or typography',async()=>{
  const css=await read('src/overview/overview.css');
  assert.equal(css,await read('dist/overview/overview.css'));
  const declarations=css.match(/#totalsView \.totals-table td\{([^}]+)\}/)[1];
  const padding=declarations.match(/padding:([\d.]+)px ([\d.]+)px/);
  assert.equal(Number(padding[1]),Number((7.2*0.9).toFixed(2)));
  assert.equal(Number(padding[2]),10);
  assert.ok(declarations.includes('line-height:1.35'));
  assert.ok(declarations.includes('border-bottom:1px solid #2a3c54'));
  assert.ok(css.includes('table-layout:fixed;font-size:.78rem'));
  assert.ok(css.includes('min-height:50px;padding-block:6px'));
  for(const path of ['src/index.template.html','dist/index.html'])
    assert.ok((await read(path)).includes('overview/overview.css?v=50'));
});

test('only rows containing the test-limit second line reduce vertical spacing by another 10% after 15%',async()=>{
  const css=await read('src/overview/overview.css');
  const selector='#totalsView .totals-table tbody tr:has(td[data-column="limit"] .test-budget-detail)>td';
  const rule=css.split(selector+'{')[1]?.split('}')[0];
  assert.equal(rule,'padding-block:'+Number((5.508*0.9).toFixed(4))+'px');
  const detail=css.split('#totalsView .totals-table td[data-column="limit"] .test-budget-detail{')[1]?.split('}')[0];
  assert.equal(detail,'margin-top:'+Number((1.7*0.9).toFixed(2))+'px');
  assert.ok(css.includes('#totalsView .totals-table .test-budget-detail{font-size:.65rem}'));
  assert.ok(css.includes('.test-budget-detail{display:block;margin-top:2px;color:#88a5c2;font-size:.62rem;line-height:1.2}'));
  assert.ok(css.includes('.test-budget-commission-link{white-space:normal;line-height:1.35;overflow-wrap:break-word}'));
  assert.equal(css,await read('dist/overview/overview.css'));
});

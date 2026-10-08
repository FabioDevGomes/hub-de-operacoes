import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
test('existing tabbed offer sheets share the documented bar and blue Save finish',async()=>{
  for(const page of ['top-performance','clickbank-top-offers','hot-offers-ms','smartadv-offers']){
    const html=await read('src/curadoria/'+page+'/index.html');
    assert.ok(html.includes('analysis-sheet-bar.css?v=3'),page);
    assert.ok(html.includes('white-button.css?v=5'),page);
    assert.ok(html.includes('trends-sheet.css?v=20261007-glimpse-borderless-standard-bar'),page);
    assert.equal(html,await read('dist/curadoria/'+page+'/index.html'));
  }
  const css=await read('src/curadoria/analysis-sheet-bar.css');
  assert.equal(css,await read('dist/curadoria/analysis-sheet-bar.css'));
  assert.ok(css.includes('position:sticky;top:0'));
  assert.ok(css.includes('background:#0a1627;border:0;border-radius:11px'));
  assert.ok(css.includes('min-height:34px;padding:7px 11px;font-size:1rem;line-height:normal'));
  assert.ok(css.includes('@media(max-width:760px)')&&css.includes('overflow-x:auto'));
  assert.ok((await read('src/white-button.css')).includes('body[data-hub-green-actions] .sheet-tab-bar .sheet-bar-actions>.btn.primary{'));
  assert.ok((await read('docs/curation-analysis-pattern.md')).includes('face sólida'));
  for(const page of ['gerentes','glimpse']){
    const html=await read('src/curadoria/'+page+'/index.html');
    assert.ok(html.includes('white-button.css?v=2'));
    assert.ok(!html.includes('analysis-sheet-bar.css'),'no new tabbed sheet in '+page);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');

test('Blue Save retains cream bevel geometry with a blue-only palette', async()=>{
  const [css,trends,page]=await Promise.all([read('src/white-button.css'),read('src/curadoria/trends-sheet.css'),read('src/curadoria/top-performance/index.html')]);
  assert.equal(css,await read('dist/white-button.css'));
  assert.equal(trends,await read('dist/curadoria/trends-sheet.css'));
  assert.equal(page,await read('dist/curadoria/top-performance/index.html'));
  assert.ok(page.includes('/white-button.css?v=5'));
  assert.ok(page.includes('trends-sheet.css?v=20261007-glimpse-borderless-standard-bar'));
  const target='body[data-hub-green-actions] .sheet-tab-bar .sheet-bar-actions>.btn.primary';
  const variant=css.split(target+'{')[1]?.split('}')[0];
  assert.ok(variant,'only the scoped Save controls adopt the automatic variant');
  assert.ok(css.includes('body .btn.hub-white-button.hub-blue-button,'),'variant is reusable by explicit opt-in');
  assert.ok(variant.includes('background:var(--hub-blue-button-face,#30a3d7)!important'));
  assert.ok(variant.includes('filter:none'));
  assert.ok(!/(?:^|;)\s*(?:border|box-shadow|padding|font|border-radius|height|width|transform)\s*:/.test(variant),'the palette does not redefine bevel geometry or dimensions');
  assert.ok(variant.includes('--hub-bevel-top:#a6def8')&&variant.includes('--hub-bevel-base:#1f6f9b'));
  assert.ok(!/#fff|#b5a68e|#b3a48d|#eee4d2/.test(variant),'blue variant contains no cream contour colors');
  assert.ok(css.includes('rgba(var(--hub-bevel-rim,255,250,239),.95)')&&css.includes('rgba(var(--hub-bevel-shine,255,255,255),.7)'),'hover and active inherit the blue palette');
  assert.ok(css.includes('.5px 1px 0 var(--hub-bevel-base,#b5a68e)'),'disabled uses the same palette');
  const cb=await read('src/curadoria/clickbank-top-offers/index.html');
  assert.ok(cb.includes('/white-button.css?v=5')&&cb.includes('glimpse-borderless-standard-bar'));
  assert.equal(cb,await read('dist/curadoria/clickbank-top-offers/index.html'));
  assert.ok(trends.includes('.glimpse-host-finish:not(:where('+target+')){border:0!important'));
  assert.ok(trends.includes('background:linear-gradient(135deg,#278de9,#38b9c5)!important'),'other origins retain their prior blue design');
  assert.ok(css.includes('1px 3px 0 var(--hub-bevel-base,#b5a68e)')&&css.includes('inset 1.5px 1.5px 1px'),'approved shallow bevel retained');
});
test('save still uses the existing iframe confirmation; no new handler or persistence',async()=>{
  const helper=await read('src/curadoria/glimpse-reference-bar.mjs');
  const shortcut=await read('src/curadoria/glimpse-shortcut.mjs');
  assert.ok(helper.includes("save.className='btn primary'"));
  assert.ok(helper.includes("finishLabel:'Salvar',showSavedFeedback:true"));
  assert.ok(shortcut.includes("mountGlimpseReferenceBar({sheet,frame,panel,backButton:sheet.querySelector('#closeSheet')})"));
  assert.ok(!shortcut.includes('hub-blue-button'),'presentation does not add another saving action');
});

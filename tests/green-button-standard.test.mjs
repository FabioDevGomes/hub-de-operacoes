import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
const read = f => readFile(new URL('../'+f,import.meta.url),'utf8');
const pages = ['gerentes','top-performance','hot-offers-ms','clickbank-top-offers','smartadv-offers','glimpse'];

test('green action pages load the shared finish for existing and dynamically inserted actions', async () => {
  for(const page of pages){
    const source=await read('src/curadoria/'+page+'/index.html');
    assert.match(source, /<body data-hub-green-actions="[a-z]+">/);
    assert.ok(source.includes('/white-button.css?v='+(['top-performance','clickbank-top-offers','hot-offers-ms','smartadv-offers'].includes(page)?'5':'2')), page);
    assert.equal((source.match(/white-button\.css/g)||[]).length,1);
    assert.equal(source,await read('dist/curadoria/'+page+'/index.html'),page+' publication');
  }
  const radar=await read('src/curadoria/index.html');
  assert.ok(radar.includes('/white-button.css?v=2'));
  assert.ok(!radar.includes('<body data-hub-green-actions'), 'Radar primaries remain blue');
});
test('green actions share the approved bevel without targeting semantic colors or layout', async () => {
  const css=await read('src/white-button.css');
  assert.equal(css,await read('dist/white-button.css'));
  assert.equal(css,await read('extensions/mcc-d0-bridge/white-button.css'));
  const action='body[data-hub-green-actions] :is(.btn,.button).primary:not(:where(main>header>:is(.actions,.hero-actions)>*,.hub-standard-action,[data-hub-green-actions="clickbank"] .import-dialog .btn))';
  const candidate='body .keyword-candidate:not(.image-candidate) .keyword-candidate-search';
  for(const state of ['',':hover:not(:disabled)',':focus-visible',':active:not(:disabled)',':disabled']){
    assert.ok(css.includes(action+state+',\n'+candidate+state+',\nbody .btn.hub-white-button'+state+'{'),state);
  }
  assert.equal((css.match(/#fffaf0 0%/g)||[]).length,1,'one canonical face for all consumers');
  assert.ok(!/\.(?:trends-country-action|decision-option|decision-badge|trends-badge|image-result-action|glimpse-badge|sale-country)\b/.test(css),'semantic controls retain colors');
  const face=css.split('body .btn.hub-white-button{')[1].split('}')[0];
  assert.ok(face.includes('font-family:Arial,Helvetica,sans-serif!important'),'approved typeface overrides local sheet typography only on adopted actions');
  assert.ok(!/(?:^|;)\s*(?:padding|margin|width|height|font-size|position|display)\s*:/.test(face),'local dimensions retained');
  assert.ok(css.includes(action+',\n'+candidate+'{transition:none}'));
  assert.ok(css.includes(candidate+':active:not(:disabled){transform:none}'));
});
test('popup migrates only its two green actions and preserves IDs, captures and permissions', async () => {
  const popup=await read('extensions/mcc-d0-bridge/popup.html');
  const manifest=JSON.parse(await read('extensions/mcc-d0-bridge/manifest.json'));
  for(const id of ['capture-d0','capture-clickbank']){
    assert.ok(popup.includes('id="'+id+'" class="compact-action btn hub-white-button"'));
  }
  for(const id of ['capture-d1','restore-clickbank','capture-dtc-countries']){
    assert.ok(popup.includes('id="'+id+'" class="secondary compact-action"'));
  }
  assert.equal((popup.match(/hub-white-button/g)||[]).length,2);
  assert.ok(popup.includes('href="white-button.css"'),'local Chrome asset, not a remote stylesheet');
  assert.equal(manifest.version,'1.2.21');
  assert.deepEqual(manifest.permissions,['scripting','activeTab','clipboardWrite']);
  assert.deepEqual(manifest.host_permissions,['http://127.0.0.1:8765/preparador-MCC/*','http://127.0.0.1:8765/curadoria/clickbank-top-offers/*']);
  assert.ok((await read('build.mjs')).includes('resolve(root, "extensions/mcc-d0-bridge/white-button.css")'));
});

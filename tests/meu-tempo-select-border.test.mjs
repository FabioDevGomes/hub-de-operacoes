import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('daily value selectors hide only decorative borders and retain geometry, focus and errors',async()=>{
  const [css,published,view]=await Promise.all([read('src/meu-tempo/meu-tempo.css'),read('dist/meu-tempo/meu-tempo.css'),read('src/meu-tempo/meu-tempo-view.mjs')]);
  const selector='body.time-mode .time-daily-table-wrap select.time-select[data-value]';
  assert.equal(css,published);
  assert.equal(css.split(selector+'{')[1]?.split('}')[0],'border-color:transparent');
  assert.ok(css.includes(selector+':focus-visible{outline:2px solid var(--blue);outline-offset:2px}'));
  assert.ok(css.includes(selector+':is([aria-invalid="true"],.invalid,.error,:invalid){border-color:var(--red)}'));
  assert.ok(css.includes('.time-input,.time-select,.time-textarea{background:#071426;border:1px solid var(--line);border-radius:9px;color:var(--text);padding:8px 10px;outline:none}'));
  assert.ok(css.includes('.time-table .time-input,.time-table .time-select{padding:3px 7px}'));
  assert.ok(css.includes('.time-table .value-input{width:110px}'));
  assert.equal((view.match(/<select class="time-select value-input" data-value=/g)||[]).length,2,'boolean and symptom selects share the same scoped rule');
  assert.ok(view.includes('<option value="">Escolha</option><option value="1">Sim</option><option value="0">Não</option>'));
  assert.ok(view.includes('Domain.SYMPTOM_SCALE_OPTIONS.map'));
  for(const path of ['src/index.template.html','dist/index.html'])assert.ok((await read(path)).includes('meu-tempo/meu-tempo.css?v=32'));
});

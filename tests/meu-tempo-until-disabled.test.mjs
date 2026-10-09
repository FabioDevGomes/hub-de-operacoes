import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as Domain from '../src/meu-tempo/meu-tempo-domain.mjs';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const view = await read('src/meu-tempo/meu-tempo-view.mjs');
const rowSource = view.match(/function dailyItemRow\(item,categories,daily,today\)\{[\s\S]*?\n\}/)[0];
const item = {id:'test-activity', name:'Atividade de teste', type:'duration', productive:false};

test('Até agora permanece habilitado somente hoje, inclusive na virada de mês/ano', () => {
  for (const today of ['2026-10-08','2027-01-01','2028-03-01']) {
    for (const offset of [-1,0,1]) {
      const selectedDate = Domain.shiftDate(today,offset);
      const row = new Function('Domain','selectedDate','esc','formatValues',`${rowSource};return dailyItemRow;`)(Domain,selectedDate,String,()=> '—');
      const markup = row(item,new Map(),Domain.aggregateDay([],selectedDate),today);
      const until = markup.match(/<button[^>]*data-until="test-activity"[^>]*>/)[0];
      assert.equal(/\bdisabled\b/.test(until),offset !== 0);
      if(offset !== 0) assert.match(until,/disponível somente no dia atual/);
      assert.ok(!/\bdisabled\b/.test(markup.match(/<button[^>]*data-interval="test-activity"[^>]*>/)[0]),'Intervalo continua disponível');
      assert.ok(!/\bdisabled\b/.test(markup.match(/<input[^>]*data-manual="test-activity"[^>]*>/)[0]),'lançamento manual continua disponível');
    }
  }
});

test('estilo desabilitado é local, sem sombra/hover e publicado com cache atualizado', async () => {
  const [css,published,app] = await Promise.all([read('src/meu-tempo/meu-tempo.css'),read('dist/meu-tempo/meu-tempo.css'),read('dist/index.html')]);
  assert.equal(published,css);
  const rule = css.match(/html body\.time-mode table\.time-table tbody td button\[data-until\]:disabled\{([^}]+)\}/)?.[1];
  assert.ok(rule,'estado visual deve ser restrito a Até agora desabilitado');
  for(const declaration of ['opacity:.45','cursor:not-allowed','background:#0a1627!important','color:var(--muted)!important','box-shadow:none!important','filter:none!important','transform:none!important']) assert.ok(rule.includes(declaration),declaration);
  assert.ok(!/outline|padding|height|width|pointer-events/.test(rule),'não alterar geometria, foco ou tooltip');
  assert.ok(app.includes('meu-tempo/meu-tempo.css?v=32'));
});

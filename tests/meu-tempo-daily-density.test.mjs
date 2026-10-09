import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Lançamento rápido compacta somente corpo/controles da tabela sem reduzir fontes',async()=>{
  const css=await read('src/meu-tempo/meu-tempo.css');
  assert.equal(css,await read('dist/meu-tempo/meu-tempo.css'));
  assert.ok(css.includes('body.time-mode .time-daily-table-wrap .time-table tbody td{padding-top:2.65px;padding-bottom:2.65px}'));
  const button=css.match(/html body\.time-mode \.time-daily-table-wrap table\.time-table tbody td button\.time-mini\{([^}]+)\}/)?.[1];
  assert.ok(button);
  assert.match(button,/min-height:25\.2px!important/);
  assert.match(button,/padding-block:4px!important/);
  assert.match(button,/display:inline-flex;align-items:center;justify-content:center/);
  assert.doesNotMatch(button,/font|line-height|outline|box-shadow|width|overflow|transform/);
  assert.ok(css.includes('.time-table th,.time-table td{padding:3px 7px}'),'other tables retain their existing geometry');
  assert.ok(css.includes('.time-table{font-size:.77rem}'));
  assert.ok(css.includes('.time-history-table-wrap .time-table td{padding:2px 6px}'));
  assert.ok(css.includes('button[data-until]:disabled{opacity:.45'));
  assert.ok((await read('src/table-headers.css')).includes('font-size: .73rem !important'));
  assert.ok((await read('dist/index.html')).includes('meu-tempo/meu-tempo.css?v=32'));
});

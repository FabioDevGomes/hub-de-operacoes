import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('tag de instalação nas Configurações globais usa o campo azul padrão do Tracking',async()=>{
  const [html,view,sourceCss,distCss]=await Promise.all([
    readFile(new URL('../dist/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/tracking/tracking-global-settings-view.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/tracking/tracking.css',import.meta.url),'utf8'),
    readFile(new URL('../dist/tracking/tracking.css',import.meta.url),'utf8')
  ]);
  assert.ok(html.includes('/tracking/tracking.css?v=36'));
  assert.ok(view.includes('id="trackingGlobalPresellScript" rows="3" readonly'));
  assert.ok(view.includes('class="tracking-tag-dialog-backdrop"')&&!view.includes('class="tracking-email-config-body"'));
  assert.match(sourceCss,/\.tracking-tag-dialog textarea,[\s\S]*?background: var\(--panel2, #13243a\);[\s\S]*?color: var\(--hub-primary-text, #c3cede\);/);
  assert.match(sourceCss,/\.tracking-tag-dialog textarea:focus-visible,[\s\S]*?outline: 2px solid var\(--hub-control-focus, #5ab1ff\);/);
  assert.equal(distCss,sourceCss);
});

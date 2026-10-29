import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mount } from '../src/tracking/tracking-gurumedia-view.mjs';

function makeRoot() {
  const listeners = new Map();
  return {
    isConnected: true,
    ownerDocument: null,
    innerHTML: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type, event) { return listeners.get(type)?.(event); },
    querySelector() { return null; },
  };
}

function clickAction(action) {
  return { target: { closest: () => ({ dataset: { gurumediaAction: action } }) } };
}

test('configurações do postback começam recolhidas e podem ser exibidas sem perder os valores', () => {
  const root = makeRoot();
  const controller = mount({
    root,
    getAccountRows: () => [],
    readActionSettings: () => ({ settings: [], invalid: false, available: true }),
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });

  try {
    assert.match(root.innerHTML, /data-gurumedia-action="toggle-postback-config"[^>]*aria-expanded="false">Exibir configurações/);
    assert.match(root.innerHTML, /id="guruMediaPostbackConfig" class="tracking-connection-config" hidden>/);

    root.fire('input', { target: { id: 'guruMediaOfferIdMacro', value: '{offerid}' } });
    root.fire('click', clickAction('toggle-postback-config'));

    assert.match(root.innerHTML, /data-gurumedia-action="toggle-postback-config"[^>]*aria-expanded="true">Recolher configurações/);
    assert.match(root.innerHTML, /id="guruMediaPostbackConfig" class="tracking-connection-config">/);
    assert.match(root.innerHTML, /id="guruMediaOfferIdMacro"[^>]*value="\{offerid\}"/);

    root.fire('click', clickAction('toggle-postback-config'));
    assert.match(root.innerHTML, /aria-expanded="false">Exibir configurações/);
    assert.match(root.innerHTML, /id="guruMediaPostbackConfig" class="tracking-connection-config" hidden>/);
  } finally {
    controller.destroy();
  }
});

test('o build publica a tela GuruMedia com a versão de módulo atualizada', async () => {
  const [html, sourceView, distView] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/tracking/tracking-gurumedia-view.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/tracking/tracking-gurumedia-view.mjs', import.meta.url), 'utf8'),
  ]);
  assert.ok(html.includes("import('./tracking/tracking-gurumedia-view.mjs?v=11')"));
  assert.equal(distView, sourceView);
});

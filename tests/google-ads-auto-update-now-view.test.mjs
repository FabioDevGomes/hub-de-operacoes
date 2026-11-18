import assert from 'node:assert/strict';
import { mount } from '../src/google-ads/google-ads-view.mjs';

const priorDocument = globalThis.document;
const priorWindow = globalThis.window;
const priorStorage = globalThis.localStorage;
const nodes = new Map();

function makeNode() {
  const listeners = new Map();
  return {
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {},
    querySelector: () => makeNode(),
    querySelectorAll: () => [],
    addEventListener: (event, callback) => listeners.set(event, callback),
    fire: event => listeners.get(event)?.(),
  };
}

const root = {
  innerHTML: '',
  addEventListener() {},
  querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, makeNode());
    return nodes.get(selector);
  },
};

try {
  globalThis.document = { addEventListener() {}, dispatchEvent() {} };
  globalThis.window = { addEventListener() {} };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  let calls = 0;
  mount({
    root,
    getGoogleAdsAutoUpdateStatus: () => ({ enabled: false, supported: true, state: 'disabled' }),
    async onGoogleAdsRunNow() {
      calls += 1;
      return { started: true, savedCount: 1, failures: [] };
    },
  });

  assert.match(root.innerHTML, /Executar atualização agora/);
  await nodes.get('#googleAdsRunAutomaticUpdateNow').fire('click');
  assert.equal(calls, 1, 'o clique encaminha uma execução imediata ao adaptador');
  assert.match(nodes.get('#googleAdsRunAutomaticUpdateStatus').textContent, /Atualização concluída/);
  assert.equal(nodes.get('#googleAdsRunAutomaticUpdateNow').disabled, false, 'o botão volta a ficar disponível depois da conclusão');
} finally {
  globalThis.document = priorDocument;
  globalThis.window = priorWindow;
  globalThis.localStorage = priorStorage;
}

console.log('Google Ads API immediate update button invokes the adapter and shows completion.');

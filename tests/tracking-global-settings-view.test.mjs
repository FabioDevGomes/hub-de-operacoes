import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { mount } from '../src/tracking/tracking-global-settings-view.mjs';
import { saveTrackingDomainList } from '../src/tracking/tracking-domain-list-storage.mjs';

function makeRoot() {
  const listeners = new Map();
  return {
    isConnected: true,
    innerHTML: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    fire(type, event) { return listeners.get(type)?.(event); },
  };
}

function installLocalStorage() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  };
}

test('tokens de API ficam mascarados visualmente sem serem campos de senha do navegador', async () => {
  const restoreStorage = installLocalStorage();
  try {
    const root = makeRoot();
    const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
    const dist = await readFile(new URL('../dist/tracking/tracking-global-settings-view.mjs', import.meta.url), 'utf8');
    const cssDist = await readFile(new URL('../dist/tracking/tracking.css', import.meta.url), 'utf8');

    assert.match(html, /tracking-global-settings-view\.mjs\?v=\d+/, 'o HTML deve publicar a view com versão de cache');
    assert.match(html, /\/tracking\/tracking\.css\?v=\d+/, 'o HTML deve publicar o CSS com versão de cache');
    assert.match(dist, /id="globalHubToken" name="tracking_api_token" type="text" class="tracking-token-input is-masked"/);
    assert.match(dist, /id="globalDomainAdminToken" name="tracking_domain_admin_token" type="text" class="tracking-token-input\$\{state\.showAdminToken/);
    assert.match(dist, /id="trackingEmailSmtpPassword" type="password"/, 'a senha SMTP real continua sendo um campo de senha');
    assert.match(cssDist, /\.tracking-token-input\.is-masked\s*\{\s*-webkit-text-security:\s*disc;\s*\}/);
    mount({ root });

    const hubToken = root.innerHTML.match(/<input id="globalHubToken"[^>]*>/)?.[0] || '';
    const adminToken = root.innerHTML.match(/<input id="globalDomainAdminToken"[^>]*>/)?.[0] || '';
    assert.match(hubToken, /type="text"/);
    assert.match(hubToken, /class="tracking-token-input is-masked"/);
    assert.match(hubToken, /autocomplete="off"/);
    assert.match(adminToken, /type="text"/);
    assert.match(adminToken, /class="tracking-token-input is-masked"/);
    assert.match(adminToken, /autocomplete="off"/);
    assert.match(root.innerHTML, /id="trackingEmailSmtpPassword" type="password"/, 'a senha SMTP real mantém o campo nativo de senha');
    root.fire('change', { target: { id: 'globalShowAdminToken', checked: true } });
    const revealedAdminToken = root.innerHTML.match(/<input id="globalDomainAdminToken"[^>]*>/)?.[0] || '';
    assert.match(revealedAdminToken, /type="text"/);
    assert.match(revealedAdminToken, /class="tracking-token-input"/);
    assert.doesNotMatch(revealedAdminToken, /is-masked/);
  } finally {
    restoreStorage();
  }
});

test('Exibir tag abre um pop-up acessível; copiar mantém o pop-up aberto e Escape fecha', async () => {
  const restoreStorage = installLocalStorage();
  try {
    const host = 'metabo.zinvero.shop';
    const row = { hostname: host, origin: `https://${host}`, productKey: 'metabo-zinvero', productLabel: 'Metabo Drops - Zinvero' };
    assert.equal(saveTrackingDomainList([row], globalThis.localStorage, new Date('2026-10-26T14:00:00.000Z')).saved, true);
    const root = makeRoot();
    const copied = [];
    mount({ root, clipboard: { writeText: async value => copied.push(value) } });
    const click = (action, selectedHost = host) => root.fire('click', {
      target: { closest: () => ({ dataset: { globalAction: action, host: selectedHost } }) },
    });

    assert.doesNotMatch(root.innerHTML, /trackingGlobalTagDialog/);
    click('show-tag');
    assert.match(root.innerHTML, /class="tracking-tag-dialog-backdrop"/);
    assert.match(root.innerHTML, /id="trackingGlobalTagDialog"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(root.innerHTML, /id="trackingGlobalPresellScript"[^>]*readonly/);
    assert.doesNotMatch(root.innerHTML, /class="tracking-email-config-body"/);

    click('copy-tag');
    await Promise.resolve();
    assert.equal(copied.length, 1);
    assert.match(copied[0], /data-presell-host="metabo\.zinvero\.shop"/);
    assert.match(root.innerHTML, /Tag copiada\./);
    assert.match(root.innerHTML, /id="trackingGlobalTagDialog"/);

    let prevented = false;
    root.fire('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.doesNotMatch(root.innerHTML, /trackingGlobalTagDialog/);
  } finally {
    restoreStorage();
  }
});

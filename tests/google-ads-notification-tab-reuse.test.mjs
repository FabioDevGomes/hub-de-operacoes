import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const background = await readFile(new URL('../extensions/hub-2.0/background.js', import.meta.url), 'utf8');
const extensionManifest = JSON.parse(await readFile(new URL('../extensions/hub-2.0/manifest.json', import.meta.url), 'utf8'));
const extensionReadme = await readFile(new URL('../extensions/hub-2.0/README.md', import.meta.url), 'utf8');
assert.match(extensionManifest.version, /^\d+\.\d+\.\d+$/);
assert.ok(extensionReadme.includes(`Versão da extensão: \`${extensionManifest.version}\`.`), 'README e manifest da extensão devem apresentar a mesma versão');
const helperStart = background.indexOf('const HUB_ORIGIN =');
const helperEnd = background.indexOf('function waitUntilLoaded', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'notification tab helpers should exist in the extension service worker');

async function runOpenNotification({ tabs, sender, openIfMissing = true }) {
  const calls = [];
  const context = vm.createContext({
    URL,
    chrome: {
      tabs: {
        query: async query => { calls.push(['query', query]); return tabs; },
        update: async (id, options) => {
          calls.push(['update', id, options]);
          const tab = tabs.find(item => item.id === id);
          if (options.url) tab.url = options.url;
          tab.active = Boolean(options.active);
          return tab;
        },
        create: async options => { calls.push(['create', options]); return { id: 99 }; },
      },
      windows: {
        get: async id => ({ id, state: 'normal' }),
        update: async (id, options) => { calls.push(['window-update', id, options]); },
      },
    },
  });
  vm.runInContext(`${background.slice(helperStart, helperEnd)}\nglobalThis.openNotificationTab = openOrActivateHubNotificationTab;`, context);
  const result = await context.openNotificationTab('http://127.0.0.1:8765/?view=google-ads&googleAdsHistoryId=auto-run-2026-11-01', sender, { openIfMissing });
  return { result, calls, tabs };
}

const sender = { url: 'http://127.0.0.1:8765/?view=totals', tab: { id: 1, windowId: 10 } };

test('reuses and navigates an existing Snapshots da Operação tab to the requested capture', async () => {
  const existing = { id: 2, windowId: 20, active: false, url: 'http://127.0.0.1:8765/?view=google-ads' };
  const { result, calls, tabs } = await runOpenNotification({ tabs: [existing], sender });

  assert.equal(result.matched, true);
  assert.equal(result.opened, false);
  assert.equal(tabs[0].url, 'http://127.0.0.1:8765/?view=google-ads&googleAdsHistoryId=auto-run-2026-11-01');
  assert.ok(calls.some(call => call[0] === 'update' && call[1] === 2 && call[2].url === tabs[0].url), 'navega a aba existente para o snapshot solicitado');
  assert.ok(calls.some(call => call[0] === 'window-update' && call[1] === 20 && call[2].focused), 'foca a janela que contém a aba reutilizada');
  assert.ok(!calls.some(call => call[0] === 'create'), 'não cria outra aba quando já existe uma aba Snapshots da Operação');
});

test('reuses a Snapshots da Operação tab even when it is displaying a different capture', async () => {
  const existing = { id: 3, windowId: 30, active: false, url: 'http://127.0.0.1:8765/?view=google-ads&googleAdsHistoryId=older-capture' };
  const { result, calls, tabs } = await runOpenNotification({ tabs: [existing], sender });

  assert.equal(result.matched, true);
  assert.equal(tabs[0].url, 'http://127.0.0.1:8765/?view=google-ads&googleAdsHistoryId=auto-run-2026-11-01');
  assert.ok(calls.some(call => call[0] === 'update' && call[1] === 3 && call[2].url === tabs[0].url));
  assert.ok(!calls.some(call => call[0] === 'create'));
});

test('activates an existing tab already showing the requested capture', async () => {
  const targetUrl = 'http://127.0.0.1:8765/?view=google-ads&googleAdsHistoryId=auto-run-2026-11-01';
  const existing = { id: 2, windowId: 20, active: false, url: targetUrl };
  const { result, calls } = await runOpenNotification({ tabs: [existing], sender });

  assert.equal(result.matched, true);
  assert.ok(calls.some(call => call[0] === 'update' && call[1] === 2 && call[2].active), 'ativa a aba já posicionada no snapshot');
  assert.ok(!calls.some(call => call[0] === 'create'), 'não cria uma duplicata do mesmo snapshot');
});

test('opens a new tab only when no Snapshots da Operação tab is available', async () => {
  const { result, calls } = await runOpenNotification({ tabs: [], sender });

  assert.equal(result.opened, true);
  assert.ok(calls.some(call => call[0] === 'create' && call[1].url === 'http://127.0.0.1:8765/?view=google-ads&googleAdsHistoryId=auto-run-2026-11-01'));
});

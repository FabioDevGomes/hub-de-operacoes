import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import { createRoot, format } from './helpers/view-dom.mjs';

const context = vm.createContext({ window: {}, setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {} });
vm.runInContext(await readFile(new URL('../src/overview/view.js', import.meta.url), 'utf8'), context);
const overviewDomain = await readFile(new URL('../src/overview-domain.js', import.meta.url), 'utf8');

function mount(actions, confirm = () => true) {
  context.window.confirm = confirm;
  vm.runInContext(overviewDomain, context);
  const { root, get } = createRoot();
  root.classList = { toggle() {} };
  const controller = context.window.OverviewView.mount({
    root,
    state: { totalsMode: 'consolidated', sortKey: 'current', sortDir: 'desc', campaignStatusFilter: 'active', rate: 5.1 },
    getSnapshot: () => ({ rows: [], dates: {}, d1Totals: [], apiCaptureSnapshots: [], autoPauseHistory: [] }),
    domain: context.window.OverviewDomain,
    format,
    preferences: { getItem: () => null, setItem: () => {} },
    actions,
  });
  controller.render();
  get('#openAutoPauseReport').onclick();
  return { get };
}

const blockedPreflight = {
  authority: 'hub', ready: false, transfer_supported: false,
  blockers: ['snapshot_evaluator_does_not_create_jobs'],
  latest_evaluation: { snapshot_state: 'partially_blocked', candidate_count: 0, evaluation_mode: 'shadow' },
  server_jobs: { pending_count: 4, processing_count: 0 },
};

test('simula a troca bloqueada sem migração: mantém Hub e nunca solicita troca ao servidor', async () => {
  let setAuthorityCalls = 0;
  const { get } = mount({
    getAutoPauseServerCutoverPreflight: async () => blockedPreflight,
    setAutoPauseServerExecutionAuthority: async () => { setAuthorityCalls++; throw new Error('não deveria ser chamada'); },
  });
  get('#overviewAutoPauseServerCutover').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(setAuthorityCalls, 0);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /Autoridade atual: Hub/);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /modo sombra e não criam jobs/);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /4 job\(s\) pendente\(s\) serão encerrados como skipped e preservados somente se a transferência for concluída/);
});

test('simula uma transferência pronta com jobs pendentes usando ações falsas', async () => {
  let requestedAuthority = '';
  let confirmation = '';
  const { get } = mount({
    getAutoPauseServerCutoverPreflight: async () => ({
      authority: 'hub', ready: true, transfer_supported: true, blockers: [],
      latest_evaluation: { snapshot_state: 'evaluated', candidate_count: 2, evaluation_mode: 'server' },
      server_jobs: { pending_count: 6, processing_count: 0 },
    }),
    setAutoPauseServerExecutionAuthority: async authority => {
      requestedAuthority = authority;
      return { changed: true, authority, blockers: [], superseded_pending_count: 6 };
    },
  }, message => { confirmation = message; return true; });
  get('#overviewAutoPauseServerCutover').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedAuthority, 'server');
  assert.match(confirmation, /6 job\(s\).*como skipped/);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /Servidor assumiu/);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /6 job\(s\).*preservados no histórico/);
});

test('cancelar a confirmação não chama a troca de autoridade', async () => {
  let setAuthorityCalls = 0;
  const { get } = mount({
    getAutoPauseServerCutoverPreflight: async () => ({
      authority: 'hub', ready: true, transfer_supported: true, blockers: [],
      latest_evaluation: { snapshot_state: 'evaluated', candidate_count: 2, evaluation_mode: 'server' },
      server_jobs: { pending_count: 3, processing_count: 0 },
    }),
    setAutoPauseServerExecutionAuthority: async () => { setAuthorityCalls++; return { changed: true, authority: 'server', blockers: [] }; },
  }, () => false);
  get('#overviewAutoPauseServerCutover').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(setAuthorityCalls, 0);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /Transferência cancelada/);
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /jobs continuam inalterados/);
});

test('simula retorno bloqueado enquanto há jobs pendentes', async () => {
  let requestedAuthority = '';
  const { get } = mount({
    getAutoPauseServerCutoverPreflight: async () => ({
      authority: 'server', ready: false, transfer_supported: false, blockers: ['server_jobs_are_pending'],
      latest_evaluation: { snapshot_state: 'evaluated', candidate_count: 1, evaluation_mode: 'server' },
      server_jobs: { pending_count: 2, processing_count: 0 },
    }),
    setAutoPauseServerExecutionAuthority: async authority => {
      requestedAuthority = authority;
      return { changed: false, authority: 'server', blockers: ['server_jobs_are_pending'] };
    },
  });
  get('#overviewAutoPauseServerCutover').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedAuthority, 'hub');
  assert.match(get('#overviewAutoPauseServerCutoverStatus').textContent, /Troca bloqueada/);
});

import assert from 'node:assert/strict';
import { PERSONAL_FINANCE_SYNC_CHANNEL, publishPersonalFinanceUpdate, subscribeToPersonalFinanceUpdates } from '../src/personal-finance/personal-finance-sync.mjs';

const channels = new Set();
class FakeBroadcastChannel {
  constructor(name) { this.name = name; this.listeners = new Set(); this.closed = false; channels.add(this); }
  addEventListener(type, listener) { if (type === 'message') this.listeners.add(listener); }
  removeEventListener(type, listener) { if (type === 'message') this.listeners.delete(listener); }
  postMessage(data) {
    for (const channel of channels) {
      if (channel === this || channel.closed || channel.name !== this.name) continue;
      queueMicrotask(() => { for (const listener of channel.listeners) listener({ data }); });
    }
  }
  close() { this.closed = true; channels.delete(this); }
}

let refreshes = 0;
const unsubscribe = subscribeToPersonalFinanceUpdates(() => { refreshes += 1; }, FakeBroadcastChannel);
assert.equal(PERSONAL_FINANCE_SYNC_CHANNEL, 'painel-personal-finance-v1');
assert.equal(publishPersonalFinanceUpdate(FakeBroadcastChannel), true);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(refreshes, 1, 'outra aba é avisada após o salvamento financeiro');
unsubscribe();
assert.equal(channels.size, 0, 'o canal de escuta é fechado ao desmontar a tela');
assert.equal(publishPersonalFinanceUpdate(null), false, 'navegadores sem BroadcastChannel continuam funcionando sem erro');
const noOpUnsubscribe = subscribeToPersonalFinanceUpdates(() => { refreshes += 1; }, null);
assert.equal(noOpUnsubscribe(), undefined, 'a ausência de BroadcastChannel devolve uma desmontagem segura');
assert.throws(() => subscribeToPersonalFinanceUpdates(null, FakeBroadcastChannel), /função/);
console.log('personal finance cross-tab sync ok');

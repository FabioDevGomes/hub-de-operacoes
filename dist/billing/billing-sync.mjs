const CHANNEL_NAME = 'hub-billing-overview-sync-v1';
const PENDING_KEY = 'hub.billing-overview-consolidation-pending:v1';
const EVENT_KEY = `${PENDING_KEY}:event`;
const listeners = new Set();
let memoryPending = false;
let channel = null;

function notify(message) {
  for (const listener of listeners) {
    try { listener(message); } catch (error) { console.warn('Falha ao aplicar atualização do Faturamento.', error); }
  }
}

function publish(message, notifyCurrentTab = true) {
  if (notifyCurrentTab) notify(message);
  if (channel) {
    channel.postMessage(message);
    return;
  }
  try { globalThis.localStorage?.setItem(EVENT_KEY, JSON.stringify({ ...message, eventId: `${Date.now()}-${Math.random()}` })); } catch {}
}

try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', event => notify(event.data || {}));
  }
} catch {}

globalThis.addEventListener?.('storage', event => {
  if (event.key === EVENT_KEY && event.newValue) {
    try { notify(JSON.parse(event.newValue)); } catch {}
  } else if (event.key === PENDING_KEY) notify({ type: 'manual-pending-changed' });
});

export function isManualBillingConsolidationPending() {
  try { return Boolean(globalThis.localStorage?.getItem(PENDING_KEY)) || memoryPending; } catch { return memoryPending; }
}

export function manualBillingConsolidationPendingToken() {
  try { return globalThis.localStorage?.getItem(PENDING_KEY) || (memoryPending ? 'pending-in-this-tab' : null); } catch { return memoryPending ? 'pending-in-this-tab' : null; }
}

export function markManualBillingConsolidationPending() {
  memoryPending = true;
  try { globalThis.localStorage?.setItem(PENDING_KEY, `${new Date().toISOString()}:${Math.random()}`); } catch {}
  publish({ type: 'manual-pending-changed' });
}

export function clearManualBillingConsolidationPending(expectedToken) {
  if (expectedToken !== undefined && (!expectedToken || manualBillingConsolidationPendingToken() !== expectedToken)) return false;
  memoryPending = false;
  try { globalThis.localStorage?.removeItem(PENDING_KEY); } catch {}
  publish({ type: 'manual-pending-changed' });
  return true;
}

export function requestManualBillingConsolidation() {
  clearManualBillingConsolidationPending();
  publish({ type: 'manual-consolidation-requested' });
}

export function publishAutomaticBillingUpdate({ notifyCurrentTab = true } = {}) {
  publish({ type: 'automatic-billing-updated' }, notifyCurrentTab);
}

export function subscribeBillingSync(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

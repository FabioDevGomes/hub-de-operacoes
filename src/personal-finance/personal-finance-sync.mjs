export const PERSONAL_FINANCE_SYNC_CHANNEL = 'painel-personal-finance-v1';
const UPDATE_MESSAGE = 'personal-finance-updated';

export function publishPersonalFinanceUpdate(Channel = globalThis.BroadcastChannel) {
  if (typeof Channel !== 'function') return false;
  const channel = new Channel(PERSONAL_FINANCE_SYNC_CHANNEL);
  try {
    channel.postMessage({ type:UPDATE_MESSAGE });
    return true;
  } finally { channel.close(); }
}

export function subscribeToPersonalFinanceUpdates(onUpdate, Channel = globalThis.BroadcastChannel) {
  if (typeof onUpdate !== 'function') throw new TypeError('Informe uma função para receber atualizações financeiras.');
  if (typeof Channel !== 'function') return () => {};
  const channel = new Channel(PERSONAL_FINANCE_SYNC_CHANNEL);
  const listener = event => {
    if (event.data?.type === UPDATE_MESSAGE) onUpdate();
  };
  channel.addEventListener('message', listener);
  return () => {
    channel.removeEventListener('message', listener);
    channel.close();
  };
}

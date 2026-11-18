export function openGoogleAdsResourcesViaExtension({ document, window, accountId, resourceUrl = '', timeoutMs = 65000 } = {}) {
  const normalizedAccountId = String(accountId || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(normalizedAccountId)) {
    return Promise.reject(new Error('Não encontrei um ID de conta Google Ads válido para abrir a página salva.'));
  }
  if (document?.documentElement?.getAttribute('data-hub-tabs-extension') !== 'ready') {
    return Promise.reject(new Error('A extensão Hub 2.0 não está conectada a esta tela. Recarregue a extensão e o Hub.'));
  }
  const requestId = window?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('A extensão demorou mais que 65 segundos. Confira a aba do Google Ads, que pode ter permanecido aberta.'));
    }, timeoutMs);
    const onMessage = event => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.source !== 'hub-2.0-extension'
          || message.type !== 'GOOGLE_ADS_RESOURCES_RESULT'
          || message.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(message);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({
      source: 'hub-page',
      type: 'OPEN_GOOGLE_ADS_RESOURCES',
      requestId,
      accountId: normalizedAccountId,
      resourceUrl: String(resourceUrl || ''),
    }, window.location.origin);
  });
}

export function readGoogleAdsResourceBookmarksViaExtension({ document, window, timeoutMs = 15000 } = {}) {
  if (document?.documentElement?.getAttribute('data-hub-tabs-extension') !== 'ready') {
    return Promise.reject(new Error('A extensão Hub 2.0 não está conectada. Recarregue a extensão e esta tela do Hub.'));
  }
  const requestId = window?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('A extensão não respondeu à leitura dos favoritos. Confira se ela está ativa e tente novamente.'));
    }, timeoutMs);
    const onMessage = event => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.source !== 'hub-2.0-extension'
          || message.type !== 'GOOGLE_ADS_RESOURCE_BOOKMARKS_RESULT'
          || message.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(message);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({
      source: 'hub-page',
      type: 'SYNC_GOOGLE_ADS_RESOURCE_BOOKMARKS',
      requestId,
    }, window.location.origin);
  });
}

export function requestGoogleAdsResourcesFilterViaExtension({ document, window, targetUrl, filterTerm, timeoutMs = 65000 } = {}) {
  if (document?.documentElement?.getAttribute('data-hub-tabs-extension') !== 'ready') {
    return Promise.reject(new Error('A extensão Hub 2.0 não está conectada a esta tela. Recarregue a extensão e o Hub.'));
  }
  const requestId = window?.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('A extensão demorou mais que 65 segundos. Confira a aba do Google Ads, que pode ter permanecido aberta para conferência.'));
    }, timeoutMs);
    const onMessage = event => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.source !== 'hub-2.0-extension'
          || message.type !== 'GOOGLE_ADS_RESOURCES_FILTER_RESULT'
          || message.requestId !== requestId) return;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      resolve(message);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({
      source: 'hub-page',
      type: 'OPEN_GOOGLE_ADS_RESOURCES_FILTERED',
      requestId,
      targetUrl,
      filterTerm,
    }, window.location.origin);
  });
}

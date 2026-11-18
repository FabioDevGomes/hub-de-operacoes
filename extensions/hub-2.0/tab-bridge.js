(() => {
  const HUB_ORIGIN = 'http://127.0.0.1:8765';
  if (location.origin !== HUB_ORIGIN) return;

  const markBridgeReady = () => {
    if (!document.documentElement) return false;
    document.documentElement.setAttribute('data-hub-tabs-extension', 'ready');
    return true;
  };
  if (!markBridgeReady()) {
    const observer = new MutationObserver(() => {
      if (markBridgeReady()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'GOOGLE_ADS_RESOURCE_BOOKMARKS_UPDATED') return;
    window.postMessage({
      source: 'hub-2.0-extension',
      type: 'GOOGLE_ADS_RESOURCE_BOOKMARKS_UPDATED',
      folderFound: Boolean(message.folderFound),
      bookmarks: Array.isArray(message.bookmarks) ? message.bookmarks : [],
      campaignBookmarks: Array.isArray(message.campaignBookmarks) ? message.campaignBookmarks : [],
      managerBookmarks: Array.isArray(message.managerBookmarks) ? message.managerBookmarks : [],
    }, HUB_ORIGIN);
  });

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== HUB_ORIGIN) return;
    const message = event.data;
    if (message?.source !== 'hub-page' || typeof message.requestId !== 'string' || message.requestId.length > 120) return;

    if (message.type === 'OPEN_GOOGLE_ADS_RESOURCES') {
      const accountId = String(message.accountId || '');
      if (!/^\d{10}$/.test(accountId)) return;
      const respond = response => window.postMessage({
        source: 'hub-2.0-extension',
        type: 'GOOGLE_ADS_RESOURCES_RESULT',
        requestId: message.requestId,
        ...(response || { ok: false, opened: false, message: 'A extensão não respondeu à abertura do Google Ads.' }),
      }, HUB_ORIGIN);
      try {
        chrome.runtime.sendMessage({
          type: 'OPEN_GOOGLE_ADS_RESOURCES',
          accountId,
          resourceUrl: typeof message.resourceUrl === 'string' ? message.resourceUrl.slice(0, 4096) : '',
        }, response => {
          if (chrome.runtime.lastError) {
            respond({ ok: false, opened: false, message: 'Recarregue a extensão Hub 2.0 e esta tela do Google Ads.' });
            return;
          }
          respond(response);
        });
      } catch {
        respond({ ok: false, opened: false, message: 'Não consegui enviar a solicitação à extensão Hub 2.0.' });
      }
      return;
    }

    if (message.type === 'SYNC_GOOGLE_ADS_RESOURCE_BOOKMARKS') {
      const respond = response => window.postMessage({
        source: 'hub-2.0-extension',
        type: 'GOOGLE_ADS_RESOURCE_BOOKMARKS_RESULT',
        requestId: message.requestId,
        ...(response || { ok: false, message: 'A extensão não respondeu à leitura dos favoritos.' }),
      }, HUB_ORIGIN);
      try {
        chrome.runtime.sendMessage({ type: 'SYNC_GOOGLE_ADS_RESOURCE_BOOKMARKS' }, response => {
          if (chrome.runtime.lastError) {
            respond({ ok: false, message: 'Recarregue a extensão Hub 2.0 e esta tela do Hub.' });
            return;
          }
          respond(response);
        });
      } catch {
        respond({ ok: false, message: 'Não consegui solicitar a leitura dos favoritos à extensão Hub 2.0.' });
      }
      return;
    }

    if (message.type === 'ACTIVATE_HUB_SCREEN_TAB' || message.type === 'OPEN_OR_ACTIVATE_HUB_SCREEN_TAB') {
      if (typeof message.targetUrl !== 'string') return;
      let targetUrl;
      try { targetUrl = new URL(message.targetUrl); }
      catch { return; }
      if (targetUrl.origin !== HUB_ORIGIN || targetUrl.protocol !== 'http:') return;
      const respond = response => window.postMessage({
        source: 'hub-2.0-extension',
        type: 'HUB_SCREEN_TAB_RESULT',
        requestId: message.requestId,
        ...(response || { matched: false }),
      }, HUB_ORIGIN);
      try {
        chrome.runtime.sendMessage({ type: message.type, targetUrl: targetUrl.href }, response => {
          if (chrome.runtime.lastError) {
            respond({ matched: false });
            return;
          }
          respond(response);
        });
      } catch {
        respond({ matched: false });
      }
      return;
    }

    if (message.type === 'OPEN_OR_ACTIVATE_HUB_NOTIFICATION_TAB') {
      if (typeof message.targetUrl !== 'string') return;
      let targetUrl;
      try { targetUrl = new URL(message.targetUrl); }
      catch { return; }
      if (targetUrl.origin !== HUB_ORIGIN || targetUrl.protocol !== 'http:') return;
      const respond = response => window.postMessage({
        source: 'hub-2.0-extension',
        type: 'HUB_NOTIFICATION_TAB_RESULT',
        requestId: message.requestId,
        ...(response || { matched: false, opened: false }),
      }, HUB_ORIGIN);
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_OR_ACTIVATE_HUB_NOTIFICATION_TAB', targetUrl: targetUrl.href, openIfMissing: message.openIfMissing !== false }, response => {
          if (chrome.runtime.lastError) {
            respond({ matched: false, opened: false });
            return;
          }
          respond(response);
        });
      } catch {
        respond({ matched: false, opened: false });
      }
      return;
    }

    if (message.type !== 'IMPORT_SELECTED_PRODUCT_IMAGES') return;
    if (!Array.isArray(message.images) || message.images.length < 1 || message.images.length > 2) return;
    const images = message.images.map(image => ({
      id: typeof image?.id === 'string' ? image.id.slice(0, 80) : '',
      url: typeof image?.url === 'string' ? image.url.slice(0, 4096) : ''
    }));
    const respond = response => window.postMessage({
      source: 'hub-2.0-extension',
      type: 'PRODUCT_IMAGE_IMPORT_RESULT',
      requestId: message.requestId,
      ...(response || { ok: false, message: 'A extensão não respondeu à importação.' }),
    }, HUB_ORIGIN);
    try {
      chrome.runtime.sendMessage({ type: 'IMPORT_SELECTED_PRODUCT_IMAGES', images }, response => {
        if (chrome.runtime.lastError) {
          respond({ ok: false, message: 'Recarregue a extensão e esta tela do Asset Studio.' });
          return;
        }
        respond(response);
      });
    } catch {
      respond({ ok: false, message: 'Não consegui enviar as imagens à extensão.' });
    }
  });
})();

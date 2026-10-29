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

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== HUB_ORIGIN) return;
    const message = event.data;
    if (message?.source !== 'hub-page' || message.type !== 'ACTIVATE_HUB_SCREEN_TAB') return;
    if (typeof message.requestId !== 'string' || message.requestId.length > 120 || typeof message.targetUrl !== 'string') return;

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
      chrome.runtime.sendMessage({ type: 'ACTIVATE_HUB_SCREEN_TAB', targetUrl: targetUrl.href }, response => {
        if (chrome.runtime.lastError) {
          respond({ matched: false });
          return;
        }
        respond(response);
      });
    } catch {
      respond({ matched: false });
    }
  });
})();

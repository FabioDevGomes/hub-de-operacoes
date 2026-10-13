(() => {
  const version = document.querySelector('meta[name="hub-system-version"]')?.content;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '')) return;
  const prefix = `Hub v${version} · `;
  const formatTitle = title => prefix + String(title).replace(/^Hub v\d+\.\d+\.\d+ · /, '');
  const syncTitle = () => {
    const title = formatTitle(document.title);
    if (document.title !== title) document.title = title;
  };
  function initialize() {
    syncTitle();
    // Observe only the document head: navigation keeps its existing title API.
    // The equality guard prevents loops when we update our own prefix.
    new MutationObserver(syncTitle).observe(document.head, { subtree: true, childList: true, characterData: true });
    // An embedded analysis already has the version displayed by its host.
    if (window.self !== window.top) return;
    const heading = document.querySelector('main h1, h1');
    if (!heading || document.querySelector('[data-hub-system-version-badge]')) return;
    const badge = document.createElement('span');
    badge.className = 'hub-system-version';
    badge.dataset.hubSystemVersionBadge = '';
    badge.textContent = `v${version}`;
    badge.setAttribute('aria-label', `Versão do sistema: ${version}`);
    badge.title = `Hub de Operações v${version}`;
    heading.classList.add('hub-version-heading');
    heading.insertAdjacentElement('afterend', badge);
  }
  window.HubSystemVersion = Object.freeze({ version, formatTitle });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();

(() => {
  const version = document.querySelector('meta[name="hub-system-version"]')?.content;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version || '')) return;
  const prefix = `Hub v${version} · `;
  const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
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
    startUpdateCheck();
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
  function compareVersions(left, right) {
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
    return 0;
  }
  function startUpdateCheck() {
    if (typeof window.fetch !== 'function' || !window.location?.origin) return;
    const dismissedVersionKey = 'hub:system-version:dismissed:v1';
    const confirmedUpdateKey = 'hub:system-version:confirmed-update:v1';
    const reloadAttemptKey = 'hub:system-version:reload-attempted:v1';
    let checking = false, dismissedVersion = '', notice = null, noticeVersion = '';
    try { dismissedVersion = window.sessionStorage.getItem(dismissedVersionKey) || ''; } catch {}
    let reloadRequested = false;
    const readConfirmedUpdateVersion = () => {
      try {
        const confirmed = window.localStorage.getItem(confirmedUpdateKey) || '';
        return versionPattern.test(confirmed) ? confirmed : '';
      } catch { return ''; }
    };
    const confirmUpdateForAllTabs = targetVersion => {
      if (!versionPattern.test(targetVersion || '')) return '';
      const previous = readConfirmedUpdateVersion();
      const latest = previous && compareVersions(previous, targetVersion) > 0 ? previous : targetVersion;
      try { window.localStorage.setItem(confirmedUpdateKey, latest); } catch {}
      try { updateChannel?.postMessage({type: 'update-confirmed', version: latest, retry: true}); } catch {}
      return latest;
    };
    const reloadForConfirmedUpdate = (targetVersion, {retry = false} = {}) => {
      if (!versionPattern.test(targetVersion || '') || compareVersions(targetVersion, version) <= 0 || reloadRequested) return false;
      let attempted = '';
      try { attempted = window.sessionStorage.getItem(reloadAttemptKey) || ''; } catch {}
      if (versionPattern.test(attempted)) {
        const comparison = compareVersions(attempted, targetVersion);
        if (comparison > 0 || (comparison === 0 && !retry)) return false;
      }
      reloadRequested = true;
      try { window.sessionStorage.setItem(reloadAttemptKey, targetVersion); } catch {}
      window.location.reload();
      return true;
    };
    const showNotice = nextVersion => {
      if (nextVersion === dismissedVersion) return;
      if (notice && compareVersions(nextVersion, noticeVersion) <= 0) return;
      if (!notice) {
        notice = document.createElement('section');
        notice.className = 'hub-update-notice';
        notice.dataset.hubUpdateNotice = '';
        notice.setAttribute('role', 'region');
        notice.setAttribute('aria-label', 'Atualização do sistema');

        const copy = document.createElement('div');
        copy.className = 'hub-update-notice__copy';
        copy.setAttribute('role', 'status');
        copy.setAttribute('aria-live', 'polite');
        const title = document.createElement('strong');
        title.className = 'hub-update-notice__title';
        const detail = document.createElement('span');
        detail.className = 'hub-update-notice__detail';
        copy.append(title, detail);

        const update = document.createElement('button');
        update.className = 'hub-update-notice__action';
        update.type = 'button';
        update.addEventListener('click', () => {
          const confirmedVersion = confirmUpdateForAllTabs(noticeVersion);
          if (!confirmedVersion) return;
          update.disabled = true;
          update.textContent = 'Atualizando todas as telas…';
          reloadForConfirmedUpdate(confirmedVersion, {retry: true});
        });

        const dismiss = document.createElement('button');
        dismiss.className = 'hub-update-notice__dismiss';
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', 'Fechar aviso de atualização');
        dismiss.textContent = '×';
        dismiss.addEventListener('click', () => {
          dismissedVersion = noticeVersion;
          try { window.sessionStorage.setItem(dismissedVersionKey, dismissedVersion); } catch {}
          notice?.remove();
          notice = null;
        });
        notice.append(copy, update, dismiss);
        document.body.append(notice);
      }
      noticeVersion = nextVersion;
      notice.querySelector('.hub-update-notice__title').textContent = `Nova versão v${nextVersion} disponível`;
      notice.querySelector('.hub-update-notice__detail').textContent = `Esta tela está na v${version}. Atualize para carregar a versão nova.`;
      const update = notice.querySelector('.hub-update-notice__action');
      update.disabled = false;
      update.textContent = 'Atualizar agora';
    };
    let updateChannel = null;
    try {
      if (typeof window.BroadcastChannel === 'function') {
        updateChannel = new window.BroadcastChannel('hub-system-version');
        updateChannel.addEventListener('message', event => {
          const message = event.data;
          if (!versionPattern.test(message?.version || '')) return;
          if (message.type === 'version-available' && compareVersions(message.version, version) > 0) {
            showNotice(message.version);
            return;
          }
          if (message.type === 'update-confirmed') {
            reloadForConfirmedUpdate(message.version, {retry: message.retry === true});
          }
        });
      }
    } catch {}
    const applyStoredConfirmation = () => reloadForConfirmedUpdate(readConfirmedUpdateVersion());
    window.addEventListener('storage', event => {
      if (event.key === confirmedUpdateKey && versionPattern.test(event.newValue || '')) {
        reloadForConfirmedUpdate(event.newValue);
      }
    });
    applyStoredConfirmation();
    const checkVersion = async () => {
      if (checking || reloadRequested || document.hidden) return;
      checking = true;
      try {
        const url = new URL('/version.txt', window.location.origin);
        url.searchParams.set('check', String(Date.now()));
        const response = await window.fetch(url, {cache: 'no-store', credentials: 'same-origin', headers: {Accept: 'text/plain'}});
        if (!response.ok) return;
        const available = (await response.text()).trim();
        if (versionPattern.test(available) && compareVersions(available, version) > 0) {
          showNotice(available);
          try { updateChannel?.postMessage({type: 'version-available', version: available}); } catch {}
        }
      } catch {
        // A temporary network/server issue should not interrupt the current screen.
      } finally {
        checking = false;
      }
    };
    void checkVersion();
    window.setInterval(checkVersion, 60_000);
    window.addEventListener('focus', () => { applyStoredConfirmation(); void checkVersion(); });
    window.addEventListener('online', () => { applyStoredConfirmation(); void checkVersion(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { applyStoredConfirmation(); void checkVersion(); }
    });
  }
  window.HubSystemVersion = Object.freeze({ version, formatTitle });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();

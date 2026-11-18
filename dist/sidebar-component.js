(() => {
  const STORAGE_KEY = 'painel-sidebar-grupo-aberto-v1';
  const COLLAPSED_STORAGE_KEY = 'painel-sidebar-recolhido-v1';
  const FREQUENT_VIEWS_STORAGE_KEY = 'hub:sidebar:frequent-views:v1';
  const FREQUENT_VIEW_SLOT_COUNT = 6;
  const groups = [
    { id: 'operation', label: 'Operação', items: [
      { key: 'overview', label: 'Visão geral', view: 'totals', href: '/' },
      { key: 'preparer', label: 'Preparador MCC', href: '/preparador-MCC/?v=20260923-sidebar' },
      { key: 'tested', label: 'Produtos testados', view: 'tested', href: '/?view=tested' },
      { key: 'google-ads-search-terms', label: 'Termos de Pesquisa', view: 'google-ads-search-terms', href: '/?view=google-ads-search-terms', requiresGoogleAdsApi: true },
      { key: 'notifications', label: 'Notificações', view: 'notifications', href: '/?view=notifications' },
    ] },
    { id: 'tracking', label: 'Integrações', items: [
      { key: 'google-ads', label: 'Snapshots da Operação', view: 'google-ads', href: '/?view=google-ads' },
      { key: 'tracking', label: 'Tracking ClickBank', view: 'tracking', href: '/?view=tracking' },
      { key: 'tracking-gurumedia', label: 'Tracking GuruMedia', view: 'tracking-gurumedia', href: '/?view=tracking-gurumedia' },
      { key: 'hostinger', label: 'Hostinger', view: 'hostinger', href: '/?view=hostinger' },
      { key: 'account-domains', label: 'Domínios por conta', view: 'account-domains', href: '/?view=account-domains' },
      { key: 'tracker-global', label: 'Tracker Global', view: 'tracker-global', href: '/?view=tracker-global' },
      { key: 'tracking-settings', label: 'Configurações globais', view: 'tracking-settings', href: '/?view=tracking-settings' },
    ] },
    { id: 'analysis', label: 'Análises', items: [
      { key: 'cpa', label: 'Análise por faixa de CPA', view: 'cpa', href: '/?view=cpa' },
      { key: 'accounts', label: 'Mapa por conta', view: 'accounts', href: '/?view=accounts' },
      { key: 'account-directory', label: 'Contas', view: 'account-directory', href: '/?view=account-directory' },
      { key: 'first-sale', label: 'Primeira venda', view: 'first-sale', href: '/?view=first-sale' },
    ] },
    { id: 'finance', label: 'Financeiro', items: [
      { key: 'macro', label: 'Controle Macro', view: 'macro', href: '/?view=macro' },
      { key: 'billing', label: 'Faturamento', view: 'billing', href: '/?view=billing' },
    ] },
    { id: 'curation', label: 'Curadoria', items: [
      { key: 'radar', label: 'Radar SpyHero', href: '/curadoria/' },
      { key: 'manager', label: 'Lista de Gerente GM', href: '/curadoria/gerentes/' },
      { key: 'ecommerce', label: 'Plataforma Guru Media', href: '/curadoria/top-performance/' },
      { key: 'clickbank-top-offers', label: 'Top Offers CB', href: '/curadoria/clickbank-top-offers/' },
      { key: 'smartadv-offers', label: 'Ofertas SmartAdv', href: '/curadoria/smartadv-offers/' },
      { key: 'hot-offers-ms', label: 'Hot Offers MS', href: '/curadoria/hot-offers-ms/' },
      { key: 'manual', label: 'Curadoria manual', href: '/curadoria/manual/' },
    ] },
    { id: 'creation', label: 'Criação de ofertas', items: [
      { key: 'campaign-delivery', label: 'Entrega de campanha', href: '/campaign-delivery/' },
      { key: 'asset-studio', label: 'Asset Studio', href: '/asset-studio/' },
      { key: 'copy', label: 'Ficha e Presell', view: 'copy', href: '/?view=copy' },
      { key: 'google-ads-create', label: 'Criar campanha', view: 'google-ads-create', href: '/?view=google-ads-create', requiresGoogleAdsApi: true },
      { key: 'google-ads-duplicate', label: 'Duplicar campanha', view: 'google-ads-duplicate', href: '/?view=google-ads-duplicate', requiresGoogleAdsApi: true },
      { key: 'review', label: 'Review', view: 'review', href: '/?view=review' },
    ] },
    { id: 'personal', label: 'Pessoal', items: [
      { key: 'time', label: 'Meu Tempo', view: 'time', href: '/?view=time' },
      { key: 'personal-finance', label: 'Controle de gastos', view: 'personal-finance', href: '/?view=personal-finance' },
    ] },
  ];
  const menuItems = groups.flatMap(group => group.items);
  const menuItemByKey = new Map(menuItems.map((item, index) => [item.key, { ...item, order: index }]));

  function readFrequentViews() {
    try {
      const stored = JSON.parse(localStorage.getItem(FREQUENT_VIEWS_STORAGE_KEY) || '{}');
      const visits = {};
      for (const [key, visit] of Object.entries(stored.visits || {})) {
        if (!menuItemByKey.has(key)) continue;
        const count = Number(visit?.count), sequence = Number(visit?.sequence), lastAccessedAt = Number(visit?.lastAccessedAt);
        if (Number.isSafeInteger(count) && count > 0) visits[key] = {
          count,
          sequence: Number.isSafeInteger(sequence) && sequence > 0 ? sequence : 0,
          lastAccessedAt: Number.isFinite(lastAccessedAt) && lastAccessedAt > 0 ? lastAccessedAt : 0,
        };
      }
      const pinnedSlots = Array.from({ length: FREQUENT_VIEW_SLOT_COUNT }, (_, index) => {
        const key = String(stored.pinnedSlots?.[index] || '');
        return menuItemByKey.has(key) ? key : '';
      });
      const pinnedKeys = new Set();
      for (let index = 0; index < pinnedSlots.length; index += 1) {
        const key = pinnedSlots[index];
        if (!key) continue;
        if (pinnedKeys.has(key)) pinnedSlots[index] = '';
        else pinnedKeys.add(key);
      }
      return { sequence: Math.max(0, Number(stored.sequence) || 0), visits, pinnedSlots };
    } catch {
      return { sequence: 0, visits: {}, pinnedSlots: Array(FREQUENT_VIEW_SLOT_COUNT).fill('') };
    }
  }

  let frequentViews = readFrequentViews();

  function rankedFrequentViews() {
    return Object.entries(frequentViews.visits)
      .map(([key, visit]) => ({ ...menuItemByKey.get(key), ...visit }))
      .filter(item => item.key)
      .sort((left, right) => right.count - left.count || right.sequence - left.sequence || left.order - right.order);
  }

  function resolvedFrequentSlots() {
    const slots = [...frequentViews.pinnedSlots];
    const pinnedKeys = new Set(slots.filter(Boolean));
    const automaticItems = rankedFrequentViews().filter(item => !pinnedKeys.has(item.key));
    let nextAutomatic = 0;
    for (let index = 0; index < slots.length; index += 1) {
      if (!slots[index]) slots[index] = automaticItems[nextAutomatic++]?.key || '';
    }
    return slots.map(key => menuItemByKey.get(key) || null);
  }

  function renderFrequentViewSettings(host) {
    const panel = host?.querySelector('[data-hub-quick-settings]');
    if (!panel) return;
    panel.innerHTML = `<p>Fixe uma tela em qualquer posição. As posições automáticas continuam mostrando as telas mais acessadas.</p><div class="hub-sidebar-quick-settings-rows">${Array.from({ length: FREQUENT_VIEW_SLOT_COUNT }, (_, index) => {
      const selectedKey = frequentViews.pinnedSlots[index];
      const options = menuItems.map(item => {
        const groupLabel = groups.find(group => group.items.some(candidate => candidate.key === item.key))?.label || '';
        const disabled = frequentViews.pinnedSlots.some((key, otherIndex) => otherIndex !== index && key === item.key);
        return `<option value="${escapeHtml(item.key)}"${selectedKey === item.key ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHtml(groupLabel)} · ${escapeHtml(item.label)}</option>`;
      }).join('');
      return `<label class="hub-sidebar-quick-setting"><span>Posição ${index + 1}</span><select data-hub-quick-slot="${index}" aria-label="Destino fixado na posição ${index + 1}"><option value=""${selectedKey ? '' : ' selected'}>Automática (mais acessada)</option>${options}</select></label>`;
    }).join('')}</div><p class="hub-sidebar-quick-settings-status" data-hub-quick-settings-status role="status" aria-live="polite"></p>`;
  }

  function refreshFrequentViewHosts() {
    document.querySelectorAll('[data-hub-sidebar-quick-access]').forEach(host => {
      renderFrequentViews(host);
      const selects = [...host.querySelectorAll('[data-hub-quick-slot]')];
      for (const [index, select] of selects.entries()) select.value = frequentViews.pinnedSlots[index] || '';
      for (const [index, select] of selects.entries()) {
        for (const option of select.options) {
          option.disabled = Boolean(option.value && frequentViews.pinnedSlots.some((key, otherIndex) => otherIndex !== index && key === option.value));
        }
      }
    });
  }

  function saveFrequentViews() {
    try {
      localStorage.setItem(FREQUENT_VIEWS_STORAGE_KEY, JSON.stringify(frequentViews));
      return true;
    } catch {
      return false;
    }
  }

  function renderFrequentViews(host) {
    if (!host) return;
    const linksHost = host.querySelector('[data-hub-quick-links]') || host;
    const activeKey = activeFrequentViewKey();
    const items = resolvedFrequentSlots();
    linksHost.innerHTML = items.map(item => {
      const label = item ? escapeHtml(item.label) : '';
      const title = item ? escapeHtml(item.label) : 'Atalho automático vazio. Fixe uma tela em Configuração ou continue usando o menu.';
      const isCurrent = Boolean(item && item.key === activeKey);
      const requiresApi = Boolean(item && (item.requiresGoogleAdsApi || window.PanelViews?.definition(item.view)?.requiresGoogleAdsApi));
      const unavailable = requiresApi && window.GoogleAdsSourcePreference?.read() !== 'api';
      const requirement = requiresApi
        ? ` data-requires-google-ads-api="true" data-required-view="${escapeHtml(item.view)}" aria-disabled="${String(unavailable)}" title="${unavailable ? 'Ative Google Ads API neste perfil para acessar esta tela.' : 'Disponível com Google Ads API ativa neste perfil.'}"`
        : ` title="${title}"`;
      return `<button type="button" class="hub-sidebar-quick-link${item ? ' is-populated' : ''}${isCurrent ? ' is-current' : ''}${unavailable ? ' is-api-unavailable' : ''}" data-hub-frequent-key="${item ? escapeHtml(item.key) : ''}"${item ? `${requirement} aria-label="${title}"${isCurrent ? ' aria-current="page"' : ''}` : ` disabled title="${title}" aria-label="${title}"` }><span class="hub-sidebar-quick-label">${label}</span></button>`;
    }).join('');
  }

  function recordFrequentView(key) {
    if (!menuItemByKey.has(key)) return;
    frequentViews.sequence = Math.max(frequentViews.sequence, ...Object.values(frequentViews.visits).map(visit => visit.sequence || 0)) + 1;
    const previous = frequentViews.visits[key];
    frequentViews.visits[key] = {
      count: Math.min(Number.MAX_SAFE_INTEGER, (previous?.count || 0) + 1),
      sequence: frequentViews.sequence,
      lastAccessedAt: Date.now(),
    };
    saveFrequentViews();
    document.querySelectorAll('[data-hub-sidebar-quick-access]').forEach(renderFrequentViews);
  }

  function recordFrequentViewForScreen(viewId) {
    const item = menuItems.find(candidate => candidate.view === viewId);
    if (item) recordFrequentView(item.key);
  }

  const sidebarNavigationReplay = new WeakSet();
  const sidebarNavigationPending = new WeakSet();
  let sidebarNavigationSequence = 0;
  let sidebarNavigationNoticeTimer = 0;

  function showSidebarNavigationNotice(message) {
    let notice = document.getElementById('hub-sidebar-navigation-notice');
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'hub-sidebar-navigation-notice';
      notice.className = 'hub-sidebar-navigation-notice';
      notice.setAttribute('role', 'alert');
      notice.setAttribute('aria-live', 'assertive');
      notice.hidden = true;
      document.body.append(notice);
    }
    notice.textContent = message;
    notice.hidden = false;
    window.clearTimeout(sidebarNavigationNoticeTimer);
    sidebarNavigationNoticeTimer = window.setTimeout(() => { notice.hidden = true; }, 5000);
  }

  function findSidebarMenuItem(key) {
    return [...document.querySelectorAll('[data-hub-menu-key]')]
      .find(candidate => candidate.dataset.hubMenuKey === key);
  }

  function clickSidebarMenuItem(key, { bypassTabActivation = false } = {}) {
    const menuItem = findSidebarMenuItem(key);
    if (!menuItem) return false;
    const groupBody = menuItem.closest('.hub-menu-body');
    const group = groupBody?.closest('[data-sidebar-group]');
    if (group?.classList.contains('collapsed')) setOpenGroup(group.dataset.sidebarGroup);
    if (bypassTabActivation) sidebarNavigationReplay.add(menuItem);
    menuItem.click();
    return true;
  }

  function replaySidebarDestination(control, key) {
    clickSidebarMenuItem(key, { bypassTabActivation: true });
  }

  function requestSidebarDestinationActivation(event, control) {
    const key = control.dataset.hubFrequentKey || control.dataset.hubMenuKey;
    const item = menuItemByKey.get(key);
    if (!item || control.disabled || control.getAttribute('aria-disabled') === 'true') return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const isFrequentShortcut = Boolean(control.dataset.hubFrequentKey);
    if (document.documentElement?.dataset.hubTabsExtension !== 'ready') {
      if (isFrequentShortcut) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showSidebarNavigationNotice('A extensão Hub 2.0 não está carregada. Recarregue a extensão e esta tela para usar estes atalhos.');
      }
      return;
    }
    if (sidebarNavigationPending.has(control)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    sidebarNavigationPending.add(control);
    const sequence = ++sidebarNavigationSequence;
    const requestId = `sidebar-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;
    const finish = response => {
      if (settled) return;
      settled = true;
      sidebarNavigationPending.delete(control);
      window.removeEventListener('message', receiveResult);
      clearTimeout(timeout);
      if (sequence !== sidebarNavigationSequence) return;
      if (response?.matched) {
        if (isFrequentShortcut || response.currentTab) recordFrequentView(key);
        if (response.currentTab && activeFrequentViewKey() !== key) replaySidebarDestination(control, key);
        return;
      }
      if (isFrequentShortcut && response?.opened) {
        recordFrequentView(key);
        return;
      }
      if (isFrequentShortcut) {
        showSidebarNavigationNotice('A extensão Hub 2.0 não respondeu ao atalho. Recarregue a extensão e esta tela.');
      } else {
        replaySidebarDestination(control, key);
      }
    };
    const receiveResult = messageEvent => {
      if (messageEvent.source !== window || messageEvent.origin !== location.origin) return;
      const data = messageEvent.data;
      if (data?.source !== 'hub-2.0-extension' || data.type !== 'HUB_SCREEN_TAB_RESULT' || data.requestId !== requestId) return;
      finish(data);
    };
    const timeout = setTimeout(() => finish(null), 900);
    window.addEventListener('message', receiveResult);
    window.postMessage({
      source: 'hub-page',
      type: isFrequentShortcut ? 'OPEN_OR_ACTIVATE_HUB_SCREEN_TAB' : 'ACTIVATE_HUB_SCREEN_TAB',
      requestId,
      targetUrl: new URL(item.href, location.origin).href,
    }, location.origin);
  }

  function activeFrequentViewKey() {
    const root = document.querySelector('[data-hub-sidebar]');
    if (!root) return '';
    const activeItem = root.querySelector('[data-hub-menu-key].active');
    if (activeItem) return activeItem.dataset.hubMenuKey || '';
    return root.dataset.hubSidebarMode === 'app' ? '' : root.dataset.hubSidebarActive || '';
  }

  function documentHasForeground() {
    return document.visibilityState !== 'hidden' && (typeof document.hasFocus !== 'function' || document.hasFocus());
  }

  let windowIsForeground = documentHasForeground();

  function recordOnForegroundReturn() {
    if (!documentHasForeground() || windowIsForeground) return;
    windowIsForeground = true;
    recordFrequentView(activeFrequentViewKey());
  }

  function bindForegroundTracking() {
    if (window.__hubSidebarForegroundTracking) return;
    window.__hubSidebarForegroundTracking = true;
    window.addEventListener('blur', () => { windowIsForeground = false; });
    window.addEventListener('focus', recordOnForegroundReturn);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') windowIsForeground = false;
      else recordOnForegroundReturn();
    });
  }

  function ensureFrequentViewHost(root) {
    const aside = root.closest('aside');
    if (!aside) return null;
    let host = aside.querySelector(':scope > [data-hub-sidebar-quick-access]');
    if (!host) {
      host = document.createElement('div');
      host.className = 'hub-sidebar-quick-access';
      host.dataset.hubSidebarQuickAccess = '';
      host.setAttribute('role', 'group');
      host.setAttribute('aria-label', 'Atalhos de telas');
      const settingsId = `hubSidebarQuickSettings${document.querySelectorAll('[data-hub-sidebar-quick-access]').length + 1}`;
      host.innerHTML = `<div class="hub-sidebar-quick-heading"><button type="button" class="hub-sidebar-quick-config" data-hub-quick-config-toggle aria-expanded="false" aria-controls="${settingsId}">Configuração</button></div><section class="hub-sidebar-quick-settings" id="${settingsId}" data-hub-quick-settings hidden aria-label="Configurar atalhos"></section><div class="hub-sidebar-quick-links" data-hub-quick-links aria-label="Telas mais acessadas"></div>`;
      const footer = [...aside.children].find(child => child.matches('.sidebar-foot, .hub-sidebar-foot, .local, .localnote'));
      aside.insertBefore(host, footer || null);
    }
    if (host.dataset.hubQuickSettingsInitialized !== 'true') {
      host.dataset.hubQuickSettingsInitialized = 'true';
      const configToggle = host.querySelector('[data-hub-quick-config-toggle]');
      const settingsPanel = host.querySelector('[data-hub-quick-settings]');
      renderFrequentViewSettings(host);
      configToggle?.addEventListener('click', () => {
        const isOpen = configToggle.getAttribute('aria-expanded') === 'true';
        configToggle.setAttribute('aria-expanded', String(!isOpen));
        settingsPanel.hidden = isOpen;
        host.classList.toggle('is-configuring', !isOpen);
      });
      settingsPanel?.addEventListener('change', event => {
        const select = event.target.closest('[data-hub-quick-slot]');
        if (!select) return;
        const index = Number(select.dataset.hubQuickSlot);
        if (!Number.isInteger(index) || index < 0 || index >= FREQUENT_VIEW_SLOT_COUNT) return;
        const selectedKey = select.value;
        if (selectedKey && frequentViews.pinnedSlots.some((key, otherIndex) => otherIndex !== index && key === selectedKey)) return;
        frequentViews.pinnedSlots[index] = selectedKey;
        const saved = saveFrequentViews();
        refreshFrequentViewHosts();
        const status = settingsPanel.querySelector('[data-hub-quick-settings-status]');
        const selectedItem = menuItemByKey.get(selectedKey);
        status.textContent = !saved
          ? 'Não foi possível salvar no navegador. A posição vale apenas nesta sessão.'
          : selectedItem
          ? `${selectedItem.label} fixada na posição ${index + 1}.`
          : `A posição ${index + 1} seguirá o ranking automático.`;
      });
    }
    renderFrequentViews(host);
    return host;
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  function sidebarCollapseIcon(collapsed) {
    const chevron = collapsed ? 'M13 9l3 3-3 3' : 'M16 9l-3 3 3 3';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5.5"/><path d="M9 3v18"/><path d="${chevron}"/></svg>`;
  }

  function activeGroupFor(root) {
    const activePage = root.dataset.hubSidebarActive;
    if (activePage) {
      const group = groups.find(item => item.items.some(link => link.key === activePage));
      if (group) return group.id;
      if (activePage === 'journal') return 'operation';
    }
    if (root.dataset.hubSidebarMode === 'app' && window.PanelViews) {
      const view = window.PanelViews.resolveRoute(location.href);
      return groups.find(group => group.items.some(item => item.view === view.id))?.id || 'operation';
    }
    return '';
  }

  function itemMarkup(item, mode, activeKey) {
    const active = activeKey === item.key;
    const requiresApi = Boolean(item.requiresGoogleAdsApi || window.PanelViews?.definition(item.view)?.requiresGoogleAdsApi);
    const apiAvailable = window.GoogleAdsSourcePreference?.read() === 'api';
    const unavailable = requiresApi && !apiAvailable;
    const className = `hub-menu-link${active ? ' active' : ''}${unavailable ? ' is-api-unavailable' : ''}`;
    const current = active ? ' aria-current="page"' : '';
    const requirement = requiresApi
      ? ` data-requires-google-ads-api="true" data-required-view="${escapeHtml(item.view)}" aria-disabled="${String(unavailable)}" title="${unavailable ? 'Ative Google Ads API neste perfil para acessar esta tela.' : 'Disponível com Google Ads API ativa neste perfil.'}"`
      : '';
    const label = requiresApi
      ? `<span class="hub-menu-api-dot" aria-hidden="true"></span><span>${escapeHtml(item.label)}</span>`
      : escapeHtml(item.label);
    if (mode === 'app' && item.view) {
      const definition = window.PanelViews?.definition(item.view);
      const id = definition?.navId || item.navId;
      return `<button type="button" class="${className}" id="${escapeHtml(id)}" data-hub-menu-key="${escapeHtml(item.key)}"${current}${requirement}>${label}</button>`;
    }
    return `<a class="${className}" href="${escapeHtml(item.href)}" data-hub-menu-key="${escapeHtml(item.key)}"${current}${requirement}>${label}</a>`;
  }

  function refreshApiRequirements() {
    const available = window.GoogleAdsSourcePreference?.read() === 'api';
    for (const item of document.querySelectorAll('[data-requires-google-ads-api]')) {
      const unavailable = !available;
      item.classList.toggle('is-api-unavailable', unavailable);
      item.setAttribute('aria-disabled', String(unavailable));
      item.title = unavailable
        ? 'Ative Google Ads API neste perfil para acessar esta tela.'
        : 'Disponível com Google Ads API ativa neste perfil.';
    }
  }

  function groupMarkup(group, mode, activeKey) {
    const bodyId = `hubMenu${group.id[0].toUpperCase()}${group.id.slice(1)}`;
    const links = group.items.map(item => itemMarkup(item, mode, activeKey)).join('');
    return `<section class="hub-menu-group collapsed" data-sidebar-group="${group.id}">
      <button class="hub-menu-toggle" type="button" data-sidebar-toggle="${group.id}" aria-expanded="false" aria-controls="${bodyId}"><span>${escapeHtml(group.label)}</span><span class="hub-menu-chevron" aria-hidden="true">›</span></button>
      <div class="hub-menu-body" id="${bodyId}">${links}</div>
    </section>`;
  }

  function setGroupExpanded(group, expanded, persist, measured = null) {
    const body = measured?.body || group.querySelector(':scope > .hub-menu-body');
    const toggle = group.querySelector(':scope > .hub-menu-toggle');
    if (body) {
      const wasExpanded = measured?.wasExpanded ?? !group.classList.contains('collapsed');
      body.inert = !expanded;
      if (persist && wasExpanded !== expanded) {
        // Read every group's dimensions before changing classes in setOpenGroup,
        // avoiding repeated synchronous layout recalculations while switching menus.
        const from = measured?.from ?? body.getBoundingClientRect().height;
        const to = measured?.to ?? (expanded ? body.scrollHeight : 0);
        body.getAnimations().forEach(animation => animation.cancel());
        group.classList.toggle('collapsed', !expanded);
        if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && typeof body.animate === 'function') {
          body.animate([
            { height: `${from}px`, opacity: wasExpanded ? 1 : 0, transform: wasExpanded ? 'translateY(0)' : 'translateY(-4px)' },
            { height: `${to}px`, opacity: expanded ? 1 : 0, transform: expanded ? 'translateY(0)' : 'translateY(-4px)' },
          ], { duration: 120, easing: 'cubic-bezier(.2,.8,.2,1)' });
        }
      } else {
        group.classList.toggle('collapsed', !expanded);
      }
    } else {
      group.classList.toggle('collapsed', !expanded);
    }
    toggle?.setAttribute('aria-expanded', String(expanded));
  }

  function setOpenGroup(name, persist = true) {
    const allGroups = [...document.querySelectorAll('[data-sidebar-group]')];
    const topGroups = allGroups.filter(group => !group.parentElement.closest('[data-sidebar-group]'));
    // Keep old saved preferences and callers compatible without rendering a Products subgroup.
    const topName = name === 'products' ? 'operation' : name;
    const groupStates = topGroups.map(group => {
      const body = group.querySelector(':scope > .hub-menu-body');
      const wasExpanded = !group.classList.contains('collapsed');
      const expanded = group.dataset.sidebarGroup === topName;
      return {
        group,
        expanded,
        measurement: persist && body && wasExpanded !== expanded
          ? { body, wasExpanded, from: body.getBoundingClientRect().height, to: expanded ? body.scrollHeight : 0 }
          : { body, wasExpanded },
      };
    });
    for (const { group, expanded, measurement } of groupStates) setGroupExpanded(group, expanded, persist, measurement);
    if (persist) {
      try { name ? localStorage.setItem(STORAGE_KEY, name) : localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }

  function initialize() {
    bindRestartServerButton();
    const roots = [...document.querySelectorAll('[data-hub-sidebar]')];
    if (!roots.length) return;
    for (const root of roots) {
      const mode = root.dataset.hubSidebarMode || 'links';
      const routeView = mode === 'app' ? window.PanelViews?.resolveRoute(location.href) : null;
      const activeKey = root.dataset.hubSidebarActive || (routeView ? routeView.id === 'tested' ? 'tested' : groups.flatMap(group => group.items).find(item => item.view === routeView.id)?.key || routeView.id : '');
      root.innerHTML = groups.map(group => groupMarkup(group, mode, activeKey)).join('');
      const productHost = root.parentElement?.querySelector('[data-hub-sidebar-products]');
      productHost?.remove();
      ensureFrequentViewHost(root);
      if (mode !== 'app' && root.dataset.hubSidebarActive) recordFrequentView(root.dataset.hubSidebarActive);
    }
    const asides = [...new Set(roots.map(root => root.closest('aside')).filter(Boolean))];
    let collapsed = false;
    try { collapsed = localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'; } catch {}
    const updateCollapsed = (next, persist = true) => {
      collapsed = Boolean(next);
      for (const [index, aside] of asides.entries()) {
        const layout = aside.parentElement;
        layout?.classList.add('hub-sidebar-layout');
        aside.classList.add('hub-sidebar-aside');
        if (!aside.id) aside.id = `hubSidebar${index + 1}`;
        layout?.classList.toggle('hub-sidebar-collapsed', collapsed);
        const button = aside.querySelector(':scope > [data-hub-sidebar-collapse-toggle]');
        if (!button) continue;
        const icon = button.querySelector('.hub-sidebar-collapse-icon');
        const accessibleLabel = collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';
        if (icon) icon.innerHTML = sidebarCollapseIcon(collapsed);
        button.setAttribute('aria-label', accessibleLabel);
        button.setAttribute('title', accessibleLabel);
        button.setAttribute('aria-expanded', String(!collapsed));
        button.setAttribute('aria-controls', aside.id);
      }
      if (persist) {
        try {
          if (collapsed) localStorage.setItem(COLLAPSED_STORAGE_KEY, 'true');
          else localStorage.removeItem(COLLAPSED_STORAGE_KEY);
        } catch {}
      }
    };
    for (const [index, aside] of asides.entries()) {
      aside.classList.add('hub-sidebar-aside');
      aside.parentElement?.classList.add('hub-sidebar-layout');
      if (!aside.id) aside.id = `hubSidebar${index + 1}`;
      let button = aside.querySelector(':scope > [data-hub-sidebar-collapse-toggle]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'hub-sidebar-collapse-toggle';
        button.dataset.hubSidebarCollapseToggle = '';
        button.innerHTML = '<span class="hub-sidebar-collapse-icon" aria-hidden="true"></span>';
        aside.insertBefore(button, aside.firstChild);
      }
      if (button.dataset.hubSidebarCollapseBound !== 'true') {
        button.dataset.hubSidebarCollapseBound = 'true';
        button.addEventListener('click', () => updateCollapsed(!collapsed));
      }
    }
    updateCollapsed(collapsed, false);
    let saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch {}
    const activeRoot = roots.find(root => activeGroupFor(root));
    const activeGroup = activeRoot ? activeGroupFor(activeRoot) : '';
    if (activeGroup) saved = activeGroup;
    if (!document.querySelector(`[data-sidebar-group="${CSS.escape(saved)}"]`)) saved = 'operation';
    setOpenGroup(saved, false);
    document.addEventListener('click', event => {
      const requiredItem = event.target.closest('[data-requires-google-ads-api]');
      if (requiredItem && window.GoogleAdsSourcePreference?.read() !== 'api') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const view = window.PanelViews?.definition(requiredItem.dataset.requiredView);
        document.dispatchEvent(new CustomEvent('hub:google-ads-api-required', {
          detail: { viewId: requiredItem.dataset.requiredView, title: view?.title || requiredItem.textContent.trim() },
        }));
        return;
      }
      const destination = event.target.closest('[data-hub-menu-key], [data-hub-frequent-key]');
      if (destination) {
        if (sidebarNavigationReplay.has(destination)) {
          sidebarNavigationReplay.delete(destination);
          return;
        }
        requestSidebarDestinationActivation(event, destination);
        if (event.defaultPrevented) return;
      }
      const toggle = event.target.closest('[data-sidebar-toggle]');
      if (!toggle) return;
      const group = toggle.closest('[data-sidebar-group]');
      setOpenGroup(group.classList.contains('collapsed') ? toggle.dataset.sidebarToggle : '');
    }, true);
    document.addEventListener('google-ads-source-mode-changed', refreshApiRequirements);
    document.addEventListener('hub:screen-visited', event => recordFrequentViewForScreen(event.detail?.viewId));
    bindForegroundTracking();
    window.addEventListener('storage', event => {
      if (event.key === FREQUENT_VIEWS_STORAGE_KEY) {
        frequentViews = readFrequentViews();
        refreshFrequentViewHosts();
      }
      if (event.key === window.GoogleAdsSourcePreference?.key) refreshApiRequirements();
    });
    refreshApiRequirements();
  }

  function bindRestartServerButton() {
    const button = document.querySelector('[data-hub-restart-server]');
    const status = document.querySelector('[data-hub-restart-status]');
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';

    const showStatus = (message, state = '') => {
      if (!status) return;
      status.textContent = message;
      status.hidden = !message;
      if (state) status.dataset.state = state;
      else delete status.dataset.state;
    };
    const readHealth = async () => {
      const response = await fetch('/api/presell/health', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(`O servidor respondeu HTTP ${response.status}.`);
      return response.json();
    };
    const delay = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

    button.addEventListener('click', async () => {
      if (!window.confirm('O servidor do Hub será reiniciado e esta aba recarregada. Salve alterações em andamento antes de continuar.')) return;
      button.disabled = true;
      showStatus('Conferindo o servidor local…');
      try {
        const initialHealth = await readHealth();
        if (!initialHealth.instanceId) {
          showStatus('Esta instância ainda é antiga. Encerre o servidor antigo e execute scripts\\iniciar-painel.ps1 uma vez; depois, use este botão.', 'notice');
          button.disabled = false;
          return;
        }

        showStatus('Solicitando reinício…');
        const response = await fetch('/api/server/restart', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (response.status === 404 || response.status === 405) {
          showStatus('Esta instância ainda é antiga. Encerre o servidor antigo e execute scripts\\iniciar-painel.ps1 uma vez.', 'notice');
          button.disabled = false;
          return;
        }
        let result = {};
        try { result = await response.json(); } catch {}
        if (!response.ok || result.restarting !== true) throw new Error(result.error || `O comando falhou (HTTP ${response.status}).`);

        showStatus('Aguardando o servidor voltar…');
        for (let attempt = 0; attempt < 90; attempt += 1) {
          await delay(350);
          try {
            const health = await readHealth();
            if (health.instanceId && health.instanceId !== initialHealth.instanceId) {
              showStatus('Servidor reiniciado. Atualizando esta aba…');
              window.location.reload();
              return;
            }
          } catch {}
        }
        throw new Error('O servidor não voltou no tempo esperado. Confira se o Hub continua aberto em http://127.0.0.1:8765/.');
      } catch (error) {
        showStatus(error?.message || 'Não foi possível reiniciar o servidor local.', 'error');
        button.disabled = false;
      }
    });
  }

  window.HubSidebar = Object.freeze({ setOpenGroup, initialize, refreshApiRequirements, openMenuDestination: key => clickSidebarMenuItem(key) });
  initialize();
  if (!window.__hubWaterReminderStarted) {
    window.__hubWaterReminderStarted = true;
    import('/meu-tempo/water-reminder.mjs?v=8')
      .then(module => module.mountGlobalWaterReminder())
      .catch(() => { window.__hubWaterReminderStarted = false; });
  }
  if (!window.__hubCampaignImpressionNotificationStarted) {
    window.__hubCampaignImpressionNotificationStarted = true;
    import('/google-ads/campaign-impression-notification.mjs?v=3')
      .then(module => module.mountGlobalCampaignImpressionNotification())
      .catch(() => { window.__hubCampaignImpressionNotificationStarted = false; });
  }
})();

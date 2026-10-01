(() => {
  const STORAGE_KEY = 'painel-sidebar-grupo-aberto-v1';
  const COLLAPSED_STORAGE_KEY = 'painel-sidebar-recolhido-v1';
  const groups = [
    { id: 'operation', label: 'Operação', items: [
      { key: 'overview', label: 'Visão geral', view: 'totals', href: '/' },
      { key: 'preparer', label: 'Preparador MCC', href: '/preparador-MCC/?v=20260923-sidebar' },
    ] },
    { id: 'finance', label: 'Financeiro', items: [
      { key: 'macro', label: 'Controle Macro', view: 'macro', href: '/?view=macro' },
      { key: 'billing', label: 'Faturamento', view: 'billing', href: '/?view=billing' },
    ] },
    { id: 'analysis', label: 'Análises', items: [
      { key: 'cpa', label: 'Análise por faixa de CPA', view: 'cpa', href: '/?view=cpa' },
      { key: 'accounts', label: 'Mapa por conta', view: 'accounts', href: '/?view=accounts' },
      { key: 'observability', label: 'Observabilidade decisória', view: 'observability', href: '/?view=observability' },
      { key: 'curation-observability', label: 'Observabilidade da Curadoria', view: 'curation-observability', href: '/?view=curation-observability' },
    ] },
    { id: 'curation', label: 'Curadoria', items: [
      { key: 'radar', label: 'Radar SpyHero', href: '/curadoria/' },
      { key: 'manager', label: 'Lista de Gerente GM', href: '/curadoria/gerentes/' },
      { key: 'ecommerce', label: 'E-commerce GM', href: '/curadoria/top-performance/' },
    ] },
    { id: 'creation', label: 'Criação de ofertas', items: [
      { key: 'asset-studio', label: 'Asset Studio', href: '/asset-studio/' },
      { key: 'copy', label: 'Ficha e Presell', view: 'copy', href: '/?view=copy' },
    ] },
    { id: 'personal', label: 'Pessoal', items: [
      { key: 'time', label: 'Meu Tempo', view: 'time', href: '/?view=time' },
      { key: 'personal-finance', label: 'Controle de gastos', view: 'personal-finance', href: '/?view=personal-finance' },
    ] },
  ];

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  function activeGroupFor(root) {
    const activePage = root.dataset.hubSidebarActive;
    if (activePage) {
      const group = groups.find(item => item.items.some(link => link.key === activePage));
      if (group) return group.id;
      if (activePage === 'tested' || activePage === 'journal') return 'products';
    }
    if (root.dataset.hubSidebarMode === 'app' && window.PanelViews) {
      const view = window.PanelViews.resolveRoute(location.href);
      if (view.id === 'tested') return 'products';
      return groups.find(group => group.items.some(item => item.view === view.id))?.id || 'operation';
    }
    return '';
  }

  function itemMarkup(item, mode, activeKey) {
    const active = activeKey === item.key;
    const className = `hub-menu-link${active ? ' active' : ''}`;
    const current = active ? ' aria-current="page"' : '';
    if (mode === 'app' && item.view) {
      const definition = window.PanelViews?.definition(item.view);
      const id = definition?.navId || item.navId;
      return `<button type="button" class="${className}" id="${escapeHtml(id)}" data-hub-menu-key="${escapeHtml(item.key)}"${current}>${escapeHtml(item.label)}</button>`;
    }
    return `<a class="${className}" href="${escapeHtml(item.href)}" data-hub-menu-key="${escapeHtml(item.key)}"${current}>${escapeHtml(item.label)}</a>`;
  }

  function groupMarkup(group, mode, activeKey) {
    const bodyId = `hubMenu${group.id[0].toUpperCase()}${group.id.slice(1)}`;
    const links = group.items.map(item => itemMarkup(item, mode, activeKey)).join('');
    const products = group.id === 'operation' ? productsMarkup(mode, activeKey) : '';
    return `<section class="hub-menu-group collapsed" data-sidebar-group="${group.id}">
      <button class="hub-menu-toggle" type="button" data-sidebar-toggle="${group.id}" aria-expanded="false" aria-controls="${bodyId}"><span>${escapeHtml(group.label)}</span><span class="hub-menu-chevron" aria-hidden="true">›</span></button>
      <div class="hub-menu-body" id="${bodyId}">${links}${products}</div>
    </section>`;
  }

  function productsMarkup(mode, activeKey) {
    const bodyId = 'hubMenuProducts';
    if (mode === 'app') {
      return `<section id="campaignSidebarTools" class="hub-menu-group hub-menu-products collapsed" data-sidebar-group="products">
        <button class="hub-menu-toggle" type="button" data-sidebar-toggle="products" aria-expanded="false" aria-controls="${bodyId}"><span>Produtos</span><span class="hub-menu-chevron" aria-hidden="true">›</span></button>
        <div class="hub-menu-body" id="${bodyId}">
          ${itemMarkup({ key: 'tested', label: 'Produtos testados', view: 'tested', href: '/?view=tested' }, mode, activeKey)}
          <span class="hub-menu-subhead">Diário de campanha</span>
          <div class="list-tabs"><button id="activeListTab" class="active" type="button">Ativas</button><button id="historyListTab" type="button">Histórico</button></div>
          <input id="search" class="search" type="search" placeholder="Buscar campanha">
          <div id="campaignList" class="campaign-list"></div>
        </div>
      </section>`;
    }
    return `<section class="hub-menu-group hub-menu-products collapsed" data-sidebar-group="products">
      <button class="hub-menu-toggle" type="button" data-sidebar-toggle="products" aria-expanded="false" aria-controls="${bodyId}"><span>Produtos</span><span class="hub-menu-chevron" aria-hidden="true">›</span></button>
      <div class="hub-menu-body" id="${bodyId}">
        ${itemMarkup({ key: 'tested', label: 'Produtos testados', view: 'tested', href: '/?view=tested' }, mode, activeKey)}
        ${itemMarkup({ key: 'journal', label: 'Diário de campanha', href: '/' }, mode, activeKey)}
      </div>
    </section>`;
  }

  function setGroupExpanded(group, expanded, persist) {
      const body = group.querySelector(':scope > .hub-menu-body');
      const toggle = group.querySelector(':scope > .hub-menu-toggle');
      if (body) {
        const wasExpanded = !group.classList.contains('collapsed');
        body.inert = !expanded;
        if (persist && wasExpanded !== expanded) {
          const from = body.getBoundingClientRect().height;
          const to = expanded ? body.scrollHeight : 0;
          body.getAnimations().forEach(animation => animation.cancel());
          group.classList.toggle('collapsed', !expanded);
          if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && typeof body.animate === 'function') {
            body.animate([
              { height: `${from}px`, opacity: wasExpanded ? 1 : 0, transform: wasExpanded ? 'translateY(0)' : 'translateY(-4px)' },
              { height: `${to}px`, opacity: expanded ? 1 : 0, transform: expanded ? 'translateY(0)' : 'translateY(-4px)' },
            ], { duration: 190, easing: 'ease-out' });
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
    const productGroups = allGroups.filter(group => group.dataset.sidebarGroup === 'products' && group.parentElement.closest('[data-sidebar-group="operation"]'));
    const topName = name === 'products' ? 'operation' : name;
    for (const group of topGroups) setGroupExpanded(group, group.dataset.sidebarGroup === topName, persist);
    for (const group of productGroups) setGroupExpanded(group, name === 'products', persist);
    if (persist) {
      try { name ? localStorage.setItem(STORAGE_KEY, name) : localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }

  function initialize() {
    const roots = [...document.querySelectorAll('[data-hub-sidebar]')];
    if (!roots.length) return;
    for (const root of roots) {
      const mode = root.dataset.hubSidebarMode || 'links';
      const routeView = mode === 'app' ? window.PanelViews?.resolveRoute(location.href) : null;
      const activeKey = root.dataset.hubSidebarActive || (routeView ? routeView.id === 'tested' ? 'tested' : groups.flatMap(group => group.items).find(item => item.view === routeView.id)?.key || routeView.id : '');
      root.innerHTML = groups.map(group => groupMarkup(group, mode, activeKey)).join('');
      const productHost = root.parentElement?.querySelector('[data-hub-sidebar-products]');
      productHost?.remove();
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
        const label = button.querySelector('.hub-sidebar-collapse-label');
        const accessibleLabel = collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral';
        if (icon) icon.textContent = collapsed ? '›' : '‹';
        if (label) label.textContent = collapsed ? 'Expandir menu' : 'Recolher menu';
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
        button.innerHTML = '<span class="hub-sidebar-collapse-icon" aria-hidden="true"></span><span class="hub-sidebar-collapse-label"></span>';
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
      const toggle = event.target.closest('[data-sidebar-toggle]');
      if (!toggle) return;
      const group = toggle.closest('[data-sidebar-group]');
      const isProductsSubgroup = group.dataset.sidebarGroup === 'products' && group.parentElement.closest('[data-sidebar-group="operation"]');
      setOpenGroup(isProductsSubgroup
        ? group.classList.contains('collapsed') ? 'products' : 'operation'
        : group.classList.contains('collapsed') ? toggle.dataset.sidebarToggle : '');
    });
  }

  window.HubSidebar = Object.freeze({ setOpenGroup, initialize });
  initialize();
  if (!window.__hubWaterReminderStarted) {
    window.__hubWaterReminderStarted = true;
    import('/meu-tempo/water-reminder.mjs?v=3')
      .then(module => module.mountGlobalWaterReminder())
      .catch(() => { window.__hubWaterReminderStarted = false; });
  }
})();

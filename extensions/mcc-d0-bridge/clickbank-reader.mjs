// Self-contained: Chrome serializes this function into its ISOLATED world.
// No React internals, endpoints, storage or clipboard access in the reader.
export async function collectClickBankProducts(columns, mode = 'capture', options = {}) {
  const clean = value => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const normalize = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  const offerIdFromHref = href => {
    const raw = String(href ?? '').trim();
    const hash = raw.indexOf('#');
    const route = hash >= 0 ? raw.slice(hash + 1) : raw;
    const query = route.indexOf('?');
    if (query < 0 || route.slice(0, query).replace(/\/+$/, '') !== '/offer-details') return '';
    const offerId = new URLSearchParams(route.slice(query + 1)).get('offer')?.trim() || '';
    return /^[A-Za-z0-9_-]{1,64}$/.test(offerId) ? offerId : '';
  };
  const stateKey = '__hubClickBankProductsCapture';
  const state = globalThis[stateKey] ||= { busy:false, originals:new Map(), scroller:null };
  const url = new URL(location.href);
  if (url.protocol !== 'https:' || url.hostname !== 'accounts.clickbank.com'
      || !/^\/master\/dashboard\/affiliate-marketplace\/?$/.test(url.pathname)) {
    return { ok:false, message:'Abra o Marketplace do ClickBank na aba ativa. Nenhum produto foi lido.' };
  }
  if (state.busy) return { ok:false, message:'Uma captura já está em andamento nesta aba.' };
  const restoreScroll = () => {
    if (state.scroller?.element?.isConnected) {
      state.scroller.element.scrollTop = state.scroller.top;
      state.scroller.element.scrollLeft = state.scroller.left;
    }
  };
  if (mode === 'restore') {
    for (const [element, style] of state.originals) {
      if (element.isConnected) {
        if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
      }
    }
    restoreScroll();
    state.originals.clear(); state.scroller = null;
    return { ok:true, restored:true, message:'Tamanho original da tabela restaurado.' };
  }
  state.busy = true;
  const rows = new Map();
  let expectedCount = null;
  const deadline = Date.now() + Math.min(20000, options.timeoutMs || 15000);
  const pause = async () => {
    if (Date.now() >= deadline) throw new Error('Tempo limite de renderização atingido.');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, options.settleMs ?? 120)));
  };
  const saveStyle = element => {
    if (!state.originals.has(element)) state.originals.set(element, element.getAttribute('style'));
  };
  const expand = (element, height) => {
    saveStyle(element);
    for (const property of ['height', 'min-height', 'max-height']) element.style.setProperty(property, `${height}px`, 'important');
  };
  try {
    const grids = [...document.querySelectorAll('.MuiDataGrid-root')].filter(grid =>
      grid.querySelector('a[id="title-offer-details"]') || [...grid.querySelectorAll('[role="columnheader"]')]
        .some(header => normalize(header.textContent).includes('offername')));
    if (grids.length !== 1) throw new Error('Tabela de produtos ausente ou ambígua. Aguarde o carregamento e tente novamente.');
    const grid = grids[0];
    const scroller = grid.querySelector('.MuiDataGrid-virtualScroller');
    const content = grid.querySelector('.MuiDataGrid-virtualScrollerContent');
    if (!scroller || !content || grid.getAttribute('aria-busy') === 'true') throw new Error('A tabela ainda não terminou de carregar.');
    const initialUrl = location.href;
    let verifiedStart = null;
    const renderedPageStart = limit => {
      const rankFields = new Set(), rankIndices = new Set();
      for (const header of grid.querySelectorAll('[role="columnheader"]')) {
        const label = header.querySelector('.MuiDataGrid-columnHeaderTitle')?.textContent ?? header.textContent;
        const rankColumn = columns.find(column => column.key === 'rank');
        if (!rankColumn || !(normalize(label) === normalize(rankColumn.label)
          || rankColumn.aliases.includes(normalize(header.getAttribute('data-field'))))) continue;
        const field = header.getAttribute('data-field'), index = header.getAttribute('aria-colindex');
        if (field) rankFields.add(field);
        if (index) rankIndices.add(index);
      }
      const starts = new Set();
      for (const row of grid.querySelectorAll('.MuiDataGrid-row')) {
        for (const cell of row.querySelectorAll('.MuiDataGrid-cell')) {
          if (!rankFields.has(cell.getAttribute('data-field')) && !rankIndices.has(cell.getAttribute('aria-colindex'))) continue;
          const text = clean(cell.textContent), rank = /^\d+$/.test(text) ? Number(text) : null;
          if (!Number.isSafeInteger(rank) || rank < 1) throw new Error('Uma posição de produto não pôde ser confirmada.');
          starts.add(Math.floor((rank - 1) / limit) * limit + 1);
        }
      }
      if (starts.size > 1) throw new Error('As posições visíveis pertencem a páginas diferentes. Aguarde o carregamento e tente novamente.');
      return starts.size ? [...starts][0] : null;
    };
    const countSnapshot = () => {
      const pagination = clean(grid.querySelector('.MuiTablePagination-displayedRows')?.textContent);
      const range = pagination.match(/([\d,.]+)\s*[-–—]\s*([\d,.]+)\s*(?:of|de)\s*([\d,.]+)/i);
      const number = text => Number(text.replace(/[,.]/g, ''));
      if (range) {
        const first = number(range[1]), last = number(range[2]), total = number(range[3]);
        return { count:total === 0 ? 0 : last - first + 1, signature:pagination, start:first, end:last, total };
      }
      const params = new URLSearchParams(url.hash.split('?')[1] || url.search.slice(1));
      const limit = Number(params.get('resultsPerPage'));
      const totalMatch = clean(document.body?.innerText).match(/([\d,.]+)\s+results\b/i);
      if (params.has('resultsPerPage') && totalMatch && Number.isSafeInteger(limit) && limit > 0 && limit <= 1000) {
        const total = number(totalMatch[1]);
        // "offset" can be a page index, not a row offset. Confirm from rendered UI.
        const selectedPages = new Set([...document.querySelectorAll('[aria-current="page"], .MuiPaginationItem-page.Mui-selected, .ant-pagination-item-active')]
          .map(element => clean(element.textContent)).filter(text => /^\d+$/.test(text)).map(Number));
        if (selectedPages.size > 1) throw new Error('A página selecionada é ambígua. Nenhum dado foi enviado.');
        const selected = selectedPages.size ? [...selectedPages][0] : null;
        if (selected !== null && (!Number.isSafeInteger(selected) || selected < 1)) throw new Error('Página selecionada inválida.');
        const visibleStart = renderedPageStart(limit), selectedStart = selected === null ? null : (selected - 1) * limit + 1;
        const start = selectedStart ?? visibleStart ?? verifiedStart;
        if (!Number.isSafeInteger(total) || !Number.isSafeInteger(start) || start < 1 || start > total) throw new Error('Não foi possível confirmar a faixa de posições desta página.');
        if ((visibleStart !== null && visibleStart !== start) || (verifiedStart !== null && verifiedStart !== start)) throw new Error('A página mudou ou suas posições não correspondem à paginação. Aguarde e tente novamente.');
        verifiedStart = start; // Survives horizontal virtualization hiding the Rank column.
        const end = Math.min(start + limit - 1, total);
        return { count:end - start + 1, signature:`${limit}:${start}:${total}`,
          start, end, total, pageSize:limit };
      }
      throw new Error('Não foi possível confirmar a quantidade esperada nesta página. Nenhum sucesso completo será anunciado.');
    };
    state.scroller = { element:scroller, top:scroller.scrollTop, left:scroller.scrollLeft };
    scroller.scrollLeft = 0; // Read global Rank before any horizontal sweep hides it.
    await pause();
    const initialCount = countSnapshot();
    expectedCount = initialCount.count;
    if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 1000) throw new Error('A página não contém uma quantidade verificável de produtos (limite de segurança: 1000).');
    const virtualHeight = Math.max(content.scrollHeight, content.getBoundingClientRect().height);
    if (!Number.isFinite(virtualHeight) || virtualHeight <= 0 || virtualHeight > 100000) throw new Error('Dimensões da tabela não puderam ser verificadas.');
    const chromeHeight = Math.max(0, grid.getBoundingClientRect().height - scroller.clientHeight);
    const height = Math.ceil(virtualHeight + chromeHeight + 24);
    expand(grid, height);
    // Only constrain ancestors whose computed sizing actually clips this grid.
    for (let parent = grid.parentElement, depth = 0; parent && parent !== document.body && depth < 4; parent = parent.parentElement, depth++) {
      const style = getComputedStyle(parent);
      if (['hidden','clip','auto','scroll'].includes(style.overflowY) && parent.clientHeight < height) expand(parent, height);
    }
    await pause();
    const mapping = new Map();
    const indices = new Map();
    const sample = () => {
      if (!grid.isConnected || location.href !== initialUrl || countSnapshot().signature !== initialCount.signature) throw new Error('A página mudou durante a captura. Tente novamente.');
      if (grid.getAttribute('aria-busy') === 'true' || grid.querySelector('[role="progressbar"]')) throw new Error('Carregamento em andamento; tente novamente quando terminar.');
      for (const header of grid.querySelectorAll('[role="columnheader"]')) {
        const label = header.querySelector('.MuiDataGrid-columnHeaderTitle')?.textContent ?? header.textContent;
        const column = columns.find(item => normalize(item.label) === normalize(label) || item.aliases.includes(normalize(header.getAttribute('data-field'))));
        if (!column) continue;
        const field = header.getAttribute('data-field');
        if (field) mapping.set(field, column.key);
        const index = header.getAttribute('aria-colindex');
        if (index) indices.set(index, column.key);
      }
      for (const element of grid.querySelectorAll('.MuiDataGrid-row')) {
        const values = {};
        for (const cell of element.querySelectorAll('.MuiDataGrid-cell')) {
          const key = mapping.get(cell.getAttribute('data-field')) || indices.get(cell.getAttribute('aria-colindex'));
          if (!key) continue;
          const link = key === 'name' && cell.querySelector('a[id="title-offer-details"]');
          values[key] = clean(link ? link.textContent : cell.textContent);
          if (key === 'name') values.offerId = offerIdFromHref(link?.getAttribute?.('href') ?? link?.href);
        }
        const id = element.getAttribute('data-id') || element.getAttribute('aria-rowindex')
          || (values.seller && values.name ? `${values.seller}\u0000${values.name}` : null);
        if (id === null) throw new Error('Uma linha não possui identificador estável para reunir as colunas.');
        const old = rows.get(id) || { values:{}, order:Number(element.getAttribute('aria-rowindex')) || rows.size + 1 };
        for (const [key, value] of Object.entries(values)) {
          if (key in old.values && old.values[key] !== value) throw new Error('Os produtos ou métricas mudaram durante a captura. Tente novamente.');
          old.values[key] = value;
        }
        rows.set(id, old);
      }
    };
    // Sweep both axes; increasing height alone is not evidence of completeness.
    scroller.scrollTop = 0; scroller.scrollLeft = 0;
    await pause();
    let complete = false;
    for (let vertical = 0; vertical < 300; vertical++) {
      scroller.scrollLeft = 0;
      await pause(); sample();
      for (let horizontal = 0; horizontal < 100; horizontal++) {
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        if (scroller.scrollLeft >= max - 1) break;
        const before = scroller.scrollLeft;
        scroller.scrollLeft = Math.min(max, before + Math.max(80, scroller.clientWidth * .7));
        await pause(); sample();
        if (scroller.scrollLeft <= before) break;
      }
      complete = rows.size === expectedCount && [...rows.values()].every(row => columns.every(column => column.key in row.values));
      if (complete) break;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (scroller.scrollTop >= max - 1) break;
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(max, before + Math.max(40, scroller.clientHeight * .7));
      await pause();
      if (scroller.scrollTop <= before) break;
    }
    const products = [...rows.values()].sort((a,b) => a.order - b.order).map(row => row.values);
    if (complete) {
      const ranks = products.map(row => /^\d+$/.test(row.rank) ? Number(row.rank) : null).sort((a,b) => a - b);
      if (ranks.some((rank, index) => !Number.isSafeInteger(rank) || rank !== initialCount.start + index)) throw new Error('As posições capturadas não correspondem à faixa completa da página. Nenhum dado foi enviado.');
    }
    return { ok:complete, rows:products, capturedCount:rows.size, expectedCount, expanded:true,
      capturedAt:new Date().toISOString(), page:{start:initialCount.start,end:initialCount.end,total:initialCount.total,pageSize:initialCount.pageSize ?? null},
      message:complete ? `${rows.size} produtos capturados da página atual.`
        : `Captura incompleta: ${rows.size} de ${expectedCount} produtos; verifique também as nove colunas de dados. O texto parcial não foi copiado automaticamente.` };
  } catch (error) {
    return { ok:false, rows:[...rows.values()].sort((a,b) => a.order - b.order).map(row => row.values),
      capturedCount:rows.size, expectedCount, expanded:state.originals.size > 0,
      message:`${error.message} Capturados: ${rows.size}${expectedCount === null ? '' : ` de ${expectedCount}`}.` };
  } finally { restoreScroll(); state.busy = false; }
}

// Self-contained: Chrome serializes this function into its ISOLATED world.
// No React internals, endpoints, storage or clipboard access in the reader.
export async function collectClickBankProducts(columns, mode = 'capture', options = {}) {
  const clean = value => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
  const normalize = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');
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
    const countSnapshot = () => {
      const pagination = clean(grid.querySelector('.MuiTablePagination-displayedRows')?.textContent);
      const range = pagination.match(/([\d,.]+)\s*[-–—]\s*([\d,.]+)\s*(?:of|de)\s*([\d,.]+)/i);
      const number = text => Number(text.replace(/[,.]/g, ''));
      if (range) {
        const first = number(range[1]), last = number(range[2]), total = number(range[3]);
        return { count:total === 0 ? 0 : last - first + 1, signature:pagination };
      }
      const params = new URLSearchParams(url.hash.split('?')[1] || url.search.slice(1));
      const limit = Number(params.get('resultsPerPage')), offset = Number(params.get('offset'));
      const totalMatch = clean(document.body?.innerText).match(/([\d,.]+)\s+results\b/i);
      if (params.has('resultsPerPage') && params.has('offset') && totalMatch && limit > 0 && offset >= 0) {
        const total = number(totalMatch[1]);
        return { count:Math.min(limit, Math.max(0, total - offset)), signature:`${limit}:${offset}:${total}` };
      }
      throw new Error('Não foi possível confirmar a quantidade esperada nesta página. Nenhum sucesso completo será anunciado.');
    };
    const initialCount = countSnapshot();
    expectedCount = initialCount.count;
    if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 1000) throw new Error('A página não contém uma quantidade verificável de produtos (limite de segurança: 1000).');
    state.scroller = { element:scroller, top:scroller.scrollTop, left:scroller.scrollLeft };
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
    return { ok:complete, rows:products, capturedCount:rows.size, expectedCount, expanded:true,
      message:complete ? `${rows.size} produtos capturados da página atual.`
        : `Captura incompleta: ${rows.size} de ${expectedCount} produtos; verifique também as nove colunas. O texto parcial não foi copiado automaticamente.` };
  } catch (error) {
    return { ok:false, rows:[...rows.values()].sort((a,b) => a.order - b.order).map(row => row.values),
      capturedCount:rows.size, expectedCount, expanded:state.originals.size > 0,
      message:`${error.message} Capturados: ${rows.size}${expectedCount === null ? '' : ` de ${expectedCount}`}.` };
  } finally { restoreScroll(); state.busy = false; }
}

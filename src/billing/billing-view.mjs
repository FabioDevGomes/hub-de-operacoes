import * as Domain from './billing-domain.mjs';
import * as Storage from './billing-storage.mjs';

const mounted = new WeakSet();
let chartRenderSequence = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const displayDate = value => Domain.formatBrazilianDate(value);
const money = (value, currency, complete = true) => value == null ? '—' : `${new Intl.NumberFormat('pt-BR', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}${complete ? '' : ' *'}`;
const parseAmount = value => {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) throw new Error('Informe um valor válido igual ou maior que zero.');
  return number;
};

export async function mount({ root, toast = () => {}, onUpdateManualSale = null, getManualSaleEditData = null }) {
  if (!root) return;
  root.__updateManualSale = onUpdateManualSale;
  root.__getManualSaleEditData = getManualSaleEditData;
  if (!mounted.has(root)) {
    root.innerHTML = markup();
    bind(root, toast);
    mounted.add(root);
  }
  const status = root.querySelector('#billingLoadStatus');
  status.textContent = 'Preparando o histórico financeiro…';
  try {
    const response = await fetch(new URL('./seed-v1.json', import.meta.url));
    if (!response.ok) throw new Error('Não foi possível carregar a carga inicial do Faturamento.');
    const seed = await response.json();
    const seedResult = await Storage.installBillingSeed(seed);
    status.textContent = seedResult.applied ? `Carga inicial aplicada: ${seedResult.salesAdded} vendas e ${seedResult.movementsAdded} movimentos.` : 'Histórico local pronto.';
    await refresh(root);
  } catch (error) {
    status.textContent = `Não foi possível abrir o Faturamento: ${error.message}`;
    status.classList.add('billing-error');
  }
}

function markup() {
  return `<div class="billing-root">
    <div class="billing-toolbar">
      <div class="billing-mode" role="group" aria-label="Referência temporal"><button type="button" data-billing-mode="competence" class="active">Competência</button><button type="button" data-billing-mode="cash">Caixa</button></div>
      <div class="billing-presets" role="group" aria-label="Período"><button type="button" data-billing-period="today">Hoje</button><button type="button" data-billing-period="last7">Últimos 7 dias</button><button type="button" data-billing-period="current">Mês atual</button><button type="button" data-billing-period="previous">Mês anterior</button></div>
      <div class="billing-month-navigation" role="group" aria-label="Navegar entre meses registrados"><button class="btn" type="button" data-billing-month-nav="previous" aria-label="Mês anterior" title="Mês anterior" disabled><span aria-hidden="true">‹</span></button><span id="billingMonthLabel" aria-live="polite"></span><button class="btn" type="button" data-billing-month-nav="next" aria-label="Próximo mês" title="Próximo mês" disabled><span aria-hidden="true">›</span></button></div>
      <div class="billing-custom-period"><label>De <input type="text" id="billingStart" inputmode="numeric" placeholder="dd/mm/aaaa" aria-label="Data inicial"></label><label>Até <input type="text" id="billingEnd" inputmode="numeric" placeholder="dd/mm/aaaa" aria-label="Data final"></label><button class="btn" type="button" id="billingApplyPeriod">Aplicar</button></div>
      <button class="btn primary" type="button" id="billingNewSale">Adicionar venda</button>
    </div>
    <div id="billingLoadStatus" class="billing-load-status" role="status" aria-live="polite"></div>
    <div class="billing-notice">Valores em R$ e US$ são apresentados separadamente, sem conversão. Linhas MCC mostram o valor de conversão atribuído, não um recebimento confirmado. Pagamentos sem data não entram em um período de Caixa. Asterisco indica cobertura incompleta por valor ausente na origem.</div>
    <div id="billingKpis" class="billing-kpis"></div>
    <div class="billing-filters">
      <label>Plataforma<select id="billingPlatform" class="search"><option value="all">Todas</option></select></label>
      <label>Produto<select id="billingProduct" class="search"><option value="all">Todos</option></select></label>
      <label>Conta<select id="billingAccount" class="search"><option value="all">Todas</option></select></label>
      <label>Status de pagamento<select id="billingStatus" class="search"><option value="all">Todos</option><option value="paid">Paga</option><option value="partially_paid">Parcialmente paga</option><option value="pending">Pendente</option><option value="unknown">Não informado</option></select></label>
      <label>Registro<select id="billingRecordState" class="search"><option value="active">Ativos</option><option value="cancelled">Cancelados</option><option value="all">Todos</option></select></label>
      <label class="billing-search">Buscar<input id="billingSearch" class="search" type="search" placeholder="Produto, conta, plataforma…"></label>
    </div>
    <section class="card panel billing-aggregate-panel"><div class="panel-head"><div><h2 id="billingAggregateTitle">Faturamento por mês</h2><p>Totais do recorte e filtros selecionados.</p></div><div class="panel-controls"><label>Agregar por <select id="billingDimension" class="search" style="width:auto"><option value="month">Mês</option><option value="product">Produto</option><option value="platform">Plataforma</option><option value="account">Conta</option></select></label></div></div><div class="billing-table-wrap"><table><thead id="billingAggregateHead"></thead><tbody id="billingAggregateBody"></tbody></table></div></section>
    <section class="card panel billing-detail-panel"><div class="panel-head"><div><h2 id="billingDetailTitle">Vendas por competência</h2><p id="billingCaption"></p></div><span id="billingCount" class="tag"></span></div><div class="billing-table-wrap"><table><thead id="billingSalesHead"></thead><tbody id="billingSalesBody"></tbody></table></div><div class="billing-pagination"><span id="billingPageSummary"></span><div><button id="billingPreviousPage" class="btn" type="button">Anterior</button><button id="billingNextPage" class="btn" type="button">Próxima</button><select id="billingPageSize" class="search" aria-label="Linhas por página"><option>25</option><option selected>50</option><option>100</option></select></div></div></section>
    <section class="card panel billing-monthly-chart-panel" aria-labelledby="billingMonthlyChartTitle"><div class="panel-head"><div><h2 id="billingMonthlyChartTitle">Faturamento mensal (R$)</h2><p id="billingMonthlyChartCaption">Últimos 12 meses até o mês selecionado · filtros atuais.</p></div></div><div id="billingMonthlyChart" class="billing-month-chart-scroll"></div></section>
    <div id="billingModal" class="billing-modal hidden" role="dialog" aria-modal="true" aria-labelledby="billingModalTitle"><form id="billingForm" class="billing-modal-card"><div class="panel-head"><h2 id="billingModalTitle">Nova venda</h2><button class="btn" type="button" data-close-modal>Fechar</button></div><p id="billingSourceCorrectionNotice" class="billing-notice hidden">Este lançamento está vinculado à venda provisória da base de campanhas. Data, produto, plataforma, campanha, país, hora e valor serão sincronizados com os cálculos. Data e campanha também definem a conciliação MCC e o diário associado. Recebimentos e reembolsos registrados permanecem preservados.</p><input type="hidden" name="sale_id"><div class="billing-form-grid">
      <label>Data da venda <input name="sale_date" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" required></label>
      <label>Produto <input name="product" required></label><label>Plataforma <input name="platform" required></label><label>Tipo de comissão <input name="commission_type" placeholder="Comissão"></label><label>Conta <input name="account"></label>
      <label id="billingSourceCampaignField" class="hidden">Campanha associada<select name="source_campaign_id"></select></label><label id="billingSourceCountryField" class="hidden">País da venda<select name="source_country_code"></select></label><label id="billingSourceTimeField" class="hidden">Hora da venda <input name="source_sale_time" type="text" inputmode="numeric" placeholder="HH:MM"></label>
      <label>Comissão (R$) <input name="value_brl" inputmode="decimal" placeholder="0,00"></label><label>Comissão (US$) <input name="value_usd" inputmode="decimal" placeholder="0,00"></label>
      <label>Status observado <select name="payment_status"><option value="unknown">Não informado</option><option value="pending">Pendente</option><option value="partially_paid">Parcialmente paga</option><option value="paid">Paga</option></select></label>
      <label>Data de pagamento, se conhecida <input name="payment_date" type="text" inputmode="numeric" placeholder="dd/mm/aaaa"></label>
      <label class="billing-form-wide">Observação <textarea name="notes" rows="3"></textarea></label>
      </div><div class="billing-modal-actions"><button class="btn" type="button" data-close-modal>Cancelar</button><button class="btn primary" type="submit">Salvar venda</button></div></form></div>
    <div id="billingMovementModal" class="billing-modal hidden" role="dialog" aria-modal="true" aria-labelledby="billingMovementTitle"><form id="billingMovementForm" class="billing-modal-card"><div class="panel-head"><h2 id="billingMovementTitle">Novo movimento</h2><button class="btn" type="button" data-close-movement>Fechar</button></div><input type="hidden" name="sale_id"><input type="hidden" name="type"><div class="billing-form-grid"><label>Data efetiva (opcional) <input name="effective_date" type="text" inputmode="numeric" placeholder="dd/mm/aaaa"></label><label>Valor em R$ <input name="value_brl" inputmode="decimal" placeholder="0,00"></label><label>Valor em US$ <input name="value_usd" inputmode="decimal" placeholder="0,00"></label><label class="billing-form-wide">Observação <textarea name="notes" rows="3"></textarea></label></div><div class="billing-modal-actions"><button class="btn" type="button" data-close-movement>Cancelar</button><button class="btn primary" type="submit">Registrar movimento</button></div></form></div>
  </div>`;
}

function bind(root, toast) {
  root.addEventListener('click', async event => {
    const mode = event.target.closest('[data-billing-mode]');
    if (mode) { root.dataset.mode = mode.dataset.billingMode; root.dataset.page = '1'; await refresh(root); return; }
    const period = event.target.closest('[data-billing-period]');
    if (period) { root.dataset.preset = period.dataset.billingPeriod; await refresh(root); return; }
    const monthNavigation = event.target.closest('[data-billing-month-nav]');
    if (monthNavigation) {
      const targetMonth = monthNavigation.dataset.targetMonth;
      const range = Domain.dateRangeForMonth(targetMonth);
      if (!range) return;
      root.querySelector('#billingStart').value = displayDate(range.start);
      root.querySelector('#billingEnd').value = displayDate(range.end);
      root.dataset.preset = 'custom';
      root.dataset.page = '1';
      await refresh(root);
      return;
    }
    const action = event.target.closest('[data-billing-action]');
    if (action) { await handleAction(action, root, toast); return; }
    const sort = event.target.closest('[data-billing-sort]');
    if (sort) {
      const key = sort.dataset.billingSort;
      root.dataset.direction = root.dataset.sort === key && root.dataset.direction !== 'asc' ? 'asc' : 'desc';
      root.dataset.sort = key;
      root.dataset.page = '1';
      renderTable(root);
      return;
    }
    if (event.target.closest('#billingNewSale')) { openSaleModal(root); return; }
    if (event.target.closest('#billingApplyPeriod')) { root.dataset.preset = 'custom'; root.dataset.page = '1'; await refresh(root); return; }
    if (event.target.closest('#billingPreviousPage')) { root.dataset.page = String(Math.max(1, Number(root.dataset.page || 1) - 1)); renderTable(root); return; }
    if (event.target.closest('#billingNextPage')) { root.dataset.page = String(Number(root.dataset.page || 1) + 1); renderTable(root); return; }
    if (event.target.closest('[data-close-modal]')) closeSaleModal(root);
    if (event.target.closest('[data-close-movement]')) closeMovementModal(root);
  });
  root.addEventListener('change', async event => {
    if (event.target.matches('#billingDimension')) await refresh(root);
    else if (event.target.matches('#billingPageSize')) { root.dataset.page = '1'; renderTable(root); }
    else if (event.target.matches('.billing-filters select')) { root.dataset.page = '1'; await refresh(root); }
  });
  root.addEventListener('input', async event => {
    if (event.target.matches('#billingSearch')) { root.dataset.page = '1'; await refresh(root); }
  });
  root.querySelector('#billingForm').addEventListener('submit', event => saveSaleForm(event, root, toast));
  root.querySelector('#billingForm').addEventListener('change', event => {
    if (!event.target.matches('[name="source_campaign_id"]')) return;
    const form = root.querySelector('#billingForm');
    const campaign = form.__manualSaleCampaigns?.find(item => item.id === event.target.value);
    if (campaign) form.elements.account.value = campaign.conta_id || campaign.conta_sufixo || '';
  });
  root.querySelector('#billingMovementForm').addEventListener('submit', event => saveMovementForm(event, root, toast));
  root.querySelector('#billingModal').addEventListener('click', event => { if (event.target.id === 'billingModal') closeSaleModal(root); });
  root.querySelector('#billingMovementModal').addEventListener('click', event => { if (event.target.id === 'billingMovementModal') closeMovementModal(root); });
}

async function refresh(root) {
  const preset = root.dataset.preset || 'current';
  const range = preset === 'custom'
    ? { start: Domain.parseBrazilianDate(root.querySelector('#billingStart').value), end: Domain.parseBrazilianDate(root.querySelector('#billingEnd').value) }
    : Domain.dateRangeFor(preset);
  if (!range.start || !range.end || range.start > range.end) {
    root.querySelector('#billingCaption').textContent = 'Informe um período válido em dia/mês/ano.';
    root.querySelector('#billingKpis').innerHTML = '';
    root.querySelector('#billingSalesBody').innerHTML = '<tr><td class="billing-empty" colspan="12">Corrija o período para ver os registros.</td></tr>';
    return;
  }
  root.querySelector('#billingStart').value = displayDate(range.start);
  root.querySelector('#billingEnd').value = displayDate(range.end);
  root.dataset.start = range.start;
  root.dataset.end = range.end;
  root.dataset.page ||= '1';
  root.dataset.mode ||= 'competence';
  const mode = root.dataset.mode;
  root.querySelectorAll('[data-billing-mode]').forEach(button => button.classList.toggle('active', button.dataset.billingMode === mode));
  root.querySelectorAll('[data-billing-period]').forEach(button => button.classList.toggle('active', button.dataset.billingPeriod === preset));
  await updateMonthNavigation(root, range, mode);
  const [raw, allSales] = await Promise.all([
    mode === 'competence'
      ? Storage.querySalesByDate(range.start, range.end)
      : Storage.queryMovementsByDate(range.start, range.end),
    Storage.queryAllSales(),
  ]);
  const salesMap = new Map();
  let rows;
  let movements;
  let sales;
  if (mode === 'competence') {
    sales = raw;
    movements = await Storage.movementsForSales(sales.map(sale => sale.sale_id));
    for (const sale of sales) salesMap.set(sale.sale_id, sale);
    rows = sales.map(sale => ({ sale, movements: movements.filter(move => move.sale_id === sale.sale_id) }));
  } else {
    movements = raw;
    sales = await Storage.salesByIds(movements.map(move => move.sale_id));
    for (const sale of sales) salesMap.set(sale.sale_id, sale);
    rows = movements.map(movement => ({ ...movement, sale: salesMap.get(movement.sale_id) || null }));
  }
  const filters = getFilters(root);
  const visibleRows = Domain.filterRows(rows, filters).filter(row => filters.recordState === 'all' || (filters.recordState === 'cancelled' ? row.sale?.active === false : row.sale?.active !== false));
  const visibleSaleIds = new Set(visibleRows.map(row => row.sale?.sale_id).filter(Boolean));
  const visibleSales = sales.filter(sale => visibleSaleIds.has(sale.sale_id) && (filters.recordState === 'all' || (filters.recordState === 'cancelled' ? sale.active === false : sale.active !== false)));
  const visibleMovements = mode === 'competence' ? movements.filter(move => visibleSaleIds.has(move.sale_id)) : visibleRows;
  root.__billing = { mode, range, rows: visibleRows, sales: visibleSales, movements: visibleMovements, salesMap, allMovements: movements, allSales };
  populateFilters(root, sales);
  renderKpis(root);
  renderAggregate(root);
  renderTable(root);
  await renderMonthlyChart(root);
}

async function updateMonthNavigation(root, range, mode) {
  const month = range.start.slice(0, 7);
  root.querySelector('#billingMonthLabel').textContent = new Intl.DateTimeFormat('pt-BR', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const key = `${mode}:${month}`;
  if (root.dataset.billingMonthNavKey === key) return;
  root.dataset.billingMonthNavKey = key;
  const previousButton = root.querySelector('[data-billing-month-nav="previous"]');
  const nextButton = root.querySelector('[data-billing-month-nav="next"]');
  previousButton.disabled = true;
  nextButton.disabled = true;
  previousButton.dataset.targetMonth = '';
  nextButton.dataset.targetMonth = '';
  try {
    const [previousMonth, nextMonth] = await Promise.all([
      Storage.adjacentRecordedMonth(mode, month, 'previous'),
      Storage.adjacentRecordedMonth(mode, month, 'next'),
    ]);
    if (root.dataset.billingMonthNavKey !== key) return;
    previousButton.dataset.targetMonth = previousMonth || '';
    nextButton.dataset.targetMonth = nextMonth || '';
    previousButton.disabled = !previousMonth;
    nextButton.disabled = !nextMonth;
  } catch {
    previousButton.disabled = true;
    nextButton.disabled = true;
  }
}

function getFilters(root) {
  return {
    platform: root.querySelector('#billingPlatform').value || 'all',
    product: root.querySelector('#billingProduct').value || 'all',
    account: root.querySelector('#billingAccount').value || 'all',
    status: root.querySelector('#billingStatus').value || 'all',
    recordState: root.querySelector('#billingRecordState').value || 'active',
    search: root.querySelector('#billingSearch').value || '',
  };
}

function invalidateMonthNavigation(root) {
  delete root.dataset.billingMonthNavKey;
}

function populateFilters(root, sales) {
  for (const [selector, key, allLabel] of [['#billingPlatform', 'platform', 'Todas'], ['#billingProduct', 'product', 'Todos'], ['#billingAccount', 'account', 'Todas']]) {
    const select = root.querySelector(selector), selected = select.value || 'all';
    const values = [...new Set(sales.map(sale => sale[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.innerHTML = `<option value="all">${allLabel}</option>${values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}`;
    select.value = values.includes(selected) ? selected : 'all';
  }
}

function renderKpis(root) {
  const context = root.__billing;
  const html = context.mode === 'competence' ? competenceKpis(context.sales, context.movements) : cashKpis(context.movements);
  root.querySelector('#billingKpis').innerHTML = `${lifetimeTotalKpi(context.allSales)}${html}`;
  root.querySelector('#billingDetailTitle').textContent = context.mode === 'competence' ? 'Vendas por competência' : 'Movimentos por caixa';
  root.querySelector('#billingAggregateTitle').textContent = context.mode === 'competence' ? 'Faturamento por dimensão' : 'Movimentos de caixa por dimensão';
  root.querySelector('#billingCaption').textContent = `${displayDate(context.range.start)} a ${displayDate(context.range.end)} · ${context.mode === 'competence' ? 'Data da venda' : 'Data efetiva do movimento'}.`;
}

function lifetimeTotalKpi(sales) {
  const activeSales = sales.filter(sale => sale.active !== false);
  const grossBrl = Domain.sumCurrency(activeSales, 'value_brl');
  const grossUsd = Domain.sumCurrency(activeSales, 'value_usd');
  const note = `Bruto do histórico por competência · inclui provisórias · exclui vendas canceladas`;
  return kpi('Faturamento total', paired(grossBrl, grossUsd), note);
}

function competenceKpis(sales, movements) {
  const summary = Domain.summarizeCompetence(sales, movements);
  return [
    kpi('Faturamento bruto', paired(summary.grossBrl, summary.grossUsd)),
    kpi('Reembolsos', paired(summary.refundBrl, summary.refundUsd)),
    kpi('Faturamento líquido', paired(summary.netBrl, summary.netUsd)),
    kpi('Recebido com data', paired(summary.receiptBrl, summary.receiptUsd)),
    kpi('Pendente', paired(summary.pendingBrl, summary.pendingUsd), `${summary.pendingCount} venda(s) pendentes ou parciais`),
    kpi('Vendas', String(summary.salesCount), `${summary.paidWithoutDateCount} pagas sem data de recebimento`),
    kpi('Média por conversão', `${money(summary.averageBrl, 'BRL')}${summary.missingBrlCount ? ' *' : ''} · ${money(summary.averageUsd, 'USD')}${summary.missingUsdCount ? ' *' : ''}`),
  ].join('');
}

function cashKpis(movements) {
  const summary = Domain.summarizeCash(movements);
  return [
    kpi('Recebimentos', paired(summary.receiptsBrl, summary.receiptsUsd)),
    kpi('Reembolsos', paired(summary.refundsBrl, summary.refundsUsd)),
    kpi('Caixa líquido', paired(summary.netBrl, summary.netUsd)),
    kpi('Movimentos', String(summary.movementCount), `${summary.receiptCount} recebimento(s) · ${summary.refundCount} reembolso(s)`),
  ].join('') + `<div class="billing-cash-note">Pagamentos sem data efetiva não entram neste período de caixa.</div>`;
}

function kpi(label, value, note = '') {
  return `<article class="card billing-kpi"><span>${esc(label)}</span><strong>${value}</strong>${note ? `<small>${esc(note)}</small>` : ''}</article>`;
}

function paired(brl, usd) {
  return `<span class="billing-pair"><span>${money(brl.amount, 'BRL', brl.complete)}</span><span>${money(usd.amount, 'USD', usd.complete)}</span></span>`;
}

function renderAggregate(root) {
  const context = root.__billing;
  const dimension = root.querySelector('#billingDimension').value;
  const aggregates = context.mode === 'competence'
    ? Domain.aggregateBy(context.sales, context.movements, dimension)
    : Domain.aggregateCashBy(context.movements, context.salesMap, dimension);
  const isCompetence = context.mode === 'competence';
  root.querySelector('#billingAggregateHead').innerHTML = `<tr><th>${Domain.BILLING_DIMENSIONS[dimension]}</th>${isCompetence ? '<th class="num">Vendas</th><th class="num">Bruto R$</th><th class="num">Bruto US$</th><th class="num">Líquido R$</th><th class="num">Líquido US$</th>' : '<th class="num">Movimentos</th><th class="num">Recebimentos R$</th><th class="num">Recebimentos US$</th><th class="num">Reembolsos R$</th><th class="num">Reembolsos US$</th><th class="num">Caixa líquido R$</th><th class="num">Caixa líquido US$</th>'}</tr>`;
  root.querySelector('#billingAggregateBody').innerHTML = aggregates.length ? aggregates.map(item => isCompetence
    ? `<tr><td>${esc(item.key)}</td><td class="num">${item.sales}</td><td class="num">${money(item.grossBrl.amount, 'BRL', item.grossBrl.complete)}</td><td class="num">${money(item.grossUsd.amount, 'USD', item.grossUsd.complete)}</td><td class="num">${money(item.netBrl.amount, 'BRL', item.netBrl.complete)}</td><td class="num">${money(item.netUsd.amount, 'USD', item.netUsd.complete)}</td></tr>`
    : `<tr><td>${esc(item.key)}</td><td class="num">${item.movements}</td><td class="num">${money(item.receiptsBrl.amount, 'BRL', item.receiptsBrl.complete)}</td><td class="num">${money(item.receiptsUsd.amount, 'USD', item.receiptsUsd.complete)}</td><td class="num">${money(item.refundsBrl.amount, 'BRL', item.refundsBrl.complete)}</td><td class="num">${money(item.refundsUsd.amount, 'USD', item.refundsUsd.complete)}</td><td class="num">${money(item.netBrl.amount, 'BRL', item.netBrl.complete)}</td><td class="num">${money(item.netUsd.amount, 'USD', item.netUsd.complete)}</td></tr>`
  ).join('') : `<tr><td colspan="8" class="billing-empty">Sem dados nesse período e dimensão.</td></tr>`;
}

async function renderMonthlyChart(root) {
  const context = root.__billing;
  const cash = context.mode === 'cash';
  const title = cash ? 'Caixa líquido mensal (R$)' : 'Faturamento mensal (R$)';
  const requestId = ++chartRenderSequence;
  root.querySelector('#billingMonthlyChartTitle').textContent = title;
  const endMonth = context.range.end.slice(0, 7);
  const chartStart = new Date(`${endMonth}-01T00:00:00Z`);
  chartStart.setUTCMonth(chartStart.getUTCMonth() - 11);
  const chartRange = { start: chartStart.toISOString().slice(0, 10), end: context.range.end };
  root.querySelector('#billingMonthlyChartCaption').textContent = cash
    ? `Caixa líquido dos últimos 12 meses até ${displayDate(chartRange.end)} · filtros atuais.`
    : `Faturamento bruto por competência nos últimos 12 meses até ${displayDate(chartRange.end)} · filtros atuais.`;
  let series;
  try {
    const filters = getFilters(root);
    if (cash) {
      const rawMovements = await Storage.queryMovementsByDate(chartRange.start, chartRange.end);
      const chartSales = await Storage.salesByIds([...new Set(rawMovements.map(move => move.sale_id))]);
      const salesById = new Map(chartSales.map(sale => [sale.sale_id, sale]));
      const rows = rawMovements.map(movement => ({ ...movement, sale: salesById.get(movement.sale_id) || null }));
      const visibleRows = Domain.filterRows(rows, filters).filter(row => filters.recordState === 'all' || (filters.recordState === 'cancelled' ? row.sale?.active === false : row.sale?.active !== false));
      const visibleMovements = visibleRows;
      const visibleSalesById = new Map(visibleRows.map(row => row.sale).filter(Boolean).map(sale => [sale.sale_id, sale]));
      series = Domain.monthlyFinancialSeries({ movements: visibleMovements, salesById: visibleSalesById, ...chartRange, mode: 'cash' });
    } else {
      const rawSales = await Storage.querySalesByDate(chartRange.start, chartRange.end);
      const visibleSales = Domain.filterRows(rawSales.map(sale => ({ sale })), filters)
        .map(row => row.sale)
        .filter(sale => filters.recordState === 'all' || (filters.recordState === 'cancelled' ? sale.active === false : sale.active !== false));
      series = Domain.monthlyFinancialSeries({ sales: visibleSales, movements: [], ...chartRange, mode: 'competence' });
    }
  } catch {
    if (requestId !== chartRenderSequence) return;
    root.querySelector('#billingMonthlyChart').innerHTML = '<p class="billing-chart-empty">Não foi possível carregar a série mensal agora.</p>';
    return;
  }
  if (requestId !== chartRenderSequence) return;
  while (series.length > 1 && series[0].records === 0) series.shift();
  const chartHost = root.querySelector('#billingMonthlyChart');
  chartHost.innerHTML = buildMonthlyChartSvg(series, title, chartHost.clientWidth);
}

function buildMonthlyChartSvg(series, title, availableWidth = 720) {
  if (!series.length) return '<p class="billing-chart-empty">Não há dados para o período selecionado.</p>';
  const width = Math.max(360, availableWidth || 720, series.length * 82);
  const height = 310;
  const left = 62, right = 18, top = 44, bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = series.map(item => item.value).filter(value => typeof value === 'number' && Number.isFinite(value));
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (min === max) max = min === 0 ? 1 : min + Math.abs(min) * .1;
  const y = value => top + (max - value) / (max - min) * plotHeight;
  const zeroY = y(0);
  const slot = plotWidth / series.length;
  const barWidth = Math.min(56, Math.max(8, slot * .62));
  const axis = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  const amount = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const month = key => new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`)).replace('.', '');
  const ticks = Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4);
  const grid = ticks.map(value => {
    const tickY = y(value);
    return `<g class="billing-chart-grid"><line x1="${left}" y1="${tickY.toFixed(2)}" x2="${width - right}" y2="${tickY.toFixed(2)}"></line><text x="${left - 9}" y="${(tickY + 4).toFixed(2)}" text-anchor="end">${esc(axis.format(value))}</text></g>`;
  }).join('');
  const bars = series.map((item, index) => {
    const center = left + slot * (index + .5);
    const label = month(item.key);
    const valueLabel = item.value == null ? '—' : `${amount.format(item.value)}${item.complete ? '' : '*'}`;
    const totalTooltip = item.value == null
      ? `${label}: valor em R$ indisponível${item.records ? ` (${item.records} registros)` : ''}`
      : `${label}: R$ ${amount.format(item.value)}${item.complete ? '' : ' (parcial; valor ausente em pelo menos um registro)'}`;
    const manualTooltip = item.manualBrl?.records
      ? item.manualBrl.amount == null
        ? `${item.manualBrl.records} lançamento(s) manual(is) incluído(s); valor manual ausente em ${item.manualBrl.missing} registro(s)`
        : `${item.manualBrl.records} lançamento(s) manual(is) incluído(s): R$ ${amount.format(item.manualBrl.amount)}${item.manualBrl.missing ? ` (valor ausente em ${item.manualBrl.missing} registro(s))` : ''}`
      : '';
    const tooltip = [totalTooltip, manualTooltip].filter(Boolean).join(' · ');
    let rect = '';
    if (item.value != null) {
      const valueY = y(item.value);
      const barY = Math.min(valueY, zeroY);
      const barHeight = Math.max(2, Math.abs(zeroY - valueY));
      rect = `<rect class="billing-chart-bar" x="${(center - barWidth / 2).toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="2"><title>${esc(tooltip)}</title></rect>`;
    }
    const labelY = item.value == null ? zeroY - 8 : item.value < 0 ? y(item.value) + 15 : y(item.value) - 8;
    return `<g class="billing-chart-column">${rect}<text class="billing-chart-value" x="${center.toFixed(2)}" y="${Math.max(14, Math.min(height - 30, labelY)).toFixed(2)}" text-anchor="middle"><title>${esc(tooltip)}</title>${esc(valueLabel)}</text><text class="billing-chart-month" x="${center.toFixed(2)}" y="${height - 23}" text-anchor="middle">${esc(label)}</text></g>`;
  }).join('');
  return `<svg class="billing-month-chart-svg" role="img" aria-label="${esc(title)}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><title>${esc(title)}</title>${grid}<line class="billing-chart-zero" x1="${left}" y1="${zeroY.toFixed(2)}" x2="${width - right}" y2="${zeroY.toFixed(2)}"></line>${bars}</svg>`;
}

function renderTable(root) {
  const context = root.__billing;
  if (!context) return;
  const mode = context.mode;
  let rows = [...context.rows];
  const sortKey = root.dataset.sort || (mode === 'competence' ? 'sale_date' : 'effective_date');
  const direction = root.dataset.direction || 'desc';
  rows.sort((a, b) => Domain.compareRows(a, b, sortKey === 'effective_date' ? 'date' : sortKey, direction));
  const size = Number(root.querySelector('#billingPageSize').value || 50);
  const page = Domain.paginate(rows, Number(root.dataset.page || 1), size);
  root.dataset.page = String(page.page);
  root.querySelector('#billingCount').textContent = `${page.total} ${page.total === 1 ? 'registro' : 'registros'}`;
  root.querySelector('#billingPageSummary').textContent = page.total ? `Página ${page.page} de ${page.pages} · ${page.total} registros` : 'Nenhum registro';
  root.querySelector('#billingPreviousPage').disabled = page.page <= 1;
  root.querySelector('#billingNextPage').disabled = page.page >= page.pages;
  const columns = mode === 'competence'
    ? [['sale_date','Data da venda'],['product','Produto'],['platform','Plataforma'],['commission_type','Tipo'],['conversion_count','Conversões'],['account','Conta'],['confirmation_status','Confirmação'],['value_usd','Valor US$'],['value_brl','Valor R$'],['payment_status','Status'],['payment_date','Data do pagamento'],['refund','Reembolso'],['notes','Observação'],['actions','Ação']]
    : [['effective_date','Data efetiva'],['product','Produto'],['platform','Plataforma'],['type','Movimento'],['account','Conta'],['value_usd','Valor US$'],['value_brl','Valor R$'],['payment_status','Status da venda'],['source','Origem'],['notes','Observação'],['actions','Ação']];
  root.querySelector('#billingSalesHead').innerHTML = `<tr>${columns.map(([key, label]) => `<th>${key === 'actions' ? esc(label) : `<button class="billing-sort ${sortKey === key ? 'active' : ''}" data-billing-sort="${key}" type="button">${esc(label)}${sortKey === key ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}</button>`}</th>`).join('')}</tr>`;
  root.querySelector('#billingSalesBody').innerHTML = page.rows.length ? page.rows.map((row, index) => mode === 'competence' ? saleRow(row.sale || row, row.movements || [], index) : movementRow(row, index)).join('') : `<tr><td colspan="${columns.length}" class="billing-empty">Nenhum registro encontrado para os filtros selecionados.</td></tr>`;
}

function saleRow(sale, movements, index) {
  const receipts = movements.filter(move => move.type === 'receipt');
  const refunds = movements.filter(move => move.type === 'refund');
  const paymentDates = [...new Set(receipts.map(move => move.effective_date).filter(Boolean))].sort();
  const refundBrl = Domain.sumCurrency(refunds, 'value_brl'), refundUsd = Domain.sumCurrency(refunds, 'value_usd');
  const isMccAggregate = sale.source === 'mcc_conversion_aggregate';
  const sourceLinked = sale.source === 'hub_manual_capture' && sale.source_ref;
  const canEdit = !isMccAggregate && (sale.active !== false || !sourceLinked);
  const actions = `<div class="billing-action-buttons">${canEdit ? `<button class="btn" data-billing-action="edit" data-sale-id="${esc(sale.sale_id)}">Editar</button>` : ''}${sale.active === false ? '' : `<button class="btn" data-billing-action="receipt" data-sale-id="${esc(sale.sale_id)}">Recebimento</button><button class="btn" data-billing-action="refund" data-sale-id="${esc(sale.sale_id)}">Reembolso</button>`}<button class="btn" data-billing-action="audit" data-sale-id="${esc(sale.sale_id)}">Histórico</button>${isMccAggregate || sale.active === false ? '' : `<button class="btn billing-danger" data-billing-action="cancel" data-sale-id="${esc(sale.sale_id)}">Cancelar</button>`}</div>`;
  const confirmation = sale.confirmation_status === 'confirmed'
    ? `<span class="billing-confirmation billing-confirmation-confirmed" title="Confirmada pela importação ${esc(sale.confirmation_source || 'MCC D−1')}">Confirmada · ${esc(sale.confirmation_source || 'MCC D−1')}</span>`
    : sale.confirmation_status === 'manual'
      ? '<span class="billing-confirmation billing-confirmation-manual">Lançamento manual</span>'
      : sale.confirmation_status === 'provisional'
        ? '<span class="billing-confirmation billing-confirmation-provisional">Provisória · MCC D0</span>'
        : sale.confirmation_status === 'not_confirmed'
          ? `<span class="billing-confirmation billing-confirmation-unconfirmed">Não confirmada · ${esc(sale.confirmation_source || 'MCC D−1')}</span>`
          : sale.confirmation_status === 'represented_by_manual'
            ? '<span class="billing-confirmation billing-confirmation-covered">Coberta por lançamento manual</span>'
      : '—';
  const count = new Intl.NumberFormat('pt-BR', { maximumFractionDigits:2 }).format(Number(sale.conversion_count ?? 1));
  return `<tr class="${sale.active === false ? 'billing-cancelled' : ''}" data-billing-row="${esc(sale.sale_id)}"><td>${displayDate(sale.sale_date)}</td><td class="billing-product-cell" title="${esc(sale.product)}"><span>${esc(sale.product)}</span></td><td>${esc(sale.platform)}</td><td>${esc(sale.commission_type)}</td><td class="num">${count}</td><td>${esc(sale.account)}</td><td>${confirmation}</td><td class="num">${money(sale.value_usd, 'USD')}</td><td class="num">${money(sale.value_brl, 'BRL')}</td><td><span class="billing-status billing-status-${esc(sale.payment_status)}">${esc(Domain.BILLING_STATUSES[sale.payment_status] || Domain.BILLING_STATUSES.unknown)}</span></td><td>${paymentDates.map(displayDate).join(', ') || '—'}</td><td>${refunds.length ? `${money(refundBrl.amount, 'BRL', refundBrl.complete)} · ${money(refundUsd.amount, 'USD', refundUsd.complete)}` : '—'}</td><td title="${esc(sale.notes)}">${esc(sale.notes || '—')}</td><td class="billing-actions-cell">${actions}<div class="billing-audit hidden" id="billingAudit-${esc(sale.sale_id)}"></div></td></tr>`;
}

function movementRow(movement) {
  const sale = movement.sale || {};
  const product=sale.product||'Venda indisponível';
  return `<tr data-billing-row="${esc(movement.movement_id)}"><td>${displayDate(movement.effective_date)}</td><td class="billing-product-cell" title="${esc(product)}"><span>${esc(product)}</span></td><td>${esc(sale.platform)}</td><td><span class="billing-status billing-status-${movement.type === 'refund' ? 'pending' : 'paid'}">${movement.type === 'refund' ? 'Reembolso' : 'Recebimento'}</span></td><td>${esc(sale.account)}</td><td class="num">${money(movement.value_usd, 'USD')}</td><td class="num">${money(movement.value_brl, 'BRL')}</td><td>${esc(Domain.BILLING_STATUSES[sale.payment_status] || Domain.BILLING_STATUSES.unknown)}</td><td>${esc(movement.source)}</td><td>${esc(movement.notes || sale.notes || '—')}</td><td class="billing-actions-cell"><button class="btn" data-billing-action="audit" data-sale-id="${esc(sale.sale_id)}">Histórico</button><div class="billing-audit hidden" id="billingAudit-${esc(sale.sale_id)}"></div></td></tr>`;
}

async function handleAction(button, root, toast) {
  const { billingAction: action, saleId } = button.dataset;
  try {
    const sale = (await Storage.salesByIds([saleId]))[0];
    if (!sale) throw new Error('A venda não foi encontrada.');
    if (action === 'edit') { openSaleModal(root, sale); return; }
    if (action === 'receipt' || action === 'refund') { openMovementModal(root, sale, action === 'refund' ? 'refund' : 'receipt'); return; }
    if (action === 'audit') { await toggleAudit(root, saleId, button); return; }
    if (action === 'cancel') {
      if (!confirm(`Cancelar o registro de ${sale.product}? A venda e seus movimentos serão preservados.`)) return;
      const reason = prompt('Informe o motivo do cancelamento:');
      if (reason == null) return;
      await Storage.cancelSale(saleId, reason);
      invalidateMonthNavigation(root);
      toast('Venda cancelada sem apagar o histórico.');
      await refresh(root);
    }
  } catch (error) { toast(error.message, true); }
}

async function toggleAudit(root, saleId, button) {
  const panel = root.querySelector(`#billingAudit-${CSS.escape(saleId)}`);
  if (!panel) return;
  if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
  const records = await Storage.listAudit(saleId);
  panel.innerHTML = records.length ? records.map(record => `<div><b>${esc(record.action)}</b> · ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(record.created_at))}${record.changes?.length ? `<ul>${record.changes.map(change => `<li>${esc(change.field)}: ${esc(JSON.stringify(change.old_value))} → ${esc(JSON.stringify(change.new_value))}</li>`).join('')}</ul>` : ''}</div>`).join('') : '<span>Sem eventos de auditoria.</span>';
  panel.classList.remove('hidden');
  button.setAttribute('aria-expanded', 'true');
}

function openSaleModal(root, sale = null) {
  const modal = root.querySelector('#billingModal'), form = root.querySelector('#billingForm');
  form.reset();
  form.dataset.sourceSaleRef = '';
  for (const field of form.querySelectorAll('input, textarea, select')) field.disabled = false;
  const sourceLinked = sale?.source === 'hub_manual_capture' && sale.source_ref;
  root.querySelector('#billingSourceCorrectionNotice').classList.toggle('hidden', !sourceLinked);
  for (const id of ['billingSourceCampaignField','billingSourceCountryField','billingSourceTimeField']) root.querySelector(`#${id}`).classList.toggle('hidden', !sourceLinked);
  if (sourceLinked) {
    form.dataset.sourceSaleRef = sale.source_ref;
    const options = root.__getManualSaleEditData?.() || {};
    const campaigns = Array.isArray(options.campaigns) ? options.campaigns : [];
    const countries = Array.isArray(options.countries) ? options.countries : [];
    form.__manualSaleCampaigns = campaigns;
    form.elements.source_campaign_id.innerHTML = campaigns.map(item => `<option value="${esc(item.id)}">${esc(item.nome_exibicao || item.nome_mcc || item.id)}${item.conta_id || item.conta_sufixo ? ` · conta ${esc(item.conta_id || item.conta_sufixo)}` : ''}</option>`).join('');
    form.elements.source_country_code.innerHTML = countries.map(item => `<option value="${esc(item.code)}">${esc(item.name)} · ${esc(item.code)}</option>`).join('');
    for (const field of form.querySelectorAll('input, textarea, select')) {
      if (!['sale_id','sale_date','product','platform','value_brl','source_campaign_id','source_country_code','source_sale_time'].includes(field.name)) field.disabled = true;
    }
    form.elements.value_brl.required = true;
    form.elements.source_campaign_id.required = true;
    form.elements.source_country_code.required = true;
    form.elements.account.readOnly = true;
  } else {
    form.elements.value_brl.required = false;
    form.elements.source_campaign_id.required = false;
    form.elements.source_country_code.required = false;
    form.elements.account.readOnly = false;
  }
  form.elements.sale_id.value = sale?.sale_id || '';
  form.elements.sale_date.value = displayDate(sale?.sale_date || today());
  for (const field of ['product', 'platform', 'commission_type', 'account', 'notes']) form.elements[field].value = sale?.[field] || '';
  if (sourceLinked) {
    form.elements.source_campaign_id.value = sale.campaign_id || '';
    form.elements.source_country_code.value = sale.country_code || 'ZZ';
    form.elements.source_sale_time.value = sale.sale_time || '';
    const campaign = form.__manualSaleCampaigns?.find(item => item.id === form.elements.source_campaign_id.value);
    if (campaign) form.elements.account.value = campaign.conta_id || campaign.conta_sufixo || '';
  } else {
    form.elements.source_campaign_id.value = '';
    form.elements.source_country_code.value = '';
    form.elements.source_sale_time.value = '';
  }
  form.elements.value_brl.value = sale?.value_brl ?? '';
  form.elements.value_usd.value = sale?.value_usd ?? '';
  form.elements.payment_status.value = sale?.payment_status || 'unknown';
  form.elements.payment_date.value = '';
  root.querySelector('#billingModalTitle').textContent = sale ? `${sourceLinked ? 'Editar lançamento provisório' : 'Editar venda'} · ${sale.product}` : 'Nova venda';
  form.querySelector('[type="submit"]').textContent = sourceLinked ? 'Salvar lançamento' : 'Salvar venda';
  modal.classList.remove('hidden');
  form.elements.sale_date.focus();
}

function closeSaleModal(root) { root.querySelector('#billingModal').classList.add('hidden'); }

function openMovementModal(root, sale, type) {
  const modal = root.querySelector('#billingMovementModal'), form = root.querySelector('#billingMovementForm');
  form.reset();
  form.elements.sale_id.value = sale.sale_id;
  form.elements.type.value = type;
  form.elements.effective_date.value = displayDate(today());
  form.elements.value_brl.value = sale.value_brl ?? '';
  form.elements.value_usd.value = sale.value_usd ?? '';
  root.querySelector('#billingMovementTitle').textContent = `${type === 'refund' ? 'Registrar reembolso' : 'Registrar recebimento'} · ${sale.product}`;
  modal.classList.remove('hidden');
  form.elements.effective_date.focus();
}

function closeMovementModal(root) { root.querySelector('#billingMovementModal').classList.add('hidden'); }

async function saveSaleForm(event, root, toast) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const sourceSaleRef = form.dataset.sourceSaleRef;
    if (sourceSaleRef) {
      const saleDate = Domain.parseBrazilianDate(form.elements.sale_date.value);
      if (!saleDate) throw new Error('A data da venda deve estar no formato dia/mês/ano.');
      const valueBrl = parseAmount(form.elements.value_brl.value);
      if (valueBrl == null || valueBrl <= 0) throw new Error('Informe um valor em reais maior que zero.');
      if (typeof root.__updateManualSale !== 'function') throw new Error('A atualização do lançamento original não está disponível nesta tela.');
      await root.__updateManualSale({ sourceSaleId:sourceSaleRef, data:saleDate, hora:form.elements.source_sale_time.value, campanha_id:form.elements.source_campaign_id.value, pais_codigo:form.elements.source_country_code.value, produto:form.elements.product.value, plataforma:form.elements.platform.value, valor_brl:valueBrl });
      closeSaleModal(root);
      invalidateMonthNavigation(root);
      toast('Lançamento atualizado na base e no Faturamento; os cálculos vinculados foram sincronizados. Recebimentos e reembolsos foram preservados.');
      await refresh(root);
      return;
    }
    const saleDate = Domain.parseBrazilianDate(form.elements.sale_date.value);
    if (!saleDate) throw new Error('A data da venda deve estar no formato dia/mês/ano.');
    const paymentDateText = form.elements.payment_date.value.trim();
    const paymentDate = paymentDateText ? Domain.parseBrazilianDate(paymentDateText) : null;
    if (paymentDateText && !paymentDate) throw new Error('A data de pagamento deve estar no formato dia/mês/ano.');
    const input = {
      sale_date: saleDate,
      product: form.elements.product.value,
      platform: form.elements.platform.value,
      commission_type: form.elements.commission_type.value,
      account: form.elements.account.value,
      value_brl: parseAmount(form.elements.value_brl.value),
      value_usd: parseAmount(form.elements.value_usd.value),
      payment_status: form.elements.payment_status.value,
      notes: form.elements.notes.value,
    };
    if (input.value_brl == null && input.value_usd == null) throw new Error('Informe a comissão em pelo menos uma moeda.');
    const existingId = form.elements.sale_id.value;
    let sale;
    let action = 'sale_created';
    if (existingId) {
      const previous = (await Storage.salesByIds([existingId]))[0];
      action = previous?.payment_status !== input.payment_status ? 'payment_status_changed' : (previous?.value_brl !== input.value_brl || previous?.value_usd !== input.value_usd) ? 'financial_value_corrected' : 'sale_updated';
      sale = await Storage.updateSale(existingId, input, action);
    } else sale = await Storage.createSale({ ...input, source:'manual', confirmation_status:'manual' });
    if (sale.payment_status === 'paid' && paymentDate) {
      const knownMovements = await Storage.movementsForSales([sale.sale_id]);
      const duplicate = knownMovements.some(move => move.type === 'receipt' && move.effective_date === paymentDate && move.value_brl === sale.value_brl && move.value_usd === sale.value_usd);
      if (!duplicate) await Storage.createMovement({ sale_id: sale.sale_id, type: 'receipt', effective_date: paymentDate, value_brl: sale.value_brl, value_usd: sale.value_usd, source: 'manual', notes: 'Data de pagamento informada no cadastro da venda.' });
    }
    closeSaleModal(root);
    invalidateMonthNavigation(root);
    toast(existingId ? 'Venda atualizada.' : 'Venda adicionada.');
    await refresh(root);
  } catch (error) { toast(error.message, true); }
}

async function saveMovementForm(event, root, toast) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const dateText = form.elements.effective_date.value.trim();
    const effectiveDate = dateText ? Domain.parseBrazilianDate(dateText) : null;
    if (dateText && !effectiveDate) throw new Error('A data efetiva deve estar no formato dia/mês/ano.');
    await Storage.createMovement({
      sale_id: form.elements.sale_id.value,
      type: form.elements.type.value,
      effective_date: effectiveDate,
      value_brl: parseAmount(form.elements.value_brl.value),
      value_usd: parseAmount(form.elements.value_usd.value),
      source: 'manual',
      notes: form.elements.notes.value,
    });
    closeMovementModal(root);
    invalidateMonthNavigation(root);
    toast('Movimento financeiro registrado.');
    await refresh(root);
  } catch (error) { toast(error.message, true); }
}

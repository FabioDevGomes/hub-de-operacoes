import {createAccountState, buildAccountReport, accountDomainUrl} from './accounts-domain.mjs?v=1';

// UI only. The Hub supplies read-only campaign projections and shared formatters.
export const accountReportTemplate = `<div class="account-summary-row"><div class="account-filters">
          <div class="account-filter"><label for="accountReportAccount">Conta</label><select id="accountReportAccount" class="search hub-table-filter"><option value="all">Todas</option></select></div>
          <div class="account-filter"><label for="accountReportProduct">Produto</label><select id="accountReportProduct" class="search hub-table-filter"><option value="all">Todos</option></select></div>
        </div>
        <div id="accountReportKpis" class="account-kpis"></div></div>
        <div class="account-report-grid">
          <div class="card panel"><div class="panel-head"><div><h2>Matriz de produtos por conta</h2><p>Número de campanhas por produto em cada conta.</p></div><div class="panel-controls account-report-controls"><div class="account-report-status-filter"><label for="accountReportStatus">Situação</label><select id="accountReportStatus" class="search hub-table-filter" aria-label="Filtrar matriz e cobertura por situação"><option value="all">Todas</option><option value="ativa" selected>Ativas</option><option value="pausada">Pausadas</option></select></div><span id="accountReportPeriod" class="tag"></span></div></div><div class="account-matrix-wrap"><table class="account-matrix"><thead id="accountMatrixHead"></thead><tbody id="accountMatrixBody"></tbody></table></div></div>
          <aside class="account-side"><div class="card account-chart"><h3>Produtos por número de contas</h3><div id="accountProductBars"></div></div><div class="card account-chart"><h3>Quantidade de produtos por faixa de CPA</h3><div id="accountCpaRangeBars"></div><div id="accountDistribution" class="hidden" aria-hidden="true"></div></div></aside>
        </div>
        <div class="card panel account-detail"><div class="panel-head"><div><h2>Campanhas do produto</h2><p id="accountDetailCaption">Selecione um produto na matriz.</p></div><div class="panel-controls account-detail-controls"><select class="hub-table-filter" id="accountDetailStatusFilter" aria-label="Filtrar campanhas do produto por situação"><option value="pausada">Pausadas</option><option value="ativa" selected>Ativas</option><option value="all">Todas</option></select><span id="accountDetailCount" class="tag"></span></div></div><div class="table-wrap"><table class="account-product-campaign-table"><thead><tr><th style="padding:11px 13px">Conta</th><th style="padding:11px 13px">Domínio</th><th style="padding:11px 13px">Campanha</th><th style="padding:11px 13px" title="Data identificada no prefixo do nome da campanha">Data de subida</th><th class="num" data-account-zero-days title="Dias consecutivos com zero impressões, até a data D0, respeitando lacunas no histórico.">Dias sem impressão</th><th style="padding:11px 13px">Situação</th><th class="num" style="padding:11px 13px">Investimento</th><th class="num" style="padding:11px 13px">Impressões</th><th class="num" style="padding:11px 13px">Cliques</th><th class="num" style="padding:11px 13px">Conversões</th><th class="num" style="padding:11px 13px">ROI</th></tr></thead><tbody id="accountDetailBody"></tbody></table></div></div>
        <div class="card panel account-cpa-gaps"><div class="panel-head"><div><h2>Cobertura por faixa de CPA</h2><p>Respeita os filtros de Situação e Conta; Produto limita apenas as linhas exibidas.</p></div><div class="panel-controls account-report-controls"><div class="account-report-status-filter"><label for="accountCpaCoverageStatus">Situação</label><select id="accountCpaCoverageStatus" class="search hub-table-filter" aria-label="Filtrar matriz e cobertura por situação"><option value="all">Todas</option><option value="ativa" selected>Ativas</option><option value="pausada">Pausadas</option></select></div><span id="accountCpaGapCount" class="tag"></span></div></div><div class="account-cpa-gap-wrap"><table class="account-cpa-gap-table"><thead id="accountCpaGapHead"></thead><tbody id="accountCpaGapBody"></tbody></table></div></div>`;

export const detailSortKeys = [
  'account','domain','campaign','campaignDate','zeroDays','status',
  'investment','impressions','clicks','conversions','roi'
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function mount({root, getSnapshot, format}) {
  const state = createAccountState();
  const by = id => root.querySelector('#' + id);
  root.innerHTML = accountReportTemplate;

  function selectOptions(id, values, current, allLabel) {
    const select = by(id);
    select.innerHTML = `<option value="all">${allLabel}</option>` +
      values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    select.value = current;
  }

  function renderKpis(kpis) {
    const items = [
      ['Produtos únicos',kpis.products,'no recorte atual'],
      ['Campanhas',kpis.campaigns,`${kpis.active} ativas · ${kpis.paused} pausadas`],
      ['Contas identificadas',kpis.accounts,'com campanhas'],
      ['Em múltiplas contas',kpis.multiAccount,'produtos'],
      ['Sem conta',kpis.missing,kpis.missing?'revisar identificação':'todas identificadas']
    ];
    by('accountReportKpis').innerHTML = items.map(([label,value,foot],index) =>
      `<div class="card account-kpi"><span>${label}</span><strong class="${index===4&&value?'negative':''}">${format.num(value)}</strong><small>${foot}</small></div>`
    ).join('');
  }

  function renderMatrix(report) {
    const {accounts,products,selected} = report;
    by('accountMatrixHead').innerHTML = '<tr><th>Produto</th>' +
      accounts.map(account => `<th>${esc(account==='Sem conta'?account:`Conta ${account}`)}</th>`).join('') +
      '<th>Total</th><th>Ativas</th><th>Pausadas</th></tr>';
    by('accountMatrixBody').innerHTML = products.length ? products.map(group => {
      const active = group.rows.filter(row => row.status === 'ativa').length;
      const paused = group.rows.length - active;
      const cells = accounts.map(account => {
        const matches = group.rows.filter(row => row.account === account);
        const cellActive = matches.filter(row => row.status === 'ativa').length;
        const cellPaused = matches.length - cellActive;
        return `<td class="account-cell ${matches.length?'has-campaigns':''} ${cellPaused?'has-paused':''}" title="${esc(matches.map(row=>row.campaign).join(' · '))}">${matches.length?`<strong>${matches.length}</strong><small>${cellActive}A / ${cellPaused}P</small>`:'—'}</td>`;
      }).join('');
      return `<tr class="account-product-row ${group.key===selected?'selected':''}" data-product="${esc(group.key)}"><td class="name">${esc(group.name)}</td>${cells}<td class="num"><strong>${group.rows.length}</strong></td><td class="num positive">${active}</td><td class="num ${paused?'negative':''}">${paused}</td></tr>`;
    }).join('') : `<tr><td colspan="${accounts.length+4}" class="empty">Nenhuma campanha encontrada para os filtros selecionados.</td></tr>`;
  }

  function renderBars(id, bars) {
    const max = Math.max(1, ...bars.map(item => item.count));
    by(id).innerHTML = bars.length ? bars.map(item =>
      `<div class="account-bar-row"><span title="${esc(item.label)}">${esc(item.label)}</span><div class="account-bar-track"><div class="account-bar-fill" style="width:${item.count/max*100}%"></div></div><strong>${item.count}</strong></div>`
    ).join('') : '<div class="muted">Sem dados.</div>';
  }

  function domainCell(domain) {
    const url = accountDomainUrl(domain);
    return url ? `<a class="account-domain-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Abrir no hPanel Hostinger">${esc(domain.trim())}</a>` : esc(domain || '—');
  }

  function zeroDaysCell(row) {
    const days = row.zeroDays;
    const title = row.status === 'pausada' ? 'Campanha pausada; sequência não calculada.' :
      days == null ? 'Sem histórico diário suficiente.' :
      days === 0 ? 'A campanha teve impressões no dia mais recente.' :
      `${days} dia${days===1?'':'s'} consecutivo${days===1?'':'s'} sem impressões.`;
    return `<td class="num ${days>0?'negative':'muted'}" title="${esc(title)}">${days==null?'—':String(days)}</td>`;
  }

  function renderDetail(report) {
    const {selectedProduct,detail} = report;
    by('accountDetailCaption').textContent = selectedProduct ?
      `${selectedProduct.product}: conta e métricas de cada campanha.` : 'Selecione um produto na matriz.';
    by('accountDetailCount').textContent = selectedProduct ? `${detail.length} campanha${detail.length===1?'':'s'}` : '';
    const emptyMessage = !selectedProduct ? 'Selecione um produto na matriz.' :
      state.status === 'ativa' ? 'Nenhuma campanha ativa para este produto.' :
      state.status === 'pausada' ? 'Nenhuma campanha pausada para este produto.' : 'Nenhuma campanha para este produto.';
    by('accountDetailBody').innerHTML = detail.length ? detail.map(row =>
      `<tr><td>${esc(row.account)}</td><td>${domainCell(row.domain)}</td><td class="name" title="${esc(row.campaign)}">${esc(row.identity.name)}</td><td class="num" data-campaign-date title="Data identificada no prefixo do nome da campanha">${esc(row.identity.dateLabel)}</td>${zeroDaysCell(row)}<td><strong class="status-text ${row.status==='ativa'?'active':'paused'}">${row.status==='ativa'?'Ativa':'Pausada'}</strong></td><td class="num">${format.money(row.totals?.investment??null)}</td><td class="num">${format.num(row.totals?.impressions??null)}</td><td class="num">${format.num(row.totals?.clicks??null)}</td><td class="num">${format.num(row.totals?.conversions??null)}</td><td class="num">${row.roi==null?'—':format.pct(row.roi)}</td></tr>`
    ).join('') : `<tr><td colspan="11" class="empty">${emptyMessage}</td></tr>`;
    renderSortHeaders();
  }

  function renderSortHeaders() {
    const header = by('accountDetailBody').closest('table').querySelector('thead tr');
    for (const [index, th] of [...header.cells].entries()) {
      const key = detailSortKeys[index];
      const label = th.querySelector('.account-detail-sort-label')?.textContent || th.textContent.trim();
      const active = state.sortKey === key, direction = state.sortDir === 'asc' ? ' crescente' : ' decrescente';
      th.setAttribute('aria-sort', active ? (state.sortDir==='asc'?'ascending':'descending') : 'none');
      th.innerHTML = `<button type="button" class="account-detail-sort" data-account-sort="${key}" aria-label="${esc(`Ordenar por ${label}${active?direction:''}`)}" aria-pressed="${active}"><span class="account-detail-sort-label">${esc(label)}</span><span class="account-detail-sort-arrow">${active?(state.sortDir==='asc'?'↑':'↓'):'↕'}</span></button>`;
    }
  }

  function commissionLabel(product) {
    const values = [...product.commissions].sort((a,b) => a-b);
    return values.length ? values.map(value => `US$ ${format.num(value,value%1?2:0)}`).join(' / ') : 'US$ —';
  }

  function coverageCell(product, range) {
    const counts = product.ranges.get(range);
    if (!counts) return '<td class="cpa-missing">Não testada</td>';
    const {active,paused} = counts;
    const title = `${active} ativa${active===1?'':'s'} · ${paused} pausada${paused===1?'':'s'} nesta faixa.`;
    if (active) return `<td class="cpa-explored" title="${title}">Em teste</td>`;
    return `<td class="cpa-paused" title="${title}">Testada</td>`;
  }

  function renderCoverage(report) {
    const {ranges,coverage,missingTotal} = report;
    by('accountCpaGapCount').textContent = ranges.length ? `${missingTotal} lacuna${missingTotal===1?'':'s'}` : 'Sem faixas';
    by('accountCpaGapHead').innerHTML = '<tr><th>Produto · comissão</th>' +
      ranges.map(range => `<th>${format.num(range,range%1?1:0)}%</th>`).join('') + '<th>Cobertura</th></tr>';
    if (!coverage.length) {
      by('accountCpaGapBody').innerHTML = `<tr><td colspan="${ranges.length+2}" class="empty">Nenhum produto encontrado para os filtros selecionados.</td></tr>`;
    } else if (!ranges.length) {
      by('accountCpaGapBody').innerHTML = '<tr><td colspan="2" class="empty">Nenhuma faixa de CPA foi identificada nos títulos das campanhas deste recorte.</td></tr>';
    } else {
      by('accountCpaGapBody').innerHTML = coverage.map(product =>
        `<tr><td class="name">${esc(product.name)} — ${esc(commissionLabel(product))}</td>${ranges.map(range=>coverageCell(product,range)).join('')}<td class="cpa-coverage">${ranges.length-product.missing.length} de ${ranges.length}</td></tr>`
      ).join('');
    }
  }

  function render() {
    const snapshot = getSnapshot(), report = buildAccountReport(snapshot.rows, state);
    state.account = report.account; state.product = report.product; state.selected = report.selected;
    selectOptions('accountReportAccount',report.accountOptions,state.account,'Todas');
    selectOptions('accountReportProduct',report.productOptions,state.product,'Todos');
    // All three selectors intentionally share ONE situation state.
    for (const id of ['accountReportStatus','accountCpaCoverageStatus','accountDetailStatusFilter']) by(id).value = state.status;
    by('accountReportPeriod').textContent = snapshot.period;
    renderKpis(report.kpis);
    renderMatrix(report);
    renderBars('accountProductBars',report.bars.map(item => ({label:item.name,count:new Set(item.rows.map(row=>row.account)).size})));
    renderBars('accountCpaRangeBars',report.cpaBars.map(item => ({
      label:item.range==null?'Sem faixa':`${format.num(item.range,item.range%1?1:0)}%`,count:item.count
    })));
    renderDetail(report);
    renderCoverage(report);
  }

  root.addEventListener('change', event => {
    const id = event.target.id;
    if (['accountReportStatus','accountCpaCoverageStatus','accountDetailStatusFilter'].includes(id)) state.status = event.target.value;
    else if (id === 'accountReportAccount') state.account = event.target.value;
    else if (id === 'accountReportProduct') state.product = event.target.value;
    else return;
    render();
  });
  root.addEventListener('click', event => {
    const sort = event.target.closest('[data-account-sort]');
    const product = event.target.closest('.account-product-row');
    if (sort) {
      const key = sort.dataset.accountSort;
      state.sortDir = state.sortKey === key && state.sortDir === 'asc' ? 'desc' : 'asc';
      state.sortKey = key;
    } else if (product) state.selected = product.dataset.product;
    else return;
    render();
  });

  return {render};
}

import {createAccountState, buildAccountReport, accountDomainUrl, accountMccFilterOptions, filterAccountRowsByMcc} from './accounts-domain.mjs?v=13';
import {attachAccountPresellUrls} from './accounts-presell-domain.mjs?v=3';
import {createAccountVisibilityStorage} from './accounts-visibility-storage.mjs?v=1';
import {createAccountDuplicationTargetStorage} from './accounts-target-storage.mjs?v=2';
import {readTrackingDomainList} from '../tracking/tracking-domain-list-storage.mjs?v=3';

// UI only. The Hub supplies read-only campaign projections and shared formatters.
export const accountReportTemplate = `<div class="account-summary-row"><div class="account-filters">
          <div class="account-filter"><label for="accountReportAccount">Conta</label><select id="accountReportAccount" class="search hub-table-filter"><option value="all">Todas</option></select></div>
          <div class="account-filter"><label for="accountReportMcc">MCC</label><select id="accountReportMcc" class="search hub-table-filter"><option value="all">Todas</option></select></div>
          <div class="account-filter"><label for="accountReportProduct">Produto</label><select id="accountReportProduct" class="search hub-table-filter"><option value="all">Todos</option></select></div>
        </div>
        <div id="accountReportKpis" class="account-kpis"></div></div>
        <div class="account-report-grid">
          <div class="card panel"><div class="panel-head"><div><h2>Matriz de produtos por conta</h2></div><div class="panel-controls account-report-controls"><div class="account-report-status-filter"><label for="accountReportStatus">Campanhas</label><select id="accountReportStatus" class="search hub-table-filter" aria-label="Filtrar campanhas por situação"><option value="all">Todas</option><option value="ativa" selected>Ativas</option><option value="pausada">Pausadas</option></select></div><div class="account-report-visibility-filter"><label for="accountReportVisibility">Produtos</label><select id="accountReportVisibility" class="search hub-table-filter" aria-label="Filtrar produtos visíveis ou ocultos"><option value="visible" selected>Visíveis</option><option value="hidden">Exibir ocultos</option><option value="all">Todos</option></select></div><span id="accountReportPeriod" class="tag"></span><label id="accountPausedAccountsControl" class="account-report-paused-toggle" title="Inclui na matriz contas com campanhas pausadas dos produtos que continuam ativos." hidden><input id="accountIncludePausedAccounts" type="checkbox"><span>Incluir contas com campanhas pausadas</span></label></div></div><p id="accountVisibilityFeedback" class="account-visibility-feedback" aria-live="polite"></p><div class="account-matrix-wrap"><table class="account-matrix"><thead id="accountMatrixHead"></thead><tbody id="accountMatrixBody"></tbody></table></div></div>
          <aside class="account-side"><div class="card account-chart"><h3>Histórico de contas por produto</h3><p id="accountProductBarsCaption" class="account-chart-caption"></p><div id="accountProductBars"></div></div><div class="card account-chart"><h3>Quantidade de produtos por faixa de CPA</h3><div id="accountCpaRangeBars"></div><div id="accountDistribution" class="hidden" aria-hidden="true"></div></div></aside>
        </div>
        <div class="card panel account-detail"><div class="panel-head"><div><h2>Campanhas do produto</h2><p id="accountDetailCaption">Selecione um produto na matriz.</p></div><div class="panel-controls account-detail-controls"><select class="hub-table-filter" id="accountDetailStatusFilter" aria-label="Filtrar campanhas do produto por situação"><option value="pausada">Pausadas</option><option value="ativa" selected>Ativas</option><option value="all">Todas</option></select><span id="accountDetailCount" class="tag"></span></div></div><div class="table-wrap"><table class="account-product-campaign-table"><thead><tr><th style="padding:11px 13px">Conta</th><th style="padding:11px 13px">Domínio</th><th style="padding:11px 13px">URL da pre-sell</th><th style="padding:11px 13px">Campanha</th><th style="padding:11px 13px" title="Data identificada no prefixo do nome da campanha">Data de subida</th><th class="num" data-account-zero-days title="Dias consecutivos com zero impressões, até a data D0, respeitando lacunas no histórico.">Dias sem impressão</th><th style="padding:11px 13px">Situação</th><th class="num" style="padding:11px 13px">Investimento</th><th class="num" style="padding:11px 13px">Impressões</th><th class="num" style="padding:11px 13px">Cliques</th><th class="num" style="padding:11px 13px">Conversões</th><th class="num" style="padding:11px 13px">ROI</th></tr></thead><tbody id="accountDetailBody"></tbody></table></div></div>
        <div class="card panel account-cpa-gaps"><div class="panel-head"><div><h2>Cobertura por faixa de CPA</h2><p>Respeita os filtros de Situação e Conta; Produto limita apenas as linhas exibidas.</p></div><div class="panel-controls account-report-controls"><div class="account-report-status-filter"><label for="accountCpaCoverageStatus">Situação</label><select id="accountCpaCoverageStatus" class="search hub-table-filter" aria-label="Filtrar matriz e cobertura por situação"><option value="all">Todas</option><option value="ativa" selected>Ativas</option><option value="pausada">Pausadas</option></select></div><span id="accountCpaGapCount" class="tag"></span></div></div><div class="account-cpa-gap-wrap"><table class="account-cpa-gap-table"><thead id="accountCpaGapHead"></thead><tbody id="accountCpaGapBody"></tbody></table></div></div>
<dialog id="accountMapTargetDialog" class="account-target-dialog" aria-labelledby="accountMapTargetTitle" aria-describedby="accountMapTargetDescription"><header class="account-target-dialog-head"><div><span class="account-target-dialog-kicker">DUPLICAÇÃO</span><h2 id="accountMapTargetTitle">Definir alvo para duplicação</h2><p id="accountMapTargetDescription">Marque o produto e a conta da atividade que você está preparando.</p></div></header><div class="account-target-dialog-body"><p id="accountMapTargetIdentity" class="account-target-dialog-identity"></p><label for="accountMapTargetNote">Observação (opcional)</label><textarea id="accountMapTargetNote" maxlength="500" rows="3" placeholder="Ex.: campanha que vou duplicar"></textarea><p id="accountMapTargetError" class="account-target-dialog-error" role="alert" aria-live="polite"></p><div class="account-target-dialog-actions"><button type="button" class="btn" data-account-target-cancel>Cancelar</button><button type="button" class="btn primary" data-account-target-save>Definir alvo</button></div></div></dialog>`;

export const detailSortKeys = [
  'account','domain','presellUrl','campaign','campaignDate','zeroDays','status',
  'investment','impressions','clicks','conversions','roi'
];

const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const targetCellKey = (productKey,accountId) => JSON.stringify([String(productKey ?? ''),String(accountId ?? '')]);

export function mount({root, getSnapshot, format, getTrackingDomains = () => readTrackingDomainList().rows}) {
  const state = {...createAccountState(), visibility:'visible', mcc:'all'};
  let includePausedAccounts = true;
  const by = id => root.querySelector('#' + id);
  root.innerHTML = accountReportTemplate;
  let preferences;
  try { preferences = root.ownerDocument.defaultView.localStorage; } catch {}
  const visibilityStorage = createAccountVisibilityStorage(preferences);
  const targetStorage = createAccountDuplicationTargetStorage(preferences);
  let hiddenProductKeys = visibilityStorage.read();
  let activeTarget = targetStorage.read();
  let currentCampaignCounts = new Map();
  let selectedTarget = null;
  let targetTrigger = null;
  let visibilityFeedback = '';

  function selectOptions(id, values, current, allLabel) {
    const select = by(id);
    select.innerHTML = `<option value="all">${allLabel}</option>` +
      values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    select.value = current;
  }

  function selectMccOptions(options, current) {
    const select = by('accountReportMcc');
    select.innerHTML = '<option value="all">Todas</option>' +
      options.map(option => `<option value="${esc(option.value)}">${esc(option.label)}</option>`).join('');
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

  function productMatchesVisibility(key) {
    const hidden = hiddenProductKeys.has(String(key));
    return state.visibility === 'all' || (state.visibility === 'hidden' ? hidden : !hidden);
  }

  function renderMatrix(report, products = report.products, accountStatuses = {}) {
    const {accounts,selected,accountMccLabels,accountNames} = report;
    const historicalCounts = new Map(report.bars.map(item => [item.key,item.totalAccountsTested]));
    by('accountMatrixHead').innerHTML = '<tr><th>Produto</th><th class="account-matrix-first-record-column" title="Primeiro registro do produto no sistema, considerando todas as contas">1º registro</th>' +
      accounts.map(account => account==='Sem conta' ? `<th>${esc(account)}</th>` :
        `<th class="account-matrix-account-column"><span class="account-matrix-mcc">${esc(accountMccLabels.get(account)||'MCC não identificada')}</span><span class="account-matrix-account${accountStatuses[account]==='suspended'?' account-matrix-account--suspended':''}" aria-label="Conta ${esc(account)}${accountStatuses[account]==='suspended'?', suspensa':''}">${esc(account)}</span>${accountNames.get(account)?`<span class="account-matrix-name">${esc(accountNames.get(account))}</span>`:''}</th>`).join('') +
      '<th>Total</th><th>Ativas</th><th>Pausadas</th></tr>';
    by('accountMatrixBody').innerHTML = products.length ? products.map(group => {
      const active = group.rows.filter(row => row.status === 'ativa').length;
      const paused = group.rows.length - active;
      const belowHistoryTarget = (historicalCounts.get(group.key) ?? 0) < 3;
      const hidden = hiddenProductKeys.has(String(group.key));
      const cells = accounts.map(account => {
        const matches = group.rows.filter(row => row.account === account);
        const cellActive = matches.filter(row => row.status === 'ativa').length;
        const cellPaused = matches.length - cellActive;
        const campaignNames = matches.map(row=>row.campaign).join(' · ');
        const targeted = account !== 'Sem conta' && activeTarget?.productKey === group.key && activeTarget?.accountId === account;
        const cellContent = matches.length?`<strong>${matches.length}</strong><small>${cellActive}A / ${cellPaused}P</small>`:'—';
        if (account === 'Sem conta') return `<td class="account-cell ${matches.length?'has-campaigns':''} ${cellPaused && cellActive === 0?'has-paused':''}" title="${esc(campaignNames)}">${cellContent}</td>`;
        const targetLabel = targeted ? `Alvo definido: ${group.name} · conta ${account}. Clique para editar a observação ou definir outro alvo.` : `Definir alvo para duplicação: ${group.name} · conta ${account}.`;
        const title = targeted && activeTarget.note ? `${targetLabel} Observação: ${activeTarget.note}` : `${targetLabel}${campaignNames?` Campanhas: ${campaignNames}`:''}`;
        const campaignCount = currentCampaignCounts.get(targetCellKey(group.key,account)) || 0;
        return `<td class="account-cell ${matches.length?'has-campaigns':''} ${cellPaused && cellActive === 0?'has-paused':''} ${targeted?'account-cell--targeted':''}" title="${esc(title)}"><button type="button" class="account-target-button hub-discreet-action${targeted?' account-target-button--targeted':''}" data-account-target data-product-key="${esc(group.key)}" data-product-name="${esc(group.name)}" data-account-id="${esc(account)}" data-campaign-count="${campaignCount}" aria-pressed="${targeted}" aria-label="${esc(targetLabel)}" title="${esc(title)}">${cellContent}<span class="account-target-indicator" aria-hidden="true">${targeted?'✓':''}</span></button></td>`;
      }).join('');
      return `<tr class="account-product-row ${group.key===selected?'selected':''}" data-product="${esc(group.key)}" data-product-filter="${esc(group.name)}"><td class="name account-product-name-cell" title="${esc(group.name)}"><span class="account-product-name-text${belowHistoryTarget?' account-product-name--low-history':''}">${esc(group.name)}</span><button class="hub-corner-edit account-product-visibility${hidden?' restore':''}" data-toggle-account-product-visibility="${esc(group.key)}" data-product-name="${esc(group.name)}" data-hidden="${hidden}" type="button" aria-label="${hidden?'Reexibir':'Ocultar'} produto ${esc(group.name)}">${hidden?'Reexibir':'Ocultar'}</button></td><td class="num account-matrix-first-record" title="Primeiro registro do produto no sistema">${firstRecordDateLabel(group.firstRecordDate)}</td>${cells}<td class="num"><strong>${group.rows.length}</strong></td><td class="num positive">${active}</td><td class="num ${paused?'negative':''}">${paused}</td></tr>`;
    }).join('') : `<tr><td colspan="${accounts.length+5}" class="empty">${state.visibility==='hidden'?'Nenhum produto oculto corresponde aos filtros atuais.':state.visibility==='visible'?'Nenhum produto visível corresponde aos filtros atuais.':'Nenhum produto corresponde aos filtros selecionados.'}</td></tr>`;
  }

  function renderBars(id, bars, {accountMetrics = false} = {}) {
    const max = Math.max(1, ...bars.map(item => item.count));
    const header = accountMetrics ? '<div class="account-bar-header account-bar-row--with-secondary"><span></span><span></span><span>Em teste</span><span>Total histórico</span></div>' : '';
    by(id).innerHTML = bars.length ? header + bars.map(item => {
      const lowHistoricalCount = accountMetrics && item.count <= 2;
      const counts = accountMetrics ? `<strong class="account-bar-active-count${lowHistoricalCount?' account-bar-active-count--low':''}" title="Contas distintas com campanhas ativas">${item.activeAccountCount}</strong><strong${lowHistoricalCount?' class="account-bar-history-count--low"':''} title="Contas distintas testadas no histórico">${item.count}</strong>` : `<strong>${item.count}</strong>`;
      const fillClass = lowHistoricalCount ? ' account-bar-fill--low-history' : '';
      return `<div class="account-bar-row${accountMetrics?' account-bar-row--with-secondary':''}"><span${lowHistoricalCount?' class="account-product-name--low-history"':''} title="${esc(item.label)}">${esc(item.label)}</span><div class="account-bar-track"><div class="account-bar-fill${fillClass}" style="width:${item.count/max*100}%"></div></div>${counts}</div>`;
    }).join('') : '<div class="muted">Sem dados.</div>';
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

  function firstRecordDateLabel(value) {
    const match = String(value ?? '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return match ? `${match[2]}/${match[1]}` : '—';
  }

  function presellCell(row) {
    return row.presellUrls?.length ? row.presellUrls.map(url => {
      let host = url;
      try { host = new URL(url).hostname || url; } catch {}
      return `<a class="account-presell-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}"><code>${esc(host)}</code></a>`;
    }).join('') : '<span class="muted" title="Nenhum Track com produto e conta identificados sem ambiguidade.">—</span>';
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
      `<tr><td>${esc(row.account)}</td><td>${domainCell(row.domain)}</td><td>${presellCell(row)}</td><td class="name" title="${esc(row.campaign)}">${esc(row.identity.name)}</td><td class="num" data-campaign-date title="Data identificada no prefixo do nome da campanha">${esc(row.identity.dateLabel)}</td>${zeroDaysCell(row)}<td><strong class="status-text ${row.status==='ativa'?'active':'paused'}">${row.status==='ativa'?'Ativa':'Pausada'}</strong></td><td class="num">${format.money(row.totals?.investment??null)}</td><td class="num">${format.num(row.totals?.impressions??null)}</td><td class="num">${format.num(row.totals?.clicks??null)}</td><td class="num">${format.num(row.totals?.conversions??null)}</td><td class="num">${row.roi==null?'—':format.pct(row.roi)}</td></tr>`
    ).join('') : `<tr><td colspan="12" class="empty">${emptyMessage}</td></tr>`;
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

  function renderCoverage(report, coverage = report.coverage) {
    const {ranges} = report;
    const missingTotal = coverage.reduce((sum, product) => sum + product.missing.length, 0);
    by('accountCpaGapCount').textContent = ranges.length ? `${missingTotal} lacuna${missingTotal===1?'':'s'}` : 'Sem faixas';
    by('accountCpaGapHead').innerHTML = '<tr><th>Produto · comissão</th>' +
      ranges.map(range => `<th>${format.num(range,range%1?1:0)}%</th>`).join('') + '<th>Cobertura</th></tr>';
    if (!coverage.length) {
      const emptyMessage = state.visibility === 'hidden' ? 'Nenhum produto oculto corresponde aos filtros atuais.' :
        state.visibility === 'visible' ? 'Nenhum produto visível corresponde aos filtros atuais.' :
        'Nenhum produto encontrado para os filtros selecionados.';
      by('accountCpaGapBody').innerHTML = `<tr><td colspan="${ranges.length+2}" class="empty">${emptyMessage}</td></tr>`;
    } else if (!ranges.length) {
      by('accountCpaGapBody').innerHTML = '<tr><td colspan="2" class="empty">Nenhuma faixa de CPA foi identificada nos títulos das campanhas deste recorte.</td></tr>';
    } else {
      by('accountCpaGapBody').innerHTML = coverage.map(product =>
        `<tr><td class="name">${esc(product.name)} — ${esc(commissionLabel(product))}</td>${ranges.map(range=>coverageCell(product,range)).join('')}<td class="cpa-coverage">${ranges.length-product.missing.length} de ${ranges.length}</td></tr>`
      ).join('');
    }
  }

  function render() {
    const snapshot = getSnapshot();
    const allRows = attachAccountPresellUrls(snapshot.rows, getTrackingDomains());
    const campaignsByTarget = new Map();
    for (const row of allRows) {
      const productKey = String(row.productKey ?? '').trim();
      const accountId = String(row.account ?? '').trim();
      const campaign = String(row.campaign ?? '').trim();
      if (!productKey || !accountId || accountId === 'Sem conta' || !campaign) continue;
      const key = targetCellKey(productKey,accountId);
      if (!campaignsByTarget.has(key)) campaignsByTarget.set(key,new Set());
      campaignsByTarget.get(key).add(campaign);
    }
    currentCampaignCounts = new Map([...campaignsByTarget].map(([key,campaigns])=>[key,campaigns.size]));
    if (activeTarget) {
      const currentCount = currentCampaignCounts.get(targetCellKey(activeTarget.productKey,activeTarget.accountId)) || 0;
      if (!Number.isSafeInteger(activeTarget.campaignCountAtMark)) {
        activeTarget = {...activeTarget,campaignCountAtMark:currentCount};
        targetStorage.write(activeTarget);
      } else if (currentCount > activeTarget.campaignCountAtMark) {
        targetStorage.clear();
        activeTarget = null;
      }
    }
    const mccOptions = accountMccFilterOptions(allRows);
    if (state.mcc !== 'all' && !mccOptions.some(option => option.value === state.mcc)) state.mcc = 'all';
    selectMccOptions(mccOptions,state.mcc);
    const rows = filterAccountRowsByMcc(allRows,state.mcc);
    const visibleAccounts = new Set(rows.map(row => row.account).filter(account => account && account !== 'Sem conta'));
    const accountStatuses = state.mcc === 'all' ? snapshot.accountStatuses :
      Object.fromEntries(Object.entries(snapshot.accountStatuses || {}).filter(([account]) => visibleAccounts.has(account)));
    let report = buildAccountReport(rows, state, accountStatuses);
    let matrixProducts = report.products.filter(item => productMatchesVisibility(item.key));
    if (matrixProducts.length && !matrixProducts.some(item => item.key === report.selected)) {
      state.selected = matrixProducts[0].key;
      report = buildAccountReport(rows, state, accountStatuses);
      matrixProducts = report.products.filter(item => productMatchesVisibility(item.key));
    } else if (!matrixProducts.length) {
      state.selected = null;
      report = {...report, selected:null, selectedProduct:null, detail:[]};
    } else {
      state.selected = report.selected;
    }
    state.account = report.account; state.product = report.product;
    let matrixReport = report;
    let detailReport = report;
    if (state.status === 'ativa' && includePausedAccounts) {
      const activeProductKeys = new Set(report.products.map(item => item.key));
      const expandedReport = buildAccountReport(rows, {...state, status:'all'}, accountStatuses);
      const pausedAccounts = new Set(expandedReport.products
        .filter(item => activeProductKeys.has(item.key))
        .flatMap(item => item.rows.filter(row => row.status === 'pausada').map(row => row.account)));
      const visibleProductKeys = new Set(matrixProducts.map(item => item.key));
      matrixProducts = expandedReport.products.filter(item => visibleProductKeys.has(item.key));
      matrixReport = {
        ...report,
        accounts:expandedReport.accounts.filter(account => report.accounts.includes(account) || pausedAccounts.has(account))
      };
      if (report.selected && activeProductKeys.has(report.selected)) detailReport = expandedReport;
    }
    selectOptions('accountReportAccount',report.accountOptions,state.account,'Todas');
    by('accountReportMcc').value = state.mcc;
    selectOptions('accountReportProduct',report.productOptions,state.product,'Todos');
    // All three selectors intentionally share ONE situation state.
    for (const id of ['accountReportStatus','accountCpaCoverageStatus','accountDetailStatusFilter']) by(id).value = state.status;
    by('accountPausedAccountsControl').hidden = state.status !== 'ativa';
    by('accountIncludePausedAccounts').checked = includePausedAccounts;
    by('accountReportVisibility').value = state.visibility;
    by('accountVisibilityFeedback').textContent = visibilityFeedback;
    by('accountReportPeriod').textContent = snapshot.period;
    renderKpis(report.kpis);
    renderMatrix(matrixReport,matrixProducts,accountStatuses);
    by('accountProductBarsCaption').textContent = 'Em teste: contas identificadas com campanhas ativas. Total histórico: contas distintas testadas.';
    renderBars('accountProductBars',report.bars.filter(item => productMatchesVisibility(item.key)).map(item => ({label:item.name,count:item.totalAccountsTested,activeAccountCount:item.activeAccountCount})),{accountMetrics:true});
    renderBars('accountCpaRangeBars',report.cpaBars.map(item => ({
      label:item.range==null?'Sem faixa':`${format.num(item.range,item.range%1?1:0)}%`,count:item.count
    })));
    renderDetail(detailReport);
    renderCoverage(report,report.coverage.filter(item => productMatchesVisibility(item.key)));
  }

  const targetDialog = by('accountMapTargetDialog');
  function openTargetDialog(button) {
    selectedTarget = {
      productKey:String(button.dataset.productKey || ''),
      productName:String(button.dataset.productName || 'Produto'),
      accountId:String(button.dataset.accountId || ''),
      campaignCountAtMark:Number(button.dataset.campaignCount || 0)
    };
    if (!selectedTarget.productKey || !selectedTarget.accountId) return;
    targetTrigger = button;
    const existing = activeTarget?.productKey === selectedTarget.productKey && activeTarget?.accountId === selectedTarget.accountId ? activeTarget : null;
    if (Number.isSafeInteger(existing?.campaignCountAtMark)) selectedTarget.campaignCountAtMark = existing.campaignCountAtMark;
    by('accountMapTargetIdentity').textContent = `${selectedTarget.productName} · conta ${selectedTarget.accountId}`;
    by('accountMapTargetNote').value = existing?.note || '';
    by('accountMapTargetError').textContent = '';
    targetDialog.showModal();
    by('accountMapTargetNote').focus?.({preventScroll:true});
  }

  function closeTargetDialog({restoreFocus = true} = {}) {
    if (targetDialog.open) targetDialog.close();
    const trigger = targetTrigger;
    selectedTarget = null;
    targetTrigger = null;
    if (restoreFocus) trigger?.focus?.({preventScroll:true});
  }

  function saveTarget() {
    if (!selectedTarget) return;
    const target = {...selectedTarget,note:String(by('accountMapTargetNote').value || '').trim()};
    if (!targetStorage.write(target)) {
      by('accountMapTargetError').textContent = 'Não foi possível salvar o alvo neste navegador. Tente novamente.';
      return;
    }
    activeTarget = {productKey:target.productKey,accountId:target.accountId,note:target.note,campaignCountAtMark:target.campaignCountAtMark};
    state.selected = target.productKey;
    closeTargetDialog({restoreFocus:false});
    render();
    const trigger = [...(root.querySelectorAll?.('[data-account-target]') || [])]
      .find(button => button.dataset.productKey === target.productKey && button.dataset.accountId === target.accountId);
    trigger?.focus?.({preventScroll:true});
  }

  root.addEventListener('change', event => {
    const id = event.target.id;
    if (id === 'accountIncludePausedAccounts') includePausedAccounts = event.target.checked;
    else if (['accountReportStatus','accountCpaCoverageStatus','accountDetailStatusFilter'].includes(id)) state.status = event.target.value;
    else if (id === 'accountReportVisibility') state.visibility = event.target.value;
    else if (id === 'accountReportAccount') state.account = event.target.value;
    else if (id === 'accountReportMcc') state.mcc = event.target.value;
    else if (id === 'accountReportProduct') state.product = event.target.value;
    else return;
    render();
  });
  let lastProductClick=null;
  root.addEventListener('click', event => {
    const targetButton = event.target.closest('[data-account-target]');
    if (targetButton) { event.preventDefault(); event.stopPropagation(); lastProductClick=null; openTargetDialog(targetButton); return; }
    if (event.target.closest('[data-account-target-cancel]')) { closeTargetDialog(); return; }
    if (event.target.closest('[data-account-target-save]')) { saveTarget(); return; }
    if (event.target === targetDialog) { closeTargetDialog(); return; }
    const visibility = event.target.closest('[data-toggle-account-product-visibility]');
    if (visibility) {
      event.preventDefault();
      event.stopPropagation();
      const key = String(visibility.dataset.toggleAccountProductVisibility || '');
      const hidden = visibility.dataset.hidden !== 'true';
      if (!key) return;
      const nextHiddenProductKeys = new Set(hiddenProductKeys);
      if (hidden) nextHiddenProductKeys.add(key); else nextHiddenProductKeys.delete(key);
      const persisted = visibilityStorage.write(nextHiddenProductKeys);
      hiddenProductKeys = nextHiddenProductKeys;
      const name = visibility.dataset.productName || 'Produto';
      visibilityFeedback = hidden
        ? `${name} ocultado${persisted?'':' nesta sessão'}. Use “Exibir ocultos” para reexibir.`
        : `${name} reexibido${persisted?'':' nesta sessão'}.`;
      lastProductClick = null;
      render();
      return;
    }
    const sort = event.target.closest('[data-account-sort]');
    const product = event.target.closest('.account-product-row');
    if (sort) {
      lastProductClick=null;
      const key = sort.dataset.accountSort;
      state.sortDir = state.sortKey === key && state.sortDir === 'asc' ? 'desc' : 'asc';
      state.sortKey = key;
    } else if (product) {
      const key=product.dataset.product,now=Date.now();
      const doubleClick=lastProductClick?.key===key&&now-lastProductClick.at<=500;
      lastProductClick=doubleClick?null:{key,at:now};
      state.selected=key;
      if(doubleClick)state.product=product.dataset.productFilter;
    } else {lastProductClick=null;return;}
    render();
  });

  targetDialog.addEventListener('cancel', event => { event.preventDefault(); closeTargetDialog(); });

  return {render,activate(){Object.assign(state,createAccountState(),{visibility:'visible',mcc:'all'});includePausedAccounts=true;visibilityFeedback='';render()}};
}

import * as Domain from './hot-offers-ms-domain.mjs';
import * as Trends from '../trends-domain.mjs';
import * as TrendsUI from '../trends-ui.mjs';
import * as Images from '../image-search-domain.mjs';
import * as ImagesUI from '../image-search-ui.mjs';
import * as Decisions from '../decision-ui.mjs';
import * as AutomaticSignal from '../automatic-signal-domain.mjs';
import * as AutomaticSignalUI from '../automatic-signal-ui.mjs';
import * as Glimpse from '../glimpse-domain.mjs';
import * as KeywordCandidatesUI from '../keyword-candidates-ui.mjs?v=20261004-saved-candidate-remove';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const COLUMNS = Object.freeze([
  ['id','ID'],['product','Produto'],['trends','Google Trends'],['glimpse','Glimpse'],['images','Imagens'],['category','Categoria'],['affiliation','Afiliação'],['countries','Países'],['payment','Pagamento'],['created','Criado'],['signal','Sinal automático'],['movement','Movimento'],['decision','Decisão'],['lastSeen','Última coleta'],['actions','Ações'],
]);
const COLUMN_KEY = 'hot-offers-ms-columns-v1';
const VISIBILITY_KEY = 'hot-offers-ms-hidden-v1';
const PLATFORM_OFFER_URL = 'https://admin.mediascalers.com/offers/';

export function mediaScalersOfferUrl(offerId) {
  const id = String(offerId ?? '');
  return /^\d+$/.test(id) ? PLATFORM_OFFER_URL + id : null;
}

function storedSet(key, allowed = null) {
  try {
    const values = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(values) ? values.filter(value => !allowed || allowed.has(value)) : []);
  } catch { return new Set(); }
}

export function mountHotOffersMsView({root, actions}) {
  let state = {offers:[], collections:[], snapshots:[], decisions:[], trends:[], images:[], glimpse:[]};
  let hiddenColumns = storedSet(COLUMN_KEY, new Set(COLUMNS.map(([key]) => key)));
  let hiddenOffers = storedSet(VISIBILITY_KEY);
  let sortKey = 'sourceOrder', sortDirection = 'asc', activeOfferKey = null, activeTab = 'overview';
  let pendingProductAge = '';
  const imageCandidateDrafts = new Map(), imageCandidateEditing = new Set();
  const sheet = $('#offerSheet'), importDialog = $('#importDialog'), collectionsDialog = $('#collectionsDialog');

  function recordMap(records) { return new Map(records.map(item => [item.offerKey, item])); }
  function decisionFor(key) { return recordMap(state.decisions).get(key) || {offerKey:key,currentStatus:Decisions.DEFAULT_DECISION,history:[]}; }
  function trendsFor(key) { return recordMap(state.trends).get(key) || {offerKey:key,assessments:[],keywordCandidates:[]}; }
  function imagesFor(key) { return recordMap(state.images).get(key) || {offerKey:key,assessments:[]}; }
  function glimpseFor(item) { return [...state.glimpse].filter(value => value.productKey === item.productKey).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null; }
  function dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date);
  }
  function sourceDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).split('-');
    return year && month && day ? day + '/' + month + '/' + year : '—';
  }
  function money(payment) {
    if (payment?.amount == null) return payment?.raw || '—';
    return (payment.symbol || '') + new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(payment.amount);
  }
  function countryText(item) {
    const codes = item.countriesVisible || [];
    return (codes.length ? codes.join(', ') : '—') + (item.additionalCountryCount ? ' +' + item.additionalCountryCount : '');
  }
  function trendBadge(item) {
    const latest = Trends.latestAssessment(trendsFor(item.offerKey).assessments);
    const label = Trends.resultLabel(latest?.status);
    const context = [...new Set([...(latest?.countries || []), latest?.country].filter(Boolean))].slice(0,5);
    const text = context.length ? label + ' · ' + context.join(', ') : label;
    return '<button type="button" class="table-action ' + (latest ? 'saved' : '') + '" data-curation-focus="trends" data-action="trends" data-key="' + escape(item.offerKey) + '" title="Abrir Google Trends">' + escape(text) + '</button>';
  }
  function imageBadge(item) {
    const record = imagesFor(item.offerKey), progress = Images.progress(record.assessments, Domain.offerCountryCodes(item));
    const latest = [...progress.latest.values()].sort((a,b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')))[0];
    const text = progress.total ? progress.done + ' de ' + progress.total : Images.resultLabel(latest?.status);
    const hasCandidates = [...progress.latest.values()].some(assessment => (assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []).some(value => String(value ?? '').trim()));
    const marker = KeywordCandidatesUI.keywordCandidateMarkerHtml(hasCandidates ? 1 : 0,'negative');
    return '<button type="button" class="table-action ' + (progress.done ? 'saved' : '') + '" data-curation-focus="images" data-action="images" data-key="' + escape(item.offerKey) + '" title="Abrir Google Imagens">' + escape(text) + marker + '</button>';
  }
  function glimpseBadge(item) {
    const analysis = glimpseFor(item);
    return '<button type="button" class="table-action ' + (analysis ? 'saved' : '') + '" data-curation-focus="glimpse" data-action="glimpse" data-key="' + escape(item.offerKey) + '" title="' + escape(analysis ? 'Última análise ' + dateTime(analysis.capturedAt) : 'Abrir Glimpse') + '">' + escape(Glimpse.compactSummary(analysis)) + '</button>';
  }
  function signalBadge(item) {
    const signal = AutomaticSignal.computeAutomaticSignal({trends:{latestAssessment:Trends.latestAssessment(trendsFor(item.offerKey).assessments)},images:imagesFor(item.offerKey),glimpse:glimpseFor(item)});
    return AutomaticSignalUI.badgeHtml(signal);
  }
  function movement(item) {
    const value = item.latestMovement || 'same';
    return '<span class="pill ' + escape(value) + '">' + escape(Domain.movementLabel(value,item.positionDelta)) + '</span>';
  }
  function affiliation(item) { return '<span class="pill ' + escape(item.affiliationStatus || 'unknown') + '">' + escape(Domain.affiliationLabel(item.affiliationStatus)) + '</span>'; }
  function currentFilters() {
    const value = id => $('#' + id)?.value || '';
    return {query:value('search'),id:value('idFilter'),scope:value('scopeFilter'),category:value('categoryFilter'),affiliation:value('affiliationFilter'),paymentMin:value('paymentMin'),decision:value('decisionFilter'),movement:value('movementFilter'),presence:value('presenceFilter'),visibility:value('visibilityFilter')};
  }
  function trendsRank(item) { const status = Trends.latestAssessment(trendsFor(item.offerKey).assessments)?.status; return {up:7,stable:6,down:5,low_volume:4,point_peak:3,inconclusive:2,no_data:1}[status] || 0; }
  function imagesRank(item) { const progress = Images.progress(imagesFor(item.offerKey).assessments,Domain.offerCountryCodes(item)); const latest = [...progress.latest.values()].sort((a,b)=>String(b.capturedAt||'').localeCompare(String(a.capturedAt||'')))[0]; return progress.done * 10 + Images.resultRank(latest?.status); }
  function glimpseRank(item) { return Glimpse.analysisRank(glimpseFor(item)); }
  function signalRank(item) { return AutomaticSignal.signalSortValue(AutomaticSignal.computeAutomaticSignal({trends:{latestAssessment:Trends.latestAssessment(trendsFor(item.offerKey).assessments)},images:imagesFor(item.offerKey),glimpse:glimpseFor(item)})); }
  function renderFilterOptions(select, values, label, current) {
    const options = values.filter(Boolean).sort((a,b) => String(a).localeCompare(String(b),'pt-BR'));
    select.innerHTML = '<option value="">' + escape(label) + '</option>' + options.map(value => '<option value="' + escape(value) + '">' + escape(value) + '</option>').join('');
    if (options.includes(current)) select.value = current;
  }
  function renderHeaders() {
    const visible = COLUMNS.filter(([key]) => !hiddenColumns.has(key));
    $('#headerRow').innerHTML = visible.map(([key,label]) => '<th data-col="' + key + '">' + (key === 'actions' ? escape(label) : '<button type="button" class="sort-btn" data-sort="' + key + '">' + escape(label) + '<span class="sort-arrow">' + (sortKey === key ? (sortDirection === 'asc' ? '↑' : '↓') : '') + '</span></button>') + '</th>').join('');
    $('#columnMenu').innerHTML = COLUMNS.map(([key,label]) => '<label><input type="checkbox" data-column="' + key + '" ' + (hiddenColumns.has(key) ? '' : 'checked') + '> ' + escape(label) + '</label>').join('');
  }
  function visibleOffers() {
    const filters = currentFilters();
    const scoped = state.offers.filter(item => !filters.scope || item.scope === filters.scope);
    const decisions = recordMap(state.decisions);
    return Domain.sortOffers(Domain.filterOffers(scoped,{...filters,visibility:'all'},decisions).filter(item => filters.visibility === 'all' || (filters.visibility === 'hidden') === hiddenOffers.has(item.offerKey)),sortKey,sortDirection,{decisions,trendsRank,imagesRank,glimpseRank,signalRank});
  }
  function cell(key,item) {
    if (key === 'id') return '<td>' + escape(item.offerId) + '</td>';
    if (key === 'product') return '<td><span class="product-name">' + escape(item.productName) + '</span></td>';
    if (key === 'category') return '<td>' + escape(item.category || '—') + '</td>';
    if (key === 'affiliation') return '<td>' + affiliation(item) + '</td>';
    if (key === 'countries') return '<td title="' + escape(item.countriesRaw || '') + '">' + escape(countryText(item)) + '</td>';
    if (key === 'payment') return '<td>' + escape(money(item.payment)) + '</td>';
    if (key === 'created') return '<td>' + escape(sourceDate(item.createdAt)) + '</td>';
    if (key === 'trends') return '<td>' + trendBadge(item) + '</td>';
    if (key === 'images') return '<td>' + imageBadge(item) + '</td>';
    if (key === 'glimpse') return '<td>' + glimpseBadge(item) + '</td>';
    if (key === 'signal') return '<td>' + signalBadge(item) + '</td>';
    if (key === 'movement') return '<td>' + movement(item) + '</td>';
    if (key === 'decision') return '<td>' + Decisions.buttonHtml(decisionFor(item.offerKey).currentStatus,'data-decision-key',escape(item.offerKey)) + '</td>';
    if (key === 'lastSeen') return '<td>' + escape(dateTime(item.lastSeenAt)) + '</td>';
    if (key === 'actions') return '<td><button type="button" class="table-action" data-action="detail" data-key="' + escape(item.offerKey) + '">Abrir</button><button type="button" class="table-action" data-action="hide" data-key="' + escape(item.offerKey) + '">' + (hiddenOffers.has(item.offerKey) ? 'Exibir' : 'Ocultar') + '</button></td>';
    return '<td>—</td>';
  }
  function renderSummary() {
    const offers = visibleOffers(), present = offers.filter(item => item.presentInLatestCollection !== false).length;
    const bottom = state.offers.filter(item => item.scope === 'bottom').length, top = state.offers.filter(item => item.scope === 'top').length;
    const latest = [...state.collections].sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0];
    $('#summary').innerHTML = [
      ['Ofertas no filtro',offers.length],['Presentes na última coleta',present],['Fundo quente',bottom],['Topo quente',top],['Coletas',state.collections.length],['Atualizado',latest ? dateTime(latest.capturedAt) : '—'],
    ].map(([label,value]) => '<span class="chip">' + escape(label) + ' <b>' + escape(value) + '</b></span>').join('');
  }
  function render() {
    renderFilterOptions($('#categoryFilter'),state.offers.map(item => item.category),'Todas as categorias',$('#categoryFilter').value);
    renderHeaders();
    const items = visibleOffers(), visibleColumns = COLUMNS.filter(([key]) => !hiddenColumns.has(key));
    $('#rows').innerHTML = items.map(item => '<tr data-offer="' + escape(item.offerKey) + '" class="' + Decisions.rowClass(decisionFor(item.offerKey).currentStatus) + '">' + visibleColumns.map(([key]) => cell(key,item)).join('') + '</tr>').join('');
    $('#empty').classList.toggle('hidden',items.length > 0);
    if (!items.length) $('#empty').textContent = state.offers.length ? 'Nenhuma oferta corresponde aos filtros.' : 'Cole a primeira coleta completa para começar.';
    renderSummary();
  }
  function offerByKey(key) { return state.offers.find(item => item.offerKey === key) || null; }
  function openSheet(item, tab = 'overview') {
    if (!item) return;
    activeOfferKey = item.offerKey;
    $('#sheetTitle').textContent = item.productName + (item.hot ? ' · HOT' : '');
    $('#sheetMeta').textContent = 'Offer ID ' + item.offerId + ' · ' + (item.scope === 'top' ? 'Topo quente' : 'Fundo quente') + ' · ' + Domain.affiliationLabel(item.affiliationStatus);
    renderOffer(item);
    switchTab(tab);
    sheet.classList.remove('hidden');
    window.scrollTo(0,0);
  }
  function renderOffer(item) {
    const decision = decisionFor(item.offerKey), trends = trendsFor(item.offerKey), images = imagesFor(item.offerKey);
    const latestTrend = Trends.latestAssessment(trends.assessments), imageProgress = Images.progress(images.assessments,Domain.offerCountryCodes(item));
    const analysis = glimpseFor(item), snapshots = state.snapshots.filter(snapshot => snapshot.offerKey === item.offerKey).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    $('#offerMetrics').innerHTML = [
      ['Afiliação',Domain.affiliationLabel(item.affiliationStatus)],['Pagamento',money(item.payment)],['Criado',sourceDate(item.createdAt)],['Países visíveis',countryText(item)],['Trends',Trends.resultLabel(latestTrend?.status)],['Imagens',imageProgress.done + '/' + imageProgress.total],['Glimpse',Glimpse.compactSummary(analysis)],['Movimento',Domain.movementLabel(item.latestMovement,item.positionDelta)],
    ].map(([label,value]) => '<div><small>' + escape(label) + '</small><b>' + escape(value) + '</b></div>').join('');
    $('#decisionStatus').value = Decisions.normalizeDecision(decision.currentStatus);
    $('#decisionNotes').value = decision.notes || '';
    $('#decisionHistory').innerHTML = (decision.history || []).slice().reverse().map(entry => '<div class="history-row"><span>' + escape(dateTime(entry.capturedAt)) + '</span><b>' + escape(entry.status) + '</b><span>' + escape(entry.notes || '—') + '</span></div>').join('') || '<p class="sub">Sem decisões registradas.</p>';
    const details = [
      ['Título original',item.rawOfferTitle],['Nome identificado',item.productName],['Categoria',item.category],['Pagamento (texto original)',item.payment?.raw],['Moeda',item.payment?.currency || 'Não identificada pela fonte'],['Países copiados',item.countriesRaw],['Afiliação (texto original)',item.affiliationRaw],['Contagem de países adicionais',item.additionalCountryCount || 0],['CTC (moeda não confirmada)',item.ctc?.raw],['Criado (texto original)',item.createdRaw],['Anotações do título',(item.annotations || []).join(' · ')],['Ações de pré-visualização',(item.previewActions || []).join(' · ')],['Formato da coleta',item.sourceFormat],
    ];
    $('#offerDetails').innerHTML = '<div class="detail-grid">' + details.map(([label,value]) => '<div><small>' + escape(label) + '</small>' + escape(value ?? '—') + '</div>').join('') + '</div>';
    renderTrends(item,trends);
    renderImages(item,images);
    $('#offerHistory').innerHTML = snapshots.map(snapshot => {
      const collection = state.collections.find(value => value.collectionId === snapshot.collectionId);
      const changes = collection?.movements?.find(value => value.offerKey === item.offerKey)?.changes || [];
      return '<div class="history-row"><span>' + escape(dateTime(snapshot.capturedAt)) + '</span><b>Posição ' + escape(snapshot.sourceOrder) + ' · ' + escape(Domain.movementLabel(collection?.movements?.find(value => value.offerKey === item.offerKey)?.movement,collection?.movements?.find(value => value.offerKey === item.offerKey)?.positionDelta)) + '</b><span>' + escape(money(snapshot.payment)) + ' · ' + escape(snapshot.category || '—') + ' · ' + escape(changes.map(change => change.field + ': ' + JSON.stringify(change.oldValue) + ' → ' + JSON.stringify(change.newValue)).join(' · ') || 'Sem alterações de campos') + '</span></div>';
    }).join('') || '<p class="sub">Sem histórico de coletas para esta oferta.</p>';
    $('#glimpseFrame').dataset.productKey = item.productKey;
  }
  function prepareTrendEditors(item) {
    const candidateInput = $('#trendCandidate'), candidateEntry = candidateInput?.parentElement, candidates = $('#trendCandidates');
    if (candidateEntry && candidates && !$('#trendKeywordEditor')) {
      const editor = document.createElement('div'), heading = document.createElement('div');
      editor.id = 'trendKeywordEditor'; editor.className = 'trends-keyword-editor';
      heading.className = 'trends-keyword-heading'; heading.textContent = 'Candidatas à palavra-chave';
      candidateEntry.classList.remove('candidate-entry'); candidateEntry.classList.add('trends-keyword-entry');
      candidateInput.placeholder = 'Digite uma ideia e pressione Enter';
      candidateInput.setAttribute('aria-label','Candidata à palavra-chave');
      candidates.classList.add('trends-keyword-list');
      candidateEntry.before(editor); editor.append(heading,candidateEntry,candidates);
    }
    if (candidateInput && candidateInput.dataset.offerKey !== item.offerKey) {
      candidateInput.value = '';
      candidateInput.dataset.offerKey = item.offerKey;
    }

    const countryChips = $('#trendCountries');
    let countryEditor = $('#manualCountryEditor');
    if (!countryEditor && countryChips) {
      countryEditor = document.createElement('div'); countryEditor.id = 'manualCountryEditor'; countryEditor.className = 'manual-country-entry';
      const label = document.createElement('label'), input = document.createElement('input'), button = document.createElement('button');
      label.htmlFor = 'manualCountry'; label.append('Adicionar país pelo código (ex.: BR)');
      input.id = 'manualCountry'; input.className = 'control'; input.type = 'text'; input.maxLength = 2;
      input.autocapitalize = 'characters'; input.autocomplete = 'off'; input.spellcheck = false;
      button.id = 'addManualCountry'; button.className = 'btn primary'; button.type = 'button'; button.textContent = 'Adicionar país';
      label.append(input); countryEditor.append(label,button);
      const message = document.createElement('div'); message.id = 'manualCountryMessage';
      message.className = 'manual-country-message trends-country-empty'; message.setAttribute('role','status'); message.setAttribute('aria-live','polite');
      countryChips.after(countryEditor,message);
      const addCountry = async () => {
        const code = input.value.trim().toUpperCase();
        if (await actions.addManualCountry(activeOfferKey,code)) {
          input.value = '';
          message.textContent = code + ' foi adicionado e ficará separado da captura original.';
        }
      };
      button.onclick = addCountry;
      input.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); addCountry(); } };
    }
    const countryInput = $('#manualCountry');
    if (countryInput && countryInput.dataset.offerKey !== item.offerKey) {
      countryInput.value = '';
      countryInput.dataset.offerKey = item.offerKey;
      $('#manualCountryMessage').textContent = '';
    }

    const resultCard = $('.trends-result-card',sheet), resultTitle = $('h2',resultCard);
    if (resultCard && resultTitle && !$('.trends-result-head',resultCard)) {
      const head = document.createElement('div'), copy = document.createElement('div'), note = document.createElement('p');
      head.className = 'trends-result-head'; note.textContent = 'Selecione um resultado para salvar a avaliação.';
      resultTitle.before(head); copy.append(resultTitle,note); head.append(copy);
    }
    $('#trendMessage')?.classList.add('trends-result-message');
  }

  function renderMediaScalersOfferLink(item) {
    const ageRow = $('.trends-product-age',$('.trends-country-card',sheet));
    if (!ageRow) return;
    let group = ageRow.nextElementSibling;
    if (!group?.classList.contains('trends-offer-links-group')) {
      group = document.createElement('div');
      group.className = 'trends-offer-links-group hidden';
      ageRow.after(group);
    }
    const offerId = String(item.offerId ?? '').trim(), url = mediaScalersOfferUrl(offerId);
    group.classList.toggle('hidden',!url);
    group.innerHTML = url
      ? `<span>Oferta específica na MediaScalers</span><div class="trends-offer-links"><a class="btn trends-offer-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Abrir oferta ${escape(offerId)} na MediaScalers">Abrir oferta #${escape(offerId)}</a></div>`
      : '';
  }

  function renderTrends(item, record) {
    prepareTrendEditors(item);
    const codes = Domain.offerCountryCodes(item), selected = new Set((record.assessments?.at(-1)?.countries || []).slice(0,5));
    renderMediaScalersOfferLink(item);
    $('h2',$('.trends-country-card',sheet)).textContent = 'Países explícitos da oferta';
    $('#trendCountries').innerHTML = codes.length ? codes.map(code => '<button type="button" class="trends-country-action ' + (selected.has(code) ? 'selected' : '') + '" data-country="' + escape(code) + '" aria-pressed="' + selected.has(code) + '">' + escape(code) + (item.manualCountries?.includes(code) ? ' · manual' : '') + '</button>').join('') : '<span class="sub">Nenhum país identificado; adicione um país manualmente abaixo.</span>';
    pendingProductAge = record.assessments?.at(-1)?.productAge || '';
    TrendsUI.renderProductAgeButtons($('#productAgeActions'),pendingProductAge,value=>{
      pendingProductAge=value;
      $$('[data-trends-product-age]',$('#productAgeActions')).forEach(button=>{button.classList.toggle('selected',button.dataset.trendsProductAge===value);button.setAttribute('aria-pressed',String(button.dataset.trendsProductAge===value))});
    });
    TrendsUI.renderResultButtons($('#trendResults'),record.assessments?.at(-1)?.status || '',value=>actions.saveTrend(item.offerKey,value,{term:$('#trendsTerm').value.trim() || item.productName,countries:$$('[data-country].selected',$('#trendCountries')).map(button=>button.dataset.country),productAge:pendingProductAge}));
    $('#trendsTerm').value = record.assessments?.at(-1)?.searchTerm || item.productName;
    KeywordCandidatesUI.renderKeywordCandidates($('#trendCandidates'),{candidates:record.keywordCandidates||[],variant:'positive',searchContext:'Google Trends',onSearch:term=>actions.openTrends(term),onRemove:(_candidate,index)=>actions.removeTrendCandidate(item.offerKey,index)});
    $('#trendsHistory').innerHTML = (record.assessments || []).slice().reverse().map(entry => '<div class="history-row"><span>' + escape(dateTime(entry.capturedAt)) + '</span><b>' + escape(Trends.resultLabel(entry.status)) + '</b><span>' + escape([entry.searchTerm,(entry.countries || []).join(', '),entry.productAge || ''].filter(Boolean).join(' · ')) + '</span></div>').join('') || '<p class="sub">Sem avaliações de Trends.</p>';
  }
  function renderImages(item, record) {
    const countries = Domain.offerCountryCodes(item), latest = Images.latestByCountry(record.assessments || []);
    $('#imagesTerm').value = record.searchTerm || item.productName;
    $('#imageCountries').innerHTML = countries.map(country => {
      const assessment = latest.get(country), editing = imageCandidateEditing.has(country), candidates = editing ? (imageCandidateDrafts.get(country) || []) : (assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []);
      const savedCandidateCount = new Set((assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []).map(value => String(value || '').trim()).filter(Boolean)).size;
      const statusLabel = savedCandidateCount ? Images.resultLabel(assessment?.status) + ' · ' + savedCandidateCount + ' candidata' + (savedCandidateCount === 1 ? '' : 's') : Images.resultLabel(assessment?.status);
      return '<article class="card image-country-card"><div class="image-country-head"><div class="image-country-title"><h2>' + escape(country) + '</h2>' + (item.manualCountries?.includes(country) ? '<small class="manual-country-label">Manual</small>' : '') + '<span class="sheet-status ' + (assessment ? 'ok' : '') + '">' + escape(statusLabel) + '</span></div><button class="btn primary image-search-button" type="button" data-image-search="' + escape(country) + '">Pesquisar imagens</button></div><div class="image-result-actions" data-image-actions="' + escape(country) + '"></div><div class="image-candidate-summary"><div class="image-candidate-summary-head"><b>candidatas a palavras-chave negativas</b></div><div class="image-candidate-entry"><input class="control" data-image-candidate-input="' + escape(country) + '" placeholder="Digite outra candidata e pressione Enter" aria-label="Nova candidata a palavra-chave negativa · ' + escape(country) + '"></div><div class="image-candidate-list" data-image-candidate-list="' + escape(country) + '"></div></div></article>';
    }).join('') || '<p class="sub">Sem países para validar. Adicione países manualmente no resumo.</p>';
    for (const container of $$('[data-image-actions]')) {
      const country = container.dataset.imageActions, assessment = latest.get(country);
      ImagesUI.renderImageResultButtons(container,{country,selectedValue:assessment?.status || '',onSelect:(selectedCountry,status)=>saveImageFromCard(item,record,latest,selectedCountry,status)});
    }
    for (const container of $$('[data-image-candidate-list]')) {
      const country = container.dataset.imageCandidateList, assessment = latest.get(country), editing = imageCandidateEditing.has(country), candidates = editing ? (imageCandidateDrafts.get(country) || []) : (assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []);
      KeywordCandidatesUI.renderKeywordCandidates(container,{candidates,variant:'negative',saved:true,showRemoveForSaved:true,searchContext:'Google Imagens · ' + country,emptyText:'Nenhum outro produto informado ainda.',onSearchAll:values=>actions.openImagesExcluding($('#imagesTerm').value.trim() || item.productName,country,values),onRemove:(_candidate,index)=>{const list=[...candidates];list.splice(index,1);void saveImageCandidateChange(item,country,list,assessment?.status)}});
    }
    $('#imagesHistory').innerHTML = (record.assessments || []).slice().reverse().map(entry => '<div class="history-row"><span>' + escape(dateTime(entry.capturedAt)) + '</span><b>' + escape(entry.country) + ' · ' + escape(Images.resultLabel(entry.status)) + '</b><span>' + escape([entry.searchTerm || item.productName,(entry.negativeKeywordCandidates || entry.relatedProducts || []).length ? 'Negativas: ' + (entry.negativeKeywordCandidates || entry.relatedProducts).join(', ') : ''].filter(Boolean).join(' · ')) + '</span></div>').join('') || '<p class="sub">Sem avaliações de Imagens.</p>';
  }
  function saveImageFromCard(item, record, latest, country, status) {
    const candidates = imageCandidateEditing.has(country) ? (imageCandidateDrafts.get(country) || []) : (latest.get(country)?.negativeKeywordCandidates || latest.get(country)?.relatedProducts || []);
    imageCandidateEditing.delete(country); imageCandidateDrafts.delete(country);
    actions.saveImage(item.offerKey,country,status,candidates);
  }
  async function saveImageCandidateChange(item,country,candidates,status) {
    if (!status) { view.showToast('Selecione um resultado visual antes de salvar candidatas.'); return false; }
    imageCandidateDrafts.set(country,candidates); imageCandidateEditing.add(country);
    try {
      await actions.saveImage(item.offerKey,country,status,candidates,{candidateOnly:true});
      return true;
    } catch {
      const record=imagesFor(item.offerKey),latest=Images.latestByCountry(record.assessments || []).get(country);
      imageCandidateDrafts.set(country,latest?.negativeKeywordCandidates || latest?.relatedProducts || []);
      renderImages(item,record);
      view.showToast('Não foi possível salvar as candidatas negativas.');
      return false;
    }
  }
  async function addImageCandidate(item,country,input,record,latest) {
    const value=input.value.trim(); if (!value) return;
    const assessment=latest.get(country),saved=assessment?.negativeKeywordCandidates || assessment?.relatedProducts || [];
    const current=imageCandidateEditing.has(country) ? (imageCandidateDrafts.get(country) || []) : saved;
    if (current.some(candidate=>Domain.normalize(candidate)===Domain.normalize(value))) { view.showToast('Essa candidata já está na lista.'); input.value=''; input.focus(); return; }
    const status=assessment?.status;
    if (!status) { view.showToast('Selecione um resultado visual antes de salvar candidatas.'); return; }
    input.disabled=true;
    if (await saveImageCandidateChange(item,country,[...current,value],status)) $('[data-image-candidate-input="' + CSS.escape(country) + '"]')?.focus();
    else input.disabled=false;
  }
  function clearImageCandidateDrafts() { imageCandidateDrafts.clear(); imageCandidateEditing.clear(); }
  function switchTab(tab) {
    activeTab = tab;
    $$('.tabs [data-tab]',sheet).forEach(button => button.classList.toggle('active',button.dataset.tab === tab));
    $$('[data-panel]',sheet).forEach(panel => panel.classList.toggle('hidden',panel.dataset.panel !== tab));
    const item = offerByKey(activeOfferKey);
    if (tab === 'glimpse' && item) actions.openGlimpse(item);
  }
  function filtersChanged() { render(); }
  for (const id of ['search','idFilter','scopeFilter','categoryFilter','affiliationFilter','paymentMin','decisionFilter','movementFilter','presenceFilter','visibilityFilter']) {
    const control = $('#' + id); control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change',filtersChanged);
  }
  $('#openImport').onclick = () => { actions.resetImport(); importDialog.classList.remove('hidden'); importDialog.showModal(); };
  importDialog.addEventListener('close',() => { if (!importDialog.open) importDialog.classList.add('hidden'); });
  $('#openCollections').onclick = () => { renderCollections(); collectionsDialog.showModal(); };
  $('#validateImport').onclick = () => actions.validateImport({raw:$('#pasteArea').value,scope:$('#importScope').value,complete:$('#completeListConfirm').checked});
  $('#confirmImport').onclick = () => actions.confirmImport({raw:$('#pasteArea').value,scope:$('#importScope').value,complete:$('#completeListConfirm').checked});
  function invalidateImportPreview() {
    $('#confirmImport').disabled = true;
    $('#previewStatus').className = 'preview-status warning';
    $('#previewStatus').textContent = 'Colagem, escopo ou confirmação alterados. Valide novamente antes de confirmar a coleta.';
  }
  $('#pasteArea').addEventListener('input',invalidateImportPreview);
  $('#importScope').addEventListener('change',invalidateImportPreview);
  $('#completeListConfirm').addEventListener('change',invalidateImportPreview);
  $('#clearFilters').onclick = () => { for (const control of $$('.filter-grid .control')) control.value = control.id === 'visibilityFilter' ? 'visible' : ''; render(); };
  $('#closeSheet').onclick = () => { sheet.classList.add('hidden'); clearImageCandidateDrafts(); activeOfferKey = null; actions.closeOffer(); };
  $('#saveDecision').onclick = () => actions.saveDecision(activeOfferKey,$('#decisionStatus').value,$('#decisionNotes').value);
  $('#openTrends').onclick = () => actions.openTrends($('#trendsTerm').value.trim() || offerByKey(activeOfferKey)?.productName || '');
  async function submitTrendCandidate(input = $('#trendCandidate')) {
    const saved = await actions.addTrendCandidate(activeOfferKey,input.value);
    if (saved) input.value = '';
    input.focus();
  }
  $('#addTrendCandidate').onclick = () => { void submitTrendCandidate(); };
  $('#trendCandidate').addEventListener('keydown',event => { if (event.key === 'Enter') { event.preventDefault(); void submitTrendCandidate(event.currentTarget); } });
  $('#imagesTerm').addEventListener('change',() => actions.saveImageSearchTerm(activeOfferKey,$('#imagesTerm').value));
  $('#imageCountries').addEventListener('click',event => {
    const item = offerByKey(activeOfferKey); if (!item) return;
    const search = event.target.closest('[data-image-search]');
    if (search) { actions.openImages($('#imagesTerm').value.trim() || item.productName,search.dataset.imageSearch); return; }
  });
  $('#imageCountries').addEventListener('keydown',event=>{const input=event.target.closest('[data-image-candidate-input]');if(!input||event.key!=='Enter')return;event.preventDefault();const item=offerByKey(activeOfferKey);if(!item)return;const record=imagesFor(item.offerKey),latest=Images.latestByCountry(record.assessments||[]);void addImageCandidate(item,input.dataset.imageCandidateInput,input,record,latest)});
  $('#trendCountries').addEventListener('click',event => { const button = event.target.closest('[data-country]'); if (button) { button.classList.toggle('selected'); button.setAttribute('aria-pressed',String(button.classList.contains('selected'))); } });
  $('.tabs',sheet).addEventListener('click',event => { const button = event.target.closest('[data-tab]'); if (button) switchTab(button.dataset.tab); });
  $('#rows').addEventListener('click',event => {
    const sort = event.target.closest('[data-sort]');
    if (sort) { if (sortKey === sort.dataset.sort) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; else { sortKey = sort.dataset.sort; sortDirection = 'asc'; } render(); return; }
    const decision = event.target.closest('[data-decision-key]');
    if (decision) { const item = offerByKey(decision.dataset.decisionKey); Decisions.openDecisionPicker({title:item?.productName || 'Oferta',currentValue:decisionFor(decision.dataset.decisionKey).currentStatus,onSelect:value=>actions.saveDecision(decision.dataset.decisionKey,value,decisionFor(decision.dataset.decisionKey).notes || '')}); return; }
    const button = event.target.closest('[data-action]'); if (!button) return;
    const item = offerByKey(button.dataset.key); if (!item) return;
    if (button.dataset.action === 'detail') openSheet(item);
    if (button.dataset.action === 'trends') openSheet(item,'trends');
    if (button.dataset.action === 'images') openSheet(item,'images');
    if (button.dataset.action === 'glimpse') openSheet(item,'glimpse');
    if (button.dataset.action === 'hide') { if (hiddenOffers.has(item.offerKey)) hiddenOffers.delete(item.offerKey); else hiddenOffers.add(item.offerKey); localStorage.setItem(VISIBILITY_KEY,JSON.stringify([...hiddenOffers])); render(); }
  });
  $('#headerRow').addEventListener('click',event => {
    const sort = event.target.closest('[data-sort]'); if (!sort) return;
    if (sortKey === sort.dataset.sort) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; else { sortKey = sort.dataset.sort; sortDirection = 'asc'; }
    render();
  });
  $('#columnMenu').addEventListener('change',event => {
    const checkbox = event.target.closest('[data-column]'); if (!checkbox) return;
    if (checkbox.checked) hiddenColumns.delete(checkbox.dataset.column); else hiddenColumns.add(checkbox.dataset.column);
    localStorage.setItem(COLUMN_KEY,JSON.stringify([...hiddenColumns])); render();
  });
  $('#collectionList').addEventListener('click',event => { const button = event.target.closest('[data-collection]'); if (button) actions.openCollection(button.dataset.collection); });
  document.addEventListener('click',event => { const close = event.target.closest('[data-close-dialog]'); if (close) $('#' + close.dataset.closeDialog).close(); });
  document.addEventListener('click',event => {
    const button = event.target.closest('[data-image-result]');
    if (button && sheet.contains(button)) return;
  });
  sheet.addEventListener('click',event => { const age = event.target.closest('[data-trends-product-age]'); if (age) state.pendingProductAge = age.dataset.trendsProductAge; });
  $('#decisionStatus').addEventListener('change',() => {});
  function renderCollections() {
    const list = [...state.collections].sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    $('#collectionList').innerHTML = list.map(collection => '<article class="collection-card"><h3>' + escape(collection.scope === 'top' ? 'Topo quente' : 'Fundo quente') + ' · ' + escape(dateTime(collection.capturedAt)) + '</h3><p>' + escape(collection.offerCount) + ' ofertas · ' + escape(collection.comparison?.summary?.new || 0) + ' novas · ' + escape(collection.comparison?.summary?.exited || 0) + ' saíram · ' + escape(collection.comparison?.summary?.up || 0) + ' subiram</p><button class="btn" data-collection="' + escape(collection.collectionId) + '" type="button">Ver resumo</button></article>').join('') || '<p class="sub">Nenhuma coleta salva.</p>';
  }
  function showImportPreview(preview) {
    const summary = preview.comparison?.summary || {};
    const metrics = [
      ['Interpretadas',preview.parsedCount],['Novas',summary.new ?? 0],['Permaneceram',summary.remained ?? 0],
      ['Subiram',summary.up ?? 0],['Caíram',summary.down ?? 0],['Sem alteração',summary.same ?? 0],
      ['Saíram',summary.exited ?? 0],['Retornaram',summary.returned ?? 0],['Pagamento alterado',summary.paymentChanges ?? 0],
      ['Países alterados',summary.countryChanges ?? 0],['Afiliação alterada',summary.affiliationChanges ?? 0],['Categoria alterada',summary.categoryChanges ?? 0],
    ];
    $('#previewScopeLabel').textContent = (preview.scope === 'top' ? 'Topo quente' : 'Fundo quente') + (preview.hasPrevious ? ' · comparação com a coleta anterior' : ' · primeira coleta');
    $('#previewMetrics').innerHTML = metrics.map(([label,value]) => '<div><span>' + escape(label) + '</span><b>' + escape(value) + '</b></div>').join('');
    const issues = preview.issues || [], hasErrors = issues.some(issue => issue.severity === 'error');
    const status = $('#previewStatus');
    status.className = 'preview-status ' + (hasErrors ? 'error' : preview.complete ? 'ok' : 'warning');
    status.textContent = hasErrors ? 'Há erros para corrigir antes da confirmação.' : preview.complete ? 'Validação concluída. A coleta está pronta para confirmação.' : 'Confirme que a colagem contém a lista completa deste funil.';
    $('#previewIssues').innerHTML = issues.map(issue => '<div class="' + escape(issue.severity) + '">' + escape(issue.offerId ? 'ID ' + issue.offerId + ': ' : '') + escape(issue.reason) + '</div>').join('');
    const changes = preview.comparison?.changes || [];
    $('#previewChanges').innerHTML = '<p class="preview-note">Total declarado pela origem: não informado.</p>' + (preview.hasPrevious
      ? changes.length ? '<div class="preview-change-list">' + changes.slice(0,8).map(change => '<div><b>#' + escape(change.offerId) + ' · ' + escape(change.field) + '</b><span>' + escape(JSON.stringify(change.oldValue)) + ' → ' + escape(JSON.stringify(change.newValue)) + '</span></div>').join('') + (changes.length > 8 ? '<small>+' + escape(changes.length - 8) + ' alteração(ões)</small>' : '') + '</div>' : '<p class="preview-note">Nenhuma alteração nos campos comparados.</p>'
      : '<p class="preview-note">Esta coleta estabelece a primeira referência deste funil.</p>');
    $('#confirmImport').disabled = !preview.valid || !preview.complete;
  }
  function renderCollectionDetail(collection) {
    const dialog = $('#collectionsDialog');
    $('#collectionList').innerHTML = '<article class="collection-card"><h3>' + escape(collection.scope === 'top' ? 'Topo quente' : 'Fundo quente') + ' · ' + escape(dateTime(collection.capturedAt)) + '</h3><p>' + escape(collection.offerCount) + ' ofertas interpretadas.</p><div class="collection-grid"><span>Novas: ' + escape(collection.comparison?.summary?.new || 0) + '</span><span>Subiram: ' + escape(collection.comparison?.summary?.up || 0) + '</span><span>Caíram: ' + escape(collection.comparison?.summary?.down || 0) + '</span><span>Sem mudança: ' + escape(collection.comparison?.summary?.same || 0) + '</span><span>Retornaram: ' + escape(collection.comparison?.summary?.returned || 0) + '</span><span>Saíram: ' + escape(collection.comparison?.summary?.exited || 0) + '</span></div><button class="btn" id="backToCollections" type="button">Voltar</button></article>';
    $('#backToCollections').onclick = renderCollections;
    if (!dialog.open) dialog.showModal();
  }
  const close = () => { sheet.classList.add('hidden'); clearImageCandidateDrafts(); activeOfferKey = null; };
  return {
    render(next) { state = {...state,...next}; render(); },
    showImportPreview,
    openOffer(item,tab) { openSheet(item,tab); },
    refreshOffer(item,tab=activeTab) { if (item?.offerKey === activeOfferKey) openSheet(item,tab); render(); },
    showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'),2400); },
    close,
    renderCollections,
    renderCollectionDetail,
    closeImportDialog() { if (importDialog.open) importDialog.close(); importDialog.classList.add('hidden'); },
    returnFromGlimpse() { switchTab('overview'); },
    getActiveOfferKey() { return activeOfferKey; },
    getActiveTab() { return activeTab; },
  };
}

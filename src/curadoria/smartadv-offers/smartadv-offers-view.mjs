import * as Domain from './smartadv-offers-domain.mjs?v=4';
import {captureOfferHistory, historyLabel} from './smartadv-offers-domain.mjs?v=4';
import * as Trends from '../trends-domain.mjs';
import * as TrendsUI from '../trends-ui.mjs';
import * as Images from '../image-search-domain.mjs';
import * as ImagesUI from '../image-search-ui.mjs';
import * as Glimpse from '../glimpse-domain.mjs';
import * as DecisionUI from '../decision-ui.mjs';
import * as KeywordCandidatesUI from '../keyword-candidates-ui.mjs?v=20261004-saved-candidate-remove';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(date);
};
const initialOfferIds = '14697,15501,16690,16847,17131,17139,17353,17354,17583,17620,17632,17648,17896,17897,17922,17962';
const captureLabel = capture => capture.sourceLabel || (
  capture.captureId === 'smartadv-user-provided-initial' || capture.offers?.map(item => item.offerId).sort().join(',') === initialOfferIds
    ? 'Lista enviada no pedido · data/hora original não informadas'
    : dateTime(capture.capturedAt)
);
const brandLabel = value => value === 'yes' ? 'Sim' : value === 'no' ? 'Não' : 'Não informado';
const keyFor = item => `smartadv:${item.offerId}`;

export function mountSmartAdvOffersView({root, actions}) {
  let captures = [], trendRecords = [], imageRecords = [], decisionRecords = [], glimpseAnalyses = [];
  let selectedCaptureId = '', annotatedOffers = [], activeOfferId = '', activeTab = 'trends';
  const importDialog = $('#importDialog', root), paste = $('#pasteArea', root), confirmButton = $('#confirmImport', root);
  const sheet = $('#offerSheet'), imageCandidateDrafts = new Map(), imageCandidateEditing = new Set();
  function showMessage(message, {error = false} = {}) { const element=$('#message',root);element.textContent=message;element.classList.toggle('error',error); }

  function recordFor(records, item, fallback) { return records.find(record => record.offerKey === keyFor(item)) || fallback; }
  function trendsFor(item) { return recordFor(trendRecords, item, {offerKey:keyFor(item),assessments:[],keywordCandidates:[],manualCountries:[]}); }
  function imagesFor(item) { return recordFor(imageRecords, item, {offerKey:keyFor(item),assessments:[],searchTerm:''}); }
  function decisionFor(item) { return recordFor(decisionRecords, item, {offerKey:keyFor(item),currentStatus:DecisionUI.DEFAULT_DECISION,notes:'',history:[]}); }
  function enrich(item) {
    const productName = Domain.productNameFromOfferName(item.offerName) || item.offerName;
    return {...item,offerKey:keyFor(item),productName,productKey:Glimpse.normalize(productName),manualCountries:trendsFor(item).manualCountries || []};
  }
  function countriesFor(item) {
    return [...new Set([...(item.geoTargets || []), ...(item.manualCountries || [])].map(value => String(value || '').trim().toUpperCase()).filter(value => /^[A-Z]{2}$/.test(value)))];
  }
  function latestGlimpse(item) {
    return glimpseAnalyses.filter(value => value.productKey === item.productKey).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null;
  }
  function fillFilter(id, values, label) {
    const select = $(`#${id}`, root), previous = select.value;
    select.innerHTML = `<option value="">${escape(label)}</option>${values.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('')}`;
    if (values.includes(previous)) select.value = previous;
  }
  function trendsBadge(item) {
    const latest = Trends.latestAssessment(trendsFor(item).assessments);
    return `<button type="button" class="table-action trends-badge ${escape(latest?.status || '')}" data-action="trends" data-key="${escape(item.offerId)}" data-curation-focus="trends" title="Abrir Google Trends">${escape(Trends.resultLabel(latest?.status))}</button>`;
  }
  function glimpseBadge(item) {
    const analysis = latestGlimpse(item);
    return `<button type="button" class="table-action glimpse-badge ${analysis ? 'saved' : ''}" data-action="glimpse" data-key="${escape(item.offerId)}" data-curation-focus="glimpse" title="${escape(analysis ? 'Última análise ' + dateTime(analysis.capturedAt) : 'Abrir Glimpse')}">${escape(Glimpse.compactSummary(analysis))}</button>`;
  }
  function imagesBadge(item) {
    const record = imagesFor(item), progress = Images.progress(record.assessments, countriesFor(item));
    const latest = [...progress.latest.values()].sort((a,b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')))[0];
    const text = progress.total ? `${progress.done}/${progress.total}` : countriesFor(item).length ? Images.resultLabel(latest?.status) : 'Definir GEO';
    const hasCandidates = [...progress.latest.values()].some(assessment => (assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []).some(value => String(value ?? '').trim()));
    const marker = KeywordCandidatesUI.keywordCandidateMarkerHtml(hasCandidates ? 1 : 0, 'negative');
    return `<button type="button" class="table-action image-badge ${escape(latest?.status || '')}" data-action="images" data-key="${escape(item.offerId)}" data-curation-focus="images" title="Abrir Google Imagens">${escape(text)}${marker}</button>`;
  }
  function renderTable() {
    const query = $('#search', root).value.trim().toLocaleLowerCase();
    const vertical = $('#verticalFilter', root).value, geo = $('#geoFilter', root).value;
    const channel = $('#channelFilter', root).value, brand = $('#brandFilter', root).value;
    const offers = annotatedOffers.map(enrich).filter(item => {
      const haystack = `${item.offerId} ${item.offerName} ${item.vertical} ${item.geoTargets.join(' ')} ${item.allowedChannels.join(' ')}`.toLocaleLowerCase();
      return (!query || haystack.includes(query)) && (!vertical || item.vertical === vertical) &&
        (!geo || item.geoTargets.includes(geo)) && (!channel || item.allowedChannels.includes(channel)) &&
        (!brand || item.brandBidding === brand);
    });
    $('#rows', root).innerHTML = offers.map(item => `<tr data-offer="${escape(item.offerId)}" class="${DecisionUI.rowClass(decisionFor(item).currentStatus)}">
      <td class="number"><a href="${escape(item.offerUrl)}" target="_blank" rel="noopener noreferrer">${escape(item.offerId)}</a></td>
      <td class="offer-name" title="${escape(item.productName)}">${escape(item.productName)}</td>
      <td>${trendsBadge(item)}</td><td>${glimpseBadge(item)}</td><td>${imagesBadge(item)}</td>
      <td>${escape(item.vertical)}</td><td>${escape(item.geoTargets.join(', ') || '—')}</td><td>${escape(item.allowedChannels.join(', ') || '—')}</td>
      <td>${escape(brandLabel(item.brandBidding))}</td><td><span class="history-pill ${item.historyState}">${escape(historyLabel(item.historyState))}</span></td>
      <td>${DecisionUI.buttonHtml(decisionFor(item).currentStatus,'data-decision-key',escape(keyFor(item)))}</td>
    </tr>`).join('');
    $('#empty', root).classList.toggle('hidden', offers.length > 0);
    $('#empty', root).textContent = annotatedOffers.length ? 'Nenhuma oferta corresponde aos filtros.' : 'Cole uma captura SmartAdv para iniciar o catálogo.';
    $('#visibleOfferCount', root).textContent = String(offers.length);
  }

  function render(nextState = {}) {
    if (Array.isArray(nextState)) nextState = {captures:nextState};
    captures = [...(nextState.captures || captures)].sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)));
    trendRecords = nextState.trends || trendRecords;
    imageRecords = nextState.images || imageRecords;
    decisionRecords = nextState.decisions || decisionRecords;
    glimpseAnalyses = nextState.glimpse || glimpseAnalyses;
    if (!captures.some(item => item.captureId === selectedCaptureId)) selectedCaptureId = captures[0]?.captureId || '';
    const select = $('#captureSelect', root);
    select.innerHTML = captures.map(item => `<option value="${escape(item.captureId)}">${escape(captureLabel(item))} · ${escape(item.offers.length)} ofertas</option>`).join('');
    select.value = selectedCaptureId;
    select.disabled = captures.length < 2;
    const selectedIndex = captures.findIndex(item => item.captureId === selectedCaptureId);
    const selected = selectedIndex >= 0 ? captures[selectedIndex] : null;
    const older = selected ? captures.slice(selectedIndex + 1) : [];
    annotatedOffers = selected ? captureOfferHistory(selected, older) : [];
    $('#captureInfo', root).textContent = selected
      ? `${captureLabel(selected)} · ${selected.offers.length} ofertas observadas. A fonte não informa se a lista está completa; ausências não são tratadas como ofertas removidas.`
      : 'Nenhuma captura salva.';
    $('#captureCount', root).textContent = String(captures.length);
    $('#offerCount', root).textContent = String(selected?.offers.length || 0);
    $('#firstSeenCount', root).textContent = String(annotatedOffers.filter(item => item.historyState === 'first-seen').length);
    const allVerticals = [...new Set(annotatedOffers.map(item => item.vertical))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const allGeos = [...new Set(annotatedOffers.flatMap(item => item.geoTargets))].sort();
    const allChannels = [...new Set(annotatedOffers.flatMap(item => item.allowedChannels))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    fillFilter('verticalFilter', allVerticals, 'Todas as verticais');
    fillFilter('geoFilter', allGeos, 'Todos os GEOs');
    fillFilter('channelFilter', allChannels, 'Todos os meios');
    renderTable();
    const active = offerById(activeOfferId);
    if (active && !sheet.classList.contains('hidden')) renderOffer(active);
  }

  function offerById(id) { const item = annotatedOffers.find(entry => String(entry.offerId) === String(id)); return item ? enrich(item) : null; }
  function renderTrendPanel(item) {
    const record = trendsFor(item), assessments = record.assessments || [], latest = Trends.latestAssessment(assessments), countries = countriesFor(item);
    $('#trendsTerm').value = latest?.searchTerm || item.productName;
    $('#trendCountries').innerHTML = countries.length ? countries.map(code => `<button type="button" class="trends-country-action ${(latest?.countries || []).includes(code) ? 'selected' : ''}" data-country="${escape(code)}" aria-pressed="${(latest?.countries || []).includes(code)}">${escape(code)}${item.manualCountries.includes(code) ? ' · manual' : ''}</button>`).join('') : '<span class="sub">Nenhum país explícito; informe os países que quer analisar.</span>';
    $('#manualCountryMessage').textContent = '';
    TrendsUI.renderProductAgeButtons($('#productAgeActions'), latest?.productAge || '', value => {
      $('#productAgeActions').dataset.selectedAge = value;
      $$('[data-trends-product-age]', $('#productAgeActions')).forEach(button => { button.classList.toggle('selected', button.dataset.trendsProductAge === value); button.setAttribute('aria-pressed', String(button.dataset.trendsProductAge === value)); });
    });
    $('#productAgeActions').dataset.selectedAge = latest?.productAge || '';
    TrendsUI.renderResultButtons($('#trendResults'), latest?.status || '', status => {
      const selectedCountries = $$('[data-country].selected', $('#trendCountries')).map(button => button.dataset.country).slice(0,5);
      if (!selectedCountries.length) { showMessage('Selecione ao menos um país para registrar uma avaliação de Trends.', {error:true}); return; }
      void actions.saveTrend(item, status, {term:$('#trendsTerm').value.trim() || item.productName,countries:selectedCountries,productAge:$('#productAgeActions').dataset.selectedAge || ''});
    });
    KeywordCandidatesUI.renderKeywordCandidates($('#trendCandidates'), {candidates:record.keywordCandidates || [],variant:'positive',searchContext:'Google Trends',onSearch:term => actions.openTrends(term),onRemove:(_candidate,index) => actions.removeTrendCandidate(item,index)});
    $('#trendsHistory').innerHTML = assessments.slice().reverse().map(entry => `<div class="history-row"><span>${escape(dateTime(entry.capturedAt))}</span><b>${escape(Trends.resultLabel(entry.status))}</b><span>${escape([entry.searchTerm,(entry.countries || []).join(', '),entry.productAge || ''].filter(Boolean).join(' · '))}</span></div>`).join('') || '<p class="sub">Sem avaliações de Trends.</p>';
  }
  function renderImagePanel(item) {
    const record = imagesFor(item), countries = countriesFor(item), latest = Images.latestByCountry(record.assessments || []);
    $('#imagesTerm').value = record.searchTerm || item.productName;
    $('#imageCountries').innerHTML = countries.map(country => {
      const assessment = latest.get(country), editing = imageCandidateEditing.has(`${item.offerKey}:${country}`), candidates = editing ? (imageCandidateDrafts.get(`${item.offerKey}:${country}`) || []) : (assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []);
      const savedCandidateCount = new Set(candidates.map(value => String(value || '').trim()).filter(Boolean)).size;
      const label = savedCandidateCount ? `${Images.resultLabel(assessment?.status)} · ${savedCandidateCount} candidata${savedCandidateCount === 1 ? '' : 's'}` : Images.resultLabel(assessment?.status);
      return `<article class="card image-country-card"><div class="image-country-head"><div class="image-country-title"><h2>${escape(country)}</h2>${item.manualCountries.includes(country) ? '<small class="manual-country-label">Manual</small>' : ''}<span class="sheet-status ${assessment ? 'ok' : ''}">${escape(label)}</span></div><button class="btn primary image-search-button" type="button" data-image-search="${escape(country)}">Pesquisar imagens</button></div><div class="image-result-actions" data-image-actions="${escape(country)}"></div><div class="image-candidate-summary"><div class="image-candidate-summary-head"><b>candidatas a palavras-chave negativas</b></div><div class="image-candidate-entry"><input class="control" data-image-candidate-input="${escape(country)}" placeholder="Digite outra candidata e pressione Enter" aria-label="Nova candidata negativa · ${escape(country)}"></div><div class="image-candidate-list" data-image-candidate-list="${escape(country)}"></div></div></article>`;
    }).join('') || '<p class="sub">Sem países para validar. Informe ao menos um país no formulário acima, na aba Google Trends.</p>';
    for (const container of $$('[data-image-actions]', $('#imageCountries'))) {
      const country = container.dataset.imageActions, assessment = latest.get(country);
      ImagesUI.renderImageResultButtons(container, {country,selectedValue:assessment?.status || '',onSelect:(selectedCountry,status) => saveImageFromCard(item,country,status)});
    }
    for (const container of $$('[data-image-candidate-list]', $('#imageCountries'))) {
      const country = container.dataset.imageCandidateList, assessment = latest.get(country), key = `${item.offerKey}:${country}`;
      const editing = imageCandidateEditing.has(key), candidates = editing ? (imageCandidateDrafts.get(key) || []) : (assessment?.negativeKeywordCandidates || assessment?.relatedProducts || []);
      KeywordCandidatesUI.renderKeywordCandidates(container, {candidates,variant:'negative',saved:true,showRemoveForSaved:true,searchContext:`Google Imagens · ${country}`,emptyText:'Nenhum outro produto informado ainda.',onSearchAll:values => actions.openImagesExcluding($('#imagesTerm').value.trim() || item.productName,country,values),onRemove:(_candidate,index) => { const list=[...candidates]; list.splice(index,1); void saveImageCandidateChange(item,country,list,assessment?.status); }});
    }
    $('#imagesHistory').innerHTML = (record.assessments || []).slice().reverse().map(entry => `<div class="history-row"><span>${escape(dateTime(entry.capturedAt))}</span><b>${escape(entry.country)} · ${escape(Images.resultLabel(entry.status))}</b><span>${escape([entry.searchTerm || item.productName,(entry.negativeKeywordCandidates || entry.relatedProducts || []).length ? 'Negativas: ' + (entry.negativeKeywordCandidates || entry.relatedProducts).join(', ') : ''].filter(Boolean).join(' · '))}</span></div>`).join('') || '<p class="sub">Sem avaliações de Imagens.</p>';
  }
  function saveImageFromCard(item, country, status) {
    const record = imagesFor(item), latest = Images.latestByCountry(record.assessments || []).get(country), key = `${item.offerKey}:${country}`;
    const candidates = imageCandidateEditing.has(key) ? (imageCandidateDrafts.get(key) || []) : (latest?.negativeKeywordCandidates || latest?.relatedProducts || []);
    imageCandidateEditing.delete(key); imageCandidateDrafts.delete(key);
    void actions.saveImage(item,country,status,candidates);
  }
  async function saveImageCandidateChange(item, country, candidates, status) {
    if (!status) { showMessage('Selecione um resultado visual antes de salvar candidatas.', {error:true}); return false; }
    const key = `${item.offerKey}:${country}`;
    imageCandidateDrafts.set(key,candidates); imageCandidateEditing.add(key);
    try { await actions.saveImage(item,country,status,candidates,{candidateOnly:true}); imageCandidateDrafts.delete(key);imageCandidateEditing.delete(key);return true; }
    catch { imageCandidateDrafts.delete(key);imageCandidateEditing.delete(key);const current=offerById(activeOfferId);if(current)renderImagePanel(current);showMessage('Não foi possível salvar as candidatas negativas.', {error:true}); return false; }
  }
  async function addImageCandidate(item,country,input) {
    const value=input.value.trim(); if (!value) return;
    const record=imagesFor(item),latest=Images.latestByCountry(record.assessments || []),assessment=latest.get(country),key=`${item.offerKey}:${country}`;
    const saved=assessment?.negativeKeywordCandidates || assessment?.relatedProducts || [],current=imageCandidateEditing.has(key)?(imageCandidateDrafts.get(key)||[]):saved;
    if (current.some(candidate => Glimpse.normalize(candidate) === Glimpse.normalize(value))) { input.value=''; input.focus(); return; }
    if (!assessment?.status) { showMessage('Selecione um resultado visual antes de salvar candidatas.', {error:true}); return; }
    input.disabled=true;
    if (await saveImageCandidateChange(item,country,[...current,value],assessment.status)) { input.value=''; input.disabled=false; input.focus(); }
    else input.disabled=false;
  }
  function renderOffer(item) { renderTrendPanel(item); renderImagePanel(item); $('#glimpseFrame').dataset.productKey=item.productKey; }
  function switchTab(tab) {
    activeTab=tab;
    $$('.tabs [data-tab]',sheet).forEach(button => button.classList.toggle('active',button.dataset.tab === tab));
    $$('[data-panel]',sheet).forEach(panel => panel.classList.toggle('hidden',panel.dataset.panel !== tab));
    const item=offerById(activeOfferId);
    if(tab === 'glimpse' && item) actions.openGlimpse(item);
  }
  function openOffer(item, tab) {
    activeOfferId=String(item.offerId); activeTab=tab;
    $('#sheetTitle').textContent=item.productName;
    $('#sheetMeta').textContent=`Offer ID ${item.offerId} · ${item.vertical} · ${item.geoTargets.join(', ') || 'GEO não explícito'}`;
    renderOffer(item); switchTab(tab); sheet.classList.remove('hidden'); window.scrollTo(0,0);
  }
  function closeOffer() { sheet.classList.add('hidden'); imageCandidateDrafts.clear(); imageCandidateEditing.clear(); activeOfferId=''; actions.closeOffer(); }

  function showImportPreview({parsed}) {
    $('#previewMetrics', root).innerHTML = [['Ofertas reconhecidas', parsed.parsedCount],['Verticais', new Set(parsed.offers.map(item => item.vertical)).size],['IDs distintos', new Set(parsed.offers.map(item => item.offerId)).size]].map(([label,value]) => `<div><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('');
    $('#previewStatus', root).textContent = 'Confira os dados. A captura será guardada somente após clicar em Salvar; a cobertura total da lista não é conhecida.';
    $('#previewIssues', root).innerHTML = parsed.issues.length ? parsed.issues.map(issue => `<div class="${issue.severity === 'error' ? 'error' : 'warning'}">${escape(issue.reason)}</div>`).join('') : '<div class="ok">Estrutura reconhecida; o texto original completo não será armazenado.</div>';
    $('#previewList', root).innerHTML = parsed.offers.slice(0,50).map(item => `<div class="preview-row"><span class="number">${escape(item.offerId)}</span><div><b>${escape(item.offerName)}</b><span>${escape(item.vertical)} · ${escape(item.geoTargets.join(', ') || 'GEO não identificado')}</span></div></div>`).join('');
    confirmButton.disabled = !parsed.valid;
  }
  function openImport() { importDialog.showModal(); paste.focus(); }
  function closeImport() { if (importDialog.open) importDialog.close(); }

  root.querySelector('#openImport').onclick=openImport;
  root.querySelectorAll('[data-close-import]').forEach(button => button.onclick=closeImport);
  root.querySelector('#validateImport').onclick=()=>actions.validateImport(paste.value);
  confirmButton.onclick=()=>actions.confirmImport(paste.value);
  paste.oninput=()=>{confirmButton.disabled=true;$('#previewStatus',root).textContent='A colagem mudou; valide novamente antes de salvar.'};
  $('#captureSelect',root).onchange=event=>{selectedCaptureId=event.target.value;render()};
  ['search','verticalFilter','geoFilter','channelFilter','brandFilter'].forEach(id=>{const element=$(`#${id}`,root);element.addEventListener(id==='search'?'input':'change',renderTable)});
  $('#exportBackup',root).onclick=()=>actions.exportBackup();
  $('#restoreBackup',root).onchange=event=>{const file=event.target.files?.[0];if(file)actions.restoreBackup(file);event.target.value=''};
  $('#rows',root).addEventListener('click',event=>{
    const decisionButton=event.target.closest('[data-decision-key]');
    if(decisionButton){const item=annotatedOffers.map(enrich).find(offer=>keyFor(offer)===decisionButton.dataset.decisionKey);if(!item)return;const current=decisionFor(item);DecisionUI.openDecisionPicker({title:item.productName,currentValue:current.currentStatus,onSelect:status=>actions.saveDecision(item,status)});return;}
    const button=event.target.closest('[data-action]');if(!button)return;const item=offerById(button.dataset.key);if(item)openOffer(item,button.dataset.action)
  });
  $('#closeSheet').onclick=closeOffer;
  $('.tabs',sheet).addEventListener('click',event=>{const button=event.target.closest('[data-tab]');if(button)switchTab(button.dataset.tab)});
  $('#openTrends').onclick=()=>actions.openTrends($('#trendsTerm').value.trim() || offerById(activeOfferId)?.productName || '');
  async function submitTrendCandidate() { const input=$('#trendCandidate'),item=offerById(activeOfferId);if(!item)return;const saved=await actions.addTrendCandidate(item,input.value);if(saved)input.value='';input.focus(); }
  $('#addTrendCandidate').onclick=()=>void submitTrendCandidate();
  $('#trendCandidate').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void submitTrendCandidate()}});
  $('#trendCountries').addEventListener('click',event=>{const button=event.target.closest('[data-country]');if(!button)return;const selected=$$('[data-country].selected',$('#trendCountries'));if(!button.classList.contains('selected')&&selected.length>=5){showMessage('Selecione no máximo cinco países para a pesquisa.',{error:true});return}button.classList.toggle('selected');button.setAttribute('aria-pressed',String(button.classList.contains('selected')))});
  $('#addManualCountry').onclick=async()=>{const item=offerById(activeOfferId),input=$('#manualCountry');if(!item)return;const saved=await actions.addManualCountry(item,input.value);if(saved){input.value='';showMessage('País adicionado às opções de Trends e Imagens.')} };
  $('#manualCountry').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();$('#addManualCountry').click()}});
  $('#imagesTerm').addEventListener('change',()=>{const item=offerById(activeOfferId);if(item)actions.saveImageSearchTerm(item,$('#imagesTerm').value)});
  $('#imageCountries').addEventListener('click',event=>{const item=offerById(activeOfferId);if(!item)return;const button=event.target.closest('[data-image-search]');if(button)actions.openImages($('#imagesTerm').value.trim()||item.productName,button.dataset.imageSearch)});
  $('#imageCountries').addEventListener('keydown',event=>{const input=event.target.closest('[data-image-candidate-input]');if(!input||event.key!=='Enter')return;event.preventDefault();const item=offerById(activeOfferId);if(item)void addImageCandidate(item,input.dataset.imageCandidateInput,input)});
  importDialog.addEventListener('close',()=>{confirmButton.disabled=true;paste.value=''});

  return {
    render,
    refreshOffer(item, tab = activeTab) { if(String(item.offerId)===activeOfferId&&!sheet.classList.contains('hidden')){const active=offerById(activeOfferId)||enrich(item);renderOffer(active);switchTab(tab)} },
    returnFromGlimpse() { switchTab('trends'); },
    showImportPreview,
    closeImport,
    showMessage,
  };
}

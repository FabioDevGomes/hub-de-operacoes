import {clickBankOfferDetailsUrl, compareCapturedOffers, captureOfferVariations, movementLabel} from './clickbank-top-offers-domain.mjs?v=4';
import {lastCollectionCell, latestCollectionIndex, collectionTime} from '../last-collection.mjs';
import {mountCurationColumns} from '../curation-columns.mjs?v=1';
import * as Trends from '../trends-domain.mjs';
import * as TrendsUI from '../trends-ui.mjs';
import * as Images from '../image-search-domain.mjs';
import * as ImagesUI from '../image-search-ui.mjs';
import * as Glimpse from '../glimpse-domain.mjs';
import * as DecisionUI from '../decision-ui.mjs';
import * as KeywordCandidatesUI from '../keyword-candidates-ui.mjs?v=20261004-saved-candidate-remove';
import {SALES_PAGE_TYPES, salesPageTypeLabel} from './sales-page-type.mjs?v=3';
import {productNameFromOfferTitle} from './product-name.mjs?v=1';

const $ = (selector, root) => root.querySelector(selector);
const $$ = (root, selector) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(date);
};
const HIDDEN_OFFERS_KEY = 'hub:clickbank-top-offers:hidden-offer-keys:v1';

export function mountClickBankTopOffersView({root, actions, preferences}) {
  let state = {captures:[],offerMetadata:[],trends:[],images:[],decisions:[],glimpse:[]};
  let latestCaptureByOffer = new Map();
  let selectedCaptureId = '', sortKey = 'rank', sortDirection = 'asc', activeOfferKey = '', activeTab = 'trends', pendingProductAge = '', pendingTrendStatus = '', savingTrend = false;
  const importDialog = $('#importDialog',root), paste = $('#pasteArea',root), confirmButton = $('#confirmImport',root), sheet = $('#offerSheet',root);
  if (preferences === undefined) { try { preferences = root.ownerDocument.defaultView.localStorage; } catch {} }
  let hiddenOffers = new Set();
  try {
    const saved = JSON.parse(preferences?.getItem(HIDDEN_OFFERS_KEY) || '[]');
    if (Array.isArray(saved)) hiddenOffers = new Set(saved.filter(key=>typeof key==='string' && key));
  } catch {}
  const columns = mountCurationColumns({root, screen:'clickbank', preferences});

  function selectedCapture() { return state.captures.find(item => item.captureId === selectedCaptureId) || state.captures[0] || null; }
  function previousCapture(selected) {
    const index = state.captures.findIndex(item => item.captureId === selected?.captureId);
    return index >= 0 ? state.captures.slice(index + 1).find(item => item.listName === selected.listName) || null : null;
  }
  function metadataFor(item) { return state.offerMetadata.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,manualCountries:[]}; }
  function trendsFor(item) { return state.trends.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,assessments:[],keywordCandidates:[]}; }
  function imagesFor(item) { return state.images.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,searchTerm:item.offerName,assessments:[]}; }
  function decisionFor(item) { return state.decisions.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,currentStatus:DecisionUI.DEFAULT_DECISION,history:[]}; }
  function glimpseFor(item) {
    const productKey = Glimpse.normalize(item.offerName);
    return [...state.glimpse].filter(record => record.productKey === productKey).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null;
  }
  function activeOffer() {
    for (const capture of state.captures) {
      const item = capture.offers.find(offer => offer.offerKey === activeOfferKey);
      if (item) return item;
    }
    return null;
  }
  function metricText(metric) { return metric?.raw || '—'; }
  function pageTypeText(item) { return salesPageTypeLabel(metadataFor(item).salesPageType); }
  function movementClass(item) { return item.movement === 'up' || item.movement === 'new' ? 'movement-up' : item.movement === 'down' ? 'movement-down' : ''; }
  function trendLatest(item) { return Trends.latestAssessment(trendsFor(item).assessments); }
  function updateSheetSaveButton() {
    const button=$('#saveSheetButton',root);
    const reasons={
      trends:['Salvar a avaliação de Google Trends.','Salvar avaliação de Google Trends'],
      glimpse:['Salvar a análise Glimpse.','Salvar análise Glimpse'],
      images:['As classificações e candidatas de Imagens são salvas automaticamente em cada ação.','As avaliações de Google Imagens são salvas automaticamente'],
      history:['A aba Histórico é somente leitura.','Histórico somente leitura'],
    };
    const [description,label]=reasons[activeTab]||reasons.history;
    button.hidden=false;
    button.disabled=activeTab==='trends'?savingTrend:activeTab!=='glimpse';
    button.title=description;
    button.setAttribute('aria-label',label);
  }
  function renderTrendResultButtons(item, latest) {
    TrendsUI.renderResultButtons($('#trendResults',root),pendingTrendStatus||latest?.status||'',status=>{
      pendingTrendStatus=status;
      $('#trendMessage',root).textContent='Resultado selecionado. Clique em Salvar para registrar.';
      $('#trendMessage',root).classList.remove('error');
      $('#sheetMessage',root).textContent='';
      $('#sheetMessage',root).classList.remove('error');
      updateSheetSaveButton();
      renderTrendResultButtons(item,latest);
    });
  }
  function imageProgress(item) { return Images.progress(imagesFor(item).assessments,metadataFor(item).manualCountries || []); }
  function trendRank(item) { return ({up:7,stable:6,down:5,low_volume:4,point_peak:3,inconclusive:2,no_data:1})[trendLatest(item)?.status] || 0; }
  function imageRank(item) {
    const progress=imageProgress(item),latest=[...progress.latest.values()].sort((a,b)=>String(b.capturedAt||'').localeCompare(String(a.capturedAt||'')))[0];
    return progress.done*10+Images.resultRank(latest?.status);
  }
  function glimpseRank(item) { return Glimpse.analysisRank(glimpseFor(item)); }
  function trendBadge(item) {
    const latest=trendLatest(item),label=Trends.resultLabel(latest?.status),candidateMarker=KeywordCandidatesUI.keywordCandidateMarkerHtml(trendsFor(item).keywordCandidates?.length||0,'positive');
    const context=[...(latest?.countries||[])].slice(0,5).join(', '),text=context?`${label} · ${context}`:label;
    return `<button type="button" class="table-action trends-badge ${escape(latest?.status || '')}" data-action="trends" data-key="${escape(item.offerKey)}" data-curation-focus="trends" title="Abrir Google Trends">${escape(text)}${candidateMarker}</button>`;
  }
  function glimpseBadge(item) {
    const analysis=glimpseFor(item);
    return `<button type="button" class="table-action glimpse-badge ${analysis?'saved':''}" data-action="glimpse" data-key="${escape(item.offerKey)}" data-curation-focus="glimpse" title="${escape(analysis?'Última análise '+dateTime(analysis.capturedAt):'Abrir Glimpse')}">${escape(Glimpse.compactSummary(analysis))}</button>`;
  }
  function imageBadge(item) {
    const progress=imageProgress(item),latest=[...progress.latest.values()].sort((a,b)=>String(b.capturedAt||'').localeCompare(String(a.capturedAt||'')))[0];
    const label=progress.total?`${progress.done} de ${progress.total}`:Images.resultLabel(latest?.status);
    const hasCandidates=[...progress.latest.values()].some(record=>(record.negativeKeywordCandidates||record.relatedProducts||[]).some(value=>String(value??'').trim()));
    const marker=KeywordCandidatesUI.keywordCandidateMarkerHtml(hasCandidates?1:0,'negative');
    return `<button type="button" class="table-action image-badge ${escape(latest?.status || '')}" data-action="images" data-key="${escape(item.offerKey)}" data-curation-focus="images" title="Abrir Google Imagens">${escape(label)}${marker}</button>`;
  }

  function renderTable(selected, previous) {
    const query=$('#search',root).value.trim().toLocaleLowerCase();
    const visibility=$('#visibilityFilter',root).value || 'visible';
    let offers=captureOfferVariations(selected,state.captures).map(item=>({...item,displayName:productNameFromOfferTitle(item.offerName,item.seller)}));
    offers=offers.filter(item=>!query||`${item.displayName} ${item.offerName} ${item.seller}`.toLocaleLowerCase().includes(query));
    offers=offers.filter(item=>visibility==='all'||(visibility==='hidden')===hiddenOffers.has(item.offerKey));
    offers.sort((a,b)=>{
      const get=(item)=>sortKey==='movement'?item.rankDelta??Number.NEGATIVE_INFINITY:
        sortKey==='rank'?item.rank:
        sortKey==='lastSeen'?collectionTime(latestCaptureByOffer.get(item.offerKey))??Number.NEGATIVE_INFINITY:
        sortKey==='future'?pageTypeText(item).toLocaleLowerCase():
        sortKey==='offerName'?item.displayName.toLocaleLowerCase():sortKey==='seller'?item.seller.toLocaleLowerCase():
        sortKey==='trends'?trendRank(item):sortKey==='glimpse'?glimpseRank(item):sortKey==='images'?imageRank(item):item[sortKey]?.value??Number.NEGATIVE_INFINITY;
      const left=get(a),right=get(b),compare=typeof left==='string'?left.localeCompare(right):left-right;
      return sortDirection==='asc'?compare:-compare;
    });
    $('#rows',root).innerHTML=offers.map(item=>`<tr data-offer="${escape(item.offerKey)}" class="${DecisionUI.rowClass(decisionFor(item).currentStatus)}">
      <td class="number">${item.offerId
        ? `<a class="clickbank-rank-link" href="${escape(clickBankOfferDetailsUrl(item.offerId))}" target="_blank" rel="noopener noreferrer" title="Abrir detalhes da ClickBank para ${escape(item.offerName)}">#${escape(item.rank)}</a>`
        : `#${escape(item.rank)}`}</td><td class="offer-name hub-edit-host" title="${escape(item.offerName)}"><span>${escape(item.displayName)}</span><button type="button" class="hub-corner-edit" data-offer-visibility="${escape(item.offerKey)}" aria-label="${escape((hiddenOffers.has(item.offerKey)?'Reexibir':'Ocultar')+' '+item.displayName)}">${hiddenOffers.has(item.offerKey)?'Reexibir':'Ocultar'}</button></td><td>${escape(item.seller)}</td>
      <td>${trendBadge(item)}</td><td>${glimpseBadge(item)}</td><td>${imageBadge(item)}</td>
      <td class="number">${escape(metricText(item.average))}</td><td class="number">${escape(metricText(item.initial))}</td>
      <td class="page-type-cell">${escape(pageTypeText(item))}</td><td class="number">${escape(metricText(item.epc))}</td>
      <td class="number">${escape(metricText(item.cvr))}</td><td class="number">${escape(metricText(item.gravity))}</td>
      <td class="number ${movementClass(item)}" title="${escape(item.movement==='new'?'Primeira aparição desta oferta no histórico até esta captura.':item.movement==='uncompared'?'Oferta já observada no histórico; sem posição na captura anterior comparável.':'Variação de posição em relação à captura anterior comparável.')}">${escape(movementLabel(item))}</td><td>${DecisionUI.buttonHtml(decisionFor(item).currentStatus,'data-decision-key',escape(item.offerKey))}</td>${lastCollectionCell(latestCaptureByOffer.get(item.offerKey))}</tr>`).join('');
    columns.apply();
    $('#empty',root).classList.toggle('hidden',offers.length>0);
    $('#empty',root).textContent=selected?'Nenhuma oferta corresponde aos filtros.':'Cole a primeira captura Top Offers da ClickBank para começar.';
    $$ (root,'[data-sort]').forEach(button=>{
      button.classList.toggle('active',button.dataset.sort===sortKey);
      button.setAttribute('aria-sort',button.dataset.sort===sortKey?(sortDirection==='asc'?'ascending':'descending'):'none');
      button.onclick=()=>{const key=button.dataset.sort;if(sortKey===key)sortDirection=sortDirection==='asc'?'desc':'asc';else{sortKey=key;sortDirection=key==='rank'?'asc':'desc';}renderTable(selected,previous)};
    });
  }

  function renderTrends(item) {
    const record=trendsFor(item),latest=Trends.latestAssessment(record.assessments),metadata=metadataFor(item),countries=metadata.manualCountries||[],selected=new Set(latest?.countries||[]);
    const dtcCountries=new Set(metadata.dtcCountryCapture?.countries||[]);
    const offerLink=$('#openClickBankOffer',root),offerUnavailable=$('#clickBankOfferUnavailable',root),offerUrl=clickBankOfferDetailsUrl(item.offerId);
    if(offerUrl){offerLink.href=offerUrl;offerLink.setAttribute('aria-label',`Abrir detalhes ClickBank para ${item.offerName}`);offerLink.classList.remove('hidden');offerUnavailable.classList.add('hidden');}
    else{offerLink.removeAttribute?.('href');offerLink.classList.add('hidden');offerUnavailable.classList.remove('hidden');}
    $('#trendsTerm',root).value=latest?.searchTerm||item.offerName;
    $('#trendCountries',root).innerHTML=countries.length?countries.map(code=>`<button type="button" class="trends-country-action ${selected.has(code)?'selected':''}" data-country="${escape(code)}" aria-pressed="${selected.has(code)}">${escape(code)} · ${dtcCountries.has(code)?'DTC':'manual'}</button>`).join(''):'<span class="sub">Nenhum país adicionado ainda.</span>';
    pendingProductAge=latest?.productAge||pendingProductAge;
    TrendsUI.renderProductAgeButtons($('#productAgeActions',root),pendingProductAge,value=>{
      pendingProductAge=value;
      $$ (root,'[data-trends-product-age]').forEach(button=>{button.classList.toggle('selected',button.dataset.trendsProductAge===value);button.setAttribute('aria-pressed',String(button.dataset.trendsProductAge===value))});
    });
    const salesPageType=metadata.salesPageType||null,salesPageTypeActions=$('#salesPageTypeActions',root);
    salesPageTypeActions.innerHTML=[...SALES_PAGE_TYPES.map(value=>({value,label:value.toUpperCase()})),{value:'',label:'Não definido'}].map(({value,label})=>
      `<button type="button" class="trends-country-action ${salesPageType===value||(!salesPageType&&!value)?'selected':''}" data-sales-page-type="${value}" aria-pressed="${salesPageType===value||(!salesPageType&&!value)}">${label}</button>`
    ).join('');
    $$ (root,'[data-sales-page-type]').forEach(button=>{
      button.onclick=()=>{
        const controls=$$ (root,'[data-sales-page-type]');controls.forEach(control=>control.disabled=true);
        Promise.resolve(actions.saveSalesPageType(item.offerKey,button.dataset.salesPageType||null)).then(saved=>{
          if(!saved)controls.forEach(control=>control.disabled=false);
        }).catch(()=>controls.forEach(control=>control.disabled=false));
      };
    });
    renderTrendResultButtons(item,latest);
    KeywordCandidatesUI.renderKeywordCandidates($('#trendCandidates',root),{
      candidates:record.keywordCandidates||[],variant:'positive',searchContext:'Google Trends',showRemoveForSaved:true,
      onSearch:term=>actions.openTrends(term),onRemove:(_candidate,index)=>actions.removeTrendCandidate(item.offerKey,index),
    });
    $('#trendsHistory',root).innerHTML=(record.assessments||[]).slice().reverse().map(entry=>`<div class="history-row"><span>${escape(dateTime(entry.capturedAt))}</span><b>${escape(Trends.resultLabel(entry.status))}</b><span>${escape([entry.searchTerm,(entry.countries||[]).join(', '),entry.productAge==='new'?'Produto novo':entry.productAge==='old'?'Produto antigo':''].filter(Boolean).join(' · '))}</span></div>`).join('')||'<p class="sub">Sem avaliações de Google Trends.</p>';
  }

  function renderImages(item) {
    const record=imagesFor(item),countries=metadataFor(item).manualCountries||[],latest=Images.latestByCountry(record.assessments||[]);
    const progress=Images.progress(record.assessments||[],countries);
    $('#imagesMessage',root).textContent=countries.length?`${progress.done} de ${progress.total} países verificados.`:'Não há países para pesquisar. Adicione países manualmente na aba Google Trends.';
    $('#imagesTerm',root).value=record.searchTerm||item.offerName;
    $('#imageCountries',root).innerHTML=countries.map(country=>{
      const assessment=latest.get(country),candidates=assessment?.negativeKeywordCandidates||assessment?.relatedProducts||[];
      const statusLabel=candidates.length?`${Images.resultLabel(assessment?.status)} · ${candidates.length} candidata${candidates.length===1?'':'s'}`:Images.resultLabel(assessment?.status);
      return `<article class="card image-country-card"><div class="image-country-head"><div class="image-country-title"><h2>${escape(country)}</h2><small class="manual-country-label">Manual</small><span class="sheet-status ${assessment?'ok':''}">${escape(statusLabel)}</span></div><button class="btn primary image-search-button" type="button" data-image-search="${escape(country)}">Pesquisar imagens</button></div><div class="image-result-actions" data-image-actions="${escape(country)}"></div><div class="image-candidate-summary"><div class="image-candidate-summary-head"><b>candidatas a palavras-chave negativas</b></div><div class="image-candidate-entry"><input class="control" data-image-candidate-input="${escape(country)}" placeholder="Digite outra candidata e pressione Enter" aria-label="Nova candidata a palavra-chave negativa · ${escape(country)}"></div><div class="image-candidate-list" data-image-candidate-list="${escape(country)}"></div></div></article>`;
    }).join('')||'<p class="sub">Nenhum país para validar. Adicione países na aba Google Trends.</p>';
    $$ (root,'[data-image-actions]').forEach(container=>{
      const country=container.dataset.imageActions,assessment=latest.get(country);
      ImagesUI.renderImageResultButtons(container,{country,selectedValue:assessment?.status||'',onSelect:(selectedCountry,status)=>{
        actions.saveImage(item.offerKey,selectedCountry,status,latest.get(selectedCountry)?.negativeKeywordCandidates||latest.get(selectedCountry)?.relatedProducts||[]);
      }});
    });
    $$ (root,'[data-image-candidate-list]').forEach(container=>{
      const country=container.dataset.imageCandidateList,assessment=latest.get(country),candidates=assessment?.negativeKeywordCandidates||assessment?.relatedProducts||[];
      KeywordCandidatesUI.renderKeywordCandidates(container,{candidates,variant:'negative',saved:true,showRemoveForSaved:true,
        searchContext:'Google Imagens · '+country,emptyText:'Nenhum outro produto informado ainda.',
        onSearchAll:values=>actions.openImagesExcluding($('#imagesTerm',root).value.trim()||item.offerName,country,values),
        onRemove:(_candidate,index)=>{const remaining=[...candidates];remaining.splice(index,1);if(!assessment?.status){actions.showMessage?.('Selecione um resultado visual antes de salvar candidatas.',{error:true});return;}actions.saveImage(item.offerKey,country,assessment.status,remaining,{candidateOnly:true});},
      });
    });
    $('#imagesHistory',root).innerHTML=(record.assessments||[]).slice().reverse().map(entry=>`<div class="history-row"><span>${escape(dateTime(entry.capturedAt))}</span><b>${escape(entry.country)} · ${escape(Images.resultLabel(entry.status))}</b><span>${escape([entry.searchTerm||item.offerName,(entry.negativeKeywordCandidates||entry.relatedProducts||[]).length?'Negativas: '+(entry.negativeKeywordCandidates||entry.relatedProducts).join(', '):''].filter(Boolean).join(' · '))}</span></div>`).join('')||'<p class="sub">Sem avaliações de Google Imagens.</p>';
  }

  function renderSheet() {
    const item=activeOffer();if(!item)return;
    $('#sheetTitle',root).textContent=item.offerName;
    $('#sheetMeta',root).textContent=`${item.seller} · Posição ${item.rank} · Captura ClickBank`;
    $$(sheet,'[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===activeTab));
    $$(sheet,'[data-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.panel!==activeTab));
    renderTrends(item);renderImages(item);
    $('#allTrendsHistory',root).innerHTML=$('#trendsHistory',root).innerHTML;
    $('#allImagesHistory',root).innerHTML=$('#imagesHistory',root).innerHTML;
    if(activeTab==='glimpse')actions.openGlimpse(item);
    updateSheetSaveButton();
  }
  function openSheet(item,tab='trends') {
    activeOfferKey=item.offerKey;activeTab=tab;pendingProductAge=Trends.latestAssessment(trendsFor(item).assessments)?.productAge||'';pendingTrendStatus='';savingTrend=false;
    $('#trendMessage',root).textContent='';$('#trendMessage',root).classList.remove('error');
    sheet.classList.remove('hidden');renderSheet();
    sheet.scrollTop=0;
    $('#sheetMessage',root).textContent='';$('#sheetMessage',root).classList.remove('error');
  }
  function closeSheet() { sheet.classList.add('hidden');activeOfferKey='';actions.restoreListFocus?.(); }
  function switchTab(tab) { activeTab=tab;renderSheet(); }

  function render(nextState=state) {
    state={...state,...nextState};
    latestCaptureByOffer=latestCollectionIndex(state.captures,item=>item.offerKey);
    state.captures=[...state.captures].sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)));
    if(!state.captures.some(item=>item.captureId===selectedCaptureId))selectedCaptureId=state.captures[0]?.captureId||'';
    const selected=selectedCapture(),previous=previousCapture(selected);
    $('#captureSelect',root).innerHTML=state.captures.map(item=>`<option value="${escape(item.captureId)}">${escape(dateTime(item.capturedAt))} · ${escape(item.offers.length)} ofertas · posições ${escape(item.page.start??'—')}–${escape(item.page.end??'—')}</option>`).join('');
    $('#captureSelect',root).value=selectedCaptureId;$('#captureSelect',root).disabled=state.captures.length<2;
    const resultCount=$('#captureResultCount',root),hasResultCount=selected?.page.total!=null;
    resultCount.textContent=hasResultCount?`${new Intl.NumberFormat('pt-BR').format(Number(selected.page.total))} resultados${selected.page.completeUniverse?' · Lista completa':''}`:'';
    resultCount.hidden=!hasResultCount;
    $('#captureCount',root).textContent=String(state.captures.length);$('#offerCount',root).textContent=String(selected?.offers.length||0);
    const compared=selected&&previous?compareCapturedOffers(selected.offers,previous.offers):[],moved=compared.filter(item=>item.movement==='up'||item.movement==='down').length;
    $('#movementCount',root).textContent=previous?String(moved):'—';renderTable(selected,previous);
    if(!sheet.classList.contains('hidden'))renderSheet();
  }

  function showImportPreview({parsed,compared=[],newProductCount=null}) {
    $('#previewMetrics',root).innerHTML=[['Linhas lidas',parsed.parsedCount],['Produtos novos detectados',newProductCount??'—'],['Faixa de posições',parsed.page.start==null?'—':`${parsed.page.start}–${parsed.page.end}`],['Correspondências anteriores',compared.filter(item=>item.movement!=='uncompared').length],['Subiram',compared.filter(item=>item.movement==='up').length],['Caíram',compared.filter(item=>item.movement==='down').length]].map(([label,value])=>`<div><span>${escape(label)}</span><b>${escape(value)}</b></div>`).join('');
    const partial=parsed.page.total!=null&&parsed.parsedCount<parsed.page.total;
    $('#previewStatus',root).textContent=partial?'Captura parcial do ranking. A ausência de um item não será interpretada como saída.':'Revise a prévia; nada será salvo antes de confirmar.';
    $('#previewIssues',root).innerHTML=parsed.issues.length?parsed.issues.map(issue=>`<div class="${escape(issue.severity)}">${escape(issue.reason)}</div>`).join(''):'<div class="ok">Estrutura reconhecida.</div>';
    confirmButton.disabled=!parsed.valid;
  }
  function openImport() { importDialog.classList.remove('hidden');importDialog.showModal();paste.focus(); }
  function closeImport() { if(importDialog.open)importDialog.close();importDialog.classList.add('hidden'); }

  $('#openImport',root).onclick=openImport;
  $$ (root,'[data-close-dialog="importDialog"]').forEach(button=>button.onclick=closeImport);
  $('#validateImport',root).onclick=()=>actions.validateImport(paste.value);
  confirmButton.onclick=()=>actions.confirmImport(paste.value);
  paste.oninput=()=>{confirmButton.disabled=true;$('#previewStatus',root).textContent='A colagem mudou; valide novamente antes de confirmar.';};
  $('#captureSelect',root).onchange=event=>{selectedCaptureId=event.target.value;render();};
  $('#search',root).oninput=()=>renderTable(selectedCapture(),previousCapture(selectedCapture()));
  $('#visibilityFilter',root).onchange=()=>renderTable(selectedCapture(),previousCapture(selectedCapture()));
  $('#exportBackup',root).onclick=()=>actions.exportBackup();
  $('#restoreBackup',root).onchange=event=>{const file=event.target.files?.[0];if(file)actions.restoreBackup(file);event.target.value='';};
  importDialog.addEventListener('close',()=>importDialog.classList.add('hidden'));
  $('#closeSheet',root).onclick=closeSheet;
  $('#saveSheetButton',root).onclick=async()=>{
    const item=activeOffer();
    if(!item||savingTrend||activeTab!=='trends')return;
    const status=pendingTrendStatus||trendLatest(item)?.status;
    if(!status){$('#trendMessage',root).textContent='Selecione um resultado da análise antes de salvar.';$('#trendMessage',root).classList.remove('error');return;}
    savingTrend=true;updateSheetSaveButton();
    const chosen=$$ (root,'#trendCountries [data-country].selected').map(button=>button.dataset.country);
    try {
      const saved=await actions.saveTrend(item.offerKey,status,{term:$('#trendsTerm',root).value.trim()||item.offerName,countries:chosen,productAge:pendingProductAge});
      if(saved){
        pendingTrendStatus='';
        const fresh=activeOffer();
        if(fresh)renderTrendResultButtons(fresh,trendLatest(fresh));
        $('#trendMessage',root).textContent='';
        $('#sheetMessage',root).textContent='Avaliação de Google Trends salva.';
        $('#sheetMessage',root).classList.remove('error');
      } else {
        $('#trendMessage',root).textContent='Não foi possível salvar a avaliação. Tente novamente.';
        $('#trendMessage',root).classList.add('error');
      }
    } catch {
      $('#trendMessage',root).textContent='Não foi possível salvar a avaliação. Tente novamente.';
      $('#trendMessage',root).classList.add('error');
    } finally { savingTrend=false;updateSheetSaveButton(); }
  };
  $('.tabs',sheet).addEventListener('click',event=>{const button=event.target.closest('[data-tab]');if(button)switchTab(button.dataset.tab);});
  $('#rows',root).addEventListener('click',event=>{
    const visibilityButton=event.target.closest('[data-offer-visibility]');
    if(visibilityButton){
      event.stopPropagation?.();
      const key=visibilityButton.dataset.offerVisibility;
      if(!selectedCapture()?.offers.some(item=>item.offerKey===key))return;
      if(hiddenOffers.has(key))hiddenOffers.delete(key);else hiddenOffers.add(key);
      try {
        if(!preferences)throw new Error('Preferences unavailable');
        preferences.setItem(HIDDEN_OFFERS_KEY,JSON.stringify([...hiddenOffers]));
      } catch {
        $('#message',root).textContent='Ocultação válida nesta sessão; não foi possível salvar a preferência no navegador.';
        $('#message',root).classList.add('error');
      }
      renderTable(selectedCapture(),previousCapture(selectedCapture()));
      return;
    }
    const decisionButton=event.target.closest('[data-decision-key]');
    if(decisionButton){const item=selectedCapture()?.offers.find(offer=>offer.offerKey===decisionButton.dataset.decisionKey);if(!item)return;const current=decisionFor(item);DecisionUI.openDecisionPicker({title:item.offerName,currentValue:current.currentStatus,onSelect:status=>actions.saveDecision(item.offerKey,status)});return;}
    const button=event.target.closest('[data-action]');if(!button)return;const item=selectedCapture()?.offers.find(offer=>offer.offerKey===button.dataset.key);if(item)openSheet(item,button.dataset.action);
  });
  $('#openTrends',root).onclick=()=>actions.openTrends($('#trendsTerm',root).value.trim()||activeOffer()?.offerName||'');
  $('#trendCandidate',root).addEventListener('keydown',async event=>{
    if(event.key!=='Enter')return;event.preventDefault();const input=event.currentTarget,term=input.value.trim();if(!term||!activeOffer())return;
    const saved=await actions.addTrendCandidate(activeOfferKey,term);if(saved){const fresh=$('#trendCandidate',root);fresh.value='';fresh.focus();}
  });
  $('#trendCountries',root).addEventListener('click',event=>{
    const button=event.target.closest('[data-country]');if(!button)return;
    const selected=$$ (root,'#trendCountries [data-country].selected');
    if(!button.classList.contains('selected')&&selected.length>=5){$('#trendMessage',root).textContent='É possível registrar até cinco países por avaliação.';return;}
    button.classList.toggle('selected');button.setAttribute('aria-pressed',String(button.classList.contains('selected')));$('#trendMessage',root).textContent=pendingTrendStatus?'Resultado selecionado. Clique em Salvar para registrar.':'';
  });
  async function submitManualCountry() {
    const input=$('#manualCountry',root),item=activeOffer();if(!item)return;
    const code=input.value.trim().toUpperCase();if(await actions.addManualCountry(item.offerKey,code)){const fresh=$('#manualCountry',root);fresh.value='';$('#manualCountryMessage',root).textContent=`${code} foi adicionado e ficará separado da captura original.`;}
  }
  $('#addManualCountry',root).onclick=submitManualCountry;
  $('#manualCountry',root).onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();submitManualCountry();}};
  $('#imageCountries',root).addEventListener('click',event=>{
    const item=activeOffer();if(!item)return;
    const search=event.target.closest('[data-image-search]');if(search){actions.openImages($('#imagesTerm',root).value.trim()||item.offerName,search.dataset.imageSearch);return;}
  });
  $('#imagesTerm',root).addEventListener('change',()=>{if(activeOffer())actions.saveImageSearchTerm(activeOfferKey,$('#imagesTerm',root).value);});

  return {
    render,
    selectCapture(captureId){selectedCaptureId=captureId;render();},
    showImportPreview,
    prepareImport(raw) { paste.value=raw;if(!importDialog.open)openImport();else paste.focus(); },
    closeImport,
    showMessage(message,{error=false}={}){for(const id of ['message','sheetMessage']){const element=$('#'+id,root);element.textContent=message;element.classList.toggle('error',error);}},
    returnFromGlimpse(){if(activeOfferKey)switchTab('trends');},
    getActiveOfferKey(){return activeOfferKey;},
  };
}

import {mountTrendsSaveAction,trendPageState,sameTrendAssessment} from '../trends-save-action.mjs?v=5';
import {clickBankOfferDetailsUrl, compareCapturedOffers, captureOfferVariations, allCaptureOfferVariations, movementLabel, commissionUsdForOffer} from './clickbank-top-offers-domain.mjs?v=6';
import {lastCollectionCell, latestCollectionIndex, collectionTime} from '../last-collection.mjs';
import {mountCurationColumns} from '../curation-columns.mjs?v=1';
import * as Trends from '../trends-domain.mjs?v=5';
import * as TrendsUI from '../trends-ui.mjs?v=2';
import * as Images from '../image-search-domain.mjs?v=4';
import * as ImagesUI from '../image-search-ui.mjs';
import {clickBankImageCandidates} from './clickbank-image-keyword-candidates.mjs?v=1';
import * as Glimpse from '../glimpse-domain.mjs';
import * as DecisionUI from './clickbank-top-offers-decision.mjs?v=decision-row-request-highlight-1';
import * as KeywordCandidatesUI from '../keyword-candidates-ui.mjs?v=20261027-keyword-candidate-edit-negative';
import {SALES_PAGE_TYPES, salesPageTypeLabel} from './sales-page-type.mjs?v=3';
import {BRAND_BIDDING_TYPES,brandBiddingLabel} from './brand-bidding.mjs?v=1';
import {productNameFromOfferTitle} from './product-name.mjs?v=1';
import {formatClickBankCommissionUsd,isClickBankCommissionUsd} from '../../campaign-delivery/commission-domain.mjs?v=1';

const $ = (selector, root) => root.querySelector(selector);
const $$ = (root, selector) => [...root.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateTime = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(date);
};
const HIDDEN_OFFERS_KEY = 'hub:clickbank-top-offers:hidden-offer-keys:v1';
const SORT_PREFERENCE_KEY = 'hub:clickbank-top-offers:sort:v1';
const SORT_KEYS = new Set(['rank','offerName','seller','trends','glimpse','images','average','initial','future','epc','cvr','gravity','movement','decision','lastSeen']);
const ALL_CAPTURES = '__all__';

export function mountClickBankTopOffersView({root, actions, preferences}) {
  let state = {captures:[],offerMetadata:[],trends:[],images:[],decisions:[],glimpse:[],deliveries:[]};
  let latestCaptureByOffer = new Map();
  let allCaptures = null;
  let selectedCaptureId = ALL_CAPTURES, activeOfferKey = '', activeTab = 'trends', pendingProductAge = '', pendingTrendStatus = '', editingAffiliateLink = false, editingKeywordCandidate = null, candidateEditTrigger = null;
  let imageSearchTermTimer=null,pendingImageSearchTerm=null,imageSearchTermRunner=null;
  const importDialog = $('#importDialog',root), paste = $('#pasteArea',root), confirmButton = $('#confirmImport',root), sheet = $('#offerSheet',root);
  const candidateEditDialog=$('#trendCandidateEditDialog',root),candidateEditInput=$('#trendCandidateEditInput',root),candidateEditMessage=$('#trendCandidateEditMessage',root),candidateEditSave=$('#saveTrendCandidateEdit',root);
  const commissionDialog=$('#clickbankCommissionDialog',root),commissionForm=$('#clickbankCommissionForm',root),commissionInput=$('#clickbankCommissionInput',root),commissionMessage=$('#clickbankCommissionMessage',root),commissionSave=$('#saveClickbankCommission',root);
  const commissionDescription=$('#clickbankCommissionDescription',root);
  const imageSearchTermInput=$('#imagesTerm',root),imageSearchTermField=imageSearchTermInput.closest('label'),imageSearchTermStatus=$('#imagesTermStatus',root),imageValidationIntro=$('.image-validation-intro',root);
  imageSearchTermField.classList.add('image-search-term-field');
  if (preferences === undefined) { try { preferences = root.ownerDocument.defaultView.localStorage; } catch {} }
  let sortKey = 'rank', sortDirection = 'asc';
  try {
    const saved = JSON.parse(preferences?.getItem(SORT_PREFERENCE_KEY) || 'null');
    if (saved && SORT_KEYS.has(saved.key) && (saved.direction === 'asc' || saved.direction === 'desc')) {
      sortKey = saved.key;
      sortDirection = saved.direction;
    }
  } catch {}
  let hiddenOffers = new Set();
  try {
    const saved = JSON.parse(preferences?.getItem(HIDDEN_OFFERS_KEY) || '[]');
    if (Array.isArray(saved)) hiddenOffers = new Set(saved.filter(key=>typeof key==='string' && key));
  } catch {}
  const columns = mountCurationColumns({root, screen:'clickbank', preferences});

  function persistSortPreference() {
    try { preferences?.setItem(SORT_PREFERENCE_KEY, JSON.stringify({key:sortKey,direction:sortDirection})); }
    catch {}
  }

  async function flushImageSearchTerm(offerKey=activeOfferKey) {
    if(imageSearchTermTimer){clearTimeout(imageSearchTermTimer);imageSearchTermTimer=null;}
    if(imageSearchTermRunner){const saved=await imageSearchTermRunner;if(!saved)return false;if(pendingImageSearchTerm?.offerKey===offerKey)return flushImageSearchTerm(offerKey);return true;}
    const draft=pendingImageSearchTerm;
    if(!draft||draft.offerKey!==offerKey)return true;
    pendingImageSearchTerm=null;
    const status=$('#imagesTermStatus',root);
    if(status){status.textContent='Salvando…';status.classList.remove('error');}
    const runner=Promise.resolve().then(()=>actions.saveImageSearchTerm(draft.offerKey,draft.term)).then(saved=>saved!==false).catch(error=>{console.error('Não foi possível salvar o termo de Google Imagens.',error);return false;});
    imageSearchTermRunner=runner;
    const saved=await runner;
    if(imageSearchTermRunner===runner)imageSearchTermRunner=null;
    if(!saved){pendingImageSearchTerm=pendingImageSearchTerm||draft;if(status){status.textContent='Não foi possível salvar; o texto foi mantido.';status.classList.add('error');}return false;}
    if(pendingImageSearchTerm?.offerKey===offerKey)return flushImageSearchTerm(offerKey);
    if(status){status.textContent='Salvo automaticamente.';status.classList.remove('error');}
    return true;
  }

  function selectedCapture() { return selectedCaptureId === ALL_CAPTURES ? allCaptures : state.captures.find(item => item.captureId === selectedCaptureId) || null; }
  function previousCapture(selected) {
    const index = state.captures.findIndex(item => item.captureId === selected?.captureId);
    return index >= 0 ? state.captures.slice(index + 1).find(item => item.listName === selected.listName) || null : null;
  }
  function metadataFor(item) { return state.offerMetadata.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,manualCountries:[]}; }
  function trendsFor(item) { return state.trends.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,assessments:[],keywordCandidates:[]}; }
  function imagesFor(item) { return state.images.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,searchTerm:item.offerName,assessments:[]}; }
  function decisionFor(item) { return state.decisions.find(record => record.offerKey === item.offerKey) || {offerKey:item.offerKey,currentStatus:DecisionUI.DEFAULT_DECISION,history:[]}; }
  function deliveryActionLabel(offerKey) { return (state.deliveries||[]).some(record=>record?.offerKey===offerKey) ? 'Abrir fluxo da entrega' : 'Iniciar entrega'; }
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
      glimpse:['A análise Glimpse é salva automaticamente após a colagem.','Análise Glimpse salva automaticamente'],
      images:['As classificações e candidatas de Imagens são salvas automaticamente em cada ação.','As avaliações de Google Imagens são salvas automaticamente'],
      history:['A aba Histórico é somente leitura.','Histórico somente leitura'],
    };
    const [description,label]=reasons[activeTab]||reasons.history;
    button.hidden=false;
    button.disabled=true;
    button.title=description;
    button.setAttribute('aria-label',label);
  }
  let trendsSave;
  let pendingMetadata={};
  function renderTrendResultButtons(item, latest) {
    TrendsUI.renderResultButtons($('#trendResults',root),trendsSave?.status(pendingTrendStatus||latest?.status||'')||'',status=>trendsSave.select(status));
  }
  function renderTrendSearchHistory(record) {
    const select=$('#trendSearchHistory',root);
    const history=(Array.isArray(record.searchHistory)?record.searchHistory:[])
      .filter(entry=>entry&&typeof entry.searchedAt==='string'&&Number.isFinite(Date.parse(entry.searchedAt))&&typeof entry.term==='string'&&entry.term.trim())
      .sort((a,b)=>String(b.searchedAt).localeCompare(String(a.searchedAt)));
    if(typeof record.lastSearchedAt==='string'&&Number.isFinite(Date.parse(record.lastSearchedAt))&&!history.some(entry=>entry.searchedAt===record.lastSearchedAt)){
      history.push({searchedAt:record.lastSearchedAt,term:''});
      history.sort((a,b)=>String(b.searchedAt).localeCompare(String(a.searchedAt)));
    }
    const seenLabels=new Set(),displayedHistory=history.filter(entry=>{
      const label=dateTime(entry.searchedAt);
      if(seenLabels.has(label))return false;
      seenLabels.add(label);
      return true;
    });
    select.innerHTML=displayedHistory.length?displayedHistory.map((entry,index)=>`<option value="${index}">${escape(dateTime(entry.searchedAt))}</option>`).join(''):'<option value=""></option>';
    select.disabled=!displayedHistory.length;
    select.value=displayedHistory.length?'0':'';
    select.onchange=()=>{
      const selected=displayedHistory[Number(select.value)];
      if(selected?.term)$('#trendsTerm',root).value=selected.term;
    };
  }
  function renderAffiliateLink(item) {
    const container=$('#affiliateLinkSection',root),link=metadataFor(item).affiliateLink||'';
    if(link&&!editingAffiliateLink){
      container.innerHTML=`<div class="affiliate-link-saved"><div class="affiliate-link-value"><span class="field-label">Link de afiliado</span><a href="${escape(link)}" target="_blank" rel="noopener noreferrer" title="${escape(link)}">${escape(link)}</a></div><button class="btn affiliate-link-copy" type="button" data-affiliate-copy aria-label="Copiar link de afiliado" title="Copiar link de afiliado"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg></button><button class="btn" type="button" data-affiliate-edit>Editar</button></div><div class="affiliate-link-message" id="affiliateLinkMessage" role="status" aria-live="polite"></div>`;
      return;
    }
    container.innerHTML=`<div class="affiliate-link-entry"><label><span class="field-label">Link de afiliado</span><input class="control" id="affiliateLinkInput" type="url" maxlength="4096" value="${escape(link)}" placeholder="Cole o link de afiliado" autocomplete="off" aria-label="Link de afiliado"></label><button class="btn primary" type="button" data-affiliate-save>${link?'Salvar alteração':'Salvar link'}</button>${link?'<button class="btn" type="button" data-affiliate-cancel>Cancelar</button>':''}</div><div class="affiliate-link-message" id="affiliateLinkMessage" role="status" aria-live="polite"></div>`;
  }
  function renderTable(selected, previous) {
    const query=$('#search',root).value.trim().toLocaleLowerCase();
    const visibility=$('#visibilityFilter',root).value || 'visible';
    let offers=(selected?.all ? selected.offers : captureOfferVariations(selected,state.captures)).map(item=>({...item,displayName:productNameFromOfferTitle(item.offerName,item.seller)}));
    offers=offers.filter(item=>!query||`${item.displayName} ${item.offerName} ${item.seller}`.toLocaleLowerCase().includes(query));
    offers=offers.filter(item=>visibility==='all'||(visibility==='hidden')===hiddenOffers.has(item.offerKey));
    const indexByOfferKey=records=>{
      const index=new Map();
      for(const record of records)if(!index.has(record.offerKey))index.set(record.offerKey,record);
      return index;
    };
    const metadataIndex=indexByOfferKey(state.offerMetadata),trendsIndex=indexByOfferKey(state.trends),imagesIndex=indexByOfferKey(state.images),decisionsIndex=indexByOfferKey(state.decisions);
    const metadataCache=new Map(),trendLatestCache=new Map(),imageProgressCache=new Map(),imageLatestCache=new Map(),glimpseCache=new Map();
    const tableMetadataFor=item=>{
      if(!metadataCache.has(item.offerKey))metadataCache.set(item.offerKey,metadataIndex.get(item.offerKey)||{offerKey:item.offerKey,manualCountries:[]});
      return metadataCache.get(item.offerKey);
    };
    const tableTrendsFor=item=>trendsIndex.get(item.offerKey)||{offerKey:item.offerKey,assessments:[],keywordCandidates:[]};
    const tableImagesFor=item=>imagesIndex.get(item.offerKey)||{offerKey:item.offerKey,searchTerm:item.offerName,assessments:[]};
    const tableDecisionFor=item=>decisionsIndex.get(item.offerKey)||{offerKey:item.offerKey,currentStatus:DecisionUI.DEFAULT_DECISION,history:[]};
    const tablePageTypeText=item=>salesPageTypeLabel(tableMetadataFor(item).salesPageType);
    const tableTrendLatest=item=>{
      if(!trendLatestCache.has(item.offerKey))trendLatestCache.set(item.offerKey,Trends.latestAssessment(tableTrendsFor(item).assessments));
      return trendLatestCache.get(item.offerKey);
    };
    const tableImageProgress=item=>{
      if(!imageProgressCache.has(item.offerKey))imageProgressCache.set(item.offerKey,Images.progress(tableImagesFor(item).assessments,tableMetadataFor(item).manualCountries||[]));
      return imageProgressCache.get(item.offerKey);
    };
    const tableImageLatest=progress=>{
      if(!imageLatestCache.has(progress)){
        let latest=null,latestAt='';
        for(const record of progress.latest.values()){
          const capturedAt=String(record.capturedAt||'');
          if(!latest||capturedAt.localeCompare(latestAt)>0){latest=record;latestAt=capturedAt;}
        }
        imageLatestCache.set(progress,latest);
      }
      return imageLatestCache.get(progress);
    };
    const latestGlimpseByProduct=new Map();
    for(const record of state.glimpse){
      const current=latestGlimpseByProduct.get(record.productKey);
      if(!current||String(record.capturedAt).localeCompare(String(current.capturedAt))>0)latestGlimpseByProduct.set(record.productKey,record);
    }
    const tableGlimpseFor=item=>{
      if(!glimpseCache.has(item.offerKey))glimpseCache.set(item.offerKey,latestGlimpseByProduct.get(Glimpse.normalize(item.offerName))||null);
      return glimpseCache.get(item.offerKey);
    };
    const trendRank=item=>({up:7,stable:6,down:5,low_volume:4,point_peak:3,inconclusive:2,no_data:1})[tableTrendLatest(item)?.status]||0;
    const imageRank=item=>{const progress=tableImageProgress(item);return progress.done*10+Images.resultRank(tableImageLatest(progress)?.status);};
    const glimpseRank=item=>Glimpse.analysisRank(tableGlimpseFor(item));
    const trendBadge=item=>{
      const latest=tableTrendLatest(item),statusClass=latest?.status||'unsearched',label=Trends.resultLabel(latest?.status),candidateMarker=KeywordCandidatesUI.keywordCandidateMarkerHtml(tableTrendsFor(item).keywordCandidates?.length||0,'positive');
      return `<button type="button" class="table-action trends-badge ${escape(statusClass)}" data-action="trends" data-key="${escape(item.offerKey)}" data-curation-focus="trends" title="Abrir Google Trends">${escape(label)}${candidateMarker}</button>`;
    };
    const glimpseBadge=item=>{
      const analysis=tableGlimpseFor(item);
      return `<button type="button" class="table-action glimpse-badge ${analysis?'saved':'unsearched'}" data-action="glimpse" data-key="${escape(item.offerKey)}" data-curation-focus="glimpse" title="${escape(analysis?'Última análise '+dateTime(analysis.capturedAt):'Abrir Glimpse')}">${escape(Glimpse.compactSummary(analysis))}</button>`;
    };
    const imageBadge=item=>{
      const progress=tableImageProgress(item),latest=tableImageLatest(progress),label=progress.total?`${progress.done} de ${progress.total}`:Images.resultLabel(latest?.status);
      const statusClass=latest?.status||(label==='Não verificado'?'unverified':'');
      const hasCandidates=clickBankImageCandidates(tableImagesFor(item)).length>0;
      const marker=KeywordCandidatesUI.keywordCandidateMarkerHtml(hasCandidates?1:0,'negative');
      return `<button type="button" class="table-action image-badge ${escape(statusClass)}" data-action="images" data-key="${escape(item.offerKey)}" data-curation-focus="images" title="Abrir Google Imagens">${escape(label)}${marker}</button>`;
    };
    const getSortValue=(item)=>sortKey==='decision'?DecisionUI.normalizeDecision(tableDecisionFor(item).currentStatus).toLocaleLowerCase():
        sortKey==='movement'?item.rankDelta??Number.NEGATIVE_INFINITY:
        sortKey==='rank'?item.rank:
        sortKey==='lastSeen'?collectionTime(latestCaptureByOffer.get(item.offerKey))??Number.NEGATIVE_INFINITY:
        sortKey==='future'?tablePageTypeText(item).toLocaleLowerCase():
        sortKey==='offerName'?item.displayName.toLocaleLowerCase():sortKey==='seller'?item.seller.toLocaleLowerCase():
        sortKey==='trends'?trendRank(item):sortKey==='glimpse'?glimpseRank(item):sortKey==='images'?imageRank(item):item[sortKey]?.value??Number.NEGATIVE_INFINITY;
    offers=offers.map(item=>({item,value:getSortValue(item)}));
    offers.sort((a,b)=>{
      const {value:left}=a,{value:right}=b,compare=typeof left==='string'?left.localeCompare(right):left-right;
      return sortDirection==='asc'?compare:-compare;
    });
    offers=offers.map(entry=>entry.item);
    $('#rows',root).innerHTML=offers.map(item=>`<tr data-offer="${escape(item.offerKey)}" class="${DecisionUI.rowClass(tableDecisionFor(item).currentStatus)}">
      <td class="number">${item.offerId
        ? `<a class="clickbank-rank-link" href="${escape(clickBankOfferDetailsUrl(item.offerId))}" target="_blank" rel="noopener noreferrer" title="Abrir detalhes da ClickBank para ${escape(item.offerName)}">#${escape(item.rank)}</a>`
        : `#${escape(item.rank)}`}</td><td class="offer-name hub-edit-host" title="${escape(item.offerName)}"><span>${escape(item.displayName)}</span><button type="button" class="hub-corner-edit" data-offer-visibility="${escape(item.offerKey)}" aria-label="${escape((hiddenOffers.has(item.offerKey)?'Reexibir':'Ocultar')+' '+item.displayName)}">${hiddenOffers.has(item.offerKey)?'Reexibir':'Ocultar'}</button></td><td>${escape(item.seller)}</td>
      <td>${trendBadge(item)}</td><td>${glimpseBadge(item)}</td><td>${imageBadge(item)}</td>
      <td class="number">${escape(metricText(item.average))}</td><td class="number">${escape(metricText(item.initial))}</td>
      <td class="page-type-cell">${escape(tablePageTypeText(item))}</td><td class="number">${escape(metricText(item.epc))}</td>
      <td class="number">${escape(metricText(item.cvr))}</td><td class="number">${escape(metricText(item.gravity))}</td>
      <td class="number ${movementClass(item)}" title="${escape(selected?.all ? item.movement==='new'?'Primeira e única aparição desta oferta no histórico salvo; não indica lançamento recente.':`Duas últimas aparições: #${item.priorRank} em ${dateTime(item.priorObservedAt)} → #${item.rank} em ${dateTime(item.observedAt)}. Última posição observada; recortes posteriores não indicam saída.` : item.movement==='new'?'Primeira aparição desta oferta no histórico até esta captura.':item.movement==='uncompared'?'Oferta já observada no histórico; sem posição na captura anterior comparável.':'Variação de posição em relação à captura anterior comparável.')}">${escape(movementLabel(item))}</td><td>${DecisionUI.buttonHtml(tableDecisionFor(item).currentStatus,'data-decision-key',escape(item.offerKey))}</td>${lastCollectionCell(latestCaptureByOffer.get(item.offerKey))}</tr>`).join('');
    const decisionLabels=new Map(state.decisions.map(record=>[record.offerKey,[DecisionUI.pageClassificationLabel(record.pageClassification)===DecisionUI.normalizeDecision(record.currentStatus)?'':DecisionUI.pageClassificationLabel(record.pageClassification),DecisionUI.marketScopeLabel(record.marketScope)].filter(Boolean)]));
    for(const button of $$($('#rows',root),'[data-decision-key]')){
      const labels=decisionLabels.get(button.dataset.decisionKey)||[];
      if(labels.length)button.textContent=button.textContent+' · '+labels.join(' · ');
    }
    columns.apply();
    $('#empty',root).classList.toggle('hidden',offers.length>0);
    $('#empty',root).textContent=selected?'Nenhuma oferta corresponde aos filtros.':'Cole a primeira captura Top Offers da ClickBank para começar.';
    $$ (root,'[data-sort]').forEach(button=>{
      button.classList.toggle('active',button.dataset.sort===sortKey);
      button.setAttribute('aria-sort',button.dataset.sort===sortKey?(sortDirection==='asc'?'ascending':'descending'):'none');
      button.onclick=()=>{const key=button.dataset.sort;if(!SORT_KEYS.has(key))return;if(sortKey===key)sortDirection=sortDirection==='asc'?'desc':'asc';else{sortKey=key;sortDirection=key==='rank'?'asc':'desc';}persistSortPreference();renderTable(selected,previous)};
    });
  }

  function renderTrends(item) {
    const record=trendsFor(item),latest=trendPageState(record,Trends.latestAssessment(record.assessments)),metadata=metadataFor(item),countries=metadata.manualCountries||[],selected=new Set(latest?.countries||[]);
    const dtcCountries=new Set(metadata.dtcCountryCapture?.countries||[]);
    const offerLink=$('#openClickBankOffer',root),offerUnavailable=$('#clickBankOfferUnavailable',root),offerUrl=clickBankOfferDetailsUrl(item.offerId);
    if(offerUrl){offerLink.href=offerUrl;offerLink.setAttribute('aria-label',`Abrir detalhes ClickBank para ${item.offerName}`);offerLink.classList.remove('hidden');offerUnavailable.classList.add('hidden');}
    else{offerLink.removeAttribute?.('href');offerLink.classList.add('hidden');offerUnavailable.classList.remove('hidden');}
    $('#trendsTerm',root).value=String(metadata.canonicalProductName||'').trim()||latest?.searchTerm||item.offerName;
    renderCanonicalProductNameStatus(item);
    renderCommissionButton(item,metadata);
    renderTrendSearchHistory(record);
    $('#trendCountries',root).innerHTML=countries.length?countries.map(code=>{
      const isSelected=selected.has(code),isDtc=dtcCountries.has(code);
      const button='<button type="button" class="trends-country-action '+(isSelected?'selected':'')+'" data-country="'+escape(code)+'" aria-pressed="'+isSelected+'">'+escape(Trends.locationLabel(code))+' · '+(isDtc?'DTC':'manual')+'</button>';
      return isDtc?button:'<span class="trends-manual-country-chip '+(isSelected?'selected':'')+'">'+button+'<button type="button" class="trends-country-remove" data-country-remove="'+escape(code)+'" aria-label="Remover país manual '+escape(code)+'" title="Remover país manual '+escape(code)+'">×</button></span>';
    }).join(''):'<span class="sub">Nenhum país adicionado ainda.</span>';
    renderCampaignCountryHandoff();
    pendingProductAge=latest?.productAge||pendingProductAge;
    TrendsUI.renderProductAgeButtons($('#productAgeActions',root),pendingProductAge,value=>{
      pendingProductAge=value;
      $$ (root,'[data-trends-product-age]').forEach(button=>{button.classList.toggle('selected',button.dataset.trendsProductAge===value);button.setAttribute('aria-pressed',String(button.dataset.trendsProductAge===value))});
    });
    const salesPageType=(Object.hasOwn(pendingMetadata,'salesPageType')?pendingMetadata.salesPageType:metadata.salesPageType)||null,salesPageTypeActions=$('#salesPageTypeActions',root);
    salesPageTypeActions.innerHTML=[...SALES_PAGE_TYPES.map(value=>({value,label:value.toUpperCase()})),{value:'',label:'Não definido'}].map(({value,label})=>
      `<button type="button" class="trends-country-action ${salesPageType===value||(!salesPageType&&!value)?'selected':''}" data-sales-page-type="${value}" aria-pressed="${salesPageType===value||(!salesPageType&&!value)}">${label}</button>`
    ).join('');
    function selectMetadata(attr,field,value) {
      pendingMetadata[field]=value;
      $$ (root,'['+attr+']').forEach(control=>{
        const selected=(control.getAttribute(attr)||null)===value;
        control.classList.toggle('selected',selected);control.setAttribute('aria-pressed',String(selected));
      });
      trendsSave.schedule();
    }
    $$ (root,'[data-sales-page-type]').forEach(button=>{
      button.onclick=()=>selectMetadata('data-sales-page-type','salesPageType',button.dataset.salesPageType||null);
    });
    const brandBidding=(Object.hasOwn(pendingMetadata,'brandBidding')?pendingMetadata.brandBidding:metadata.brandBidding)||null;
    $('#brandBiddingActions',root).innerHTML=[...BRAND_BIDDING_TYPES,null].map(value=>
      `<button type="button" class="trends-country-action ${brandBidding===value?'selected':''}" data-brand-bidding="${value || ''}" aria-pressed="${brandBidding===value}">${brandBiddingLabel(value)}</button>`
    ).join('');
    $$ (root,'[data-brand-bidding]').forEach(button=>{
      button.onclick=()=>selectMetadata('data-brand-bidding','brandBidding',button.dataset.brandBidding||null);
    });
    renderTrendResultButtons(item,latest);
    const trendCandidates=record.keywordCandidates||[],trendCandidateList=$('#trendCandidates',root),candidateCount=trendCandidates.length;
    $('#trendCandidateCount',root).textContent=`${candidateCount} termo${candidateCount===1?'':'s'}`;
    KeywordCandidatesUI.renderKeywordCandidates(trendCandidateList,{
      candidates:trendCandidates,variant:'positive',searchContext:'Google Trends',showRemoveForSaved:true,
      emptyText:'Nenhuma candidata positiva salva ainda.',
      onSearch:term=>actions.openTrends(term),onRemove:(_candidate,index)=>actions.removeTrendCandidate(item.offerKey,index),
      onEdit:(candidate,index,button)=>openTrendCandidateEdit(item.offerKey,candidate,index,button),
    });
    renderAffiliateLink(item);
    $('#trendsHistory',root).innerHTML=(record.assessments||[]).slice().reverse().map(entry=>`<div class="history-row"><span>${escape(dateTime(entry.capturedAt))}</span><b>${escape(Trends.resultLabel(entry.status))}</b><span>${escape([entry.searchTerm,(entry.countries||[]).map(Trends.locationLabel).join(', '),entry.productAge==='new'?'Produto novo':entry.productAge==='old'?'Produto antigo':''].filter(Boolean).join(' · '))}</span></div>`).join('')||'<p class="sub">Sem avaliações de Google Trends.</p>';
  }

  function renderCanonicalProductNameStatus(item,{saving=false}={}) {
    const node=$('#canonicalProductNameStatus',root);
    if(!node)return;
    if(saving){node.dataset.state='saving';node.textContent='Salvando nome do produto…';return;}
    const name=String(metadataFor(item).canonicalProductName||'').trim();
    node.dataset.state=name?'saved':'empty';
    node.textContent=name
      ? `✓ Nome do produto salvo: ${name}. “Iniciar entrega” levará este nome para a campanha e para o campo Produto da Ficha e Pre-Sell.`
      : 'Nome ainda não definido. Defina-o pelo termo de pesquisa para usá-lo na campanha e no campo Produto da Ficha e Pre-Sell.';
  }

  function renderCommissionButton(item,metadata=metadataFor(item)) {
    const button=$('#clickbankCommissionButton',root);if(!button)return;
    const amount=commissionUsdForOffer(item,metadata);
    const manuallySaved=isClickBankCommissionUsd(Number(metadata.commissionUsd));
    button.dataset.state=manuallySaved?'saved':amount!==null?'captured':'missing';
    button.textContent=amount!==null?'Comissão ClickBank · '+formatClickBankCommissionUsd(amount):'Definir comissão ClickBank · USD';
    button.title=manuallySaved?'Comissão manual salva para esta oferta.':amount!==null?'Valor obtido da coluna Initial $ da captura ClickBank.':'A captura não trouxe um valor válido em Initial $. Clique para informar a comissão.';
    button.onclick=()=>openClickBankCommissionDialog(item);
  }

  function openClickBankCommissionDialog(item=activeOffer()) {
    if(!item||!commissionDialog)return false;
    commissionDialog.dataset.offerKey=item.offerKey;
    const metadata=metadataFor(item),amount=commissionUsdForOffer(item,metadata),manuallySaved=isClickBankCommissionUsd(Number(metadata.commissionUsd));
    commissionInput.value=amount!==null?String(amount):'';
    if(commissionDescription)commissionDescription.textContent=manuallySaved
      ? 'Comissão manual salva para esta oferta. Edite e salve para substituí-la.'
      : amount!==null
        ? 'Valor preenchido da coluna Initial $ da captura ClickBank. Salvar fixa uma comissão manual para esta oferta.'
        : 'A captura não trouxe um valor válido em Initial $. Informe a comissão da oferta em dólares americanos.';
    commissionMessage.textContent='';
    commissionDialog.showModal();
    commissionInput.focus({preventScroll:true});
    return true;
  }

  async function submitClickBankCommission(event) {
    event.preventDefault();
    const offerKey=commissionDialog.dataset.offerKey;
    const value=commissionInput.value.trim();
    commissionSave.disabled=true;commissionMessage.textContent='';
    try {
      const saved=await actions.saveCommissionUsd?.(offerKey,value);
      if(!saved||!isClickBankCommissionUsd(Number(saved.commissionUsd)))throw new Error('A comissão não foi salva. Confira o valor em USD.');
      if(commissionDialog.open)commissionDialog.close();
      const item=state.captures.flatMap(capture=>capture.offers||[]).find(offer=>offer.offerKey===offerKey);
      if(item)renderCommissionButton(item,saved);
      showMessage('Comissão ClickBank salva em USD. “Iniciar entrega” levará esse valor para a tela de criação de campanha.');
    } catch(error) {
      commissionMessage.textContent=error?.message||'Não foi possível salvar a comissão ClickBank.';
    } finally {commissionSave.disabled=false;}
  }

  function renderCampaignCountryHandoff() {
    const node=$('#campaignCountryHandoff',root);
    if(!node)return;
    const selected=$$ (root,'#trendCountries [data-country].selected').map(button=>button.dataset.country);
    node.dataset.state=selected.length?'selected':'empty';
    node.textContent=selected.length
      ? 'Países de destino selecionados: '+selected.join(', ')+'. Marque em verde pelo menos um país; essa seleção será salva na entrega e usada em “Países alvo” da campanha.'
      : 'Obrigatório para iniciar a entrega: adicione ou selecione pelo menos um país e marque-o em verde. Ele será usado como país de destino da campanha.';
  }

  function openTrendCandidateEdit(offerKey,candidate,index,trigger) {
    editingKeywordCandidate={type:'trends',offerKey,index};
    candidateEditTrigger=trigger;
    candidateEditInput.value=candidate;
    $('#trendCandidateEditDescription',root).textContent='Atualize a candidata positiva salva para esta oferta.';
    candidateEditMessage.textContent='';
    candidateEditDialog.showModal();
    candidateEditInput.focus({preventScroll:true});
    candidateEditInput.select();
  }

  function openImageCandidateEdit(offerKey,candidate,index,trigger) {
    editingKeywordCandidate={type:'images',offerKey,index};
    candidateEditTrigger=trigger;
    candidateEditInput.value=candidate;
    $('#trendCandidateEditDescription',root).textContent='Atualize a candidata negativa salva para toda esta oferta.';
    candidateEditMessage.textContent='';
    candidateEditDialog.showModal();
    candidateEditInput.focus({preventScroll:true});
    candidateEditInput.select();
  }

  function closeTrendCandidateEdit({restoreFocus=true}={}) {
    if(candidateEditDialog.open)candidateEditDialog.close();
    const trigger=candidateEditTrigger;
    editingKeywordCandidate=null;
    candidateEditTrigger=null;
    if(restoreFocus)trigger?.focus?.({preventScroll:true});
  }

  async function submitTrendCandidateEdit() {
    if(!editingKeywordCandidate)return;
    const {type,offerKey,index}=editingKeywordCandidate;
    const value=candidateEditInput.value.trim();
    candidateEditMessage.textContent='';
    candidateEditSave.disabled=true;
    try {
      const saved=type==='images'
        ? await actions.editImageCandidate(offerKey,index,value)
        : await actions.editTrendCandidate(offerKey,index,value);
      if(!saved){candidateEditMessage.textContent=$('#sheetMessage',root).textContent||'Não foi possível atualizar a candidata. Revise o texto e tente novamente.';return;}
      closeTrendCandidateEdit({restoreFocus:false});
      if(type==='images'){
        root.querySelector(`#imageCandidateList [data-keyword-candidate-edit="${index}"]`)?.focus?.({preventScroll:true});
      } else root.querySelector(`#trendCandidates [data-keyword-candidate-edit="${index}"]`)?.focus?.({preventScroll:true});
    } catch {
      candidateEditMessage.textContent='Não foi possível atualizar a candidata. Tente novamente.';
    } finally {
      candidateEditSave.disabled=false;
    }
  }

  function renderImages(item) {
    const record=imagesFor(item),metadata=metadataFor(item),countries=metadata.manualCountries||[],productName=String(metadata.canonicalProductName||'').trim(),latest=Images.latestByCountry(record.assessments||[]),candidates=clickBankImageCandidates(record);
    const progress=Images.progress(record.assessments||[],countries);
    $('#imagesMessage',root).textContent=countries.length?`${progress.done} de ${progress.total} países verificados.`:'Não há países para pesquisar. Adicione países manualmente na aba Google Trends.';
    $('#imageCountries',root).innerHTML=countries.map(country=>{
      const assessment=latest.get(country),statusLabel=Images.resultLabel(assessment?.status);
      return `<article class="card image-country-card"><div class="image-country-head"><div class="image-country-title"><h2>${escape(country)}</h2><small class="manual-country-label">Manual</small><span class="sheet-status ${assessment?'ok':''}">${escape(statusLabel)}</span></div><button class="btn primary image-search-button" type="button" data-image-search="${escape(country)}" title="Pesquisar neste país, excluindo as candidatas negativas globais">Pesquisar imagens</button></div><div class="image-result-actions" data-image-actions="${escape(country)}"></div><div class="image-candidate-summary"><div class="image-candidate-summary-head"><b>Avaliar duas dobras com IA</b><p>Registre o resultado visual deste país. As candidatas negativas ficam na lista única da oferta.</p></div></div></article>`;
    }).join('')||'<p class="sub">Nenhum país para validar. Adicione países na aba Google Trends.</p>';
    const candidateCountLabel=`${candidates.length} termo${candidates.length===1?'':'s'}`;
    $('#imageCandidateCount',root).textContent=`${candidateCountLabel} salvo${candidates.length===1?'':'s'}`;
    KeywordCandidatesUI.renderKeywordCandidates($('#imageCandidateList',root),{candidates,variant:'negative',saved:true,showRemoveForSaved:true,emptyText:'Nenhuma candidata negativa salva para esta oferta.',onEdit:(candidate,index,button)=>openImageCandidateEdit(item.offerKey,candidate,index,button),onRemove:(_candidate,index)=>void actions.removeImageCandidate(item.offerKey,index)});
    const firstImageHeader=$('#imageCountries .image-candidate-summary-head',root);
    if(firstImageHeader){const slot=document.createElement('div');slot.className='image-search-term-slot';slot.dataset.imageSearchTermSlot='';firstImageHeader.append(slot);}
    const imageTermSlot=$('#imageCountries [data-image-search-term-slot]',root);
    if(imageTermSlot)imageTermSlot.append(imageSearchTermField,imageSearchTermStatus);
    else imageValidationIntro.append(imageSearchTermField,imageSearchTermStatus);
    imageSearchTermInput.value=pendingImageSearchTerm?.offerKey===item.offerKey?pendingImageSearchTerm.term:(record.searchTerm||item.offerName);
    $$ (root,'.image-candidate-summary-head').forEach(header=>{
      const country=header.closest('.image-country-card')?.querySelector('[data-image-search]')?.dataset.imageSearch;
      if(!country)return;
      const termSlot=header.querySelector('[data-image-search-term-slot]');
      if(!productName){const note=document.createElement('span');note.className='image-google-search-note';note.textContent='Defina o nome do produto para gerar a busca.';if(termSlot)header.insertBefore(note,termSlot);else header.append(note);return;}
      const link=document.createElement('a');link.className='image-google-search-link';link.href=Images.googleSearchUrl(productName,country);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Pesquisar no Google';link.setAttribute('aria-label',`Pesquisar ${productName} no Google em ${country}`);if(termSlot)header.insertBefore(link,termSlot);else header.append(link);
    });
    $$ (root,'[data-image-actions]').forEach(container=>{
      const country=container.dataset.imageActions,assessment=latest.get(country);
      ImagesUI.renderImageResultButtons(container,{country,selectedValue:assessment?.status||'',onSelect:(selectedCountry,status)=>{
        actions.saveImage(item.offerKey,selectedCountry,status);
      }});
    });
    $('#imagesHistory',root).innerHTML=(record.assessments||[]).slice().reverse().map(entry=>`<div class="history-row"><span>${escape(dateTime(entry.capturedAt))}</span><b>${escape(entry.country)} · ${escape(Images.resultLabel(entry.status))}</b><span>${escape([entry.searchTerm||item.offerName,(entry.negativeKeywordCandidates||entry.relatedProducts||[]).length?'Negativas: '+(entry.negativeKeywordCandidates||entry.relatedProducts).join(', '):''].filter(Boolean).join(' · '))}</span></div>`).join('')||'<p class="sub">Sem avaliações de Google Imagens.</p>';
  }

  function renderSheet() {
    const item=activeOffer();if(!item)return;
    const deliveryButton=$('#startCampaignDelivery',root);
    if(deliveryButton){deliveryButton.textContent=deliveryActionLabel(item.offerKey);deliveryButton.setAttribute('aria-label',`${deliveryButton.textContent} para ${item.offerName}`);}
    $('#sheetTitle',root).textContent=item.offerName;
    $('#sheetMeta',root).textContent=`${item.seller} · Posição ${item.rank} · Captura ClickBank`;
    $$(sheet,'[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===activeTab));
    $$(sheet,'[data-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.panel!==activeTab));
    renderTrends(item);renderImages(item);
    $('#allTrendsHistory',root).innerHTML=$('#trendsHistory',root).innerHTML;
    $('#allImagesHistory',root).innerHTML=$('#imagesHistory',root).innerHTML;
    if(activeTab==='glimpse')actions.openGlimpse(item);
    trendsSave?.restore();updateSheetSaveButton();trendsSave?.sync();
  }
  function openSheet(item,tab='trends') {
    trendsSave?.reset();pendingMetadata={};if(!Object.hasOwn(metadataFor(item),'brandBidding'))pendingMetadata.brandBidding='no_brand_bidding';activeOfferKey=item.offerKey;activeTab=tab;pendingProductAge=Trends.latestAssessment(trendsFor(item).assessments)?.productAge||'';pendingTrendStatus='';editingAffiliateLink=false;
    $('#trendMessage',root).textContent='';$('#trendMessage',root).classList.remove('error');
    sheet.classList.remove('hidden');renderSheet();
    sheet.scrollTop=0;
    $('#sheetMessage',root).textContent='';$('#sheetMessage',root).classList.remove('error');
  }
  function closeSheet() { trendsSave.reset();pendingMetadata={};sheet.classList.add('hidden');activeOfferKey='';actions.restoreListFocus?.(); }
  function switchTab(tab) { activeTab=tab;renderSheet(); }

  function render(nextState=state) {
    state={...state,...nextState};
    latestCaptureByOffer=latestCollectionIndex(state.captures,item=>item.offerKey);
    state.captures=[...state.captures].sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)));
    allCaptures=state.captures.length ? {captureId:ALL_CAPTURES,all:true,offers:allCaptureOfferVariations(state.captures)} : null;
    if(selectedCaptureId!==ALL_CAPTURES&&!state.captures.some(item=>item.captureId===selectedCaptureId))selectedCaptureId=ALL_CAPTURES;
    const selected=selectedCapture(),previous=previousCapture(selected);
    $('#captureSelect',root).innerHTML=`<option value="${ALL_CAPTURES}">Todas as capturas · ${allCaptures?.offers.length||0} ofertas únicas</option>`+state.captures.map(item=>`<option value="${escape(item.captureId)}">${escape(dateTime(item.capturedAt))} · ${escape(item.offers.length)} ofertas · posições ${escape(item.page.start??'—')}–${escape(item.page.end??'—')}</option>`).join('');
    $('#captureSelect',root).value=selectedCaptureId;$('#captureSelect',root).disabled=state.captures.length===0;
    const resultCount=$('#captureResultCount',root),hasResultCount=selected?.page?.total!=null;
    resultCount.textContent=selected?.all?'Últimas posições observadas':hasResultCount?`${new Intl.NumberFormat('pt-BR').format(Number(selected.page.total))} resultados${selected.page.completeUniverse?' · Lista completa':''}`:'';
    resultCount.title=selected?.all?'Uma linha por oferta. Variação entre as duas últimas aparições; capturas de outras faixas não removem ofertas.':'';
    resultCount.hidden=!selected?.all&&!hasResultCount;
    $('#offerCountLabel',root).textContent=selectedCaptureId===ALL_CAPTURES?'Ofertas no histórico':'Ofertas na captura';
    $('#captureCount',root).textContent=String(state.captures.length);$('#offerCount',root).textContent=String(selected?.offers.length||0);
    const compared=selected?.all?selected.offers:selected&&previous?compareCapturedOffers(selected.offers,previous.offers):[],moved=compared.filter(item=>item.movement==='up'||item.movement==='down').length;
    $('#movementCount',root).textContent=selected?.all||previous?String(moved):'—';renderTable(selected,previous);
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
  $$ (root,'[data-close-candidate-edit],[data-cancel-candidate-edit]').forEach(button=>button.onclick=()=>closeTrendCandidateEdit());
  candidateEditSave.onclick=submitTrendCandidateEdit;
  candidateEditDialog.addEventListener('cancel',event=>{event.preventDefault();closeTrendCandidateEdit();});
  candidateEditInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitTrendCandidateEdit();}});
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
  commissionForm.addEventListener('submit',submitClickBankCommission);
  $$ (root,'[data-close-commission],[data-cancel-commission]').forEach(button=>button.onclick=()=>{if(commissionDialog.open)commissionDialog.close();});
  commissionDialog.addEventListener('cancel',event=>{event.preventDefault();if(commissionDialog.open)commissionDialog.close();});
    $('#startCampaignDelivery',root).onclick=async()=>{
      const item=activeOffer(),button=$('#startCampaignDelivery',root);if(!item||button.disabled)return;
      const status=$('#sheetMessage',root);
      status.textContent='';status.classList.remove('error');button.disabled=true;
      try{
        if(!await flushImageSearchTerm(item.offerKey)){
          status.textContent='Não foi possível salvar o termo de Google Imagens. Confira o campo e tente novamente.';
          status.classList.add('error');
          return;
        }
        if(activeTab!=='trends')switchTab('trends');
        if(!await trendsSave.flush()){
          status.textContent='Não foi possível salvar a seleção de países. Confira a mensagem de Trends e tente novamente.';
          status.classList.add('error');
          return;
        }
        await actions.startCampaignDelivery?.(item);
      }catch{
        status.textContent='Não foi possível salvar os GEOs e preparar a entrega da campanha.';
        status.classList.add('error');
      }finally{button.disabled=false;}
    };
  trendsSave=mountTrendsSaveAction({
    button:$('#saveSheetButton',root),scope:$('[data-panel="trends"]',root),disableWhenClean:true,watch:'#trendsTerm',clickWatch:'[data-country],[data-trends-product-age],[data-sales-page-type],[data-brand-bidding]',
    getContext:()=>{const item=activeOffer();return {
      tab:sheet.classList.contains('hidden')?'':activeTab,offerKey:item?.offerKey,
      previous:item?trendLatest(item):null,
      draft:{status:$('#trendResults [data-trends-result].selected',root)?.dataset.trendsResult||(item?trendLatest(item)?.status:'')||'',
        term:$('#trendsTerm',root).value.trim()||item?.offerName||'',
        countries:$$ (root,'#trendCountries [data-country].selected').map(button=>button.dataset.country),
        productAge:$('#productAgeActions [data-trends-product-age].selected',root)?.dataset.trendsProductAge||'',metadataPatch:{...pendingMetadata}}};},
    isUnchanged:context=>sameTrendAssessment(context.previous,context.draft)&&Object.entries(context.draft.metadataPatch).every(([field,value])=>(metadataFor(activeOffer())[field]||null)===value),
    persist:(key,status,draft)=>actions.saveTrend(key,status,draft),
    feedback:message=>{const node=$('#trendMessage',root);node.textContent=message;node.classList.toggle('error',/^Não foi possível/.test(message));}
  });
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
    if(decisionButton){const item=selectedCapture()?.offers.find(offer=>offer.offerKey===decisionButton.dataset.decisionKey);if(!item)return;const current=decisionFor(item);DecisionUI.openDecisionPicker({title:item.offerName,currentValue:current.currentStatus,allowNotes:true,notes:current.notes||'',allowPageClassification:true,pageClassification:current.pageClassification,allowMarketScope:true,marketScope:current.marketScope,onSelect:(status,notes,pageClassification,marketScope)=>actions.saveDecision(item.offerKey,status,notes,pageClassification,marketScope),onStartDelivery:()=>actions.startCampaignDelivery?.(item),startDeliveryLabel:deliveryActionLabel(item.offerKey)});return;}
    const button=event.target.closest('[data-action]');if(!button)return;const item=selectedCapture()?.offers.find(offer=>offer.offerKey===button.dataset.key);if(item)openSheet(item,button.dataset.action);
  });
  $('#openTrends',root).onclick=()=>actions.openTrends($('#trendsTerm',root).value.trim()||activeOffer()?.offerName||'');
  $('#defineProductName',root).onclick=async event=>{
    const item=activeOffer(),input=$('#trendsTerm',root),button=event.currentTarget,value=input.value.trim();
    if(!item||button.disabled)return;
    if(!value){view.showMessage('Digite no termo de pesquisa o nome que deseja definir para o produto.',{error:true});input.focus();return;}
    if(value.length>200){view.showMessage('O nome do produto pode ter até 200 caracteres.',{error:true});input.focus();return;}
    button.disabled=true;
    const originalLabel=button.textContent;
    button.textContent='Salvando…';
    renderCanonicalProductNameStatus(item,{saving:true});
    try{
      const saved=await actions.saveCanonicalProductName(item.offerKey,value);
      if(!saved||saved.offerKey!==item.offerKey||saved.canonicalProductName!==value)throw new Error('O armazenamento não confirmou o nome do produto.');
      state.offerMetadata=[...state.offerMetadata.filter(record=>record.offerKey!==item.offerKey),saved];
      input.value=saved.canonicalProductName;
      renderCanonicalProductNameStatus(item);
      view.showMessage(`✓ Nome do produto salvo: ${value}. “Iniciar entrega” usará esse nome na campanha e na Ficha e Pre-Sell.`);
    }catch(error){
      renderCanonicalProductNameStatus(item);
      view.showMessage(error?.message||'Não foi possível salvar o nome do produto. Os dados anteriores foram preservados.',{error:true});
    }finally{button.disabled=false;button.textContent=originalLabel;}
  };
  async function submitTrendCandidates() {
    const input=$('#trendCandidate',root),button=$('#addTrendCandidates',root);
    const terms=input.value.split(/\r?\n/u).map(term=>term.trim()).filter(Boolean);
    if(!terms.length){view.showMessage('Cole pelo menos uma candidata, uma por linha.');input.focus();return;}
    button.disabled=true;
    try {
      const result=await actions.addTrendCandidates(activeOfferKey,terms);
      if(result?.ok){const fresh=$('#trendCandidate',root);fresh.value='';fresh.focus();}
    } catch {
      view.showMessage('Não foi possível salvar as candidatas. Tente novamente.',{error:true});
    } finally {
      button.disabled=false;
    }
  }
  $('#addTrendCandidates',root).onclick=submitTrendCandidates;
  $('#trendCandidate',root).addEventListener('keydown',event=>{
    if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submitTrendCandidates();}
  });
  async function submitAffiliateLink() {
    const input=$('#affiliateLinkInput',root),button=$('[data-affiliate-save]',root),message=$('#affiliateLinkMessage',root);
    if(!input||!button||!activeOffer())return;
    message.textContent='';message.classList.remove('error');button.disabled=true;
    try {
      await actions.saveAffiliateLink(activeOfferKey,input.value);
      editingAffiliateLink=false;
      renderAffiliateLink(activeOffer());
      const freshMessage=$('#affiliateLinkMessage',root);freshMessage.textContent='Link de afiliado salvo.';
    } catch(error) {
      message.textContent=error?.message||'Não foi possível salvar o link de afiliado.';
      message.classList.add('error');button.disabled=false;
    }
  }
  $('#affiliateLinkSection',root).addEventListener('click',async event=>{
    const edit=event.target.closest('[data-affiliate-edit]');
    if(edit){editingAffiliateLink=true;renderAffiliateLink(activeOffer());$('#affiliateLinkInput',root)?.focus();return;}
    const cancel=event.target.closest('[data-affiliate-cancel]');
    if(cancel){editingAffiliateLink=false;renderAffiliateLink(activeOffer());return;}
    const save=event.target.closest('[data-affiliate-save]');
    if(save){await submitAffiliateLink();return;}
    const copy=event.target.closest('[data-affiliate-copy]');
    if(copy){
      const item=activeOffer(),link=item&&metadataFor(item).affiliateLink;
      if(!link)return;
      const message=$('#affiliateLinkMessage',root);
      try {
        const clipboard=root.ownerDocument.defaultView?.navigator?.clipboard;
        if(!clipboard?.writeText)throw new Error('A cópia não está disponível neste navegador.');
        await clipboard.writeText(link);
        message.textContent='Link de afiliado copiado.';
        message.classList.remove('error');
      } catch(error) {
        message.textContent=error?.message||'Não foi possível copiar. Selecione o link e copie manualmente.';
        message.classList.add('error');
      }
    }
  });
  $('#affiliateLinkSection',root).addEventListener('keydown',event=>{
    if(event.key==='Enter'&&event.target.closest('#affiliateLinkInput')){event.preventDefault();void submitAffiliateLink();}
  });
  $('#trendCountries',root).addEventListener('click',async event=>{
    const remove=event.target.closest('[data-country-remove]');
    if(remove){
      event.preventDefault?.();event.stopPropagation?.();
      const item=activeOffer(),code=remove.dataset.countryRemove;
      if(!item||!code||!actions.removeManualCountry)return;
      remove.disabled=true;
      try {
        if(!await actions.removeManualCountry(item.offerKey,code))remove.disabled=false;
      } catch {
        remove.disabled=false;
        $('#trendMessage',root).textContent='Não foi possível remover o país manual. Tente novamente.';
        $('#trendMessage',root).classList.add('error');
      }
      return;
    }
    const button=event.target.closest('[data-country]');if(!button)return;
    const selected=$$ (root,'#trendCountries [data-country].selected');
    if(!button.classList.contains('selected')&&selected.length>=5){$('#trendMessage',root).textContent='É possível registrar até cinco países por avaliação.';return;}
    button.classList.toggle('selected');button.setAttribute('aria-pressed',String(button.classList.contains('selected')));button.closest('.trends-manual-country-chip')?.classList.toggle('selected',button.classList.contains('selected'));$('#trendMessage',root).textContent='Alterações pendentes…';renderCampaignCountryHandoff();
  });
  async function submitManualCountry() {
    const input=$('#manualCountry',root),item=activeOffer();if(!item)return;
    const code=input.value.trim().toUpperCase();if(await actions.addManualCountry(item.offerKey,code)){const fresh=$('#manualCountry',root);fresh.value='';$('#manualCountryMessage',root).textContent=`${code} foi adicionado e ficará separado da captura original.`;}
  }
  $('#addManualCountry',root).onclick=submitManualCountry;
  $('#manualCountry',root).onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();submitManualCountry();}};
  $('#imageCountries',root).addEventListener('click',async event=>{
    const item=activeOffer();if(!item)return;
    const search=event.target.closest('[data-image-search]');if(search){const term=$('#imagesTerm',root).value.trim()||item.offerName;if(await flushImageSearchTerm(item.offerKey))actions.openImages(term,search.dataset.imageSearch);return;}
  });
  $('#imagesTerm',root).addEventListener('input',()=>{const item=activeOffer();if(!item)return;pendingImageSearchTerm={offerKey:item.offerKey,term:$('#imagesTerm',root).value};const status=$('#imagesTermStatus',root);if(status){status.textContent='Salvando…';status.classList.remove('error');}if(imageSearchTermTimer)clearTimeout(imageSearchTermTimer);imageSearchTermTimer=setTimeout(()=>{imageSearchTermTimer=null;void flushImageSearchTerm(item.offerKey);},450);});
  $('#imagesTerm',root).addEventListener('change',()=>{if(activeOffer())void flushImageSearchTerm(activeOfferKey);});

  return {
    render,
    openOffer(offerKey,tab='trends'){
      const item=state.captures.flatMap(capture=>capture.offers||[]).find(offer=>offer.offerKey===offerKey);
      if(!item)return false;
      openSheet(item,tab);return true;
    },
    focusCampaignCountries(offerKey){
      if(activeOfferKey!==offerKey)this.openOffer(offerKey,'trends');
      else if(activeTab!=='trends')switchTab('trends');
      const target=$('#trendCountries [data-country]:not(.selected)',root)||$('#manualCountry',root);
      target?.focus?.({preventScroll:true});
      target?.scrollIntoView?.({block:'center',behavior:'smooth'});
      return Boolean(target);
    },
    openCommissionDialog(){return openClickBankCommissionDialog();},
    selectCapture(captureId,{preserveAll=false}={}){if(!preserveAll||selectedCaptureId!==ALL_CAPTURES)selectedCaptureId=captureId;render();},
    showImportPreview,
    prepareImport(raw) { paste.value=raw;if(!importDialog.open)openImport();else paste.focus(); },
    closeImport,
    showMessage(message,{error=false,headerOnly=false}={}){
      trendsSave?.report(message,{error});
      if(headerOnly&&!error){const element=$('#sheetMessage',root);element.textContent='';element.classList.remove('error');return;}
      for(const id of ['message','sheetMessage']){const element=$('#'+id,root);element.textContent=message;element.classList.toggle('error',error);}
    },
    updateTrendSearchHistory(record){if(activeOfferKey===record.offerKey)renderTrendSearchHistory(record);},
    returnFromGlimpse(){if(activeOfferKey)switchTab('trends');},
    getActiveOfferKey(){return activeOfferKey;},
  };
}

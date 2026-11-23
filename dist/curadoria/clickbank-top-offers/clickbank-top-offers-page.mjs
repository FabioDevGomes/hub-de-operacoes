import * as Domain from './clickbank-top-offers-domain.mjs?v=6';
import {termosNegativosParaEntrega} from './entrega-termos-lab.mjs';
import * as Storage from './clickbank-top-offers-storage.mjs?v=17';
import {mountClickBankTopOffersView} from './clickbank-top-offers-view.mjs?v=71';
import {mountExtensionCapture} from './extension-capture.mjs?v=7';
import {mergeDtcCountries,removeManualCountry as removeManualCountryMetadata} from './dtc-country-capture.mjs?v=6';
import {withSalesPageType} from './sales-page-type.mjs?v=3';
import {brandBiddingLabel} from './brand-bidding.mjs?v=1';
import * as Trends from '../trends-domain.mjs?v=5';
import {sameTrendAssessment} from '../trends-save-action.mjs?v=4';
import * as Images from '../image-search-domain.mjs';
import {clickBankImageCandidates,uniqueClickBankImageCandidates} from './clickbank-image-keyword-candidates.mjs?v=1';
import * as Glimpse from '../glimpse-domain.mjs';
import * as GlimpseStorage from '../glimpse-storage.mjs';
import * as TopOffersDecision from './clickbank-top-offers-decision.mjs?v=decision-row-request-highlight-1';
import {mountGlimpseHeaderAction} from '../glimpse-embed-controls.mjs?v=5';
import {mountCurationListFocus} from '../list-focus.mjs?v=3';
import {createCampaignDelivery,getCampaignDeliveriesForOffer,updateCampaignDeliveryCountriesForOffer,updateCampaignDeliveryPositiveKeywordsForOffer,updateCampaignDeliveryNegativeKeywordsForOffer,updateCampaignDeliveryImageSearchTermForOffer,listCampaignDeliveries,CAMPAIGN_DELIVERY_STORAGE_KEY} from '../../campaign-delivery/delivery-store.mjs?v=18';
import {listClickBankKeywordSources} from '../../google-ads/google-ads-clickbank-keyword-bridge.mjs?v=3';
import {productNameFromOfferTitle} from './product-name.mjs?v=1';
import {isClickBankCommissionUsd,parseClickBankCommissionUsd} from '../../campaign-delivery/commission-domain.mjs?v=1';
import {curationBridges} from '../central-bridge-slot.mjs';
import {createCurationCentralClients} from '../guru-central-client.mjs';

const root = document.querySelector('#clickbankTopOffersRoot');
const storageNotice = document.querySelector('#clickbankStorageNotice');
try {
  const response = await fetch('/api/presell/health', {cache:'no-store'});
  if (!response.ok) throw Error('Não foi possível identificar a base do Hub.');
  const health = await response.json();
  if (health.centralWriteProxy === true) {
    const clients = createCurationCentralClients();
    Object.assign(curationBridges, {clickbank:clients.bridge, delivery:clients.delivery});
    storageNotice.textContent = 'Base central · Ofertas, Google Trends e Google Imagens compartilhados. Glimpse salvo somente neste navegador.';
    const sidebar = document.querySelector('.local');
    if (sidebar) sidebar.textContent = '● Base central · Top Offers compartilhada. Glimpse local.';
  } else {
    storageNotice.textContent = 'Dados locais neste navegador. Glimpse salvo somente neste navegador.';
  }
} catch (error) {
  if (storageNotice) storageNotice.textContent = 'Não foi possível identificar a base do Hub. Recarregue a tela; nenhuma captura foi salva.';
  throw error;
}
let captures = [], offerMetadata = [], trends = [], images = [], decisions = [], glimpse = [], pending = null, saving = false, deliverySnapshot = null;
async function refreshDeliveries(){if(curationBridges.delivery)deliverySnapshot=await curationBridges.delivery.list();}
function displayedDeliveries(){if(!curationBridges.delivery)return listCampaignDeliveries();if(!deliverySnapshot)throw Error('Entregas centrais indisponíveis');return deliverySnapshot.deliveries;}
function linkedDeliveries(key){return curationBridges.delivery?curationBridges.delivery.forOffer(deliverySnapshot,key,'CB'):getCampaignDeliveriesForOffer(key);}
async function updateDelivery(item,changes,localUpdate){
  if(!curationBridges.delivery)return localUpdate();
  const result=await curationBridges.delivery.update(deliverySnapshot,item.offerKey,'CB',changes);
  if(result.updated)await refreshDeliveries();
  return result;
}
const listFocus=mountCurationListFocus('clickbank-top-offers',{blockingSelector:'#offerSheet:not(.hidden), #sharedDecisionDialog[open]',highlightOnCapture:false,restoreOnWindowReturn:false,suppressPulseOnPageHide:true});
const view = mountClickBankTopOffersView({root, actions:{
  validateImport,confirmImport,exportBackup,restoreBackup,openTrends,saveTrend,saveDecision,
  addTrendCandidate,addTrendCandidates,editTrendCandidate,removeTrendCandidate,addManualCountry,removeManualCountry,saveSalesPageType,saveBrandBidding,saveAffiliateLink,saveCanonicalProductName,saveImage,editImageCandidate,removeImageCandidate,saveImageSearchTerm,
  openImages,openImagesExcluding,openGlimpse,startCampaignDelivery,saveCommissionUsd,restoreListFocus:()=>listFocus.restore(),
}});
mountGlimpseHeaderAction({frame:root.querySelector('#glimpseFrame'),panel:root.querySelector('[data-panel="glimpse"]'),backButton:root.querySelector('#closeSheet'),actionButton:root.querySelector('#saveSheetButton'),finishLabel:'Salvar',showSavedFeedback:true,disableUntilSaveRetry:true});

function latestMatching(listName) {
  return [...captures].filter(item => item.listName === listName).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null;
}
function currentOffer(offerKey) {
  for (const capture of [...captures].sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))) {
    const item = capture.offers.find(offer => offer.offerKey === offerKey);
    if (item) return item;
  }
  return null;
}
function baseRecord(item) {
  return {offerKey:item.offerKey,productKey:Glimpse.normalize(item.offerName),offerName:item.offerName,seller:item.seller};
}
function metadataFor(item) { return offerMetadata.find(record => record.offerKey === item.offerKey) || {...baseRecord(item),manualCountries:[]}; }
function trendsFor(item) { return trends.find(record => record.offerKey === item.offerKey) || {...baseRecord(item),assessments:[],keywordCandidates:[]}; }
function imagesFor(item) { return images.find(record => record.offerKey === item.offerKey) || {...baseRecord(item),searchTerm:item.offerName,assessments:[]}; }
function glimpseFor(item) {
  const productKey = Glimpse.normalize(item.offerName);
  return [...glimpse].filter(analysis => analysis.productKey === productKey).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null;
}
function latestRecord(records,item) { return records.find(record => record.offerKey === item.offerKey); }
function replaceRecord(records,record) { return [...records.filter(item => item.offerKey !== record.offerKey),record]; }
function show() { view.render({captures,offerMetadata,trends,images,decisions,glimpse,deliveries:displayedDeliveries()}); }
function selectedDeliveryCountries(item,trendRecord=trendsFor(item),metadata=metadataFor(item)) {
  const selected=Array.isArray(trendRecord.pageDraft?.countries)
    ? trendRecord.pageDraft.countries
    : (Trends.latestAssessment(trendRecord.assessments)?.countries||[]);
  const allowed=new Set(metadata.manualCountries||[]);
  return [...new Set(selected.map(country=>String(country||'').trim().toUpperCase())
    .filter(country=>/^[A-Z]{2}$/.test(country)&&allowed.has(country)))];
}
async function syncDeliveryCountries(item,trendRecord=trendsFor(item),metadata=metadataFor(item)) {
  const linked=linkedDeliveries(item.offerKey);
  if(!linked.length&&!curationBridges.delivery)return true;
  if(!Array.isArray(trendRecord.pageDraft?.countries)&&!Trends.latestAssessment(trendRecord.assessments))return true;
  try {
    const countries=selectedDeliveryCountries(item,trendRecord,metadata);
    await updateDelivery(item,{countries},()=>updateCampaignDeliveryCountriesForOffer(item.offerKey,countries));
    return true;
  } catch(error) {
    console.error('Os países foram salvos na Curadoria, mas não foram sincronizados com a entrega.',error);
    view.showMessage('Países salvos na Curadoria, mas a entrega vinculada não foi atualizada. Tente salvar novamente.',{error:true});
    return false;
  }
}
async function syncDeliveryPositiveKeywords(item,keywords) {
  if(!linkedDeliveries(item.offerKey).length&&!curationBridges.delivery)return true;
  try {
    await updateDelivery(item,{positiveKeywords:keywords},()=>updateCampaignDeliveryPositiveKeywordsForOffer(item.offerKey,keywords));
    return true;
  } catch(error) {
    console.error('A candidata foi salva na Curadoria, mas não foi sincronizada com a entrega.',error);
    view.showMessage('Palavra-chave salva na Curadoria, mas a entrega vinculada não foi atualizada. Reabra o fluxo para tentar novamente.',{error:true});
    return false;
  }
}
async function syncDeliveryImageSearchTerm(item,term) {
  if(!linkedDeliveries(item.offerKey).length&&!curationBridges.delivery)return true;
  try {
    await updateDelivery(item,{imageSearchTerm:term},()=>updateCampaignDeliveryImageSearchTermForOffer(item.offerKey,term));
    return true;
  } catch(error) {
    console.error('O termo de Google Imagens foi salvo na Curadoria, mas não foi sincronizado com a entrega.',error);
    view.showMessage('Termo de Google Imagens salvo na Curadoria, mas a entrega vinculada não foi atualizada. Tente salvar novamente.',{error:true});
    return false;
  }
}
async function syncDeliveryNegativeKeywords(item,keywordSource=null) {
  if(!linkedDeliveries(item.offerKey).length&&!curationBridges.delivery)return true;
  try {
    const source=keywordSource??(await listClickBankKeywordSources()).find(record=>record.offerKey===item.offerKey)
      ??{negativeKeywords:[],negativeKeywordCountries:[]};
    await updateDelivery(item,{negativeKeywords:source.negativeKeywords||[],negativeKeywordCountries:source.negativeKeywordCountries||[]},()=>updateCampaignDeliveryNegativeKeywordsForOffer(item.offerKey,source.negativeKeywords||[],source.negativeKeywordCountries||[]));
    return true;
  } catch(error) {
    console.error('As candidatas negativas foram salvas na Curadoria, mas não foram sincronizadas com a entrega.',error);
    return false;
  }
}
async function startCampaignDelivery(item) {
  if (!item?.offerKey) return;
  if(view.getActiveOfferKey?.()===item.offerKey) {
    const termInput=root.querySelector('#imagesTerm');
    if(termInput&&!await saveImageSearchTerm(item.offerKey,termInput.value))return false;
  }
  const existing = linkedDeliveries(item.offerKey);
  if (existing.length > 1) {
    view.showMessage('Há mais de uma entrega vinculada a esta oferta. Nenhuma foi escolhida automaticamente; abra Entrega de campanha e confira os registros.', { error: true });
    return false;
  }
  if (existing.length === 1) {
    if(curationBridges.delivery){
      try{
        const trend=trendsFor(item),savedTrend=latestRecord(trends,item);
        const source=(await listClickBankKeywordSources()).find(record=>record.offerKey===item.offerKey);
        const changes={imageSearchTerm:imagesFor(item).searchTerm||item.offerName,...termosNegativosParaEntrega(source)};
        if(Array.isArray(trend.pageDraft?.countries)||Trends.latestAssessment(trend.assessments))changes.countries=selectedDeliveryCountries(item,trend,metadataFor(item));
        if(savedTrend&&Array.isArray(savedTrend.keywordCandidates))changes.positiveKeywords=savedTrend.keywordCandidates;
        await updateDelivery(item,changes,()=>{});
      }catch(error){console.error('Não foi possível sincronizar a entrega ClickBank.',error);view.showMessage('Não foi possível atualizar a entrega com os dados da Curadoria. Atualize e tente novamente.',{error:true});return false}
      window.location.assign('/campaign-delivery/?delivery_id='+encodeURIComponent(existing[0].id));return true;
    }
    if(!await syncDeliveryCountries(item,trendsFor(item),metadataFor(item)))return false;
    if(!await syncDeliveryImageSearchTerm(item,imagesFor(item).searchTerm||item.offerName))return false;
    const savedTrend=latestRecord(trends,item);
    if(savedTrend&&Array.isArray(savedTrend.keywordCandidates)
        &&!await syncDeliveryPositiveKeywords(item,savedTrend.keywordCandidates))return false;
    if(!await syncDeliveryNegativeKeywords(item)) {
      view.showMessage('Não foi possível atualizar as palavras-chave negativas da entrega. Tente reabrir o fluxo depois.',{error:true});
      return false;
    }
    window.location.assign('/campaign-delivery/?delivery_id=' + encodeURIComponent(existing[0].id));
    return true;
  }
  const metadata = metadataFor(item);
  const trendRecord = trendsFor(item);
  const latestAssessment = Trends.latestAssessment(trendRecord.assessments);
  const selectedCountries = Array.isArray(trendRecord.pageDraft?.countries)
    ? trendRecord.pageDraft.countries
    : (latestAssessment?.countries || []);
  const countries = [...new Set(selectedCountries.map(country => String(country || '').trim().toUpperCase()).filter(Boolean))];
  if (!countries.length || countries.some(country => !/^[A-Z]{2}$/.test(country))) {
    view.focusCampaignCountries?.(item.offerKey);
    view.showMessage(
      countries.length
        ? 'Revise os códigos de país selecionados. Use códigos válidos de duas letras antes de iniciar a entrega.'
        : 'Selecione e marque em verde pelo menos um país de destino antes de iniciar a entrega.',
      { error: true }
    );
    return false;
  }
  const commissionUsd = Domain.commissionUsdForOffer(item, metadata);
  if (commissionUsd == null || !isClickBankCommissionUsd(commissionUsd)) {
    view.showMessage('A comissão ClickBank em USD é obrigatória antes de iniciar a entrega. Informe e salve o valor para esta oferta.', { error: true });
    if (view.getActiveOfferKey() !== item.offerKey) view.openOffer(item.offerKey);
    view.openCommissionDialog();
    return false;
  }
  let source = null;
  try { source = (await listClickBankKeywordSources()).find(record => record.offerKey === item.offerKey) || {keywords:[],negativeKeywords:[],negativeKeywordCountries:[]}; }
  catch (error) {
    console.error('Não foi possível ler as candidatas ClickBank para a entrega local.',error);
    view.showMessage('Não foi possível ler as palavras-chave salvas na Curadoria. Nenhuma entrega foi criada; tente novamente.',{error:true});
    return false;
  }
  const productName = String(metadata.canonicalProductName || '').trim() || productNameFromOfferTitle(item.offerName, item.seller) || item.offerName;
  try {
    const deliveryInput = {
      offerKey: item.offerKey,
      offerName: item.offerName,
      seller: item.seller,
      productName,
      commissionAmountUsd: commissionUsd,
      brandBidding: Object.hasOwn(metadata,'brandBidding') ? metadata.brandBidding : 'no_brand_bidding',
      operationSnapshot: { type: 'campaign_delivery_started', sourceActivity: 'Curadoria ClickBank', destinationActivity: 'Criação de campanha' },
      affiliateUrl: metadata.affiliateLink || '',
      countries,
      positiveKeywords: source?.keywords || trendRecord.keywordCandidates || [],
      negativeKeywords: source?.negativeKeywords || [],
      negativeKeywordCountries: source?.negativeKeywordCountries || [],
      imageSearchTerm: imagesFor(item).searchTerm || item.offerName,
    };
    const delivery=curationBridges.delivery?await curationBridges.delivery.create({...deliveryInput,platformCode:'CB'},deliverySnapshot):createCampaignDelivery(deliveryInput);
    window.location.assign('/campaign-delivery/?delivery_id=' + encodeURIComponent(delivery.id));
  } catch (error) {
    view.showMessage(error?.message || 'Não foi possível iniciar a entrega local desta oferta.', { error: true });
  }
}
async function refresh() {
  await refreshDeliveries();
  [captures,offerMetadata,trends,images,decisions] = await Promise.all([
    Storage.getAll(Storage.STORES.captures),Storage.getAll(Storage.STORES.offerMetadata),
    Storage.getAll(Storage.STORES.trends),Storage.getAll(Storage.STORES.images),Storage.getAll(Storage.STORES.decisions),
  ]);
  glimpse = curationBridges.glimpse?await GlimpseStorage.getAllAnalyses():await GlimpseStorage.getAllAnalyses().catch(() => []);
  show();
}
async function refreshAfterGlimpseSave() {
  try { await refresh(); }
  catch (error) {
    console.error('A análise Glimpse foi salva, mas a tabela ClickBank não pôde ser atualizada.',error);
    view.showMessage('A análise foi salva, mas não foi possível atualizar a tabela. Recarregue a tela.',{error:true});
  }
}
async function saveDecision(offerKey,status,notes='',pageClassification=null,marketScope=null) {
  const item=currentOffer(offerKey);if(!item)return;
  const previous=decisions.find(record=>record.offerKey===offerKey)||{offerKey,currentStatus:TopOffersDecision.DEFAULT_DECISION,notes:'',history:[]};
  const normalized=TopOffersDecision.normalizeDecision(status),requestedPageClassification=TopOffersDecision.normalizePageClassification(pageClassification),normalizedPageClassification=requestedPageClassification||(previous.pageClassification==='vsl'&&normalized!=='VSL'?'vsl':null),normalizedMarketScope=TopOffersDecision.normalizeMarketScope(marketScope),capturedAt=new Date().toISOString(),decisionNotes=String(notes??'').slice(0,5000);
  const stored={...previous,offerKey,currentStatus:normalized,pageClassification:normalizedPageClassification,marketScope:normalizedMarketScope,notes:decisionNotes,updatedAt:capturedAt,history:[...(previous.history||[]),{status:normalized,pageClassification:normalizedPageClassification,marketScope:normalizedMarketScope,capturedAt,notes:decisionNotes}]};
  try{await Storage.putDecision(stored);decisions=[...decisions.filter(record=>record.offerKey!==offerKey),stored];show();view.showMessage(`Decisão salva somente em Top Offers CB: ${normalized}.`)}
  catch(error){console.error('Não foi possível salvar a decisão Top Offers CB.',error);view.showMessage('Não foi possível salvar a decisão desta tela.',{error:true});throw error}
}

function validateImport(raw,extensionCapture=null) {
  const parsed = Domain.parseTopOffersClipboard(raw);
  const previous = latestMatching(parsed.listName || 'Top Offers');
  const compared = Domain.compareCapturedOffers(parsed.offers, previous?.offers || []);
  pending = {raw:String(raw),parsed,previous,compared,extensionCapture};
  const newProductCount = Domain.countNewCapturedOffers(parsed.offers, captures);
  view.showImportPreview({parsed,compared,newProductCount});
}

async function confirmImport(raw) {
  if (saving) return;
  if (!pending || pending.raw !== String(raw)) {
    validateImport(raw);
    view.showMessage('A colagem foi revalidada. Revise a prévia e confirme novamente.');
    return;
  }
  const parsed = Domain.parseTopOffersClipboard(raw);
  if (!parsed.valid) { validateImport(raw); return; }
  saving = true;
  try {
    const capture = {
      captureId:`clickbank-${crypto.randomUUID()}`,
      capturedAt:pending.extensionCapture?.capturedAt || new Date().toISOString(),
      sourceFormat:parsed.sourceFormat,
      listName:parsed.listName,
      declaredTotal:parsed.page.total,
      page:{start:parsed.page.start,end:parsed.page.end,total:parsed.page.total,pageSize:parsed.page.pageSize,completeUniverse:parsed.page.completeUniverse},
      offers:parsed.offers,
    };
    await Storage.saveCapture(capture);
    pending = null;
    root.querySelector('#pasteArea').value = '';
    view.closeImport();
    await refresh();
    view.selectCapture(capture.captureId,{preserveAll:true});
    view.showMessage('Captura salva localmente. Valores ausentes continuam diferentes de zero.');
  } catch (error) {
    console.error('Não foi possível salvar a captura Top Offers CB.', error);
    view.showMessage('Não foi possível salvar a captura; os dados existentes foram preservados.', {error:true});
  } finally { saving = false; }
}

async function openTrends(term) {
  const searchedTerm=String(term??'').trim(),item=currentOffer(view.getActiveOfferKey());
  if(!searchedTerm||!item){if(!searchedTerm)view.showMessage('Informe um termo de pesquisa antes de abrir o Google Trends.',{error:true});return;}
  const tab=window.open(Trends.exploreUrl(searchedTerm),'google-trends-clickbank-top-offers');
  if(!tab){view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true});return;}
  try{tab.focus();}catch{}
  const searchedAt=new Date().toISOString();
  try{
    const stored=await Storage.setTrendSearchTimestamp(baseRecord(item),searchedAt,searchedTerm);
    trends=replaceRecord(trends,stored);
    view.updateTrendSearchHistory(stored);
  }catch(error){
    console.error('A pesquisa de Google Trends abriu, mas não foi possível salvar o histórico da ClickBank.',error);
    view.showMessage('Busca aberta, mas não foi possível salvar o histórico.',{error:true});
  }
}
async function saveTrend(offerKey,status,draft={}) {
  const item = currentOffer(offerKey); if (!item) return false;
  const old = trendsFor(item);
  const {metadataPatch={},...trendDraft}=draft;
  if(!status){
    const stored={...old,...baseRecord(item),pageDraft:{...trendDraft,status:''}};
    const saved=await Storage.saveTrendPage(stored,metadataPatch);
    if(saved.metadata)offerMetadata=replaceRecord(offerMetadata,saved.metadata);
    trends=replaceRecord(trends,saved.record);
    const synced=await syncDeliveryCountries(item,saved.record,saved.metadata||metadataFor(item));
    show();return synced;
  }
  const assessment = {
    assessmentId:crypto.randomUUID(),status,countries:[...new Set((draft.countries || []).filter(Boolean))].slice(0,5),
    productAge:draft.productAge || null,searchTerm:String(draft.term || item.offerName).trim(),date:Trends.localDateKey(),capturedAt:new Date().toISOString(),
  };
  const assessmentChanged=!sameTrendAssessment(Trends.latestAssessment(old.assessments),{...trendDraft,status});
  const stored = {...old,...baseRecord(item),pageDraft:null,assessments:assessmentChanged?Trends.appendAssessment(old.assessments,assessment):old.assessments};
  try {
    const saved=await Storage.saveTrendPage(stored,metadataPatch);
    if(saved.metadata)offerMetadata=replaceRecord(offerMetadata,saved.metadata);
    trends=replaceRecord(trends,saved.record);
    const synced=await syncDeliveryCountries(item,saved.record,saved.metadata||metadataFor(item));
    if(!synced){show();return false}
  }
  catch(error) {
    console.error('Não foi possível salvar a avaliação de Google Trends da ClickBank.',error);
    return false;
  }
  try { show(); }
  catch(error) { console.error('A avaliação foi salva, mas a ficha ClickBank não pôde ser atualizada.',error); }
  return true;
}
async function addTrendCandidate(offerKey,value) {
  const item=currentOffer(offerKey),term=String(value||'').trim(); if(!item||!term)return false;
  const old=trendsFor(item),candidates=[...(old.keywordCandidates||[])];
  if(candidates.some(entry=>Domain.normalize(entry)===Domain.normalize(term))){view.showMessage('Essa candidata já está na lista.');return false;}
  const stored={...old,...baseRecord(item),keywordCandidates:[...candidates,term]};
  try { const saved=await Storage.putOfferRecord(Storage.STORES.trends,stored);trends=replaceRecord(trends,saved);const synced=await syncDeliveryPositiveKeywords(item,saved.keywordCandidates);show();view.showMessage(synced?'Candidata à palavra-chave adicionada.':'Candidata salva na Curadoria, mas a entrega vinculada não foi atualizada. Reabra o fluxo para tentar novamente.',{error:!synced});return true; }
  catch { view.showMessage('Não foi possível salvar a candidata.',{error:true});return false; }
}
async function addTrendCandidates(offerKey,values) {
  const item=currentOffer(offerKey),terms=Array.isArray(values)?values.map(value=>String(value??'').trim()).filter(Boolean):[];
  if(!item||!terms.length)return {ok:false,addedCount:0};
  const tooLongCount=terms.filter(term=>Array.from(term).length>80).length;
  if(tooLongCount){view.showMessage(`${tooLongCount} candidata(s) excede(m) o limite de 80 caracteres da criação de campanha. Revise a colagem; nada foi salvo.`,{error:true});return {ok:false,addedCount:0,tooLongCount};}
  const old=trendsFor(item),candidates=[...(old.keywordCandidates||[])],seen=new Set(candidates.map(Domain.normalize)),additions=[];
  for(const term of terms){const normalized=Domain.normalize(term);if(seen.has(normalized))continue;seen.add(normalized);additions.push(term);}
  const duplicateCount=terms.length-additions.length;
  if(candidates.length+additions.length>100){view.showMessage('A lista aceita até 100 candidatas para transferência à campanha. Nada foi salvo.',{error:true});return {ok:false,addedCount:0,duplicateCount,limitExceeded:true};}
  if(!additions.length){view.showMessage('Todas as candidatas já estavam na lista; nenhuma duplicata foi adicionada.');return {ok:true,addedCount:0,duplicateCount};}
  const stored={...old,...baseRecord(item),keywordCandidates:[...candidates,...additions]};
  try {
    const saved=await Storage.putOfferRecord(Storage.STORES.trends,stored);trends=replaceRecord(trends,saved);const synced=await syncDeliveryPositiveKeywords(item,saved.keywordCandidates);show();
    const message=`${additions.length} ${additions.length===1?'candidata adicionada':'candidatas adicionadas'}${duplicateCount?`; ${duplicateCount} ${duplicateCount===1?'duplicata ignorada':'duplicatas ignoradas'}`:''}.`;
    view.showMessage(synced?message:'Candidatas salvas na Curadoria, mas a entrega vinculada não foi atualizada. Reabra o fluxo para tentar novamente.',{error:!synced});return {ok:true,addedCount:additions.length,duplicateCount};
  } catch {view.showMessage('Não foi possível salvar as candidatas.',{error:true});return {ok:false,addedCount:0,duplicateCount};}
}
async function editTrendCandidate(offerKey,index,value) {
  const item=currentOffer(offerKey),term=String(value??'').trim();if(!item)return false;
  const old=trendsFor(item),keywordCandidates=[...(old.keywordCandidates||[])];
  if(!Number.isSafeInteger(index)||index<0||index>=keywordCandidates.length){view.showMessage('Esta candidata não está mais disponível para edição.',{error:true});return false;}
  if(!term){view.showMessage('Informe o texto da candidata.',{error:true});return false;}
  if(keywordCandidates.some((entry,entryIndex)=>entryIndex!==index&&Domain.normalize(entry)===Domain.normalize(term))){view.showMessage('Já existe uma candidata igual na lista.',{error:true});return false;}
  if(keywordCandidates[index]===term)return true;
  keywordCandidates[index]=term;
  const stored={...old,...baseRecord(item),keywordCandidates};
  try { const saved=await Storage.putOfferRecord(Storage.STORES.trends,stored);trends=replaceRecord(trends,saved);const synced=await syncDeliveryPositiveKeywords(item,saved.keywordCandidates);show();view.showMessage(synced?'Candidata à palavra-chave atualizada.':'Candidata atualizada na Curadoria, mas a entrega vinculada não foi atualizada. Reabra o fluxo para tentar novamente.',{error:!synced});return true; }
  catch { view.showMessage('Não foi possível atualizar a candidata.',{error:true});return false; }
}
async function removeTrendCandidate(offerKey,index) {
  const item=currentOffer(offerKey);if(!item)return false;
  const old=trendsFor(item),keywordCandidates=[...(old.keywordCandidates||[])];keywordCandidates.splice(index,1);
  const stored={...old,...baseRecord(item),keywordCandidates};
  try { const saved=await Storage.putOfferRecord(Storage.STORES.trends,stored);trends=replaceRecord(trends,saved);const synced=await syncDeliveryPositiveKeywords(item,saved.keywordCandidates);show();view.showMessage(synced?'Candidata à palavra-chave removida.':'Candidata removida na Curadoria, mas a entrega vinculada não foi atualizada. Reabra o fluxo para tentar novamente.',{error:!synced});return true; }
  catch { view.showMessage('Não foi possível remover a candidata.',{error:true});return false; }
}
async function addManualCountry(offerKey,value) {
  const item=currentOffer(offerKey),code=String(value||'').trim().toUpperCase();if(!item)return false;
  if(!/^[A-Z]{2}$/.test(code)){view.showMessage('Informe um código de país com duas letras.',{error:true});return false;}
  const old=metadataFor(item);
  if(old.manualCountries.includes(code)){view.showMessage(`${code} já foi adicionado.`);return false;}
  const stored={...old,...baseRecord(item),manualCountries:[...old.manualCountries,code]};
  await Storage.putOfferRecord(Storage.STORES.offerMetadata,stored);offerMetadata=replaceRecord(offerMetadata,stored);const synced=await syncDeliveryCountries(item,undefined,stored);show();if(synced)view.showMessage(`${code} adicionado manualmente; não faz parte dos dados da ClickBank.`);return synced;
}
async function removeManualCountry(offerKey,value) {
  const item=currentOffer(offerKey);if(!item)return false;
  const removal=removeManualCountryMetadata(metadataFor(item),baseRecord(item),value);
  if(!removal.ok){view.showMessage(removal.message,{error:true});return false;}
  try {
    await Storage.putOfferRecord(Storage.STORES.offerMetadata,removal.record);
    offerMetadata=replaceRecord(offerMetadata,removal.record);const synced=await syncDeliveryCountries(item,undefined,removal.record);show();
    if(synced)view.showMessage(`${String(value).trim().toUpperCase()} removido dos países manuais.`);
    return synced;
  } catch(error) {
    console.error('Não foi possível remover o país manual.',error);
    view.showMessage('Não foi possível remover o país manual. Os dados existentes foram preservados.',{error:true});
    return false;
  }
}
async function saveSalesPageType(offerKey,value) {
  const item=currentOffer(offerKey);if(!item)return false;
  if(saving){view.showMessage('Outra gravação está em andamento. Tente novamente.',{error:true});return false;}
  saving=true;
  try {
    const stored=withSalesPageType(metadataFor(item),baseRecord(item),value);
    await Storage.putOfferRecord(Storage.STORES.offerMetadata,stored);
    offerMetadata=replaceRecord(offerMetadata,stored);show();
    view.showMessage(value?`Tipo de página de venda salvo para ${item.offerName}: ${value.toUpperCase()}.`:`Classificação da página de venda removida para ${item.offerName}.`);
    return true;
  } catch(error) {
    console.error('Não foi possível salvar o tipo de página de venda.',error);
    view.showMessage('Não foi possível salvar a classificação. Os dados existentes foram preservados.',{error:true});
    return false;
  } finally {saving=false;}
}
async function saveAffiliateLink(offerKey,value) {
  const item=currentOffer(offerKey);if(!item)return false;
  const link=Storage.normalizeAffiliateLink(value);
  if(!link)throw new Error('Informe uma URL HTTP ou HTTPS válida para o link de afiliado.');
  const stored=await Storage.saveAffiliateLink(baseRecord(item),link);
  offerMetadata=replaceRecord(offerMetadata,stored);show();
  return true;
}
async function saveCommissionUsd(offerKey,value) {
  const item=currentOffer(offerKey);if(!item)throw new Error('A oferta selecionada não está mais disponível.');
  const commissionUsd=parseClickBankCommissionUsd(value);
  if(commissionUsd==null)throw new Error('Informe uma comissão em USD válida, com até duas casas decimais.');
  const stored=await Storage.saveCommissionUsd(baseRecord(item),commissionUsd);
  offerMetadata=replaceRecord(offerMetadata,stored);show();
  return stored;
}
async function saveCanonicalProductName(offerKey,value) {
  const item=currentOffer(offerKey);if(!item)throw new Error('A oferta selecionada não está mais disponível.');
  const stored=await Storage.saveCanonicalProductName(baseRecord(item),value);
  offerMetadata=replaceRecord(offerMetadata,stored);
  return stored;
}
async function saveDtcCountries(item,capture) {
  if(saving)return {ok:false,message:'O Hub está ocupado com outra gravação. Tente novamente.'};
  saving=true;
  try {
    const old=metadataFor(item),merged=mergeDtcCountries(old,baseRecord(item),capture);
    if(!merged.ok)return merged;
    await Storage.putOfferRecord(Storage.STORES.offerMetadata,merged.record);
    offerMetadata=replaceRecord(offerMetadata,merged.record);show();
    view.showMessage(`Lista capturada da DTC e salva para ${item.offerName}: ${capture.countries.length} país(es), ${merged.addedCount} novo(s).`);
    return {ok:true,saved:true,offerName:item.offerName,addedCount:merged.addedCount,countryCount:capture.countries.length};
  } catch(error) {
    console.error('Não foi possível salvar a lista de países da DTC.',error);
    return {ok:false,message:'Não foi possível salvar a lista de países da DTC. Os países existentes foram preservados.'};
  } finally {saving=false;}
}
async function saveBrandBidding(offerKey,value) {
  const item=currentOffer(offerKey);if(!item)return false;
  if(saving){view.showMessage('Outra gravação está em andamento. Tente novamente.',{error:true});return false;}
  saving=true;
  try {
    const stored=await Storage.saveBrandBidding(baseRecord(item),value);
    offerMetadata=replaceRecord(offerMetadata,stored);show();
    view.showMessage(`Classificação salva: ${brandBiddingLabel(value)}.`,{headerOnly:true});
    return true;
  } catch(error) {
    console.error('Não foi possível salvar a classificação de brand bidding.',error);
    view.showMessage('Não foi possível salvar brand bidding. A classificação anterior foi preservada; tente novamente.',{error:true});
    return false;
  } finally {saving=false;}
}
async function saveImage(offerKey,country,status) {
  const item=currentOffer(offerKey);if(!item)return false;
  const old=imagesFor(item),candidates=clickBankImageCandidates(old),visibleTerm=view.getActiveOfferKey?.()===item.offerKey?String(root.querySelector('#imagesTerm')?.value||'').trim():String(old.searchTerm||'').trim(),searchTerm=visibleTerm||String(old.searchTerm||item.offerName).trim(),assessment={
    assessmentId:crypto.randomUUID(),country,status,negativeKeywordCandidates:candidates,searchTerm,
    date:Trends.localDateKey(),capturedAt:new Date().toISOString(),sampleSize:20,source:'google-images-manual',
  };
  const stored={...old,...baseRecord(item),searchTerm,negativeKeywordCandidates:candidates,assessments:Images.appendAssessment(old.assessments,assessment)};
  await Storage.putOfferRecord(Storage.STORES.images,stored);images=replaceRecord(images,stored);show();
  const imageTermSynced=await syncDeliveryImageSearchTerm(item,searchTerm),negativeKeywordsSynced=await syncDeliveryNegativeKeywords(item),synced=imageTermSynced&&negativeKeywordsSynced;
  const message=`Avaliação visual salva: ${Images.resultLabel(status)} · ${country}.`;
  view.showMessage(synced?message:message+' A entrega vinculada não foi atualizada; reabra o fluxo para tentar novamente.',{error:!synced});
  return true;
}
function parseImageKeywordCandidateLines(value) {
  return String(value??'').split(/\r?\n/u).map(term=>term.trim()).filter(Boolean);
}
async function addImageKeywordCandidates(input,button=null) {
  const item=currentOffer(view.getActiveOfferKey());if(!item)return false;
  const terms=parseImageKeywordCandidateLines(input.value);
  if(!terms.length){view.showMessage('Cole uma candidata por linha antes de adicionar.');return false;}
  if(terms.some(term=>Array.from(term).length>500)){view.showMessage('Cada candidata pode ter no máximo 500 caracteres.',{error:true});return false;}
  const current=clickBankImageCandidates(imagesFor(item)),seen=new Set(current.map(value=>value.toLocaleLowerCase('pt-BR'))),additions=[];
  let duplicates=0;
  for(const term of terms){const key=term.toLocaleLowerCase('pt-BR');if(seen.has(key)){duplicates++;continue;}seen.add(key);additions.push(term);}
  if(!additions.length){view.showMessage('Todas as candidatas coladas já estavam salvas.');return false;}
  if(current.length+additions.length>100){view.showMessage('A lista de negativas aceita até 100 termos para manter compatibilidade com a criação de campanha.',{error:true});return false;}
  input.disabled=true;if(button)button.disabled=true;
  try{
    const saved=await saveImageKeywordCandidates(item.offerKey,[...current,...additions],`${additions.length} candidata(s) negativa(s) adicionada(s)${duplicates?`; ${duplicates} repetida(s) ignorada(s)`:''}.`);
    if(saved){input.value='';input.focus();}
    input.disabled=false;if(button)button.disabled=false;
    return saved;
  }catch(error){
    console.error('Não foi possível salvar as candidatas negativas.',error);
    view.showMessage('Não foi possível salvar as candidatas. A colagem foi mantida; tente novamente.',{error:true});
    input.disabled=false;if(button)button.disabled=false;
    return false;
  }
}
async function saveImageKeywordCandidates(offerKey,candidates,message='Candidatas negativas salvas.') {
  const item=currentOffer(offerKey);if(!item)return false;
  const old=imagesFor(item),stored={...old,...baseRecord(item),negativeKeywordCandidates:uniqueClickBankImageCandidates(candidates)};
  await Storage.putOfferRecord(Storage.STORES.images,stored);images=replaceRecord(images,stored);show();
  const synced=await syncDeliveryNegativeKeywords(item);
  view.showMessage(synced?message:message+' A entrega vinculada não foi atualizada; reabra o fluxo para tentar novamente.',{error:!synced});
  return true;
}
async function editImageCandidate(offerKey,index,value) {
  const item=currentOffer(offerKey),term=String(value??'').trim();if(!item)return false;
  const candidates=clickBankImageCandidates(imagesFor(item));
  if(!Number.isSafeInteger(index)||index<0||index>=candidates.length){view.showMessage('Esta candidata não está mais disponível para edição.',{error:true});return false;}
  if(!term){view.showMessage('Informe o texto da candidata.',{error:true});return false;}
  if(Array.from(term).length>500){view.showMessage('Cada candidata pode ter no máximo 500 caracteres.',{error:true});return false;}
  if(candidates.some((entry,entryIndex)=>entryIndex!==index&&entry.toLocaleLowerCase('pt-BR')===term.toLocaleLowerCase('pt-BR'))){view.showMessage('Já existe uma candidata igual na lista.',{error:true});return false;}
  if(candidates[index]===term)return true;
  candidates[index]=term;
  try { return await saveImageKeywordCandidates(offerKey,candidates,'Candidata negativa atualizada.'); }
  catch(error) { console.error('Não foi possível atualizar a candidata negativa.',error);view.showMessage('Não foi possível atualizar a candidata.',{error:true});return false; }
}
async function removeImageCandidate(offerKey,index) {
  const item=currentOffer(offerKey);if(!item)return false;
  const candidates=clickBankImageCandidates(imagesFor(item));
  if(!Number.isSafeInteger(index)||index<0||index>=candidates.length){view.showMessage('Esta candidata não está mais disponível para remoção.',{error:true});return false;}
  candidates.splice(index,1);
  try { return await saveImageKeywordCandidates(offerKey,candidates,'Candidata negativa removida.'); }
  catch(error) { console.error('Não foi possível remover a candidata negativa.',error);view.showMessage('Não foi possível remover a candidata.',{error:true});return false; }
}
async function saveImageSearchTerm(offerKey,term) {
  const item=currentOffer(offerKey);if(!item)return false;
  const old=imagesFor(item),searchTerm=String(term||'').trim().slice(0,250)||item.offerName,stored={...old,...baseRecord(item),searchTerm};
  try {
    if(String(old.searchTerm||'')!==searchTerm){await Storage.putOfferRecord(Storage.STORES.images,stored);images=replaceRecord(images,stored);show();}
    if(!await syncDeliveryImageSearchTerm(item,searchTerm))return false;
    return true;
  } catch(error) {
    console.error('Não foi possível salvar o termo de Google Imagens.',error);
    view.showMessage('Não foi possível salvar o termo de Google Imagens. O valor digitado foi preservado; tente novamente.',{error:true});
    return false;
  }
}
function openImages(term,country) {
  const item=currentOffer(view.getActiveOfferKey?.()),candidates=item?clickBankImageCandidates(imagesFor(item)):[];
  const url=candidates.length?Images.imageSearchUrlExcluding(term,country,candidates):Images.imageSearchUrl(term,country);
  const tab=window.open(url,'google-images-clickbank-top-offers');
  if(tab)tab.focus();else view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true});
}
function openImagesExcluding(term,country,candidates) {
  const tab=window.open(Images.imageSearchUrlExcluding(term,country,candidates),'google-images-clickbank-top-offers');
  if(tab)tab.focus();else view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true});
}
function openGlimpse(item) {
  const frame=root.querySelector('#glimpseFrame'),params=new URLSearchParams({origin:'clickbank-top-offers',offerKey:item.offerKey,productKey:Glimpse.normalize(item.offerName),product:item.offerName,embedded:'1'});
  const url=new URL(`../glimpse/?${params}`,location.href).href;
  if(frame.src!==url)frame.src=url;
}
root.addEventListener('keydown',event=>{
  const input=event.target.closest('[data-image-candidate-input]');
  if(!input||event.key!=='Enter'||(!event.ctrlKey&&!event.metaKey))return;
  event.preventDefault();
  void addImageKeywordCandidates(input);
});
root.addEventListener('click',event=>{
  const button=event.target.closest('[data-image-candidate-add]');if(!button)return;
  const input=root.querySelector('[data-image-candidate-input]');
  if(input)void addImageKeywordCandidates(input,button);
});
window.addEventListener('message',event=>{
  const frame=root.querySelector('#glimpseFrame');
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='hub-glimpse-resize'){const height=Number(event.data.height);if(Number.isFinite(height))frame.style.height=`${Math.max(320,Math.ceil(height))}px`;return;}
  if(event.data?.type==='hub-glimpse-save-result'){if(event.data.saved===true)void refreshAfterGlimpseSave();return;}
  if(event.data?.type==='hub-glimpse-close')void refresh().then(()=>{view.returnFromGlimpse();view.showMessage('Análise Glimpse atualizada.');});
});
window.addEventListener('storage',event=>{
  if(event.key===CAMPAIGN_DELIVERY_STORAGE_KEY)show();
});

async function exportBackup() {
  try {
    const backup=await Storage.exportBackup(),blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`top-offers-cb-backup-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    view.showMessage(`Backup JSON exportado com ${backup.captures.length} capturas, análises e ${backup.decisions.length} decisões próprias desta tela.`);
  } catch(error) { console.error('Não foi possível exportar o backup Top Offers CB.',error);view.showMessage('Falha ao exportar o backup JSON.',{error:true}); }
}
async function restoreBackup(file) {
  try {
    if(file.size>25*1024*1024)throw new Error('O backup excede o limite de 25 MB.');
    const payload=JSON.parse(await file.text()),result=await Storage.mergeBackup(payload);await refresh();
    view.showMessage(`Restauração mesclada: ${result.added} adicionado(s), ${result.merged||0} decisão(ões) combinada(s), ${result.unchanged} já existente(s), ${result.conflicts} conflito(s) preservado(s).`);
  } catch(error) { console.warn('Backup Top Offers CB rejeitado.',error);view.showMessage(error instanceof SyntaxError?'O arquivo selecionado não contém JSON válido.':(error?.message||'Não foi possível restaurar o backup.'),{error:true}); }
}

const requestedOfferKey = new URLSearchParams(window.location.search).get('offerKey') || '';
const initialLoad = refresh().then(()=>{
  if(requestedOfferKey&&!view.openOffer(requestedOfferKey))view.showMessage('A oferta vinculada a esta entrega não está presente nas capturas locais da Curadoria. Os dados salvos foram preservados.',{error:true});
});
initialLoad.catch(error=>{console.error('Não foi possível abrir o banco local Top Offers CB.',error);view.showMessage('Não foi possível abrir o armazenamento local desta tela.',{error:true});});
mountExtensionCapture({target:window,ready:initialLoad,getBusy:()=>saving,getDraft:()=>root.querySelector('#pasteArea').value,
  preparePreview:(raw,metadata)=>{view.prepareImport(raw);validateImport(raw,metadata);},
  getOffers:()=>captures.flatMap(capture=>capture.offers||[]),
  saveDtcCountries,
});

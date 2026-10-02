import * as Domain from './hot-offers-ms-domain.mjs';
import * as Storage from './hot-offers-ms-storage.mjs';
import {mountHotOffersMsView} from './hot-offers-ms-view.mjs?v=20261001-no-hot-badge';
import * as Trends from '../trends-domain.mjs';
import * as Images from '../image-search-domain.mjs';
import * as Decisions from '../decision-ui.mjs';
import * as GlimpseStorage from '../glimpse-storage.mjs';
import * as CurationObservability from '../curation-observability.mjs';
import {mountCurationListFocus} from '../list-focus.mjs';

const root = document.querySelector('#hotOffersMsRoot');
let offers = [], collections = [], snapshots = [], decisions = [], trends = [], images = [], glimpse = [];
let pendingImport = null, savingCollection = false;
const view = mountHotOffersMsView({root,actions:{
  resetImport,
  validateImport,
  confirmImport,
  openCollection,
  closeOffer,
  saveDecision,
  saveTrend,
  addTrendCandidate,
  removeTrendCandidate,
  openTrends,
  saveImage,
  saveImageSearchTerm,
  openImages,
  openImagesExcluding,
  addManualCountry,
  openGlimpse,
}});
const listFocus = mountCurationListFocus('hot-offers-ms',{blockingSelector:'#offerSheet:not(.hidden)'});

function show() { view.render({offers,collections,snapshots,decisions,trends,images,glimpse}); }
function latestCollection(scope) {
  return [...collections].filter(item => item.scope === scope).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null;
}
function decisionFor(key) { return decisions.find(item => item.offerKey === key) || {offerKey:key,currentStatus:Decisions.DEFAULT_DECISION,history:[]}; }
function trendsFor(key) { return trends.find(item => item.offerKey === key) || {offerKey:key,assessments:[],keywordCandidates:[]}; }
function imagesFor(key) { return images.find(item => item.offerKey === key) || {offerKey:key,assessments:[]}; }
function glimpseFor(item) { return [...glimpse].filter(value => value.productKey === item.productKey).sort((a,b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] || null; }
function currentOffer(key) { return offers.find(item => item.offerKey === key) || null; }
function offerRefs(item) { return item ? [{origin:'hot-offers-ms',scope:item.scope,offerId:String(item.offerId)}] : []; }
function subjectId(item) { return 'hot-offers-ms:' + item.scope + ':' + item.offerId; }
function curationSnapshot(item) {
  return {
    offerId:String(item.offerId),scope:item.scope,productName:item.productName,category:item.category || null,
    payment:item.payment || null,countriesVisible:[...(item.countriesVisible || [])],additionalCountryCount:item.additionalCountryCount || 0,
    affiliationStatus:item.affiliationStatus || 'unknown',createdAt:item.createdAt || null,firstSeenAt:item.firstSeenAt || null,lastSeenAt:item.lastSeenAt || null,
  };
}
function latestImagesSnapshot(record) {
  const latest = Images.latestByCountry(record?.assessments || []);
  return {currentByCountry:[...latest.values()]};
}
function fireObservability(promise) {
  Promise.resolve(promise).catch(error => console.warn('Não foi possível registrar a observabilidade da Curadoria.',error));
}
async function refresh() {
  [offers,collections,snapshots,decisions,trends,images] = await Promise.all(Object.values(Storage.STORES).map(name => Storage.getAll(name)));
  glimpse = await GlimpseStorage.getAllAnalyses().catch(() => []);
  show();
}
function resetImport() {
  pendingImport = null;
  document.querySelector('#pasteArea').value = '';
  document.querySelector('#importScope').value = '';
  document.querySelector('#completeListConfirm').checked = false;
  document.querySelector('#previewMetrics').innerHTML = '';
  document.querySelector('#previewScopeLabel').textContent = '';
  document.querySelector('#previewStatus').textContent = '';
  document.querySelector('#previewStatus').className = 'preview-status';
  document.querySelector('#previewIssues').innerHTML = '';
  document.querySelector('#previewChanges').innerHTML = '';
  document.querySelector('#confirmImport').disabled = true;
}
async function buildPreview({raw,scope,complete}) {
  const parsed = Domain.parseHotOffersText(raw,{scope});
  const previousCollection = latestCollection(scope);
  const previous = previousCollection ? snapshots.filter(item => item.collectionId === previousCollection.collectionId) : [];
  const knownKeys = offers.filter(item => item.scope === scope).map(item => item.offerKey);
  const capturedAt = new Date().toISOString(), collectionId = 'hotms_' + crypto.randomUUID();
  const current = parsed.offers.map(item => ({...item,collectionId,capturedAt}));
  const comparison = Domain.compareCollections(current,previous,knownKeys);
  const valid = parsed.valid && complete && !parsed.issues.some(issue => issue.severity === 'error');
  pendingImport = {parsed,previousCollection,previous,knownKeys,capturedAt,collectionId,comparison,current,valid,complete,scope};
  return {parsedCount:parsed.parsedCount,scope,complete,hasPrevious:Boolean(previousCollection),issues:parsed.issues,comparison,valid};
}
async function validateImport(input) {
  const preview = await buildPreview(input);
  view.showImportPreview(preview);
}
async function confirmImport(input) {
  if (savingCollection) return;
  const preview = await buildPreview(input);
  view.showImportPreview(preview);
  if (!preview.valid || !pendingImport) return;
  savingCollection = true;
  const confirm = document.querySelector('#confirmImport'); confirm.disabled = true;
  try {
    const draft = pendingImport, entryByKey = new Map((draft.comparison?.entries || []).map(entry => [entry.offerKey,entry]));
    const savedComparison = draft.comparison || Domain.compareCollections(draft.current,[],[]);
    const snapshotsToSave = draft.parsed.offers.map(item => Domain.snapshotFromOffer(item,{collectionId:draft.collectionId,capturedAt:draft.capturedAt}));
    const existingByKey = new Map(offers.map(item => [item.offerKey,item]));
    const currentKeys = new Set(draft.parsed.offers.map(item => item.offerKey));
    const mergedOffers = draft.parsed.offers.map(item => {
      const entry = entryByKey.get(item.offerKey);
      return Domain.mergeOffer(existingByKey.get(item.offerKey),item,{collectionId:draft.collectionId,capturedAt:draft.capturedAt,movement:entry?.movement || 'new',positionDelta:entry?.positionDelta ?? null});
    });
    for (const existing of offers) {
      if (existing.scope !== draft.scope || currentKeys.has(existing.offerKey) || existing.presentInLatestCollection === false) continue;
      mergedOffers.push(Domain.markExited(existing,{collectionId:draft.collectionId,capturedAt:draft.capturedAt}));
    }
    const collection = {
      collectionId:draft.collectionId,scope:draft.scope,capturedAt:draft.capturedAt,offerCount:draft.parsed.parsedCount,
      completeListConfirmed:true,sourceFormat:draft.parsed.sourceFormat,comparison:savedComparison,
      movements:savedComparison.entries,
    };
    await Storage.saveCollection({offers:mergedOffers,collection,snapshots:snapshotsToSave});
    pendingImport = null;
    document.querySelector('#pasteArea').value = '';
    document.querySelector('#completeListConfirm').checked = false;
    view.closeImportDialog();
    await refresh();
    view.showToast('Coleta completa salva. Nenhum CSV/arquivo de origem foi inferido.');
  } catch (error) {
    console.error(error);
    view.showToast('Falha ao salvar a coleta; a transação foi cancelada.');
  } finally {
    savingCollection = false;
    confirm.disabled = false;
  }
}
function openCollection(collectionId) {
  const collection = collections.find(item => item.collectionId === collectionId);
  if (collection) view.renderCollectionDetail(collection);
}
function closeOffer() { listFocus.restore(); }
async function saveDecision(offerKey,status,notes='') {
  const item = currentOffer(offerKey); if (!item) return;
  const previous = decisionFor(offerKey), capturedAt = new Date().toISOString();
  const stored = Domain.appendDecision(previous,Decisions.normalizeDecision(status),String(notes || '').trim(),capturedAt);
  await Storage.put(Storage.STORES.decisions,stored);
  decisions = [...decisions.filter(entry => entry.offerKey !== offerKey),stored];
  show();
  const previousStatus = previous.history?.at(-1)?.status || Decisions.DEFAULT_DECISION;
  fireObservability(CurationObservability.recordDecision({
    origin:'hot-offers-ms',subjectId:subjectId(item),productKey:item.productKey,productName:item.productName,offerRefs:offerRefs(item),
    offerSnapshot:curationSnapshot(item),trends:trendsFor(offerKey),images:latestImagesSnapshot(imagesFor(offerKey)),glimpse:glimpseFor(item),
    decision:stored,previousStatus,
  }));
  view.showToast('Decisão salva para esta oferta.');
  view.refreshOffer(item);
}
async function saveTrend(offerKey,status,draft = {}) {
  const item = currentOffer(offerKey); if (!item) return;
  const old = trendsFor(offerKey), assessment = {
    assessmentId:crypto.randomUUID(),status,countries:[...new Set((draft.countries || []).filter(Boolean))].slice(0,5),
    productAge:draft.productAge || null,searchTerm:String(draft.term || item.productName).trim(),date:Trends.localDateKey(),capturedAt:new Date().toISOString(),
  };
  const stored = {...old,offerKey,offerId:item.offerId,productName:item.productName,assessments:Trends.appendAssessment(old.assessments,assessment)};
  await Storage.put(Storage.STORES.trends,stored);
  trends = [...trends.filter(entry => entry.offerKey !== offerKey),stored];
  show(); view.refreshOffer(item,'trends');
  fireObservability(CurationObservability.recordAssessment({origin:'hot-offers-ms',subjectId:subjectId(item),productKey:item.productKey,productName:item.productName,offerRefs:offerRefs(item),kind:'trends',assessment,summary:{status:Trends.resultLabel(status),searchTerm:assessment.searchTerm,countries:assessment.countries,productAge:assessment.productAge,capturedAt:assessment.capturedAt}}));
  view.showToast('Avaliação de Trends salva.');
}
async function addTrendCandidate(offerKey,value) {
  const item = currentOffer(offerKey), term = String(value || '').trim(); if (!item || !term) return;
  const old = trendsFor(offerKey), candidates = [...(old.keywordCandidates || [])];
  if (candidates.some(entry => Domain.normalize(entry) === Domain.normalize(term))) { view.showToast('Essa candidata já está registrada.'); return; }
  const stored = {...old,offerKey,offerId:item.offerId,productName:item.productName,keywordCandidates:[...candidates,term]};
  await Storage.put(Storage.STORES.trends,stored); trends = [...trends.filter(entry => entry.offerKey !== offerKey),stored];
  view.refreshOffer(item,'trends'); view.showToast('Candidata adicionada.');
}
async function removeTrendCandidate(offerKey,index) {
  const item = currentOffer(offerKey); if (!item) return;
  const old = trendsFor(offerKey), candidates = [...(old.keywordCandidates || [])]; candidates.splice(index,1);
  const stored = {...old,offerKey,offerId:item.offerId,productName:item.productName,keywordCandidates:candidates};
  await Storage.put(Storage.STORES.trends,stored); trends = [...trends.filter(entry => entry.offerKey !== offerKey),stored]; view.refreshOffer(item,'trends');
}
function openTrends(term) {
  const tab = window.open(Trends.exploreUrl(term),'google-trends-hot-offers-ms');
  if (tab) tab.focus(); else view.showToast('O navegador bloqueou a aba. Libere pop-ups para este endereço local.');
}
async function addManualCountry(offerKey,value) {
  const item = currentOffer(offerKey), code = String(value || '').trim().toUpperCase(); if (!item) return;
  if (!/^[A-Z]{2}$/.test(code)) { view.showToast('Informe um código de país com duas letras.'); return; }
  if (Domain.offerCountryCodes(item).includes(code)) { view.showToast(code + ' já está disponível para este produto.'); return; }
  const updated = {...item,manualCountries:[...new Set([...(item.manualCountries || []),code])]};
  await Storage.put(Storage.STORES.offers,updated); offers = offers.map(entry => entry.offerKey === offerKey ? updated : entry);
  show(); view.refreshOffer(updated,'trends'); view.showToast(code + ' adicionado manualmente; não faz parte do dado da fonte.');
}
async function saveImage(offerKey,country,status,candidates=[]) {
  const item = currentOffer(offerKey); if (!item) return;
  const old = imagesFor(offerKey), assessment = {
    assessmentId:crypto.randomUUID(),country,status,negativeKeywordCandidates:[...new Set(candidates.map(value=>String(value||'').trim()).filter(Boolean))],searchTerm:old.searchTerm || item.productName,
    date:Trends.localDateKey(),capturedAt:new Date().toISOString(),sampleSize:20,source:'google-images-manual',
  };
  const stored = {...old,offerKey,offerId:item.offerId,productName:item.productName,searchTerm:assessment.searchTerm,assessments:Images.appendAssessment(old.assessments,assessment)};
  await Storage.put(Storage.STORES.images,stored); images = [...images.filter(entry => entry.offerKey !== offerKey),stored];
  show(); view.refreshOffer(item,'images');
  fireObservability(CurationObservability.recordAssessment({origin:'hot-offers-ms',subjectId:subjectId(item),productKey:item.productKey,productName:item.productName,offerRefs:offerRefs(item),kind:'images',assessment,summary:{status:Images.resultLabel(status),country,searchTerm:assessment.searchTerm,sampleSize:20,negativeKeywordCandidates:assessment.negativeKeywordCandidates,capturedAt:assessment.capturedAt}}));
  view.showToast('Avaliação visual salva: ' + Images.resultLabel(status) + ' · ' + country + '.');
}
async function saveImageSearchTerm(offerKey,term) {
  const item = currentOffer(offerKey); if (!item) return;
  const old = imagesFor(offerKey), stored = {...old,offerKey,offerId:item.offerId,productName:item.productName,searchTerm:String(term || '').trim()};
  await Storage.put(Storage.STORES.images,stored); images = [...images.filter(entry => entry.offerKey !== offerKey),stored];
}
function openImages(term,country) {
  const tab = window.open(Images.imageSearchUrl(term,country),'google-images-hot-offers-ms');
  if (tab) tab.focus(); else view.showToast('O navegador bloqueou a aba. Libere pop-ups para este endereço local.');
}
function openImagesExcluding(term,country,candidates) {
  const tab = window.open(Images.imageSearchUrlExcluding(term,country,candidates),'google-images-hot-offers-ms');
  if (tab) tab.focus(); else view.showToast('O navegador bloqueou a aba. Libere pop-ups para este endereço local.');
}
function openGlimpse(item) {
  const frame = document.querySelector('#glimpseFrame');
  const params = new URLSearchParams({origin:'hot-offers-ms',scope:item.scope,productKey:item.productKey,product:item.productName,offerIds:item.offerId,embedded:'1'});
  const url = new URL('../glimpse/?' + params.toString(),location.href).href;
  if (frame.src !== url) frame.src = url;
}
window.addEventListener('message',event => {
  if (event.origin !== location.origin || event.source !== document.querySelector('#glimpseFrame').contentWindow || event.data?.type !== 'hub-glimpse-close') return;
  void refresh().then(() => { view.returnFromGlimpse(); view.showToast('Análise Glimpse atualizada.'); });
});

refresh().catch(error => {
  console.error('Falha ao abrir Hot Offers MS.',error);
  view.showToast('Não foi possível abrir os bancos locais de Hot Offers MS. Os bancos das outras telas não foram alterados.');
});

import * as Domain from './clickbank-top-offers-domain.mjs?v=2';
import * as Storage from './clickbank-top-offers-storage.mjs?v=4';
import {mountClickBankTopOffersView} from './clickbank-top-offers-view.mjs?v=14';
import {mountExtensionCapture} from './extension-capture.mjs?v=2';
import {mergeDtcCountries} from './dtc-country-capture.mjs?v=1';
import * as Trends from '../trends-domain.mjs';
import * as Images from '../image-search-domain.mjs';
import * as Glimpse from '../glimpse-domain.mjs';
import * as GlimpseStorage from '../glimpse-storage.mjs';
import * as CurationObservability from '../curation-observability.mjs';
import * as DecisionUI from '../decision-ui.mjs';
import {mountGlimpseHeaderAction} from '../glimpse-embed-controls.mjs?v=2';
import {mountCurationListFocus} from '../list-focus.mjs?v=3';

const root = document.querySelector('#clickbankTopOffersRoot');
let captures = [], offerMetadata = [], trends = [], images = [], decisions = [], glimpse = [], pending = null, saving = false;
const listFocus=mountCurationListFocus('clickbank-top-offers',{blockingSelector:'#offerSheet:not(.hidden), #sharedDecisionDialog[open]',highlightOnCapture:false,restoreOnWindowReturn:false,suppressPulseOnPageHide:true});
const view = mountClickBankTopOffersView({root, actions:{
  validateImport,confirmImport,exportBackup,restoreBackup,openTrends,saveTrend,saveDecision,
  addTrendCandidate,removeTrendCandidate,addManualCountry,saveImage,saveImageSearchTerm,
  openImages,openImagesExcluding,openGlimpse,restoreListFocus:()=>listFocus.restore(),
}});
mountGlimpseHeaderAction({frame:root.querySelector('#glimpseFrame'),panel:root.querySelector('[data-panel="glimpse"]'),backButton:root.querySelector('#closeSheet'),finishLabel:'Salvar',showSavedFeedback:true});

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
function show() { view.render({captures,offerMetadata,trends,images,decisions,glimpse}); }
async function refresh() {
  [captures,offerMetadata,trends,images,decisions] = await Promise.all([
    Storage.getAll(Storage.STORES.captures),Storage.getAll(Storage.STORES.offerMetadata),
    Storage.getAll(Storage.STORES.trends),Storage.getAll(Storage.STORES.images),Storage.getAll(Storage.STORES.decisions),
  ]);
  glimpse = await GlimpseStorage.getAllAnalyses().catch(() => []);
  show();
}
function fireObservability(promise) { Promise.resolve(promise).catch(error => console.warn('Não foi possível registrar a observabilidade da Curadoria.',error)); }
async function saveDecision(offerKey,status) {
  const item=currentOffer(offerKey);if(!item)return;
  const previous=decisions.find(record=>record.offerKey===offerKey)||{offerKey,currentStatus:DecisionUI.DEFAULT_DECISION,notes:'',history:[]};
  const normalized=DecisionUI.normalizeDecision(status),capturedAt=new Date().toISOString();
  const stored={...previous,offerKey,currentStatus:normalized,notes:previous.notes||'',updatedAt:capturedAt,history:[...(previous.history||[]),{status:normalized,capturedAt}]};
  try{await Storage.putDecision(stored);decisions=[...decisions.filter(record=>record.offerKey!==offerKey),stored];show();view.showMessage(`Decisão salva somente em Top Offers CB: ${normalized}.`)}
  catch(error){console.error('Não foi possível salvar a decisão Top Offers CB.',error);view.showMessage('Não foi possível salvar a decisão desta tela.',{error:true})}
}
function observabilityContext(item) {
  return {origin:'clickbank-top-offers',subjectId:`clickbank-top-offers:${item.offerKey}`,productKey:Glimpse.normalize(item.offerName),productName:item.offerName,offerRefs:[{origin:'clickbank-top-offers',offerKey:item.offerKey,seller:item.seller}]};
}

function validateImport(raw,extensionCapture=null) {
  const parsed = Domain.parseTopOffersClipboard(raw);
  const previous = latestMatching(parsed.listName || 'Top Offers');
  const compared = Domain.compareCapturedOffers(parsed.offers, previous?.offers || []);
  pending = {raw:String(raw),parsed,previous,compared,extensionCapture};
  view.showImportPreview({parsed,compared});
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
    view.selectCapture(capture.captureId);
    view.showMessage('Captura salva localmente. Valores ausentes continuam diferentes de zero.');
  } catch (error) {
    console.error('Não foi possível salvar a captura Top Offers CB.', error);
    view.showMessage('Não foi possível salvar a captura; os dados existentes foram preservados.', {error:true});
  } finally { saving = false; }
}

function openTrends(term) {
  const tab = window.open(Trends.exploreUrl(term),'google-trends-clickbank-top-offers');
  if (tab) tab.focus(); else view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true});
}
async function saveTrend(offerKey,status,draft={}) {
  const item = currentOffer(offerKey); if (!item) return;
  const old = trendsFor(item), assessment = {
    assessmentId:crypto.randomUUID(),status,countries:[...new Set((draft.countries || []).filter(Boolean))].slice(0,5),
    productAge:draft.productAge || null,searchTerm:String(draft.term || item.offerName).trim(),date:Trends.localDateKey(),capturedAt:new Date().toISOString(),
  };
  const stored = {...old,...baseRecord(item),assessments:Trends.appendAssessment(old.assessments,assessment)};
  await Storage.putOfferRecord(Storage.STORES.trends,stored); trends=replaceRecord(trends,stored); show();
  fireObservability(CurationObservability.recordAssessment({...observabilityContext(item),kind:'trends',assessment,summary:{status:Trends.resultLabel(status),searchTerm:assessment.searchTerm,countries:assessment.countries,productAge:assessment.productAge,capturedAt:assessment.capturedAt}}));
  view.showMessage('Avaliação de Google Trends salva.');
}
async function addTrendCandidate(offerKey,value) {
  const item=currentOffer(offerKey),term=String(value||'').trim(); if(!item||!term)return false;
  const old=trendsFor(item),candidates=[...(old.keywordCandidates||[])];
  if(candidates.some(entry=>Domain.normalize(entry)===Domain.normalize(term))){view.showMessage('Essa candidata já está na lista.');return false;}
  const stored={...old,...baseRecord(item),keywordCandidates:[...candidates,term]};
  try { await Storage.putOfferRecord(Storage.STORES.trends,stored);trends=replaceRecord(trends,stored);show();view.showMessage('Candidata à palavra-chave adicionada.');return true; }
  catch { view.showMessage('Não foi possível salvar a candidata.',{error:true});return false; }
}
async function removeTrendCandidate(offerKey,index) {
  const item=currentOffer(offerKey);if(!item)return false;
  const old=trendsFor(item),keywordCandidates=[...(old.keywordCandidates||[])];keywordCandidates.splice(index,1);
  const stored={...old,...baseRecord(item),keywordCandidates};
  try { await Storage.putOfferRecord(Storage.STORES.trends,stored);trends=replaceRecord(trends,stored);show();view.showMessage('Candidata à palavra-chave removida.');return true; }
  catch { view.showMessage('Não foi possível remover a candidata.',{error:true});return false; }
}
async function addManualCountry(offerKey,value) {
  const item=currentOffer(offerKey),code=String(value||'').trim().toUpperCase();if(!item)return false;
  if(!/^[A-Z]{2}$/.test(code)){view.showMessage('Informe um código de país com duas letras.',{error:true});return false;}
  const old=metadataFor(item);
  if(old.manualCountries.includes(code)){view.showMessage(`${code} já foi adicionado.`);return false;}
  const stored={...old,...baseRecord(item),manualCountries:[...old.manualCountries,code]};
  await Storage.putOfferRecord(Storage.STORES.offerMetadata,stored);offerMetadata=replaceRecord(offerMetadata,stored);show();view.showMessage(`${code} adicionado manualmente; não faz parte dos dados da ClickBank.`);return true;
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
async function saveImage(offerKey,country,status,candidates=[],{candidateOnly=false}={}) {
  const item=currentOffer(offerKey);if(!item)return false;
  const old=imagesFor(item),searchTerm=String(old.searchTerm||item.offerName).trim(),assessment={
    assessmentId:crypto.randomUUID(),country,status,negativeKeywordCandidates:[...new Set(candidates.map(value=>String(value||'').trim()).filter(Boolean))],searchTerm,
    date:Trends.localDateKey(),capturedAt:new Date().toISOString(),sampleSize:20,source:'google-images-manual',
  };
  const stored={...old,...baseRecord(item),searchTerm,assessments:Images.appendAssessment(old.assessments,assessment)};
  await Storage.putOfferRecord(Storage.STORES.images,stored);images=replaceRecord(images,stored);show();
  fireObservability(CurationObservability.recordAssessment({...observabilityContext(item),kind:'images',assessment,summary:{status:Images.resultLabel(status),country,searchTerm,sampleSize:20,negativeKeywordCandidates:assessment.negativeKeywordCandidates,capturedAt:assessment.capturedAt}}));
  view.showMessage(candidateOnly?'Candidatas negativas salvas.':`Avaliação visual salva: ${Images.resultLabel(status)} · ${country}.`);
  return true;
}
async function saveImageSearchTerm(offerKey,term) {
  const item=currentOffer(offerKey);if(!item)return;
  const old=imagesFor(item),stored={...old,...baseRecord(item),searchTerm:String(term||'').trim()||item.offerName};
  await Storage.putOfferRecord(Storage.STORES.images,stored);images=replaceRecord(images,stored);show();
}
function openImages(term,country) {
  const tab=window.open(Images.imageSearchUrl(term,country),'google-images-clickbank-top-offers');
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
  if(!input||event.key!=='Enter')return;
  event.preventDefault();
  const country=input.dataset.imageCandidateInput,item=currentOffer(view.getActiveOfferKey());if(!item)return;
  const latest=Images.latestByCountry(imagesFor(item).assessments).get(country),current=latest?.negativeKeywordCandidates||[],term=input.value.trim();if(!term)return;
  if(current.some(value=>Domain.normalize(value)===Domain.normalize(term))){view.showMessage('Essa candidata já está na lista.');input.value='';input.focus();return;}
  if(!latest?.status){view.showMessage('Selecione um resultado visual antes de salvar candidatas.',{error:true});return;}
  input.disabled=true;
  void saveImage(item.offerKey,country,latest.status,[...current,term],{candidateOnly:true}).then(saved=>{const fresh=[...root.querySelectorAll('[data-image-candidate-input]')].find(candidate=>candidate.dataset.imageCandidateInput===country);if(saved&&fresh){fresh.value='';fresh.disabled=false;fresh.focus();}else if(fresh)fresh.disabled=false;}).catch(error=>{console.error(error);view.showMessage('Não foi possível salvar a candidata.',{error:true});const fresh=[...root.querySelectorAll('[data-image-candidate-input]')].find(candidate=>candidate.dataset.imageCandidateInput===country);if(fresh)fresh.disabled=false;});
});
window.addEventListener('message',event=>{
  const frame=root.querySelector('#glimpseFrame');
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='hub-glimpse-resize'){const height=Number(event.data.height);if(Number.isFinite(height))frame.style.height=`${Math.max(320,Math.ceil(height))}px`;return;}
  if(event.data?.type==='hub-glimpse-close')void refresh().then(()=>{view.returnFromGlimpse();view.showMessage('Análise Glimpse atualizada.');});
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

const initialLoad = refresh();
initialLoad.catch(error=>{console.error('Não foi possível abrir o banco local Top Offers CB.',error);view.showMessage('Não foi possível abrir o armazenamento local desta tela.',{error:true});});
mountExtensionCapture({target:window,ready:initialLoad,getBusy:()=>saving,getDraft:()=>root.querySelector('#pasteArea').value,
  preparePreview:(raw,metadata)=>{view.prepareImport(raw);validateImport(raw,metadata);},
  getOffers:()=>captures.flatMap(capture=>capture.offers||[]),
  saveDtcCountries,
});

import * as Domain from './smartadv-offers-domain.mjs?v=4';
import * as Storage from './smartadv-offers-storage.mjs?v=3';
import {createInitialCapture} from './smartadv-offers-initial-capture.mjs?v=3';
import {mountSmartAdvOffersView} from './smartadv-offers-view.mjs?v=14';
import * as Trends from '../trends-domain.mjs';
import * as Images from '../image-search-domain.mjs';
import * as Glimpse from '../glimpse-domain.mjs';
import * as GlimpseStorage from '../glimpse-storage.mjs';
import * as CurationObservability from '../curation-observability.mjs';
import {mountCurationListFocus} from '../list-focus.mjs?v=2';
import * as DecisionUI from '../decision-ui.mjs';
import {mountGlimpseHeaderAction} from '../glimpse-embed-controls.mjs?v=2';

const root = document.querySelector('#smartAdvOffersRoot');
let captures = [], trends = [], images = [], decisions = [], glimpse = [], pending = null, saving = false;
const view = mountSmartAdvOffersView({root,actions:{validateImport,confirmImport,exportBackup,restoreBackup,saveTrend,saveDecision,addTrendCandidate,removeTrendCandidate,addManualCountry,openTrends,saveImage,saveImageSearchTerm,openImages,openImagesExcluding,openGlimpse,closeOffer}});
const listFocus = mountCurationListFocus('smartadv-offers',{blockingSelector:'#offerSheet:not(.hidden), #sharedDecisionDialog[open]'});
mountGlimpseHeaderAction({frame:document.querySelector('#glimpseFrame'),panel:document.querySelector('[data-panel="glimpse"]'),backButton:document.querySelector('#closeSheet')});

function offerContext(item) {
  const productName = Domain.productNameFromOfferName(item.offerName) || item.offerName;
  return {offerKey:`smartadv:${item.offerId}`,offerId:String(item.offerId),productName,productKey:Glimpse.normalize(productName)};
}
function trendFor(item) { const key=offerContext(item).offerKey;return trends.find(record=>record.offerKey===key)||{offerKey:key,assessments:[],keywordCandidates:[],manualCountries:[]}; }
function imagesFor(item) { const key=offerContext(item).offerKey;return images.find(record=>record.offerKey===key)||{offerKey:key,assessments:[],searchTerm:''}; }
function countryCodes(item) { return [...new Set([...(item.geoTargets||[]),...(trendFor(item).manualCountries||[])].map(value=>String(value||'').trim().toUpperCase()).filter(value=>/^[A-Z]{2}$/.test(value)))]; }
function show() { view.render({captures,trends,images,decisions,glimpse}); }
function updateRecord(records, next) { return [...records.filter(record=>record.offerKey!==next.offerKey),next]; }
function recordAssessment(kind,item,assessment) {
  const context=offerContext(item),event=CurationObservability.recordAssessment({origin:'smartadv-offers',subjectId:`smartadv-offers:${context.offerId}`,productKey:context.productKey,productName:context.productName,offerRefs:[{origin:'smartadv-offers',offerId:context.offerId}],kind,assessment,summary:kind==='trends'?{status:Trends.resultLabel(assessment.status),searchTerm:assessment.searchTerm,countries:assessment.countries,productAge:assessment.productAge,capturedAt:assessment.capturedAt}:{status:Images.resultLabel(assessment.status),country:assessment.country,searchTerm:assessment.searchTerm,sampleSize:20,negativeKeywordCandidates:assessment.negativeKeywordCandidates,capturedAt:assessment.capturedAt}});
  Promise.resolve(event).catch(error=>console.warn('Não foi possível registrar a avaliação na Observabilidade da Curadoria.',error));
}

async function refresh() {
  [captures,trends,images,decisions]=await Promise.all([Storage.getAll(Storage.STORES.captures),Storage.getAll(Storage.STORES.trends),Storage.getAll(Storage.STORES.images),Storage.getAll(Storage.STORES.decisions)]);
  if(!captures.length){await Storage.seedInitialCaptureIfEmpty(createInitialCapture());captures=await Storage.getAll(Storage.STORES.captures)}
  glimpse=await GlimpseStorage.getAllAnalyses().catch(()=>[]);
  show();
}
function validateImport(raw) {
  const parsed=Domain.parseSmartAdvOffersClipboard(raw);pending={raw:String(raw),parsed};view.showImportPreview({parsed});return parsed;
}
async function confirmImport(raw) {
  if(saving)return;
  if(!pending||pending.raw!==String(raw)){validateImport(raw);view.showMessage('A colagem foi validada novamente. Confira a prévia e salve outra vez.');return}
  const parsed=Domain.parseSmartAdvOffersClipboard(raw);if(!parsed.valid){validateImport(raw);return}
  saving=true;
  try{
    const capture={captureId:`smartadv-${crypto.randomUUID()}`,capturedAt:new Date().toISOString(),sourceFormat:parsed.sourceFormat,coverage:parsed.coverage,offers:parsed.offers};
    await Storage.saveCapture(capture);pending=null;root.querySelector('#pasteArea').value='';view.closeImport();await refresh();view.showMessage('Captura SmartAdv salva localmente. Nenhuma ausência foi interpretada como oferta removida.');
  }catch(error){console.error('Não foi possível salvar a captura SmartAdv.',error);view.showMessage('Não foi possível salvar a captura; os dados locais existentes foram preservados.',{error:true})}
  finally{saving=false}
}
async function exportBackup() {
  try{const backup=await Storage.exportBackup(),blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`smartadv-curadoria-backup-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);view.showMessage(`Backup exportado: ${backup.captures.length} capturas, ${backup.trends.length} avaliações de Trends e ${backup.images.length} registros de Imagens.`)}
  catch(error){console.error('Não foi possível exportar o backup SmartAdv.',error);view.showMessage('Falha ao exportar o backup JSON.',{error:true})}
}
async function restoreBackup(file) {
  try{const payload=JSON.parse(await file.text()),result=await Storage.mergeBackup(payload);await refresh();view.showMessage(`Restauração mesclada: ${result.added} registro(s) adicionado(s), ${result.merged} histórico(s) combinado(s), ${result.unchanged} sem alteração e ${result.conflicts} conflito(s) de captura preservado(s).`)}
  catch(error){console.warn('Backup SmartAdv rejeitado.',error);view.showMessage(error instanceof SyntaxError?'O arquivo selecionado não contém JSON válido.':error?.message||'Não foi possível restaurar o backup.',{error:true})}
}

async function saveDecision(item,status) {
  const context=offerContext(item),old=decisions.find(record=>record.offerKey===context.offerKey)||{offerKey:context.offerKey,currentStatus:DecisionUI.DEFAULT_DECISION,notes:'',history:[]};
  const normalized=DecisionUI.normalizeDecision(status),capturedAt=new Date().toISOString();
  const stored={...old,...context,currentStatus:normalized,notes:old.notes||'',updatedAt:capturedAt,history:[...(old.history||[]),{status:normalized,capturedAt}]};
  try{await Storage.putDecision(stored);decisions=[...decisions.filter(record=>record.offerKey!==stored.offerKey),stored];show();view.showMessage(`Decisão salva somente em Ofertas SmartAdv: ${normalized}.`)}
  catch(error){console.error('Não foi possível salvar a decisão SmartAdv.',error);view.showMessage('Não foi possível salvar a decisão desta tela.',{error:true})}
}

async function saveTrend(item,status,draft={}) {
  const context=offerContext(item),old=trendFor(item),assessment={assessmentId:crypto.randomUUID(),status,countries:[...new Set((draft.countries||[]).filter(value=>countryCodes(item).includes(value)))].slice(0,5),productAge:draft.productAge||null,searchTerm:String(draft.term||context.productName).trim(),date:Trends.localDateKey(),capturedAt:new Date().toISOString()};
  const stored={...old,...context,assessments:Trends.appendAssessment(old.assessments,assessment)};
  try{await Storage.put(Storage.STORES.trends,stored);trends=updateRecord(trends,stored);show();view.refreshOffer(item,'trends');recordAssessment('trends',item,assessment);view.showMessage('Avaliação de Google Trends salva.');return true}
  catch(error){console.error(error);view.showMessage('Não foi possível salvar a avaliação de Google Trends.',{error:true});return false}
}
async function addTrendCandidate(item,value) {
  const context=offerContext(item),term=String(value||'').trim();if(!term)return false;
  const old=trendFor(item),candidates=[...(old.keywordCandidates||[])];
  if(candidates.some(entry=>Glimpse.normalize(entry)===Glimpse.normalize(term))){view.showMessage('Essa candidata já está na lista.');return false}
  const stored={...old,...context,keywordCandidates:[...candidates,term]};
  try{await Storage.put(Storage.STORES.trends,stored);trends=updateRecord(trends,stored);show();view.refreshOffer(item,'trends');view.showMessage('Candidata à palavra-chave adicionada.');return true}
  catch(error){console.error(error);view.showMessage('Não foi possível salvar a candidata.',{error:true});return false}
}
async function removeTrendCandidate(item,index) {
  const context=offerContext(item),old=trendFor(item),candidates=[...(old.keywordCandidates||[])];candidates.splice(index,1);
  const stored={...old,...context,keywordCandidates:candidates};
  try{await Storage.put(Storage.STORES.trends,stored);trends=updateRecord(trends,stored);show();view.refreshOffer(item,'trends');view.showMessage('Candidata à palavra-chave removida.');return true}
  catch(error){console.error(error);view.showMessage('Não foi possível remover a candidata.',{error:true});return false}
}
async function addManualCountry(item,value) {
  const code=String(value||'').trim().toUpperCase(),context=offerContext(item);if(!/^[A-Z]{2}$/.test(code)){view.showMessage('Informe o código ISO de duas letras do país.',{error:true});return false}
  const old=trendFor(item),countries=countryCodes(item);if(countries.includes(code)){view.showMessage(`${code} já está disponível para este produto.`,{error:true});return false}
  const stored={...old,...context,manualCountries:[...new Set([...(old.manualCountries||[]),code])]};
  try{await Storage.put(Storage.STORES.trends,stored);trends=updateRecord(trends,stored);show();view.refreshOffer(item,'trends');return true}
  catch(error){console.error(error);view.showMessage('Não foi possível adicionar o país.',{error:true});return false}
}
function openTrends(term) { const tab=window.open(Trends.exploreUrl(term),'google-trends-smartadv');if(tab)tab.focus();else view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true}); }

async function saveImage(item,country,status,candidates=[],{candidateOnly=false}={}) {
  const context=offerContext(item),old=imagesFor(item),assessment={assessmentId:crypto.randomUUID(),country,status,negativeKeywordCandidates:[...new Set(candidates.map(value=>String(value||'').trim()).filter(Boolean))],searchTerm:old.searchTerm||context.productName,date:Trends.localDateKey(),capturedAt:new Date().toISOString(),sampleSize:20,source:'google-images-manual'};
  const stored={...old,...context,searchTerm:assessment.searchTerm,assessments:Images.appendAssessment(old.assessments,assessment)};
  try{await Storage.put(Storage.STORES.images,stored);images=updateRecord(images,stored);show();view.refreshOffer(item,'images');recordAssessment('images',item,assessment);view.showMessage(candidateOnly?`Candidatas negativas salvas · ${country}.`:`Avaliação visual salva: ${Images.resultLabel(status)} · ${country}.`);return true}
  catch(error){console.error(error);view.showMessage('Não foi possível salvar a avaliação de Google Imagens.',{error:true});throw error}
}
async function saveImageSearchTerm(item,term) {
  const context=offerContext(item),old=imagesFor(item),stored={...old,...context,searchTerm:String(term||'').trim()};
  await Storage.put(Storage.STORES.images,stored);images=updateRecord(images,stored);
}
function openImages(term,country) { const tab=window.open(Images.imageSearchUrl(term,country),'google-images-smartadv');if(tab)tab.focus();else view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true}); }
function openImagesExcluding(term,country,candidates) { const tab=window.open(Images.imageSearchUrlExcluding(term,country,candidates),'google-images-smartadv');if(tab)tab.focus();else view.showMessage('O navegador bloqueou a aba. Libere pop-ups para este endereço local.',{error:true}); }
function openGlimpse(item) {
  const context=offerContext(item),frame=document.querySelector('#glimpseFrame');
  const params=new URLSearchParams({origin:'smartadv-offers',productKey:context.productKey,product:context.productName,offerIds:context.offerId,embedded:'1'});
  const url=new URL('../glimpse/?'+params.toString(),location.href).href;if(frame.src!==url)frame.src=url;
}
function closeOffer(){listFocus.restore()}
window.addEventListener('message',event=>{
  const frame=document.querySelector('#glimpseFrame');if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='hub-glimpse-resize'){const height=Number(event.data.height);if(Number.isFinite(height))frame.style.height=`${Math.max(320,Math.ceil(height))}px`;return}
  if(event.data?.type!=='hub-glimpse-close')return;
  void refresh().then(()=>{view.returnFromGlimpse();view.showMessage('Análise Glimpse atualizada.')});
});

refresh().catch(error=>{console.error('Não foi possível abrir o banco local SmartAdv.',error);view.showMessage('Não foi possível abrir o armazenamento local desta tela.',{error:true})});

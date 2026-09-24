import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as Domain from '../src/curadoria/curation-observability-domain.mjs';

const assessment={assessmentId:'assess-1',status:'stable',capturedAt:'2026-09-20T10:00:00.000Z',searchTerm:'Produto alfa',countries:['DE']};
const eventA=Domain.createAssessmentEvent({origin:'guru-media-lista-gerente',subjectId:'manager-product:offer-1',productKey:'prod-1',productName:'Produto Á',assessment,eventType:'trends_saved',summary:{status:'Estável'}});
const eventB=Domain.createAssessmentEvent({origin:'guru-media-lista-gerente',subjectId:'manager-product:offer-1',productKey:'prod-1',productName:'Produto Á',assessment,eventType:'trends_saved',summary:{status:'Estável'}});
assert.equal(eventA.event.eventId,eventB.event.eventId,'mesma avaliação reprocessada precisa conservar idempotência');
assert.equal(eventA.event.productNameKey,'produto a','filtro indexado normaliza acento/capitalização');
assert.equal(eventA.detail.payload.assessmentId,'assess-1');
assert.deepEqual(eventA.event.offerRefs,[]);
assert.equal(Domain.decisionNeedsSnapshot('Revisar','Subir campanha'),true);
assert.equal(Domain.decisionNeedsSnapshot('Subir campanha','Subir campanha'),false);
assert.equal(Domain.decisionNeedsSnapshot('Subir campanha','Campanha no ar'),false);

const originalTrends={keywordCandidates:['alfa'],assessments:[{assessmentId:'old',status:'down'},assessment]};
const originalImages={currentByCountry:[{assessmentId:'img-1',country:'DE',status:'dominant',searchTerm:'Produto Á',negativeKeywordCandidates:[]}]};
const originalGlimpse={analysisId:'glimpse-1',capturedAt:'2026-09-20T09:00:00.000Z',signal:{level:'strong'},parsed:{volume:{display:'4K'},movement:{percent:2}},indicators:{intent:{level:'high'},coverage:{level:'good'}},rawSanitized:'large raw payload must remain referenced, not copied'};
const decision={notes:'avaliar oferta',history:[{status:'Não definido',capturedAt:'2026-09-20T09:00:00.000Z'},{status:'Subir campanha',capturedAt:'2026-09-20T11:00:00.000Z'}]};
const input={origin:'guru-media-ecommerce-gm',subjectId:'ecommerce-offer:42',productKey:'prod-1',productName:'Produto Á',offerRefs:[{origin:'guru-media-ecommerce-gm',offerId:'42'}],offerSnapshot:{offerId:'42',payout:50},trends:originalTrends,images:originalImages,glimpse:originalGlimpse,decision,previousStatus:'Revisar'};
const bundle=Domain.createDecisionBundle(input),repeat=Domain.createDecisionBundle(input);
assert.ok(bundle.snapshot,'entrada em Subir campanha deve congelar snapshot_decisao');
assert.equal(bundle.snapshot.snapshot_type,'snapshot_decisao');
assert.equal(bundle.snapshot.signals.trends.latestAssessment.assessmentId,'assess-1');
assert.equal(bundle.snapshot.signals.trends.assessments,undefined,'snapshot não duplica histórico completo de Trends');
assert.deepEqual(bundle.snapshot.signals.images.currentByCountry.map(item=>item.country),['DE']);
assert.equal(bundle.snapshot.signals.glimpse.analysisId,'glimpse-1');
assert.equal(bundle.snapshot.automatic_signal,'Positivo','snapshot congela o resultado que corresponde aos três componentes favoráveis');
assert.deepEqual(bundle.snapshot.automatic_signal_coverage,{available:3,total:3,label:'3/3'});
assert.equal(bundle.snapshot.automatic_signal_version,'1.0.0');
assert.deepEqual(Object.keys(bundle.snapshot.automatic_signal_components),['trends','images','glimpse']);
assert.equal(bundle.snapshot.automatic_signal_components.trends.status,'stable');
assert.equal(bundle.snapshot.automatic_signal_captured_at,'2026-09-20T11:00:00.000Z');
assert.equal(JSON.stringify(bundle.snapshot).includes('large raw payload'),false,'snapshot não duplica payload pesado do Glimpse');
assert.deepEqual(bundle.detail.payload,{status:'Subir campanha',notes:'avaliar oferta',occurredAt:'2026-09-20T11:00:00.000Z'},'evento de decisão guarda delta compacto, sem histórico inteiro');
assert.equal(bundle.snapshot.snapshotId,repeat.snapshot.snapshotId);
assert.equal(bundle.event.eventId,repeat.event.eventId);
assert.equal(bundle.correlation.status,'pending','associação operacional nunca é confirmada por inferência');
originalTrends.assessments[1].status='down';originalImages.currentByCountry[0].status='absent';
assert.equal(bundle.snapshot.signals.trends.latestAssessment.status,'stable','alterações posteriores não podem mudar o snapshot');
assert.equal(bundle.snapshot.signals.images.currentByCountry[0].status,'dominant');
assert.equal(bundle.snapshot.automatic_signal_components.trends.status,'stable','os componentes congelados também permanecem imutáveis');
const legacyRule={label:'Misto',coverage:{available:2,total:3,label:'2/3'},version:'0.9.0',components:{trends:{status:'down'},images:{status:'dominant'}}};
const legacySnapshot=Domain.createDecisionBundle({...input,automaticSignal:legacyRule}).snapshot;
legacyRule.label='Fraco';legacyRule.components.trends.status='stable';
assert.equal(legacySnapshot.automatic_signal,'Misto','snapshot não recalcula resultado com alteração posterior de regra');
assert.equal(legacySnapshot.automatic_signal_version,'0.9.0','snapshot preserva a versão original');
assert.equal(legacySnapshot.automatic_signal_components.trends.status,'down','snapshot congela componentes da versão original');
assert.equal(legacySnapshot.decision.status,'Subir campanha','sinal automático não substitui decisão manual');
const noSnapshot=Domain.createDecisionBundle({...input,previousStatus:'Subir campanha'});
assert.equal(noSnapshot.snapshot,null,'evento posterior não recria snapshot sem nova transição para Subir campanha');

const candidates=Domain.summarizeOperationalCandidates([
  {product_id:'p-1',product_name:'Produto A',test_id:'test-a',account_id:'6497',campaign_id:'c-1'},
  {product_id:'p-1',product_name:'produto a',test_id:'test-a',account_id:'6497',campaign_id:'c-2'},
  {product_id:'p-1',product_name:'Produto A',test_id:'test-b',account_id:'7527',campaign_id:'c-3'},
  {product_id:'p-2',product_name:'Produto A',test_id:'test-c',account_id:'987',campaign_id:'c-4',metadata:{identity_confidence:'ambiguous'}},
  {product_id:'p-3',product_name:'Outro Produto',test_id:'test-d',account_id:'987',campaign_id:'c-5'},
], 'PRODUTO Á');
assert.equal(candidates.length,1,'nome normalizado sugere, mas nunca confirma, só candidatos válidos');
assert.equal(candidates[0].product_id,'p-1');
assert.equal(candidates[0].tests.length,2,'um produto pode ligar múltiplos testes/contas');
assert.equal(candidates[0].tests[0].campaigns.length,2,'iterações são agrupadas sem perder campanhas');

const storage=await readFile(new URL('../src/curadoria/curation-observability-storage.mjs',import.meta.url),'utf8');
const view=await readFile(new URL('../src/curadoria/curation-observability-view.mjs',import.meta.url),'utf8');
const manager=await readFile(new URL('../src/curadoria/gerentes/index.html',import.meta.url),'utf8');
const top=await readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8');
assert.ok(storage.includes("'byOccurredAtEventId'")&&storage.includes("'byProductNameDate'")&&storage.includes("'byOriginDate'")&&storage.includes("'byTypeDate'")&&storage.includes("'byDecisionDate'"),'stores devem indexar as pesquisas/filtros da tela');
assert.ok(storage.includes('events.get(event.eventId)')&&storage.includes('events.get(bundle.event.eventId)'),'idempotência usa lookup pela chave, não varredura');
assert.ok(storage.includes('index.openCursor(range,direction)')&&storage.includes('scanLimit=600'),'listagem deve paginar por índice com limite de trabalho');
assert.ok(storage.includes('export async function exportBackup()')&&storage.includes('getAll()'),'exportação integral existe somente como ação explícita de backup');
const recordActionSource=storage.slice(storage.indexOf('export async function recordAction'),storage.indexOf('export async function getEvent('));
const recordDecisionSource=storage.slice(storage.indexOf('export async function recordDecisionBundle'),storage.indexOf('export async function getEvent('));
assert.equal(recordActionSource.includes('getAll'),false,'salvar evento não lê stores inteiras');
assert.equal(recordDecisionSource.includes('getAll'),false,'salvar snapshot não lê stores inteiras');
assert.ok(view.includes("limit:30,scanLimit:600")&&view.includes('Repository.listEventsPage'),'tela busca página limitada, não histórico completo');
assert.ok(view.includes('Repository.getEventDetail(event.detailId)')&&view.includes('Repository.getSnapshot(event.snapshotId)'),'detalhes pesados só são lidos ao expandir linha');
assert.ok(view.includes('getOperationalEvents()')&&view.includes('data-find-candidates'),'correlação operacional é buscada sob demanda, não em cada abertura/salvamento');
assert.equal(view.includes('Repository.exportBackup()'),true);
assert.ok(manager.includes('setTimeout(()=>void captureManagerPersistedWrite(detail),0)')&&top.includes('setTimeout(()=>void captureTopPersistedWrite(detail),0'),'captura observacional não bloqueia o salvamento/fechamento principal');
assert.ok(!manager.includes('await CurationObservability.ready')&&!top.includes('await CurationObservability.ready'),'banco de Curadoria não é aberto no caminho de inicialização das listas');
console.log('curation observability domain and incremental storage contracts ok');

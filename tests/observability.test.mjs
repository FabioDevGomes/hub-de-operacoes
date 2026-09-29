import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/database.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},structuredClone,Date});
vm.runInContext(source,context);
const db=context.window.CampaignDatabase;

function metrics({date='2026-09-20',account='3248 - MCC',impressions=0,clicks=0,cost=0,conversions=0,revenue=0,campaignState='Enabled',qualification='Eligible',geo='DE'}={}){
  const field=valor=>({valor,estado:'valido'});
  return{presente:true,data:field(date),conta:field(account),moeda:field('USD'),impressoes:field(impressions),cliques_google:field(clicks),custo_total:field(cost),conversoes:field(conversions),valor_conversao:field(revenue),cpa_desejado:field(45),orcamento_diario:field(100),estrategia_lance:field('Target CPA'),porcentagem_impressao_primeira_posicao:field(12),porcentagem_impressao_parte_superior:field(34),estado_campanha:field(campaignState),status_qualificacao:field(qualification),status_campanha:field(qualification),geo:field(geo)};
}
const rowFactory=campaign=>Object.entries({metricas_D_menos_1:campaign.metricas_D_menos_1,metricas_D_zero:campaign.metricas_D_zero}).filter(([,value])=>value?.presente).map(([key,value])=>({date:value.data.valor,period:key==='metricas_D_zero'?'d0':'d1',cells:{A:{value:value.data.valor},B:{value:value.impressoes.valor},C:{value:value.cliques_google.valor},F:{value:value.conversoes.valor},O:{value:value.custo_total.valor},P:{value:value.valor_conversao.valor}}}));
const campaign=(name,options={})=>({nome_campanha_exato:name,metricas_D_zero:metrics(options)});
const manifest=(campaigns,date='2026-09-20')=>({separacao_temporal:{D_zero:{datas_detectadas:[date]}},campanhas:campaigns});

const first=db.importManifest(db.create(),manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60')]),rowFactory,{source:'test-preparador'});
assert.deepEqual(JSON.parse(JSON.stringify(first.events.map(event=>event.event_type).sort())),['account_first_seen','account_first_used','test_iteration_created']);
const initial=first.base.event_log;
const iteration=initial.find(event=>event.event_type==='test_iteration_created');
assert.equal(iteration.source,'test-preparador');
assert.equal(iteration.account_id,'3248');
assert.equal(iteration.product_name,'VitaSlimex');
assert.equal(iteration.product_id,'product:vitaslimex');
assert.equal(iteration.test_id,'test:vitaslimex|account:3248');
assert.equal(iteration.iteration_id,iteration.campaign_id);
assert.equal(iteration.geo,'DE');
assert.equal(iteration.snapshot.periods.D_zero.custo_total.valor,0);
assert.equal(iteration.snapshot.periods.D_zero.cpa_real,null);
assert.equal(iteration.snapshot.periods.D_zero.status_campanha_observado.valor,'Enabled');
assert.equal(iteration.snapshot.periods.D_zero.status_qualificacao.valor,'Eligible');
assert.equal(first.events.some(event=>event.event_type==='campaign_delivery_started'),false,'sinais positivos na primeira coleta não comprovam início observado da entrega');

const metricsBaseline=db.importManifest(db.create(),manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:100,clicks:10,cost:5,conversions:1,revenue:20})]),rowFactory,{source:'preparador_mcc'});
const metricsOnly=db.importManifest(metricsBaseline.base,manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:150,clicks:15,cost:7,conversions:2,revenue:40})]),rowFactory,{overwrite:true,source:'preparador_mcc'});
assert.equal(metricsOnly.events.length,0,'alteração isolada de métricas não deve criar eventos operacionais');

const repeated=db.importManifest(first.base,manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60')]),rowFactory,{source:'test-preparador'});
assert.equal(repeated.events.length,0,'reimportar o mesmo manifesto não gera eventos duplicados');
assert.equal(repeated.base.event_log.length,initial.length);

const withSibling=db.importManifest(repeated.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60'),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60',{account:'3248 - MCC'}),
]),rowFactory,{source:'preparador_mcc'});
const siblingEvent=withSibling.events.find(event=>event.event_type==='test_iteration_created');
assert.ok(siblingEvent);
assert.equal(siblingEvent.test_id,iteration.test_id,'iterações do mesmo produto e conta pertencem ao mesmo teste');
assert.equal(siblingEvent.product_id,iteration.product_id);
assert.notEqual(siblingEvent.iteration_id,iteration.iteration_id,'cada campanha é uma iteração independente');
assert.equal(withSibling.events.some(event=>event.event_type==='account_first_seen'),false);

const delivering=db.importManifest(withSibling.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{date:'2026-09-21',impressions:40,clicks:4,cost:2,conversions:1,revenue:85}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60',{date:'2026-09-21'}),
],'2026-09-21'),rowFactory,{overwrite:true,source:'hub_excel_sync'});
const delivery=delivering.events.find(event=>event.event_type==='campaign_delivery_started');
assert.ok(delivery,'campanha previamente observada sem entrega deve gerar evento ao iniciar entrega em outro dia');
assert.equal(delivery.metadata.observation_date,'2026-09-21');
assert.equal(delivery.snapshot.periods.D_zero.cpa_real,2);
assert.equal(delivery.snapshot.periods.D_zero.roi,4150);
assert.equal(delivery.snapshot.periods.D_zero.valor_conversao.valor,85);
assert.equal(delivery.snapshot.periods.D_zero.porcentagem_impressao_parte_superior.valor,34);

const invalidPrior=structuredClone(withSibling.base);
invalidPrior.diario.find(row=>row.campanha_id===iteration.campaign_id).celulas.O={value:'valor inválido'};
const invalidBaseline=db.importManifest(invalidPrior,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{date:'2026-09-21',impressions:40,clicks:4,cost:2}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60',{date:'2026-09-21'}),
],'2026-09-21'),rowFactory,{overwrite:true,source:'preparador_mcc'});
assert.equal(invalidBaseline.events.some(event=>event.event_type==='campaign_delivery_started'&&event.campaign_id===iteration.campaign_id),false,'métrica anterior inválida não pode ser interpretada como custo zero');

const statusChanged=db.importManifest(delivering.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:40,clicks:4,cost:2,conversions:1,revenue:85,campaignState:'Paused',qualification:'Disapproved'}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60'),
]),rowFactory,{overwrite:true,source:'preparador_mcc'});
assert.equal(statusChanged.events.filter(event=>event.event_type==='campaign_status_changed').length,1);
const stateEvent=statusChanged.events.find(event=>event.event_type==='campaign_status_changed');
assert.equal(stateEvent.metadata.from_status,'Enabled');
assert.equal(stateEvent.metadata.to_status,'Paused');
assert.equal(stateEvent.snapshot.status_qualificacao,'Disapproved');

const statusReverted=db.importManifest(statusChanged.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:40,clicks:4,cost:2,conversions:1,revenue:85,campaignState:'Enabled',qualification:'Eligible'}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60'),
]),rowFactory,{overwrite:true,source:'preparador_mcc'});
const statusChangedAgain=db.importManifest(statusReverted.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:40,clicks:4,cost:2,conversions:1,revenue:85,campaignState:'Paused',qualification:'Disapproved'}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60'),
]),rowFactory,{overwrite:true,source:'preparador_mcc'});
const repeatedStatusEvent=statusChangedAgain.events.find(event=>event.event_type==='campaign_status_changed');
assert.ok(repeatedStatusEvent,'uma segunda transição real, mesmo no mesmo dia, deve ser registrada');
assert.notEqual(repeatedStatusEvent.event_id,stateEvent.event_id,'transições distintas não podem colidir na chave de idempotência');
assert.equal(repeatedStatusEvent.metadata.from_status,'Enabled');
assert.equal(repeatedStatusEvent.metadata.to_status,'Paused');
const sameStatusAgain=db.importManifest(statusChangedAgain.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:40,clicks:4,cost:2,conversions:1,revenue:85,campaignState:'Paused',qualification:'Disapproved'}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60'),
]),rowFactory,{overwrite:true,source:'preparador_mcc'});
assert.equal(sameStatusAgain.events.length,0,'reimportar o mesmo estado após uma transição repetida continua idempotente');

const qualificationOnly=db.importManifest(statusChanged.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{impressions:40,clicks:4,cost:2,conversions:1,revenue:85,campaignState:'Paused',qualification:'Eligible'}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60'),
]),rowFactory,{overwrite:true,source:'preparador_mcc'});
assert.equal(qualificationOnly.events.filter(event=>event.event_type==='campaign_status_changed').length,0,'mudança de qualificação não deve ser confundida com estado operacional');
assert.equal(qualificationOnly.events.filter(event=>event.event_type==='campaign_delivery_started').length,0,'evento de entrega é idempotente');

const differentAccount=db.importManifest(qualificationOnly.base,manifest([
  campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{account:'9999 - MCC'}),
  campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60'),
  campaign('20/09 - VitaSlimex 03 (GM) 75% - U$ 60',{account:'9999 - MCC'}),
]),rowFactory,{overwrite:true,source:'preparador_mcc'});
const accountTest=differentAccount.base.event_log.find(event=>event.event_type==='test_iteration_created'&&event.account_id==='9999');
assert.equal(accountTest.product_id,iteration.product_id);
assert.equal(accountTest.test_id,'test:vitaslimex|account:9999');
assert.equal(differentAccount.events.filter(event=>event.event_type==='account_first_seen'&&event.account_id==='9999').length,1,'nova conta deve registrar primeiro aparecimento');
assert.equal(differentAccount.events.filter(event=>event.event_type==='account_first_used'&&event.account_id==='9999').length,1,'nova conta deve registrar primeiro uso');

const ambiguous=db.importManifest(db.create(),manifest([campaign('20/09 - Produto Desconhecido 3 (GM) 45% - U$ 60')]),rowFactory,{source:'preparador_mcc'});
const ambiguousEvent=ambiguous.events.find(event=>event.event_type==='test_iteration_created');
assert.equal(ambiguousEvent.product_id,null,'sufixo numérico ambíguo não deve inventar identidade de produto');
assert.equal(ambiguousEvent.test_id,null);
assert.equal(ambiguousEvent.metadata.identity_confidence,'ambiguous_numbered_title');

const absentNextDay=db.importManifest(withSibling.base,manifest([campaign('20/09 - VitaSlimex 02 (GM) 60% - U$ 60')],'2026-09-21'),rowFactory,{source:'preparador_mcc'});
assert.equal(absentNextDay.events.some(event=>event.event_type==='campaign_status_changed'&&event.campaign_id===iteration.campaign_id),false,'ausência na próxima lista não deve ser tratada como estado explícito da campanha');
const genericPause=absentNextDay.events.find(event=>event.event_type==='campaign_pause_detected'&&event.campaign_id===iteration.campaign_id);
assert.equal(genericPause.metadata.pause_label,'Pausada','sem motivo explícito, a pausa deve ficar genérica');
assert.equal(genericPause.metadata.pause_detection_method,'ausencia_na_coleta_ativa','o Event Log deve distinguir detecção por ausência de status MCC explícito');
assert.equal(absentNextDay.events.some(event=>event.event_type==='account_suspension_detected'),false,'a MCC não fornece evidência explícita de suspensão da conta');
assert.equal(absentNextDay.events.some(event=>event.event_type==='campaign_delivery_stopped'),false,'zero/ausência de dados não deve ser inferido como fim de entrega');

const rejectedBaseline=db.importManifest(db.create(),manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{qualification:'Disapproved'})]),rowFactory,{source:'preparador_mcc'});
assert.equal(rejectedBaseline.base.campanhas[0].status_qualificacao_observado,'Disapproved','última qualificação explícita deve permanecer associada à campanha');
const rejectedPause=db.importManifest(rejectedBaseline.base,manifest([],'2026-09-21'),rowFactory,{source:'preparador_mcc'});
const rejectedPauseEvent=rejectedPause.events.find(event=>event.event_type==='campaign_pause_detected');
assert.equal(rejectedPause.base.campanhas[0].motivo_pausa,'reprovacao','motivo de reprovação observado antes da ausência deve permanecer na campanha pausada');
assert.equal(rejectedPauseEvent.metadata.pause_reason,'reprovacao');
assert.equal(rejectedPauseEvent.metadata.pause_label,'Pausada por reprovação');
assert.equal(rejectedPauseEvent.snapshot.status_qualificacao,'Disapproved','evento de pausa deve preservar a última qualificação da MCC');
assert.ok(rejectedPause.base.event_log.some(event=>event.event_id===rejectedPauseEvent.event_id),'evento de pausa precisa integrar o Event Log persistido');
assert.equal(db.importManifest(rejectedPause.base,manifest([],'2026-09-21'),rowFactory,{source:'preparador_mcc'}).events.some(event=>event.event_type==='campaign_pause_detected'),false,'a reimportação do mesmo estado pausado não deve duplicar evento');
const reactivatedRejected=db.importManifest(rejectedPause.base,manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{qualification:'Eligible'})],'2026-09-22'),rowFactory,{source:'preparador_mcc'});
assert.equal(reactivatedRejected.base.campanhas[0].status,'ativa');
assert.equal(reactivatedRejected.base.campanhas[0].motivo_pausa,undefined,'reativação deve limpar motivo de pausa anterior');

const sameDayActive=db.importManifest(db.create(),manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60',{qualification:'Não qualificada'})],'2026-09-22'),rowFactory,{source:'preparador_mcc'});
const sameDayPaused=db.importManifest(sameDayActive.base,manifest([],'2026-09-22'),rowFactory,{source:'preparador_mcc'});
assert.equal(sameDayPaused.base.campanhas[0].status,'pausada','uma campanha retirada após uma coleta D0 no mesmo dia deve ser reconhecida como pausada');
assert.equal(sameDayPaused.base.campanhas[0].motivo_pausa,'reprovacao');
assert.equal(sameDayPaused.events[0].metadata.pause_label,'Pausada por reprovação');

const legacy=db.normalize({schema:db.SCHEMA,campanhas:[],diario:[],importacoes:[]});
assert.deepEqual(JSON.parse(JSON.stringify(legacy.event_log)),[],'bases antigas recebem uma coleção vazia sem gerar telemetria retroativa');
const legacyCampaignBase=db.create();
legacyCampaignBase.campanhas.push({id:'cmp_excel',nome_mcc:'19/09 - VitaSlimex 01 (GM) 45% - U$ 60',nome_exibicao:'VitaSlimex 01',conta_sufixo:'3248',status:'ativa'});
const firstMccEvidence=db.importManifest(legacyCampaignBase,manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60')]),rowFactory,{source:'preparador_mcc'});
assert.equal(firstMccEvidence.events.filter(event=>event.event_type==='test_iteration_created').length,1,'campanhas legadas sem evidência MCC ainda recebem evento ao serem observadas pela primeira vez');
const migration=db.importManifest(db.create(),manifest([campaign('19/09 - VitaSlimex 01 (GM) 45% - U$ 60')]),rowFactory,{source:'legacy_migration',trackEvents:false});
assert.equal(migration.base.event_log.length,0,'migração não cria eventos retroativos');
const merged=db.mergeEventLogs(first.base,[...first.base.event_log,iteration]);
assert.equal(merged.event_log.length,first.base.event_log.length,'união de eventos remove IDs repetidos');

console.log('observability events ok');

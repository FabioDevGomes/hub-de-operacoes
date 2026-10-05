import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js'])vm.runInContext(await readFile(new URL(`../src/${file}`,import.meta.url),'utf8'),context);
const db=context.window.CampaignDatabase,overview=context.window.OverviewDomain;
const managerId='999-888-7777',accountId='111-222-3333',date='2026-10-05';
const metric=value=>({valor:value,estado:value==null?'ausente':'confirmado'});
function capture(scope,rows,captureDate=date){
  return{schema:'manifesto_mcc_v2',identificacao_mcc:{id:managerId,nome:'MCC sintética'},captura_D_zero:{escopo:scope,campanhas_capturadas:rows.length,capturada_em:`${captureDate}T12:00:00.000Z`},gerado_em_utc:`${captureDate}T12:00:00.000Z`,separacao_temporal:{D_zero:{datas_detectadas:[captureDate]}},campanhas:rows.map(({name,cost,impressions,clicks,commission,includeAccountId=true})=>({nome_campanha_exato:name,mcc_id:managerId,mcc_nome:'MCC sintética',metricas_D_zero:{presente:true,data:metric(captureDate),conta:metric('Conta sintética'),conta_id:metric(includeAccountId?accountId:null),moeda:metric('BRL'),custo_total:metric(cost),impressoes:metric(impressions),cliques_google:metric(clicks),conversoes:metric(0),valor_conversao:metric(commission)},custo_D_zero:{presente:true,data:metric(captureDate),moeda:metric('BRL'),custo_total_destino_totais_coluna_M:metric(cost)}}))};
}
const rowFactory=source=>({date:source.metricas_D_zero.data.valor,period:'d0',cells:{B:{value:source.metricas_D_zero.impressoes.valor},C:{value:source.metricas_D_zero.cliques_google.valor},F:{value:0},O:{value:source.metricas_D_zero.custo_total.valor},P:{value:source.metricas_D_zero.valor_conversao.valor}}});

let imported=db.importManifest(db.create(),capture('all_campaigns',[
  {name:'Campanha que segue ativa',cost:10,impressions:100,clicks:10,commission:5},
  {name:'Campanha pausada no meio do dia',cost:20,impressions:200,clicks:20,commission:10}
]),rowFactory).base;
assert.equal(imported.manifesto_atual.cobertura_D_zero_por_mcc[managerId].completa,true);

const afterPause=db.importManifest(imported,capture('active_only',[
  {name:'Campanha que segue ativa',cost:15,impressions:150,clicks:15,commission:8}
]),rowFactory,{overwrite:true}).base;
const retained=afterPause.manifesto_atual.campanhas.find(item=>item.nome_campanha_exato==='Campanha pausada no meio do dia');
assert.equal(retained.metricas_D_zero.presente,false,'campanha omitida continua ausente da captura atual');
assert.equal(retained.metricas_D_zero.retida_no_dia,true,'último retrato D0 do mesmo dia fica explicitamente retido');
assert.equal(retained.metricas_D_zero.custo_total.valor,20);
assert.equal(afterPause.campanhas.find(item=>item.nome_mcc==='Campanha pausada no meio do dia').status,'pausada','retenção financeira não muda a classificação operacional de ausência/pausa');
assert.equal(afterPause.manifesto_atual.cobertura_D_zero_por_mcc[managerId].completa,true,'captura ativa posterior não desfaz a cobertura completa anterior do mesmo dia');

let snapshots=overview.authoritativeMccSnapshots(afterPause.manifesto_atual);
let d0=snapshots.rows.filter(item=>item.period==='d0');
assert.equal(d0.reduce((sum,item)=>sum+(item.investment||0),0),35,'total mantém o custo ativo atualizado e o custo D0 da campanha que saiu da captura');
assert.equal(d0.reduce((sum,item)=>sum+(item.impressions||0),0),350);
assert.equal(d0.reduce((sum,item)=>sum+(item.clicks||0),0),35);
assert.ok(d0.find(item=>item.retained)?.present,'retrato retido participa dos agregados apesar de permanecer ausente');

const unknownScope=db.importManifest(imported,capture('unknown',[
  {name:'Campanha que segue ativa',cost:16,impressions:160,clicks:16,commission:8}
]),rowFactory,{overwrite:true}).base;
const unknownScopeRows=overview.authoritativeMccSnapshots(unknownScope.manifesto_atual).rows.filter(item=>item.period==='d0');
assert.equal(unknownScopeRows.reduce((sum,item)=>sum+(item.investment||0),0),36,'escopo desconhecido conserva o último valor do mesmo dia para campanhas omitidas');
assert.equal(unknownScopeRows.reduce((sum,item)=>sum+(item.impressions||0),0),360);
assert.equal(unknownScopeRows.reduce((sum,item)=>sum+(item.clicks||0),0),36);
assert.equal(unknownScope.manifesto_atual.campanhas.find(item=>item.nome_campanha_exato==='Campanha pausada no meio do dia').metricas_D_zero.retida_no_dia,true);
assert.equal(unknownScope.campanhas.find(item=>item.nome_mcc==='Campanha pausada no meio do dia').status,'ativa','escopo desconhecido não transforma ausência em pausa confirmada');

const missingAccountId=db.importManifest(imported,capture('active_only',[
  {name:'Campanha que segue ativa',cost:17,impressions:170,clicks:17,commission:9,includeAccountId:false}
]),rowFactory,{overwrite:true}).base;
const missingIdRows=overview.authoritativeMccSnapshots(missingAccountId.manifesto_atual).rows.filter(item=>item.period==='d0');
assert.equal(missingIdRows.reduce((sum,item)=>sum+(item.investment||0),0),37,'ausência de ID cliente em uma linha não descarta o retrato da campanha omitida');
assert.equal(missingIdRows.reduce((sum,item)=>sum+(item.impressions||0),0),370);
assert.equal(missingIdRows.reduce((sum,item)=>sum+(item.clicks||0),0),37);
assert.equal(missingAccountId.manifesto_atual.campanhas.find(item=>item.nome_campanha_exato==='Campanha pausada no meio do dia').metricas_D_zero.retida_no_dia,true);

const completeAll=db.importManifest(imported,capture('all_campaigns',[
  {name:'Campanha que segue ativa',cost:12,impressions:120,clicks:12,commission:6}
]),rowFactory,{overwrite:true}).base;
const completeAllRows=overview.authoritativeMccSnapshots(completeAll.manifesto_atual).rows.filter(item=>item.period==='d0');
assert.equal(completeAllRows.reduce((sum,item)=>sum+(item.investment||0),0),12,'captura explicitamente completa continua sendo autoritativa');
assert.equal(completeAll.manifesto_atual.campanhas.find(item=>item.nome_campanha_exato==='Campanha pausada no meio do dia').metricas_D_zero.retida_no_dia,undefined);

const repeated=db.importManifest(afterPause,capture('active_only',[
  {name:'Campanha que segue ativa',cost:18,impressions:180,clicks:18,commission:9}
]),rowFactory,{overwrite:true}).base;
snapshots=overview.authoritativeMccSnapshots(repeated.manifesto_atual);
assert.equal(snapshots.rows.filter(item=>item.period==='d0').reduce((sum,item)=>sum+(item.investment||0),0),38,'capturas ativas repetidas atualizam as ativas sem descartar pausadas já retidas');

const nextDay=db.importManifest(repeated,capture('active_only',[
  {name:'Campanha que segue ativa',cost:3,impressions:30,clicks:3,commission:1}
],'2026-10-06'),rowFactory,{overwrite:true}).base;
assert.equal(nextDay.manifesto_atual.separacao_temporal.D_zero.datas_detectadas[0],'2026-10-06');
assert.equal(nextDay.manifesto_atual.campanhas.find(item=>item.nome_campanha_exato==='Campanha pausada no meio do dia').metricas_D_zero.retida_no_dia,undefined,'não transfere os valores retidos para o dia seguinte');

const freshActive=db.importManifest(db.create(),capture('active_only',[
  {name:'Única campanha observada',cost:7,impressions:70,clicks:7,commission:2}
]),rowFactory).base;
assert.equal(freshActive.manifesto_atual.cobertura_D_zero_por_mcc[managerId].completa,false,'captura de ativas sem referência completa é marcada parcial');
assert.equal(overview.authoritativeMccSnapshots(freshActive.manifesto_atual).rows.reduce((sum,item)=>sum+(item.investment||0),0),7,'não inventa os custos das campanhas não capturadas');

const managerTwo='888-777-6666';
const otherMcc=capture('all_campaigns',[{name:'Campanha de outra MCC',cost:4,impressions:40,clicks:4,commission:1}]);
otherMcc.identificacao_mcc={id:managerTwo,nome:'MCC outra sintética'};
otherMcc.campanhas[0].mcc_id=managerTwo;otherMcc.campanhas[0].mcc_nome='MCC outra sintética';
const together=db.importManifest(afterPause,otherMcc,rowFactory).base;
assert.equal(together.manifesto_atual.cobertura_D_zero_por_mcc[managerId].completa,true,'capturas de outra MCC não apagam a cobertura da MCC anterior');
assert.equal(together.manifesto_atual.cobertura_D_zero_por_mcc[managerTwo].completa,true);
const partialWithoutAccountId=db.importManifest(together,capture('active_only',[
  {name:'Campanha que segue ativa',cost:19,impressions:190,clicks:19,commission:10,includeAccountId:false}
]),rowFactory,{overwrite:true}).base;
assert.equal(partialWithoutAccountId.campanhas.find(item=>item.nome_mcc==='Campanha de outra MCC').status,'ativa','linha sem ID cliente não faz captura de uma MCC pausar campanhas de outra MCC');

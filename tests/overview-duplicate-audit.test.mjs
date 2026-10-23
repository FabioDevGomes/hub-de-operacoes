import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/overview/duplicate-audit-domain.js',import.meta.url),'utf8'),context);
const audit=context.window.OverviewDuplicateAuditDomain;

const metrics=(account,cost=25)=>({presente:true,conta_id:{valor:account},data:{valor:'2026-10-22'},moeda:{valor:'BRL'},custo_total:{valor:cost},impressoes:{valor:100},cliques_google:{valor:5},conversoes:{valor:1},valor_conversao:{valor:40}});
function source(name,account,cost=25){return{nome_campanha_exato:name,metricas_D_menos_1:metrics(account,cost),metricas_D_zero:metrics(account,cost)}}
function baseWithDuplicates(){return{manifesto_atual:{campanhas:[source('Campanha Alfa','1112223333'),source(' Campanha   Alfa ','111-222-3333'),source('Campanha Alfa','444-555-6666'),{nome_campanha_exato:'Sem ID',metricas_D_zero:{conta_id:{valor:'Conta • 3333'}}},{nome_campanha_exato:' Sem ID ',metricas_D_zero:{conta_id:{valor:'Conta • 3333'}}}]},campanhas:[{id:'single-campaign',nome_mcc:'Campanha Alfa',conta_id:'111-222-3333'}],diario:[]}}

test('audita linhas da captura já salva por nome normalizado e ID completo da conta, sem mutar a base',()=>{
  const base=baseWithDuplicates(),before=JSON.stringify(base),result=audit.findDuplicateCampaignGroups(base);
  assert.equal(result.groups.length,1);
  assert.equal(result.groups[0].accountId,'111-222-3333');
  assert.deepEqual(Array.from(result.groups[0].members,item=>item.occurrence),[1,2]);
  assert.equal(result.groups[0].metricsIdentical,true);
  assert.equal(result.groups[0].members[0].metrics[1].custo_total,25);
  assert.equal(result.groups[0].members[1].metrics[1].custo_total,25);
  assert.equal(result.unverifiableCount,1);
  assert.equal(JSON.stringify(base),before);
});

test('métricas divergentes não são classificadas como cópias idênticas',()=>{
  const base=baseWithDuplicates();base.manifesto_atual.campanhas[1]=source(' Campanha   Alfa ','111-222-3333',30);
  const result=audit.findDuplicateCampaignGroups(base);
  assert.equal(result.groups[0].metricsIdentical,false);
  assert.equal(result.groups[0].members[1].metrics[1].custo_total,30);
});

test('métricas ausentes não habilitam a ação de manter uma linha',()=>{
  const noMetrics={nome_campanha_exato:'Campanha Alfa',metricas_D_menos_1:{conta_id:{valor:'111-222-3333'},presente:false},metricas_D_zero:{conta_id:{valor:'111-222-3333'},presente:false}},base={manifesto_atual:{campanhas:[noMetrics,structuredClone(noMetrics)]},campanhas:[],diario:[]};
  assert.equal(audit.findDuplicateCampaignGroups(base).groups[0].metricsIdentical,false);
});

test('não agrupa pelo sufixo da conta e mantém sem conta completa apenas como ocorrência não verificável',()=>{
  const base={manifesto_atual:{campanhas:[source('Campanha','111-222-3333'),{nome_campanha_exato:'Campanha',metricas_D_zero:{conta_id:{valor:'Conta • 3333'}}},{nome_campanha_exato:'Campanha',metricas_D_zero:{conta_id:{valor:'Conta • 3333'}}}]},campanhas:[],diario:[]};
  const result=audit.findDuplicateCampaignGroups(base);
  assert.deepEqual(Array.from(result.groups),[]);
  assert.equal(result.unverifiableCount,1);
});

test('indica a revisão reversível persistida para o grupo sem mutar a captura',()=>{
  const base=baseWithDuplicates();base.manifest_duplicate_suppressions=['111-222-3333\u0000campanha alfa'];
  const result=audit.findDuplicateCampaignGroups(base);
  assert.equal(result.groups[0].suppressed,true);
  base.manifesto_atual.campanhas[1]=source(' Campanha   Alfa ','111-222-3333',30);
  const changed=audit.findDuplicateCampaignGroups(base);
  assert.equal(changed.groups[0].suppressionStored,true);
  assert.equal(changed.groups[0].suppressed,false,'um ajuste salvo deixa de atuar quando as métricas atuais divergem');
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{},structuredClone});
vm.runInContext(await readFile(new URL('../src/database.js',import.meta.url),'utf8'),context);
const database=context.window.CampaignDatabase;

function duplicateSource(account='111-222-3333',cost=25){const metrics={presente:true,conta_id:{valor:account},data:{valor:'2026-10-22'},moeda:{valor:'BRL'},custo_total:{valor:cost},impressoes:{valor:100},cliques_google:{valor:5},conversoes:{valor:1},valor_conversao:{valor:40}};return{nome_campanha_exato:'Campanha repetida',metricas_D_menos_1:structuredClone(metrics),metricas_D_zero:structuredClone(metrics)}}
function duplicateManifestFixture(){const base=database.create(),first=duplicateSource();base.campanhas=[{id:'one-campaign-record',nome_mcc:'Campanha repetida',conta_id:'111-222-3333',status:'ativa'}];base.diario=[{campanha_id:'one-campaign-record',data:'2026-10-22',celulas:{O:{value:25}}}];base.manifesto_atual={campanhas:[first,structuredClone(first)]};base.snapshots_campanhas=[{data:'2026-10-22',campanhas:['Campanha repetida'],campanhas_ativas:['Campanha repetida']}];return base}

test('ajuste de duplicidade mantém uma linha operacional e preserva a captura e o histórico originais',()=>{
  const base=duplicateManifestFixture(),originalManifest=JSON.stringify(base.manifesto_atual),originalDiary=JSON.stringify(base.diario),originalSnapshots=JSON.stringify(base.snapshots_campanhas);
  const adjusted=database.setManifestDuplicateSuppression(base,{accountId:'1112223333',name:' Campanha   repetida ',suppressed:true,now:'2026-10-23T12:00:00.000Z'});
  const projected=database.operationalProjection(adjusted);
  assert.equal(JSON.stringify(base.manifesto_atual),originalManifest,'a entrada não muta a base original');
  assert.equal(projected.manifesto_atual.campanhas.length,1,'a projeção operacional mantém apenas uma ocorrência');
  assert.equal(adjusted.manifesto_atual.campanhas.length,2,'o manifesto salvo continua contendo todas as ocorrências');
  assert.equal(JSON.stringify(adjusted.diario),originalDiary,'o diário permanece intacto');
  assert.equal(JSON.stringify(adjusted.snapshots_campanhas),originalSnapshots,'o histórico de snapshots permanece intacto');
  assert.equal(projected.campanhas.length,1,'o cadastro canônico não é apagado nem duplicado');
  const reloaded=database.normalize(JSON.parse(JSON.stringify(adjusted)));
  assert.equal(database.operationalProjection(reloaded).manifesto_atual.campanhas.length,1,'a escolha persiste no backup/restore da base');
});

test('restaurar ajuste devolve as linhas e divergência posterior cancela a projeção automática',()=>{
  const adjusted=database.setManifestDuplicateSuppression(duplicateManifestFixture(),{accountId:'111-222-3333',name:'Campanha repetida',suppressed:true,now:'2026-10-23T12:00:00.000Z'});
  const restored=database.setManifestDuplicateSuppression(adjusted,{accountId:'111-222-3333',name:'Campanha repetida',suppressed:false,now:'2026-10-23T12:05:00.000Z'});
  assert.equal(database.operationalProjection(restored).manifesto_atual.campanhas.length,2);
  const changed=structuredClone(adjusted);changed.manifesto_atual.campanhas[1].metricas_D_zero.custo_total.valor=30;
  assert.equal(database.operationalProjection(changed).manifesto_atual.campanhas.length,2,'se as métricas deixarem de ser idênticas, a projeção não oculta nenhuma linha');
});

test('ajuste de duplicidade não agrupa apenas por sufixo ou nome sem conta completa',()=>{
  const adjusted=database.setManifestDuplicateSuppression(duplicateManifestFixture(),{accountId:'111-222-3333',name:'Campanha repetida',suppressed:true});
  const partial=structuredClone(adjusted);partial.manifesto_atual.campanhas[1].metricas_D_zero.conta_id.valor='Conta • 3333';
  const projected=database.operationalProjection(partial);
  assert.equal(projected.manifesto_atual.campanhas.length,2,'conta parcial nunca autoriza a deduplicação');
  assert.throws(()=>database.setManifestDuplicateSuppression(duplicateManifestFixture(),{accountId:'3333',name:'Campanha repetida',suppressed:true}),/ID completo da conta/);
});

test('a projeção não aplica filtros antigos de ocultação nem modifica a base original',()=>{
  const base=database.create();base.campanhas=[{id:'campaign-a',nome_mcc:'Campanha A',ignorada:true}];base.diario=[{campanha_id:'campaign-a',data:'2026-10-22'}];
  const before=JSON.stringify(base),projected=database.operationalProjection(base);
  assert.equal(JSON.stringify(base),before,'a projeção nunca grava ou remove campos da base');
  assert.equal(projected.campanhas.length,1,'a campanha continua na projeção normal');
  assert.equal(projected.campanhas[0].ignorada,true,'qualquer campo antigo permanece intacto, sem ser aplicado como filtro');
  assert.equal(projected.diario.length,1,'o Diário associado também permanece visível');
  assert.equal(database.setCampaignIgnored,undefined,'a API de ocultação de campanhas foi removida');
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{},structuredClone});
vm.runInContext(await readFile(new URL('../src/database.js',import.meta.url),'utf8'),context);
const database=context.window.CampaignDatabase;

function fixture(){
  const base=database.create();
  base.campanhas=[
    {id:'cmp-ignore',nome_mcc:'Campanha A',nome_mcc_anteriores:['Campanha A antiga'],nome_exibicao:'A',status:'ativa'},
    {id:'cmp-visible',nome_mcc:'Campanha B',nome_exibicao:'B',status:'ativa'}
  ];
  base.diario=[{campanha_id:'cmp-ignore',data:'2026-10-22'},{campanha_id:'cmp-visible',data:'2026-10-22'}];
  base.campos_operacionais=[{campanha_id:'cmp-ignore'},{campanha_id:'cmp-visible'}];
  base.observacoes_diario=[{campanha_id:'cmp-ignore'},{campanha_id:'cmp-visible'}];
  base.vendas_provisorias=[{id:'sale-a',campanha_id:'cmp-ignore'},{id:'sale-b',campanha_id:'cmp-visible'}];
  base.mcc_conversion_value_overrides=[{campanha_id:'cmp-ignore'},{campanha_id:'cmp-visible'}];
  base.mcc_fractional_value_confirmations=[{campaignId:'cmp-ignore'},{campaignId:'cmp-visible'}];
  base.snapshots_campanhas=[{data:'2026-10-22',campanhas:['Campanha A','Campanha A antiga','Campanha B'],campanhas_ativas:['Campanha A','Campanha B']}];
  base.manifesto_atual={campanhas:[{nome_campanha_exato:'Campanha A'},{nome_campanha_exato:'Campanha A antiga'},{nome_campanha_exato:'Campanha B'}]};
  return base;
}

test('ignorar campanha cria projeção operacional sem apagar ou mutar fontes nem histórico financeiro',()=>{
  const base=fixture(),before=JSON.stringify(base),ignored=database.setCampaignIgnored(base,'cmp-ignore',true,'2026-10-23T12:00:00.000Z'),projected=database.operationalProjection(ignored);
  assert.equal(JSON.stringify(base),before,'a operação retorna uma cópia e mantém intacta a base original');
  assert.equal(ignored.campanhas.find(item=>item.id==='cmp-ignore').ignorada,true);
  assert.deepEqual(Array.from(projected.campanhas,item=>item.id),['cmp-visible']);
  assert.deepEqual(Array.from(projected.diario,item=>item.campanha_id),['cmp-visible']);
  assert.deepEqual(Array.from(projected.campos_operacionais,item=>item.campanha_id),['cmp-visible']);
  assert.deepEqual(Array.from(projected.observacoes_diario,item=>item.campanha_id),['cmp-visible']);
  assert.deepEqual(Array.from(projected.vendas_provisorias,item=>item.id),['sale-b']);
  assert.deepEqual(Array.from(projected.mcc_conversion_value_overrides,item=>item.campanha_id),['cmp-visible']);
  assert.deepEqual(Array.from(projected.mcc_fractional_value_confirmations,item=>item.campaignId),['cmp-visible']);
  assert.deepEqual(Array.from(projected.manifesto_atual.campanhas,item=>item.nome_campanha_exato),['Campanha B']);
  assert.deepEqual(projected.snapshots_campanhas[0].campanhas,['Campanha B']);
  assert.deepEqual(projected.snapshots_campanhas[0].campanhas_ativas,['Campanha B']);
  assert.equal(ignored.vendas_provisorias.length,2,'vendas permanecem no registro de origem para histórico e restauração');
});

test('restaurar campanha inclui novamente suas fontes operacionais sem reimportar',()=>{
  const ignored=database.setCampaignIgnored(fixture(),'cmp-ignore',true,'2026-10-23T12:00:00.000Z');
  const restored=database.setCampaignIgnored(ignored,'cmp-ignore',false,'2026-10-23T12:05:00.000Z');
  const projected=database.operationalProjection(restored);
  assert.equal(restored.campanhas.find(item=>item.id==='cmp-ignore').ignorada,undefined);
  assert.deepEqual(Array.from(projected.campanhas,item=>item.id),['cmp-ignore','cmp-visible']);
  assert.equal(projected.diario.length,2);
  assert.equal(projected.vendas_provisorias.length,2);
  assert.equal(projected.manifesto_atual.campanhas.length,3);
});

test('ignorar uma campanha duplicada pelo nome preserva a outra conta identificada',()=>{
  const base=database.create();
  base.campanhas=[
    {id:'cmp-ecom',nome_mcc:'Produto repetido',conta_id:'111-222-3333',ignorada:true},
    {id:'cmp-nutra',nome_mcc:'Produto repetido',conta_id:'444-555-6666'}
  ];
  base.manifesto_atual={campanhas:[
    {nome_campanha_exato:'Produto repetido',metricas_D_zero:{conta_id:{valor:'111-222-3333'}}},
    {nome_campanha_exato:'Produto repetido',metricas_D_zero:{conta_id:{valor:'444-555-6666'}}}
  ]};
  base.snapshots_campanhas=[{data:'2026-10-22',campanhas:['Produto repetido'],campanhas_ativas:['Produto repetido']}];
  const projected=database.operationalProjection(base);
  assert.deepEqual(Array.from(projected.campanhas,item=>item.id),['cmp-nutra']);
  assert.deepEqual(Array.from(projected.manifesto_atual.campanhas,item=>item.metricas_D_zero.conta_id.valor),['444-555-6666']);
  assert.deepEqual(projected.snapshots_campanhas[0].campanhas,['Produto repetido'],'snapshot por nome permanece quando a campanha ainda existe em outra conta');
});

test('setCampaignIgnored reports a missing campaign instead of silently changing another record',()=>{
  assert.throws(()=>database.setCampaignIgnored(fixture(),'unknown',true),/Campanha não encontrada/);
});

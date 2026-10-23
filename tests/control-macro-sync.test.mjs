import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { aggregateBillingRevenueByDate } from '../src/billing/billing-domain.mjs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const domain = require('../src/control-macro/domain.js');
const CampaignBaseReader = require('../src/storage/campaign-base-reader.js');
const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const databaseContext = vm.createContext({ window:{}, structuredClone });
vm.runInContext(await readFile(new URL('../src/database.js', import.meta.url), 'utf8'), databaseContext);
vm.runInContext(await readFile(new URL('../src/overview-domain.js', import.meta.url), 'utf8'), databaseContext);
const db = databaseContext.window.CampaignDatabase;
assert.match(template,/function refreshMacroBillingSource\(\)[\s\S]*?state\.macroBillingSales=sales/,'o Controle Macro usa as vendas retornadas pelo Faturamento sem uma regra de ocultação de campanhas');
assert.doesNotMatch(template,/excludeIgnoredCampaignSales|ignoredIds/,'o Controle Macro não aplica mais filtro por campanha ignorada');
let persisted = db.create();
persisted.campanhas = [{ id:'synthetic', nome_mcc:'Wego6 campanha', nome_exibicao:'Wego6' }];
persisted.diario = [{ campanha_id:'synthetic', data:'2026-09-29', celulas:{ O:{value:100}, P:{value:50}, C:{value:10}, F:{value:1} } }];
const state = { database:null, controlMacroRows:null, productCatalog:{aliases:{}} };
const macroUi = {};
let aggregateCalls=0;
const context = vm.createContext({ state, macroUi, CampaignBaseReader, CampaignDatabase:db, OverviewDomain:databaseContext.window.OverviewDomain, ControlMacroDomain:{...domain,aggregateMccDaily(...args){aggregateCalls++;return domain.aggregateMccDaily(...args)}}, ProductCatalog:{normalize:value=>value||{aliases:{}}},
  OverviewCardsRecovery:{ensure:async({base})=>({base,recovered:false})},
  accountProductIdentity:(campaign,catalog)=>({label:catalog.aliases[String(campaign.nome_exibicao||'').toLocaleLowerCase('pt-BR')]||campaign.nome_exibicao||campaign.nome_mcc}),
  embeddedManifest:null,
  renderLegacyMigrationNotice(){}, render(){},
  openLocalDb:async () => ({ close(){}, transaction(names, mode){
    assert.equal(mode, 'readonly');
    const requests = [];
    const tx = { objectStore:name => ({
      get(){ const request = {}; requests.push([request, structuredClone(persisted)]); return request; },
      getAll(){ const request = {}; requests.push([request, []]); return request; },
    }) };
    queueMicrotask(() => { for(const [request,result] of requests){ request.result = result; request.onsuccess(); } tx.oncomplete(); });
    return tx;
  } }),
});
const macroProjectionStart=template.indexOf('    function macroHistory('),macroAllRowsStart=template.indexOf('    function macroAllRows(',macroProjectionStart),macroUiStart=template.indexOf('    const macroUi=',macroAllRowsStart);
const helpers=[template.slice(macroProjectionStart,macroAllRowsStart),template.slice(macroAllRowsStart,macroUiStart)].join('\n');
const restoreStart = template.indexOf('    async function restoreLocalBase(');
const restoreEnd = template.indexOf('    async function restoreProductCatalog(', restoreStart);
vm.runInContext(`let derivedCache={stale:true};\nfunction operationalDatabase(manifest=state.manifest){return state.database?CampaignDatabase.operationalProjection(state.database,manifest):null}\n${helpers}\n${template.slice(restoreStart,restoreEnd)}`, context);
const september = () => context.macroAllRows().filter(row => row.date.startsWith('2026-09'));
assert.equal(september().length, 0, 'primeiro render ocorre antes da leitura assíncrona');
const callsBeforeRestore=aggregateCalls;
await context.restoreLocalBase({ persist:false, renderPage:false });
assert.equal(aggregateCalls,callsBeforeRestore,'restaurar a Visão Geral apenas invalida o Macro, sem agregar uma tela não aberta');
assert.equal(september().length, 1, 'carregar a base deve recalcular o Macro vazio');
assert.equal(aggregateCalls,callsBeforeRestore+1);
september();assert.equal(aggregateCalls,callsBeforeRestore+1,'segunda leitura reutiliza a projeção');
state.rate=6;september();assert.equal(aggregateCalls,callsBeforeRestore+2,'taxa alterada invalida a projeção');
state.productCatalog={aliases:{}};september();assert.equal(aggregateCalls,callsBeforeRestore+3,'catálogo alterado invalida a projeção');
assert.equal(september()[0].investment, 100);
assert.deepEqual(september()[0].productSales.map(item=>({product:item.product,sales:item.sales,amount:item.amount})),[{product:'Wego6',sales:1,amount:50}], 'refresh também associa produto às vendas oficiais MCC');
assert.equal(vm.runInContext('derivedCache', context), null);
persisted.diario[0].celulas.O.value = 120;
await context.restoreLocalBase({ persist:false, renderPage:false });
assert.equal(september()[0].investment, 120, 'atualização de outra aba também invalida o resumo anterior');
persisted.manifesto_atual={separacao_temporal:{D_zero:{datas_detectadas:['2026-09-29']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_zero:{presente:true,data:{valor:'2026-09-29'},moeda:{valor:'BRL'},custo_total:{valor:20},valor_conversao:{valor:30},cliques_google:{valor:5},conversoes:{valor:1}}}]};
persisted.controle_macro_historico=[{date:'2026-09-29',investment:500,revenue:400,clicks:100,sales:10}];
persisted.diario[0].celulas.F.value=0;
persisted.diario[0].celulas.P.value=0;
persisted.vendas_provisorias=[{id:'manual-sale',billing_sale_id:'manual-sale-billing',campanha_id:'synthetic',data:'2026-09-29',produto:'Wego6 · campanha teste longa',valor_brl:30,status:'provisoria'}];
await context.restoreLocalBase({persist:false,renderPage:false});
assert.equal(september()[0].investment,20,'última captura menor prevalece sobre Diário e planilha após restauração');
assert.equal(september()[0].revenue,30);assert.equal(september()[0].profit,10);assert.equal(september()[0].clicks,5);
assert.equal(september()[0].sales,1,'a venda MCC já confirmada não é somada de novo como provisória');
assert.equal(september()[0].officialSales,1);assert.equal(september()[0].pendingSales,0);
assert.deepEqual(september()[0].productSales.map(item=>({product:item.product,sales:item.sales,provisional:item.provisional})),[{product:'Wego6',sales:1,provisional:false}], 'a observação passa a usar o nome curto e deixa de marcar a venda confirmada como provisória');
assert.equal(persisted.vendas_provisorias[0].status,'provisoria','a projeção visual da confirmação não altera o registro armazenado');
assert.equal(persisted.diario[0].celulas.F.value,0,'a reconciliação da captura mais recente não regrava o Diário');
assert.equal(persisted.diario[0].celulas.O.value,120,'projeção não reescreve o histórico persistido');
persisted.manifesto_atual={separacao_temporal:{D_zero:{datas_detectadas:['2026-09-29']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_zero:{presente:true,data:{valor:'2026-09-29'},moeda:{valor:'BRL'},custo_total:{valor:20},valor_conversao:{valor:30},cliques_google:{valor:5}}}]};
await context.restoreLocalBase({persist:false,renderPage:false});
assert.equal(september()[0].officialSales,null,'campo de conversões ausente não vira confirmação nem zero');
assert.equal(september()[0].pendingSales,1,'a pendência continua visível quando a captura omite conversões');
state.macroBillingSales=[
  {sale_id:'manual-sale-billing',sale_date:'2026-09-29',source:'hub_manual_capture',source_ref:'manual-sale',conversion_count:1,value_brl:30,product:'Wego6',campaign_id:'synthetic',active:false,cancelled_at:'2026-10-22T19:00:00.000Z'},
  {sale_id:'mcc-confirmed',sale_date:'2026-09-29',source:'mcc_conversion_aggregate',conversion_count:1,value_brl:30,product:'Wego6',campaign_id:'synthetic',active:true,confirmation_status:'provisional'},
];state.macroBillingRevenueByDate=aggregateBillingRevenueByDate(state.macroBillingSales,5.1);state.controlMacroRows=null;
await context.restoreLocalBase({persist:false,renderPage:false});
assert.equal(september()[0].sales,1,'o Macro remove da contagem a venda manual cancelada no Faturamento e preserva a conversão MCC D0');
assert.equal(september()[0].officialSales,1);assert.equal(september()[0].pendingSales,0,'o cancelamento remove o aviso de venda provisória');
assert.deepEqual(september()[0].productSales.map(item=>({product:item.product,sales:item.sales,provisional:item.provisional})),[{product:'Wego6',sales:1,provisional:false}],'observações deixam de duplicar produto/valor da venda cancelada');
assert.equal(persisted.vendas_provisorias[0].status,'provisoria','a correção da projeção não grava nem altera o registro local');
assert.equal(state.controlMacroBillingCheck.cancelledProvisionalSales,1,'a conferência identifica o cancelamento aplicado à projeção');
persisted.manifesto_atual={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-29']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_menos_1:{presente:true,data:{valor:'2026-09-29'},moeda:{valor:'BRL'},custo_total:{valor:20},valor_conversao:{valor:30},cliques_google:{valor:5},conversoes:{valor:1}}}]};
await context.restoreLocalBase({persist:false,renderPage:false});
assert.equal(september()[0].pendingSales,0,'a confirmação D−1 também remove a marcação provisória do Macro');
assert.equal(persisted.vendas_provisorias[0].status,'provisoria','a prévia de reconciliação D−1 não grava alterações no registro');
state.macroBillingSales=[
  {sale_id:'mcc-existing',sale_date:'2026-09-29',source:'mcc_conversion_aggregate',conversion_count:1,value_brl:30,product:'Wego6'},
  {sale_id:'billing-manual',sale_date:'2026-09-29',source:'manual',confirmation_status:'manual',conversion_count:1,value_brl:225,product:'Nebula'},
];state.macroBillingRevenueByDate=aggregateBillingRevenueByDate(state.macroBillingSales,5.1);state.macroBillingCheckedAt='2026-10-18T12:34:00.000Z';state.controlMacroRows=null;
const billingReconciled=september()[0];
assert.equal(billingReconciled.sales,2,'a cache do Macro integra a venda nova registrada diretamente no Faturamento');
assert.equal(billingReconciled.billingSales,1,'a integração preserva a distinção entre MCC e venda manual do Faturamento');
assert.equal(billingReconciled.revenue,255,'a receita diária converge com o total completo do Faturamento sem dobrar a MCC');
assert.equal(billingReconciled.productSales.at(-1).product,'Nebula');
assert.equal(macroUi.macroBillingCheckedAt,state.macroBillingCheckedAt,'o horário da conferência também chega ao estado visual da view');
console.log('Control Macro sync: async load and cross-tab cache refresh ok');

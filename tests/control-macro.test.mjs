import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { aggregateBillingRevenueByDate } from '../src/billing/billing-domain.mjs';

const require = createRequire(import.meta.url);
const domain = require('../src/control-macro/domain.js');

assert.deepEqual(domain.monthBounds('2026-09'), { start: '2026-09-01', end: '2026-09-30' });
assert.deepEqual(domain.monthBounds('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
assert.equal(domain.shiftMonth('2026-01', -1), '2025-12');
assert.equal(domain.shiftMonth('2026-12', 1), '2027-01');
assert.equal(domain.normalizeMonth('2026-13'), null);
assert.equal(domain.currentMonth(new Date('2026-09-22T12:00:00Z')), '2026-09');

assert.equal(domain.parseDate(46284), '2026-09-19');
assert.equal(domain.parseDate('19/09/2026'), '2026-09-19');
assert.equal(domain.parseDate('31/02/2026'), null);
assert.equal(domain.parseNumber('R$ 1.234,56'), 1234.56);
assert.equal(domain.parseNumber('1.234'), 1234);

const mccRows = [
  { campanha_id: 'campaign-1', data: '2026-09-18', celulas: { O: { value: 100 }, P: { value: 250 }, C: { value: 20 }, F: { value: 2 } } },
  { data: '2026-09-19', celulas: { O: { value: 0 }, P: { value: 0 }, C: { value: 0 }, F: { value: 0 } } },
];
const adjustments = new Map([
  ['campaign-1', { byDate: { '2026-09-18': { pendingConversions: 1, commissionAdjustment: 85, productSales: [{ product: 'Wego6', amount: 85 }] } } }],
]);
const mcc = domain.aggregateMccDaily(mccRows, adjustments, { campaignProducts: new Map([['campaign-1', 'Wego6']]) });
assert.deepEqual(mcc, [
  { date: '2026-09-18', hasMccData: true, source: 'mcc', investment: 100, revenue: 335, profit: 235, roi: 235, clicks: 20, sales: 3, officialSales: 2, pendingSales: 1, pendingRevenue: 85, clicksPerSale: 20 / 3, productSales: [{ product: 'Wego6', sales: 2, amount: 250, provisional: false, campaignSales:[{campaignId:'campaign-1',sales:2,amount:250}] }, { product: 'Wego6', sales: 1, amount: 85, provisional: true, campaignSales:[{campaignId:'campaign-1',sales:1,amount:85}] }] },
  { date: '2026-09-19', hasMccData: true, source: 'mcc', investment: 0, revenue: 0, profit: 0, roi: null, clicks: 0, sales: 0, officialSales: 0, pendingSales: 0, pendingRevenue: 0, clicksPerSale: null, productSales: [] },
]);
const compactProvisional = domain.aggregateMccDaily(
  [{ campanha_id:'campaign-long', data:'2026-09-20', celulas:{ F:{value:0}, P:{value:0} } }],
  new Map([['campaign-long',{byDate:{'2026-09-20':{pendingConversions:1,commissionAdjustment:312.62,productSales:[{product:'ResQVac - CTC $49.99 - Presell Page - Accepts Paypal',sales:1,amount:312.62}]}}}]]),
  {campaignProducts:new Map([['campaign-long','ResQVac']])}
);
assert.deepEqual(compactProvisional[0].productSales,[{product:'ResQVac',sales:1,amount:312.62,provisional:true,campaignSales:[{campaignId:'campaign-long',sales:1,amount:312.62}]}], 'venda provisória usa o rótulo curto da identidade do produto da campanha');

const workbook = {
  sheets: [
    { name: 'Setembro 2026', rows: [
      { index: 1, cells: { A: { value: 'Data' }, B: { value: 'Investimento' }, C: { value: 'Faturamento' }, D: { value: 'Cliques' }, E: { value: 'Vendas' }, F: { value: 'Observações' } } },
      { index: 2, cells: { A: { value: 46283 }, B: { value: 'R$ 120,00' }, C: { value: 'R$ 300,00' }, D: { value: 30 }, E: { value: 3 }, F: { value: 'Dia forte' } } },
      { index: 3, cells: { A: { value: 46284 }, B: { value: 0 }, C: { value: 0 }, D: { value: 0 }, E: { value: 0 } } },
      { index: 4, cells: { A: { value: 'Total' }, B: { value: 120 }, C: { value: 300 } } },
      { index: 5, cells: { A: { value: 46285 } } },
      { index: 6, cells: { A: { value: '10/06/2026' } } },
    ] },
    { name: 'Resumo', rows: [{ index: 1, cells: { A: { value: 'Resumo' } } }] },
  ],
};
const parsed = domain.parseHistoricalWorkbook(workbook);
const entrySep18 = parsed.entries.find(entry => entry.date === '2026-09-18');
assert.deepEqual(parsed.ignoredSheets, ['Resumo']);
assert.equal(parsed.entries.length, 4);
assert.equal(entrySep18.observation, 'Dia forte');
assert.equal(parsed.entries.find(entry => entry.date === '2026-09-19').investment, 0);
assert.equal(parsed.entries.find(entry => entry.date === '2026-09-20').investment, null);
assert.match(parsed.entries.find(entry => entry.date === '2026-06-10').observation, /suspensões/i);
assert.equal(domain.isSuspensionDate('2026-06-10'), true);
assert.equal(domain.isSuspensionDate('2026-06-24'), true);
assert.equal(domain.isSuspensionDate('2026-06-25'), false);

const preview = domain.previewHistoryImport([entrySep18], parsed.entries);
assert.equal(preview.identical.length, 1);
assert.equal(preview.added.length, 3);
const conflict = domain.previewHistoryImport([entrySep18], [{ ...entrySep18, revenue: 301 }]);
assert.equal(conflict.conflicts.length, 1);
const keepCurrent = domain.mergeHistoryImport([entrySep18], [...parsed.entries, { ...entrySep18, revenue: 301 }]);
assert.equal(keepCurrent.applied, true);
assert.equal(keepCurrent.rows.length, 4);
assert.equal(keepCurrent.rows.find(row => row.date === '2026-09-18').revenue, 300);
assert.equal(domain.mergeHistoryImport([entrySep18], [{ ...entrySep18, revenue: 301 }], { replaceConflicts: true }).rows[0].revenue, 301);

const combined = domain.combineDailyRows(mcc, parsed.entries);
assert.equal(combined.find(row => row.date === '2026-09-18').source, 'planilha');
assert.equal(combined.find(row => row.date === '2026-09-18').investment, 120);
assert.equal(combined.find(row => row.date === '2026-09-18').revenue, 385);
assert.equal(combined.find(row => row.date === '2026-09-18').clicks, 30);
assert.equal(combined.find(row => row.date === '2026-09-18').observation, 'Dia forte');
assert.deepEqual(combined.find(row => row.date === '2026-09-18').productSales, [
  { product: null, sales: 3, amount: null, provisional: false },
  { product: 'Wego6', sales: 1, amount: 85, provisional: true, campaignSales:[{campaignId:'campaign-1',sales:1,amount:85}] },
], 'a planilha preserva vendas agregadas sem inventar produto; vendas provisórias continuam identificadas');
const matchingHistory = domain.combineDailyRows([
  { date: '2026-09-20', officialSales: 2, pendingSales: 0, productSales: [{ product: 'Wego6', sales: 2, amount: 250, provisional: false }] },
], [{ date: '2026-09-20', investment: 10, revenue: 250, clicks: 5, sales: 2, observation: '' }]);
assert.deepEqual(matchingHistory[0].productSales, [{ product: 'Wego6', sales: 2, amount: 250, provisional: false }], 'atribuição MCC é exibida para uma linha histórica somente quando a contagem oficial coincide');
const nullSalesHistory = domain.combineDailyRows(mcc, [{ date: '2026-09-18', investment: null, revenue: null, clicks: null, sales: null, observation: '' }]).find(row=>row.date==='2026-09-18');
assert.equal(nullSalesHistory.sales,3,'ao preencher uma lacuna histórica, MCC não soma as vendas provisórias duas vezes');
assert.equal(nullSalesHistory.productSales.reduce((sum,item)=>sum+item.sales,0),3);
const annotatedHistory = domain.combineDailyRows([], [{ date: '2026-09-20', investment: 10, revenue: 433.91, clicks: 5, sales: 1, observation: '1 Wego6 (R$ 433,91)' }])[0];
assert.deepEqual(annotatedHistory.productSales, [], 'nota histórica já identificada não recebe um rótulo adicional de produto desconhecido');
assert.equal(combined.find(row => row.date === '2026-09-19').source, 'planilha');
assert.equal(combined.find(row => row.date === '2026-09-19').investment, 0);
assert.equal(combined.filter(row => domain.isSuspensionDate(row.date)).length, 15);
assert.equal(combined.find(row => row.date === '2026-06-10').investment, null);
assert.equal(combined.find(row => row.date === '2026-06-10').observation, 'Operação fora do ar devido a suspensões.');
assert.equal(domain.summarize(mcc).sales, 3);
assert.equal(domain.summarize(mcc).clicksPerSale, 20 / 3);
const lifetime = domain.lifetimeSummary([
  { date: '2026-04-01', investment: 100, revenue: 160, profit: 60 },
  { date: '2026-05-01', investment: 50, revenue: null, profit: null },
  { date: '2026-06-01', investment: null, revenue: 40, profit: null },
  { date: '2026-07-01', investment: 80, revenue: 20, profit: -60 },
]);
assert.deepEqual(lifetime, { revenue: 220, profit: 0, revenueDays: 3, profitDays: 2 }, 'o total de todos os meses soma o faturamento observado e calcula lucro só nos dias pareados');

const trendRows = [
  { date: '2026-04-01', investment: 100, revenue: 150, clicks: 10, sales: 2, pendingSales: 1 },
  { date: '2026-04-02', investment: 50, revenue: null, clicks: 5, sales: null, pendingSales: 0 },
  { date: '2026-04-03', investment: 200, revenue: 200, clicks: null, sales: 0, pendingSales: 0 },
  { date: '2026-05-01', investment: 50, revenue: 70, clicks: 0, sales: 1, pendingSales: 0 },
  { date: '2026-09-22', investment: 20, revenue: 50, clicks: 4, sales: 2, pendingSales: 1 },
];
const monthlyTrend = domain.monthlyTrendBuckets(trendRows, { startMonth: '2026-04', throughDate: '2026-09-22' });
assert.deepEqual(monthlyTrend.map(bucket => bucket.key), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
assert.equal(monthlyTrend[0].expectedDays, 30);
assert.equal(monthlyTrend[0].investment, 350);
assert.equal(monthlyTrend[0].revenue, 350);
assert.equal(monthlyTrend[0].profit, 50);
assert.equal(monthlyTrend[0].roi, 50 / 300 * 100, 'ROI mensal deve ser ponderado pelo investimento, não média dos dias');
assert.equal(monthlyTrend[0].clicks, 15);
assert.equal(monthlyTrend[0].clicksPerSale, 7.5, 'cliques por venda mensal usa o total de cliques dividido pelo total de vendas observadas no mês');
assert.equal(monthlyTrend[0].sales, 2);
assert.equal(monthlyTrend[0].officialSales, 1);
assert.equal(monthlyTrend[0].pendingSales, 1);
assert.deepEqual(monthlyTrend[0].coverage, { investment: 3, revenue: 2, profit: 2, roi: 2, clicks: 2, sales: 2 });
assert.equal(monthlyTrend[2].investment, null, 'mês sem observações deve continuar ausente, não zero');
assert.equal(monthlyTrend[2].clicks, null, 'mês sem cliques observados continua como lacuna');
assert.equal(monthlyTrend[2].clicksPerSale, null, 'mês sem cliques ou vendas não inventa uma média');
assert.equal(monthlyTrend[2].coverage.investment, 0);
assert.equal(monthlyTrend[5].expectedDays, 22, 'mês atual deve ser tratado como parcial até a data de referência');
const noObservedClicks = domain.monthlyTrendBuckets([{ date: '2026-04-01', investment: 10, clicks: null, sales: 2 }], { startMonth: '2026-04', throughDate: '2026-04-30' });
assert.equal(noObservedClicks[0].clicksPerSale, null, 'vendas sem cliques observados permanecem sem taxa calculável');
const noSalesForRatio = domain.monthlyTrendBuckets([{ date: '2026-04-01', clicks: 10, sales: 0 }], { startMonth: '2026-04', throughDate: '2026-04-30' });
assert.equal(noSalesForRatio[0].clicksPerSale, null, 'cliques sem vendas não produzem divisão por zero');
const monthlyClicksPerSale = domain.monthlyTrendBuckets([
  { date: '2026-04-01', clicks: 30, sales: 3, pendingSales: 1 },
  { date: '2026-04-02', clicks: 10, sales: 1, pendingSales: 0 }
], { startMonth: '2026-04', throughDate: '2026-04-30' });
assert.equal(monthlyClicksPerSale[0].clicksPerSale, 10, 'razão mensal é ponderada pelos totais e contabiliza vendas provisórias já incluídas em sales');
const billingSales=[
  {sale_id:'mcc-1',sale_date:'2026-10-16',source:'mcc_conversion_aggregate',conversion_count:1,value_brl:300,product:'Total-Control'},
  {sale_id:'manual-1',sale_date:'2026-10-16',source:'manual',confirmation_status:'manual',conversion_count:1,value_brl:225.5,product:'Nebula'},
  {sale_id:'cancelled-1',sale_date:'2026-10-16',source:'manual',active:false,conversion_count:1,value_brl:999,product:'Cancelada'},
];
const billingReconciliation=domain.reconcileBillingSales([
  {date:'2026-10-16',source:'mcc',investment:57.79,revenue:300,profit:242.21,roi:419.1,clicks:6,sales:1,officialSales:1,pendingSales:0,pendingRevenue:0,clicksPerSale:6,productSales:[{product:'Total-Control',sales:1,amount:300,provisional:false}]},
],billingSales,aggregateBillingRevenueByDate(billingSales,5.1));
const reconciledSaleDay=billingReconciliation.rows[0];
assert.equal(reconciledSaleDay.sales,2,'usa conversões ativas do Faturamento e não duplica a conversão MCC já presente no Macro');
assert.equal(reconciledSaleDay.billingSales,1,'a venda adicional fica separada da origem oficial MCC');
assert.equal(reconciledSaleDay.revenue,525.5,'usa o total consolidado do Faturamento mesmo quando a MCC já contém a conversão');
assert.equal(reconciledSaleDay.profit,467.71);
assert.deepEqual(reconciledSaleDay.productSales.at(-1),{product:'Nebula',sales:1,amount:225.5,provisional:false,billing:true});
assert.equal(billingReconciliation.check.activeRecords,2,'venda cancelada não participa da conferência');
assert.equal(billingReconciliation.check.billingConversions,2);
assert.equal(billingReconciliation.check.appliedSales,1);
assert.equal(billingReconciliation.check.appliedRevenue,225.5);
const repeatedBillingReconciliation=domain.reconcileBillingSales(billingReconciliation.rows,billingSales,aggregateBillingRevenueByDate(billingSales,5.1));
assert.equal(repeatedBillingReconciliation.rows[0].sales,2,'renderizar novamente a reconciliação não soma a venda outra vez');
assert.equal(repeatedBillingReconciliation.rows[0].revenue,525.5);
assert.equal(repeatedBillingReconciliation.check.appliedSales,0);
const incompleteBillingSales=[
  {sale_id:'mcc-usd-day',sale_date:'2026-10-17',source:'mcc_conversion_aggregate',conversion_count:1,value_brl:100,product:'Existing BRL'},
  {sale_id:'usd-manual',sale_date:'2026-10-17',source:'manual',conversion_count:1,value_usd:40,product:'USD offer'},
];
const billingIncomplete=domain.reconcileBillingSales([
  {date:'2026-10-17',source:'mcc',investment:20,revenue:100,sales:1,officialSales:1,pendingSales:0,productSales:[]},
],incompleteBillingSales,aggregateBillingRevenueByDate(incompleteBillingSales,5));
assert.equal(billingIncomplete.rows[0].sales,2,'contagem pode ser conciliada mesmo se a moeda não for BRL');
assert.equal(billingIncomplete.rows[0].revenue,300,'USD é convertido com a mesma cotação operacional do gráfico de Faturamento');
assert.equal(billingIncomplete.check.incompleteRevenueDates,0);
const macroHigherSales=[{sale_id:'less',sale_date:'2026-10-18',conversion_count:1,value_brl:200}];
const macroHigher=domain.reconcileBillingSales([{date:'2026-10-18',revenue:400,sales:2,officialSales:2,pendingSales:0}],macroHigherSales,aggregateBillingRevenueByDate(macroHigherSales,5.1));
assert.equal(macroHigher.rows[0].sales,2,'a conferência é não destrutiva e preserva um total histórico maior no Macro');
assert.equal(macroHigher.rows[0].revenue,200,'receita histórica maior é alinhada à fonte Faturamento');
assert.equal(macroHigher.check.macroAheadSalesDates,1);
assert.equal(macroHigher.check.macroAheadRevenueDates,1);
const staleMacroBase={vendas_provisorias:[{id:'manual-cancelled',status:'provisoria'},{id:'manual-active',status:'provisoria'}]};
const cancellationProjection=domain.excludeCancelledBillingManualSales(staleMacroBase,[
  {sale_id:'cancelled',source:'hub_manual_capture',source_ref:'manual-cancelled',active:false,cancelled_at:'2026-10-22T19:00:00.000Z'},
  {sale_id:'inactive-unrelated',source:'mcc_conversion_aggregate',source_ref:'campaign|2026-10-22',active:false,cancelled_at:'2026-10-22T19:00:00.000Z'},
]);
assert.equal(cancellationProjection.excludedCount,1,'o Macro reconhece cancelamento da venda manual vinculada pelo source_ref');
assert.deepEqual(cancellationProjection.database.vendas_provisorias.map(sale=>sale.id),['manual-active']);
assert.equal(staleMacroBase.vendas_provisorias[0].status,'provisoria','a projeção de cancelamentos não altera a base local');
const mixedBillingSales=[
  {sale_id:'confirmed-alpha',sale_date:'2026-10-19',source:'hub_manual_capture',confirmation_status:'confirmed',campaign_id:'campaign-alpha',conversion_count:1,value_brl:22,product:'Alpha — nome completo'},
  {sale_id:'usd-beta',sale_date:'2026-10-19',source:'mcc_conversion_aggregate',campaign_id:'campaign-beta',conversion_count:1,value_usd:60,product:'Beta'},
  {sale_id:'manual-alpha',sale_date:'2026-10-19',source:'manual',confirmation_status:'manual',conversion_count:1,value_brl:25,product:'Alpha'},
];
const mixedBillingDay=domain.reconcileBillingSales([
  {date:'2026-10-19',source:'mcc',revenue:50,sales:2,officialSales:2,pendingSales:0,productSales:[
    {product:'Alpha',sales:1,amount:20,provisional:false,campaignSales:[{campaignId:'campaign-alpha',sales:1,amount:20}]},
    {product:'Beta',sales:1,amount:30,provisional:false,campaignSales:[{campaignId:'campaign-beta',sales:1,amount:30}]},
  ]},
],mixedBillingSales,aggregateBillingRevenueByDate(mixedBillingSales,5));
assert.equal(mixedBillingDay.rows[0].sales,3,'conta a venda manual adicional sem duplicar as conversões MCC já representadas');
assert.equal(mixedBillingDay.rows[0].revenue,347,'usa o total do Faturamento incluindo USD convertido a BRL');
assert.equal(mixedBillingDay.rows[0].billingRevenueDelta,297);
assert.equal(mixedBillingDay.rows[0].productSales.find(item=>item.campaignSales?.[0]?.campaignId==='campaign-alpha').campaignSales[0].amount,22,'a confirmação vinculada corrige o detalhe MCC pela identidade estável da campanha');
assert.equal(mixedBillingDay.rows[0].productSales.at(-1).amount,25);
assert.equal(mixedBillingDay.check.appliedRevenue,297);
assert.equal(mixedBillingDay.check.incompleteRevenueDates,0);
const repeatedMixedSales=[
  {sale_id:'confirmed-alpha',sale_date:'2026-10-19',source:'hub_manual_capture',confirmation_status:'confirmed',campaign_id:'campaign-alpha',conversion_count:1,value_brl:22,product:'Alpha — nome completo'},
  {sale_id:'usd-beta',sale_date:'2026-10-19',source:'mcc_conversion_aggregate',campaign_id:'campaign-beta',conversion_count:1,value_usd:60,product:'Beta'},
  {sale_id:'manual-alpha',sale_date:'2026-10-19',source:'manual',confirmation_status:'manual',conversion_count:1,value_brl:25,product:'Alpha'},
];
const repeatedMixedBillingDay=domain.reconcileBillingSales(mixedBillingDay.rows,repeatedMixedSales,aggregateBillingRevenueByDate(repeatedMixedSales,5));
assert.equal(repeatedMixedBillingDay.rows[0].sales,3);
assert.equal(repeatedMixedBillingDay.rows[0].revenue,347,'repetir a conciliação preserva o total consolidado');
assert.equal(repeatedMixedBillingDay.check.appliedRevenue,0);

const billingSourceSales=[
  {sale_id:'sep-brl',sale_date:'2026-09-03',value_brl:100,conversion_count:1},
  {sale_id:'sep-usd',sale_date:'2026-09-03',value_usd:10,conversion_count:1},
  {sale_id:'cancelled-sep',sale_date:'2026-09-03',value_brl:999,active:false,conversion_count:1},
  {sale_id:'missing-sep',sale_date:'2026-09-04',value_brl:null,value_usd:null,conversion_count:1},
];
const billingRevenueByDate=aggregateBillingRevenueByDate(billingSourceSales,5.1);
const macroSourceRows=domain.reconcileBillingSales([
  {date:'2026-09-03',source:'mcc',investment:50,revenue:500,sales:2,officialSales:2,pendingSales:0},
  {date:'2026-09-04',source:'planilha',investment:30,revenue:75,sales:1,officialSales:1,pendingSales:0},
],billingSourceSales,billingRevenueByDate);
assert.equal(macroSourceRows.rows.find(row=>row.date==='2026-09-03').revenue,151,'o Macro usa a mesma conversão USD→BRL do gráfico e ignora cancelamentos');
assert.equal(macroSourceRows.rows.find(row=>row.date==='2026-09-04').revenue,null,'dia sem valor monetário conhecido permanece incompleto');
assert.equal(macroSourceRows.rows.find(row=>row.date==='2026-09-03').profit,101,'lucro continua sendo faturamento menos investimento MCC');
assert.equal(macroSourceRows.check.incompleteRevenueDates,1);
assert.equal(domain.billingRevenueForRange(billingRevenueByDate,'2026-09-01','2026-09-30'),151,'o KPI mensal usa diretamente a soma diária consolidada do Faturamento');
assert.equal(domain.monthlyTrendBuckets(macroSourceRows.rows,{startMonth:'2026-09',throughDate:'2026-09-04'},billingRevenueByDate)[0].revenue,151,'o gráfico mensal preserva o total observado do Faturamento mesmo com lacuna de valor em outro dia');
const dailyBillingBuckets=domain.dailyTrendBuckets(macroSourceRows.rows,'2026-09','2026-09-04',billingRevenueByDate);
assert.equal(dailyBillingBuckets.find(bucket=>bucket.key==='2026-09-02').revenue,0,'dia sem lançamento no Faturamento é zero observado no gráfico diário');
assert.equal(dailyBillingBuckets.find(bucket=>bucket.key==='2026-09-04').revenue,null,'dia com lançamento sem valor segue como lacuna, não zero');
assert.equal(domain.billingRevenueForRange(new Map(),'2026-09-01','2026-09-30'),0,'mês sem lançamentos no Faturamento é zero, não valor ausente');
const dailyTrend = domain.dailyTrendBuckets(trendRows, '2026-04', '2026-04-03');
assert.equal(dailyTrend.length, 3);
assert.equal(dailyTrend[1].investment, 50);
assert.equal(dailyTrend[1].revenue, null);
assert.equal(dailyTrend[1].coverage.profit, 0);
assert.equal(domain.dailyTrendBuckets(trendRows, '2026-10', '2026-09-22').length, 0, 'não exibir dias futuros sem dados');

const fallback = domain.combineDailyRows([
  { date: '2026-09-13', investment: 900, revenue: 800, clicks: 17, sales: 2, pendingSales: 0, pendingRevenue: 0, source: 'mcc', hasMccData: true },
  { date: '2026-09-12', investment: 900, revenue: 800, clicks: 17, sales: 2, pendingSales: 0, pendingRevenue: 0, source: 'mcc', hasMccData: true },
], [
  { date: '2026-09-13', investment: null, revenue: null, clicks: null, sales: null, observation: '' },
  { date: '2026-09-12', investment: null, revenue: null, clicks: null, sales: null, observation: '' },
]);
assert.equal(fallback.find(row => row.date === '2026-09-13').investment, null);
assert.equal(fallback.find(row => row.date === '2026-09-13').revenue, null);
assert.equal(fallback.find(row => row.date === '2026-09-13').clicks, 17);
assert.equal(fallback.find(row => row.date === '2026-09-13').sales, 2);
assert.equal(fallback.find(row => row.date === '2026-09-13').source, 'mixed');
assert.equal(fallback.find(row => row.date === '2026-09-12').investment, null);
assert.equal(fallback.find(row => row.date === '2026-09-12').clicks, null);
const authoritativeDaily=domain.aggregateMccDaily([
  {campanha_id:'campaign-1',data:'2026-10-01',celulas:{O:{value:40},P:{value:100},C:{value:8},F:{value:2}}},
  {campanha_id:'campaign-1',data:'2026-10-02',celulas:{O:{value:20},P:{value:30},C:{value:5},F:{value:1}}},
],new Map(),{authoritativeDates:['2026-10-01','2026-10-02']});
const authoritativeCombined=domain.combineDailyRows(authoritativeDaily,[
  {date:'2026-10-01',investment:400,revenue:300,clicks:80,sales:10,observation:'legado D−1'},
  {date:'2026-10-02',investment:500,revenue:400,clicks:90,sales:12,observation:'legado D0'},
  {date:'2026-10-03',investment:10,revenue:25,clicks:2,sales:1,observation:'fora do retrato'},
],{authoritativeDates:['2026-10-01','2026-10-02']});
assert.deepEqual(authoritativeCombined.filter(row=>row.date.startsWith('2026-10')).map(row=>[row.date,row.source,row.investment,row.revenue,row.profit,row.clicks,row.sales]),[
  ['2026-10-03','planilha',10,25,15,2,1],['2026-10-02','mcc',20,30,10,5,1],['2026-10-01','mcc',40,100,60,8,2],
],'capturas recentes D0/D−1 prevalecem sobre a planilha nas mesmas datas, sem alterar dias fora do retrato');
assert.equal(authoritativeCombined.find(row=>row.date==='2026-10-02').observation,'legado D0','corrigir métricas não remove anotações do usuário');
const absentSnapshot=domain.combineDailyRows([], [{date:'2026-10-02',investment:500,revenue:400,clicks:90,sales:12}], {authoritativeDates:['2026-10-02']});
assert.equal(absentSnapshot.some(row=>row.date==='2026-10-02'),false,'campanha sem métricas na captura mais recente não conserva o dia antigo na agregação');
assert.deepEqual(domain.summarize(authoritativeCombined),{investment:70,revenue:155,profit:85,roi:85/70*100,clicks:15,sales:4,clicksPerSale:3.75},'KPIs e lucro derivado no Macro refletem as métricas substituídas');

const template = await readFile(new URL('../src/control-macro/view.js', import.meta.url), 'utf8') + await readFile(new URL('../src/control-macro/template.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/control-macro/control-macro.css', import.meta.url), 'utf8');
assert.match(template, /Number\(row\.sales\)>0\?'macro-sales-row':''/);
assert.match(template, /isSuspensionDate\(row\.date\)\?'macro-suspension-row'/);
assert.match(template, /id="macroKpis" class="macro-kpis"/);
assert.match(template, /id="macroDailyFoot" aria-label="Totais do mês"/);
assert.doesNotMatch(template, /macroLifetimeKpis|macro-lifetime-summary/);
assert.match(template, /lifetimeSummary\(all\)/);
assert.match(template, /macroKpi\('Lucro total'.*Histórico completo/);
assert.match(template,/id="macroBillingStatus"/);
assert.doesNotMatch(template, /macroKpi\('Faturamento total'/);
assert.match(styles, /\.macro-kpis\{display:grid;grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
assert.match(styles, /\.macro-kpi\{min-width:0;padding:8px 9px/);
assert.match(styles, /\.macro-table tr\.macro-sales-row td\{background:rgba\(52,211,153,.075\)\}/);
assert.match(styles, /\.macro-table tfoot th,\.macro-table tfoot td\{position:static;padding:6px 9px/);
assert.match(styles, /\.macro-table tr\.macro-suspension-row td\{background:rgba\(248,113,113,.075\)\}/);

console.log('control macro domain ok');

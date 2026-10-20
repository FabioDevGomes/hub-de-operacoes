import assert from 'node:assert/strict';
import {
  aggregateBillingRevenueByDate, aggregateBy, aggregateCashBy, billingValueInBrlForPresentation, billingValueInUsdForPresentation, BILLING_MANUAL_STATUS_OPTIONS, BILLING_STATUSES, compareRows, dateRangeFor, dateRangeForMonth, displayProductName, filterRows, formatBrazilianDate, mccConversionSaleId, monthlyFinancialSeries,
  normalizeMovement, normalizeSale, paginate, parseBrazilianDate, provisionalSaleToBilling, resolveMccSalePlatforms, summarizeCash, summarizeCompetence, totalSalesCount,
} from '../src/billing/billing-domain.mjs';

const sales = [
  normalizeSale({ sale_id:'s1', sale_date:'2026-09-10', product:'Produto A', platform:'Hotmart', commission_type:'Comissão', account:'Conta 1', value_brl:100, value_usd:20, payment_status:'paid' }),
  normalizeSale({ sale_id:'s2', sale_date:'2026-09-20', product:'Produto B', platform:'ClickBank', commission_type:'CPA', account:'Conta 2', value_brl:50, value_usd:null, payment_status:'pending' }),
  normalizeSale({ sale_id:'s3', sale_date:'2026-09-21', product:'Produto B', platform:'ClickBank', commission_type:'CPA', account:'Conta 2', value_brl:0, value_usd:0, payment_status:'unknown', active:false }),
  normalizeSale({ sale_id:'s4', sale_date:'2026-09-22', product:'Produto C', platform:'Hotmart', commission_type:'Comissão', account:'Conta 1', value_brl:25, value_usd:null, payment_status:'paid' }),
];
const movements = [
  normalizeMovement({ movement_id:'m1', sale_id:'s1', type:'receipt', effective_date:'2026-09-15', value_brl:100, value_usd:20 }),
  normalizeMovement({ movement_id:'m2', sale_id:'s1', type:'refund', effective_date:'2026-09-22', value_brl:10, value_usd:null }),
  normalizeMovement({ movement_id:'m3', sale_id:'s4', type:'receipt', effective_date:null, value_brl:25, value_usd:null }),
];

assert.equal(displayProductName('20/09 - Total-Control 04 (CB-BB-US) 85% - US$ 45'), 'Total-Control', 'rótulo MCC remove data e metadados de campanha/preço preservando hífen do nome');
assert.equal(displayProductName('16/09 - NebuEaser 08 (GM-BB-US/CA) 85% - US$ 45'), 'NebuEaser', 'rótulo MCC remove o identificador numérico da campanha');
assert.equal(displayProductName('ResQVac - CTC $49.99 - Presell Page - Accepts PayPal - Direct Checkout'), 'ResQVac', 'detalhes de checkout e pagamento não entram no rótulo');
assert.equal(displayProductName('Slimqa Slim Coffee Booster - German Page - (New)'), 'Slimqa Slim Coffee Booster', 'detalhes de página de venda são omitidos');
assert.equal(displayProductName('The Brain Song - Killer NEW Memory Offer'), 'The Brain Song - Killer NEW Memory Offer', 'hífens sem marcador conhecido de metadados permanecem intactos');
assert.equal(displayProductName('Produto simples'), 'Produto simples', 'produto sem detalhes mantém o nome original');
assert.equal(displayProductName(''), '', 'rótulo vazio continua vazio');
const detailedName = '20/09 - Total-Control 04 (CB-BB-US) 85% - US$ 45';
assert.equal(normalizeSale({ sale_id:'display-only', sale_date:'2026-09-20', product:detailedName, platform:'ClickBank' }).product, detailedName, 'o nome bruto continua intacto no registro persistido');

const competence = summarizeCompetence(sales, movements);
assert.equal(competence.salesCount, 3, 'cancelada não compõe KPIs por padrão');
assert.equal(competence.grossBrl.amount, 175);
assert.equal(competence.refundBrl.amount, 10);
assert.equal(competence.netBrl.amount, 165);
assert.equal(competence.netUsd.amount, 20);
assert.equal(competence.netUsd.complete, false, 'reembolso em moeda desconhecida torna o líquido USD incompleto');
assert.equal(competence.receiptBrl.amount, 125, 'recebimento sem data continua recebido na visão de competência');
assert.equal(competence.pendingBrl.amount, 50, 'status pago sem data não vira pendente');
assert.equal(competence.paidWithoutDateCount, 1);
assert.equal(competence.missingUsdCount, 2);
assert.equal(totalSalesCount(sales),3,'total histórico exclui vendas canceladas e soma quantidade de conversões ativas');
const issuedSale=normalizeSale({sale_id:'issued',sale_date:'2026-09-24',product:'Produto emitido',platform:'Hotmart',value_brl:75,payment_status:'issued'});
const issuedSummary=summarizeCompetence([issuedSale],[]);
assert.equal(BILLING_STATUSES.issued,'Pagamento emitido');
assert.equal(BILLING_STATUSES.paid,'Pagamento recebido');
assert.deepEqual(BILLING_MANUAL_STATUS_OPTIONS,['pending','issued','paid']);
assert.equal(issuedSummary.pendingBrl.amount,75,'pagamento emitido permanece no saldo a receber');
assert.equal(issuedSummary.pendingCount,1,'pagamento emitido permanece contado como pendente');

const cash = summarizeCash(movements.filter(move => move.effective_date && move.effective_date >= '2026-09-15' && move.effective_date <= '2026-09-22'));
assert.equal(cash.movementCount, 2, 'movimento sem data não entra na competência temporal de caixa');
assert.equal(cash.receiptsBrl.amount, 100);
assert.equal(cash.refundsBrl.amount, 10);
assert.equal(cash.netBrl.amount, 90);
assert.equal(cash.netUsd.complete, false);

assert.equal(normalizeSale({ sale_id:'zero', sale_date:'2026-01-01', product:'P', platform:'X', value_brl:0 }).value_brl, 0, 'zero é diferente de valor ausente');
const linkedManualSale=provisionalSaleToBilling({id:'sale-local',billing_sale_id:'manual-sale:cmp-1',campanha_id:'cmp-1',data:'2026-09-23',produto:'Produto A',plataforma:'GuruMedia',conta:'3248',valor_brl:229.5,status:'provisoria'});
assert.equal(linkedManualSale.sale_id,'manual-sale:cmp-1');
assert.equal(linkedManualSale.confirmation_status,'manual');
assert.equal(linkedManualSale.payment_status,'pending','lançamento manual não se transforma em recebimento');
const linkedConfirmedSale=provisionalSaleToBilling({id:'sale-local',billing_sale_id:'manual-sale:cmp-1',campanha_id:'cmp-1',data:'2026-09-23',produto:'Produto A',plataforma:'GuruMedia',valor_brl:229.5,status:'conciliada',conciliada_em:'2026-09-24T12:00:00Z'});
assert.equal(linkedConfirmedSale.confirmation_status,'confirmed');
assert.equal(linkedConfirmedSale.confirmation_source,'MCC D−1');
assert.equal(linkedConfirmedSale.payment_status,'pending','confirmação MCC não significa pagamento recebido');
const mccAggregate=normalizeSale({sale_id:mccConversionSaleId('cmp-mcc','2026-09-24'),sale_date:'2026-09-24',product:'Produto MCC',platform:'Google Ads MCC',value_brl:120,payment_status:'pending',confirmation_status:'confirmed',confirmation_source:'MCC D−1',campaign_id:'cmp-mcc',source:'mcc_conversion_aggregate',source_period:'d1',conversion_count:2});
const campaignCatalog=[{id:'cmp-mcc',nome_mcc:'Campanha antiga (GM-BB-US)'}];
const platformResolver=name=>name.includes('(GM-')?'Guru Media':name.includes('(MS-')?'Midi Scalers':name.includes('(CB-')?'ClickBank':null;
const resolvedMcc=resolveMccSalePlatforms([mccAggregate],campaignCatalog,platformResolver);
assert.equal(resolvedMcc[0].platform,'Guru Media','registro MCC antigo exibe a plataforma inferida mesmo que tenha sido salvo com Google Ads MCC');
assert.equal(mccAggregate.platform,'Google Ads MCC','a resolução visual não altera o registro persistido');
const overrideMcc=normalizeSale({...mccAggregate,sale_id:'manual-override-mcc',platform:'Parceiro escolhido',manual_platform_override:true});
assert.equal(resolveMccSalePlatforms([overrideMcc],campaignCatalog,platformResolver)[0].platform,'Parceiro escolhido','plataforma ajustada manualmente não é substituída pela inferência');
const nonMccSale=normalizeSale({sale_id:'non-mcc-platform',sale_date:'2026-09-24',product:'Produto',platform:'Parceiro',campaign_id:'cmp-mcc',source:'manual'});
assert.equal(resolveMccSalePlatforms([nonMccSale],campaignCatalog,platformResolver)[0],nonMccSale,'a inferência não altera vendas que não vieram do agregado MCC');
assert.equal(mccAggregate.conversion_count,2);
assert.equal(totalSalesCount([mccAggregate]),2,'total histórico conta conversões agregadas MCC, não só as linhas');
assert.equal(mccAggregate.confirmation_status,'confirmed');
assert.equal(mccConversionSaleId('cmp-mcc','2026-09-24'),'mcc-conversion:cmp-mcc:2026-09-24');
const mccSummary=summarizeCompetence([mccAggregate],[]);
assert.equal(mccSummary.salesCount,2,'linha agregada soma a quantidade de conversões, não apenas as linhas da tabela');
assert.equal(mccSummary.grossBrl.amount,120);
assert.equal(mccSummary.averageBrl,60,'comissão média usa o total agregado dividido pela quantidade');
assert.equal(normalizeSale({...mccAggregate,confirmation_status:'provisional'}).confirmation_status,'provisional');
assert.equal(normalizeSale({ sale_id:'null', sale_date:'2026-01-01', product:'P', platform:'X', value_brl:null }).value_brl, null);
assert.throws(() => normalizeMovement({ sale_id:'x', type:'refund', effective_date:null, value_brl:null, value_usd:null }), /pelo menos um valor/);
assert.throws(() => normalizeSale({ sale_date:'2026-02-30', product:'P', platform:'X', value_brl:1 }), /data da venda/);

assert.equal(parseBrazilianDate('09/24/2026'), null);
assert.equal(parseBrazilianDate('24/09/2026'), '2026-09-24');
assert.equal(formatBrazilianDate('2026-09-24'), '24/09/2026');
assert.deepEqual(dateRangeFor('last7', new Date(2026, 8, 24)), { start:'2026-09-18', end:'2026-09-24' });
assert.deepEqual(dateRangeFor('previous', new Date(2026, 0, 14)), { start:'2025-12-01', end:'2025-12-31' });
assert.deepEqual(dateRangeForMonth('2024-02'), { start:'2024-02-01', end:'2024-02-29' }, 'navegação por mês respeita ano bissexto');
assert.deepEqual(dateRangeForMonth('2025-12'), { start:'2025-12-01', end:'2025-12-31' }, 'navegação mensal preserva virada do ano');
assert.equal(dateRangeForMonth('2025-13'), null, 'mês inválido não produz período');

const filtered = filterRows(sales.map(sale => ({ sale })), { platform:'Hotmart', account:'Conta 1', status:'paid', search:'produto c' });
assert.deepEqual(filtered.map(row => row.sale.sale_id), ['s4'], 'filtros de texto e dimensões são cumulativos e ignoram capitalização');
assert.deepEqual(aggregateBy(sales.filter(sale => sale.active), movements, 'product').map(row => row.key).sort(), ['Produto A','Produto B','Produto C'].sort());
const cashByMonth = aggregateCashBy(movements.filter(move => move.effective_date), new Map(sales.map(sale => [sale.sale_id, sale])), 'month');
assert.equal(cashByMonth.length, 1);
assert.equal(cashByMonth[0].key, '2026-09');
const chartSales = [...sales, normalizeSale({ sale_id:'s5', sale_date:'2026-09-25', product:'Produto D', platform:'Hotmart', value_brl:null, value_usd:10 })];
assert.deepEqual(billingValueInBrlForPresentation(chartSales.at(-1),5.1),{amount:51,source:'usd'},'a tabela pode apresentar o mesmo equivalente em reais sem alterar o valor original USD');
assert.deepEqual(billingValueInBrlForPresentation(normalizeSale({sale_id:'s-usd-no-rate-display',sale_date:'2026-10-11',product:'Produto USD',platform:'ClickBank',value_usd:10})),{amount:null,source:'usd'},'sem taxa válida, o equivalente de USD fica indisponível em vez de virar zero');
assert.deepEqual(billingValueInBrlForPresentation(normalizeSale({sale_id:'s-usd-zero-display',sale_date:'2026-10-11',product:'Produto USD zero',platform:'ClickBank',value_usd:0})),{amount:0,source:'usd'},'zero USD continua equivalente válido mesmo sem taxa');
assert.deepEqual(billingValueInBrlForPresentation(normalizeSale({sale_id:'s-dual-display',sale_date:'2026-10-11',product:'Produto em duas moedas',platform:'ClickBank',value_brl:125,value_usd:24.5}),5.1),{amount:125,source:'brl'},'quando BRL foi informado, ele prevalece sem conversão ou soma com USD');
const brlOnlySale = normalizeSale({sale_id:'s-brl-display',sale_date:'2026-10-11',product:'Produto BRL',platform:'ClickBank',value_brl:299.99});
const brlOnlySaleBeforePresentation = JSON.stringify(brlOnlySale);
assert.deepEqual(billingValueInUsdForPresentation(brlOnlySale,5.1),{amount:299.99/5.1,source:'brl'},'a tabela pode apresentar o equivalente em dólares de uma venda BRL pela cotação operacional');
assert.equal(JSON.stringify(brlOnlySale),brlOnlySaleBeforePresentation,'calcular o equivalente USD é somente apresentação e não altera o lançamento');
assert.deepEqual(billingValueInUsdForPresentation(normalizeSale({sale_id:'s-brl-no-rate-display',sale_date:'2026-10-11',product:'Produto BRL',platform:'ClickBank',value_brl:100})),{amount:null,source:'brl'},'sem taxa válida, o equivalente de BRL fica indisponível em vez de inventar valor');
assert.deepEqual(billingValueInUsdForPresentation(normalizeSale({sale_id:'s-brl-zero-display',sale_date:'2026-10-11',product:'Produto BRL zero',platform:'ClickBank',value_brl:0})),{amount:0,source:'brl'},'zero BRL continua equivalente válido mesmo sem taxa');
assert.deepEqual(billingValueInUsdForPresentation(normalizeSale({sale_id:'s-dual-usd-display',sale_date:'2026-10-11',product:'Produto em duas moedas',platform:'ClickBank',value_brl:125,value_usd:24.5}),5.1),{amount:24.5,source:'usd'},'quando USD original está informado, ele prevalece sem conversão ou soma com BRL');
assert.deepEqual(billingValueInUsdForPresentation(normalizeSale({sale_id:'s-no-currency-display',sale_date:'2026-10-11',product:'Produto sem valor',platform:'ClickBank'}),5.1),{amount:null,source:null},'sem valor nas duas moedas, a apresentação permanece vazia');
const chartManualSale = provisionalSaleToBilling({id:'sale-chart',billing_sale_id:'manual-sale:cmp-chart',campanha_id:'cmp-chart',data:'2026-09-29',produto:'Produto E',plataforma:'FlowTracking',valor_brl:235.12,status:'provisoria'});
const chartConfirmedManualSale = provisionalSaleToBilling({id:'sale-chart-confirmed',billing_sale_id:'manual-sale:cmp-chart-confirmed',campanha_id:'cmp-chart',data:'2026-09-30',produto:'Produto F',plataforma:'FlowTracking',valor_brl:20,status:'conciliada'});
const monthlyCompetence = monthlyFinancialSeries({ sales:[...chartSales, chartManualSale, chartConfirmedManualSale], movements, start:'2026-08-20', end:'2026-10-02', exchangeRate:5.1 });
assert.deepEqual(monthlyCompetence.map(({ key, value, records, complete }) => ({ key, value, records, complete })), [
  { key:'2026-08', value:0, records:0, complete:true },
  { key:'2026-09', value:481.12, records:6, complete:true },
  { key:'2026-10', value:0, records:0, complete:true },
], 'série mensal usa BRL quando disponível, converte USD apenas como alternativa, preserva meses vazios como zero e não marca USD como valor ausente');
const dailyRevenue=aggregateBillingRevenueByDate([...chartSales,chartManualSale,chartConfirmedManualSale],5.1);
assert.equal([...dailyRevenue.values()].reduce((total,day)=>total+(day.amount||0),0),monthlyCompetence[1].value,'as receitas diárias que alimentam o Controle Macro usam exatamente a mesma regra/cotação da série mensal do Faturamento');
assert.equal(dailyRevenue.get('2026-09-25').amount,51,'receita diária converte valores USD em BRL pela cotação atual');
assert.deepEqual(monthlyCompetence[1].manualBrl, { amount:255.12, records:2, missing:0 }, 'o subtotal manual, inclusive os lançamentos já conciliados, aparece separado no tooltip e já está incluído uma única vez no total mensal');
const dualCurrencySale = normalizeSale({ sale_id:'s-dual-currency', sale_date:'2026-10-13', product:'Produto em duas moedas', platform:'ClickBank', value_brl:125, value_usd:24.5 });
const dualCurrencyMonth = monthlyFinancialSeries({ sales:[dualCurrencySale], start:'2026-10-01', end:'2026-10-31', exchangeRate:5.1 });
const dualCurrencyDay = aggregateBillingRevenueByDate([dualCurrencySale],5.1).get('2026-10-13');
assert.equal(dualCurrencyMonth[0].value,125,'com BRL e USD no mesmo lançamento, o gráfico contabiliza o valor em BRL uma única vez');
assert.deepEqual({ amount:dualCurrencyDay.amount, known:dualCurrencyDay.knownAmounts, sale:dualCurrencyDay.saleAmounts.get('s-dual-currency') },{ amount:125, known:1, sale:125 },'Controle Macro usa a mesma precedência por lançamento que o gráfico de Faturamento');
const zeroBrlDualCurrency = monthlyFinancialSeries({ sales:[normalizeSale({ sale_id:'s-zero-brl-dual', sale_date:'2026-10-14', product:'Produto zero BRL', platform:'ClickBank', value_brl:0, value_usd:10 })], start:'2026-10-01', end:'2026-10-31', exchangeRate:5.1 });
assert.deepEqual({ value:zeroBrlDualCurrency[0].value, complete:zeroBrlDualCurrency[0].complete },{ value:0, complete:true },'BRL zero explícito prevalece sobre USD e não é tratado como valor ausente');
const missingBrlMovement = normalizeMovement({ movement_id:'m4', sale_id:'s1', type:'receipt', effective_date:'2026-09-20', value_brl:null, value_usd:10 });
const monthlyCash = monthlyFinancialSeries({ movements:[...movements.filter(move => move.effective_date), missingBrlMovement], salesById:new Map(sales.map(sale => [sale.sale_id, sale])), start:'2026-09-01', end:'2026-10-01', mode:'cash', exchangeRate:5.1 });
assert.deepEqual(monthlyCash.map(({ key, value, complete }) => ({ key, value, complete })), [
  { key:'2026-09', value:141, complete:true },
  { key:'2026-10', value:0, complete:true },
], 'série de caixa usa BRL por movimento quando presente, converte USD apenas quando falta BRL e preserva os sinais líquidos');
const missingValueSale = normalizeSale({ sale_id:'s-missing-chart', sale_date:'2026-10-10', product:'Produto sem valor', platform:'ClickBank', value_brl:null, value_usd:null });
const partialChart = monthlyFinancialSeries({ sales:[missingValueSale], start:'2026-10-01', end:'2026-10-31', exchangeRate:5.1 });
assert.deepEqual(partialChart.map(({ value, complete, missingAmounts }) => ({ value, complete, missingAmounts })), [
  { value:null, complete:false, missingAmounts:1 },
], 'série mensal continua incompleta quando falta valor em ambas as moedas');
const noRateChart = monthlyFinancialSeries({ sales:[normalizeSale({ sale_id:'s-usd-no-rate', sale_date:'2026-10-11', product:'Produto USD', platform:'ClickBank', value_usd:10 })], start:'2026-10-01', end:'2026-10-31' });
assert.deepEqual(noRateChart.map(({ value, complete, missingAmounts }) => ({ value, complete, missingAmounts })), [
  { value:null, complete:false, missingAmounts:1 },
], 'sem taxa válida o valor USD não vira zero nem é somado como BRL');
const noRateByDate=aggregateBillingRevenueByDate([normalizeSale({sale_id:'s-usd-no-rate-daily',sale_date:'2026-10-11',product:'Produto USD',platform:'ClickBank',value_usd:10})]);
assert.deepEqual({amount:noRateByDate.get('2026-10-11').amount,complete:noRateByDate.get('2026-10-11').complete},{amount:null,complete:false},'a fonte diária do Macro mantém a mesma lacuna quando não existe cotação USD válida');
const zeroUsdChart = monthlyFinancialSeries({ sales:[normalizeSale({ sale_id:'s-usd-zero', sale_date:'2026-10-12', product:'Produto USD zero', platform:'ClickBank', value_usd:0 })], start:'2026-10-01', end:'2026-10-31' });
assert.deepEqual(zeroUsdChart.map(({ value, complete }) => ({ value, complete })), [
  { value:0, complete:true },
], 'zero em USD permanece um valor observado mesmo sem cotação');
assert.deepEqual(monthlyFinancialSeries({ sales, start:'2026-10-02', end:'2026-10-01' }), [], 'intervalo inválido não gera categorias');
assert.equal(compareRows({ sale:{product:'Alfa'} }, { sale:{product:'Beta'} }, 'product', 'asc') < 0, true);
assert.deepEqual(paginate(Array.from({ length:51 }, (_, index) => index), 2, 50), { page:2, pageSize:50, pages:2, total:51, rows:[50] });

console.log('billing domain ok');

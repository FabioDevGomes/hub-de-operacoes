import assert from 'node:assert/strict';
import {
  aggregateBy, aggregateCashBy, compareRows, dateRangeFor, dateRangeForMonth, filterRows, formatBrazilianDate, mccConversionSaleId, monthlyFinancialSeries,
  normalizeMovement, normalizeSale, paginate, parseBrazilianDate, provisionalSaleToBilling, summarizeCash, summarizeCompetence,
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
const mccAggregate=normalizeSale({sale_id:mccConversionSaleId('cmp-mcc','2026-09-24'),sale_date:'2026-09-24',product:'Produto MCC',platform:'Google Ads MCC',value_brl:120,payment_status:'pending',confirmation_status:'confirmed',confirmation_source:'MCC D−1',source:'mcc_conversion_aggregate',source_period:'d1',conversion_count:2});
assert.equal(mccAggregate.conversion_count,2);
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
const chartManualSale = provisionalSaleToBilling({id:'sale-chart',billing_sale_id:'manual-sale:cmp-chart',campanha_id:'cmp-chart',data:'2026-09-29',produto:'Produto E',plataforma:'FlowTracking',valor_brl:235.12,status:'provisoria'});
const chartConfirmedManualSale = provisionalSaleToBilling({id:'sale-chart-confirmed',billing_sale_id:'manual-sale:cmp-chart-confirmed',campanha_id:'cmp-chart',data:'2026-09-30',produto:'Produto F',plataforma:'FlowTracking',valor_brl:20,status:'conciliada'});
const monthlyCompetence = monthlyFinancialSeries({ sales:[...chartSales, chartManualSale, chartConfirmedManualSale], movements, start:'2026-08-20', end:'2026-10-02' });
assert.deepEqual(monthlyCompetence.map(({ key, value, records, complete }) => ({ key, value, records, complete })), [
  { key:'2026-08', value:0, records:0, complete:true },
  { key:'2026-09', value:430.12, records:6, complete:false },
  { key:'2026-10', value:0, records:0, complete:true },
], 'série mensal inclui meses sem venda como zero e preserva mês com valores ausentes como parcial');
assert.deepEqual(monthlyCompetence[1].manualBrl, { amount:255.12, records:2, missing:0 }, 'o subtotal manual, inclusive os lançamentos já conciliados, aparece separado no tooltip e já está incluído uma única vez no total mensal');
const missingBrlMovement = normalizeMovement({ movement_id:'m4', sale_id:'s1', type:'receipt', effective_date:'2026-09-20', value_brl:null, value_usd:10 });
const monthlyCash = monthlyFinancialSeries({ movements:[...movements.filter(move => move.effective_date), missingBrlMovement], salesById:new Map(sales.map(sale => [sale.sale_id, sale])), start:'2026-09-01', end:'2026-10-01', mode:'cash' });
assert.deepEqual(monthlyCash.map(({ key, value, complete }) => ({ key, value, complete })), [
  { key:'2026-09', value:90, complete:false },
  { key:'2026-10', value:0, complete:true },
], 'série de caixa agrupa recebimentos líquidos de reembolsos e mantém incompletude monetária');
assert.deepEqual(monthlyFinancialSeries({ sales, start:'2026-10-02', end:'2026-10-01' }), [], 'intervalo inválido não gera categorias');
assert.equal(compareRows({ sale:{product:'Alfa'} }, { sale:{product:'Beta'} }, 'product', 'asc') < 0, true);
assert.deepEqual(paginate(Array.from({ length:51 }, (_, index) => index), 2, 50), { page:2, pageSize:50, pages:2, total:51, rows:[50] });

console.log('billing domain ok');

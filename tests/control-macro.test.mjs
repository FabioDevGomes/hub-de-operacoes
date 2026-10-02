import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

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
  { date: '2026-09-18', hasMccData: true, source: 'mcc', investment: 100, revenue: 335, profit: 235, roi: 235, clicks: 20, sales: 3, officialSales: 2, pendingSales: 1, pendingRevenue: 85, clicksPerSale: 20 / 3, productSales: [{ product: 'Wego6', sales: 2, amount: 250, provisional: false }, { product: 'Wego6', sales: 1, amount: 85, provisional: true }] },
  { date: '2026-09-19', hasMccData: true, source: 'mcc', investment: 0, revenue: 0, profit: 0, roi: null, clicks: 0, sales: 0, officialSales: 0, pendingSales: 0, pendingRevenue: 0, clicksPerSale: null, productSales: [] },
]);

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
  { product: 'Wego6', sales: 1, amount: 85, provisional: true },
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

const template = await readFile(new URL('../src/control-macro/view.js', import.meta.url), 'utf8') + await readFile(new URL('../src/control-macro/template.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/control-macro/control-macro.css', import.meta.url), 'utf8');
assert.match(template, /Number\(row\.sales\)>0\?'macro-sales-row':''/);
assert.match(template, /isSuspensionDate\(row\.date\)\?'macro-suspension-row'/);
assert.match(template, /id="macroKpis" class="macro-kpis"/);
assert.doesNotMatch(template, /macroLifetimeKpis|macro-lifetime-summary/);
assert.match(template, /lifetimeSummary\(all\)/);
assert.match(template, /macroKpi\('Lucro total'.*Histórico completo/);
assert.doesNotMatch(template, /macroKpi\('Faturamento total'/);
assert.match(styles, /\.macro-kpis\{display:grid;grid-template-columns:repeat\(8,minmax\(0,1fr\)\)/);
assert.match(styles, /\.macro-kpi\{min-width:0;padding:8px 9px/);
assert.match(styles, /\.macro-table tr\.macro-sales-row td\{background:rgba\(52,211,153,.075\)\}/);
assert.match(styles, /\.macro-table tr\.macro-suspension-row td\{background:rgba\(248,113,113,.075\)\}/);

console.log('control macro domain ok');

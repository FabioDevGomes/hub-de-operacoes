import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/database.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {}, structuredClone });
vm.runInContext(source, context);
const database = context.window.CampaignDatabase;
const timeZone = 'America/Sao_Paulo';
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
const today = `${dateParts.find(part => part.type === 'year').value}-${dateParts.find(part => part.type === 'month').value}-${dateParts.find(part => part.type === 'day').value}`;
const yesterdayDate = new Date(`${today}T00:00:00Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);
const now = new Date().toISOString();

const existingBase = database.create();
existingBase.diario = [{ campanha_id: 'historic-campaign', data: yesterday, origem: ['manifesto'], celulas: { B: { value: 321 }, C: { value: 17 }, O: { value: 88.75 } } }];
existingBase.manifesto_atual = { separacao_temporal: { D_menos_1: { datas_detectadas: [yesterday] } } };
existingBase.google_ads_api_daily_captures = [{
  managerCustomerId: '1111111111', customerId: '2222222222', date: yesterday, currencyCode: 'USD',
  timeZone, coverageStatus: 'rows_returned', rows: [{ campaignId: '3333333333', clicks: 2 }],
}];
const diaryBefore = JSON.stringify(existingBase.diario);
const manifestBefore = JSON.stringify(existingBase.manifesto_atual);
const historicalCaptureBefore = JSON.stringify(existingBase.google_ads_api_daily_captures[0]);

const currentReport = {
  managerCustomerId: '1111111111', customerId: '2222222222', accountName: 'Conta sintética',
  dateFrom: today, dateTo: today, currencyCode: 'BRL', timeZone,
  generatedAtUtc: now, shareMetricsAvailable: true,
  rows: [{ date: today, campaignId: '4444444444', campaignName: 'Campanha atual', campaignStatus: 'ENABLED', channelType: 'SEARCH', impressions: 12, clicks: 3, ctr: 0.25, averageCpcMicros: 2_000_000, costMicros: 6_000_000, conversions: 1, costPerConversionMicros: 6_000_000, conversionsValue: 10, searchImpressionShare: 0.4 }],
};
const saved = database.saveGoogleAdsDailyCaptures(existingBase, [currentReport], {
  todayByAccount: { '2222222222': today }, now,
});
assert.equal(saved.savedCaptures, 1);
assert.equal(saved.savedRows, 1);
assert.equal(JSON.stringify(saved.base.diario), diaryBefore, 'a captura API mantém intacto o Diário MCC histórico');
assert.equal(JSON.stringify(saved.base.manifesto_atual), manifestBefore, 'a captura API não modifica o manifesto histórico');
assert.equal(JSON.stringify(saved.base.google_ads_api_daily_captures[0]), historicalCaptureBefore, 'a captura de outro dia permanece intacta');
const todayCapture = saved.base.google_ads_api_daily_captures.find(item => item.date === today);
assert.equal(todayCapture.currencyCode, 'BRL');
assert.equal(JSON.stringify(database.googleAdsApiCaptureDateRange('2026-10-26')), JSON.stringify({ dateFrom:'2026-10-26', dateTo:'2026-10-26', windowDays:7 }), 'a janela inicial começa no marco operacional, sem incluir dias anteriores');
assert.equal(JSON.stringify(database.googleAdsApiCaptureDateRange('2026-10-27')), JSON.stringify({ dateFrom:'2026-10-26', dateTo:'2026-10-27', windowDays:7 }), 'D−1 entra na janela no primeiro dia seguinte ao início da API');
assert.equal(JSON.stringify(database.googleAdsApiCaptureDateRange('2026-11-10')), JSON.stringify({ dateFrom:'2026-11-04', dateTo:'2026-11-10', windowDays:7 }), 'a janela móvel mantém até sete datas recentes');
assert.equal(todayCapture.rows[0].costMicros, 6_000_000, 'custo mantém a moeda e a unidade recebidas da API');
assert.equal(todayCapture.rows[0].conversionsValue, 10, 'valor de conversão mantém a moeda da conta');

const repeated = database.saveGoogleAdsDailyCaptures(saved.base, [{ ...currentReport, rows: [] }], {
  todayByAccount: { '2222222222': today }, now,
});
assert.equal(repeated.base.google_ads_api_daily_captures.length, 2, 'repetir o mesmo dia atualiza a captura do dia sem duplicá-la');
assert.equal(repeated.base.google_ads_api_daily_captures.find(item => item.date === today).coverageStatus, 'completed_no_rows', 'consulta concluída sem linhas não é representada como linhas zero');
assert.equal(repeated.base.google_ads_api_daily_captures.find(item => item.date === yesterday).rows[0].clicks, 2, 'a captura antiga não é substituída');
assert.equal(JSON.stringify(repeated.base.diario), diaryBefore, 'repetir a captura de hoje continua sem tocar nos dados MCC anteriores');

const beforeRejectedWrite = JSON.stringify(existingBase);
assert.throws(() => database.saveGoogleAdsDailyCaptures(existingBase, [{ ...currentReport, dateFrom: yesterday, dateTo: yesterday, rows: [{ ...currentReport.rows[0], date: yesterday }] }], {
  todayByAccount: { '2222222222': today },
}), /janela/);
assert.equal(JSON.stringify(existingBase), beforeRejectedWrite, 'tentativa de gravar data passada recusa a operação sem alterar a base');
assert.throws(() => database.saveGoogleAdsDailyCaptures({ ...existingBase, schema: -1 }, [currentReport], {
  todayByAccount: { '2222222222': today },
}), /proteger os dados existentes/);

console.log('Google Ads rolling daily capture window checks passed.');

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCampaignDailyHistory, searchCampaigns } from '../src/hub-mcp/campaign-analysis-domain.mjs';

function cell(value) { return { value }; }

function sampleBase() {
  return {
    campanhas: [
      { id: 'campaign-1', nome_mcc: '18/10 StopWatt 03 (GM-BB-US) 80% - US 90', conta_id: '1234567890', mcc_id: 'mcc-1', status: 'historico' },
      { id: 'campaign-2', nome_mcc: '18/10 StopWatt 03B (GM-BB-US) 80% - US 90', conta_id: '1234567890', mcc_id: 'mcc-1', status: 'ativa' },
    ],
    mccs: [{ id: 'mcc-1', nome: 'MCC e-com' }],
    diario: [
      { campanha_id: 'campaign-1', data: '2026-10-18', fontes: ['manifesto'], celulas: { B: cell(0), C: cell(0), F: cell(0), O: cell(0), P: cell(0) } },
      { campanha_id: 'campaign-1', data: '2026-10-19', fontes: ['manifesto'], celulas: { B: cell(100), C: cell(12), F: cell(0), G: cell(0.12), I: cell(0.75), J: cell(3.5), O: cell(20.5) } },
      { campanha_id: 'campaign-2', data: '2026-10-19', fontes: ['manifesto'], celulas: { B: cell(95), C: cell(10), F: cell(null), G: cell(10 / 95), I: cell(1.1), J: cell(5.2), O: cell(22.25), P: cell(0) } },
    ],
  };
}

test('pesquisa retorna nome completo, sufixo e cobertura sem expor o ID integral da conta', () => {
  const result = searchCampaigns(sampleBase(), { query: 'stopwatt 03' });
  assert.equal(result.total_matches, 2);
  assert.equal(result.campaigns[0].campaign_name, '18/10 StopWatt 03 (GM-BB-US) 80% - US 90');
  assert.equal(result.campaigns[0].account_suffix, '7890');
  assert.equal(result.campaigns[0].mcc_name, 'MCC e-com');
  assert.equal('conta_id' in result.campaigns[0], false);
});

test('histórico preserva zero versus ausente e limita linhas sem truncar os totais', () => {
  const result = getCampaignDailyHistory(sampleBase(), {
    campaigns: [
      { name: '18/10 StopWatt 03 (GM-BB-US) 80% - US 90' },
      { name: '18/10 StopWatt 03B (GM-BB-US) 80% - US 90' },
    ],
    max_daily_rows: 1,
  });
  assert.equal(result.campaigns.length, 2);
  assert.equal(result.campaigns[0].summary.conversions.total, 0);
  assert.equal(result.campaigns[0].summary.conversions.observed_days, 2);
  assert.equal(result.campaigns[0].summary.ctr.period_value, 0.12);
  assert.equal(result.campaigns[0].summary.average_cost_usd.period_value, 0.75);
  assert.equal(result.campaigns[0].summary.investment_brl.total, 20.5);
  assert.equal(result.campaigns[1].summary.conversions.total, null);
  assert.equal(result.campaigns[1].summary.conversions.observed_days, 0);
  assert.equal(result.daily_rows.length, 1);
  assert.equal(result.daily_rows_total, 3);
  assert.equal(result.daily_rows_truncated, true);
  assert.equal(result.data_scope.includes('não confirmam pagamento'), true);
});

test('campanha de nome duplicado exige sufixo de conta para evitar associação presumida', () => {
  const base = sampleBase();
  base.campanhas.push({ id: 'campaign-3', nome_mcc: '18/10 StopWatt 03 (GM-BB-US) 80% - US 90', conta_id: '9876543210', mcc_id: 'mcc-2', status: 'ativa' });
  base.mccs.push({ id: 'mcc-2', nome: 'MCC Nutra' });
  const ambiguous = getCampaignDailyHistory(base, { campaigns: [{ name: '18/10 StopWatt 03 (GM-BB-US) 80% - US 90' }] });
  assert.equal(ambiguous.ambiguous.length, 1);
  const selected = getCampaignDailyHistory(base, { campaigns: [{ name: '18/10 StopWatt 03 (GM-BB-US) 80% - US 90', account_suffix: '3210' }] });
  assert.equal(selected.campaigns.length, 1);
  assert.equal(selected.campaigns[0].account_suffix, '3210');
});

test('resumo CTR usa razão dos totais e não soma médias diárias', () => {
  const base = sampleBase();
  base.diario.push({ campanha_id: 'campaign-1', data: '2026-10-20', fontes: ['manifesto'], celulas: { B: cell(300), C: cell(15), G: cell(0.05), I: cell(1), J: cell(5) } });
  const result = getCampaignDailyHistory(base, { campaigns: [{ name: '18/10 StopWatt 03 (GM-BB-US) 80% - US 90' }] });
  assert.equal(result.campaigns[0].summary.ctr.period_value, 0.0675);
  assert.equal(result.campaigns[0].summary.average_cost_usd.period_value, 0.888889);
});


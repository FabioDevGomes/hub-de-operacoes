import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const today = '2026-10-30';
const now = `${today}T15:00:00.000Z`;
class FixedDate extends Date {
  constructor(value) { super(value === undefined ? now : value); }
}
const context = vm.createContext({ window: {}, structuredClone, Date: FixedDate });
for (const path of [
  'src/google-ads/google-ads-config-domain.js',
  'src/database.js',
  'src/overview-domain.js',
  'src/overview/cards-domain.js',
]) vm.runInContext(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), context);
const { CampaignDatabase: db, OverviewDomain, OverviewCardsDomain } = context.window;
const managerCustomerId = '1111111111';
const customerId = '2222222222';
const campaignId = '12345';
const campaignName = '30/10 - Campanha Search criada no Hub';

function createdCampaign(overrides = {}) {
  return {
    managerCustomerId,
    customerId,
    campaignId,
    campaignName,
    accountName: 'Conta sintética',
    status: 'PAUSED',
    source: 'created',
    verified: true,
    ...overrides,
  };
}

function baseWithUnmappedCapture() {
  const base = db.create();
  base.atualizado_em = now;
  base.manifesto_atual = {
    separacao_temporal: {
      D_zero: { datas_detectadas: [today] },
      D_menos_1: { datas_detectadas: ['2026-10-29'] },
    },
    campanhas: [],
  };
  base.google_ads_api_daily_captures = [{
    captureSchemaVersion: 4,
    managerCustomerId,
    customerId,
    accountName: 'Conta sintética',
    date: today,
    timeZone: 'America/Sao_Paulo',
    businessTimeZone: 'America/Sao_Paulo',
    businessDate: today,
    currencyCode: 'BRL',
    capturedAtUtc: now,
    coverageStatus: 'rows_returned',
    queryComplete: true,
    rows: [{
      campaignInternalId: null,
      campaignId,
      campaignName,
      campaignStatus: 'PAUSED',
      mappingStatus: 'unmapped',
      impressions: 23,
      clicks: 5,
      conversions: 0,
      costMicros: 0,
    }],
  }];
  base.google_ads_api_capture_snapshots = [{
    id: 'snapshot-local',
    completedAtUtc: now,
    periodType: 'D0',
    accounts: [{
      managerCustomerId,
      customerId,
      accountName: 'Conta sintética',
      date: today,
      timeZone: 'America/Sao_Paulo',
      queryComplete: true,
      configurationComplete: true,
      configurationGeneratedAtUtc: now,
      campaigns: [{
        campaignId,
        campaignName,
        campaignStatus: 'PAUSED',
        campaignInternalId: null,
        mappingStatus: 'unmapped',
        impressions: 23,
        clicks: 5,
      }],
    }],
  }];
  base.google_ads_api_change_history = [{
    id: 'history-local',
    completedAtUtc: now,
    changes: [{ managerCustomerId, customerId, campaignId, campaignName, campaignInternalId: null, fields: [] }],
  }];
  return base;
}

test('cadastra campanhas de snapshot D0 completo automaticamente e sem duplicar', () => {
  const base = baseWithUnmappedCapture();
  const before = JSON.stringify(base);
  const first = db.syncGoogleAdsSnapshotCampaigns(base, { now });

  assert.equal(first.changed, true);
  assert.equal(first.registeredCount, 1);
  assert.equal(first.linkedCount, 0);
  assert.equal(first.conflicts.length, 0);
  assert.equal(JSON.stringify(base), before, 'o helper não altera a base recebida');
  assert.equal(first.base.campanhas.length, 1);
  const campaign = first.base.campanhas[0];
  assert.equal(campaign.id, `cmp_gads_${managerCustomerId}_${customerId}_${campaignId}`);
  assert.equal(campaign.google_ads_campaign_id, campaignId);
  assert.equal(campaign.google_ads_campaign_origem, 'google_ads_api_snapshot');
  assert.equal(campaign.apiSnapshotOnly, true);
  assert.equal(campaign.nome_exibicao, campaignName);
  assert.equal(campaign.conta_id, '222-222-2222');
  assert.equal(campaign.mcc_id, '111-111-1111');
  assert.equal(campaign.status, 'pausada');
  assert.equal(first.base.google_ads_api_daily_captures[0].rows[0].campaignInternalId, campaign.id);
  assert.equal(first.base.google_ads_api_daily_captures[0].rows[0].mappingStatus, 'mapped');
  assert.equal(first.base.google_ads_api_capture_snapshots[0].accounts[0].campaigns[0].campaignInternalId, campaign.id);
  assert.equal(first.base.google_ads_api_change_history[0].changes[0].campaignInternalId, campaign.id);
  assert.equal(JSON.stringify(first.base.diario), JSON.stringify(base.diario), 'o Diário MCC continua intacto');
  assert.equal(JSON.stringify(first.base.manifesto_atual), JSON.stringify(base.manifesto_atual), 'o manifesto MCC continua intacto');

  const second = db.syncGoogleAdsSnapshotCampaigns(first.base, { now });
  assert.equal(second.changed, false);
  assert.equal(second.registeredCount, 0);
  assert.equal(second.base.campanhas.length, 1);
});

test('vincula campanha local única preservando campos manuais e ignora snapshots incompletos', () => {
  const base = baseWithUnmappedCapture();
  base.campanhas = [{
    id: 'campaign-local',
    nome_mcc: campaignName,
    nome_exibicao: 'Nome definido manualmente',
    conta_id: '222-222-2222',
    mcc_id: '111-111-1111',
    status: 'historico',
    roi_minimo: 87,
  }];
  const linked = db.syncGoogleAdsSnapshotCampaigns(base, { now });
  assert.equal(linked.registeredCount, 0);
  assert.equal(linked.linkedCount, 1);
  assert.equal(linked.base.campanhas.length, 1);
  assert.equal(linked.base.campanhas[0].id, 'campaign-local');
  assert.equal(linked.base.campanhas[0].google_ads_campaign_id, campaignId);
  assert.equal(linked.base.campanhas[0].nome_exibicao, 'Nome definido manualmente');
  assert.equal(linked.base.campanhas[0].status, 'historico');
  assert.equal(linked.base.campanhas[0].roi_minimo, 87);

  const incomplete = baseWithUnmappedCapture();
  incomplete.google_ads_api_capture_snapshots[0].accounts[0].configurationComplete = false;
  const ignored = db.syncGoogleAdsSnapshotCampaigns(incomplete, { now });
  assert.equal(ignored.changed, false);
  assert.equal(ignored.base.campanhas.length, 0);
});

test('vincula campanha confirmada pelo Hub às capturas salvas e projeta impressões/cliques em D0', () => {
  const base = baseWithUnmappedCapture();
  const before = JSON.stringify(base);
  const linked = db.registerGoogleAdsHubCreatedCampaigns(base, [createdCampaign()], {
    source: 'verified_create_response', now,
  });

  assert.equal(linked.registeredCount, 1);
  assert.equal(linked.linkedCaptureCount, 1);
  assert.equal(linked.linkedSnapshotCount, 1);
  assert.equal(linked.linkedHistoryCount, 1);
  assert.equal(linked.conflicts.length, 0);
  assert.equal(JSON.stringify(base), before, 'o helper trabalha numa cópia e preserva a base recebida');
  assert.equal(linked.base.google_ads_api_daily_captures[0].rows[0].mappingStatus, 'mapped');
  assert.equal(linked.base.google_ads_api_daily_captures[0].rows[0].impressions, 23);
  assert.equal(linked.base.google_ads_api_daily_captures[0].rows[0].clicks, 5);

  const campaign = linked.base.campanhas[0];
  assert.equal(campaign.google_ads_campaign_id, campaignId);
  assert.equal(campaign.conta_id, '222-222-2222');
  assert.equal(campaign.mcc_id, '111-111-1111');
  const projected = db.googleAdsApiOperationalProjection(linked.base);
  const source = projected.manifesto_atual.campanhas.find(row => row.nome_campanha_exato === campaignName);
  const dailyByCampaign = new Map([[campaign.id, projected.diario.filter(row => row.campanha_id === campaign.id)]]);
  const table = OverviewDomain.campaignD0Totals(source, {
    dates: { d0: today }, stored: campaign, dailyByCampaign, useOperationalDate: true,
  });
  const cards = OverviewCardsDomain.create(projected, {
    computedAt: now,
    operationalSourceMode: 'api',
    periodDates: { d0: today, d1: '2026-10-29' },
  });
  assert.equal(table.impressions, 23);
  assert.equal(table.clicks, 5);
  assert.equal(cards.summary.d0.impressions.value, 23);
  assert.equal(cards.summary.d0.clicks.value, 5);

  const pausedBase = db.create();
  pausedBase.campanhas.push({id:'paused-api-campaign',nome_mcc:campaignName,nome_exibicao:campaignName,conta_id:customerId,mcc_id:managerCustomerId,google_ads_campaign_id:campaignId,status:'pausada',pausa_confirmada_em:today,status_origem:'google_ads_auto_pause'});
  pausedBase.google_ads_api_daily_captures.push({
    captureSchemaVersion:4, managerCustomerId, customerId, date:'2026-10-27',
    currencyCode:'USD', timeZone:'America/Sao_Paulo', exchangeRateUsdBrl:5,
    capturedAtUtc:'2026-10-27T15:00:00.000Z', coverageStatus:'rows_returned', queryComplete:true,
    rows:[{campaignInternalId:campaign.id,campaignId,campaignName,mappingStatus:'mapped',impressions:9,clicks:2,conversions:0,costMicros:1_000_000}],
  });
  const pausedProjection = db.googleAdsApiOperationalProjection(pausedBase);
  assert.equal(pausedProjection.diario.some(item => item.campanha_id === campaign.id && item.data === '2026-10-27'), false,
    'captura da API não acrescenta linhas depois da pausa confirmada');
});

test('o ID verificado da API mapeia capturas futuras sem depender apenas do nome', () => {
  const base = db.create();
  base.manifesto_atual = { campanhas: [], separacao_temporal: {} };
  const linked = db.registerGoogleAdsHubCreatedCampaigns(base, [createdCampaign()], {
    source: 'verified_create_response', now,
  });
  const report = {
    managerCustomerId,
    customerId,
    accountName: 'Conta sintética',
    dateFrom: today,
    dateTo: today,
    currencyCode: 'BRL',
    timeZone: 'America/Sao_Paulo',
    generatedAtUtc: now,
    rows: [{
      date: today,
      campaignId,
      campaignName,
      campaignStatus: 'PAUSED',
      channelType: 'SEARCH',
      impressions: 31,
      clicks: 7,
      costMicros: 0,
      conversions: 0,
      conversionsValue: 0,
    }],
  };
  const saved = db.saveGoogleAdsDailyCaptures(linked.base, [report], {
    todayByAccount: { [customerId]: today },
    dateFromByAccount: { [customerId]: today },
    now,
  });
  const row = saved.base.google_ads_api_daily_captures.find(item => item.date === today).rows[0];
  assert.equal(row.campaignInternalId, linked.base.campanhas[0].id);
  assert.equal(row.mappingStatus, 'mapped');
  assert.equal(row.impressions, 31);
  assert.equal(row.clicks, 7);
});

test('recupera 12 campanhas dos lotes locais de forma idempotente sem confiar em itens não criados', () => {
  const base = db.create();
  const batch = Array.from({ length: 12 }, (_, index) => createdCampaign({
    customerId: String(2220000000 + index),
    campaignId: String(50000 + index),
    campaignName: `30/10 - Campanha ${index + 1}`,
    status: index === 0 ? 'ENABLED' : 'PAUSED',
    verified: undefined,
  }));
  const first = db.registerGoogleAdsHubCreatedCampaigns(base, batch, { source: 'saved_hub_batch', now });
  assert.equal(first.registeredCount, 12);
  assert.equal(first.base.campanhas.length, 12);
  assert.equal(first.base.campanhas[0].status, 'ativa', 'lotes locais podem conter campanha que já foi ativada');
  const second = db.registerGoogleAdsHubCreatedCampaigns(first.base, batch, { source: 'saved_hub_batch', now });
  assert.equal(second.registeredCount, 0);
  assert.equal(second.alreadyRegisteredCount, 12);
  assert.equal(second.changed, false);
  const recoveryStatus = db.googleAdsHubCampaignRecoveryStatus(first.base, batch);
  assert.equal(recoveryStatus.totalCount, 12);
  assert.equal(recoveryStatus.pendingCampaigns.length, 0, 'campanhas com ID, nome, conta e MCC idênticos não devem ser oferecidas novamente');
  assert.equal(recoveryStatus.alreadyRegisteredCount, 12);

  const rejected = db.registerGoogleAdsHubCreatedCampaigns(base, [
    createdCampaign({ source: 'existing' }),
    createdCampaign({ status: 'REMOVED' }),
  ], { source: 'saved_hub_batch', now });
  assert.equal(rejected.changed, false);
  assert.equal(rejected.base.campanhas.length, 0);
  assert.equal(rejected.conflicts.length, 2);
});

test('conta como pendente uma campanha cujo ID existe localmente com identidade diferente', () => {
  const base = db.create();
  const batch = [createdCampaign(), createdCampaign({ campaignId: '54321', campaignName: 'Outra campanha' })];
  const first = db.registerGoogleAdsHubCreatedCampaigns(base, batch.slice(0, 1), { source: 'saved_hub_batch', now });
  const changedIdentity = db.create();
  changedIdentity.campanhas = first.base.campanhas.map(campaign => ({ ...campaign, nome_mcc: 'Nome diferente' }));
  const status = db.googleAdsHubCampaignRecoveryStatus(changedIdentity, batch);
  assert.equal(status.totalCount, 2);
  assert.deepEqual(Array.from(status.pendingCampaigns, campaign => campaign.campaignId), ['12345', '54321']);
  assert.equal(status.alreadyRegisteredCount, 0);
});

test('não escolhe entre registros locais ambíguos com mesmo nome, conta e MCC', () => {
  const base = db.create();
  base.campanhas = [
    { id: 'local-a', nome_mcc: campaignName, nome_exibicao: campaignName, conta_id: '222-222-2222', mcc_id: '111-111-1111', status: 'historico' },
    { id: 'local-b', nome_mcc: campaignName, nome_exibicao: campaignName, conta_id: '222-222-2222', mcc_id: '111-111-1111', status: 'historico' },
  ];
  const before = JSON.stringify(base);
  const result = db.registerGoogleAdsHubCreatedCampaigns(base, [createdCampaign({ verified: undefined })], {
    source: 'saved_hub_batch', now,
  });
  assert.equal(result.changed, false);
  assert.match(result.conflicts[0], /mais de um registro local/);
  assert.equal(JSON.stringify(result.base), before);
});

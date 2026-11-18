import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const today = '2026-10-30';
const now = today + 'T15:00:00.000Z';
class FixedDate extends Date {
  constructor(value) { super(value === undefined ? now : value); }
}
const context = vm.createContext({ window:{}, structuredClone, Date:FixedDate });
for (const path of [
  'src/google-ads/google-ads-config-domain.js',
  'src/database.js',
  'src/overview-domain.js',
  'src/overview/cards-domain.js',
]) {
  vm.runInContext(await readFile(new URL('../' + path, import.meta.url), 'utf8'), context);
}
const { CampaignDatabase, OverviewDomain, OverviewCardsDomain } = context.window;
const accountId = '222-222-2222';
const managerId = '111-111-1111';
const campaignName = 'Campanha D0 ausente do manifesto';
const timestamp = today + 'T15:00:00.000Z';

function storedCampaign(id, name=campaignName, account=accountId) {
  return { id, nome_mcc:name, nome_exibicao:name, conta_id:account, mcc_id:managerId, status:'ativa' };
}

function fixture({ clicks=2, impressions=4, extraCampaigns=[], extraRows=[] }={}) {
  const base = CampaignDatabase.create();
  const campaign = storedCampaign('cmp_api_today');
  base.atualizado_em = timestamp;
  base.campanhas = [campaign, ...extraCampaigns];
  base.manifesto_atual = {
    identificacao_mcc:{ id:managerId },
    campanhas:[{
      nome_campanha_exato:'Outra campanha ainda presente',
      mcc_id:managerId,
      metricas_D_zero:{ presente:false, conta_id:{ valor:accountId } },
      metricas_D_menos_1:{ presente:false, conta_id:{ valor:accountId } },
    }],
  };
  base.google_ads_api_daily_captures = [{
    captureSchemaVersion:4,
    managerCustomerId:managerId,
    customerId:accountId,
    date:today,
    timeZone:'America/Sao_Paulo',
    businessTimeZone:'America/Sao_Paulo',
    businessDate:today,
    currencyCode:'BRL',
    capturedAtUtc:timestamp,
    coverageStatus:'rows_returned',
    queryComplete:true,
    rows:[{
      campaignInternalId:campaign.id,
      campaignId:'12345',
      campaignName,
      campaignStatus:'ENABLED',
      mappingStatus:'mapped',
      impressions,
      clicks,
      conversions:0,
      costMicros:0,
    }, ...extraRows],
  }];
  return { base, campaign };
}

function projectCampaign(base, campaign) {
  const projected = CampaignDatabase.googleAdsApiOperationalProjection(base);
  const source = projected.manifesto_atual.campanhas.find(row=>row.nome_campanha_exato===campaignName);
  const dailyByCampaign = new Map([[campaign.id, projected.diario.filter(row=>row.campanha_id===campaign.id)]]);
  const tableTotals = source && OverviewDomain.campaignD0Totals(source, {
    dates:{ d0:today },
    stored:campaign,
    dailyByCampaign,
    useOperationalDate:true,
  });
  const cards = OverviewCardsDomain.create(projected, {
    computedAt:timestamp,
    operationalSourceMode:'api',
    periodDates:{ d0:today, d1:'2026-10-29' },
  });
  return { projected, source, tableTotals, cards };
}

test('inclui na projeção D0 a campanha mapeada ausente do manifesto; tabela e cartões leem impressões e cliques', () => {
  const { base, campaign } = fixture();
  const originalManifest = JSON.stringify(base.manifesto_atual);
  const { projected, source, tableTotals, cards } = projectCampaign(base, campaign);

  assert.ok(source, 'campanha mapeada pela API passa a integrar a lista operacional em memória');
  assert.equal(tableTotals.impressions, 4);
  assert.equal(tableTotals.clicks, 2);
  assert.equal(cards.summary.d0.impressions.value, 4);
  assert.equal(cards.summary.d0.clicks.value, 2);
  assert.equal(cards.summary.d0.impressions.observedCount, 1);
  assert.equal(cards.summary.d0.clicks.observedCount, 1);
  assert.equal(JSON.stringify(base.manifesto_atual), originalManifest, 'a projeção não altera o manifesto original');
  assert.equal(projected.manifesto_atual.campanhas.length, 2, 'o item só é acrescentado à projeção em memória');
});

test('mantém zero de cliques como zero confirmado nos dados da tabela e do cartão D0', () => {
  const { base, campaign } = fixture({ clicks:0, impressions:4 });
  const { projected, source, tableTotals, cards } = projectCampaign(base, campaign);
  const daily = projected.diario.find(row=>row.campanha_id===campaign.id&&row.data===today);

  assert.equal(tableTotals.impressions, 4);
  assert.equal(tableTotals.clicks, 0);
  assert.equal(daily.celulas.C.value, 0);
  assert.equal(source.metricas_D_zero.cliques_google.estado, 'zero_confirmado');
  assert.equal(cards.summary.d0.clicks.value, 0);
  assert.equal(cards.summary.d0.clicks.observedCount, 1);
});

test('não inclui campanhas sem vínculo nem nome ambíguo na projeção operacional', () => {
  const unmappedName = 'Campanha API sem vínculo';
  const unmapped = storedCampaign('cmp_unmapped', unmappedName);
  const duplicate = storedCampaign('cmp_duplicate', campaignName, '333-333-3333');
  const { base, campaign } = fixture({
    extraCampaigns:[unmapped, duplicate],
    extraRows:[{
      campaignInternalId:unmapped.id,
      campaignId:'99999',
      campaignName:unmappedName,
      mappingStatus:'unmapped',
      impressions:20,
      clicks:10,
      conversions:0,
      costMicros:0,
    }],
  });
  const { projected, cards } = projectCampaign(base, campaign);
  const names = projected.manifesto_atual.campanhas.map(row=>row.nome_campanha_exato);

  assert.equal(names.includes(unmappedName), false);
  assert.equal(names.filter(name=>name===campaignName).length, 0, 'nome ligado a mais de um registro local permanece fora da tabela baseada em nome');
  assert.equal(cards.summary.d0.impressions.value, null);
  assert.equal(cards.summary.d0.clicks.value, null);
});

test('inclui campanha nova identificada no snapshot D0 completo na tabela operacional sem gravar no banco original', () => {
  const newName = '28/10 - Campanha nova identificada no snapshot 70% - US$ 177';
  const campaignId = '987654321';
  const base = CampaignDatabase.create();
  base.atualizado_em = timestamp;
  base.manifesto_atual = {
    identificacao_mcc:{ id:managerId },
    campanhas:[{
      nome_campanha_exato:'Outra campanha ainda presente',
      mcc_id:managerId,
      metricas_D_zero:{ presente:false, conta_id:{ valor:accountId } },
      metricas_D_menos_1:{ presente:false, conta_id:{ valor:accountId } },
    }],
  };
  base.google_ads_api_daily_captures = [{
    captureSchemaVersion:4,
    managerCustomerId:managerId,
    customerId:accountId,
    date:today,
    timeZone:'America/Sao_Paulo',
    businessTimeZone:'America/Sao_Paulo',
    businessDate:today,
    currencyCode:'USD',
    exchangeRateUsdBrl:5,
    capturedAtUtc:timestamp,
    coverageStatus:'rows_returned',
    queryComplete:true,
    rows:[{
      campaignId,
      campaignName:newName,
      campaignStatus:'ENABLED',
      mappingStatus:'unmapped',
      impressions:21,
      clicks:1,
      conversions:0,
      costMicros:2_000_000,
      conversionsValue:0,
    }],
  }];
  base.google_ads_api_capture_snapshots = [{
    id:'snapshot-new-campaign',
    completedAtUtc:timestamp,
    periodType:'D0',
    accounts:[{
      managerCustomerId:managerId,
      customerId:accountId,
      date:today,
      timeZone:'America/Sao_Paulo',
      queryComplete:true,
      configurationComplete:true,
      campaigns:[{
        campaignId,
        campaignName:newName,
        campaignStatus:'ENABLED',
        mappingStatus:'unmapped',
        impressions:21,
        clicks:1,
        conversions:0,
        costMicros:2_000_000,
        metricsAvailable:true,
      }],
    }],
  }];
  const originalCampaigns = JSON.stringify(base.campanhas);
  const originalManifest = JSON.stringify(base.manifesto_atual);

  const projected = CampaignDatabase.googleAdsApiOperationalProjection(base);
  const campaign = projected.campanhas.find(row=>row.google_ads_campaign_id===campaignId);
  const source = projected.manifesto_atual.campanhas.find(row=>row.nome_campanha_exato===newName);
  const daily = projected.diario.find(row=>row.campanha_id===campaign?.id&&row.data===today);

  assert.ok(campaign, 'a identidade capturada passa a fazer parte da projeção de campanhas');
  assert.equal(campaign.apiSnapshotOnly, true);
  assert.equal(campaign.conta_id, accountId);
  assert.equal(campaign.mcc_id, managerId);
  assert.ok(source, 'a campanha usa a lista operacional existente, sem painel de busca paralelo');
  assert.equal(source.apiSnapshotOnly, true);
  assert.equal(source.metricas_D_zero.impressoes.valor, 21);
  assert.equal(source.metricas_D_zero.cliques_google.valor, 1);
  assert.equal(daily.celulas.B.value, 21);
  assert.equal(daily.celulas.C.value, 1);
  assert.equal(OverviewDomain.searchRows([{ c:source, identity:{ name:newName } }], 'campanha nova identificada').length, 1, 'a busca normal da Visão Geral encontra a campanha');
  assert.equal(JSON.stringify(base.campanhas), originalCampaigns, 'a identidade transitória não é gravada no banco original');
  assert.equal(JSON.stringify(base.manifesto_atual), originalManifest, 'a campanha só é acrescentada ao manifesto projetado em memória');

  const eligibleClickGroups = OverviewDomain.activeClickProductGroups([{
    c:{ _status:'ativa', apiSnapshotOnly:true },
    productKey:'produto-sintetico',
    totals:{ clicks:1 },
    consolidatedTotals:{ clicks:1 },
  }]);
  assert.equal(eligibleClickGroups.size, 0, 'campanhas sem cadastro local não entram nas regras automáticas por produto');
});

test('não promove snapshot D0 incompleto nem campanhas com estado removido', () => {
  const newName = 'Campanha não elegível do snapshot';
  const base = CampaignDatabase.create();
  base.atualizado_em = timestamp;
  base.google_ads_api_daily_captures = [{
    captureSchemaVersion:4,
    managerCustomerId:managerId,
    customerId:accountId,
    date:today,
    timeZone:'America/Sao_Paulo',
    capturedAtUtc:timestamp,
    coverageStatus:'rows_returned',
    queryComplete:true,
    rows:[{ campaignId:'987654322', campaignName:newName, campaignStatus:'REMOVED', mappingStatus:'unmapped', impressions:7, clicks:0, conversions:0, costMicros:0 }],
  }];
  base.google_ads_api_capture_snapshots = [{
    id:'snapshot-incomplete',
    completedAtUtc:timestamp,
    periodType:'D0',
    accounts:[{
      managerCustomerId:managerId,
      customerId:accountId,
      date:today,
      timeZone:'America/Sao_Paulo',
      queryComplete:false,
      configurationComplete:true,
      campaigns:[{ campaignId:'987654322', campaignName:newName, campaignStatus:'REMOVED', mappingStatus:'unmapped', impressions:7, clicks:0, metricsAvailable:true }],
    }],
  }];

  const projected = CampaignDatabase.googleAdsApiOperationalProjection(base);

  assert.equal(projected.campanhas.some(row=>row.nome_mcc===newName), false);
  assert.equal(Boolean(projected.manifesto_atual?.campanhas?.some(row=>row.nome_campanha_exato===newName)), false);
});

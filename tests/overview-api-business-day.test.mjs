import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const now='2026-11-01T05:00:00Z', yesterday='2026-10-31', today='2026-11-01';
class FixedDate extends Date { constructor(value) { super(value===undefined?now:value); } }
const context=vm.createContext({window:{},structuredClone,Date:FixedDate});
for(const path of ['src/google-ads/google-ads-config-domain.js','src/database.js','src/overview-domain.js','src/overview/cards-domain.js']) vm.runInContext(await readFile(new URL('../'+path,import.meta.url),'utf8'),context);
const {CampaignDatabase:db,OverviewDomain:domain,OverviewCardsDomain:cards}=context.window;
function fixture(closed=false){
  const base=db.create(),campaign={id:'cmp',nome_mcc:'Campanha sintética',nome_exibicao:'Campanha sintética',conta_id:'222-222-2222',mcc_id:'111-111-1111',status:'ativa'};
  base.atualizado_em=now;base.campanhas=[campaign];
  base.manifesto_atual={identificacao_mcc:{id:'111-111-1111'},campanhas:[{nome_campanha_exato:campaign.nome_mcc,mcc_id:campaign.mcc_id,metricas_D_zero:{presente:false,conta_id:{valor:campaign.conta_id}},metricas_D_menos_1:{presente:false,conta_id:{valor:campaign.conta_id}}}]};
  base.google_ads_api_daily_captures=[{captureSchemaVersion:4,managerCustomerId:'1111111111',customerId:'2222222222',date:yesterday,timeZone:'America/Los_Angeles',currencyCode:'BRL',capturedAtUtc:now,coverageStatus:'rows_returned',queryComplete:true,...(closed?{businessTimeZone:'America/Sao_Paulo',businessDate:yesterday}:{}),rows:[{campaignInternalId:'cmp',campaignId:'101',campaignName:campaign.nome_mcc,mappingStatus:'mapped',impressions:7,clicks:1,conversions:0,costMicros:2000000}]}];
  return base;
}
for(const closed of [false,true]) test(`D−1 API ${closed?'apresenta fechamento São Paulo':'identifica captura parcial do dia local como provisória'}`,()=>{
  const base=fixture(closed),before=JSON.stringify(base),projected=db.googleAdsApiOperationalProjection(base),campaign=projected.campanhas[0],dailyByCampaign=new Map([[campaign.id,projected.diario.filter(row=>row.campanha_id===campaign.id)]]),dates={d0:today,d1:yesterday};
  const total=domain.campaignD1Totals({},null,{stored:campaign,dailyByCampaign,dates,useOperationalDate:true});
  const summary=cards.create(projected,{computedAt:now,operationalSourceMode:'api',periodDates:dates});
  assert.equal(total.impressions,7);
  assert.equal(total.provisional,!closed);
  assert.equal(summary.summary.d1.impressions.value,7);
  assert.equal(summary.summary.d1.provisional,!closed);
  assert.equal(JSON.stringify(base),before,'a projeção não altera a base original');
});

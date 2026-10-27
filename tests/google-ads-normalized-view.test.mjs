import assert from 'node:assert/strict';
import { mount } from '../src/google-ads/google-ads-view.mjs';

const priorFetch = globalThis.fetch, priorStorage = globalThis.localStorage;
const nodes = new Map();
function node() {
  const listeners = new Map();
  return { value:'', innerHTML:'', textContent:'', disabled:false, classList:{toggle(){}}, setAttribute(){}, querySelectorAll:()=>[],
    addEventListener:(event,callback)=>listeners.set(event,callback), fire:event=>listeners.get(event)?.() };
}
const root = { innerHTML:'', querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector,node()); return nodes.get(selector); } };
const managerId = '1111111111', accountId = '2222222222';
const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const today = `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}-${parts.find(p=>p.type==='day').value}`;
const proposedStart = new Date(`${today}T00:00:00Z`); proposedStart.setUTCDate(proposedStart.getUTCDate() - 6);
const captureStart = proposedStart.toISOString().slice(0,10) < '2026-10-26' ? '2026-10-26' : proposedStart.toISOString().slice(0,10);
const configuration = { ok:true,schema_version:1,configuration_complete:true,customer_id:accountId,manager_customer_id:managerId,currency_code:'USD',time_zone:'America/Sao_Paulo',generated_at_utc:new Date().toISOString(),campaigns:[{campaign_id:'101',campaign_name:'Produto <img src=x>',campaign_status:'ENABLED',primary_status:'LIMITED',primary_status_reasons:['HAS_ADS_LIMITED_BY_POLICY'],budget_period:'DAILY',budget_amount_micros:'30000000',budget_shared:true,bidding_strategy_type:'MAXIMIZE_CONVERSIONS',target_cpa_resolution:'not_set'}] };
const calls = [], dailyRequests = [];
let saves = 0, activations = 0, previews = 0;
try {
  globalThis.localStorage = {getItem:()=> 'f'.repeat(64)};
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); calls.push(request.operation);
    if (request.operation === 'daily_report') dailyRequests.push(request);
    let payload;
    if (request.operation === 'accounts') payload = {ok:true,schema_version:1,managers:[{customer_id:managerId,name:'MCC sintética'}],accounts:[{customer_id:accountId,manager_customer_id:managerId,name:'Conta sintética',currency_code:'USD',time_zone:'America/Sao_Paulo'}]};
    else if (request.operation === 'campaign_config') payload = configuration;
    else payload = {ok:true,schema_version:1,query_complete:true,customer_id:accountId,manager_customer_id:managerId,date_from:request.date_from,date_to:request.date_to,currency_code:'USD',time_zone:'America/Sao_Paulo',rows:[{date:today,campaign_id:'101',campaign_name:'Produto <img src=x>',impressions:10,clicks:1,cost_micros:2_000_000,conversions:1,conversions_value:100}]};
    return {ok:true,status:200,json:async()=>payload};
  };
  const controller = mount({root,getOperationalSourceMode:()=> 'manifest',getApiCaptureDateRange:date=>({dateFrom:captureStart,dateTo:date}),onOperationalSourceModeChange(){activations++},onSaveDailyCaptures(){saves++},async onPreviewDailyCaptures(reports){
    previews++;
    return {projection:{batch:{mappedRows:1}},base:{google_ads_api_daily_captures:reports.map(report=>({...report,date:today,configuration:{...report.configuration,campaigns:report.configuration.campaigns.map(row=>({...row,mappingStatus:'mapped'}))}}))},billingCandidates:[{account:accountId,product:'Sintético',conversion_count:1,value_usd:100,value_brl:null,active:true}]};
  }});
  await controller.loadAccounts();
  assert.equal(nodes.get('#googleAdsPreviewNormalized').disabled, false);
  await nodes.get('#googleAdsPreviewNormalized').fire('click');
  assert.deepEqual(calls.sort(), ['accounts','campaign_config','daily_report']);
  assert.equal(dailyRequests[0].date_from, captureStart, 'a prévia envia ao serviço a janela móvel recente');
  assert.equal(dailyRequests[0].date_to, today);
  assert.equal(previews, 1);
  assert.equal(saves, 0, 'prévia não pode acionar o callback de persistência');
  assert.equal(activations, 0, 'prévia não pode ativar a fonte API');
  const html = nodes.get('#googleAdsReportArea').innerHTML;
  assert.match(html, /Configuração atual/);
  assert.match(html, /Há anúncios limitados por política/);
  assert.match(html, /compartilhado/);
  assert.match(html, /Prévia dos agregados para Faturamento/);
  assert.match(html, /Produto &lt;img src=x&gt;/);
  assert.doesNotMatch(html, /Produto <img src=x>/);
  assert.match(nodes.get('#googleAdsMessage').textContent, /Nenhum dado foi gravado/);
  assert.equal(nodes.get('#googleAdsSourceModeLabel').textContent, 'Manifesto MCC');
} finally { globalThis.fetch = priorFetch; globalThis.localStorage = priorStorage; }
console.log('Google Ads normalized preview renders without saving or activating the API.');

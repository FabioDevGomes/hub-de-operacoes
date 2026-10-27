import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { normalizeGoogleAdsConfiguration, googleAdsQualification, googleAdsBudget } from '../src/google-ads/google-ads-config-domain.mjs';
import { readGoogleAdsSourceMode, writeGoogleAdsSourceMode } from '../src/google-ads/google-ads-source-preference.mjs';
import { normalizeSale } from '../src/billing/billing-domain.mjs';
import { upsertMccConversionSalesToTransaction } from '../src/billing/billing-storage.mjs';
import { previewDailyCaptures, saveDailyCaptures } from '../src/google-ads/google-ads-capture-storage.mjs';

let now = '2026-10-26T15:00:00Z';
const date = '2026-10-26';
class FixedDate extends Date { constructor(value) { super(value === undefined ? now : value); } }
const context = vm.createContext({ window: {}, structuredClone, Date: FixedDate });
for (const path of ['src/google-ads/google-ads-config-domain.js', 'src/database.js']) vm.runInContext(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), context);
const database = context.window.CampaignDatabase;
const row = { campaign_id:'101', campaign_name:'Campanha CB-BB sintética', campaign_status:'ENABLED', primary_status:'ELIGIBLE', primary_status_reasons:['HAS_ADS_DISAPPROVED'], bidding_strategy_type:'MAXIMIZE_CONVERSIONS', target_cpa_micros:'12000000', target_cpa_resolution:'observed', budget_resource:'customers/2222222222/campaignBudgets/1', budget_period:'DAILY', budget_amount_micros:'30000000', budget_shared:true };
const payload = { ok:true, schema_version:1, configuration_complete:true, customer_id:'2222222222', manager_customer_id:'1111111111', currency_code:'USD', time_zone:'America/Sao_Paulo', generated_at_utc:now, campaigns:[row] };
const configuration = normalizeGoogleAdsConfiguration(payload);
assert.equal(configuration.campaigns[0].targetCpaMicros, 12_000_000);
assert.equal(googleAdsQualification(configuration.campaigns[0]), 'Qualificada', 'um anúncio reprovado não transforma toda campanha qualificada em reprovada');
assert.match(googleAdsBudget(configuration.campaigns[0], 'USD'), /compartilhado/);
assert.match(googleAdsBudget({ ...configuration.campaigns[0], budgetPeriod:'CUSTOM_PERIOD', budgetTotalAmountMicros:100_000_000 }, 'USD'), /total/);
assert.throws(() => normalizeGoogleAdsConfiguration({ ...payload, configuration_complete:false }), /completa/);
assert.throws(() => normalizeGoogleAdsConfiguration({ ...payload, campaigns:[row, row] }), /duplicadas/);

const profile = () => { const values = new Map(); return { getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,value) }; };
const mine = profile(), other = profile();
assert.equal(readGoogleAdsSourceMode(mine), 'manifest');
writeGoogleAdsSourceMode('api', mine);
assert.equal(readGoogleAdsSourceMode(mine), 'api');
assert.equal(readGoogleAdsSourceMode(other), 'manifest', 'a ativação no perfil próprio não ativa o perfil do outro operador');

const base = database.create();
base.campanhas = [{ id:'cmp_existing', nome_mcc:row.campaign_name, nome_exibicao:'Sintética', conta_id:'222-222-2222', mcc_id:'111-111-1111', status:'pausada' }];
base.diario = [{ campanha_id:'cmp_existing', data:'2026-10-25', fontes:['manifesto'], celulas:{ B:{value:99}, C:{value:4}, O:{value:40} } }];
base.manifesto_atual = { separacao_temporal:{ D_zero:{datas_detectadas:['2026-10-25']} }, campanhas:[{ nome_campanha_exato:row.campaign_name, mcc_id:'111-111-1111', metricas_D_zero:{presente:true,data:{valor:'2026-10-25'},conta_id:{valor:'222-222-2222'},estado_campanha:{valor:'PAUSED'}} }] };
const report = { customerId:'2222222222', managerCustomerId:'1111111111', dateFrom:date, dateTo:date, currencyCode:'USD', timeZone:'America/Sao_Paulo', generatedAtUtc:now, queryComplete:true, configuration, rows:[{ date, campaignId:'101', campaignName:row.campaign_name, campaignStatus:'ENABLED', impressions:10, clicks:2, costMicros:5_000_000, conversions:2, conversionsValue:100 }] };
const options = { todayByAccount:{'2222222222':date}, exchangeRateQuote:{rate:5}, now };
const before = JSON.stringify(base);
const prepared = previewDailyCaptures(base, [report], options.todayByAccount, options.exchangeRateQuote, database);
assert.equal(JSON.stringify(base), before, 'a prévia não modifica a base original');
assert.equal(JSON.stringify(prepared.base.diario), JSON.stringify(base.diario), 'a captura não escreve o Diário MCC');
assert.equal(JSON.stringify(prepared.base.manifesto_atual), JSON.stringify(base.manifesto_atual));
assert.equal(prepared.base.google_ads_api_daily_captures[0].captureSchemaVersion, 4);
const projected = database.googleAdsApiOperationalProjection(prepared.base);
const current = projected.diario.find(item=>item.data===date);
assert.match(current.celulas.M.value, /compartilhado/);
assert.equal(current.celulas.N.value, 'CPA desejado');
assert.equal(current.celulas.Q.value, 'Qualificada');
assert.equal(current.celulas.O.value, 25);
assert.equal(projected.campanhas[0].status, 'ativa');
assert.equal(database.manifestOperationalStates(projected.manifesto_atual).get(row.campaign_name.toLowerCase()), 'ativa', 'estado atual explícito prevalece sem reescrever métricas antigas');
assert.equal(projected.manifesto_atual.campanhas[0].metricas_D_zero.data.valor, '2026-10-25');

const sale = prepared.billingCandidates[0];
assert.equal(sale.sale_id, 'mcc-conversion:cmp_existing:2026-10-26', 'API e MCC precisam reutilizar a mesma chave financeira');
assert.equal(sale.data_source, 'google_ads_api');
assert.equal(sale.value_usd, 100);
assert.equal(sale.value_brl, null, 'o câmbio operacional não grava uma segunda moeda financeira');
assert.equal(sale.confirmation_status, 'provisional');
assert.equal(sale.payment_status, 'pending');
const manualBase = structuredClone(prepared.base);
manualBase.vendas_provisorias = [{id:'manual-1',campanha_id:'cmp_existing',data:date,status:'provisoria',valor_brl:250}];
const residual = database.googleAdsApiBillingSales(manualBase)[0];
assert.equal(residual.conversion_count, 1);
assert.equal(residual.value_usd, null, 'valor agregado não pode ser repartido sobre venda manual para duplicar receita');

const zeroFallbackBase = structuredClone(base);
zeroFallbackBase.diario.push({campanha_id:'cmp_existing',data:date,fontes:['manifesto'],celulas:{J:{value:25},K:{value:0.8},L:{value:0.8},R:{value:0.8}}});
const noRows = database.saveGoogleAdsDailyCaptures(zeroFallbackBase, [{ ...report, rows:[], configuration:{...configuration,campaigns:[...configuration.campaigns,{...configuration.campaigns[0],campaignId:'404',campaignName:'Ainda sem vínculo'}]} }], options);
const zero = noRows.base.google_ads_api_daily_captures[0].rows;
assert.equal(zero.length, 1, 'inventário não cria campanhas nem inventa vínculo para campanhas novas');
assert.equal(zero[0].inferredZero, true);
assert.equal(zero[0].conversions, 0);
assert.equal(zero[0].averageCpcMicros, null);
assert.equal(zero[0].searchImpressionShare, null);
const zeroProjection = database.googleAdsApiOperationalProjection(noRows.base).diario.find(item=>item.data===date);
assert.equal(zeroProjection.celulas.G.value, null, 'CTR sem impressões fica sem razão calculável');
assert.equal(zeroProjection.celulas.J.value, null, 'CPC antigo da MCC não deve sobreviver a zero completo sem cliques');
assert.equal(zeroProjection.celulas.R.value, null, 'parcela indisponível não pode usar o valor MCC anterior nem virar zero');
assert.equal(database.googleAdsApiBillingSales(noRows.base)[0].active, false, 'zero completo desativa agregado anterior, não cria venda');
const incomplete = database.saveGoogleAdsDailyCaptures(base, [{ ...report, rows:[], queryComplete:false }], options);
assert.equal(incomplete.base.google_ads_api_daily_captures[0].rows.length, 0);
assert.equal(database.googleAdsApiBillingSales(incomplete.base).length, 0, 'falha de cobertura não altera o financeiro');
assert.throws(() => database.saveGoogleAdsDailyCaptures(base, [{ ...report, configuration:{...configuration,currencyCode:'BRL'} }], options), /mesma conta/);
assert.throws(() => database.saveGoogleAdsDailyCaptures(base, [{ ...report,dateFrom:'2026-10-25',dateTo:'2026-10-25' }], options), /janela/);

const storedSales = new Map(), audit = [];
const tx = { objectStore(name) { return name === 'billing_audit' ? {add:item=>audit.push(item)} : { get(id) { const request={}; queueMicrotask(()=>{request.result=storedSales.get(id);request.onsuccess();});return request; }, put:item=>storedSales.set(item.sale_id,item), add:item=>storedSales.set(item.sale_id,item) }; }, abort() { throw new Error('unexpected abort'); } };
const flush = () => new Promise(resolve=>setImmediate(resolve));
storedSales.set(sale.sale_id, normalizeSale({...sale,data_source:null,commission_type:'Valor de conversão MCC',conversion_count:1,value_usd:50,payment_status:'paid',observed_payment_status:'paid'},{now}));
upsertMccConversionSalesToTransaction(tx, [sale], {now,sourceMode:'api'}); await flush();
assert.equal(storedSales.size, 1);
assert.equal(storedSales.get(sale.sale_id).conversion_count, 2);
assert.equal(storedSales.get(sale.sale_id).payment_status, 'paid', 'pagamento explícito sobrevive à troca de fonte');
const auditsAfterFirst = audit.length;
upsertMccConversionSalesToTransaction(tx, [sale], {now,sourceMode:'api'}); await flush();
assert.equal(audit.length, auditsAfterFirst, 'repetir a mesma captura não duplica venda nem auditoria');
upsertMccConversionSalesToTransaction(tx, [{...sale,data_source:null,value_usd:1}], {now,sourceMode:'api'}); await flush();
assert.equal(storedSales.get(sale.sale_id).value_usd, 100, 'captura MCC parcial não substitui a fonte API ativa');
upsertMccConversionSalesToTransaction(tx, [{...sale,value_usd:20}], {now,sourceMode:'manifest'}); await flush();
assert.equal(storedSales.get(sale.sale_id).value_usd, 100, 'perfil MCC não aplica candidatos API');
storedSales.set(sale.sale_id, {...storedSales.get(sale.sale_id),manual_value_override:true,value_usd:155});
upsertMccConversionSalesToTransaction(tx, [sale], {now,sourceMode:'api'}); await flush();
assert.equal(storedSales.get(sale.sale_id).value_usd, 155, 'correção manual prevalece');
upsertMccConversionSalesToTransaction(tx, [{...sale,data_source:null,source_period:'d1',confirmation_status:'confirmed',confirmation_source:'MCC D−1'}], {now,sourceMode:'api'}); await flush();
assert.equal(storedSales.get(sale.sale_id).source_period, 'd1', 'fechamento MCC continua disponível enquanto D−1 API é uma etapa pendente');

let aborted = false, closed = false;
await assert.rejects(saveDailyCaptures([report], options.todayByAccount, options.exchangeRateQuote, {database,sourceMode:'manifest',openDb:async()=>({close(){closed=true},transaction(){const transaction={objectStore(){return{get(){const request={};queueMicrotask(()=>{request.result=null;request.onsuccess()});return request;}}},abort(){aborted=true;queueMicrotask(()=>transaction.onabort())}};return transaction;}})}), /não foi reconhecida/);
assert.equal(aborted, true);
assert.equal(closed, true);

function isolatedDatabase({failFinancial=false}={}) {
  const rows=new Map([['atual',structuredClone(base)]]), sales=new Map(), stores=[];
  return { rows,sales,stores,open:async()=>({close(){},transaction(names){
    stores.push(names); const stagedBase=new Map(),stagedSales=new Map();let cancelled=false;
    const transaction={objectStore(name){
      assert.ok(names.includes(name), `store ${name} precisa pertencer à mesma transação`);
      if(name==='billing_audit')return{add(){}};
      const source=name==='bases'?rows:sales,staged=name==='bases'?stagedBase:stagedSales;
      return{get(key){if(failFinancial&&name==='billing_sales')throw new Error('falha financeira sintética');const request={};queueMicrotask(()=>{request.result=source.get(key);request.onsuccess();});return request;},put(value,key){staged.set(key??value.sale_id,structuredClone(value));},add(value){staged.set(value.sale_id,structuredClone(value));}};
    },abort(){cancelled=true;queueMicrotask(()=>transaction.onabort());}};
    setImmediate(()=>{if(cancelled)return;for(const[key,value]of stagedBase)rows.set(key,value);for(const[key,value]of stagedSales)sales.set(key,value);transaction.oncomplete();});
    return transaction;
  }})};
}
const atomic=isolatedDatabase();
await saveDailyCaptures([report],options.todayByAccount,options.exchangeRateQuote,{database,sourceMode:'api',openDb:atomic.open});
assert.equal(atomic.rows.get('atual').google_ads_api_daily_captures.length,1);
assert.equal(atomic.sales.size,1);
assert.ok(atomic.stores[0].includes('bases')&&atomic.stores[0].includes('billing_sales'), 'captura e receita usam uma única transação');
const parallel=isolatedDatabase();
await saveDailyCaptures([report],options.todayByAccount,options.exchangeRateQuote,{database,sourceMode:'manifest',openDb:parallel.open});
assert.deepEqual(parallel.stores[0],['bases']);
assert.equal(parallel.sales.size,0,'modo MCC guarda captura sem alimentar financeiro pela API');
const rollback=isolatedDatabase({failFinancial:true});
await assert.rejects(saveDailyCaptures([report],options.todayByAccount,options.exchangeRateQuote,{database,sourceMode:'api',openDb:rollback.open}),/falha financeira/);
assert.equal(rollback.rows.get('atual').google_ads_api_daily_captures.length,0,'falha financeira cancela também a gravação da captura');

now = '2026-10-27T15:00:00Z';
const nextDate = '2026-10-27', nextConfiguration = {
  ...configuration,
  generatedAtUtc:now,
  campaigns:configuration.campaigns.map(item=>({...item,campaignStatus:'PAUSED',budgetAmountMicros:45_000_000})),
}, nextRangeReport = {
  ...report,
  dateFrom:date,
  dateTo:nextDate,
  generatedAtUtc:now,
  rows:[
    { ...report.rows[0], date, conversions:2, conversionsValue:140 },
    { ...report.rows[0], date:nextDate, conversions:0, conversionsValue:0 },
  ],
  configuration:nextConfiguration,
};
const closedApi = database.saveGoogleAdsDailyCaptures(prepared.base, [nextRangeReport], {
  todayByAccount:{ '2222222222':nextDate },
  dateFromByAccount:{ '2222222222':date },
  exchangeRateQuote:{ rate:7, quoteDate:'2026-10-27', source:'synthetic-new-quote' },
  now,
});
const closedYesterday = closedApi.base.google_ads_api_daily_captures.find(item=>item.date===date);
const capturedToday = closedApi.base.google_ads_api_daily_captures.find(item=>item.date===nextDate);
assert.equal(closedApi.savedCaptures,2,'a consulta de 7 dias salva um snapshot independente por conta e data');
assert.equal(JSON.stringify(closedApi.base.diario),JSON.stringify(prepared.base.diario),'o fechamento D−1 não grava nem reescreve o Diário MCC');
assert.equal(JSON.stringify(closedApi.base.manifesto_atual),JSON.stringify(prepared.base.manifesto_atual),'o fechamento D−1 preserva o manifesto importado');
assert.equal(closedYesterday.rows[0].conversions,2,'o D−1 reconsulta e atualiza métricas revisadas pelo Google');
assert.equal(closedYesterday.configuration.campaigns[0].budgetAmountMicros,30_000_000,'a fotografia de configuração capturada no próprio D0 é preservada ao fechar a data');
assert.equal(closedYesterday.exchangeRateUsdBrl,5,'a atualização de D−1 preserva a cotação congelada na primeira captura');
assert.ok(capturedToday.configuration,'status/orçamento continuam disponíveis no snapshot D0 atual');
assert.equal(capturedToday.configuration.campaigns[0].budgetAmountMicros,45_000_000,'a fotografia atual pode mudar sem reescrever a anterior');
assert.equal(capturedToday.configuration.campaigns[0].campaignInternalId,'cmp_existing');
const closedSales = database.googleAdsApiBillingSales(closedApi.base);
const yesterdaySale = closedSales.find(item=>item.sale_date===date);
assert.equal(yesterdaySale.source_period,'d1','a captura D−1 alimenta o período fechado financeiro');
assert.equal(yesterdaySale.confirmation_source,'Google Ads API D−1 (atualizável)');
assert.equal(yesterdaySale.value_usd,140);
assert.equal(yesterdaySale.payment_status,'pending','fechamento de conversão não confirma recebimento');
const closedProjection = database.googleAdsApiOperationalProjection(closedApi.base);
assert.equal(closedProjection.diario.find(item=>item.data===date).celulas.M.value,googleAdsBudget(configuration.campaigns[0],'USD'),'D−1 mantém o orçamento observado no seu D0, sem receber a configuração atual');
assert.equal(closedProjection.diario.find(item=>item.data===date).celulas.Q.value,'Qualificada','qualificação observada no D0 permanece associada à mesma data fechada');
assert.equal(closedProjection.campanhas[0].status,'pausada','status da campanha segue a observação atual, não o snapshot histórico');

const refreshedWithoutRows = database.saveGoogleAdsDailyCaptures(closedApi.base, [{ ...nextRangeReport, rows:[] }], {
  todayByAccount:{ '2222222222':nextDate },
  dateFromByAccount:{ '2222222222':date },
  exchangeRateQuote:{ rate:8 },
  now,
});
const zeroYesterday = refreshedWithoutRows.base.google_ads_api_daily_captures.find(item=>item.date===date).rows[0];
assert.equal(zeroYesterday.inferredZero,true,'consulta completa sem uma linha atualiza para zero só uma campanha já vinculada previamente');
assert.equal(zeroYesterday.conversions,0);
assert.equal(database.googleAdsApiBillingSales(refreshedWithoutRows.base).find(item=>item.sale_date===date).active,false,'um D−1 revisto para zero desativa o agregado API anterior');
assert.equal(refreshedWithoutRows.base.google_ads_api_daily_captures.find(item=>item.date===date).exchangeRateUsdBrl,5,'a repetição mantém a cotação histórica congelada');
assert.throws(() => database.saveGoogleAdsDailyCaptures(prepared.base, [{ ...nextRangeReport, dateFrom:'2026-10-19' }], {
  todayByAccount:{ '2222222222':nextDate }, dateFromByAccount:{ '2222222222':'2026-10-19' }, now,
}), /janela/,'a gravação recusa dados antes do marco e fora da janela recente');
console.log('Google Ads normalization, profile isolation and financial aggregate checks passed.');

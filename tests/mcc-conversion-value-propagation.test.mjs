import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const context=vm.createContext({window:{},structuredClone});
for(const file of ['database.js','overview-domain.js','overview/cards-domain.js','overview/sale-roi-domain.js','control-macro/domain.js']){
  const source=await readFile(new URL(`../src/${file}`,import.meta.url),'utf8');
  vm.runInContext(source,context,{filename:file});
}
const {CampaignDatabase:database,OverviewDomain:overview,OverviewCardsDomain:cards,SaleRoiDomain:saleRoi}=context.window;
const macro=context.ControlMacroDomain;
const field=value=>({valor:value,estado:value==null?'ausente':'confirmado'});
const date='2026-10-05';
const campaignName='Campanha sintética valor MCC';
const makeManifest=(value,{currency='BRL',rate=null}={})=>({
  identificacao_mcc:{id:'111-222-3333',nome:'MCC sintética'},
  separacao_temporal:{D_menos_1:{datas_detectadas:[date]},D_zero:{datas_detectadas:[]}},
  campanhas:[{nome_campanha_exato:campaignName,mcc_id:'111-222-3333',metricas_D_menos_1:{presente:true,data:field(date),moeda:field(currency),...(rate?{exchange_rate_usd_brl:rate}:{}),custo_total:field(50),impressoes:field(100),cliques_google:field(10),conversoes:field(1),valor_conversao:field(value)}}],
});
const rowFactory=source=>({date:source.metricas_D_menos_1.data.valor,period:'d1',cells:{A:{value:46200},B:{value:100},C:{value:10},F:{value:1},O:{value:50},P:{value:source.metricas_D_menos_1.valor_conversao.valor*(source.metricas_D_menos_1.moeda.valor==='USD'?source.metricas_D_menos_1.exchange_rate_usd_brl||1:1)}}});
const timestamp='2026-10-18T12:00:00.000Z';

const imported=database.importManifest(database.create(),makeManifest(100),rowFactory,{overwrite:true});
const campaign=imported.base.campanhas.find(item=>item.nome_mcc===campaignName);
const corrected=database.correctMccConversionValue(imported.base,{campaign_id:campaign.id,date,period:'d1',currency:'BRL',value:250});
const effective=corrected.base.manifesto_atual.campanhas[0].metricas_D_menos_1;
assert.equal(effective.valor_conversao.valor,250,'o manifesto compartilhado passa a expor a correção em sua moeda original');
assert.equal(corrected.base.diario.find(item=>item.campanha_id===campaign.id&&item.data===date).celulas.P.value,250,'o valor convertido do diário também é corrigido');
assert.equal(database.campaignTotalsMap(corrected.base).get(`mcc:${campaignName.toLocaleLowerCase('pt-BR')}`).commission,250,'totais históricos derivados do diário usam o valor corrigido');
assert.equal(database.mccBillingSalesFromManifest(corrected.base)[0].value_brl,250,'a linha agregada do Faturamento continua alinhada à base compartilhada');
const snapshot=overview.authoritativeMccSnapshots(corrected.base.manifesto_atual,{exchangeRate:5.1}).rows[0];
assert.equal(snapshot.commission,250,'snapshots de MCC usados pela Visão Geral refletem a correção');
const card=cards.create(corrected.base,{exchangeRate:5.1,computedAt:timestamp});
assert.equal(card.summary.d1.profit.value,200,'os cartões da Visão Geral recalculam o lucro com o valor corrigido');
assert.equal(database.dailyRows(corrected.base,campaign.nome_exibicao,campaign.id)[0].cells.P.value,250,'o Diário do produto lê o valor corrigido do registro compartilhado');
assert.equal(macro.aggregateMccDaily([{data:snapshot.date,cells:{O:{value:snapshot.investment},P:{value:snapshot.commission},C:{value:snapshot.clicks},F:{value:snapshot.conversions}}}])[0].revenue,250,'o Controle Macro recebe o mesmo valor por meio do adaptador de snapshots MCC');
const roi=saleRoi.capture(corrected.base,{campanha_id:campaign.id,data:date,hora:'12:00',registrada_em:timestamp,valor_brl:20},{database,overview,exchangeRate:5.1});
assert.equal(roi.revenue_brl,250,'o registro de ROI usa os mesmos valores corrigidos da Visão Geral e do Diário');

const reimported=database.importManifest(corrected.base,makeManifest(125),rowFactory,{overwrite:true});
assert.equal(reimported.base.manifesto_atual.campanhas[0].metricas_D_menos_1.valor_conversao.valor,250,'capturas futuras reaplicam a correção persistida para a mesma campanha/data/período');
assert.equal(reimported.base.diario.find(item=>item.campanha_id===campaign.id&&item.data===date).celulas.P.value,250,'a reimportação não recoloca o valor incorreto no diário');
assert.equal(reimported.mccBillingSales.find(item=>item.sale_date===date).value_brl,250,'o valor sincronizado ao Faturamento permanece igual ao valor corrigido');

const usdImported=database.importManifest(database.create(),makeManifest(40,{currency:'USD',rate:5}),rowFactory,{overwrite:true});
const usdCampaign=usdImported.base.campanhas.find(item=>item.nome_mcc===campaignName);
const usdCorrected=database.correctMccConversionValue(usdImported.base,{campaign_id:usdCampaign.id,date,period:'d1',currency:'USD',value:50,exchange_rate_usd_brl:5.2});
assert.equal(usdCorrected.base.diario.find(item=>item.campanha_id===usdCampaign.id&&item.data===date).celulas.P.value,250,'a correção em US$ é convertida à cotação registrada para todas as telas em reais');
assert.equal(database.mccBillingSalesFromManifest(usdCorrected.base)[0].value_usd,50,'o Faturamento preserva o valor corrigido em US$');
assert.equal(overview.authoritativeMccSnapshots(usdCorrected.base.manifesto_atual,{exchangeRate:99}).rows[0].commission,250,'a Visão Geral aplica a mesma cotação fixada para a correção');

console.log('mcc conversion value propagation ok');

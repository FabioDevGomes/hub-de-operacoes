import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/database.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},structuredClone});
vm.runInContext(source,context);
const db=context.window.CampaignDatabase;
assert.equal(db.accountDomain('7890 - 4ª CNPJ .exemplo.shop'),'.exemplo.shop','o domínio com ponto inicial deve ser extraído do nome completo da conta');
assert.equal(db.accountDomain('7890 - CNPJ .empresa.co.uk'),'.empresa.co.uk','extensões compostas também devem ser reconhecidas');
assert.equal(db.accountDomain('7441- PP[Des] .trustedfocus.shop\u202c - Google Ads'),'.trustedfocus.shop','marcadores Unicode invisíveis no texto da MCC não devem impedir a extração do domínio');
assert.equal(db.accountDomain('7890 - Fabio.dev.gomes@gmail.com keravox.shop'),null,'não inferir domínio de e-mail nem de host sem o ponto inicial usado pela conta');

const workbook={fileName:'produtos.xlsx',sheets:[
  {name:'MagicGLP 4',visible:true,rows:[{cells:{A:{value:45912},B:{value:21},C:{value:2}}}]},
  {name:'MagicGLP antigo',visible:false,rows:[{cells:{A:{value:45911},B:{value:10}}}]},
  {name:'totais',visible:true,rows:[{cells:{C:{value:'27/08 - MedicGLP 4 (GM) 91% - U$ 60'},L:{value:-1},O:{value:60}}}]},
]};
let result=db.importWorkbook(db.create(),workbook);
assert.equal(result.base.campanhas.length,2);
assert.equal(result.base.diario.length,2);
assert.equal(result.base.campanhas.filter(x=>x.status==='historico').length,1);
const investmentTotals=db.investmentTotalsMap(result.base);
assert.equal(investmentTotals.get('aba:magicglp 4'),0);

const manifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2025-09-13']}},campanhas:[{nome_campanha_exato:'27/08 - MedicGLP 4 (GM) 91% - U$ 60',metricas_D_menos_1:{data:{valor:'2025-09-13'},conta:{valor:'7890 - 4ª CNPJ .exemplo.shop'}}}]};
const rowFactory=()=>({cells:{A:{value:45913},B:{value:30},C:{value:3}}});
result=db.importManifest(result.base,manifest,rowFactory);
assert.equal(result.base.diario.length,3);
assert.equal(result.base.campanhas.find(x=>x.nome_mcc===manifest.campanhas[0].nome_campanha_exato).conta_sufixo,'7890');
assert.equal(result.base.campanhas.find(x=>x.nome_mcc===manifest.campanhas[0].nome_campanha_exato).conta_dominio,'.exemplo.shop','domínio da conta deve ser preservado no cadastro da campanha');
const invalidAccountManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2025-09-14']}},campanhas:[{nome_campanha_exato:'Conta sem prefixo',metricas_D_menos_1:{data:{valor:'2025-09-14'},conta:{valor:'4ª CNPJ exemplo.shop'}}}]};
const invalidAccountImport=db.importManifest(result.base,invalidAccountManifest,rowFactory);
assert.equal(invalidAccountImport.base.campanhas.find(x=>x.nome_mcc==='Conta sem prefixo').conta_sufixo,undefined);
const repeated=db.importManifest(result.base,manifest,rowFactory);
assert.equal(repeated.base.diario.length,3);
assert.equal(repeated.conflicts.length,0);
const noDomainManifest={...manifest,campanhas:[{...manifest.campanhas[0],metricas_D_menos_1:{...manifest.campanhas[0].metricas_D_menos_1,conta:{valor:'7890'}}}]};
const keepsDomain=db.importManifest(result.base,noDomainManifest,rowFactory);
assert.equal(keepsDomain.base.campanhas.find(x=>x.nome_mcc===manifest.campanhas[0].nome_campanha_exato).conta_dominio,'.exemplo.shop','ausência de domínio em coleta posterior não deve apagar o dado já conhecido');
const formattedAccountManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2025-09-14']}},campanhas:[{nome_campanha_exato:'Campanha da conta 7441',metricas_D_menos_1:{data:{valor:'2025-09-14'},conta:{valor:'7441- PP[Des] .trustedfocus.shop\u202c'}}}]};
const formattedAccountImport=db.importManifest(db.create(),formattedAccountManifest,rowFactory);
const formattedAccount=formattedAccountImport.base.campanhas.find(x=>x.nome_mcc===formattedAccountManifest.campanhas[0].nome_campanha_exato);
assert.equal(formattedAccount.conta_sufixo,'7441');
assert.equal(formattedAccount.conta_dominio,'.trustedfocus.shop','o manifesto deve persistir o domínio mesmo quando a MCC inclui formatação direcional invisível');
const changed=db.importManifest(repeated.base,manifest,()=>({cells:{A:{value:45913},B:{value:31},C:{value:3}}}));
assert.equal(changed.conflicts.length,1);
changed.base.diario.find(x=>x.campanha_id===changed.base.campanhas.find(c=>c.nome_exibicao==='MagicGLP 4').id).celulas.O={value:12.5};
assert.equal(db.investmentTotalsMap(changed.base).get('mcc:27/08 - medicglp 4 (gm) 91% - u$ 60'),12.5);
const campaignTotals=db.campaignTotalsMap(changed.base).get('mcc:27/08 - medicglp 4 (gm) 91% - u$ 60');
assert.deepEqual(JSON.parse(JSON.stringify(campaignTotals)),{investment:12.5,impressions:51,clicks:5,conversions:0,commission:0,observed:{investment:1,impressions:2,clicks:2,conversions:0,commission:0},byDate:{'2025-09-12':{investment:12.5,impressions:21,clicks:2,conversions:0,commission:0},'2025-09-13':{investment:0,impressions:30,clicks:3,conversions:0,commission:0}}});

const twoDayManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-13']},D_zero:{datas_detectadas:['2026-09-14']}},campanhas:[{nome_campanha_exato:'Campanha D0 completa',metricas_D_menos_1:{data:{valor:'2026-09-13'}},metricas_D_zero:{data:{valor:'2026-09-14'}}}]};
const twoDayRows=source=>[
  {date:source.metricas_D_menos_1.data.valor,period:'d1',cells:{A:{value:46278},B:{value:100},C:{value:10},F:{value:1},O:{value:25}}},
  {date:source.metricas_D_zero.data.valor,period:'d0',cells:{A:{value:46279},B:{value:40},C:{value:5},F:{value:2},O:{value:12}}},
];
const twoDayImport=db.importManifest(db.create(),twoDayManifest,twoDayRows);
assert.equal(twoDayImport.base.diario.length,2);
assert.equal(twoDayImport.base.diario.find(x=>x.data==='2026-09-14').celulas.B.value,40);
assert.equal(twoDayImport.base.diario.find(x=>x.data==='2026-09-14').celulas.F.value,2);
const finalD1={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-14']},D_zero:{datas_detectadas:['2026-09-15']}},campanhas:[{nome_campanha_exato:'Campanha D0 completa',metricas_D_menos_1:{data:{valor:'2026-09-14'}}}]};
const finalPreview=db.importManifest(twoDayImport.base,finalD1,()=>({date:'2026-09-14',period:'d1',cells:{A:{value:46279},B:{value:60},C:{value:7},F:{value:3},O:{value:18}}}));
assert.equal(finalPreview.conflicts.length,4);
const finalApplied=db.importManifest(twoDayImport.base,finalD1,()=>({date:'2026-09-14',period:'d1',cells:{A:{value:46279},B:{value:60},C:{value:7},F:{value:3},O:{value:18}}}),{overwrite:true});
assert.equal(finalApplied.base.diario.find(x=>x.data==='2026-09-14').celulas.B.value,60);
assert.equal(finalApplied.base.diario.find(x=>x.data==='2026-09-14').celulas.O.value,18);

const mccBillingCampaign='Campanha agregada MCC';
const mccBillingManifest={separacao_temporal:{D_zero:{datas_detectadas:['2026-09-24']}},campanhas:[{nome_campanha_exato:mccBillingCampaign,metricas_D_zero:{data:{valor:'2026-09-24'},conversoes:{valor:2},valor_conversao:{valor:100},moeda:{valor:'BRL'}}}]};
const mccBillingRow=source=>({date:source.metricas_D_zero.data.valor,period:'d0',cells:{A:{value:46288},F:{value:source.metricas_D_zero.conversoes.valor},P:{value:source.metricas_D_zero.valor_conversao.valor}}});
const provisionalMccBilling=db.importManifest(db.create(),mccBillingManifest,mccBillingRow);
assert.equal(provisionalMccBilling.mccBillingSales.length,1);
assert.equal(provisionalMccBilling.mccBillingSales[0].confirmation_status,'provisional');
assert.equal(provisionalMccBilling.mccBillingSales[0].conversion_count,2);
assert.equal(provisionalMccBilling.mccBillingSales[0].value_brl,100);
const confirmedMccBillingManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-24']},D_zero:{datas_detectadas:['2026-09-25']}},campanhas:[{nome_campanha_exato:mccBillingCampaign,metricas_D_menos_1:{data:{valor:'2026-09-24'},conversoes:{valor:2},valor_conversao:{valor:120},moeda:{valor:'BRL'}},metricas_D_zero:{data:{valor:'2026-09-25'},conversoes:{valor:1},valor_conversao:{valor:50},moeda:{valor:'BRL'}}}]};
const confirmedMccBilling=db.importManifest(provisionalMccBilling.base,confirmedMccBillingManifest,source=>source.metricas_D_menos_1?[
  {date:source.metricas_D_menos_1.data.valor,period:'d1',cells:{A:{value:46288},F:{value:source.metricas_D_menos_1.conversoes.valor},P:{value:source.metricas_D_menos_1.valor_conversao.valor}}},
  {date:source.metricas_D_zero.data.valor,period:'d0',cells:{A:{value:46289},F:{value:source.metricas_D_zero.conversoes.valor},P:{value:source.metricas_D_zero.valor_conversao.valor}}},
]:[] ,{overwrite:true});
const d1BillingRecord=confirmedMccBilling.mccBillingSales.find(item=>item.sale_date==='2026-09-24');
const d0BillingRecord=confirmedMccBilling.mccBillingSales.find(item=>item.sale_date==='2026-09-25');
assert.equal(d1BillingRecord.confirmation_status,'confirmed','D−1 promove o mesmo registro agregado de D0 a confirmado');
assert.equal(d1BillingRecord.value_brl,120);
assert.equal(d0BillingRecord.confirmation_status,'provisional','D0 atual permanece provisório ao lado do fechamento D−1');
assert.notEqual(d1BillingRecord.sale_id,d0BillingRecord.sale_id);
const d1ZeroManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-24']}},campanhas:[{nome_campanha_exato:mccBillingCampaign,metricas_D_menos_1:{data:{valor:'2026-09-24'},conversoes:{valor:0},valor_conversao:{valor:0},moeda:{valor:'BRL'}}}]};
const d1ZeroCorrection=db.importManifest(confirmedMccBilling.base,d1ZeroManifest,source=>({date:source.metricas_D_menos_1.data.valor,period:'d1',cells:{A:{value:46288},F:{value:0},P:{value:0}}}),{overwrite:true});
const correctedBillingRow=d1ZeroCorrection.mccBillingSales.find(item=>item.sale_date==='2026-09-24');
assert.equal(correctedBillingRow.confirmation_status,'not_confirmed','correção D−1 para zero invalida o agregado D0 provisório');
assert.equal(correctedBillingRow.active,false);

const diaryBillingBase=db.normalize(provisionalMccBilling.base);
diaryBillingBase.diario.push({campanha_id:diaryBillingBase.campanhas[0].id,data:'2026-09-23',periodos:['d0'],fontes:['manifesto'],celulas:{F:{value:1},P:{value:229.5}}});
const diaryBillingSales=db.mccBillingSalesFromDiary(diaryBillingBase);
const recoveredDiarySale=diaryBillingSales.find(item=>item.sale_date==='2026-09-23');
assert.equal(recoveredDiarySale.confirmation_status,'provisional','conversão MCC D0 já existente no Diário entra no Faturamento como provisória');
assert.equal(recoveredDiarySale.payment_status,'pending','venda encontrada no Diário não é tratada como recebida');
assert.equal(recoveredDiarySale.conversion_count,1);
assert.equal(recoveredDiarySale.value_brl,229.5,'comissão agregada do Diário é preservada em reais');
assert.equal(recoveredDiarySale.sale_id,`mcc-conversion:${diaryBillingBase.campanhas[0].id}:2026-09-23`,'a recuperação usa identificador determinístico e idempotente');
const incrementalDiaryBase=db.normalize(diaryBillingBase),incrementalCampaign=incrementalDiaryBase.campanhas[0];
incrementalDiaryBase.diario.push({campanha_id:incrementalCampaign.id,data:'2026-09-24',periodos:[],fontes:['excel'],celulas:{F:{value:1},P:{value:229.5}}});
incrementalDiaryBase.diario.push({campanha_id:incrementalCampaign.id,data:'2026-09-25',periodos:['d0'],fontes:['manifesto'],celulas:{F:{value:0},P:{value:0}}});
incrementalDiaryBase.manifesto_atual={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-24']},D_zero:{datas_detectadas:['2026-09-25']}},campanhas:[{nome_campanha_exato:` ${incrementalCampaign.nome_mcc} `,metricas_D_menos_1:{data:{valor:'24/09/2026'},conversoes:{valor:1},valor_conversao:{valor:229.5},moeda:{valor:'BRL'}},metricas_D_zero:{data:{valor:'2026-09-25'},conversoes:{valor:0},valor_conversao:{valor:0},moeda:{valor:'BRL'}}}]};
const manifestOnlyBillingBase=db.normalize(incrementalDiaryBase);manifestOnlyBillingBase.diario=manifestOnlyBillingBase.diario.filter(item=>item.data!=='2026-09-24');
const confirmedManifestSale=db.mccBillingSalesFromManifest(manifestOnlyBillingBase).find(item=>item.sale_date==='2026-09-24');
assert.equal(confirmedManifestSale.confirmation_status,'confirmed','uma conversão explícita no D−1 gera registro confirmado mesmo se a linha do Diário ainda não foi aplicada');
assert.equal(confirmedManifestSale.value_brl,229.5);
const diaryTaggedD1Base=db.normalize(incrementalDiaryBase);delete diaryTaggedD1Base.manifesto_atual.campanhas[0].metricas_D_menos_1;diaryTaggedD1Base.diario.find(item=>item.data==='2026-09-24').periodos=[];
assert.equal(db.mccBillingSalesFromDiary(diaryTaggedD1Base,{manifestOnly:true}).find(item=>item.sale_date==='2026-09-24').confirmation_status,'confirmed','a data exata do D−1 no manifesto permite recuperar a conversão positiva mesmo sem tags de período/campanha');
const incrementalDiarySales=db.mccBillingSalesFromDiary(incrementalDiaryBase,{manifestOnly:true});
assert.equal(incrementalDiarySales.map(item=>item.sale_date).join(','),'2026-09-24','sincronização incremental considera somente as datas da importação atual');
assert.equal(incrementalDiarySales[0].confirmation_status,'confirmed','linha do Diário explicitamente confirmada pelo D−1 gera agregado confirmado');
assert.equal(incrementalDiarySales[0].conversion_count,1);
assert.equal(incrementalDiarySales[0].value_brl,229.5);
const conflictingIncrementalDiaryBase=db.normalize(incrementalDiaryBase);conflictingIncrementalDiaryBase.diario.find(item=>item.data==='2026-09-24'&&item.fontes?.includes('excel')).celulas.P.value=200;
assert.equal(db.mccBillingSalesFromDiary(conflictingIncrementalDiaryBase,{manifestOnly:true}).length,0,'um valor de Diário que diverge do manifesto permanece bloqueado');
const d1ZeroDiaryBase=db.normalize(incrementalDiaryBase);
d1ZeroDiaryBase.diario.find(item=>item.data==='2026-09-25').periodos=['d1'];
d1ZeroDiaryBase.manifesto_atual={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-25']}},campanhas:[{nome_campanha_exato:incrementalCampaign.nome_mcc,metricas_D_menos_1:{data:{valor:'2026-09-25'},conversoes:{valor:0},valor_conversao:{valor:0},moeda:{valor:'BRL'}}}]};
const d1ZeroDiarySale=db.mccBillingSalesFromDiary(d1ZeroDiaryBase,{manifestOnly:true})[0];
assert.equal(d1ZeroDiarySale.confirmation_status,'not_confirmed','D−1 explícito com zero continua distinguível e desativa um agregado provisório existente');
assert.equal(d1ZeroDiarySale.active,false);
const nonMccDiaryBase=db.normalize(diaryBillingBase);
nonMccDiaryBase.diario.push({campanha_id:nonMccDiaryBase.campanhas[0].id,data:'2026-09-22',fontes:['excel'],celulas:{F:{value:1},P:{value:150}}});
assert.equal(db.mccBillingSalesFromDiary(nonMccDiaryBase).some(item=>item.sale_date==='2026-09-22'),false,'linhas sem período MCC não são convertidas em vendas automáticas');

const manualInDiary=db.addProvisionalSale(diaryBillingBase,{campanha_id:diaryBillingBase.campanhas[0].id,data:'2026-09-23',valor_brl:229.5,pais_codigo:'ZZ',chave_duplicidade:'manual-d0-diary-link'}).base;
const coveredAggregate=db.mccBillingSalesFromDiary(manualInDiary).find(item=>item.sale_date==='2026-09-23');
assert.equal(coveredAggregate.confirmation_status,'represented_by_manual','conversão coberta por lançamento manual não gera valor financeiro duplicado');
assert.equal(coveredAggregate.active,false);
assert.equal(coveredAggregate.value_brl,null,'valor agregado não é dividido artificialmente após vínculo manual');

const zeroBase=db.create();
zeroBase.campanhas.push({id:'cmp_zero',nome_mcc:'Campanha sem impressões',nome_exibicao:'Campanha sem impressões',status:'ativa'});
zeroBase.diario.push(
  {campanha_id:'cmp_zero',data:'2026-09-11',celulas:{B:{value:8}},fontes:['manifesto']},
  {campanha_id:'cmp_zero',data:'2026-09-12',celulas:{B:{value:0}},fontes:['manifesto']},
  {campanha_id:'cmp_zero',data:'2026-09-13',celulas:{B:{value:0}},fontes:['manifesto']},
  {campanha_id:'cmp_zero',data:'2026-09-14',celulas:{B:{value:0}},fontes:['manifesto']},
);
assert.equal(db.consecutiveZeroImpressionDays(zeroBase,'cmp_zero','2026-09-14'),3);
assert.equal(db.consecutiveZeroImpressionDays(zeroBase,'cmp_zero','2026-09-14',[{date:'2026-09-14',impressions:4}]),0);
assert.equal(db.consecutiveZeroImpressionDays(zeroBase,'cmp_zero','2026-09-15',[{date:'2026-09-15',impressions:0}]),4);
assert.equal(db.consecutiveZeroImpressionDays(zeroBase,'cmp_zero','2026-09-16',[{date:'2026-09-16',impressions:0}]),1);
assert.equal(db.consecutiveZeroImpressionDays(zeroBase,'cmp_zero','2026-09-17'),null);

const dailyManifest=(date,names)=>({separacao_temporal:{D_menos_1:{datas_detectadas:[date]},D_zero:{datas_detectadas:[date]}},campanhas:names.map(nome_campanha_exato=>({nome_campanha_exato,metricas_D_menos_1:{data:{valor:date}}}))});
const dailyRow=source=>({cells:{A:{value:Date.parse(source.metricas_D_menos_1.data.valor+'T00:00:00Z')/86400000+25569}}});
const oldMedic6='05/09 - MedicGLP 6 (GM-BB-FR, BE, CH) 70% - U$ 60';
const newMedic6='16/09 - MedicGLP 6 (GM-BB-FR, BE, CH) 85% - U$ 60';
let reusedNumber=db.importManifest(db.create(),dailyManifest('2026-09-15',[oldMedic6]),()=>({date:'2026-09-15',cells:{A:{value:46280},B:{value:0}}})).base;
const numberingIssues=db.campaignNumberReuseIssues(reusedNumber,dailyManifest('2026-09-16',[newMedic6]));
assert.equal(numberingIssues.length,1);
assert.equal(numberingIssues[0].group,'MagicGLP 6');
assert.equal(numberingIssues[0].incomingNames.length,1);
assert.equal(numberingIssues[0].incomingNames[0],newMedic6);
assert.ok(numberingIssues[0].knownNames.includes(oldMedic6));
assert.equal(db.campaignNumberReuseIssues(reusedNumber,dailyManifest('2026-09-16',[oldMedic6])).length,0,'reimportar o mesmo nome não deve exigir renumeração');
reusedNumber=db.importManifest(reusedNumber,dailyManifest('2026-09-16',[newMedic6]),()=>({date:'2026-09-16',cells:{A:{value:46281},B:{value:0}}})).base;
assert.equal(reusedNumber.campanhas.filter(x=>x.nome_exibicao==='MagicGLP 6').length,2);
assert.notEqual(reusedNumber.campanhas.find(x=>x.nome_mcc===oldMedic6).id,reusedNumber.campanhas.find(x=>x.nome_mcc===newMedic6).id);
assert.equal(reusedNumber.diario.find(x=>x.data==='2026-09-15').campanha_id,reusedNumber.campanhas.find(x=>x.nome_mcc===oldMedic6).id);
assert.equal(reusedNumber.diario.find(x=>x.data==='2026-09-16').campanha_id,reusedNumber.campanhas.find(x=>x.nome_mcc===newMedic6).id);

let collided=db.create();
collided.campanhas.push({id:'cmp_legacy_magic6',nome_mcc:newMedic6,nome_exibicao:'MagicGLP 6',status:'ativa'});
collided.diario.push({campanha_id:'cmp_legacy_magic6',data:'2026-09-15',celulas:{B:{value:0}},fontes:['manifesto']},{campanha_id:'cmp_legacy_magic6',data:'2026-09-16',celulas:{B:{value:0}},fontes:['manifesto']});
collided.snapshots_campanhas.push({data:'2026-09-15',capturada_em:'2026-09-15T12:00:00.000Z',campanhas:[oldMedic6]},{data:'2026-09-16',capturada_em:'2026-09-16T12:00:00.000Z',campanhas:[newMedic6]});
collided=db.importManifest(collided,dailyManifest('2026-09-20',[newMedic6]),()=>({date:'2026-09-20',cells:{A:{value:46285},B:{value:0}}})).base;
const repairedOld=collided.campanhas.find(x=>x.nome_mcc===oldMedic6),repairedNew=collided.campanhas.find(x=>x.nome_mcc===newMedic6);
assert.ok(repairedOld&&repairedNew);
assert.notEqual(repairedOld.id,repairedNew.id);
assert.equal(collided.diario.find(x=>x.data==='2026-09-15').campanha_id,repairedOld.id);
assert.equal(collided.diario.find(x=>x.data==='2026-09-16').campanha_id,repairedNew.id);

let lifecycle=db.importManifest(db.create(),dailyManifest('2026-09-13',['Campanha A','Campanha B']),dailyRow).base;
lifecycle=db.importManifest(lifecycle,dailyManifest('2026-09-14',['Campanha A','Campanha C']),dailyRow).base;
assert.equal(lifecycle.snapshots_campanhas.length,2);
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').status,'pausada');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').pausada_em,'2026-09-14');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha C').movimento_status,'nova');
lifecycle=db.importManifest(lifecycle,dailyManifest('2026-09-15',['Campanha A','Campanha B','Campanha C']),dailyRow).base;
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').status,'ativa');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').movimento_status,'reativada');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').reativada_em,'2026-09-15');

let salesBase=db.create();
salesBase.campanhas.push({id:'cmp_sale',nome_mcc:'Wego6 campanha',nome_exibicao:'Wego6',status:'ativa',conta_sufixo:'3248'});
let saleResult=db.addProvisionalSale(salesBase,{campanha_id:'cmp_sale',data:'2026-09-14',hora:'14:51',produto:'Wego6',plataforma:'Gurumedia',valor_brl:436.75,pais_codigo:'DE',origem:'pixel MCC',identificador_mascarado:'CjwKCA…BwE',chave_duplicidade:'hash-unico'});
assert.equal(saleResult.duplicate,false);
assert.equal(saleResult.base.vendas_provisorias.length,1);
assert.equal(saleResult.sale.billing_sale_id,`manual-sale:cmp_${saleResult.sale.id.slice(5)}`,'venda manual recebe vínculo determinístico para o Faturamento');
let saleAdjustments=db.salesAdjustmentMap(saleResult.base).get('cmp_sale');
assert.equal(saleAdjustments.pendingConversions,1);
assert.equal(saleAdjustments.commissionAdjustment,436.75);
const duplicate=db.addProvisionalSale(saleResult.base,{campanha_id:'cmp_sale',data:'2026-09-14',valor_brl:436.75,pais_codigo:'DE',chave_duplicidade:'hash-unico'});
assert.equal(duplicate.duplicate,true);
duplicate.base.diario.push({campanha_id:'cmp_sale',data:'2026-09-14',celulas:{F:{value:1}},fontes:['manifesto']});
saleAdjustments=db.salesAdjustmentMap(duplicate.base).get('cmp_sale');
assert.equal(saleAdjustments.pendingConversions,0);
const partialSaleManifest={separacao_temporal:{D_zero:{datas_detectadas:['2026-09-14']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_zero:{data:{valor:'2026-09-14'},conversoes:{valor:1},valor_conversao:{valor:436.75},moeda:{valor:'BRL'}}}]};
const partialSaleResult=db.importManifest(saleResult.base,partialSaleManifest,()=>({date:'2026-09-14',period:'d0',cells:{A:{value:46283},F:{value:1},P:{value:436.75}}}));
const partialSale=partialSaleResult.base;
assert.equal(partialSale.vendas_provisorias[0].status,'provisoria');
assert.equal(partialSaleResult.reconciledSales.length,0,'D0 não confirma uma venda manual');
assert.equal(partialSaleResult.mccBillingSales[0].confirmation_status,'represented_by_manual','conversão já coberta por lançamento manual não gera total financeiro duplicado');
assert.equal(partialSaleResult.mccBillingSales[0].active,false);
assert.equal(db.salesAdjustmentMap(partialSale).get('cmp_sale').manualSales,1);
const officialSaleManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-14']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_menos_1:{data:{valor:'2026-09-14'},conversoes:{valor:1},valor_conversao:{valor:436.75},moeda:{valor:'BRL'}}}]};
const reconciledResult=db.importManifest(partialSale,officialSaleManifest,()=>({date:'2026-09-14',period:'d1',cells:{A:{value:46283},F:{value:1},P:{value:436.75}}}));
const reconciledSale=reconciledResult.base;
assert.equal(reconciledSale.vendas_provisorias[0].status,'conciliada');
assert.equal(reconciledResult.reconciledSales.length,1,'D−1 devolve somente a venda que mudou para permitir sincronização incremental');
assert.equal(reconciledResult.reconciledSales[0].billing_sale_id,saleResult.sale.billing_sale_id);
assert.equal(db.salesAdjustmentMap(reconciledSale).get('cmp_sale'),undefined);
const revertedResult=db.importManifest(reconciledSale,officialSaleManifest,()=>({date:'2026-09-14',period:'d1',cells:{A:{value:46283},F:{value:0},P:{value:0}}}),{overwrite:true});
assert.equal(revertedResult.base.vendas_provisorias[0].status,'provisoria','correção posterior do D−1 reverte a confirmação');
assert.equal(revertedResult.reconciledSales.length,1,'reversão também é exposta para o espelho financeiro e auditada');
console.log('database module ok');

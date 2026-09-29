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
const oldSlim='07/09 - SlimQA 13 (GM-BB-SE) 80% - U$ 42',newSlim='26/09 - SlimQA 13 (GM-BB-SE) 80% - U$ 42';
const slimOriginal=db.importManifest(db.create(),dailyManifest('2026-09-27',[oldSlim]),()=>({date:'2026-09-27',cells:{B:{value:12},C:{value:2}}})).base;
const slimCampaign=slimOriginal.campanhas[0],slimIncoming=dailyManifest('2026-09-28',[newSlim]);
assert.equal(slimCampaign.data_inicio_ano_inferido,new Date().getFullYear(),'campanha nova sem ano no nome fixa o ano corrente');
const olderReportNewCampaign=db.importManifest(db.create(),dailyManifest('2025-09-27',[oldSlim]),()=>({date:'2025-09-27',cells:{B:{value:0}}})).base;
assert.equal(olderReportNewCampaign.campanhas[0].data_inicio_ano_inferido,new Date().getFullYear(),'o ano de uma campanha nova não vem do relatório importado');
const slimChanges=db.campaignDateChangeCandidates(slimOriginal,slimIncoming);
assert.equal(slimChanges.length,1);
assert.equal(slimChanges[0].shortName,'SlimQA 13');
assert.equal(slimChanges[0].oldDate,`07/09/${new Date().getFullYear()}`);
assert.equal(slimChanges[0].newDate,`26/09/${new Date().getFullYear()}`);
delete olderReportNewCampaign.campanhas[0].data_inicio_ano_inferido;
assert.equal(db.campaignDateChangeCandidates(olderReportNewCampaign,slimIncoming)[0].oldDate,'07/09/2025','campanha legada usa o ano do histórico, sem reescrevê-lo para o ano atual');
assert.equal(db.campaignDateChangeCandidates(slimOriginal,dailyManifest('2026-09-28',[oldSlim,newSlim])).length,0,'D−1 e D0 com nomes conflitantes não devem produzir vínculo automático');
assert.equal(db.campaignNumberReuseIssues(slimOriginal,slimIncoming).length,0,'mudança somente de data deve pedir confirmação, não renumeração');
assert.throws(()=>db.importManifest(slimOriginal,slimIncoming,()=>({date:'2026-09-28',cells:{B:{value:0}}})),/confirmação/);
const slimApplied=db.importManifest(slimOriginal,slimIncoming,()=>({date:'2026-09-28',cells:{B:{value:0}}}),{confirmedDateChanges:slimChanges}).base;
assert.equal(slimApplied.campanhas.length,1);
assert.equal(slimApplied.campanhas[0].id,slimCampaign.id);
assert.equal(slimApplied.campanhas[0].nome_mcc,newSlim);
assert.equal(slimApplied.campanhas[0].nome_mcc_anterior,oldSlim);
assert.equal(db.campaignNumberReuseIssues(slimApplied,slimIncoming).length,0,'nome antigo preservado em snapshots não é uma segunda campanha após confirmação da data');
const nextSlim='30/09 - SlimQA 13 (GM-BB-SE) 80% - U$ 42',nextSlimManifest=dailyManifest('2026-09-30',[nextSlim]);
const nextSlimChanges=db.campaignDateChangeCandidates(slimApplied,nextSlimManifest);
assert.equal(nextSlimChanges.length,1,'nova correção de data continua exigindo confirmação');
assert.equal(db.campaignNumberReuseIssues(slimApplied,nextSlimManifest).length,0,'histórico de data já confirmada não bloqueia uma segunda correção');
const twiceCorrected=db.importManifest(slimApplied,nextSlimManifest,()=>({date:'2026-09-30',cells:{B:{value:0}}}),{confirmedDateChanges:nextSlimChanges}).base;
assert.deepEqual(Array.from(twiceCorrected.campanhas[0].nome_mcc_anteriores),[oldSlim,newSlim],'correções sucessivas preservam os nomes históricos');
const twiceCorrectedIssues=db.campaignNumberReuseIssues(twiceCorrected,nextSlimManifest);
assert.equal(twiceCorrectedIssues.length,0,'histórico de múltiplas correções não gera falsa numeração reutilizada');
assert.equal(twiceCorrected.campanhas.length,1,'correção posterior da data não separa a campanha confirmada em outro ID');
assert.equal(twiceCorrected.diario.every(row=>row.campanha_id===slimCampaign.id),true,'o Diário permanece associado ao ID original');
const differentSlim='30/09 - SlimQA 13 (GM-BB-SE) 90% - U$ 42';
assert.equal(db.campaignNumberReuseIssues(twiceCorrected,dailyManifest('2026-09-30',[differentSlim])).length,1,'mudança além da data continua bloqueada como reutilização real da numeração');
assert.equal(slimApplied.campanhas[0].movimento_status,'manteve','renomear somente a data não cria uma campanha nova');
assert.equal(slimApplied.event_log.filter(event=>event.event_type==='test_iteration_created').length,1,'renomear a data não cria nova iteração na observabilidade');
assert.equal(slimApplied.diario.length,2);
assert.equal(slimApplied.diario.find(row=>row.data==='2026-09-27').celulas.C.value,2);
const slimCorrected=db.setCampaignStartDate(slimOriginal,slimCampaign.id,'2026-09-26');
assert.equal(slimCorrected.campanhas[0].data_inicio_confirmada,'2026-09-26');
assert.equal(slimCorrected.campanhas[0].nome_mcc,oldSlim,'a correção manual não altera a evidência da MCC');
assert.equal(slimCorrected.diario.length,1);
assert.throws(()=>db.setCampaignStartDate(slimOriginal,slimCampaign.id,'2026-02-31'),/Data inválida/);
const roiEdited=db.setCampaignMinimumRoi(slimOriginal,slimCampaign.id,17.5);
assert.equal(roiEdited.campanhas[0].roi_minimo_pct,17.5,'ROI mínimo personalizado fica associado à identidade da campanha');
assert.deepEqual(JSON.parse(JSON.stringify(roiEdited.diario)),JSON.parse(JSON.stringify(slimOriginal.diario)),'editar ROI mínimo não altera o Diário');
const roiReimported=db.importManifest(roiEdited,dailyManifest('2026-09-28',[oldSlim]),()=>({date:'2026-09-28',cells:{B:{value:0}}})).base;
assert.equal(roiReimported.campanhas[0].roi_minimo_pct,17.5,'importar novamente a mesma campanha preserva o ROI mínimo personalizado');
assert.throws(()=>db.setCampaignMinimumRoi(slimOriginal,slimCampaign.id,'17.5%'),/igual ou maior que zero/,'a camada de persistência recebe somente valor numérico já validado');
assert.throws(()=>db.setCampaignMinimumRoi(slimOriginal,'campanha-inexistente',17),/Campanha não encontrada/);
reusedNumber=db.importManifest(reusedNumber,dailyManifest('2026-09-16',[newMedic6]),()=>({date:'2026-09-16',cells:{A:{value:46281},B:{value:0}}})).base;
assert.equal(reusedNumber.campanhas.filter(x=>x.nome_exibicao==='MagicGLP 6').length,2);
assert.notEqual(reusedNumber.campanhas.find(x=>x.nome_mcc===oldMedic6).id,reusedNumber.campanhas.find(x=>x.nome_mcc===newMedic6).id);
assert.equal(reusedNumber.diario.find(x=>x.data==='2026-09-15').campanha_id,reusedNumber.campanhas.find(x=>x.nome_mcc===oldMedic6).id);
assert.equal(reusedNumber.diario.find(x=>x.data==='2026-09-16').campanha_id,reusedNumber.campanhas.find(x=>x.nome_mcc===newMedic6).id);
const oldMedic6Id=reusedNumber.campanhas.find(x=>x.nome_mcc===oldMedic6).id;
const newMedic6Id=reusedNumber.campanhas.find(x=>x.nome_mcc===newMedic6).id;
assert.deepEqual(Array.from(db.dailyRows(reusedNumber,'MagicGLP 6',oldMedic6Id),row=>row.cells.A.value),[46280],'o Diário da primeira campanha mantém somente seus próprios dias');
assert.deepEqual(Array.from(db.dailyRows(reusedNumber,oldMedic6,newMedic6Id),row=>row.cells.A.value),[46281],'o ID correto prevalece mesmo quando o nome recebido é de outra campanha');
assert.equal(db.dailyRows(reusedNumber,'MagicGLP 6','cmp_inexistente').length,0,'um ID desconhecido não deve mostrar o histórico de outra campanha com o mesmo nome');

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
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').motivo_pausa,null,'pausa sem qualificação de reprovação permanece sem motivo específico');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha C').movimento_status,'nova');
lifecycle=db.importManifest(lifecycle,dailyManifest('2026-09-15',['Campanha A','Campanha B','Campanha C']),dailyRow).base;
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').status,'ativa');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').movimento_status,'reativada');
assert.equal(lifecycle.campanhas.find(x=>x.nome_mcc==='Campanha B').reativada_em,'2026-09-15');

let salesBase=db.create();
salesBase.campanhas.push({id:'cmp_sale',nome_mcc:'Wego6 campanha',nome_exibicao:'Wego6',status:'ativa',conta_sufixo:'3248'});
salesBase.campanhas.push({id:'cmp_sale_2',nome_mcc:'Wego6 campanha 2',nome_exibicao:'Wego6 variação',status:'pausada',conta_sufixo:'9827'});
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
const registeredAt=saleResult.sale.registrada_em;
const editedSaleResult=db.updateProvisionalSale(revertedResult.base,{id:saleResult.sale.id,campanha_id:'cmp_sale_2',data:'2026-09-25',hora:'18:20',produto:'Wego6 corrigido',plataforma:'Gurumedia corrigida',valor_brl:250,pais_codigo:'AU',chave_duplicidade:'hash-unico-editado'});
assert.equal(editedSaleResult.sale.id,saleResult.sale.id,'a edição preserva a identidade original da venda');
assert.equal(editedSaleResult.sale.billing_sale_id,saleResult.sale.billing_sale_id,'a edição preserva o vínculo estável com Faturamento');
assert.equal(editedSaleResult.sale.registrada_em,registeredAt,'a edição preserva a data original de criação');
assert.equal(editedSaleResult.sale.campanha_id,'cmp_sale_2');
assert.equal(editedSaleResult.sale.conta,'9827','a conta passa a refletir a campanha associada');
assert.equal(editedSaleResult.sale.data,'2026-09-25');
assert.equal(editedSaleResult.sale.hora,'18:20');
assert.equal(editedSaleResult.sale.produto,'Wego6 corrigido');
assert.equal(editedSaleResult.sale.plataforma,'Gurumedia corrigida');
assert.equal(editedSaleResult.sale.valor_brl,250);
assert.equal(editedSaleResult.sale.pais_codigo,'AU');
assert.equal(db.salesAdjustmentMap(editedSaleResult.base).get('cmp_sale_2').commissionAdjustment,250,'a edição atualiza o valor usado pelos ajustes da campanha');
const collisionBase=db.addProvisionalSale(editedSaleResult.base,{campanha_id:'cmp_sale',data:'2026-09-26',valor_brl:30,pais_codigo:'DE',chave_duplicidade:'another-sale-key'}).base;
assert.throws(()=>db.updateProvisionalSale(collisionBase,{id:saleResult.sale.id,campanha_id:'cmp_sale',data:'2026-09-26',hora:'',produto:'Outro produto',plataforma:'Gurumedia',valor_brl:30,pais_codigo:'DE',chave_duplicidade:'another-sale-key'}),/outro lançamento já registrado/,'edição não pode colidir com uma venda ativa existente');

const oldAccounts=db.create();
oldAccounts.campanhas.push(
  {id:'old-a',nome_mcc:'Campanha antiga A',nome_exibicao:'Campanha antiga A',status:'ativa',conta_sufixo:'1234'},
  {id:'old-b',nome_mcc:'Campanha antiga B',nome_exibicao:'Campanha antiga B',status:'pausada',conta_sufixo:'1234'},
  {id:'old-other-domain',nome_mcc:'Campanha antiga de outra loja',nome_exibicao:'Outra loja',status:'pausada',conta_sufixo:'1234',conta_dominio:'.other.shop'}
);
oldAccounts.diario.push({campanha_id:'old-b',data:'2026-09-20',celulas:{B:{value:7}},fontes:['manifesto']});
oldAccounts.vendas_provisorias.push({id:'old-sale',campanha_id:'old-b',conta:'1234',data:'2026-09-20',valor_brl:50,status:'provisoria'});
const fullAccountManifest={separacao_temporal:{D_zero:{datas_detectadas:['2026-09-29']}},campanhas:[{
  nome_campanha_exato:'Campanha antiga A',
  metricas_D_zero:{data:{valor:'2026-09-29'},conta:{valor:'1234 - Loja A .example.shop'},conta_id:{valor:'111-222-3333'}}
}]};
const linkedAccounts=db.importManifest(oldAccounts,fullAccountManifest,()=>[],{trackEvents:false}).base;
assert.equal(linkedAccounts.campanhas.find(item=>item.id==='old-a').conta_id,'111-222-3333');
assert.equal(linkedAccounts.campanhas.find(item=>item.id==='old-b').conta_id,'111-222-3333','campanha histórica da mesma conta ganha o ID completo');
assert.equal(linkedAccounts.campanhas.find(item=>item.id==='old-other-domain').conta_id,undefined,'domínio histórico conflitante impede uma associação presumida');
assert.equal(linkedAccounts.contas_identidade['1234'],'111-222-3333');
assert.equal(linkedAccounts.diario.find(item=>item.campanha_id==='old-b').celulas.B.value,7,'métricas históricas continuam ligadas à campanha original');
assert.equal(linkedAccounts.vendas_provisorias[0].conta,'111-222-3333','venda histórica ligada à campanha usa o ID completo');
assert.equal(oldAccounts.campanhas[1].conta_id,undefined,'a importação não modifica a base de entrada');
assert.throws(()=>db.importManifest(linkedAccounts,{...fullAccountManifest,campanhas:[{...fullAccountManifest.campanhas[0],metricas_D_zero:{...fullAccountManifest.campanhas[0].metricas_D_zero,conta_id:{valor:'999-888-7777'}}}]},()=>[]),/outra conta completa/);
assert.throws(()=>db.importManifest(linkedAccounts,{...fullAccountManifest,campanhas:[{nome_campanha_exato:'Campanha de outra conta',metricas_D_zero:{data:{valor:'2026-09-29'},conta:{valor:'1234 - Outra loja'},conta_id:{valor:'999-888-7777'}}}]},()=>[],{trackEvents:false}),/prefixo histórico 1234/,'um conflito posterior bloqueia associação histórica já estabelecida');

const noPrefix=db.importManifest(db.create(),{...fullAccountManifest,campanhas:[{nome_campanha_exato:'Campanha sem prefixo',metricas_D_zero:{data:{valor:'2026-09-29'},conta:{valor:'Loja sem prefixo'},conta_id:{valor:'444-555-6666'}}}]},()=>[],{trackEvents:false}).base;
assert.equal(noPrefix.campanhas[0].conta_id,'444-555-6666');
assert.equal(noPrefix.campanhas[0].conta_sufixo,undefined,'novas contas não dependem do prefixo');

const ambiguousBase=db.create();
ambiguousBase.campanhas.push({id:'old-c',nome_mcc:'Campanha antiga C',nome_exibicao:'Campanha antiga C',status:'pausada',conta_sufixo:'1234'});
const ambiguousManifest={...fullAccountManifest,campanhas:[fullAccountManifest.campanhas[0],{nome_campanha_exato:'Campanha outra conta',metricas_D_zero:{data:{valor:'2026-09-29'},conta:{valor:'1234 - Outra loja'},conta_id:{valor:'999-888-7777'}}}]};
const ambiguousResult=db.importManifest(ambiguousBase,ambiguousManifest,()=>[],{trackEvents:false}).base;
assert.equal(ambiguousResult.campanhas.find(item=>item.id==='old-c').conta_id,undefined,'prefixo ambíguo não reatribui campanha histórica');
assert.equal(ambiguousResult.contas_identidade['1234'],undefined);
console.log('database module ok');

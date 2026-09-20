import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/database.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},structuredClone});
vm.runInContext(source,context);
const db=context.window.CampaignDatabase;

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

const manifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2025-09-13']}},campanhas:[{nome_campanha_exato:'27/08 - MedicGLP 4 (GM) 91% - U$ 60',metricas_D_menos_1:{data:{valor:'2025-09-13'},conta:{valor:'7890 - 4ª CNPJ exemplo.shop'}}}]};
const rowFactory=()=>({cells:{A:{value:45913},B:{value:30},C:{value:3}}});
result=db.importManifest(result.base,manifest,rowFactory);
assert.equal(result.base.diario.length,3);
assert.equal(result.base.campanhas.find(x=>x.nome_mcc===manifest.campanhas[0].nome_campanha_exato).conta_sufixo,'7890');
const invalidAccountManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2025-09-14']}},campanhas:[{nome_campanha_exato:'Conta sem prefixo',metricas_D_menos_1:{data:{valor:'2025-09-14'},conta:{valor:'4ª CNPJ exemplo.shop'}}}]};
const invalidAccountImport=db.importManifest(result.base,invalidAccountManifest,rowFactory);
assert.equal(invalidAccountImport.base.campanhas.find(x=>x.nome_mcc==='Conta sem prefixo').conta_sufixo,undefined);
const repeated=db.importManifest(result.base,manifest,rowFactory);
assert.equal(repeated.base.diario.length,3);
assert.equal(repeated.conflicts.length,0);
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
let saleAdjustments=db.salesAdjustmentMap(saleResult.base).get('cmp_sale');
assert.equal(saleAdjustments.pendingConversions,1);
assert.equal(saleAdjustments.commissionAdjustment,436.75);
const duplicate=db.addProvisionalSale(saleResult.base,{campanha_id:'cmp_sale',data:'2026-09-14',valor_brl:436.75,pais_codigo:'DE',chave_duplicidade:'hash-unico'});
assert.equal(duplicate.duplicate,true);
duplicate.base.diario.push({campanha_id:'cmp_sale',data:'2026-09-14',celulas:{F:{value:1}},fontes:['manifesto']});
saleAdjustments=db.salesAdjustmentMap(duplicate.base).get('cmp_sale');
assert.equal(saleAdjustments.pendingConversions,0);
const partialSaleManifest={separacao_temporal:{D_zero:{datas_detectadas:['2026-09-14']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_zero:{data:{valor:'2026-09-14'}}}]};
const partialSale=db.importManifest(saleResult.base,partialSaleManifest,()=>({date:'2026-09-14',period:'d0',cells:{A:{value:46283},F:{value:1},P:{value:436.75}}})).base;
assert.equal(partialSale.vendas_provisorias[0].status,'provisoria');
assert.equal(db.salesAdjustmentMap(partialSale).get('cmp_sale').manualSales,1);
const officialSaleManifest={separacao_temporal:{D_menos_1:{datas_detectadas:['2026-09-14']}},campanhas:[{nome_campanha_exato:'Wego6 campanha',metricas_D_menos_1:{data:{valor:'2026-09-14'}}}]};
const reconciledSale=db.importManifest(partialSale,officialSaleManifest,()=>({date:'2026-09-14',period:'d1',cells:{A:{value:46283},F:{value:1},P:{value:436.75}}})).base;
assert.equal(reconciledSale.vendas_provisorias[0].status,'conciliada');
assert.equal(db.salesAdjustmentMap(reconciledSale).get('cmp_sale'),undefined);
console.log('database module ok');

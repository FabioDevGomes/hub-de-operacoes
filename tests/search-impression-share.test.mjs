import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {webcrypto} from 'node:crypto';
import {mapHeaders,expectedMccD1Date,REQUIRED_D0_FIELDS} from '../extensions/mcc-d0-bridge/mcc-grid-domain.mjs';
import {createRoot,format} from './helpers/view-dom.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const html=await read('src/preparador-MCC/index.html'),index=await read('src/index.template.html');
const context=vm.createContext({window:{},structuredClone,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array});
vm.runInContext(await read('src/database.js'),context);
const db=context.window.CampaignDatabase;
context.CampaignDatabase=db;
const slice=(start,end)=>{const a=html.indexOf(start),b=html.indexOf(end,a);assert.ok(a>=0&&b>a,start);return html.slice(a,b)};
vm.runInContext(slice('    const ABSENT = new Set(','    const slots =')+
  slice('    function normalize(value)','    function renderSlot(')+
  '\nglobalThis.tools={parseSource,buildManifest,decodeMccGridCapture,decodeMccD1GridCapture};',context);
const business=context.tools;
context.PANEL_USD_BRL_RATE=5;
context.panelValue=field=>field?.estado==='ausente'||field?.estado==='invalido'?null:field?.valor??field;
context.panelIsoToSerial=iso=>Date.parse(iso+'T00:00:00Z')/86400000+25569;
vm.runInContext(slice('    const panelPctDecimal =','    function openPanelDatabase()')+
  '\nglobalThis.preparerRows=panelManifestRow;',context);
context.valueOf=context.panelValue;context.pctDecimal=field=>field?.estado==='ausente'?null:Number(field?.valor||0)/100;
context.isoToSerial=context.panelIsoToSerial;context.dateLabel=iso=>iso;
context.state={rate:5};context.fmtNum=(v,d)=>Number(v).toFixed(d);
context.strategyLabel=()=> 'CPA 85%';context.campaignStatusObservation=context.panelStatusObservation;
vm.runInContext(index.split(/\r?\n/).filter(line=>/function (metricsProductRow|manifestProductRow)\(/.test(line)).join('\n')+
  '\nglobalThis.hubRows=manifestProductRow;',context);
vm.runInContext(await read('src/product-diary/domain.js'),context);
vm.runInContext(await read('src/product-diary/view.js'),context);
const plain=value=>JSON.parse(JSON.stringify(value));
const key='participacao_impressao_rede_pesquisa',d1=expectedMccD1Date(),d0=new Date(Date.parse(d1+'T00:00:00Z')+86400000).toISOString().slice(0,10);
function capture(role,values,{share=true,hidden=false,ambiguous=false}={}){
  return{schema:role==='d1'?'mcc-d1-grid-v3':'mcc-d0-grid-v3',periodRole:role,source:'mcc_chrome_extension',
    managerAccountId:'999-888-7777',managerAccountName:'MCC teste',reportDate:role==='d1'?d1:d0,locale:'pt-BR',
    pagination:{first:1,last:values.length,total:values.length},campaignCount:values.length,
    fields:{...Object.fromEntries(REQUIRED_D0_FIELDS.map(key=>[key,{found:true,hidden:false,ambiguous:false}])),
      search_impression_share:{found:share,hidden,ambiguous}},
    records:values.map((value,i)=>({campaign:'Oferta teste '+(i+1),account:'Conta teste',account_id:'111-222-3333',
      status:'Qualificada',currency:'USD',impressions:'10',clicks:'2',conversions:'0',avg_cost:'US$ 1,00',
      abs_top_share:'25%',top_share:'50%',budget:'US$ 10,00/day',bid_strategy:'Maximizar conversões',cost:'US$ 2,00',
      search_impression_share:value}))};
}
async function prepare(role,values,options){
  const decoded=await(role==='d1'?business.decodeMccD1GridCapture:business.decodeMccGridCapture)(capture(role,values,options));
  const source=business.parseSource(decoded,role),result=business.buildManifest(role==='d1'?source:null,role==='d0'?source:null);
  return{source,result,manifest:result.manifest,decoded};
}
test('separate Portuguese/English header mapping never aliases search share to top/absolute-top',()=>{
  const mapped=mapHeaders(['Parc. de impr. da rede de pesquisa','Search top IS','Search abs. top IS']);
  assert.deepEqual(mapped.mapping,{search_impression_share:0,top_share:1,abs_top_share:2});
  for(const header of ['Search impression share','Search impr. share','Search IS','Parcela de impressões da rede de pesquisa'])
    assert.equal(mapHeaders([header]).mapping.search_impression_share,0);
  assert.equal(mapHeaders(['Search impression share','Search IS']).duplicates.search_impression_share.length,2);
  assert.ok(!REQUIRED_D0_FIELDS.includes('search_impression_share'));
});
test('parser preserves exact percentages, zero, strict bounds, original text, missing and invalid',()=>{
  for(const [raw,value] of [['22,22%',22.22],['100.00%',100],['1%',1],['0%',0],['20',20]]){
    const parsed=db.parseSearchImpressionShare(raw);
    assert.equal(parsed.valor,value);assert.equal(parsed.estado,value===0?'zero_confirmado':'confirmado');
    assert.equal(parsed.original,raw);
    assert.equal(db.searchImpressionShareCells({[key]:parsed}).R.value,value/100);
  }
  for(const raw of ['< 10%','> 90%']){
    const parsed=db.parseSearchImpressionShare(raw),cell=db.searchImpressionShareCells({[key]:parsed}).R;
    assert.equal(parsed.valor,null);assert.equal(parsed.estado,'limite');assert.equal(typeof cell.value,'string');
    assert.equal(cell.original,raw);assert.equal(cell.value,raw);
  }
  for(const raw of ['—','',null])assert.equal(db.parseSearchImpressionShare(raw).estado,'ausente');
  for(const raw of ['abc','101%','-1%','1,2.3%','<script>'])assert.equal(db.parseSearchImpressionShare(raw).estado,'invalido');
  assert.deepEqual(plain(db.searchImpressionShareCells({})),{});
});
test('D0/D−1 structural capture reaches manifesto and both actual daily factories, without shifting M–Q',async()=>{
  for(const role of ['d0','d1']){
    const prepared=await prepare(role,['22,22%','< 10%','0%','—']);
    assert.ok(prepared.decoded.text.includes('Search impression share'));
    assert.ok(prepared.decoded.text.includes('< 10%'),'bounds are not routed through the scalar numeric decoder');
    const manifest=prepared.manifest,period=role==='d1'?'metricas_D_menos_1':'metricas_D_zero';
    assert.equal(manifest.campanhas[0][period][key].valor,22.22);
    assert.equal(manifest.campanhas[1][period][key].estado,'limite');
    for(const factory of [context.preparerRows,context.hubRows]){
      const rows=manifest.campanhas.map(campaign=>factory(campaign)[0]);
      assert.ok(Math.abs(rows[0].cells.R.value-.2222)<1e-12);assert.equal(rows[1].cells.R.value,'< 10%');
      assert.equal(rows[2].cells.R.value,0);assert.equal(rows[3].cells.R.value,null);
      assert.equal(rows[0].cells.K.value,.25);assert.equal(rows[0].cells.L.value,.5);
      assert.ok(rows[0].cells.M.value.endsWith('/dia'));assert.equal(rows[0].cells.O.value,10);
      const applied=db.importManifest(db.create(),manifest,factory,{overwrite:true});
      assert.equal(applied.base.diario.length,4);assert.equal(applied.base.diario[1].celulas.R.value,'< 10%');
      assert.equal(applied.base.diario[0].data,role==='d1'?d1:d0);
      assert.equal(db.normalize(applied.base).diario[1].celulas.R.original,'< 10%');
      assert.equal(db.importManifest(applied.base,manifest,factory,{overwrite:true}).base.diario.length,4);
    }
  }
});
test('old, hidden or ambiguous optional columns cannot erase a saved observation',async()=>{
  const first=await prepare('d0',['< 10%']),base=db.importManifest(db.create(),first.manifest,context.preparerRows).base;
  for(const options of [{share:false},{hidden:true},{ambiguous:true}]){
    const next=await prepare('d0',['99%'],options),metrics=next.manifest.campanhas[0].metricas_D_zero;
    assert.equal(Object.hasOwn(metrics,key),false);
    assert.equal(Object.hasOwn(context.preparerRows(next.manifest.campanhas[0])[0].cells,'R'),false);
    assert.equal(db.importManifest(base,next.manifest,context.preparerRows,{overwrite:true}).base.diario[0].celulas.R.value,'< 10%');
  }
  const missing=await prepare('d0',['—']);
  assert.equal(db.importManifest(base,missing.manifest,context.preparerRows,{overwrite:true}).base.diario[0].celulas.R.value,'< 10%');
  const exact=await prepare('d0',['20%']);
  assert.equal(db.importManifest(base,exact.manifest,context.preparerRows).conflicts[0].coluna,'R');
  assert.equal(db.importManifest(base,exact.manifest,context.preparerRows,{overwrite:true}).base.diario[0].celulas.R.value,.2);
});
test('invalid share is flagged by the Preparador instead of silently becoming a valid number',async()=>{
  for(const role of ['d0','d1']){
    const {manifest}=await prepare(role,['101%']);
    assert.equal(manifest.campanhas[0][role==='d0'?'metricas_D_zero':'metricas_D_menos_1'][key].estado,'invalido');
    assert.equal(manifest.campanhas[0].situacao_manifesto,'pendente');
  }
});
test('paired periods stay on their own dates and D−1-only does not delete prior D0 share',async()=>{
  const closed=await prepare('d1',['< 10%']),partial=await prepare('d0',['22,22%']);
  const manifest=business.buildManifest(closed.source,partial.source).manifest;
  const applied=db.importManifest(db.create(),manifest,context.preparerRows,{overwrite:true});
  assert.equal(applied.base.diario.length,2);
  assert.equal(new Set(applied.base.diario.map(row=>row.campanha_id)).size,1);
  assert.equal(applied.base.diario.find(row=>row.data===d1).celulas.R.value,'< 10%');
  const preserved=applied.base.diario.find(row=>row.data===d0).celulas.R;
  const next=db.importManifest(applied.base,closed.manifest,context.preparerRows,{overwrite:true});
  assert.deepEqual(plain(next.base.diario.find(row=>row.data===d0).celulas.R),plain(preserved));
  const restored=db.normalize(JSON.parse(JSON.stringify(next.base)));
  assert.equal(restored.diario.find(row=>row.data===d1).celulas.R.original,'< 10%');
});
test('actual diary view places R after L, retains bounds/decimals and excludes share from totals',()=>{
  const domain=context.window.ProductDiaryDomain,view=context.window.ProductDiaryView;
  assert.equal(domain.productColumns[12][0],'R');assert.equal(domain.productColumns[13][0],'M');
  const rows=['22,22%','< 10%','0%','—'].map((value,i)=>({date:d0,cells:{A:{value:d0},...db.searchImpressionShareCells({[key]:db.parseSearchImpressionShare(value)})}}));
  const dom=createRoot(),controller=view.mount({root:dom.root,domain,
    format:{...format,pct:value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value)+'%'},
    getSnapshot:()=>({sheetName:'Sintética',rows,displayRows:rows,manualSalesByDate:new Map(),summary:null,investment:null,clicks:null,conversions:null}),
    actions:{setTitle(){}}});
  controller.render('Sintética');
  assert.match(dom.get('#productHead').innerHTML,/% parte sup\.<\/th><th title=.*Parc\. impr\. pesquisa/);
  assert.match(dom.get('#productBody').innerHTML,/22,22%/);assert.match(dom.get('#productBody').innerHTML,/&lt; 10%/);
  assert.match(dom.get('#productBody').innerHTML,/product-zero-value">0%/);
  assert.equal(Object.hasOwn(domain.productDiaryTableTotals(rows),'R'),false);
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
import {createRoot,format} from './helpers/view-dom.mjs';
const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/product-diary/domain.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../src/product-diary/view.js',import.meta.url),'utf8'),context);
const domain=context.window.ProductDiaryDomain,view=context.window.ProductDiaryView;
function setup(initial,actionOverrides={}){
  const dom=createRoot(),titles=[],requests=[];let snapshot=initial;
  const controller=view.mount({root:dom.root,domain,format,getSnapshot:(...args)=>{requests.push(args);return snapshot},
    actions:{setTitle:(...args)=>titles.push(args),...actionOverrides}});
  return {...dom,titles,requests,controller,setSnapshot:value=>snapshot=value};
}
const empty=()=>({sheetName:'Oferta <Teste>',rows:[],displayRows:[],manualSalesByDate:new Map(),summary:null,pauseConfirmedAt:null,investment:null,clicks:null,conversions:null});
test('native diary preserves columns, empty data, escaping and selection arguments',()=>{
  const s=setup(empty());s.controller.render('MCC exata','workbook','campaign-123');
  assert.deepEqual(s.requests,[['MCC exata','workbook','campaign-123']]);
  assert.equal((s.get('#productHead').innerHTML.match(/<th\b[^>]*>/g)||[]).length,18);
  assert.match(s.get('#productBody').innerHTML,/colspan="18"/);assert.deepEqual(s.titles[0],['Oferta <Teste>','Aba histórica da base local']);
  assert.match(s.get('#productSummary').innerHTML,/<strong>—<\/strong>/);assert.equal(s.get('#rowCount').textContent,'0 dias');
  assert.equal(s.get('#legacySummaryBody').classList.contains('hidden'),true);
});
test('keyword refresh reads one mapped campaign and displays only the verified API inventory',async()=>{
  const calls=[],scope={mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'},readAtUtc='2026-11-20T15:30:00Z';
  const s=setup({...empty(),storedCampaignId:'campaign-local',googleAdsCampaignAction:scope},{async readCampaignKeywordInventory(input){calls.push(input);return{verified:true,readAtUtc,campaign:{status:'ENABLED'},positiveKeywords:[{term:'positive term',matchType:'EXACT',status:'ENABLED',scope:'AD_GROUP',adGroupId:'456'}],negativeKeywords:[{term:'negative term',matchType:'PHRASE',status:'PAUSED',scope:'CAMPAIGN',adGroupId:null}]}}});
  s.controller.render('Campanha Search');
  const button={disabled:false},inventory=s.get('#productCampaignKeywordInventory');
  await inventory.onclick({target:{closest:selector=>selector==='[data-refresh-campaign-keywords]'?button:null},preventDefault(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789'}]);
  assert.match(inventory.innerHTML,/positive term/);assert.match(inventory.innerHTML,/negative term/);assert.match(inventory.innerHTML,/Correspondência/);
  assert.match(inventory.innerHTML,/Google Ads · Grupo 456 · Ativa/);assert.match(inventory.innerHTML,/Google Ads · Campanha · Pausada/);
  assert.match(inventory.innerHTML,/Leitura confirmada/);assert.match(inventory.innerHTML,/20\/11 · 12:30/);
});
test('failed keyword refresh keeps local inventory and reports the API error',async()=>{
  const scope={mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'},observations=[{eventos:[{tipo:'google_ads_campaign_keyword_added',kind:'positive',term:'local positive',match_type:'EXACT',source:'search_terms',ocorrido_em_utc:'2026-11-20T14:00:00Z'}]}];
  const s=setup({...empty(),storedCampaignId:'campaign-local',googleAdsCampaignAction:scope,observations},{async readCampaignKeywordInventory(){throw new Error('Serviço indisponível')}});
  s.controller.render('Campanha Search');const inventory=s.get('#productCampaignKeywordInventory'),button={disabled:false};
  await inventory.onclick({target:{closest:selector=>selector==='[data-refresh-campaign-keywords]'?button:null},preventDefault(){}});
  assert.match(inventory.innerHTML,/local positive/);assert.match(inventory.innerHTML,/Serviço indisponível/);
});
test('manual-sale rows remain display-only, official zero separate, formats preserved',()=>{
  const rows=[{date:'2026-09-29',cells:{A:{value:'2026-09-29'},C:{value:4},F:{value:0},E:{value:0.25},O:{value:12.34},Q:{value:'<observação>'}}}];
  const adjustments=new Map([['2026-09-29',{pendingConversions:1}],['2026-09-30',{pendingConversions:2}]]),before=JSON.stringify(rows);
  const s=setup({...empty(),rows,displayRows:rows,manualSalesByDate:adjustments,investment:0,clicks:4,conversions:3});
  s.controller.render('MCC exata');
  const html=s.get('#productBody').innerHTML;
  assert.equal((html.match(/class="has-sales"/g)||[]).length,2);assert.match(html,/<span>0<\/span><small[^>]*>\+1 manual · provisória/);
  assert.match(html,/25%/);assert.match(html,/12.34/);assert.match(html,/&lt;observação&gt;/);
  assert.match(s.get('#productSummary').innerHTML,/<span>Conversões · total<\/span><strong>3<\/strong>/);
  assert.match(s.get('#productSummary').innerHTML,/BRL 0.00/);assert.equal(s.get('#rowCount').textContent,'2 dias');
  assert.equal(JSON.stringify(rows),before);assert.equal(rows.length,1);assert.equal(rows[0].cells.F.value,0);
  s.controller.render('MCC exata');assert.equal(s.get('#productBody').innerHTML,html);
});

test('diary totals preserve absence, zero and numeric values without treating invalid cells as zero',()=>{
  assert.equal(JSON.stringify(domain.productDiaryTotals([])),JSON.stringify({investment:null,clicks:null,conversions:null}));
  const rows=[{cells:{O:{value:0},C:{value:'0'},F:{value:0}}},{cells:{O:{value:''},C:{value:' '},F:{value:'inválido'}}},{cells:{O:{value:Infinity},C:{value:false},F:{value:null}}}];
  assert.equal(JSON.stringify(domain.productDiaryTotals(rows)),JSON.stringify({investment:0,clicks:0,conversions:0}));
  assert.equal(JSON.stringify(domain.productDiaryTotals(rows.slice(1))),JSON.stringify({investment:null,clicks:null,conversions:null}));
});

test('every campaign diary dims observed zero only in the requested metric columns',()=>{
  const columns=new Set(['B','C','D','E','F','G','H','I','J','K','L','R','O','P']);
  const row={date:'2026-09-29',cells:Object.fromEntries(domain.productColumns.map(([col])=>[col,{value:col==='A'?'2026-09-29':0}]))},before=JSON.stringify(row);
  const s=setup({...empty(),rows:[row],displayRows:[row]});
  for(const source of ['manifest','workbook']){
    s.controller.render('Campanha sintética',source,'campaign-synthetic');
    const cells=[...s.get('#productBody').innerHTML.matchAll(/<td class="([^"]*)">([\s\S]*?)<\/td>/g)];
    assert.equal(cells.length,18);
    domain.productColumns.forEach(([col],index)=>assert.equal(cells[index][1].includes('product-zero-value'),columns.has(col),'zero em '+col));
    assert.match(cells[6][2],/0%/);assert.match(cells[15][2],/0\.00/);
  }
  assert.equal(JSON.stringify(row),before,'a classificação visual não altera células nem dados de campanha');
});

test('zero styling excludes absence, invalid values and nonzero values even when formatting rounds them to zero',()=>{
  const inputs=[0,-0,'0','0.00','0,00',' 0 ','0%','0,00%',null,undefined,'',' ',false,true,NaN,Infinity,'—','inválido',0.000001,-1,5,'0.01'];
  for(const value of inputs){
    const row={date:'2026-09-29',cells:{A:{value:'2026-09-29'},B:{value},O:{value}}},s=setup({...empty(),rows:[row],displayRows:[row]});
    s.controller.render('Sintética');
    const expected=typeof value==='number'?Number.isFinite(value)&&value===0:typeof value==='string'&&/^[+-]?0+(?:[.,]0+)?\s*%?$/.test(value.trim());
    assert.equal((s.get('#productBody').innerHTML.match(/product-zero-value/g)||[]).length,expected?2:0,'valor '+String(value));
  }
  const row={date:'2026-09-29',cells:{B:{text:'0'},C:{value:null,text:'0'}}},s=setup({...empty(),rows:[row],displayRows:[row]});
  s.controller.render('Sem valor observado');assert.doesNotMatch(s.get('#productBody').innerHTML,/product-zero-value/);
});

test('dimmed official zero preserves the separate pending-sale notice and clears on updated nonzero snapshot',()=>{
  const row={date:'2026-09-29',cells:{F:{value:0}}},manualSalesByDate=new Map([['2026-09-29',{pendingConversions:1}]]),s=setup({...empty(),rows:[row],displayRows:[row],manualSalesByDate});
  s.controller.render('Sintética');
  assert.match(s.get('#productBody').innerHTML,/<td class="num product-zero-value"><span>0<\/span><small class="product-manual-sale-note">\+1 manual · provisória/);
  const updated={...row,cells:{F:{value:1}}};s.setSnapshot({...empty(),rows:[updated],displayRows:[updated],manualSalesByDate});s.controller.render('Sintética');
  assert.doesNotMatch(s.get('#productBody').innerHTML,/product-zero-value/);
  assert.match(s.get('#productBody').innerHTML,/\+1 manual · provisória/);assert.equal(row.cells.F.value,0);
});

test('diary cards show accumulated investment, Google clicks and conversions even when latest day is zero',()=>{
  const rows=[{date:'2026-09-29',cells:{O:{value:34.22},C:{value:4},F:{value:1}}},{date:'2026-09-30',cells:{O:{value:'54.82'},C:{value:'5'},F:{value:1}}},{date:'2026-10-01',cells:{O:{value:0},C:{value:0},F:{value:0}}}];
  const before=JSON.stringify(rows),totals=domain.productDiaryTotals(rows);
  const s=setup({...empty(),rows,displayRows:rows,...totals});s.controller.render('Campanha histórica','workbook','id');
  const html=s.get('#productSummary').innerHTML;
  assert.match(html,/<span>Investimento total<\/span><strong>BRL 89.04<\/strong>/);
  assert.match(html,/<span>Cliques Google · total<\/span><strong>9<\/strong>/);
  assert.match(html,/<span>Conversões · total<\/span><strong>2<\/strong>/);
  assert.doesNotMatch(html,/Investimento atual/);assert.equal(JSON.stringify(rows),before);
});
test('search-term history stays out of layout while loading, then displays the stored consultation time',async()=>{
  let resolveHistory;const historyPromise=new Promise(resolve=>{resolveHistory=resolve}),scope={mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'},s=setup({...empty(),storedCampaignId:'campaign-local-id',googleAdsCampaignAction:scope},{listSearchTermsQuerySnapshots:()=>historyPromise});
  s.controller.render('Campanha Search');
  const panel=s.get('#productSearchTermsAccessHistory'),list=s.get('#productSearchTermsAccessHistoryList');
  assert.equal(panel.classList.contains('hidden'),true);assert.equal(panel.getAttribute('aria-busy'),'true');assert.equal(list.innerHTML,'');
  await Promise.resolve();resolveHistory([{id:'gsts-12345678-1234-1234-1234-123456789012',completedAtUtc:'2026-11-05T04:45:00.000Z'}]);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(panel.getAttribute('aria-busy'),'false');assert.match(list.innerHTML,/05\/11\/2026, 01:45/);assert.match(list.innerHTML,/data-search-terms-snapshot=/);
});
test('search-term history remains hidden when the selected campaign has no saved consultations',async()=>{
  const scope={mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'},s=setup({...empty(),storedCampaignId:'campaign-local-id',googleAdsCampaignAction:scope},{listSearchTermsQuerySnapshots:async()=>[]});
  s.controller.render('Campanha Search');await new Promise(resolve=>setImmediate(resolve));
  const panel=s.get('#productSearchTermsAccessHistory');
  assert.equal(panel.getAttribute('aria-busy'),'false');assert.equal(panel.classList.contains('hidden'),true);
});
test('search-term history keeps the current entries visible during a same-campaign refresh',async()=>{
  const saved=[{id:'gsts-12345678-1234-1234-1234-123456789012',completedAtUtc:'2026-11-05T04:45:00.000Z'}];let resolveRefresh,calls=0;
  const scope={mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'},s=setup({...empty(),storedCampaignId:'campaign-local-id',googleAdsCampaignAction:scope},{listSearchTermsQuerySnapshots:()=>++calls===1?Promise.resolve(saved):new Promise(resolve=>{resolveRefresh=resolve})});
  s.controller.render('Campanha Search');await new Promise(resolve=>setImmediate(resolve));
  const panel=s.get('#productSearchTermsAccessHistory'),list=s.get('#productSearchTermsAccessHistoryList'),currentMarkup=list.innerHTML;
  assert.equal(panel.classList.contains('hidden'),false);
  s.controller.render('Campanha Search');
  await Promise.resolve();
  assert.equal(calls,2);assert.equal(panel.classList.contains('hidden'),false);assert.equal(panel.getAttribute('aria-busy'),'true');assert.equal(list.innerHTML,currentMarkup);assert.doesNotMatch(list.innerHTML,/Carregando consultas salvas/);
  resolveRefresh(saved);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(panel.classList.contains('hidden'),false);assert.equal(list.innerHTML,currentMarkup);assert.equal(panel.getAttribute('aria-busy'),'false');
});
test('search-term button records the campaign analysis before opening the search screen',async()=>{
  const order=[],notices=[],button={disabled:false,isConnected:true},s=setup({...empty(),storedCampaignId:'id-campaign',googleAdsCampaignAction:{mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'}},{
    async recordSearchTermsAnalysisInDiary(input){order.push('record');assert.equal(input.campaignId,'id-campaign');assert.ok(Number.isFinite(Date.parse(input.occurredAtUtc)));return{recorded:true}},
    openSearchTerms(context){order.push('open');assert.equal(button.disabled,true);assert.deepEqual(JSON.parse(JSON.stringify(context)),{managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search',includeToday:true,autoQuery:false})},
    notifySearchTermsAnalysisError:message=>notices.push(message)
  });
  s.controller.render('Campanha Search');
  await s.get('#productCampaignEventsToolbar').onclick({target:{closest:selector=>selector==='[data-product-search-terms]'?button:null}});
  assert.deepEqual(order,['record','open']);assert.deepEqual(notices,[]);
});
test('search-term screen still opens when local event recording fails and reports the failure',async()=>{
  const opened=[],notices=[],button={disabled:false,isConnected:true},s=setup({...empty(),storedCampaignId:'id-campaign',googleAdsCampaignAction:{mappingStatus:'mapped',managerCustomerId:'3533796641',customerId:'4404265713',campaignId:'123456789',campaignName:'Campanha Search'}},{
    async recordSearchTermsAnalysisInDiary(){throw new Error('Base local indisponível')},openSearchTerms(){opened.push(true);assert.equal(button.disabled,true)},notifySearchTermsAnalysisError:message=>notices.push(message)
  });
  s.controller.render('Campanha Search');await s.get('#productCampaignEventsToolbar').onclick({target:{closest:()=>button}});
  assert.deepEqual(opened,[true]);assert.deepEqual(notices,['Base local indisponível']);
});

test('diary totals use inclusive pause cutoff and only unconfirmed manual-sale excess without modifying official cells',()=>{
  const rows=[{date:'2026-09-29',cells:{O:{value:0.1},C:{value:3},F:{value:1}}},{date:'2026-09-30',cells:{O:{value:0.2},C:{value:2},F:{value:0}}},{date:'2026-10-02',cells:{O:{value:999},C:{value:999},F:{value:99}}}],
    pending=new Map([['2026-09-29',{pendingConversions:0}],['2026-09-30',{pendingConversions:1}],['2026-10-01',{pendingConversions:2}],['2026-10-02',{pendingConversions:4}]]),before=JSON.stringify(rows);
  assert.equal(JSON.stringify(domain.productDiaryTotals(rows,'2026-10-01',pending)),JSON.stringify({investment:0.3,clicks:5,conversions:4}));
  assert.equal(JSON.stringify(rows),before);assert.equal(rows[1].cells.F.value,0);
  assert.equal(domain.productDiaryTotals([],null,new Map([['2026-09-30',{pendingConversions:2}]])).conversions,2);
});
test('confirmed pause stops every campaign diary until reactivation, then resumes without filling the gap',()=>{
  const rows=[
    {date:'2026-09-29',cells:{A:{value:'2026-09-29'},B:{value:10},C:{value:1},O:{value:5},Q:{value:'Estado informado pela MCC'}}},
    {date:'2026-09-30',cells:{A:{value:'2026-09-30'},B:{value:99},C:{value:2},O:{value:9}}},
    {date:'2026-10-01',cells:{A:{value:'2026-10-01'},B:{value:50},C:{value:50},O:{value:50}}},
    {date:'2026-10-03',cells:{A:{value:'2026-10-03'},B:{value:30},C:{value:3},O:{value:7}}},
    {date:'2026-10-04',cells:{A:{value:'2026-10-04'},B:{value:40},C:{value:4},O:{value:8}}},
  ],manualSalesByDate=new Map([['2026-09-29',{pendingConversions:1}],['2026-10-01',{pendingConversions:2}],['2026-10-04',{pendingConversions:1}]]),before=JSON.stringify(rows);
  const s=setup({...empty(),rows,displayRows:rows,manualSalesByDate,pauseConfirmedAt:'2026-09-30',pauseReactivatedAt:'2026-10-03'});
  for(const source of ['manifest','workbook']){
    s.controller.render('Oferta pausada',source,'campaign-id');
    const html=s.get('#productBody').innerHTML;
    assert.match(html,/Campanha pausada na data 30\/09\/2026/);
    assert.match(html,/Estado informado pela MCC/);
    assert.doesNotMatch(html,/01\/10\/2026|50/,'linhas e vendas provisórias no intervalo pausado não aparecem');
    assert.match(html,/2026-10-03|2026-10-04/,'o diário volta a mostrar linhas a partir da reativação');
    assert.equal(s.get('#rowCount').textContent,'4 dias');
    assert.match(s.get('#productCaption').textContent,/intervalo sem registros após a pausa confirmada em 30\/09\/2026; diário retomado em 03\/10\/2026/i);
  }
  const totals=domain.productDiaryTotals(rows,'2026-09-30',manualSalesByDate,'2026-10-03');
  assert.equal(totals.investment,29);assert.equal(totals.clicks,10);assert.equal(totals.conversions,2);
  assert.equal(JSON.stringify(rows),before,'o recorte da view não altera o diário persistido');
});
test('legacy summary stays separate, preserves observed zero/absence and returns cleanly to native diary',()=>{
  const summary={historical_number:1,metrics:{investment_brl:{state:'observed',value:0},clicks:{state:'unknown',value:null},commission_brl:{state:'observed',value:0}},
    profit_brl:{state:'derived',value:0},roi_percent:{state:'unknown',value:null},end_date:null};
  const before=JSON.stringify(summary),s=setup({...empty(),summary});
  s.controller.render('Legado','legacy','legacy-id');
  assert.equal(s.get('#productPanelTitle').textContent,'Resumo histórico legado');
  assert.equal(s.get('#productTableWrap').classList.contains('hidden'),true);
  assert.equal(s.get('#legacySummaryBody').classList.contains('hidden'),false);
  assert.equal((s.get('#legacySummaryBody').innerHTML.match(/class="legacy-summary-item"/g)||[]).length,7);
  assert.match(s.get('#legacySummaryBody').innerHTML,/BRL 0.00/);assert.match(s.get('#legacySummaryBody').innerHTML,/Não registrado/);
  assert.match(s.get('#productSummary').innerHTML,/nenhuma série diária foi criada/);
  assert.equal(JSON.stringify(summary),before);
  s.setSnapshot(empty());s.controller.render('Nativa','manifest','native-id');
  assert.equal(s.get('#productPanelTitle').textContent,'Diário de campanha');assert.equal(s.get('#productTableWrap').classList.contains('hidden'),false);
  assert.equal(s.get('#legacySummaryBody').classList.contains('hidden'),true);assert.equal(s.get('#legacySummaryBody').innerHTML,'');
});
test('diary pure date/sheet helpers retain real rows and deduplicate display-only provisional dates',()=>{
  const serial=Date.parse('2026-09-29T00:00:00Z')/86400000+25569;
  const sheet={rows:[{cells:{A:{value:'Cabeçalho'}}},{cells:{A:{value:serial},F:{value:1}}}]};
  assert.equal(domain.sheetDailyRows(sheet).length,1);assert.equal(domain.productDiaryRowDate(sheet.rows[1]),'2026-09-29');
  assert.equal(domain.productDiaryRowDate({cells:{A:{text:'30/09/2026'}}}),'2026-09-30');
  const adjustments=new Map([['2026-09-30',{pendingConversions:1}],['2026-10-01',{pendingConversions:0}]]);
  const rows=domain.productDiaryRowsWithManualSales(domain.sheetDailyRows(sheet),adjustments);
  assert.equal(rows.length,2);assert.equal(rows[1].cells.F,undefined);assert.equal(sheet.rows.length,2);
  assert.equal(domain.productDiaryRowsWithManualSales(rows,adjustments).length,2);
});
test('campaign diary exposes every manual-sale photograph, including confirmed and later sales, without recalculating them',()=>{
  const photo={roi_percent:-25,investment_brl:200,revenue_brl:150,sale_date:'2026-09-29',sale_time:'10:00',sale_amount_brl:150,registered_at:'2026-09-29T13:00:00Z',metrics_date:'2026-09-29',exchange_rate:5},
    history=[{sequence:1,status:'conciliada',snapshot:photo,valor_brl:150,data:'2026-09-29',hora:'10:00'},{sequence:2,status:'provisoria',snapshot:null,data:'2026-09-30',valor_brl:100},{sequence:3,status:'provisoria',snapshot:{...photo,roi_percent:50},valor_brl:180,data:'2026-10-01'}],before=JSON.stringify(history),s=setup({...empty(),saleHistory:history});
  s.controller.render('Oferta');const html=s.get('#productSalesBody').innerHTML;
  assert.match(html,/<td>1ª<\/td>/);assert.match(html,/<td>3ª<\/td>/);assert.match(html,/class="num negative"[^>]*>-25%/);assert.match(html,/class="num positive"[^>]*>50%/);
  assert.match(html,/Confirmada pela MCC/);assert.match(html,/Sem fotografia histórica de ROI/);assert.match(html,/fotografia original preservada/);
  assert.equal(JSON.stringify(history),before);assert.equal(s.get('#productSaleHistory').classList.contains('hidden'),false);
});

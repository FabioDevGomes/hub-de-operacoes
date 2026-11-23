(function(global){
  function mount({root,getSnapshot,domain,format,actions,preferences,loadColumnPicker=()=>import('../table-columns.mjs?v=1')}){
    const $=selector=>root.querySelector(selector);
    const {esc,num:fmtNum,money:fmtMoney,pct:fmtPct}=format;
    const formatCpaPercent=value=>value==null||value===''||!Number.isFinite(Number(value))?'—':`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(value))}%`;
    const {productColumns,productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,productDiaryRowsThroughDate,productDiaryTableTotals,excelDate}=domain;
    let selection=null,editing=null,searchTermsSnapshotRequest=0,searchTermsSnapshotScopeKey='',searchTermsSnapshotLoadingKey='',campaignEventsShouldShow=false,hasSearchTermsSnapshotHistory=false,hasCampaignCpaAdjustment=false,hasCampaignBudgetAdjustment=false,hasCampaignActionButtons=false,cpaAdjustmentBusy=false,cpaAdjustmentBusyControlKey=null,cpaAdjustmentBusyCampaignKey=null,cpaAdjustmentConfirmedCampaignKey=null,cpaAdjustmentConfirmedControls=new Set(),cpaAdjustmentFeedbackControlKey=null,cpaAdjustmentFeedbackCampaignKey=null,cpaAdjustmentFeedbackState='',cpaAdjustmentFeedbackMessage='',cpaAdjustmentOverride=null,budgetAdjustmentBusy=false,budgetAdjustmentBusyDirection=null,budgetAdjustmentBusyPercentage=null,budgetAdjustmentBusyCampaignKey=null,budgetAdjustmentConfirmedCampaignKey=null,budgetAdjustmentConfirmedActions=new Set(),budgetAdjustmentFeedbackDirection=null,budgetAdjustmentFeedbackPercentage=null,budgetAdjustmentFeedbackCampaignKey=null,budgetAdjustmentFeedbackState='',budgetAdjustmentFeedbackMessage='',budgetAdjustmentOverride=null,budgetAdjustmentConfirmation=null,campaignListBusy=false,campaignListFeedbackKey='',campaignListFeedbackState='',campaignListFeedbackMessage='',captureChartCampaignKey='',captureChartSelectedDate='',campaignKeywordInventoryStates=new Map();
    const tableWrap=$('#productTableWrap');
    root.querySelector('[data-product-open-overview]')?.addEventListener('click',()=>actions.openOverview?.());
    let disposed=false,campaignPresellRequest=0;
    const advanceCache=new Map();
    async function showCampaignAdvance(info){
      const id=String(info?.campaignId||'');
      const target=()=>$('#productAdvanceValue');
      if(info?.mappingStatus!=='mapped'||!/^[1-9]\d{0,19}$/.test(id)){if(target())target().title='Campanha sem identificação Google Ads';return}
      let cached=advanceCache.get(id);
      if(!cached){
        cached={status:'loading'};advanceCache.set(id,cached);
        try{
          const {readTrackingHubToken}=await import('/tracking/tracking-token-storage.mjs?v=3');
          const token=readTrackingHubToken().token;
          if(!token)throw new Error('Configure o token de leitura do Tracking.');
          const end=new Date(),start=new Date(end.getTime()-365*86400000),date=d=>d.toISOString().slice(0,10);
          const response=await fetch('https://track.travenzo.shop/tracking-clicks-report.php',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({start_date:date(start),end_date:date(end),platform:'gurumedia',campaign_advance_id:id})});
          if(!response.ok)throw new Error('Relatório de avanço indisponível.');
          const data=await response.json();
          if(data.ok!==true||data.campaign_id!==id||!Number.isSafeInteger(data.sessions)||!Number.isSafeInteger(data.advanced)||data.sessions<0||data.advanced<0||data.advanced>data.sessions)throw new Error('Resposta de avanço inválida.');
          cached={status:'ok',data};
        }catch(error){cached={status:'error',message:String(error?.message||'Consulta indisponível.')};}
        advanceCache.set(id,cached);
      }
      const element=target();
      if(disposed||!element||element.dataset.campaignId!==id)return;
      if(cached.status==='loading'){element.textContent='…';return}
      if(cached.status==='error'){element.textContent='—';element.title=cached.message;return}
      const {sessions,advanced,start_date,end_date}=cached.data;
      element.textContent=sessions?`${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(100*advanced/sessions)}%`:'—';
      element.title=`${advanced} de ${sessions} sessões identificadas avançaram · ${start_date} a ${end_date} UTC. Cliques repetidos na mesma sessão contam uma vez.`;
    }
    const columnPicker=$('#productColumnPicker'),diaryTable=tableWrap?.querySelector('.product-table'),captureChartDate=$('#productCaptureChartDate'),campaignKeywordInventory=$('#productCampaignKeywordInventory');
    let columnController=null,columnLoading=null;
    // Add the new column to old preferences; write only on an explicit choice.
    const shareChoiceKey='hub:product-diary:search-share-choice:v1';
    const columnPreferences=preferences?{
      getItem(key){
        const stored=preferences.getItem(key);
        if(key==='hub:product-diary:visible-columns:v1'&&!preferences.getItem(shareChoiceKey)){
          try{const keys=JSON.parse(stored);if(Array.isArray(keys)&&!keys.includes('R'))return JSON.stringify([...keys,'R'])}catch{}
        }
        return stored;
      },
      setItem(key,value){preferences.setItem(key,value);preferences.setItem(shareChoiceKey,'1')},
      removeItem(key){preferences.removeItem(key)}
    }:preferences;
    function syncColumnLayout(){
      const empty=$('#productBody td.empty');
      if(empty&&diaryTable?.tHead)empty.colSpan=[...diaryTable.tHead.rows[0].cells].filter(cell=>!cell.hidden).length;
    }
    function applyColumns(){columnController?.apply();syncColumnLayout()}
    function ensureColumnPicker(){
      if(columnController){applyColumns();return}
      if(columnLoading||!columnPicker?.ownerDocument||!diaryTable)return;
      columnLoading=Promise.resolve().then(loadColumnPicker).then(({mountColumnPicker})=>{
        if(disposed)return;
        columnController=mountColumnPicker({picker:columnPicker,table:diaryTable,columns:productColumns,required:['A'],preferences:columnPreferences,preferenceKey:'hub:product-diary:visible-columns:v1'});
        syncColumnLayout();
      }).catch(()=>{if(!disposed)columnPicker.querySelector('[data-column-message]').textContent='Não foi possível carregar o seletor de colunas. Atualize a página para tentar novamente.'}).finally(()=>{columnLoading=null});
    }
    columnPicker?.addEventListener?.('change',syncColumnLayout);
    columnPicker?.addEventListener?.('click',syncColumnLayout);
    captureChartDate?.addEventListener?.('change',()=>{captureChartSelectedDate=captureChartDate.value;if(selection)renderCaptureChart(getSnapshot(...selection))});
    let geographicLoadedKey='',geographicLoadVersion=0;
    function showGeographicReport(report){
      const result=$('#productGeographicTest [data-geographic-result]'),names=report.location_names||{},name=(value,fallback)=>{const id=String(value||'').replace(/^geoTargetConstants\//,'');return id?names[id]||fallback:fallback};
      const total=rows=>rows.reduce((sum,row)=>{const value=Number(row?.metrics?.clicks);if(!Number.isSafeInteger(value)||value<0)throw Error('Resposta sem contagem de cliques válida.');return sum+value},0),baseline=total(report.baseline),detailed=total(report.details);
      const rows=report.details.map(row=>{const seg=row.segments||{},metrics=row.metrics||{},clicks=Number(metrics.clicks),cost=Number(metrics.costMicros)/1000000;if(!Number.isSafeInteger(clicks)||clicks<0||!Number.isFinite(cost)||cost<0)throw Error('Métricas geográficas inválidas.');return {country:name(row.userLocationView?.countryCriterionId,'Não informado'),region:name(seg.geoTargetRegion,'Não informada'),city:name(seg.geoTargetCity,'Não informada'),clicks,cost}}).sort((a,b)=>b.cost-a.cost);
      result.innerHTML=`<p>${esc(report.date_from)} a ${esc(report.date_to)} · País: ${fmtNum(baseline)} cliques · Detalhado: ${fmtNum(detailed)} cliques · ${baseline===detailed?'Totais de cliques coincidem':'Cobertura divergente'} · Salvo na base central.</p><div class="table-wrap"><table><thead><tr><th>País</th><th>Região</th><th>Cidade</th><th>Cliques</th><th>Gasto (moeda da conta)</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.country)}</td><td>${esc(row.region)}</td><td>${esc(row.city)}</td><td>${fmtNum(row.clicks)}</td><td>${esc(row.cost.toFixed(2))}</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma linha com cliques retornada.</td></tr>'}</tbody></table></div>`;
    }
    async function loadGeographicReport(info,key){const version=++geographicLoadVersion,result=$('#productGeographicTest [data-geographic-result]');result.textContent='Carregando dados da base central…';try{const {createGeographicCentralClient}=await import('/product-diary/geographic-central.mjs?v=1'),report=await createGeographicCentralClient().list(info);if(geographicLoadedKey!==key||version!==geographicLoadVersion)return;if(report)showGeographicReport(report);else result.textContent='Nenhuma leitura salva na base central.'}catch(error){if(geographicLoadedKey===key&&version===geographicLoadVersion)result.textContent=String(error?.message||'Não foi possível carregar os dados centrais.')}}
    $('#productGeographicTest')?.addEventListener('click',async event=>{
      const button=event.target.closest?.('[data-geographic-test]');if(!button||!selection)return;
      const snapshot=getSnapshot(...selection),info=snapshot?.googleAdsCampaignAction||{},result=$('#productGeographicTest [data-geographic-result]');
      if(info.mappingStatus!=='mapped'||!/^\d{10}$/.test(String(info.managerCustomerId||''))||!/^\d{10}$/.test(String(info.customerId||''))||!/^[1-9]\d{0,19}$/.test(String(info.campaignId||''))){result.textContent='Campanha sem vínculo confirmado com a conta Google Ads.';return}
      const selected=[...selection],today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const day=new Date(today+'T00:00:00Z'),dateTo=new Date(day.getTime()-86400000).toISOString().slice(0,10),dateFrom=new Date(day.getTime()-14*86400000).toISOString().slice(0,10);
      ++geographicLoadVersion;button.disabled=true;result.textContent='Consultando Google Ads…';
      try{
        const service=await import('/google-ads/google-ads-service.mjs?v=18');
        const report=await service.fetchGoogleAdsGeographicDetailTest({managerCustomerId:String(info.managerCustomerId),customerId:String(info.customerId),campaignId:String(info.campaignId),dateFrom,dateTo});
        if(!selection||!selected.every((value,index)=>value===selection[index]))return;
        const {createGeographicCentralClient}=await import('/product-diary/geographic-central.mjs?v=1');await createGeographicCentralClient().save(info,report);if(selection&&selected.every((value,index)=>value===selection[index]))showGeographicReport(report);
      }catch(error){if(selection&&selected.every((value,index)=>value===selection[index]))result.textContent=String(error?.message||'Não foi possível consultar a localização.');}finally{button.disabled=false}
    });
    campaignKeywordInventory?.addEventListener?.('click',async event=>{
      const button=event.target.closest?.('[data-refresh-campaign-keywords]');
      if(!button||!selection||typeof actions.readCampaignKeywordInventory!=='function')return;
      event.preventDefault();
      const snapshot=getSnapshot(...selection),info=snapshot?.googleAdsCampaignAction||{};
      if(info.mappingStatus!=='mapped'||!/^[0-9]{10}$/.test(String(info.managerCustomerId||''))||!/^[0-9]{10}$/.test(String(info.customerId||''))||!/^[1-9]\d{0,19}$/.test(String(info.campaignId||'')))return;
      const key=[info.managerCustomerId,info.customerId,info.campaignId].join(':'),requestSelection=[...selection],previous=campaignKeywordInventoryStates.get(key)||{};
      if(previous.busy)return;
      campaignKeywordInventoryStates.set(key,{...previous,busy:true,error:'',requestedAtUtc:new Date().toISOString()});
      renderCaptureChart(snapshot);
      try{
        const result=await actions.readCampaignKeywordInventory({managerCustomerId:String(info.managerCustomerId),customerId:String(info.customerId),campaignId:String(info.campaignId)});
        if(result?.verified!==true)throw new Error('O Google Ads não confirmou uma leitura completa das palavras-chave.');
        try{const {createKeywordCentralClient}=await import('/product-diary/keyword-central.mjs?v=1');await createKeywordCentralClient().save(info,result);campaignKeywordInventoryStates.set(key,{...previous,busy:false,result,error:''})}
        catch(error){campaignKeywordInventoryStates.set(key,{...previous,busy:false,result,error:'Leitura obtida, mas não salva na base central: '+String(error?.message||'serviço indisponível.')})}
      }catch(error){campaignKeywordInventoryStates.set(key,{...previous,busy:false,error:String(error?.message||'Não foi possível consultar as palavras-chave no Google Ads.')});}
      if(selection&&requestSelection.every((value,index)=>value===selection[index]))renderCaptureChart(getSnapshot(...selection));
    });
    const dialog=$('#productObservationDialog'),input=$('#productObservationText'),saveButton=$('#productObservationSave'),cancelButton=$('#productObservationCancel'),errorBox=$('#productObservationError');
    function closeEditor(){if(editing?.saving)return;dialog.close();editing=null}
    cancelButton.onclick=closeEditor;
    dialog.oncancel=event=>{if(editing?.saving)event.preventDefault();else editing=null};
    $('#productBody').onclick=event=>{
      const link=event.target.closest?.('[data-edit-observation]');
      if(!link||!selection||typeof actions.saveObservation!=='function')return;
      event.preventDefault();event.stopPropagation();
      const snapshot=getSnapshot(...selection),date=link.dataset.editObservation,campaignId=snapshot.storedCampaignId;
      if(!campaignId)return;
      const row=snapshot.displayRows.find(item=>productDiaryRowDate(item)===date);
      const previous=global.ProductDiaryObservations.observationFor({observacoes_diario:snapshot.observations||[]},campaignId,date);
      editing={campaignId,date,expectedRevision:previous?.revisao||0,selection:[...selection],saving:false};
      input.value=previous?previous.texto:String(row?.cells?.Q?.text??row?.cells?.Q?.value??'');
      errorBox.textContent='';input.disabled=false;saveButton.disabled=false;cancelButton.disabled=false;
      $('#productObservationContext').textContent=snapshot.sheetName+' · '+saleDate(date);
      dialog.showModal();input.focus();
    };
    $('#productCampaignEventsToolbar').addEventListener('click',async event=>{
      const campaignsButton=event.target.closest?.('[data-product-open-campaigns]');
      if(campaignsButton&&selection&&typeof actions.openGoogleAdsCampaignList==='function'){
        event.preventDefault();
        if(campaignListBusy)return;
        const snapshot=getSnapshot(...selection),info=snapshot.googleAdsCampaignAction||{},campaignKey=[info.customerId,info.campaignId].join(':'),requestSelection=[...selection];
        if(info.mappingStatus!=='mapped'||String(info.campaignStatus||'').toUpperCase()!=='ENABLED'||!/^[1-9]\d{0,19}$/.test(String(info.campaignId||''))||!/^\d{10}$/.test(String(info.customerId||''))){campaignListFeedbackKey=campaignKey;campaignListFeedbackState='error';campaignListFeedbackMessage='A lista está disponível para campanhas ativas identificadas na Google Ads API.';renderProduct(...selection);return}
        const sameSelection=()=>Array.isArray(selection)&&selection.every((value,index)=>value===requestSelection[index]);
        campaignListBusy=true;campaignListFeedbackKey=campaignKey;campaignListFeedbackState='busy';campaignListFeedbackMessage='Abrindo a lista de campanhas pela extensão Hub 2.0…';renderProduct(...selection);
        try{
          await actions.openGoogleAdsCampaignList({customerId:String(info.customerId),accountName:String(info.accountName||'')});
          if(!snapshot.storedCampaignId||typeof actions.recordCampaignListOpenedInDiary!=='function')throw new Error('A lista foi aberta, mas o registro desta ação no Diário não está disponível.');
          const recorded=await actions.recordCampaignListOpenedInDiary({campaignId:snapshot.storedCampaignId,occurredAtUtc:new Date().toISOString()});
          if(recorded?.recorded!==true)throw new Error('A lista foi aberta, mas o Diário não confirmou o registro da ação.');
          campaignListFeedbackState='success';campaignListFeedbackMessage='';
        }catch(error){
          campaignListFeedbackState='error';
          campaignListFeedbackMessage=String(error?.message||'Não foi possível abrir a lista da conta no Google Ads.').replace(/\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/g,value=>`••••${value.replace(/\D/g,'').slice(-4)}`);
        }finally{
          campaignListBusy=false;
          if(sameSelection()){
            if(campaignListFeedbackState==='busy'){campaignListFeedbackState='error';campaignListFeedbackMessage='A abertura foi interrompida. Confira o Google Ads antes de tentar novamente.'}
            renderProduct(...selection);
          }
        }
        return;
      }
      const button=event.target.closest?.('[data-product-search-terms]');
      if(!button||!selection||typeof actions.openSearchTerms!=='function')return;
      const snapshot=getSnapshot(...selection),info=snapshot.googleAdsCampaignAction||{};
      if(info.mappingStatus!=='mapped'||!/^\d{10}$/.test(String(info.managerCustomerId||''))||!/^\d{10}$/.test(String(info.customerId||''))||!/^[1-9]\d{0,19}$/.test(String(info.campaignId||''))||!String(info.campaignName||'').trim())return;
      const context={managerCustomerId:String(info.managerCustomerId),customerId:String(info.customerId),campaignId:String(info.campaignId),campaignName:String(info.campaignName).trim(),includeToday:true,autoQuery:false,returnToDiary:{campaignName:String(selection[0]||'').trim(),source:String(selection[1]||''),campaignId:String(snapshot.storedCampaignId||selection[2]||'')}};
      button.disabled=true;
      try{
        if(!snapshot.storedCampaignId||typeof actions.recordSearchTermsAnalysisInDiary!=='function')throw new Error('O registro da análise desta campanha não está disponível.');
        const recorded=await actions.recordSearchTermsAnalysisInDiary({campaignId:snapshot.storedCampaignId,occurredAtUtc:new Date().toISOString()});
        if(recorded?.recorded!==true)throw new Error('O Diário não confirmou o registro da análise.');
      }catch(error){actions.notifySearchTermsAnalysisError?.(error?.message||'Não foi possível registrar a análise no Diário.')}
      try{
        const result=actions.openSearchTerms(context);
        if(result&&typeof result.then==='function')result.catch(()=>{if(button.isConnected)button.disabled=false});
      }catch{button.disabled=false}
    });
    $('#productObservationForm').onsubmit=async event=>{
      event.preventDefault();
      if(!editing||editing.saving)return;
      const current=editing;current.saving=true;
      input.disabled=true;saveButton.disabled=true;cancelButton.disabled=true;errorBox.textContent='';
      try{
        await actions.saveObservation({campaignId:current.campaignId,date:current.date,text:input.value,expectedRevision:current.expectedRevision});
        current.saving=false;closeEditor();renderProduct(...current.selection);
      }catch(error){errorBox.textContent=error.message||'Não foi possível salvar. Tente novamente.'}
      finally{current.saving=false;input.disabled=false;saveButton.disabled=false;cancelButton.disabled=false}
    };
    function formatExcelDate(serial){const d=excelDate(serial);return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(d)}
    function formatProductCell(col,cell){if(col==='R'){if(cell?.estado==='invalido'||cell?.value==null||cell.value==='')return'—';if(typeof cell.value==='number')return Number.isFinite(cell.value)?fmtPct(cell.value*100):'—';return esc(cell.text??cell.value)}if(!cell||cell.value==null||cell.value==='')return'—';if(col==='A')return typeof cell.value==='number'?formatExcelDate(cell.value):esc(cell.text??cell.value);if(['E','G','K','L'].includes(col)){const v=Number(cell.value);return Number.isFinite(v)?fmtPct(Math.abs(v)<=1?v*100:v):''}if(['I','J','O','P'].includes(col)&&typeof cell.value==='number')return fmtNum(cell.value,2);return esc(cell.text??cell.value)}
    function productDiaryZeroClass(col,cell){
      if(!['B','C','D','E','F','G','H','I','J','K','L','R','O','P'].includes(col))return'';
      const value=cell?.value;
      const zero=typeof value==='number'?Number.isFinite(value)&&value===0:typeof value==='string'&&/^[+-]?0+(?:[.,]0+)?\s*%?$/.test(value.trim());
      return zero?' product-zero-value':'';
    }
    function renderTableTotals(rows){
      const totals=productDiaryTableTotals(rows);
      $('#productTotals').innerHTML='<tr class="product-total-row">'+productColumns.map(([col])=>{
        if(col==='A')return'<th scope="row">Totais</th>';
        const included=Object.hasOwn(totals,col),value=included?totals[col]:null;
        const title=included?(col==='F'?'Soma das conversões oficiais disponíveis; vendas manuais provisórias não incluídas.':['I','J'].includes(col)?'Média aritmética dos custos médios observados nas linhas apresentadas; ausências não são tratadas como zero.':'Soma dos valores disponíveis nas linhas apresentadas; ausências não são tratadas como zero.'):'Coluna não somada.';
        const text=value===null?'—':fmtNum(value,['I','J','O','P'].includes(col)?2:Number.isInteger(value)?0:2);
        return`<td class="num${productDiaryZeroClass(col,{value})}" title="${title}">${text}</td>`;
      }).join('')+'</tr>';
    }
    function cpaAdjustmentDiaryNote(event){
      if(event?.tipo!=='google_ads_cpa_adjustment')return'';
      const oldMicros=Number(event.valor_anterior_micros),newMicros=Number(event.valor_novo_micros),commissionCents=Number(event.comissao_total_centavos),currency=String(event.moeda||'').toUpperCase(),domain=global.ProductDiaryCpaAdjustmentDomain;
      if(!domain||!Number.isSafeInteger(oldMicros)||oldMicros<=0||!Number.isSafeInteger(newMicros)||newMicros<=0||!Number.isSafeInteger(commissionCents)||commissionCents<=0||!/^([A-Z]{3})$/.test(currency))return'';
      const denominator=commissionCents*10_000;if(!Number.isSafeInteger(denominator)||denominator<=0)return'';
      const oldPercentage=Number.isFinite(Number(event.percentual_anterior))?Number(event.percentual_anterior):oldMicros/denominator*100,newPercentage=Number.isFinite(Number(event.percentual_novo))?Number(event.percentual_novo):newMicros/denominator*100,step=Number.isSafeInteger(event.passo_pontos_percentuais)&&event.passo_pontos_percentuais>0?event.passo_pontos_percentuais:2,stepLabel=`${event.direcao==='increase'?'+':'-'}${step}%`,timestamp=event.ocorrido_em_utc?`Confirmado em ${saleTimestamp(event.ocorrido_em_utc)} (São Paulo).`:'';
      return`<small class="product-cpa-adjustment-note" title="${esc(timestamp)}">CPA ${esc(domain.currencyAmount(oldMicros/1_000_000,currency))} (${esc(formatCpaPercent(oldPercentage))}) → ${esc(domain.currencyAmount(newMicros/1_000_000,currency))} (${esc(formatCpaPercent(newPercentage))}) ${stepLabel}</small>`;
    }
    function budgetAdjustmentDiaryNote(event){
      if(event?.tipo!=='google_ads_budget_adjustment')return'';
      const oldMicros=Number(event.orcamento_anterior_micros),newMicros=Number(event.orcamento_novo_micros),currency=String(event.moeda||'').toUpperCase(),domain=global.ProductDiaryBudgetAdjustmentDomain;
      if(!domain||!Number.isSafeInteger(oldMicros)||oldMicros<=0||!Number.isSafeInteger(newMicros)||newMicros<=0||!/^([A-Z]{3})$/.test(currency)||!['increase','decrease'].includes(event.direcao))return'';
      const step=Number.isSafeInteger(event.percentual_ajuste)&&event.percentual_ajuste>0?event.percentual_ajuste:5,stepLabel=`${event.direcao==='increase'?'+':'-'}${step}%`,timestamp=event.ocorrido_em_utc?`Confirmado em ${saleTimestamp(event.ocorrido_em_utc)} (São Paulo).`:'';
      return`<small class="product-budget-adjustment-note" title="${esc(timestamp)}">Orçamento diário ${esc(domain.currencyAmount(oldMicros/1_000_000,currency))} → ${esc(domain.currencyAmount(newMicros/1_000_000,currency))} ${stepLabel}</small>`;
    }
    function formatProductDiaryCell(col,row,manualSalesByDate,pauseConfirmedAt,diaryEvents=[]){
      const value=formatProductCell(col,row.cells[col]),count=productDiaryManualSaleCount(row,manualSalesByDate),pauseNote=col==='Q'&&pauseConfirmedAt&&productDiaryRowDate(row)===pauseConfirmedAt?`<small class="product-pause-note">Campanha pausada na data ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}</small>`:'',autoPauseNotes=col==='Q'?diaryEvents.filter(event=>['google_ads_auto_pause','google_ads_auto_pause_observed'].includes(event?.tipo)).map(event=>event?.tipo==='google_ads_auto_pause_observed'?`<span class="product-auto-pause-event-badge is-observed" title="Transição ativa → pausada observada entre snapshots; horário exato e regra não disponíveis.">Pausa relatada · snapshots</span>`:`<span class="product-auto-pause-event-badge" title="Pausa automática confirmada${event.ocorrido_em_utc?` em ${esc(saleTimestamp(event.ocorrido_em_utc))} (São Paulo)`:''}">Pausa automática aplicada</span>`):[],cpaNotes=col==='Q'?diaryEvents.map(cpaAdjustmentDiaryNote).filter(Boolean):[],budgetNotes=col==='Q'?diaryEvents.map(budgetAdjustmentDiaryNote).filter(Boolean):[],analysisNotes=col==='Q'?diaryEvents.filter(event=>event?.tipo==='google_ads_search_terms_analysis'&&event.acao==='review_search_terms').map(event=>`<small class="product-campaign-analysis-note" title="${esc(event.ocorrido_em_utc?`Registrado em ${saleTimestamp(event.ocorrido_em_utc)} (São Paulo)`: 'Registro de análise da campanha')}">Análise da campanha · termos de pesquisa</small>`):[];
      if(col==='F')return count?`<span>${value}</span><small class="product-manual-sale-note">+${count} manual · provisória</small>`:value;
      if(col!=='Q')return value;
      const notes=[];if(value!=='—')notes.push(`<span>${value}</span>`);if(count)notes.push(`<small class="product-manual-sale-note">Venda manual provisória (${count}); aguarda MCC D−1</small>`);if(pauseNote)notes.push(pauseNote);notes.push(...autoPauseNotes,...cpaNotes,...budgetNotes,...analysisNotes);return notes.join('')||'—';
    }
    function saleTimestamp(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(date):'—'}
    function saleDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value).split('-').reverse().join('/'):'—'}
    function renderSearchTermsAccessHistory(scope=null){
      const panel=$('#productSearchTermsAccessHistory'),list=$('#productSearchTermsAccessHistoryList');
      if(!panel||!list)return;
      const validScope=scope&&/^[0-9]{10}$/.test(String(scope.managerCustomerId||''))&&/^[0-9]{10}$/.test(String(scope.customerId||''))&&/^[1-9]\d{0,19}$/.test(String(scope.campaignId||'')),scopeKey=validScope?[scope.managerCustomerId,scope.customerId,scope.campaignId].join(':'):'';
      if(scopeKey!==searchTermsSnapshotScopeKey){searchTermsSnapshotRequest++;searchTermsSnapshotScopeKey=scopeKey;searchTermsSnapshotLoadingKey='';list.replaceChildren();panel.setAttribute('aria-busy','false');hasSearchTermsSnapshotHistory=false;panel.classList.add('hidden');$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons)}
      if(!scopeKey||typeof actions.listSearchTermsQuerySnapshots!=='function'){panel.setAttribute('aria-busy','false');return}
      if(searchTermsSnapshotLoadingKey===scopeKey)return;
      const request=++searchTermsSnapshotRequest;searchTermsSnapshotLoadingKey=scopeKey;panel.setAttribute('aria-busy','true');
      Promise.resolve().then(()=>actions.listSearchTermsQuerySnapshots(scope)).then(history=>{
        if(disposed||request!==searchTermsSnapshotRequest)return;
        searchTermsSnapshotLoadingKey='';
        const entries=Array.isArray(history)?history.slice(0,3):[];
        list.innerHTML=entries.map(item=>{const timestamp=item.completedAtUtc||item.savedAtUtc,when=new Date(timestamp),label=Number.isFinite(when.getTime())?new Intl.DateTimeFormat('pt-BR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Sao_Paulo'}).format(when):'horário indisponível',id=String(item.id||'');return`<li><a href="/?view=google-ads-search-terms&amp;searchTermsSnapshot=${encodeURIComponent(id)}" data-search-terms-snapshot="${esc(id)}" title="Abrir snapshot local desta consulta">${esc(label)}</a></li>`}).join('');
        panel.setAttribute('aria-busy','false');hasSearchTermsSnapshotHistory=entries.length>0;panel.classList.toggle('hidden',!hasSearchTermsSnapshotHistory);$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons);
      }).catch(()=>{if(!disposed&&request===searchTermsSnapshotRequest){searchTermsSnapshotLoadingKey='';panel.setAttribute('aria-busy','false');panel.classList.toggle('hidden',!hasSearchTermsSnapshotHistory);$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons)}})
    }
    $('#productSearchTermsAccessHistoryList')?.addEventListener?.('click',event=>{const link=event.target.closest?.('[data-search-terms-snapshot]');if(!link)return;const id=link.dataset.searchTermsSnapshot;if(!/^gsts-[a-z0-9-]{8,100}$/i.test(id||'')||typeof actions.openSearchTermsSnapshot!=='function')return;event.preventDefault();try{const campaign=selection?getSnapshot(...selection):null,info=campaign?.googleAdsCampaignAction||{},context={managerCustomerId:String(info.managerCustomerId||''),customerId:String(info.customerId||''),campaignId:String(info.campaignId||''),campaignName:String(info.campaignName||''),autoQuery:false,returnToDiary:{campaignName:String(selection?.[0]||''),source:String(selection?.[1]||''),campaignId:String(campaign?.storedCampaignId||selection?.[2]||'')}};const result=actions.openSearchTermsSnapshot(id,context);if(result&&typeof result.catch==='function')result.catch(()=>{})}catch{}});
    function openPauseExceptions(campaignId,campaignName){const dialog=$('#productPauseExceptionsDialog'),options=$('#productPauseExceptionOptions'),api=globalThis.HubAutoPauseRules;if(!dialog||!api||!campaignId)return;const excluded=new Set(api.getExcluded(campaignId));$('#productPauseExceptionsCampaign').textContent=campaignName;$('#productPauseExceptionsError').textContent='';options.innerHTML=api.rules.map(rule=>`<label><input type="checkbox" value="${esc(rule.id)}" ${excluded.has(rule.id)?'':'checked'}><span>${esc(rule.title)}</span></label>`).join('');dialog.dataset.campaignId=String(campaignId);dialog.showModal()}
    $('#productCampaignEventsToolbar').addEventListener('click',event=>{const button=event.target.closest?.('[data-product-pause-exceptions]');if(!button)return;const snapshot=selection&&getSnapshot(...selection);if(snapshot)openPauseExceptions(snapshot.storedCampaignId,snapshot.sheetName)});
    $('#productPauseExceptionsCancel')?.addEventListener('click',()=>$('#productPauseExceptionsDialog').close());
    $('#productPauseExceptionsForm')?.addEventListener('submit',async event=>{event.preventDefault();const dialog=$('#productPauseExceptionsDialog'),id=dialog.dataset.campaignId,saveButton=dialog.querySelector('[type="submit"]');if(saveButton?.disabled)return;try{const excluded=[...$('#productPauseExceptionOptions').querySelectorAll('input:not(:checked)')].map(input=>input.value),snapshot=selection&&getSnapshot(...selection),identity=snapshot?.googleAdsCampaignAction||{};globalThis.HubAutoPauseRules.saveExcluded(id,excluded,identity);if(typeof actions.syncAutoPauseCampaignExceptions==='function'&&identity.mappingStatus==='mapped'){if(saveButton)saveButton.disabled=true;await actions.syncAutoPauseCampaignExceptions({managerCustomerId:identity.managerCustomerId,customerId:identity.customerId,campaignId:identity.campaignId,excludedRules:excluded})}dialog.close();if(selection)renderProduct(...selection)}catch(error){$('#productPauseExceptionsError').textContent=`A exceção foi salva neste Hub, mas não foi sincronizada com o servidor. ${error.message||'Tente salvar novamente.'}`}finally{if(saveButton)saveButton.disabled=false}});
    function pauseRuleLabel(rule,thresholdDays,maxImpressions,thresholdClicks){return rule==='clicks_without_sale'?(Number.isSafeInteger(thresholdClicks)&&thresholdClicks>=0?`Limite de ${fmtNum(thresholdClicks)} cliques sem venda`:'Cliques sem venda'):rule==='negative_remaining'?'Valor restante negativo':rule==='product_performance'?'Desempenho do mesmo produto':rule==='minimum_product_performance'?'Concorrente pausada após a referência atingir os mínimos de impressões e cliques':rule==='reference_competitor'?'Concorrente mais próxima da referência por impressões':rule==='campaign_age'?(Number.isSafeInteger(thresholdDays)&&thresholdDays>0?`Mais de ${fmtNum(thresholdDays)} dias e até ${Number.isSafeInteger(maxImpressions)&&maxImpressions>=0?fmtNum(maxImpressions)+' impressões':'o limite de impressões'}`:'Campanha acima do limite de dias'):rule==='campaign_zero_impressions'?'Dias sem impressões':''}
    function renderCampaignEvents(observations,summary,searchTermsScope=null){const panel=$('#productCampaignEvents'),events=summary?[]:(observations||[]).flatMap(observation=>(observation.eventos||[]).filter(event=>['google_ads_auto_pause','google_ads_auto_pause_observed'].includes(event?.tipo)).map(event=>({...event,data:observation.data}))).sort((a,b)=>String(b.ocorrido_em_utc||b.observado_ate_utc||b.ocorrido_em_data||b.data||'').localeCompare(String(a.ocorrido_em_utc||a.observado_ate_utc||a.ocorrido_em_data||a.data||''))),visible=events.length>0;campaignEventsShouldShow=visible;panel?.classList.toggle('hidden',!visible&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons);$('#productCampaignEventCount')?.replaceChildren?.();if($('#productCampaignEventCount'))$('#productCampaignEventCount').textContent=events.length?`${events.length} ${events.length===1?'evento':'eventos'}`:'';if($('#productCampaignEventList'))$('#productCampaignEventList').innerHTML=events.map(event=>{const observed=event.tipo==='google_ads_auto_pause_observed',timestamp=event.ocorrido_em_utc||event.observado_ate_utc,when=observed?`${saleDate(event.data)} · intervalo ${saleTimestamp(event.observado_de_utc)}–${saleTimestamp(event.observado_ate_utc)} (São Paulo) · horário exato desconhecido`:timestamp?`${saleDate(event.data)} · ${saleTimestamp(timestamp)} (São Paulo)`: `${saleDate(event.ocorrido_em_data||event.data)} · horário não registrado`,rule=pauseRuleLabel(event.regra,event.limite_dias,event.limite_impressoes,event.limite_cliques);return`<li><span><span class="product-auto-pause-event-badge${observed?' is-observed':''}">${observed?'Pausa relatada · snapshots':'Pausa automática aplicada'}</span>${rule?`<small class="product-auto-pause-event-rule">${esc(rule)}</small>`:''}</span><time datetime="${esc(timestamp||event.ocorrido_em_data||'')}">${esc(when)}</time></li>`}).join('');renderSearchTermsAccessHistory(searchTermsScope);return visible}
    function campaignPresellMarkup(urls){if(!Array.isArray(urls))return'';const links=[...new Set(urls.map(value=>{try{const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.pathname==='/'&&!url.search&&!url.hash?url.href:''}catch{return''}}).filter(Boolean))];if(links.length!==1)return'';const url=new URL(links[0]);return`<span>Pré-sell:</span><a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" title="Abrir pré-sell em nova aba">${esc(url.hostname)}</a>`}
    function renderCampaignPresell(identity){const request=++campaignPresellRequest,target=$('#productCampaignPresell');if(target){target.innerHTML='';target.hidden=true}if(!identity||typeof actions.getCampaignPresellUrls!=='function')return;Promise.resolve().then(()=>actions.getCampaignPresellUrls(identity)).then(urls=>{if(disposed||request!==campaignPresellRequest)return;const markup=campaignPresellMarkup(urls);if(target){target.innerHTML=markup;target.hidden=!markup}}).catch(()=>{if(!disposed&&request===campaignPresellRequest&&target){target.innerHTML='';target.hidden=true}})}
    let offerLinkRequest=0;
    function renderOfferLink(snapshot){const request=++offerLinkRequest,link=$('#productOpenOffer'),trends=$('#productOpenTrends');if(!link)return;link.hidden=false;for(const item of [link,trends]){item?.removeAttribute?.('href');item?.setAttribute?.('aria-disabled','true')}Promise.all([import('/product-diary/offer-link.mjs?v=3'),import('/google-ads/campanha-copia-central-start.mjs'),import('/curadoria/trends-domain.mjs')]).then(async ([module,central,trendsDomain])=>{const clients=central.prepareCampaignCentralClients();const [url,source]=await Promise.all([module.campaignOfferUrl(snapshot,async()=>{const storage=await import('/curadoria/clickbank-top-offers/clickbank-top-offers-storage.mjs');return storage.getAll()},clients),module.campaignOfferSource(snapshot,clients)]);return {url,source,trendsDomain}}).then(({url,source,trendsDomain})=>{if(disposed||request!==offerLinkRequest)return;if(url){link.href=url;link.removeAttribute('aria-disabled')}const term=String(source?.productName||source?.offerName||'').trim();if(trends&&term&&!/^Oferta (Guru\s*Media|ClickBank)$/i.test(term)){trends.href=trendsDomain.exploreUrl(term);trends.removeAttribute('aria-disabled')}}).catch(()=>{})}
    function renderCampaignActions({sheetName,storedCampaignId,hasSearchTermsAction,canOpenCampaigns,campaignListButtonBusy,showCampaignListFeedback}){
      const panel=$('#productCampaignActions');if(!panel)return;
      hasCampaignActionButtons=Boolean(storedCampaignId||hasSearchTermsAction||canOpenCampaigns||showCampaignListFeedback);
      panel.innerHTML=hasCampaignActionButtons?`${hasSearchTermsAction?`<button class="btn primary" type="button" data-product-search-terms aria-label="Avaliar termos de pesquisa de ${esc(sheetName)}">Avaliar termos de pesquisa</button>`:''}${canOpenCampaigns?`<button class="btn" type="button" data-product-open-campaigns aria-label="Abrir lista de campanhas da conta no Google Ads" ${campaignListButtonBusy?'disabled':''}>${campaignListButtonBusy?'Abrindo lista…':'Abrir campanhas no Google Ads'}</button>`:''}${storedCampaignId?`<button class="btn" type="button" data-product-pause-exceptions>Exceções de pausa automática</button>`:''}${showCampaignListFeedback?`<small class="product-campaign-action-status is-${esc(campaignListFeedbackState)}" role="status">${esc(campaignListFeedbackMessage)}</small>`:''}`:'';
      panel.classList.toggle('hidden',!hasCampaignActionButtons);
      $('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons);
    }
    function cpaAdjustmentCampaignKey(actionInfo,storedCampaignId){return[ String(actionInfo?.managerCustomerId||''),String(actionInfo?.customerId||''),String(actionInfo?.campaignId||''),String(storedCampaignId||'') ].join(':')}
    function cpaAdjustmentControlKey(direction,step){return`${direction}-${step}`}
    function renderCpaAdjustmentStatus(panel,direction,step,campaignKey){
      const controlKey=cpaAdjustmentControlKey(direction,step),status=panel.querySelector(`[data-product-cpa-status="${direction}"][data-product-cpa-step="${step}"]`);
      if(!status)return;
      status.hidden=true;status.className='product-campaign-cpa-adjustment-status';status.replaceChildren();
      status.removeAttribute('role');status.removeAttribute('aria-label');status.removeAttribute('title');
      const feedbackMatches=cpaAdjustmentFeedbackControlKey===controlKey&&cpaAdjustmentFeedbackCampaignKey===campaignKey;
      if(cpaAdjustmentBusyControlKey===controlKey&&cpaAdjustmentBusyCampaignKey===campaignKey){
        status.hidden=false;status.classList.add('google-ads-creation-status-spinner');status.setAttribute('role','status');status.setAttribute('aria-label','Aplicando e confirmando o ajuste de CPA no Google Ads.');status.title='Aplicando e confirmando o ajuste de CPA no Google Ads.';return;
      }
      if(feedbackMatches&&cpaAdjustmentFeedbackState==='error'){
        status.hidden=false;status.classList.add('is-error');status.textContent='!';status.setAttribute('role','status');status.setAttribute('aria-label',cpaAdjustmentFeedbackMessage);status.title=cpaAdjustmentFeedbackMessage;return;
      }
      if(cpaAdjustmentConfirmedCampaignKey===campaignKey&&cpaAdjustmentConfirmedControls.has(controlKey)){
        status.hidden=false;status.classList.add('is-confirmed');status.innerHTML='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.8"></rect><path d="m5.5 10.2 3 3 6-6.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
        const label=feedbackMatches&&cpaAdjustmentFeedbackState==='warning'?`CPA confirmado no Google Ads, mas houve falha ao registrar no Diário: ${cpaAdjustmentFeedbackMessage}`:'Ajuste de CPA confirmado no Google Ads.';
        status.setAttribute('role','status');status.setAttribute('aria-label',label);status.title=label;return;
      }
      if(feedbackMatches&&cpaAdjustmentFeedbackMessage){status.hidden=false;status.classList.add('is-error');status.textContent='!';status.setAttribute('role','status');status.setAttribute('aria-label',cpaAdjustmentFeedbackMessage);status.title=cpaAdjustmentFeedbackMessage}
    }
    function renderBudgetAdjustmentStatus(panel,direction,percentage,campaignKey){
      const status=panel.querySelector(`[data-product-budget-status="${direction}"][data-product-budget-percent="${percentage}"]`);
      if(!status)return;
      status.hidden=true;status.className='product-campaign-budget-adjustment-status';status.replaceChildren();status.removeAttribute('role');status.removeAttribute('aria-label');status.removeAttribute('title');
      const feedbackMatches=budgetAdjustmentFeedbackDirection===direction&&budgetAdjustmentFeedbackPercentage===percentage&&budgetAdjustmentFeedbackCampaignKey===campaignKey;
      if(budgetAdjustmentBusyDirection===direction&&budgetAdjustmentBusyPercentage===percentage&&budgetAdjustmentBusyCampaignKey===campaignKey){status.hidden=false;status.classList.add('google-ads-creation-status-spinner');status.setAttribute('role','status');status.setAttribute('aria-label',`Aplicando e confirmando o ajuste de ${percentage}% do orçamento diário no Google Ads.`);status.title=`Aplicando e confirmando o ajuste de ${percentage}% do orçamento diário no Google Ads.`;return}
      if(feedbackMatches&&budgetAdjustmentFeedbackState==='error'){status.hidden=false;status.classList.add('is-error');status.textContent='!';status.setAttribute('role','status');status.setAttribute('aria-label',budgetAdjustmentFeedbackMessage);status.title=budgetAdjustmentFeedbackMessage;return}
      if(budgetAdjustmentConfirmedCampaignKey===campaignKey&&budgetAdjustmentConfirmedActions.has(`${direction}:${percentage}`)){status.hidden=false;status.classList.add('is-confirmed');status.innerHTML='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.8"></rect><path d="m5.5 10.2 3 3 6-6.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';const label=feedbackMatches&&budgetAdjustmentFeedbackState==='warning'?`Orçamento confirmado no Google Ads, mas houve falha ao registrar no Diário: ${budgetAdjustmentFeedbackMessage}`:`Ajuste de ${percentage}% do orçamento diário confirmado no Google Ads.`;status.setAttribute('role','status');status.title=label;status.setAttribute('aria-label',label);return}
      if(feedbackMatches&&budgetAdjustmentFeedbackMessage){status.hidden=false;status.classList.add('is-error');status.textContent='!';status.setAttribute('role','status');status.setAttribute('aria-label',budgetAdjustmentFeedbackMessage);status.title=budgetAdjustmentFeedbackMessage}
    }
    function effectiveBudgetAdjustment(input,campaignId){
      return input&&budgetAdjustmentOverride?.campaignId===String(campaignId||'')
        &&String(input.budgetAmountMicros)===budgetAdjustmentOverride.sourceBudgetAmountMicros
        &&String(input.budgetResource)===budgetAdjustmentOverride.sourceBudgetResource
        ?{...input,budgetAmountMicros:budgetAdjustmentOverride.budgetAmountMicros,budgetResource:budgetAdjustmentOverride.budgetResource}:input;
    }
    function renderCampaignBudgetAdjustment(input,actionInfo,storedCampaignId=null){
      const panel=$('#productCampaignBudgetAdjustment'),domain=global.ProductDiaryBudgetAdjustmentDomain,campaignId=String(actionInfo?.campaignId||''),customerId=String(actionInfo?.customerId||'');
      if(!panel)return;
      const adjustment=effectiveBudgetAdjustment(input,campaignId);
      const resource=String(adjustment?.budgetResource||'');
      const resourcePattern=customerId?new RegExp(`^customers/${customerId}/campaignBudgets/[1-9]\\d{0,19}$`):null;
      const eligible=Boolean(domain&&typeof actions.adjustDailyBudget==='function'&&adjustment&&actionInfo?.mappingStatus==='mapped'&&/^\d{10}$/.test(String(actionInfo.managerCustomerId||''))&&/^\d{10}$/.test(customerId)&&/^[1-9]\d{0,19}$/.test(campaignId)&&['ENABLED','PAUSED'].includes(String(adjustment.campaignStatus||''))&&adjustment.budgetPeriod==='DAILY'&&adjustment.budgetShared===false&&resourcePattern?.test(resource)&&resourcePattern.test(String(adjustment.budgetResource||'')));
      if(!eligible){hasCampaignBudgetAdjustment=false;panel.hidden=true;panel.classList.add('hidden');$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons);return}
      const increase=domain.createPreview(adjustment,'increase'),decrease=domain.createPreview(adjustment,'decrease');
      if(!increase&&!decrease){hasCampaignBudgetAdjustment=false;panel.hidden=true;panel.classList.add('hidden');$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignCpaAdjustment&&!hasCampaignBudgetAdjustment&&!hasCampaignActionButtons);return}
      hasCampaignBudgetAdjustment=true;campaignEventsShouldShow=true;$('#productCampaignEvents')?.classList.remove('hidden');panel.hidden=false;panel.classList.remove('hidden');
      const campaignKey=cpaAdjustmentCampaignKey(actionInfo,storedCampaignId),reference=increase||decrease;
      const summary=$('#productCampaignBudgetAdjustmentSummary');
      if(summary)summary.textContent=`Média atual ${domain.currencyAmount(reference.currentAmount,reference.currencyCode)}/dia`;
      const confirmationCurrent=Boolean(budgetAdjustmentConfirmation?.campaignKey===campaignKey&&budgetAdjustmentConfirmation.budgetAmountMicros===String(adjustment.budgetAmountMicros)&&budgetAdjustmentConfirmation.budgetResource===String(adjustment.budgetResource));
      const confirmationNotice=panel.querySelector('[data-product-budget-confirmation]');
      const confirmationDirectionLabel=budgetAdjustmentConfirmation?.direction==='increase'?'+':'−';
      if(confirmationNotice){confirmationNotice.hidden=!(confirmationCurrent&&budgetAdjustmentConfirmation);confirmationNotice.textContent=confirmationCurrent&&budgetAdjustmentConfirmation?`O orçamento mudou no Google Ads; este clique não fez alterações. Valor atual: ${domain.currencyAmount(reference.currentAmount,reference.currencyCode)}/dia. Confira a prévia e clique em “Confirmar ${confirmationDirectionLabel}${budgetAdjustmentConfirmation.percentage}%” para aplicar.`:''}
      for(const percentage of [10,5])for(const[direction]of[['increase'],['decrease']]){const button=panel.querySelector(`[data-product-budget-adjust="${direction}"][data-product-budget-percent="${percentage}"]`),preview=domain.createPreview(adjustment,direction,percentage),confirmationMatches=confirmationCurrent&&budgetAdjustmentConfirmation?.direction===direction&&budgetAdjustmentConfirmation?.percentage===percentage;if(button){button.disabled=budgetAdjustmentBusy||!preview;button.textContent=confirmationMatches?`Confirmar ${direction==='increase'?'+':'−'}${percentage}%`:`Orçamento ${direction==='increase'?'+':'−'}${percentage}%`}renderBudgetAdjustmentStatus(panel,direction,percentage,campaignKey)}
    }
    function renderCampaignCpaAdjustment(input,actionInfo,storedCampaignId=null){
      const panel=$('#productCampaignCpaAdjustment');
      if(!panel)return;
      const domain=global.ProductDiaryCpaAdjustmentDomain;
      const campaignId=String(actionInfo?.campaignId||'');
      const adjustment=input&&cpaAdjustmentOverride?.campaignId===campaignId&&String(input.targetCpaMicros)===cpaAdjustmentOverride.sourceTargetCpaMicros?{...input,targetCpaMicros:cpaAdjustmentOverride.targetCpaMicros}:input;
      const eligible=Boolean(domain&&typeof actions.adjustTargetCpa==='function'&&adjustment&&actionInfo?.mappingStatus==='mapped'
        &&/^\d{10}$/.test(String(actionInfo.managerCustomerId||''))&&/^\d{10}$/.test(String(actionInfo.customerId||''))
        &&/^[1-9]\d{0,19}$/.test(campaignId)&&adjustment.channelType==='SEARCH'
        &&['ENABLED','PAUSED'].includes(String(adjustment.campaignStatus||''))
        &&['TARGET_CPA','MAXIMIZE_CONVERSIONS'].includes(String(adjustment.biddingStrategyType||''))
        &&!String(adjustment.biddingStrategyResource||'').trim());
      if(!eligible){hasCampaignCpaAdjustment=false;panel.hidden=true;panel.classList.add('hidden');$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignActionButtons);return}
      const previews=domain.supportedStepPercentages.map(step=>({step,increase:domain.createPreview(adjustment,'increase',step),decrease:domain.createPreview(adjustment,'decrease',step)}));
      if(!previews.some(item=>item.increase||item.decrease)){hasCampaignCpaAdjustment=false;panel.hidden=true;panel.classList.add('hidden');$('#productCampaignEvents')?.classList.toggle('hidden',!campaignEventsShouldShow&&!hasSearchTermsSnapshotHistory&&!hasCampaignActionButtons);return}
      hasCampaignCpaAdjustment=true;campaignEventsShouldShow=true;$('#productCampaignEvents')?.classList.remove('hidden');
      panel.hidden=false;panel.classList.remove('hidden');
      const summary=$('#productCampaignCpaAdjustmentSummary'),campaignKey=cpaAdjustmentCampaignKey(actionInfo,storedCampaignId);
      const reference=previews.find(item=>item.step===2)?.increase||previews.find(item=>item.step===2)?.decrease||previews[0]?.increase||previews[0]?.decrease;
      if(summary)summary.textContent=`CPA atual ${domain.currencyAmount(reference.currentTargetCpa,reference.currencyCode)} (${formatCpaPercent(reference.currentPercentage)})`;
      for(const{step,increase,decrease}of previews)for(const[direction,preview]of[['increase',increase],['decrease',decrease]]){
        const button=panel.querySelector(`[data-product-cpa-adjust="${direction}"][data-product-cpa-step="${step}"]`);
        if(button)button.disabled=cpaAdjustmentBusy||!preview;
        renderCpaAdjustmentStatus(panel,direction,step,campaignKey);
      }
    }
    $('#productCampaignCpaAdjustment')?.addEventListener?.('click',async event=>{
      const button=event.target.closest?.('[data-product-cpa-adjust]');
      if(!button||!selection||cpaAdjustmentBusy||typeof actions.adjustTargetCpa!=='function')return;
      const snapshot=getSnapshot(...selection),adjustment=snapshot.cpaAdjustment,actionInfo=snapshot.googleAdsCampaignAction||{},direction=button.dataset.productCpaAdjust,step=Number(button.dataset.productCpaStep||2),controlKey=cpaAdjustmentControlKey(direction,step),campaignKey=cpaAdjustmentCampaignKey(actionInfo,snapshot.storedCampaignId);
      const requestSelection=[...selection],isSameSelection=()=>Array.isArray(selection)&&selection.every((value,index)=>value===requestSelection[index]);
      if(!snapshot.storedCampaignId||typeof actions.recordCpaAdjustmentInDiary!=='function'){cpaAdjustmentFeedbackControlKey=controlKey;cpaAdjustmentFeedbackCampaignKey=campaignKey;cpaAdjustmentFeedbackState='error';cpaAdjustmentFeedbackMessage='Ajuste bloqueado: não foi possível garantir que a alteração confirmada será registrada nas Observações desta campanha.';renderCampaignCpaAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);return}
      const preview=global.ProductDiaryCpaAdjustmentDomain?.createPreview(adjustment,direction,step);
      if(!preview){cpaAdjustmentFeedbackControlKey=controlKey;cpaAdjustmentFeedbackCampaignKey=campaignKey;cpaAdjustmentFeedbackState='error';cpaAdjustmentFeedbackMessage='Não foi possível calcular um ajuste válido com a configuração e comissão atuais.';renderCampaignCpaAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);return}
      if(cpaAdjustmentFeedbackCampaignKey===campaignKey&&cpaAdjustmentFeedbackControlKey===controlKey){cpaAdjustmentFeedbackState='';cpaAdjustmentFeedbackMessage=''}
      const requestId=global.crypto?.randomUUID?.()||'cpa-'+Date.now()+'-'+Math.random().toString(36).slice(2),campaignAnalysisStatus={campaignId:snapshot.storedCampaignId,requestId,action:direction,stepPercentagePoints:step};
      cpaAdjustmentBusy=true;cpaAdjustmentBusyControlKey=controlKey;cpaAdjustmentBusyCampaignKey=campaignKey;renderCampaignCpaAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);
      try{actions.publishCampaignAnalysisPending?.({...campaignAnalysisStatus,startedAtUtc:new Date().toISOString()})}catch{}
      try{
        const result=await actions.adjustTargetCpa({managerCustomerId:actionInfo.managerCustomerId,customerId:actionInfo.customerId,campaignId:actionInfo.campaignId,
          expectedTargetCpaMicros:String(adjustment.targetCpaMicros),expectedCurrencyCode:adjustment.currencyCode,commissionCents:preview.commissionCents,
          commissionCurrency:preview.commissionCurrency,commissionTargetCents:preview.commissionTargetCents,exchangeRate:preview.exchangeRate,direction,stepPercentagePoints:step});
        if(result?.verified!==true||String(result.targetCpaMicros)!==String(preview.targetCpaMicros)||(result.stepPercentagePoints!=null&&Number(result.stepPercentagePoints)!==step)||(step!==2&&Number(result.stepPercentagePoints)!==step))throw new Error('A API não confirmou o CPA previsto para este passo. Confira a campanha no Google Ads antes de repetir.');
        const sameSelection=isSameSelection(),hasApiTimestamp=typeof result.verifiedAtUtc==='string'&&Number.isFinite(Date.parse(result.verifiedAtUtc)),verifiedAtUtc=hasApiTimestamp?new Date(result.verifiedAtUtc).toISOString():new Date().toISOString();
        if(sameSelection){
          cpaAdjustmentOverride={campaignId:String(actionInfo.campaignId),sourceTargetCpaMicros:String(adjustment.targetCpaMicros),targetCpaMicros:String(result.targetCpaMicros)};
          if(cpaAdjustmentConfirmedCampaignKey!==campaignKey){cpaAdjustmentConfirmedCampaignKey=campaignKey;cpaAdjustmentConfirmedControls=new Set()}
          cpaAdjustmentConfirmedControls.add(controlKey);cpaAdjustmentBusyControlKey=null;cpaAdjustmentFeedbackControlKey=null;cpaAdjustmentFeedbackCampaignKey=null;cpaAdjustmentFeedbackState='';cpaAdjustmentFeedbackMessage='';renderCampaignCpaAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);
        }
        try{
          if(typeof actions.recordCpaAdjustmentInDiary!=='function')throw new Error('O registro do ajuste no Diário não está disponível nesta tela.');
          const recorded=await actions.recordCpaAdjustmentInDiary({campaignId:snapshot.storedCampaignId,verifiedAtUtc,direction,previousTargetCpaMicros:result.previousTargetCpaMicros,targetCpaMicros:result.targetCpaMicros,commissionTargetCents:preview.commissionTargetCents,currencyCode:adjustment.currencyCode,stepPercentagePoints:preview.stepPercentagePoints,timeSource:hasApiTimestamp?'google_ads_api':'hub_confirmation',requestId});
          if(recorded?.recorded!==true)throw new Error('A API confirmou o CPA, mas não confirmou o registro correspondente no Diário.');
          if(sameSelection){cpaAdjustmentFeedbackControlKey=null;cpaAdjustmentFeedbackCampaignKey=null;cpaAdjustmentFeedbackState='';cpaAdjustmentFeedbackMessage='';renderProduct(...selection)}
        }catch(error){const message='O CPA foi confirmado no Google Ads, mas a análise não foi salva no Diário: '+(error?.message||'erro de gravação');try{actions.publishCampaignAnalysisFailure?.({...campaignAnalysisStatus,message})}catch{}if(sameSelection){cpaAdjustmentFeedbackControlKey=controlKey;cpaAdjustmentFeedbackCampaignKey=campaignKey;cpaAdjustmentFeedbackState='warning';cpaAdjustmentFeedbackMessage=message;renderCampaignCpaAdjustment(adjustment,actionInfo,snapshot.storedCampaignId)}}
      }catch(error){const message=error?.message||'Não foi possível ajustar o CPA. Confira o Google Ads antes de repetir.';try{actions.publishCampaignAnalysisFailure?.({...campaignAnalysisStatus,message})}catch{}if(isSameSelection()){cpaAdjustmentFeedbackControlKey=controlKey;cpaAdjustmentFeedbackCampaignKey=campaignKey;cpaAdjustmentFeedbackState='error';cpaAdjustmentFeedbackMessage=message}}
      finally{cpaAdjustmentBusy=false;cpaAdjustmentBusyControlKey=null;cpaAdjustmentBusyCampaignKey=null;if(selection){const current=getSnapshot(...selection);renderCampaignCpaAdjustment(current.cpaAdjustment,current.googleAdsCampaignAction||{},current.storedCampaignId)}}
    });
    $('#productCampaignBudgetAdjustment')?.addEventListener?.('click',async event=>{
      const button=event.target.closest?.('[data-product-budget-adjust]');
      if(!button||!selection||budgetAdjustmentBusy||typeof actions.adjustDailyBudget!=='function')return;
      const percentage=Number(button.dataset.productBudgetPercent),snapshot=getSnapshot(...selection),sourceAdjustment=snapshot.budgetAdjustment,actionInfo=snapshot.googleAdsCampaignAction||{},direction=button.dataset.productBudgetAdjust,campaignKey=cpaAdjustmentCampaignKey(actionInfo,snapshot.storedCampaignId),adjustment=effectiveBudgetAdjustment(sourceAdjustment,actionInfo.campaignId),requestSelection=[...selection],isSameSelection=()=>Array.isArray(selection)&&selection.every((value,index)=>value===requestSelection[index]);
      if(![5,10].includes(percentage)||!snapshot.storedCampaignId||typeof actions.recordBudgetAdjustmentInDiary!=='function'){budgetAdjustmentFeedbackDirection=direction;budgetAdjustmentFeedbackPercentage=percentage;budgetAdjustmentFeedbackCampaignKey=campaignKey;budgetAdjustmentFeedbackState='error';budgetAdjustmentFeedbackMessage='Ajuste bloqueado: não foi possível validar o percentual ou garantir o registro no Diário.';renderCampaignBudgetAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);return}
      const preview=global.ProductDiaryBudgetAdjustmentDomain?.createPreview(adjustment,direction,percentage);
      if(!preview){budgetAdjustmentFeedbackDirection=direction;budgetAdjustmentFeedbackPercentage=percentage;budgetAdjustmentFeedbackCampaignKey=campaignKey;budgetAdjustmentFeedbackState='error';budgetAdjustmentFeedbackMessage='Não foi possível calcular um orçamento diário válido com os dados atuais.';renderCampaignBudgetAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);return}
      if(budgetAdjustmentFeedbackCampaignKey===campaignKey&&budgetAdjustmentFeedbackDirection===direction&&budgetAdjustmentFeedbackPercentage===percentage){budgetAdjustmentFeedbackState='';budgetAdjustmentFeedbackMessage=''}
      const requestId=global.crypto?.randomUUID?.()||'budget-'+Date.now()+'-'+Math.random().toString(36).slice(2),campaignAnalysisStatus={campaignId:snapshot.storedCampaignId,requestId,action:direction,percentage,kind:'budget'};budgetAdjustmentBusy=true;budgetAdjustmentBusyDirection=direction;budgetAdjustmentBusyPercentage=percentage;budgetAdjustmentBusyCampaignKey=campaignKey;renderCampaignBudgetAdjustment(adjustment,actionInfo,snapshot.storedCampaignId);try{actions.publishCampaignAnalysisPending?.({...campaignAnalysisStatus,startedAtUtc:new Date().toISOString()})}catch{}
      try{
        const result=await actions.adjustDailyBudget({managerCustomerId:actionInfo.managerCustomerId,customerId:actionInfo.customerId,campaignId:actionInfo.campaignId,expectedBudgetAmountMicros:String(adjustment.budgetAmountMicros),expectedBudgetResource:String(adjustment.budgetResource),expectedCurrencyCode:adjustment.currencyCode,direction,percentage});
        if(result?.confirmationRequired===true){
          const currentAmount=String(result.currentBudgetAmountMicros),currentResource=String(result.currentBudgetResource);
          if(isSameSelection()){
            budgetAdjustmentOverride={campaignId:String(actionInfo.campaignId),sourceBudgetAmountMicros:String(sourceAdjustment.budgetAmountMicros),sourceBudgetResource:String(sourceAdjustment.budgetResource),budgetAmountMicros:currentAmount,budgetResource:currentResource};
            budgetAdjustmentConfirmation={campaignKey,direction,percentage,budgetAmountMicros:currentAmount,budgetResource:currentResource};
            budgetAdjustmentFeedbackDirection=null;budgetAdjustmentFeedbackPercentage=null;budgetAdjustmentFeedbackCampaignKey=null;budgetAdjustmentFeedbackState='';budgetAdjustmentFeedbackMessage='';
            try{actions.publishCampaignAnalysisSettled?.(campaignAnalysisStatus)}catch{}
            renderCampaignBudgetAdjustment(sourceAdjustment,actionInfo,snapshot.storedCampaignId);
          }
          return;
        }
        if(result?.verified!==true||Number(result.percentage??5)!==percentage||String(result.budgetAmountMicros)!==String(preview.targetBudgetMicros))throw new Error('A API não confirmou o percentual e o orçamento previstos. Atualize os dados da campanha antes de repetir.');
        const sameSelection=isSameSelection(),hasApiTimestamp=typeof result.verifiedAtUtc==='string'&&Number.isFinite(Date.parse(result.verifiedAtUtc)),verifiedAtUtc=hasApiTimestamp?new Date(result.verifiedAtUtc).toISOString():new Date().toISOString();
        if(sameSelection){budgetAdjustmentOverride={campaignId:String(actionInfo.campaignId),sourceBudgetAmountMicros:String(sourceAdjustment.budgetAmountMicros),sourceBudgetResource:String(sourceAdjustment.budgetResource),budgetAmountMicros:String(result.budgetAmountMicros),budgetResource:String(result.budgetResource)};budgetAdjustmentConfirmation=null;if(budgetAdjustmentConfirmedCampaignKey!==campaignKey){budgetAdjustmentConfirmedCampaignKey=campaignKey;budgetAdjustmentConfirmedActions=new Set()}budgetAdjustmentConfirmedActions.add(`${direction}:${percentage}`);budgetAdjustmentBusyDirection=null;budgetAdjustmentBusyPercentage=null;budgetAdjustmentFeedbackDirection=null;budgetAdjustmentFeedbackPercentage=null;budgetAdjustmentFeedbackCampaignKey=null;budgetAdjustmentFeedbackState='';budgetAdjustmentFeedbackMessage='';renderCampaignBudgetAdjustment(sourceAdjustment,actionInfo,snapshot.storedCampaignId)}
        try{const recorded=await actions.recordBudgetAdjustmentInDiary({campaignId:snapshot.storedCampaignId,verifiedAtUtc,direction,previousBudgetAmountMicros:result.previousBudgetAmountMicros,budgetAmountMicros:result.budgetAmountMicros,currencyCode:adjustment.currencyCode,percentage,requestId});if(recorded?.recorded!==true)throw new Error('A API confirmou o orçamento, mas não confirmou o registro correspondente no Diário.');if(sameSelection){budgetAdjustmentFeedbackDirection=null;budgetAdjustmentFeedbackPercentage=null;budgetAdjustmentFeedbackCampaignKey=null;budgetAdjustmentFeedbackState='';budgetAdjustmentFeedbackMessage='';renderProduct(...selection)}}
        catch(error){const message='O orçamento foi confirmado no Google Ads, mas a alteração não foi salva no Diário: '+(error?.message||'erro de gravação');try{actions.publishCampaignAnalysisFailure?.({...campaignAnalysisStatus,message})}catch{}if(sameSelection){budgetAdjustmentFeedbackDirection=direction;budgetAdjustmentFeedbackPercentage=percentage;budgetAdjustmentFeedbackCampaignKey=campaignKey;budgetAdjustmentFeedbackState='warning';budgetAdjustmentFeedbackMessage=message;renderCampaignBudgetAdjustment(adjustment,actionInfo,snapshot.storedCampaignId)}}
      }catch(error){const message=error?.message||'Não foi possível ajustar o orçamento. Confira o Google Ads antes de repetir.';try{actions.publishCampaignAnalysisFailure?.({...campaignAnalysisStatus,message})}catch{}if(isSameSelection()){budgetAdjustmentFeedbackDirection=direction;budgetAdjustmentFeedbackPercentage=percentage;budgetAdjustmentFeedbackCampaignKey=campaignKey;budgetAdjustmentFeedbackState='error';budgetAdjustmentFeedbackMessage=message}}
      finally{budgetAdjustmentBusy=false;budgetAdjustmentBusyDirection=null;budgetAdjustmentBusyPercentage=null;budgetAdjustmentBusyCampaignKey=null;if(selection){const current=getSnapshot(...selection);renderCampaignBudgetAdjustment(current.budgetAdjustment,current.googleAdsCampaignAction||{},current.storedCampaignId)}}
    });
    function renderSales(sales){
      $('#productSalesBody').innerHTML=sales.length?sales.map(sale=>{
        const snapshot=sale.snapshot,roi=snapshot?.roi_percent,edited=snapshot&&(snapshot.sale_amount_brl!==sale.valor_brl||snapshot.sale_date!==sale.data||snapshot.sale_time!==sale.hora),
          note=snapshot?snapshot.unavailable_reason||'ROI preservado no lançamento':'Sem fotografia histórica de ROI',
          status=sale.status==='conciliada'?'Confirmada pela MCC':'Manual · provisória',
          title=snapshot?`${note}. Taxa operacional USD/BRL: ${snapshot.exchange_rate==null?'não disponível':fmtNum(snapshot.exchange_rate,4)}.`:note;
        return `<tr><td>${sale.sequence}ª</td><td>${esc(saleDate(snapshot?.sale_date||sale.data))}${snapshot?.sale_time||sale.hora?' '+esc(snapshot?.sale_time||sale.hora):''}</td><td class="num">${fmtMoney(snapshot?.sale_amount_brl??sale.valor_brl)}</td><td class="num">${fmtMoney(snapshot?.investment_brl??null)}</td><td class="num">${fmtMoney(snapshot?.revenue_brl??null)}</td><td class="num ${roi==null?'':roi<0?'negative':roi>0?'positive':''}" title="${esc(title)}">${roi==null?'—':fmtPct(roi)}<small>${esc(note)}</small></td><td>${esc(saleTimestamp(snapshot?.registered_at||sale.registrada_em))}</td><td>${esc(snapshot?.metrics_date?saleDate(snapshot.metrics_date):'Sem referência MCC')}<small>${esc(status)}</small>${edited?'<small>Lançamento editado; fotografia original preservada.</small>':''}</td></tr>`;
      }).join(''):'<tr><td colspan="8" class="empty">Nenhuma venda manual registrada nesta campanha.</td></tr>';
    }
    function captureChartDateLabel(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return String(date||'');return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`))}
    function captureChartTimestampLabel(point){const date=new Date(point.completedAtUtc);if(!Number.isFinite(date.getTime()))return'Horário indisponível';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:point.timeZone}).format(date)}catch{return'Horário indisponível'}}
    function captureChartClock(point){const date=new Date(point.completedAtUtc);if(!Number.isFinite(date.getTime()))return'—';try{return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:point.timeZone}).format(date)}catch{return'—'}}
    function captureChartMinutes(point){const date=new Date(point.completedAtUtc);if(!Number.isFinite(date.getTime()))return 0;try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:point.timeZone}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value])),hour=Number(parts.hour),minute=Number(parts.minute);return Number.isInteger(hour)&&Number.isInteger(minute)?hour*60+minute:0}catch{return 0}}
    function captureChartDateInZone(timestamp,timeZone){const date=new Date(timestamp);if(!Number.isFinite(date.getTime()))return'';try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return parts.year&&parts.month&&parts.day?`${parts.year}-${parts.month}-${parts.day}`:''}catch{return''}}
    function captureChartConversions(sales,date,timeZone){const byMinute=new Map();for(const sale of sales||[]){if(sale?.status==='cancelada')continue;const timestamp=String(sale?.registrada_em||sale?.snapshot?.registered_at||'');if(!timestamp||captureChartDateInZone(timestamp,timeZone)!==date)continue;const event={completedAtUtc:timestamp,timeZone},minute=captureChartMinutes(event);byMinute.set(minute,(byMinute.get(minute)||0)+1)}let total=0;const points=[{chartMinute:0,cumulativeConversions:0,conversionDelta:0,registrationLabel:'00:00'}];for(const[chartMinute,conversionDelta]of [...byMinute].sort((a,b)=>a[0]-b[0])){total+=conversionDelta;const hour=Math.floor(chartMinute/60),minute=chartMinute%60;points.push({chartMinute,cumulativeConversions:total,conversionDelta,registrationLabel:`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`})}return points}
    function captureChartConversionsAtMinute(conversions,minute){return conversions.reduce((latest,point)=>point.chartMinute<=minute?point.cumulativeConversions:latest,0)}
    function captureChartIntervals(points){let previous=null;return points.map(point=>{const intervalClicks=previous?(point.clicks>=previous.clicks?point.clicks-previous.clicks:null):point.clicks,intervalImpressions=previous?(point.impressions>=previous.impressions?point.impressions-previous.impressions:null):point.impressions,result={...point,intervalClicks,intervalImpressions,cumulativeClicks:point.clicks,cumulativeImpressions:point.impressions,intervalStart:previous?captureChartClock(previous):'00:00',intervalEnd:captureChartClock(point),clicksDecreased:Boolean(previous&&point.clicks<previous.clicks),impressionsDecreased:Boolean(previous&&point.impressions<previous.impressions)};previous=point;return result})}
    function captureChartSvg(points,conversions){
      const width=980,height=132,left=112,right=108,top=8.8,bottom=17.6,plotWidth=width-left-right,plotHeight=height-top-bottom,minuteMax=23*60,clickValues=points.map(point=>point.intervalClicks).filter(Number.isFinite),impressionValues=points.map(point=>point.intervalImpressions).filter(Number.isFinite),conversionValues=conversions.map(point=>point.cumulativeConversions).filter(Number.isFinite),clicksMax=Math.max(1,...clickValues),impressionsMax=Math.max(1,...impressionValues),conversionsMax=Math.max(1,...conversionValues),number=value=>Number.isFinite(value)?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Math.round(value)):'—',x=point=>left+(Math.min(minuteMax,point.chartMinute??captureChartMinutes(point))/minuteMax)*plotWidth,y=(value,max)=>top+plotHeight-(value/max)*plotHeight;
      const line=(rows,key,max)=>{let penDown=false;return rows.map(point=>{const value=point[key];if(!Number.isFinite(value)){penDown=false;return''}const command=`${penDown?'L':'M'} ${x(point).toFixed(2)} ${y(value,max).toFixed(2)}`;penDown=true;return command}).filter(Boolean).join(' ')},pointGroups=(key,max,className,label)=>points.map(point=>{if(!Number.isFinite(point[key]))return'';const intervalValue=number(point[key]),cumulativeValue=number(label==='Cliques Google'?point.cumulativeClicks:point.cumulativeImpressions),decreased=label==='Cliques Google'?point.clicksDecreased:point.impressionsDecreased,deltaNote=decreased?'Total acumulado menor que na captura anterior; variação indisponível.':'',accessibleLabel=`${captureChartTimestampLabel(point)} · Intervalo ${point.intervalStart}–${point.intervalEnd} · ${label} ${intervalValue} · acumulado ${cumulativeValue}${deltaNote?` · ${deltaNote}`:''}`,cx=x(point).toFixed(2),cy=y(point[key],max).toFixed(2);return`<g class="product-capture-chart-point" tabindex="0" role="img" aria-label="${esc(accessibleLabel)}"><title>${esc(accessibleLabel)}</title><circle class="${className}" cx="${cx}" cy="${cy}" r="4.5"></circle></g>`}).join(''),conversionMarkers=conversions.filter(point=>point.conversionDelta>0).map(point=>{const label=`Registrada no Hub às ${point.registrationLabel} (${point.conversionDelta} conversão(ões); ${point.cumulativeConversions} no dia)`,cx=x(point).toFixed(2),cy=y(point.cumulativeConversions,conversionsMax).toFixed(2);return`<g class="product-capture-chart-point" tabindex="0" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle class="product-capture-chart-point-conversions" cx="${cx}" cy="${cy}" r="4.5"></circle></g>`}).join('');
      const grid=Array.from({length:5},(_,index)=>{const fraction=index/4,gridY=top+fraction*plotHeight,clicks=number(clicksMax*(1-fraction)),impressions=number(impressionsMax*(1-fraction)),conversionCount=number(conversionsMax*(1-fraction)),previousFraction=(index-1)/4,previousClicks=index?number(clicksMax*(1-previousFraction)):null,previousImpressions=index?number(impressionsMax*(1-previousFraction)):null,previousConversions=index?number(conversionsMax*(1-previousFraction)):null;return`<g><line class="product-capture-chart-grid" x1="${left}" x2="${width-right}" y1="${gridY}" y2="${gridY}"></line><text class="product-capture-chart-axis" x="${left-10}" y="${gridY+4}" text-anchor="end">${clicks===previousClicks?'':clicks}</text><text class="product-capture-chart-axis product-capture-chart-axis-conversions" x="${left-54}" y="${gridY+4}" text-anchor="end">${conversionCount===previousConversions?'':conversionCount}</text><text class="product-capture-chart-axis" x="${width-right+10}" y="${gridY+4}" text-anchor="start">${impressions===previousImpressions?'':impressions}</text></g>`}).join(''),hourLabels=[0,6,12,18,23].map(hour=>`<text class="product-capture-chart-axis" x="${left+(hour*60/minuteMax)*plotWidth}" y="${height-16}" text-anchor="${hour===0?'start':hour===23?'end':'middle'}">${String(hour).padStart(2,'0')}</text>`).join('');
      return`<svg class="product-capture-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="productCaptureChartSvgTitle productCaptureChartSvgDesc"><title id="productCaptureChartSvgTitle">Cliques Google, impressões e conversões registradas no Hub</title><desc id="productCaptureChartSvgDesc">Cliques Google em azul no eixo esquerdo, conversões registradas no Hub em verde no segundo eixo esquerdo e impressões em vermelho no eixo direito. Os horários usam o fuso da conta.</desc>${grid}<text class="product-capture-chart-axis-title conversions" x="16" y="${top+plotHeight/2}" text-anchor="middle" transform="rotate(-90 16 ${top+plotHeight/2})">Conversões Hub</text><text class="product-capture-chart-axis-title clicks" x="36" y="${top+plotHeight/2}" text-anchor="middle" transform="rotate(-90 36 ${top+plotHeight/2})">Cliques Google</text><text class="product-capture-chart-axis-title impressions" x="${width-14}" y="${top+plotHeight/2}" text-anchor="middle" transform="rotate(90 ${width-14} ${top+plotHeight/2})">Impressões</text><path class="product-capture-chart-line-clicks" d="${line(points,'intervalClicks',clicksMax)}"></path><path class="product-capture-chart-line-impressions" d="${line(points,'intervalImpressions',impressionsMax)}"></path><path class="product-capture-chart-line-conversions" d="${line(conversions,'cumulativeConversions',conversionsMax)}"></path>${pointGroups('intervalClicks',clicksMax,'product-capture-chart-point-clicks','Cliques Google')}${pointGroups('intervalImpressions',impressionsMax,'product-capture-chart-point-impressions','Impressões')}${conversionMarkers}${hourLabels}</svg>`;
    }
    function keywordRowsForCampaign(snapshot,negative){
      const action=snapshot?.googleAdsCampaignAction||{};
      const digits=value=>String(value||'').replace(/\D/g,'');
      const customerId=digits(action.customerId),campaignId=String(action.campaignId||''),managerId=digits(action.managerCustomerId),kind=negative?'negative':'positive',rows=[];
      const add=(term,matchType,source,atUtc,timeSource='verified')=>{const value=String(term||'').trim();if(!value)return;const explicitMatch=/^\[.+\]$/.test(value)?'EXACT':/^".+"$/.test(value)?'PHRASE':String(matchType||'').toUpperCase();rows.push({term:value,matchType:explicitMatch,source,atUtc:String(atUtc||''),timeSource})};
      const centralState=campaignKeywordInventoryStates.get([action.managerCustomerId,action.customerId,action.campaignId].join(':'))||{};
      for(const batch of [...(Array.isArray(snapshot.campaignBatches)?snapshot.campaignBatches:[]),...(centralState.centralBatches||[])]){
        const campaign=(batch?.campaigns||[]).find(item=>digits(item.customerId)===customerId&&String(item.campaignId||'')===campaignId&&(!managerId||digits(item.managerCustomerId)===managerId));if(!campaign)continue;
        const initialValue=batch?.formSnapshot?.[negative?'negative_keywords':'keywords'],initialTerms=Array.isArray(initialValue)?initialValue:typeof initialValue==='string'?[initialValue]:[];
        const createdInHub=campaign.source==='created'||(!campaign.source&&batch.creationMode==='api');
        if(createdInHub)for(const value of initialTerms)for(const line of String(value||'').split(/\r?\n/)){const text=line.trim();if(text)add(text,batch.formSnapshot?.[negative?'negative_keyword_match_type':'keyword_match_type'],'Envio inicial',campaign.geoTargetingSnapshot?.recordedAtUtc||batch.createdAt,campaign.geoTargetingSnapshot?.recordedAtUtc?'campaign':'batch')}
        const outcome=batch?.[negative?'negativeKeywordsBatch':'positiveKeywordsBatch']?.result;
        if(outcome?.status&&Array.isArray(outcome.results))for(const item of outcome.results){if(digits(item.customerId)===customerId&&String(item.campaignId||'')===campaignId&&item.result==='created_verified')add(item.term,item.matchType,'Adicionada depois · lote',outcome.verifiedAtUtc)}
      }
      for(const event of (snapshot?.observations||[]).flatMap(item=>item.eventos||[]))if(event?.tipo==='google_ads_campaign_keyword_added'&&event.kind===kind)add(event.term,event.match_type,event.source==='search_terms'?'Termos de pesquisa':event.source==='search_terms_observed'?'Verificada em termos de pesquisa':'Adicionada depois',event.ocorrido_em_utc,event.source==='search_terms_observed'?'observed':'verified');
      const seen=new Set();return rows.filter(row=>{const key=[row.term.toLocaleLowerCase(),row.matchType,row.source,row.timeSource==='observed'?'':row.atUtc].join('|');if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>String(b.atUtc).localeCompare(String(a.atUtc))||a.term.localeCompare(b.term));
    }
    function keywordTimeLabel(value){const date=new Date(value);if(!value||!Number.isFinite(date.getTime()))return'—';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/Sao_Paulo'}).format(date).replace(', ',' · ')}catch{return'—'}}
    function renderKeywordTable(title,rows,kind,readAtUtc=''){const body=rows.length?rows.map(row=>{const validTime=Boolean((row.atUtc||readAtUtc)&&Number.isFinite(Date.parse(row.atUtc||readAtUtc))),timePrefix=readAtUtc&&row.source.startsWith('Google Ads ·')?'Última leitura confirmada no Google Ads':row.timeSource==='observed'?'Horário da verificação no Google Ads':row.timeSource==='campaign'?'Horário da confirmação da criação no Hub':row.timeSource==='batch'?'Horário de início do lote salvo no Hub':'Registrado em',titleText=validTime?`${timePrefix} ${new Date(row.atUtc||readAtUtc).toISOString()}`:'Horário não registrado',matchType=row.matchType?({BROAD:'Ampla',PHRASE:'Frase',EXACT:'Exata'}[row.matchType]||row.matchType):'—';return`<tr><td class="product-keyword-term">${esc(row.term)}</td><td>${esc(matchType)}</td><td>${esc(row.source)}</td><td title="${esc(titleText)}">${esc(keywordTimeLabel(row.atUtc||readAtUtc))}</td></tr>`}).join(''):'<tr><td class="empty" colspan="4">Nenhum registro local disponível.</td></tr>';return`<section class="product-campaign-keyword-group is-${kind}"><h4>${title}<span>${fmtNum(rows.length)}</span></h4><div class="product-campaign-keyword-table-wrap"><table><thead><tr><th>Palavra-chave</th><th>Correspondência</th><th>Origem / status</th><th>Data · hora</th></tr></thead><tbody>${body}</tbody></table></div></section>`}
    function mergeConfirmedKeywords(items,readAtUtc,localRows){
      const rows=items.map(item=>({term:item.term,matchType:item.matchType,source:'Google Ads · '+(item.scope==='CAMPAIGN'?'Campanha':'Grupo '+item.adGroupId)+' · '+(item.status==='ENABLED'?'Ativa':item.status==='PAUSED'?'Pausada':item.status),atUtc:readAtUtc}));
      const key=row=>[String(row.term||'').trim().replace(/\s+/g,' ').toLocaleLowerCase(),String(row.matchType||'').toUpperCase()].join('|');
      const seen=new Set(rows.map(key)),readTime=Date.parse(readAtUtc);
      for(const row of localRows){const time=Date.parse(row.atUtc),id=key(row);if(row.source==='Termos de pesquisa'&&Number.isFinite(time)&&time>readTime&&!seen.has(id)){rows.push(row);seen.add(id)}}
      return rows;
    }
    function renderCampaignKeywordInventory(snapshot){const container=$('#productCampaignKeywordInventory');if(!container)return;const info=snapshot?.googleAdsCampaignAction||{},mapped=info.mappingStatus==='mapped'&&/^[0-9]{10}$/.test(String(info.managerCustomerId||''))&&/^[0-9]{10}$/.test(String(info.customerId||''))&&/^[1-9]\d{0,19}$/.test(String(info.campaignId||'')),key=mapped?[info.managerCustomerId,info.customerId,info.campaignId].join(':'):'',state=key?campaignKeywordInventoryStates.get(key)||{}:{},result=state.result,positive=result?result.positiveKeywords.map(item=>({term:item.term,matchType:item.matchType,source:`Google Ads · ${item.scope==='CAMPAIGN'?'Campanha':'Grupo '+item.adGroupId} · ${item.status==='ENABLED'?'Ativa':item.status==='PAUSED'?'Pausada':item.status}`})):keywordRowsForCampaign(snapshot,false),negative=result?mergeConfirmedKeywords(result.negativeKeywords,result.readAtUtc,keywordRowsForCampaign(snapshot,true)):keywordRowsForCampaign(snapshot,true),status=state.busy?'Consultando palavras-chave atuais da campanha no Google Ads…':state.error?state.error:result?`Leitura confirmada ${keywordTimeLabel(result.readAtUtc)} · ${result.campaign.status==='ENABLED'?'Campanha ativa':'Campanha pausada'}`:'Mostra o registro local; consultar o Google Ads exibe a configuração atual completa.';container.innerHTML=`<header class="product-campaign-keyword-header"><div><h3>Palavras-chave da campanha</h3><p class="product-campaign-keyword-status${state.error?' is-error':''}" role="status" aria-live="polite">${esc(status)}</p></div><button type="button" class="product-campaign-keyword-refresh" data-refresh-campaign-keywords ${!mapped||typeof actions.readCampaignKeywordInventory!=='function'||state.busy?'disabled':''} aria-label="Atualizar palavras-chave positivas e negativas da campanha no Google Ads">${state.busy?'Consultando…':'Atualizar no Google Ads'}</button></header>${renderKeywordTable('Palavras-chave positivas',positive,'positive',result?.readAtUtc)}${renderKeywordTable('Palavras-chave negativas',negative,'negative',result?.readAtUtc)}`}
    function renderCaptureChart(snapshot){
      const analysis=$('#productCaptureAnalysis'),inventory=$('#productCampaignKeywordInventory'),content=$('#productCaptureChartContent'),select=captureChartDate;if(!analysis||!inventory||!content||!select)return;
      const internalId=String(snapshot?.storedCampaignId||'').trim(),campaignKey=internalId&&!snapshot?.summary&&snapshot?.source!=='legacy'?internalId:'';
      const geoInfo=snapshot?.googleAdsCampaignAction||{},geoKey=geoInfo.mappingStatus==='mapped'?[geoInfo.managerCustomerId,geoInfo.customerId,geoInfo.campaignId].join(':'):'';if(geoKey!==geographicLoadedKey){geographicLoadedKey=geoKey;if(geoKey)void loadGeographicReport(geoInfo,geoKey);else {const el=$('#productGeographicTest [data-geographic-result]');if(el)el.textContent='Campanha sem vínculo confirmado com Google Ads.'}}
      if(campaignKey!==captureChartCampaignKey){captureChartCampaignKey=campaignKey;captureChartSelectedDate=''}
      if(!campaignKey){analysis.classList.add('hidden');content.innerHTML='';inventory.innerHTML='';select.innerHTML='';return}
      const action=snapshot.googleAdsCampaignAction||{},mapped=action.mappingStatus==='mapped',series=domain.productDiaryD0CaptureSeries(snapshot.apiCaptureSnapshots,{campaignInternalId:internalId,managerCustomerId:mapped?action.managerCustomerId:'',customerId:mapped?action.customerId:'',campaignId:mapped?action.campaignId:'',now:new Date()}),saleHistory=(snapshot.saleHistory||[]).filter(sale=>sale?.status!=='cancelada'),saleDates=saleHistory.map(sale=>String(sale?.registrada_em||sale?.snapshot?.registered_at||'')).filter(Boolean).map(timestamp=>captureChartDateInZone(timestamp,series.timeZone)).filter(Boolean),availableDates=[series.today,...new Set([...series.dates,...saleDates].filter(date=>date!==series.today))].sort((a,b)=>a===series.today?-1:b===series.today?1:b.localeCompare(a)),selectedDate=availableDates.includes(captureChartSelectedDate)?captureChartSelectedDate:series.today;
      renderCampaignKeywordInventory(snapshot);
      captureChartSelectedDate=selectedDate;analysis.classList.remove('hidden');select.disabled=availableDates.length<2;select.innerHTML=availableDates.map(date=>`<option value="${esc(date)}">${date===series.today?`Hoje · ${captureChartDateLabel(date)}`:captureChartDateLabel(date)}</option>`).join('');select.value=selectedDate;
      $('#productCaptureChartNote').textContent=`Cliques e impressões mostram variações entre capturas D0; conversões mostram o horário em que cada registro ativo foi salvo pelo Hub. Horários no fuso da conta (${series.timeZone}${series.timeZoneKnown?'':' · referência local São Paulo até haver captura da conta'}).`;
      const points=series.points.filter(point=>point.date===selectedDate),intervals=captureChartIntervals(points),conversionPoints=captureChartConversions(saleHistory,selectedDate,series.timeZone),latest=intervals.at(-1),deltaCell=(point,key,decreased)=>{const value=point[key];return value==null?`<span title="${decreased?'O total acumulado diminuiu desde a captura anterior; não foi calculada uma variação negativa.':'Variação indisponível.'}">—</span>`:fmtNum(value)},rows=intervals.map(point=>`<tr><td>${esc(`${point.intervalStart}–${point.intervalEnd}`)}<small>${esc(captureChartTimestampLabel(point))}</small></td><td>${deltaCell(point,'intervalClicks',point.clicksDecreased)}</td><td>${deltaCell(point,'intervalImpressions',point.impressionsDecreased)}</td><td>${fmtNum(point.cumulativeClicks)}</td><td>${fmtNum(point.cumulativeImpressions)}</td><td>${fmtNum(captureChartConversionsAtMinute(conversionPoints,captureChartMinutes(point)))}</td></tr>`).join(''),conversionRows=conversionPoints.filter(point=>point.conversionDelta>0).map(point=>`<tr><td>${esc(point.registrationLabel)}</td><td>${fmtNum(point.conversionDelta)}</td><td>${fmtNum(point.cumulativeConversions)}</td></tr>`).join('');
      if(!points.length&&!conversionRows){const emptyMessage=selectedDate===series.today?'Nenhuma captura D0 nem registro de conversão do Hub nesta data.':'Nenhuma captura D0 nem registro de conversão do Hub nesta data.';content.innerHTML=`<p class="product-capture-chart-empty">${emptyMessage} Valores ausentes não são convertidos em zero.</p>`;return}
      content.innerHTML=`<div class="product-capture-chart-stats" aria-label="Totais do dia selecionado"><div class="clicks"><span>Cliques</span><strong>${latest?fmtNum(latest.cumulativeClicks):'—'}</strong></div><div class="impressions"><span>Impressões</span><strong>${latest?fmtNum(latest.cumulativeImpressions):'—'}</strong></div><div class="conversions"><span>Conversões registradas no Hub</span><strong>${fmtNum(conversionPoints.at(-1)?.cumulativeConversions||0)}</strong></div></div><div class="product-capture-chart-legend" aria-hidden="true"><span><i class="clicks"></i>Cliques Google</span><span><i class="impressions"></i>Impressões</span><span><i class="conversions"></i>Conversões Hub</span></div>${captureChartSvg(intervals,conversionPoints)}${points.length?`<details class="product-capture-chart-values"><summary>Valores de cada captura (${fmtNum(points.length)})</summary><div class="product-capture-chart-values-wrap"><table aria-label="Variações e totais de impressões, cliques e conversões por snapshot D0"><thead><tr><th>Intervalo · ${esc(series.timeZone)}</th><th>Cliques</th><th>Impressões</th><th>Cliques acumulados</th><th>Impressões acumuladas</th><th>Conversões Hub acumuladas</th></tr></thead><tbody>${rows}</tbody></table></div></details>`:''}${conversionRows?`<details class="product-capture-chart-values"><summary>Registros de conversão do Hub (${fmtNum(conversionPoints.at(-1).cumulativeConversions)})</summary><div class="product-capture-chart-values-wrap"><table aria-label="Horários dos registros de conversão salvos pelo Hub"><thead><tr><th>Horário · ${esc(series.timeZone)}</th><th>Registros</th><th>Acumulado no dia</th></tr></thead><tbody>${conversionRows}</tbody></table></div></details>`:''}`;
    }
    function renderProduct(name,source='manifest',campaignId=null){
      const nextSelection=[name,source,campaignId];
      if(selection&&selection.some((value,index)=>value!==nextSelection[index])){closeEditor();cpaAdjustmentOverride=null;cpaAdjustmentConfirmedCampaignKey=null;cpaAdjustmentConfirmedControls=new Set();cpaAdjustmentFeedbackControlKey=null;cpaAdjustmentFeedbackCampaignKey=null;cpaAdjustmentFeedbackState='';cpaAdjustmentFeedbackMessage='';hasCampaignCpaAdjustment=false;budgetAdjustmentOverride=null;budgetAdjustmentConfirmation=null;budgetAdjustmentConfirmedCampaignKey=null;budgetAdjustmentConfirmedActions=new Set();budgetAdjustmentFeedbackDirection=null;budgetAdjustmentFeedbackPercentage=null;budgetAdjustmentFeedbackCampaignKey=null;budgetAdjustmentFeedbackState='';budgetAdjustmentFeedbackMessage='';hasCampaignBudgetAdjustment=false}
      selection=nextSelection;
      const snapshot=getSnapshot(name,source,campaignId),{sheetName,rows,displayRows,manualSalesByDate,summary,investment,clicks,conversions,pauseConfirmedAt,pauseReactivatedAt=null,saleHistory=[],storedCampaignId=null,googleAdsCampaignAction=null,observations=[],presellIdentity=null,cpaAdjustment=null,budgetAdjustment=null}=snapshot;
      renderCaptureChart(snapshot);
      const inventoryInfo=snapshot?.googleAdsCampaignAction||{},inventoryKey=[inventoryInfo.managerCustomerId,inventoryInfo.customerId,inventoryInfo.campaignId].join(':');
      if(inventoryInfo.mappingStatus==='mapped'&&!campaignKeywordInventoryStates.has(inventoryKey)){
        const selected=[...selection];campaignKeywordInventoryStates.set(inventoryKey,{loading:true});
        Promise.all([import('/product-diary/keyword-central.mjs?v=1'),import('/google-ads/campanha-copia-central-start.mjs')]).then(async ([module,central])=>{
          const [result,copies]=await Promise.all([module.createKeywordCentralClient().list(inventoryInfo),central.prepareCampaignCentralClients().snapshotClient.list()]);
          const batches=[];for(const copy of copies.snapshots){const data=copy?.data||{},values=data.draft?.values;if(!values||!Array.isArray(data.createdCampaigns))continue;const campaigns=data.createdCampaigns.filter(item=>String(item.managerCustomerId)===String(inventoryInfo.managerCustomerId)&&String(item.customerId)===String(inventoryInfo.customerId)&&String(item.campaignId)===String(inventoryInfo.campaignId));if(campaigns.length)batches.push({creationMode:'api',createdAt:copy.savedAt,campaigns:campaigns.map(item=>({...item,source:'created'})),formSnapshot:{keywords:values.keywords,negative_keywords:values.negative_keywords}})}
          const state=campaignKeywordInventoryStates.get(inventoryKey);if(state?.loading)campaignKeywordInventoryStates.set(inventoryKey,{result,centralBatches:batches});
        }).catch(error=>{const state=campaignKeywordInventoryStates.get(inventoryKey);if(state?.loading)campaignKeywordInventoryStates.set(inventoryKey,{error:'Não foi possível carregar as palavras-chave da base central: '+String(error?.message||'serviço indisponível.')})}).finally(()=>{if(selection&&selected.every((value,index)=>value===selection[index]))renderCaptureChart(getSnapshot(...selection))});
      }
      const cpaCampaignKey=cpaAdjustmentCampaignKey(googleAdsCampaignAction,storedCampaignId);
      if(cpaAdjustmentConfirmedCampaignKey!==cpaCampaignKey){cpaAdjustmentConfirmedCampaignKey=cpaCampaignKey;cpaAdjustmentConfirmedControls=new Set()}
      if(budgetAdjustmentConfirmedCampaignKey!==cpaCampaignKey){budgetAdjustmentConfirmedCampaignKey=cpaCampaignKey;budgetAdjustmentConfirmedActions=new Set()}
      for(const event of (observations||[]).flatMap(observation=>observation.eventos||[])){if(event?.tipo==='google_ads_cpa_adjustment'&&['increase','decrease'].includes(event.direcao))cpaAdjustmentConfirmedControls.add(cpaAdjustmentControlKey(event.direcao,[2,4].includes(event.passo_pontos_percentuais)?event.passo_pontos_percentuais:2));if(event?.tipo==='google_ads_budget_adjustment'&&['increase','decrease'].includes(event.direcao)){const percentage=event.percentual_ajuste==null?5:event.percentual_ajuste;if([5,10].includes(percentage))budgetAdjustmentConfirmedActions.add(`${event.direcao}:${percentage}`)}}
      const actionInfo=summary?{}:googleAdsCampaignAction||{},hasSearchTermsAction=actionInfo.mappingStatus==='mapped'&&/^\d{10}$/.test(String(actionInfo.managerCustomerId||''))&&/^\d{10}$/.test(String(actionInfo.customerId||''))&&/^[1-9]\d{0,19}$/.test(String(actionInfo.campaignId||''))&&Boolean(String(actionInfo.campaignName||'').trim()),campaignListKey=[actionInfo.customerId,actionInfo.campaignId].join(':'),canOpenCampaigns=hasSearchTermsAction&&String(actionInfo.campaignStatus||'').toUpperCase()==='ENABLED'&&typeof actions.openGoogleAdsCampaignList==='function',showCampaignListFeedback=campaignListFeedbackKey===campaignListKey&&Boolean(campaignListFeedbackMessage),campaignListButtonBusy=campaignListBusy&&campaignListFeedbackKey===campaignListKey;
      renderCampaignActions({sheetName,storedCampaignId,hasSearchTermsAction,canOpenCampaigns,campaignListButtonBusy,showCampaignListFeedback});
      renderOfferLink(snapshot);
      const searchTermsScope=googleAdsCampaignAction?.mappingStatus==='mapped'?{managerCustomerId:String(googleAdsCampaignAction.managerCustomerId||'').replace(/\D/g,''),customerId:String(googleAdsCampaignAction.customerId||'').replace(/\D/g,''),campaignId:String(googleAdsCampaignAction.campaignId||'')}:null;renderCampaignEvents(observations,summary,searchTermsScope);renderCampaignPresell(presellIdentity);
      renderCampaignCpaAdjustment(cpaAdjustment,googleAdsCampaignAction,storedCampaignId);
      renderCampaignBudgetAdjustment(budgetAdjustment,googleAdsCampaignAction,storedCampaignId);
      $('#productSaleHistory').classList.toggle('hidden',!!summary);
      renderSales(summary?[]:saleHistory);
      const boundedRows=pauseConfirmedAt?productDiaryRowsThroughDate(displayRows,pauseConfirmedAt,pauseReactivatedAt):displayRows,provisionalSaleDates=new Set(manualSalesByDate.keys()),diaryRows=productDiaryRowsThroughDate(productDiaryRowsWithManualSales(boundedRows,manualSalesByDate),pauseConfirmedAt,pauseReactivatedAt);
      if(summary){
        $('#productSummary').classList.add('has-campaign-title');
        columnPicker.classList.add('hidden');columnPicker.open=false;
        $('#productTotals').innerHTML='';
        const metrics=summary.metrics||{},shown=(value,formatter)=>value&&(value.state==='observed'||value.state==='derived')?formatter(value.value):'Não registrado',account=summary.account_legacy||'Não registrada',endDate=summary.end_date?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'UTC'}).format(new Date(`${summary.end_date}T00:00:00Z`)):'Não informada';
        actions.setTitle(sheetName,'Histórico legado consolidado');
        $('#productPanelTitle').textContent='Resumo histórico legado';
        $('#productSummary').innerHTML=`<div class="card product-name"><div class="eyebrow">Histórico legado consolidado</div><h2>${esc(sheetName)}</h2><p>Valores preservados da aba Totais; nenhuma série diária foi criada.</p></div><div class="card metric-mini"><span>Número histórico</span><strong>${fmtNum(summary.historical_number)}</strong></div><div class="card metric-mini"><span>Investimento total</span><strong>${shown(metrics.investment_brl,fmtMoney)}</strong></div><div class="card metric-mini"><span>Lucro derivado</span><strong>${shown(summary.profit_brl,fmtMoney)}</strong></div>`;
        $('#productTableWrap').classList.add('hidden');
        $('#legacySummaryBody').classList.remove('hidden');
        $('#legacySummaryBody').innerHTML=[
          ['Conta histórica',account,summary.account_suffix?`ID original preservado; sufixo associado: ${summary.account_suffix}.`:'Preservada sem associação a uma conta MCC.'],
          ['Data de encerramento',endDate,'Data ausente permanece desconhecida.'],
          ['Cliques Google',shown(metrics.clicks,fmtNum),'Zero e ausência continuam distintos.'],
          ['Comissão recebida',shown(metrics.commission_brl,fmtMoney),'Valor legado; não somado às conversões MCC.'],
          ['Lucro derivado',shown(summary.profit_brl,fmtMoney),'Disponível somente com investimento e comissão observados.'],
          ['ROI derivado',shown(summary.roi_percent,fmtPct),'Disponível somente com comissão observada e investimento maior que zero.'],
          ['Origem','Histórico legado','Migração única da aba Totais.'],
        ].map(([label,value,note])=>`<div class="legacy-summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
        $('#productCaption').textContent='Resumo consolidado; não representa registros diários nem altera dados operacionais nativos.';
        $('#rowCount').textContent='1 resumo';
        $('#productFooterNote').textContent='Os valores legados permanecem separados do Diário nativo, das métricas MCC e das vendas manuais provisórias.';
      }else{
        const financeTotals=productDiaryTableTotals(boundedRows),profit=investment==null||financeTotals.P==null?null:Math.round((financeTotals.P-investment)*100)/100,roi=profit==null||investment<=0?null:profit/investment*100;
        $('#productSummary').classList.remove('has-campaign-title');
        columnPicker.classList.remove('hidden');
        actions.setTitle(sheetName,source==='workbook'?'Aba histórica da base local':'');
        $('#productPanelTitle').textContent='Diário de campanha';
        $('#productTableWrap').classList.remove('hidden');
        $('#legacySummaryBody').classList.add('hidden');
        $('#legacySummaryBody').innerHTML='';
        $('#productSummary').innerHTML=`<div class="card metric-mini product-investment-card"><div><span>Campanha</span><strong>${investment==null?'—':fmtMoney(investment)}</strong></div><div><span>Produto</span><strong>${snapshot.productInvestment==null?'—':fmtMoney(snapshot.productInvestment)}</strong></div></div><div class="card metric-mini"><span>Cliques Google · total</span><strong>${fmtNum(clicks)}</strong></div><div class="card metric-mini"><span>Conversões · total</span><strong>${fmtNum(conversions)}</strong></div><div class="card metric-mini"><span title="Comissão registrada menos o investimento acumulado no Diário.">Lucro acumulado</span><strong>${profit==null?'—':fmtMoney(profit)}</strong></div><div class="card metric-mini"><span title="Resultado agregado: lucro acumulado dividido pelo investimento acumulado.">ROI acumulado</span><strong>${roi==null?'—':fmtPct(roi)}</strong></div><div class="card metric-mini"><span title="Sessões identificadas com ao menos uma saída após a visita; últimos 366 dias UTC.">Taxa de avanço</span><strong id="productAdvanceValue" data-campaign-id="${esc(String(actionInfo.campaignId||''))}">—</strong></div>`;
        showCampaignAdvance(actionInfo);
        const campaignDiaryEvents=(observations||[]).flatMap(observation=>(observation.eventos||[]).filter(event=>['google_ads_auto_pause','google_ads_auto_pause_observed','google_ads_cpa_adjustment','google_ads_budget_adjustment','google_ads_search_terms_analysis'].includes(event?.tipo)).map(event=>({...event,data:observation.data}))),rowsWithPauseEvents=[...diaryRows],dailyDates=new Set(diaryRows.map(productDiaryRowDate).filter(Boolean));
        for(const event of campaignDiaryEvents){const date=String(event.ocorrido_em_data||event.data||''),isCampaignAction=['google_ads_cpa_adjustment','google_ads_budget_adjustment','google_ads_search_terms_analysis'].includes(event.tipo);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const outsideActiveDiary=!isCampaignAction&&pauseConfirmedAt&&productDiaryRowsThroughDate([{date}],pauseConfirmedAt,pauseReactivatedAt).length===0;if(outsideActiveDiary||dailyDates.has(date))continue;const[year,month,day]=date.split('-');rowsWithPauseEvents.push({date,cells:{A:{value:date,text:`${day}/${month}/${year}`},Q:{value:''}}});dailyDates.add(date)}
        rowsWithPauseEvents.sort((a,b)=>productDiaryRowDate(a).localeCompare(productDiaryRowDate(b)));
        $('#productHead').innerHTML='<tr>'+productColumns.map(x=>x[0]==='R'?`<th title="Participação de impressões da rede de pesquisa. Limites como &lt; 10% são preservados; sem captura: —.">${x[1]}</th>`:`<th>${x[1]}</th>`).join('')+'</tr>';
        $('#productBody').innerHTML=rowsWithPauseEvents.length?rowsWithPauseEvents.map(r=>{
          const date=productDiaryRowDate(r),manual=global.ProductDiaryObservations?.observationFor({observacoes_diario:observations},storedCampaignId,date),datePauseEvents=campaignDiaryEvents.filter(event=>String(event.ocorrido_em_data||event.data||'')===date);
          const shown=manual?{...r,cells:{...r.cells,Q:{value:manual.texto}}}:r;
          const edit=storedCampaignId&&date&&typeof actions.saveObservation==='function'?`<a href="#" class="hub-corner-edit" data-edit-observation="${esc(date)}" aria-label="Editar observações de ${esc(saleDate(date))}" aria-haspopup="dialog" aria-controls="productObservationDialog">Editar</a>`:'';
          return `<tr${productDiaryHasSales(r,provisionalSaleDates)?' class="has-sales"':''}>${productColumns.map(([col])=>`<td class="${col==='Q'?'hub-edit-host product-observation-cell':'num'}${productDiaryZeroClass(col,shown.cells[col])}">${col==='Q'?'<div class="product-observation-text">':''}${formatProductDiaryCell(col,shown,manualSalesByDate,pauseConfirmedAt,datePauseEvents)}${col==='Q'?'</div>'+edit:''}</td>`).join('')}</tr>`;
        }).join(''):`<tr><td colspan="${productColumns.length}" class="empty">Nenhum registro diário encontrado nesta aba.</td></tr>`;
        renderTableTotals(diaryRows);
        $('#productCaption').textContent=pauseConfirmedAt&&pauseReactivatedAt&&pauseReactivatedAt>pauseConfirmedAt?`Intervalo sem registros após a pausa confirmada em ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}; diário retomado em ${pauseReactivatedAt.slice(8,10)}/${pauseReactivatedAt.slice(5,7)}/${pauseReactivatedAt.slice(0,4)}.`:pauseConfirmedAt?`Histórico da base local encerrado na pausa confirmada em ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}.`:rows.length?'Histórico da base local; vendas manuais provisórias aparecem separadas e aguardam confirmação do MCC D−1':source==='workbook'?'Aba histórica sem linhas diárias reconhecidas':'D−1 e D zero disponíveis no manifesto atual';
        $('#rowCount').textContent=`${rowsWithPauseEvents.length} ${rowsWithPauseEvents.length===1?'dia':'dias'}`;
        $('#productFooterNote').textContent='Campos ausentes permanecem vazios. Cliques da plataforma não são inferidos pelo manifesto.';
        ensureColumnPicker();
      }
    }
    return{render:renderProduct,dispose(){disposed=true;campaignPresellRequest++;columnController?.destroy();columnPicker?.removeEventListener?.('change',syncColumnLayout);columnPicker?.removeEventListener?.('click',syncColumnLayout)}};
  }
  global.ProductDiaryView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

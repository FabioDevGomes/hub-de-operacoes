(function(global){
  function mount({root,getSnapshot,domain,format,actions,preferences,loadColumnPicker=()=>import('../table-columns.mjs?v=1')}){
    const $=selector=>root.querySelector(selector);
    const {esc,num:fmtNum,money:fmtMoney,pct:fmtPct}=format;
    const {productColumns,productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,productDiaryRowsThroughDate,productDiaryTableTotals,excelDate}=domain;
    let selection=null,editing=null;
    const tableWrap=$('#productTableWrap');
    let layoutFrame=null,disposed=false,campaignPresellRequest=0;
    const columnPicker=$('#productColumnPicker'),diaryTable=tableWrap?.querySelector('.product-table');
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
      scheduleTableHeight();
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
    function updateTableHeight(){
      layoutFrame=null;
      if(disposed||!tableWrap?.getBoundingClientRect||!tableWrap.style||tableWrap.classList.contains('hidden')||tableWrap.getClientRects?.().length===0)return;
      const viewport=global.innerHeight;
      if(!Number.isFinite(viewport)||viewport<=0)return;
      // Document position keeps the cap stable while the page scrolls to the blocks below.
      const tableTop=tableWrap.getBoundingClientRect().top+(global.scrollY||0),bottomGap=12;
      const available=viewport-tableTop-bottomGap;
      const height=Math.max(1,Math.min(viewport-bottomGap,Math.max(120,available)));
      const value=`${Math.floor(height)}px`;
      if(tableWrap.style.getPropertyValue('--product-diary-table-max-height')!==value)tableWrap.style.setProperty('--product-diary-table-max-height',value);
    }
    function scheduleTableHeight(){
      if(disposed||layoutFrame!==null||typeof global.requestAnimationFrame!=='function')return;
      layoutFrame=global.requestAnimationFrame(updateTableHeight);
    }
    global.addEventListener?.('resize',scheduleTableHeight);
    const layoutObserver=typeof global.ResizeObserver==='function'?new global.ResizeObserver(scheduleTableHeight):null;
    if(layoutObserver){
      // Observe only content above the rows; scrolling/resizing the table must not grow its cap.
      const main=root.parentElement;
      for(const element of [$('#productSummary'),$('#productDiaryPanel')?.querySelector('.panel-head'),...Array.from(main?.querySelectorAll('.topbar,.statusbar,.notice')||[])])if(element)layoutObserver.observe(element);
    }
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
    $('#productSummary').addEventListener('click',event=>{
      const button=event.target.closest?.('[data-product-search-terms]');
      if(!button||!selection||typeof actions.openSearchTerms!=='function')return;
      const snapshot=getSnapshot(...selection),info=snapshot.googleAdsCampaignAction||{};
      if(info.mappingStatus!=='mapped'||!/^\d{10}$/.test(String(info.managerCustomerId||''))||!/^\d{10}$/.test(String(info.customerId||''))||! /^[1-9]\d{0,19}$/.test(String(info.campaignId||''))||!String(info.campaignName||'').trim())return;
      button.disabled=true;
      try{
        const result=actions.openSearchTerms({managerCustomerId:String(info.managerCustomerId),customerId:String(info.customerId),campaignId:String(info.campaignId),campaignName:String(info.campaignName).trim()});
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
        const title=included?(col==='F'?'Soma das conversões oficiais disponíveis; vendas manuais provisórias não incluídas.':'Soma dos valores disponíveis nas linhas apresentadas; ausências não são tratadas como zero.'):'Coluna não somada.';
        const text=value===null?'—':fmtNum(value,['O','P'].includes(col)?2:Number.isInteger(value)?0:2);
        return`<td class="num${productDiaryZeroClass(col,{value})}" title="${title}">${text}</td>`;
      }).join('')+'</tr>';
    }
    function formatProductDiaryCell(col,row,manualSalesByDate,pauseConfirmedAt,automaticPauseEvents=[]){const value=formatProductCell(col,row.cells[col]),count=productDiaryManualSaleCount(row,manualSalesByDate),pauseNote=col==='Q'&&pauseConfirmedAt&&productDiaryRowDate(row)===pauseConfirmedAt?`<small class="product-pause-note">Campanha pausada na data ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}</small>`:'',autoPauseNotes=col==='Q'?automaticPauseEvents.map(event=>`<span class="product-auto-pause-event-badge" title="Pausa automática confirmada${event.ocorrido_em_utc?` em ${esc(saleTimestamp(event.ocorrido_em_utc))} (São Paulo)`:''}">Pausa automática aplicada</span>`):[];if(col==='F')return count?`<span>${value}</span><small class="product-manual-sale-note">+${count} manual · provisória</small>`:value;if(col!=='Q')return value;const notes=[];if(value!=='—')notes.push(`<span>${value}</span>`);if(count)notes.push(`<small class="product-manual-sale-note">Venda manual provisória (${count}); aguarda MCC D−1</small>`);if(pauseNote)notes.push(pauseNote);notes.push(...autoPauseNotes);return notes.join('')||'—'}
    function saleTimestamp(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(date):'—'}
    function saleDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value).split('-').reverse().join('/'):'—'}
    function saoPauloToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=type=>parts.find(item=>item.type===type)?.value||'';return`${part('year')}-${part('month')}-${part('day')}`}
    function pauseRuleLabel(rule){return rule==='negative_remaining'?'Valor restante negativo':rule==='product_performance'?'Desempenho do mesmo produto':rule==='campaign_age'?'Campanha acima do limite de dias':rule==='campaign_zero_impressions'?'Dias sem impressões':''}
    function renderCampaignEvents(observations,summary,storedCampaignId){const panel=$('#productCampaignEvents'),events=summary?[]:(observations||[]).flatMap(observation=>(observation.eventos||[]).filter(event=>event?.tipo==='google_ads_auto_pause').map(event=>({...event,data:observation.data}))).sort((a,b)=>String(b.ocorrido_em_utc||b.ocorrido_em_data||b.data||'').localeCompare(String(a.ocorrido_em_utc||a.ocorrido_em_data||a.data||''))),canBackfill=!summary&&Boolean(storedCampaignId)&&typeof actions.recordHistoricalAutomaticPauseInDiary==='function',visible=events.length>0||canBackfill;panel?.classList.toggle('hidden',!visible);$('#productCampaignEventCount')?.replaceChildren?.();if($('#productCampaignEventCount'))$('#productCampaignEventCount').textContent=events.length?`${events.length} ${events.length===1?'evento':'eventos'}`:'';$('#productCampaignEventBackfill')?.classList.toggle('hidden',!canBackfill);const dateInput=$('#productCampaignEventDate');if(dateInput&&!dateInput.value)dateInput.value=saoPauloToday();if($('#productCampaignEventList'))$('#productCampaignEventList').innerHTML=events.map(event=>{const timestamp=event.ocorrido_em_utc,when=timestamp?`${saleDate(event.data)} · ${saleTimestamp(timestamp)} (São Paulo)`: `${saleDate(event.ocorrido_em_data||event.data)} · horário não registrado`,rule=pauseRuleLabel(event.regra);return`<li><span><span class="product-auto-pause-event-badge">Pausa automática aplicada</span>${rule?`<small class="product-auto-pause-event-rule">${esc(rule)}</small>`:''}</span><time datetime="${esc(timestamp||event.ocorrido_em_data||'')}">${esc(when)}</time></li>`}).join('');return visible}
    function campaignPresellMarkup(urls){if(!Array.isArray(urls))return'';const links=[...new Set(urls.map(value=>{try{const url=new URL(String(value));return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&url.pathname==='/'&&!url.search&&!url.hash?url.href:''}catch{return''}}).filter(Boolean))];return links.length?`<span>Pré-sell${links.length===1?'':'s'}:</span>${links.map(value=>{const url=new URL(value);return`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer" title="Abrir pré-sell em nova aba">${esc(url.hostname)}</a>`}).join('')}`:''}
    function renderCampaignPresell(identity,showEvents){const request=++campaignPresellRequest,panel=$('#productCampaignEvents'),target=$('#productCampaignPresell');if(target){target.innerHTML='';target.hidden=true}if(!panel)return;panel.classList.toggle('hidden',!showEvents);if(!identity||typeof actions.getCampaignPresellUrls!=='function')return;Promise.resolve().then(()=>actions.getCampaignPresellUrls(identity)).then(urls=>{if(disposed||request!==campaignPresellRequest)return;const markup=campaignPresellMarkup(urls);if(target){target.innerHTML=markup;target.hidden=!markup}panel.classList.toggle('hidden',!showEvents&&!markup)}).catch(()=>{if(!disposed&&request===campaignPresellRequest)panel.classList.toggle('hidden',!showEvents)})}
    $('#productCampaignEventAdd')?.addEventListener?.('click',async()=>{
      if(!selection)return;
      const snapshot=getSnapshot(...selection),campaignId=snapshot.storedCampaignId,date=$('#productCampaignEventDate').value,button=$('#productCampaignEventAdd'),message=$('#productCampaignEventMessage');
      if(!campaignId||!date||typeof actions.recordHistoricalAutomaticPauseInDiary!=='function'){message.textContent='Selecione uma data e uma campanha identificada.';return}
      if(!global.confirm(`Registrar no Diário que uma pausa automática já ocorreu em ${saleDate(date)}? Isso não consulta nem altera o Google Ads.`))return;
      button.disabled=true;message.textContent='Salvando evento no Diário…';
      try{const result=await actions.recordHistoricalAutomaticPauseInDiary({campaignId,occurredOn:date});message.textContent=result?.changed?'Evento registrado. A Visão Geral exibirá o selo ao lado do nome da campanha.':'Já havia um evento de pausa automática registrado nessa data.';renderProduct(...selection)}
      catch(error){message.textContent=error?.message||'Não foi possível salvar o evento.'}
      finally{button.disabled=false}
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
    function renderProduct(name,source='manifest',campaignId=null){
      const nextSelection=[name,source,campaignId];
      if(selection&&selection.some((value,index)=>value!==nextSelection[index]))closeEditor();
      selection=nextSelection;
      const {sheetName,rows,displayRows,manualSalesByDate,summary,investment,clicks,conversions,pauseConfirmedAt,saleHistory=[],storedCampaignId=null,googleAdsCampaignAction=null,observations=[],presellIdentity=null}=getSnapshot(name,source,campaignId);
      const campaignEventsVisible=renderCampaignEvents(observations,summary,storedCampaignId);renderCampaignPresell(presellIdentity,campaignEventsVisible);
      $('#productSaleHistory').classList.toggle('hidden',!!summary);
      renderSales(summary?[]:saleHistory);
      const boundedRows=pauseConfirmedAt?productDiaryRowsThroughDate(displayRows,pauseConfirmedAt):displayRows,provisionalSaleDates=new Set(manualSalesByDate.keys()),diaryRows=productDiaryRowsThroughDate(productDiaryRowsWithManualSales(boundedRows,manualSalesByDate),pauseConfirmedAt);
      if(summary){
        $('#productSummary').classList.remove('has-search-terms-action');
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
        const actionInfo=googleAdsCampaignAction||{},hasSearchTermsAction=actionInfo.mappingStatus==='mapped'&&/^\d{10}$/.test(String(actionInfo.managerCustomerId||''))&&/^\d{10}$/.test(String(actionInfo.customerId||''))&&/^[1-9]\d{0,19}$/.test(String(actionInfo.campaignId||''))&&Boolean(String(actionInfo.campaignName||'').trim());
        $('#productSummary').classList.toggle('has-search-terms-action',hasSearchTermsAction);
        columnPicker.classList.remove('hidden');
        actions.setTitle(sheetName,source==='workbook'?'Aba histórica da base local':name);
        $('#productPanelTitle').textContent='Diário de campanha';
        $('#productTableWrap').classList.remove('hidden');
        $('#legacySummaryBody').classList.add('hidden');
        $('#legacySummaryBody').innerHTML='';
        $('#productSummary').innerHTML=`<div class="card product-name"><div class="eyebrow">${source==='workbook'?'Histórico':'Campanha ativa'}</div><h2>${esc(sheetName)}</h2><p>${rows.length?'Histórico da base local':'Sem linhas diárias disponíveis'}</p></div><div class="card metric-mini"><span>Investimento total</span><strong>${investment==null?'—':fmtMoney(investment)}</strong></div><div class="card metric-mini"><span>Cliques Google · total</span><strong>${fmtNum(clicks)}</strong></div><div class="card metric-mini"><span>Conversões · total</span><strong>${fmtNum(conversions)}</strong></div>${hasSearchTermsAction?`<div class="card product-search-terms-card"><button class="btn primary" type="button" data-product-search-terms aria-label="Avaliar termos de pesquisa de ${esc(sheetName)}">Avaliar termos de pesquisa</button></div>`:''}`;
        const campaignPauseEvents=(observations||[]).flatMap(observation=>(observation.eventos||[]).filter(event=>event?.tipo==='google_ads_auto_pause').map(event=>({...event,data:observation.data}))),rowsWithPauseEvents=[...diaryRows],dailyDates=new Set(diaryRows.map(productDiaryRowDate).filter(Boolean));
        for(const event of campaignPauseEvents){const date=String(event.ocorrido_em_data||event.data||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||pauseConfirmedAt&&date>pauseConfirmedAt||dailyDates.has(date))continue;const[year,month,day]=date.split('-');rowsWithPauseEvents.push({date,cells:{A:{value:date,text:`${day}/${month}/${year}`},Q:{value:''}}});dailyDates.add(date)}
        rowsWithPauseEvents.sort((a,b)=>productDiaryRowDate(a).localeCompare(productDiaryRowDate(b)));
        $('#productHead').innerHTML='<tr>'+productColumns.map(x=>x[0]==='R'?`<th title="Participação de impressões da rede de pesquisa. Limites como &lt; 10% são preservados; sem captura: —.">${x[1]}</th>`:`<th>${x[1]}</th>`).join('')+'</tr>';
        $('#productBody').innerHTML=rowsWithPauseEvents.length?rowsWithPauseEvents.map(r=>{
          const date=productDiaryRowDate(r),manual=global.ProductDiaryObservations?.observationFor({observacoes_diario:observations},storedCampaignId,date),datePauseEvents=campaignPauseEvents.filter(event=>String(event.ocorrido_em_data||event.data||'')===date);
          const shown=manual?{...r,cells:{...r.cells,Q:{value:manual.texto}}}:r;
          const edit=storedCampaignId&&date&&typeof actions.saveObservation==='function'?`<a href="#" class="hub-corner-edit" data-edit-observation="${esc(date)}" aria-label="Editar observações de ${esc(saleDate(date))}" aria-haspopup="dialog" aria-controls="productObservationDialog">Editar</a>`:'';
          return `<tr${productDiaryHasSales(r,provisionalSaleDates)?' class="has-sales"':''}>${productColumns.map(([col])=>`<td class="${col==='Q'?'hub-edit-host product-observation-cell':'num'}${productDiaryZeroClass(col,shown.cells[col])}">${col==='Q'?'<div class="product-observation-text">':''}${formatProductDiaryCell(col,shown,manualSalesByDate,pauseConfirmedAt,datePauseEvents)}${col==='Q'?'</div>'+edit:''}</td>`).join('')}</tr>`;
        }).join(''):`<tr><td colspan="${productColumns.length}" class="empty">Nenhum registro diário encontrado nesta aba.</td></tr>`;
        renderTableTotals(diaryRows);
        $('#productCaption').textContent=pauseConfirmedAt?`Histórico da base local encerrado na pausa confirmada em ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}.`:rows.length?'Histórico da base local; vendas manuais provisórias aparecem separadas e aguardam confirmação do MCC D−1':source==='workbook'?'Aba histórica sem linhas diárias reconhecidas':'D−1 e D zero disponíveis no manifesto atual';
        $('#rowCount').textContent=`${rowsWithPauseEvents.length} ${rowsWithPauseEvents.length===1?'dia':'dias'}`;
        $('#productFooterNote').textContent='Campos ausentes permanecem vazios. Cliques da plataforma não são inferidos pelo manifesto.';
        ensureColumnPicker();
      }
      scheduleTableHeight();
    }
    return{render:renderProduct,dispose(){disposed=true;campaignPresellRequest++;columnController?.destroy();columnPicker?.removeEventListener?.('change',syncColumnLayout);columnPicker?.removeEventListener?.('click',syncColumnLayout);layoutObserver?.disconnect();global.removeEventListener?.('resize',scheduleTableHeight);if(layoutFrame!==null)global.cancelAnimationFrame?.(layoutFrame)}};
  }
  global.ProductDiaryView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

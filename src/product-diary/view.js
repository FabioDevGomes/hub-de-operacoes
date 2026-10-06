(function(global){
  function mount({root,getSnapshot,domain,format,actions}){
    const $=selector=>root.querySelector(selector);
    const {esc,num:fmtNum,money:fmtMoney,pct:fmtPct}=format;
    const {productColumns,productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,productDiaryRowsThroughDate,excelDate}=domain;
    let selection=null,editing=null;
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
    function formatProductCell(col,cell){if(!cell||cell.value==null||cell.value==='')return'—';if(col==='A')return typeof cell.value==='number'?formatExcelDate(cell.value):esc(cell.text??cell.value);if(['E','G','K','L'].includes(col)){const v=Number(cell.value);return Number.isFinite(v)?fmtPct(Math.abs(v)<=1?v*100:v):''}if(['I','J','O','P'].includes(col)&&typeof cell.value==='number')return fmtNum(cell.value,2);return esc(cell.text??cell.value)}
    function formatProductDiaryCell(col,row,manualSalesByDate,pauseConfirmedAt){const value=formatProductCell(col,row.cells[col]),count=productDiaryManualSaleCount(row,manualSalesByDate),pauseNote=col==='Q'&&pauseConfirmedAt&&productDiaryRowDate(row)===pauseConfirmedAt?`<small class="product-pause-note">Campanha pausada na data ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}</small>`:'';if(col==='F')return count?`<span>${value}</span><small class="product-manual-sale-note">+${count} manual · provisória</small>`:value;if(col!=='Q')return value;const notes=[];if(value!=='—')notes.push(`<span>${value}</span>`);if(count)notes.push(`<small class="product-manual-sale-note">Venda manual provisória (${count}); aguarda MCC D−1</small>`);if(pauseNote)notes.push(pauseNote);return notes.join('')||'—'}
    function saleTimestamp(value){const date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(date):'—'}
    function saleDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value).split('-').reverse().join('/'):'—'}
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
      const {sheetName,rows,displayRows,manualSalesByDate,summary,investment,clicks,conversions,pauseConfirmedAt,saleHistory=[],storedCampaignId=null,observations=[]}=getSnapshot(name,source,campaignId);
      $('#productSaleHistory').classList.toggle('hidden',!!summary);
      renderSales(summary?[]:saleHistory);
      const boundedRows=pauseConfirmedAt?productDiaryRowsThroughDate(displayRows,pauseConfirmedAt):displayRows,provisionalSaleDates=new Set(manualSalesByDate.keys()),diaryRows=productDiaryRowsThroughDate(productDiaryRowsWithManualSales(boundedRows,manualSalesByDate),pauseConfirmedAt);
      if(summary){
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
        actions.setTitle(sheetName,source==='workbook'?'Aba histórica da base local':name);
        $('#productPanelTitle').textContent='Diário de campanha';
        $('#productTableWrap').classList.remove('hidden');
        $('#legacySummaryBody').classList.add('hidden');
        $('#legacySummaryBody').innerHTML='';
        $('#productSummary').innerHTML=`<div class="card product-name"><div class="eyebrow">${source==='workbook'?'Histórico':'Campanha ativa'}</div><h2>${esc(sheetName)}</h2><p>${rows.length?'Histórico da base local':'Sem linhas diárias disponíveis'}</p></div><div class="card metric-mini"><span>Investimento total</span><strong>${investment==null?'—':fmtMoney(investment)}</strong></div><div class="card metric-mini"><span>Cliques Google · total</span><strong>${fmtNum(clicks)}</strong></div><div class="card metric-mini"><span>Conversões · total</span><strong>${fmtNum(conversions)}</strong></div>`;
        $('#productHead').innerHTML='<tr>'+productColumns.map(x=>`<th>${x[1]}</th>`).join('')+'</tr>';
        $('#productBody').innerHTML=diaryRows.length?diaryRows.map(r=>{
          const date=productDiaryRowDate(r),manual=global.ProductDiaryObservations?.observationFor({observacoes_diario:observations},storedCampaignId,date);
          const shown=manual?{...r,cells:{...r.cells,Q:{value:manual.texto}}}:r;
          const edit=storedCampaignId&&date&&typeof actions.saveObservation==='function'?`<a href="#" class="hub-corner-edit" data-edit-observation="${esc(date)}" aria-label="Editar observações de ${esc(saleDate(date))}" aria-haspopup="dialog" aria-controls="productObservationDialog">Editar</a>`:'';
          return `<tr${productDiaryHasSales(r,provisionalSaleDates)?' class="has-sales"':''}>${productColumns.map(([col])=>`<td class="${col==='Q'?'hub-edit-host product-observation-cell':'num'}">${col==='Q'?'<div class="product-observation-text">':''}${formatProductDiaryCell(col,shown,manualSalesByDate,pauseConfirmedAt)}${col==='Q'?'</div>'+edit:''}</td>`).join('')}</tr>`;
        }).join(''):'<tr><td colspan="17" class="empty">Nenhum registro diário encontrado nesta aba.</td></tr>';
        $('#productCaption').textContent=pauseConfirmedAt?`Histórico da base local encerrado na pausa confirmada em ${pauseConfirmedAt.slice(8,10)}/${pauseConfirmedAt.slice(5,7)}/${pauseConfirmedAt.slice(0,4)}.`:rows.length?'Histórico da base local; vendas manuais provisórias aparecem separadas e aguardam confirmação do MCC D−1':source==='workbook'?'Aba histórica sem linhas diárias reconhecidas':'D−1 e D zero disponíveis no manifesto atual';
        $('#rowCount').textContent=`${diaryRows.length} ${diaryRows.length===1?'dia':'dias'}`;
        $('#productFooterNote').textContent='Campos ausentes permanecem vazios. Cliques da plataforma não são inferidos pelo manifesto.';
      }

    }
    return{render:renderProduct};
  }
  global.ProductDiaryView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

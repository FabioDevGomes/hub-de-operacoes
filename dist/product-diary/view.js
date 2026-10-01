(function(global){
  function mount({root,getSnapshot,domain,format,actions}){
    const $=selector=>root.querySelector(selector);
    const {esc,num:fmtNum,money:fmtMoney,pct:fmtPct}=format;
    const {productColumns,productDiaryRowDate,productDiaryHasSales,productDiaryManualSaleCount,productDiaryRowsWithManualSales,excelDate}=domain;
    function formatExcelDate(serial){const d=excelDate(serial);return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'}).format(d)}
    function formatProductCell(col,cell){if(!cell||cell.value==null||cell.value==='')return'—';if(col==='A')return typeof cell.value==='number'?formatExcelDate(cell.value):esc(cell.text??cell.value);if(['E','G','K','L'].includes(col)){const v=Number(cell.value);return Number.isFinite(v)?fmtPct(Math.abs(v)<=1?v*100:v):''}if(['I','J','O','P'].includes(col)&&typeof cell.value==='number')return fmtNum(cell.value,2);return esc(cell.text??cell.value)}
    function formatProductDiaryCell(col,row,manualSalesByDate){const value=formatProductCell(col,row.cells[col]),count=productDiaryManualSaleCount(row,manualSalesByDate);if(!count)return value;if(col==='F')return `<span>${value}</span><small class="product-manual-sale-note">+${count} manual · provisória</small>`;if(col==='Q')return `${value==='—'?'':`<span>${value}</span>`}<small class="product-manual-sale-note">Venda manual provisória (${count}); aguarda MCC D−1</small>`;return value}
    function renderProduct(name,source='manifest',campaignId=null){
      const {sheetName,rows,displayRows,manualSalesByDate,summary,investment}=getSnapshot(name,source,campaignId);
      const provisionalSaleDates=new Set(manualSalesByDate.keys()),diaryRows=productDiaryRowsWithManualSales(displayRows,manualSalesByDate);
      const latest=displayRows.at(-1)?.cells||{};
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
        $('#productSummary').innerHTML=`<div class="card product-name"><div class="eyebrow">${source==='workbook'?'Histórico':'Campanha ativa'}</div><h2>${esc(sheetName)}</h2><p>${rows.length?'Histórico da base local':'Sem linhas diárias disponíveis'}</p></div><div class="card metric-mini"><span>Investimento atual</span><strong>${investment==null?'—':fmtMoney(investment)}</strong></div><div class="card metric-mini"><span>Cliques Google</span><strong>${fmtNum(latest.C?.value)}</strong></div><div class="card metric-mini"><span>Conversões</span><strong>${fmtNum(latest.F?.value)}</strong></div>`;
        $('#productHead').innerHTML='<tr>'+productColumns.map(x=>`<th>${x[1]}</th>`).join('')+'</tr>';
        $('#productBody').innerHTML=diaryRows.length?diaryRows.map(r=>`<tr${productDiaryHasSales(r,provisionalSaleDates)?' class="has-sales"':''}>${productColumns.map(([col])=>`<td class="${col==='Q'?'':'num'}">${formatProductDiaryCell(col,r,manualSalesByDate)}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="17" class="empty">Nenhum registro diário encontrado nesta aba.</td></tr>';
        $('#productCaption').textContent=rows.length?'Histórico da base local; vendas manuais provisórias aparecem separadas e aguardam confirmação do MCC D−1':source==='workbook'?'Aba histórica sem linhas diárias reconhecidas':'D−1 e D zero disponíveis no manifesto atual';
        $('#rowCount').textContent=`${diaryRows.length} ${diaryRows.length===1?'dia':'dias'}`;
        $('#productFooterNote').textContent='Campos ausentes permanecem vazios. Cliques da plataforma não são inferidos pelo manifesto.';
      }

    }
    return{render:renderProduct};
  }
  global.ProductDiaryView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

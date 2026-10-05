(function(global){
  // Presentation only: the Hub supplies read-only, already consolidated projections.
  function mount({root,state,getSnapshot,domain,format,actions,preferences}){
    const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
    const OverviewDomain=domain,{esc,num:fmtNum,money:fmtMoney,pct:fmtPct,date:dateLabel}=format;
    const columnPreferenceKey='hub:overview:visible-columns:v1';let selectedColumns=null;
    const picker=$('#overviewColumnPicker'),viewport=root.ownerDocument?.defaultView;
    function positionColumnMenu(){if(!viewport||!picker.open)return;const menu=$('.overview-column-menu'),box=picker.getBoundingClientRect(),below=viewport.innerHeight-box.bottom-16,above=box.top-16,upward=below<300&&above>below;menu.style.top=upward?'auto':'calc(100% + 8px)';menu.style.bottom=upward?'calc(100% + 8px)':'auto';menu.style.maxHeight=Math.max(160,upward?above:below)+'px'}
    picker.ontoggle=positionColumnMenu;
    viewport?.addEventListener('resize',positionColumnMenu);
    picker.onkeydown=event=>{if(event.key==='Escape'){picker.open=false;picker.querySelector('summary')?.focus()}};
    try{const stored=JSON.parse(preferences?.getItem(columnPreferenceKey)||'null');if(Array.isArray(stored))selectedColumns=stored}catch{}
    function saveColumns(){try{preferences?.setItem(columnPreferenceKey,JSON.stringify(selectedColumns));$('#overviewColumnsMessage').textContent=''}catch{$('#overviewColumnsMessage').textContent='Preferência válida nesta sessão; não foi possível salvá-la no navegador.'}}
    function renderColumnOptions(columns){
      $('#overviewColumnOptions').innerHTML=columns.map(([key,label])=>`<label><input type="checkbox" data-column-choice="${key}" ${key==='campaign'||selectedColumns==null||selectedColumns.includes(key)?'checked':''} ${key==='campaign'?'disabled':''}><span>${esc(label)}</span></label>`).join('');
      $$('[data-column-choice]').forEach(input=>input.onchange=()=>{const key=input.dataset.columnChoice,chosen=new Set(selectedColumns||columns.map(([key])=>key));input.checked?chosen.add(key):chosen.delete(key);chosen.add('campaign');selectedColumns=[...chosen];saveColumns();renderTotals();$(`[data-column-choice="${key}"]`)?.focus?.()});
    }
    $('#overviewColumnsReset').onclick=()=>{selectedColumns=null;try{preferences?.removeItem(columnPreferenceKey);$('#overviewColumnsMessage').textContent=''}catch{$('#overviewColumnsMessage').textContent='Padrão restaurado somente nesta sessão.'}renderTotals()};
    function saleRoiCell(sale){
      const snapshot=sale?.snapshot,roi=snapshot?.roi_percent;
      const detail=snapshot?`ROI acumulado no registro (${dateLabel(snapshot.sale_date)}${snapshot.sale_time?' '+snapshot.sale_time:''}): investimento ${fmtMoney(snapshot.investment_brl)}; receita ${fmtMoney(snapshot.revenue_brl)}. ${snapshot.unavailable_reason||'Fotografia preservada; não muda com capturas futuras.'}`:'Sem fotografia de ROI para esta venda manual registrada.';
      return `<td class="num ${roi==null?'':roi<0?'negative':roi>0?'positive':''}" title="${esc(detail)}">${roi==null?'—':fmtPct(roi)}</td>`;
    }
    function sortCell(cell){if(!cell||cell.value==null||cell.value==='')return null;if(typeof cell.value==='number')return cell.value;const text=String(cell.text??cell.value).trim();const normalized=text.replace(/[^0-9,.-]/g,'').replaceAll('.','').replace(',','.');const number=Number(normalized);return Number.isFinite(number)?number:text.toLocaleLowerCase('pt-BR')}
    function displayCell(cell){if(!cell||cell.value==null||cell.value==='')return'—';return esc(cell.text??cell.value)}
    const roiDialog=$('#minimumRoiDialog'),roiForm=$('#minimumRoiForm'),roiLimit=$('#minimumRoiLimit'),roiPercent=$('#minimumRoiPercent'),roiError=$('#minimumRoiError'),roiHelp=$('#minimumRoiHelp');let roiRevenue=null;
    function inputNumber(value,decimals=2){return Number(value).toFixed(decimals).replace('.',',')}
    function setRoiError(message){roiError.textContent=message||'';roiDialog.dataset.syncValid=message?'false':'true'}
    function showRoiDialog(campaignId,currentRoi,currentLimit,totalRevenue){
      roiDialog.dataset.campaignId=String(campaignId||'');roiRevenue=Number(totalRevenue);roiLimit.value=inputNumber(currentLimit);roiPercent.value=String(currentRoi??'').replace('.',',');
      roiLimit.disabled=!(Number.isFinite(roiRevenue)&&roiRevenue>0);roiHelp.textContent=roiLimit.disabled?'A receita total é zero; o limite permanece em R$ 0,00. Você ainda pode definir o ROI mínimo.':'O cálculo usa a receita total considerada para esta campanha. São aceitos percentuais negativos acima de −100%.';
      setRoiError('');if(typeof roiDialog.showModal==='function')roiDialog.showModal();else roiDialog.open=true;roiPercent.focus?.();
    }
    function updateLimitFromRoi(){try{const minimum=OverviewDomain.parseMinimumRoi(roiPercent.value),limit=OverviewDomain.testLimitForRoi(roiRevenue,minimum);roiLimit.value=inputNumber(limit);setRoiError('')}catch(error){setRoiError(error.message)}}
    function updateRoiFromLimit(){try{const minimum=OverviewDomain.roiForTestLimit(roiRevenue,roiLimit.value);roiPercent.value=String(minimum).replace('.',',');setRoiError('')}catch(error){setRoiError(error.message)}}
    roiPercent.oninput=updateLimitFromRoi;roiLimit.oninput=()=>{if(!roiLimit.disabled)updateRoiFromLimit()};
    $('#minimumRoiCancel').onclick=()=>roiDialog.close?.();
    roiForm.onsubmit=event=>{event.preventDefault();let minimum;try{minimum=OverviewDomain.parseMinimumRoi(roiPercent.value);OverviewDomain.testLimitForRoi(roiRevenue,minimum);if(roiDialog.dataset.syncValid==='false')throw new Error('Corrija os campos antes de confirmar.')}catch(error){setRoiError(error.message);return}const campaignId=roiDialog.dataset.campaignId;roiDialog.close?.();if(typeof roiDialog.close!=='function')roiDialog.open=false;void actions.editMinimumRoi(campaignId,minimum)};
    function metricDetail(label,result,format){return`<span class="overview-kpi-detail"><span class="kpi-label">${label}</span><strong class="overview-kpi-detail-value">${result.value==null?'—':format(result.value)}</strong></span>`}
    function renderD0MetricSummary(rows){
      const capturedRows=rows.filter(row=>row.c.metricas_D_zero?.presente!==false||row.c.metricas_D_zero?.retida_no_dia===true),dayTotals=capturedRows.map(row=>row.d0Totals);
      const metrics=[['Investimento','investment',fmtMoney],['Impressões','impressions',fmtNum],['Cliques','clicks',fmtNum]],results=metrics.map(([label,field,format])=>({label,format,result:OverviewDomain.sumObservedMetric(dayTotals,field)}));
      return`<section class="kpi overview-kpi overview-kpi-period kpi-group-d0" role="group" aria-label="Indicadores D0"><div class="overview-kpi-heading"><span class="kpi-group-label">D0</span></div><div class="overview-kpi-main"><span class="overview-kpi-main-label">${results[0].label}</span><strong class="kpi-value">${results[0].result.value==null?'—':results[0].format(results[0].result.value)}</strong></div><div class="overview-kpi-details">${metricDetail(results[1].label,results[1].result,results[1].format)}${metricDetail(results[2].label,results[2].result,results[2].format)}</div></section>`;
    }
    function renderD0ProfitSummary(rows,counts){
      const dayTotals=rows.filter(row=>row.c.metricas_D_zero?.presente!==false||row.c.metricas_D_zero?.retida_no_dia===true).map(row=>row.d0ProfitTotals??row.d0Totals),result=OverviewDomain.sumObservedProfit(dayTotals),profitClass=result.value==null?'':result.value<0?'negative':result.value>0?'positive':'',status=result.value==null?'sem dados':result.value<0?'negativo':result.value>0?'positivo':'zerado',value=result.value==null?'—':`${result.value>0?'+':''}${fmtMoney(result.value)}`,tooltip=`Lucro do dia = comissão observada + ajustes de vendas provisórias − investimento observado. Resultado ${status}. Cobertura: ${result.observedCount}/${result.totalCount} campanhas com investimento e comissão/ajuste disponíveis.`;
      return`<section class="kpi overview-kpi overview-kpi-profit kpi-d0-profit" title="${esc(tooltip)}" aria-label="Lucro do dia ${esc(status)}: ${esc(value)}"><div class="overview-kpi-heading"><span class="kpi-label">Lucro do dia</span><span class="overview-kpi-context">D0</span></div><div class="overview-kpi-main"><strong class="kpi-value ${profitClass}">${value}</strong></div><div class="overview-kpi-details" role="group" aria-label="Campanhas">${metricDetail('Ativas',{value:counts.activeCount},fmtNum)}${metricDetail('Pausadas',{value:counts.pausedCount},fmtNum)}</div></section>`;
    }
    function renderD1MetricSummary(dayTotals){
      const metrics=[['Investimento','investment',fmtMoney],['Impressões','impressions',fmtNum],['Cliques','clicks',fmtNum]],results=metrics.map(([label,field,format])=>({label,format,result:OverviewDomain.sumObservedMetric(dayTotals,field)}));
      return`<section class="kpi overview-kpi overview-kpi-period kpi-group-d1" role="group" aria-label="Indicadores D−1"><div class="overview-kpi-heading"><span class="kpi-group-label">D−1</span></div><div class="overview-kpi-main"><span class="overview-kpi-main-label">${results[0].label}</span><strong class="kpi-value">${results[0].result.value==null?'—':results[0].format(results[0].result.value)}</strong></div><div class="overview-kpi-details">${metricDetail(results[1].label,results[1].result,results[1].format)}${metricDetail(results[2].label,results[2].result,results[2].format)}</div></section>`;
    }
    function renderManifestSummary(snapshot){
      const manifestCount=snapshot.manifestCampaignCount??0,dates=snapshot.dates||{};
      return`<section class="kpi overview-kpi overview-kpi-manifest" aria-label="Manifesto e datas"><div class="overview-kpi-heading"><span class="kpi-label">Manifesto MCC</span></div><div class="overview-kpi-main overview-kpi-meta-main"><strong class="kpi-value">${fmtNum(manifestCount)}</strong><span class="overview-kpi-main-label">campanhas</span></div><div class="overview-kpi-dates"><span><span>D−1</span><strong>${esc(dateLabel(dates.d1))}</strong></span><span><span>D zero</span><strong>${esc(dateLabel(dates.d0))}</strong></span></div></section>`;
    }
    function renderBaseSummary(snapshot){
      const hasBase=Number.isFinite(snapshot.baseRecordCount),recordCount=hasBase?fmtNum(snapshot.baseRecordCount):'—',updated=snapshot.baseUpdatedLabel||'Atualização indisponível',pending=Math.max(0,Number(snapshot.pendingSaleCount)||0),pendingTitle=pending===1?'Venda provisória,':'Vendas provisórias,',pendingStatus=pending===1?'pendente de confirmação':'pendentes de confirmação',pendingDotClass=pending>0?'dot warn':'dot',tooltip='Vendas registradas manualmente permanecem provisórias até serem conciliadas com os dados da MCC.';
      return`<section class="kpi overview-kpi overview-kpi-base" aria-label="Base local e vendas pendentes"><div class="overview-kpi-heading"><span class="overview-kpi-pending-title"><span class="${pendingDotClass} overview-kpi-pending-dot" aria-hidden="true"></span><span class="kpi-label">${pendingTitle}</span></span><span class="overview-info-icon" role="img" aria-label="Informações sobre vendas provisórias" title="${esc(tooltip)}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25"/><path d="M8 7.1v4.1M8 4.8h.01"/></svg></span></div><div class="overview-kpi-main overview-kpi-meta-main"><strong class="kpi-value">${fmtNum(pending)}</strong><span class="overview-kpi-main-label">${pendingStatus}</span></div><div class="overview-kpi-base-meta"><span>${hasBase?`Base: ${recordCount} registros`:'Histórico não carregado'}</span><span title="Última atualização da base local">${esc(updated)}</span></div></section>`;
    }
    function renderRow({c,identity,totals,budget,testLimit,testRemaining,zeroDays,roi,profit,account,sales,adjustment,rejected,numberReuse,campaignId,policyLimitation,pausedAt,pauseConfirmedAt,saleHistory=[]},headers,referenceDate){
      const paused=c._status==='pausada',reactivated=c._movement==='reativada',
        baseStatus=paused?(rejected?'Pausada por reprovação':'Pausada'):rejected?'Ativa · Reprovada':reactivated?'Reativada':'Ativa',
        statusLabel=numberReuse?`${baseStatus} · Renumerar`:baseStatus,
        statusClass=numberReuse?'numbering':paused||rejected?'paused':reactivated?'reactivated':'',
        rowClass=paused?'paused-row':numberReuse?'numbering-warning-row':rejected?'rejected-row':'',
        manualSales=adjustment?.manualSales??sales?.manualSales??0,
        saleLabel=manualSales?`${manualSales===1?'1 venda provisória':`${manualSales} vendas provisórias`}`:'',
        statusTitle=numberReuse?`A numeração ${numberReuse.group} já apareceu em outra campanha. Use um novo número antes da próxima coleta.`:paused?(pauseConfirmedAt?`Campanha pausada na data ${dateLabel(pauseConfirmedAt)}`:c._lastSeen?`Última aparição em ${dateLabel(c._lastSeen)}`:'Última aparição'):rejected?'A MCC informou reprovação ou não qualificação':statusLabel,
        budgetCaption=budget?.salesCount?`ROI mínimo ${fmtPct(budget.minimumRoi)} · ${fmtNum(budget.salesCount)} venda${budget.salesCount===1?'':'s'}`:'',
        limitContent=budget?`${fmtMoney(testLimit.value)}${budgetCaption?`<a class="test-budget-detail test-budget-roi-link" href="#" data-campaign-id="${esc(campaignId||0)}" data-current-roi="${budget.minimumRoi}" data-current-limit="${budget.limit}" data-total-revenue="${budget.revenue}" aria-label="Editar ROI mínimo e limite de teste" title="Editar ROI mínimo e limite de teste">${esc(budgetCaption)}</a>`:''}`:displayCell(testLimit),
        remainingTitle=budget?(budget.remaining>=0?'Investimento ainda permitido até o limite.':`Limite de teste excedido em ${fmtMoney(Math.abs(budget.remaining))}.`):'',
        remainingValue=budget?.remaining??sortCell(testRemaining),
        remainingAlert=typeof remainingValue==='number'&&remainingValue<140,
        profitClass=profit==null?'':profit<0?'negative':profit>0?'positive':'',
        cells={
        date:`<td>${esc(identity.dateLabel)}</td>`,
        campaign:`<td class="name" title="${esc(c.nome_campanha_exato)}">${esc(identity.name)}</td>`,
        zeroDays:`<td class="num ${zeroDays>0?'negative':'muted'}" title="${zeroDays==null?'Sem histórico diário suficiente':zeroDays===0?'A campanha teve impressões no dia mais recente':`${zeroDays} dia${zeroDays===1?'':'s'} consecutivo${zeroDays===1?'':'s'} sem impressões`}">${zeroDays==null?'—':zeroDays}</td>`,
        current:`<td class="num">${fmtMoney(totals?.investment??null)}</td>`,
        imp:`<td class="num">${fmtNum(totals?.impressions??null)}</td>`,
        clicks:`<td class="num">${fmtNum(totals?.clicks??null)}</td>`,
        conv:`<td class="num">${fmtNum(totals?.conversions??null)}</td>`,
        roi:`<td class="num">${roi==null?'—':fmtPct(roi)}</td>`,
        saleRoiFirst:saleRoiCell(saleHistory[0]),
        saleRoiSecond:saleRoiCell(saleHistory[1]),
        profit:`<td class="num ${profitClass}">${profit==null?'—':fmtMoney(profit)}</td>`,
        account:`<td class="num">${account?esc(account):'—'}</td>`,
        limit:`<td class="num" title="${esc(budgetCaption)}">${limitContent}</td>`,
        remaining:`<td class="num ${remainingAlert?'negative':''}" title="${esc(remainingTitle)}">${budget?fmtMoney(testRemaining.value):displayCell(testRemaining)}</td>`,
        status:`<td><span class="status-tag ${statusClass}" title="${esc(statusTitle)}">${esc(statusLabel)}</span>${saleLabel?`<span class="status-tag sale-tag">${esc(saleLabel)}</span>`:''}${policyLimitation?`<span class="status-tag policy-limited" title="${esc(policyLimitation+'. Consulte “Detalhes da política” na tabela Anúncios para identificar a regra e o alcance da restrição.')}">Limitada pela política</span>`:''}</td>`};
      return`<tr class="${rowClass}${policyLimitation?' policy-limited-row':''}${OverviewDomain.rowVisible({c,pausedAt},state.campaignStatusFilter,referenceDate)?'':' hidden'}" data-campaign="${esc(c.nome_campanha_exato)}" data-source="${paused?'workbook':'manifest'}" data-campaign-id="${esc(campaignId||'')}">${headers.map(([key])=>cells[key].replace('<td',`<td data-column="${key}"`)).join('')}</tr>`
    }
    function renderTotals(){
      const snapshot=getSnapshot(),{activeCount,pausedCount,dates}=snapshot;
      const reservedKpi='<section class="kpi overview-kpi overview-kpi-reserved" aria-hidden="true"></section>';
      const kpiMarkup=`${reservedKpi}${renderD1MetricSummary(snapshot.d1Totals)}`;
      $('#totalsConsolidated').classList.toggle('active',state.totalsMode==='consolidated');$('#totalsD1').classList.toggle('active',state.totalsMode==='d1');$('#totalsD0').classList.toggle('active',state.totalsMode==='d0');
      const totalLabel=state.totalsMode==='d0'?'D zero':state.totalsMode==='d1'?'D−1':'total';
      const columns=OverviewDomain.totalsColumns(state.totalsMode,totalLabel),headers=OverviewDomain.visibleColumns(columns,selectedColumns),numericHeaders=new Set(['zeroDays','current','imp','clicks','conv','roi','saleRoiFirst','saleRoiSecond','profit','account','limit','remaining']);if(!headers.some(([key])=>key===state.sortKey)){state.sortKey=headers.some(([key])=>key==='current')?'current':'campaign';state.sortDir='desc'}
      renderColumnOptions(columns);
      $('.totals-table').setAttribute('style',`min-width:${headers.reduce((sum,[key])=>sum+OverviewDomain.columnWidths[key],0)}px`);
      $('#totalsHead').innerHTML='<tr>'+headers.map(([key,label])=>`<th data-column="${key}" style="width:${OverviewDomain.columnWidths[key]}px"><button class="sort-btn ${numericHeaders.has(key)?'num':''} ${state.sortKey===key?'active':''}" data-sort="${key}" aria-label="Ordenar por ${label}"${key.startsWith('saleRoi')?' title="ROI acumulado no momento do registro da venda manual; não recalculado por período"':''}>${label}<span class="sort-arrow">${state.sortKey===key?(state.sortDir==='asc'?'↑':'↓'):''}</span></button></th>`).join('')+'</tr>';
      const rows=OverviewDomain.sortRows(snapshot.rows,state,sortCell);
      $('#kpis').innerHTML=kpiMarkup+renderD0MetricSummary(rows)+renderD0ProfitSummary(rows,snapshot)+renderManifestSummary(snapshot)+renderBaseSummary(snapshot);$('#kpis').classList.add('has-overview-cards');
      $('#totalsBody').innerHTML=rows.map(row=>renderRow(row,headers,snapshot.referenceDate)).join('');
      $$('.sort-btn').forEach(button=>button.onclick=()=>{const key=button.dataset.sort;if(state.sortKey===key)state.sortDir=state.sortDir==='asc'?'desc':'asc';else{state.sortKey=key;state.sortDir='asc'}renderTotals()});
      $$('.test-budget-roi-link').forEach(link=>{link.onclick=event=>{event.preventDefault();event.stopPropagation();showRoiDialog(link.dataset.campaignId,link.dataset.currentRoi,link.dataset.currentLimit,link.dataset.totalRevenue)};link.ondblclick=event=>event.stopPropagation()});
      $$('#totalsBody tr').forEach(tr=>tr.ondblclick=()=>actions.showProduct(tr.dataset.campaign,tr.dataset.source,tr.dataset.campaignId||null));$('#totalsConsolidated').onclick=()=>{state.totalsMode='consolidated';renderTotals()};$('#totalsD1').onclick=()=>{state.totalsMode='d1';renderTotals()};$('#totalsD0').onclick=()=>{state.totalsMode='d0';renderTotals()};
      $('#campaignStatusFilter').value=state.campaignStatusFilter;
      $('#totalsCaption').textContent=state.totalsMode==='d0'?'Total do dia por campanha, inclusive pausadas; o filtro de situação afeta apenas a tabela':state.totalsMode==='d1'?`Retrato fechado de D−1${dates.d1?` · ${dateLabel(dates.d1)}`:''}`:'';$('#totalsCount').textContent=`${activeCount} ativas${pausedCount?` · ${pausedCount} pausada${pausedCount===1?'':'s'}`:''}`
    }
    $('#campaignStatusFilter').onchange=event=>{state.campaignStatusFilter=event.target.value;renderTotals()};
    return{render:renderTotals};
  }
  global.OverviewView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

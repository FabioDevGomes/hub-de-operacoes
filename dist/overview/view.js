(function(global){
  // Presentation only: the Hub supplies read-only, already consolidated projections.
  function mount({root,state,getSnapshot,domain,format,actions}){
    const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
    const OverviewDomain=domain,{esc,num:fmtNum,money:fmtMoney,pct:fmtPct,date:dateLabel}=format;
    function sortCell(cell){if(!cell||cell.value==null||cell.value==='')return null;if(typeof cell.value==='number')return cell.value;const text=String(cell.text??cell.value).trim();const normalized=text.replace(/[^0-9,.-]/g,'').replaceAll('.','').replace(',','.');const number=Number(normalized);return Number.isFinite(number)?number:text.toLocaleLowerCase('pt-BR')}
    function displayCell(cell){if(!cell||cell.value==null||cell.value==='')return'—';return esc(cell.text??cell.value)}
    const overviewInfoIcon='<svg class="kpi-info-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="8" cy="8" r="5.7" fill="none" stroke="currentColor" stroke-width=".7"/><circle cx="8" cy="4.7" r=".75" fill="currentColor"/><path d="M8 6.8v4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    function metricCoverageTooltip(period,metrics,dayTotals,activeCount,pausedCount){const total=dayTotals.length;if(!total)return`Cobertura ${period}: sem campanhas avaliadas.`;const details=metrics.map(([label,field])=>`${label} ${OverviewDomain.sumObservedMetric(dayTotals,field).observedCount}/${total}`).join(', ');return`Cobertura ${period} — campanhas com dado: ${details}. Escopo: ${activeCount} ativas${pausedCount?` e ${pausedCount} pausadas`:''}.`}
    function renderD0MetricSummary(rows){
      const capturedRows=rows.filter(row=>row.c.metricas_D_zero?.presente!==false),dayTotals=capturedRows.map(row=>row.d0Totals);
      const metrics=[['Investimento','investment',fmtMoney],['Impressões','impressions',fmtNum],['Cliques','clicks',fmtNum]];
      const pausedCount=capturedRows.filter(row=>row.c._status==='pausada').length,activeCount=capturedRows.length-pausedCount,coverageTooltip=metricCoverageTooltip('D0',metrics,dayTotals,activeCount,pausedCount);
      return`<div class="kpi-group kpi-group-d0" role="group" aria-label="Indicadores D0"><span class="kpi-group-label">D0</span><button class="kpi-info" type="button" title="${esc(coverageTooltip)}" aria-label="${esc(coverageTooltip)}">${overviewInfoIcon}</button>${metrics.map(([label,field,format])=>{const result=OverviewDomain.sumObservedMetric(dayTotals,field);return`<div class="kpi"><span class="kpi-label">${label}</span><strong class="kpi-value">${result.value==null?'—':format(result.value)}</strong></div>`}).join('')}</div>`;
    }
    function renderD0ProfitSummary(rows){
      const dayTotals=rows.filter(row=>row.c.metricas_D_zero?.presente!==false).map(row=>row.d0ProfitTotals??row.d0Totals),result=OverviewDomain.sumObservedProfit(dayTotals),profitClass=result.value==null?'':result.value<0?'negative':result.value>0?'positive':'',status=result.value==null?'sem dados':result.value<0?'negativo':result.value>0?'positivo':'zerado',value=result.value==null?'—':`${result.value>0?'+':''}${fmtMoney(result.value)}`,tooltip=`Lucro do dia = comissão observada + ajustes de vendas provisórias − investimento observado. Resultado ${status}. Cobertura: ${result.observedCount}/${result.totalCount} campanhas com investimento e comissão/ajuste disponíveis.`;
      return`<div class="kpi kpi-d0-profit" title="${esc(tooltip)}" aria-label="Lucro do dia ${esc(status)}: ${esc(value)}"><span class="kpi-label">Lucro do dia</span><strong class="kpi-value ${profitClass}">${value}</strong></div>`;
    }
    function renderD1MetricSummary(dayTotals,activeCount,pausedCount){
      const metrics=[['Investimento','investment',fmtMoney],['Impressões','impressions',fmtNum],['Cliques','clicks',fmtNum]],coverageTooltip=metricCoverageTooltip('D−1',metrics,dayTotals,activeCount,pausedCount);
      return`<div class="kpi-group kpi-group-d1" role="group" aria-label="Indicadores D−1"><span class="kpi-group-label">D−1</span><button class="kpi-info" type="button" title="${esc(coverageTooltip)}" aria-label="${esc(coverageTooltip)}">${overviewInfoIcon}</button>${metrics.map(([label,field,format])=>{const result=OverviewDomain.sumObservedMetric(dayTotals,field);return`<div class="kpi"><span class="kpi-label">${label}</span><strong class="kpi-value">${result.value==null?'—':format(result.value)}</strong></div>`}).join('')}</div>`;
    }
    function renderRow({c,identity,totals,budget,testLimit,testRemaining,zeroDays,roi,profit,account,sales,adjustment,rejected,numberReuse,campaignId,policyLimitation,pausedAt,pauseConfirmedAt},headers,referenceDate){
      const paused=c._status==='pausada',reactivated=c._movement==='reativada',
        baseStatus=paused?(rejected?'Pausada por reprovação':'Pausada'):rejected?'Ativa · Reprovada':reactivated?'Reativada':'Ativa',
        statusLabel=numberReuse?`${baseStatus} · Renumerar`:baseStatus,
        statusClass=numberReuse?'numbering':paused||rejected?'paused':reactivated?'reactivated':'',
        rowClass=paused?'paused-row':numberReuse?'numbering-warning-row':rejected?'rejected-row':'',
        manualSales=adjustment?.manualSales??sales?.manualSales??0,
        saleLabel=manualSales?`${manualSales===1?'1 venda provisória':`${manualSales} vendas provisórias`}`:'',
        statusTitle=numberReuse?`A numeração ${numberReuse.group} já apareceu em outra campanha. Use um novo número antes da próxima coleta.`:paused?(pauseConfirmedAt?`Campanha pausada na data ${dateLabel(pauseConfirmedAt)}`:c._lastSeen?`Última aparição em ${dateLabel(c._lastSeen)}`:'Última aparição'):rejected?'A MCC informou reprovação ou não qualificação':statusLabel,
        budgetCaption=budget?.salesCount?`ROI mínimo ${fmtPct(budget.minimumRoi)} · ${fmtNum(budget.salesCount)} venda${budget.salesCount===1?'':'s'}`:'',
        limitContent=budget?`${fmtMoney(testLimit.value)}${budgetCaption?`<a class="test-budget-detail test-budget-roi-link" href="#" data-campaign-id="${esc(campaignId||0)}" data-current-roi="${budget.minimumRoi}" aria-label="Editar ROI mínimo" title="Editar ROI mínimo">${esc(budgetCaption)}</a>`:''}`:displayCell(testLimit),
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
        profit:`<td class="num ${profitClass}">${profit==null?'—':fmtMoney(profit)}</td>`,
        account:`<td class="num">${account?esc(account):'—'}</td>`,
        limit:`<td class="num" title="${esc(budgetCaption)}">${limitContent}</td>`,
        remaining:`<td class="num ${remainingAlert?'negative':''}" title="${esc(remainingTitle)}">${budget?fmtMoney(testRemaining.value):displayCell(testRemaining)}</td>`,
        status:`<td><span class="status-tag ${statusClass}" title="${esc(statusTitle)}">${esc(statusLabel)}</span>${saleLabel?`<span class="status-tag sale-tag">${esc(saleLabel)}</span>`:''}${policyLimitation?`<span class="status-tag policy-limited" title="${esc(policyLimitation+'. Consulte “Detalhes da política” na tabela Anúncios para identificar a regra e o alcance da restrição.')}">Limitada pela política</span>`:''}</td>`};
      return`<tr class="${rowClass}${policyLimitation?' policy-limited-row':''}${OverviewDomain.rowVisible({c,pausedAt},state.campaignStatusFilter,referenceDate)?'':' hidden'}" data-campaign="${esc(c.nome_campanha_exato)}" data-source="${paused?'workbook':'manifest'}" data-campaign-id="${esc(campaignId||'')}">${headers.map(([key])=>cells[key]).join('')}</tr>`
    }
    function renderTotals(){
      const snapshot=getSnapshot(),{activeCount,pausedCount,dates}=snapshot;
      const activeKpi=`<div class="kpi"><span class="kpi-label">Campanhas ativas</span><strong class="kpi-value">${fmtNum(activeCount)}</strong><span class="kpi-foot">${pausedCount?`${pausedCount} pausada${pausedCount===1?'':'s'}`:'nenhuma pausa detectada'}</span></div>`;
      const kpiMarkup=`${activeKpi}${renderD1MetricSummary(snapshot.d1Totals,activeCount,pausedCount)}`;
      $('#totalsConsolidated').classList.toggle('active',state.totalsMode==='consolidated');$('#totalsD1').classList.toggle('active',state.totalsMode==='d1');$('#totalsD0').classList.toggle('active',state.totalsMode==='d0');
      const totalLabel=state.totalsMode==='d0'?'D zero':state.totalsMode==='d1'?'D−1':'total';
      const headers=OverviewDomain.totalsColumns(state.totalsMode,totalLabel),numericHeaders=new Set(['zeroDays','current','imp','clicks','conv','roi','profit','account','limit','remaining']);if(!headers.some(([key])=>key===state.sortKey)){state.sortKey='current';state.sortDir='desc'}
      $('#totalsHead').innerHTML='<tr>'+headers.map(([key,label])=>`<th><button class="sort-btn ${numericHeaders.has(key)?'num':''} ${state.sortKey===key?'active':''}" data-sort="${key}" aria-label="Ordenar por ${label}">${label}<span class="sort-arrow">${state.sortKey===key?(state.sortDir==='asc'?'↑':'↓'):''}</span></button></th>`).join('')+'</tr>';
      const rows=OverviewDomain.sortRows(snapshot.rows,state,sortCell);
      $('#kpis').innerHTML=kpiMarkup+renderD0MetricSummary(rows)+renderD0ProfitSummary(rows);$('#kpis').classList.add('has-d0-summary');
      $('#totalsBody').innerHTML=rows.map(row=>renderRow(row,headers,snapshot.referenceDate)).join('');
      $$('.sort-btn').forEach(button=>button.onclick=()=>{const key=button.dataset.sort;if(state.sortKey===key)state.sortDir=state.sortDir==='asc'?'desc':'asc';else{state.sortKey=key;state.sortDir='asc'}renderTotals()});
      $$('.test-budget-roi-link').forEach(link=>{link.onclick=event=>{event.preventDefault();event.stopPropagation();void actions.editMinimumRoi(link.dataset.campaignId,link.dataset.currentRoi)};link.ondblclick=event=>event.stopPropagation()});
      $$('#totalsBody tr').forEach(tr=>tr.ondblclick=()=>actions.showProduct(tr.dataset.campaign,tr.dataset.source,tr.dataset.campaignId||null));$('#totalsConsolidated').onclick=()=>{state.totalsMode='consolidated';renderTotals()};$('#totalsD1').onclick=()=>{state.totalsMode='d1';renderTotals()};$('#totalsD0').onclick=()=>{state.totalsMode='d0';renderTotals()};
      $('#campaignStatusFilter').value=state.campaignStatusFilter;
      $('#totalsCaption').textContent=state.totalsMode==='d0'?'Total do dia por campanha, inclusive pausadas; o filtro de situação afeta apenas a tabela':state.totalsMode==='d1'?`Retrato fechado de D−1${dates.d1?` · ${dateLabel(dates.d1)}`:''}`:'Totais do histórico por campanha, incluindo o retrato mais recente de D zero';$('#totalsCount').textContent=`${activeCount} ativas${pausedCount?` · ${pausedCount} pausada${pausedCount===1?'':'s'}`:''}`
    }
    $('#campaignStatusFilter').onchange=event=>{state.campaignStatusFilter=event.target.value;renderTotals()};
    return{render:renderTotals};
  }
  global.OverviewView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

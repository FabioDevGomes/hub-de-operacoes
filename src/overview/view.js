(function(global){
  // Presentation only: the Hub supplies read-only, already consolidated projections.
  function mount({root,state,getSnapshot,domain,format,actions,preferences}){
    const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
    const OverviewDomain=domain,{esc,num:fmtNum,money:fmtMoney,pct:fmtPct,date:dateLabel}=format;
    const columnPreferenceKey='hub:overview:visible-columns:v1';let selectedColumns=null;
    const picker=$('#overviewColumnPicker'),viewport=root.ownerDocument?.defaultView;
    // Widths are presentation preferences only, shared by all three periods.
    const widthPreferenceKey='hub:overview:column-widths:v1',widthDefaults=OverviewDomain.columnWidths;
    const widthMinimum=key=>key==='campaign'?160:key==='date'?52:64;
    const clampWidth=(key,value)=>Math.round(Math.min(1200,Math.max(widthMinimum(key),value)));
    let columnWidths={},resizeGesture=null,visibleWidthKeys=[];
    try{const saved=JSON.parse(preferences?.getItem(widthPreferenceKey)||'null');if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const key of Object.keys(widthDefaults)){const value=saved[key];if(typeof value==='number'&&Number.isFinite(value)&&value>0)columnWidths[key]=clampWidth(key,value)}}catch{}
    const columnWidth=key=>columnWidths[key]??widthDefaults[key];
    function saveWidths(){try{if(!preferences?.setItem)throw Error('Storage unavailable');preferences.setItem(widthPreferenceKey,JSON.stringify(columnWidths));$('#overviewWidthsMessage').textContent=''}catch{$('#overviewWidthsMessage').textContent='Larguras ajustadas nesta sessão; não foi possível salvá-las no navegador.'}}
    function applyWidths(){
      const total=visibleWidthKeys.reduce((sum,key)=>sum+columnWidth(key),0),custom=Object.keys(columnWidths).length>0;
      $('.totals-table').setAttribute('style',`min-width:${total}px${custom?`;width:${total}px`:''}`);
      $$('#totalsHead th[data-column]').forEach(th=>th.setAttribute('style',`width:${columnWidth(th.dataset.column)}px`));
      $$('.overview-column-resizer').forEach(handle=>handle.setAttribute('aria-valuenow',columnWidth(handle.dataset.resizeColumn)));
    }
    function freezeRenderedWidths(){
      // Freeze actual rendered widths before dragging so neighbouring columns do not jump.
      $$('#totalsHead th[data-column]').forEach(th=>{const key=th.dataset.column,width=th.getBoundingClientRect?.().width;if(Number.isFinite(width)&&width>0)columnWidths[key]=clampWidth(key,width)});
    }
    function endResize(cancel=false){
      if(!resizeGesture)return;
      const gesture=resizeGesture;resizeGesture=null;
      root.classList.remove('overview-resizing');gesture.handle.classList.remove('is-resizing');
      if(gesture.handle.hasPointerCapture?.(gesture.pointerId))gesture.handle.releasePointerCapture(gesture.pointerId);
      if(cancel||!gesture.changed)columnWidths=gesture.previous;else saveWidths();
      applyWidths();
    }
    function moveResize(event){
      const gesture=resizeGesture;if(!gesture||event.pointerId!==gesture.pointerId||!Number.isFinite(event.clientX))return;
      const width=clampWidth(gesture.key,gesture.startWidth+event.clientX-gesture.startX);
      columnWidths[gesture.key]=width;gesture.changed=width!==gesture.startWidth;applyWidths();
    }
    function bindColumnResizers(){
      $$('.overview-column-resizer').forEach(handle=>{
        handle.onclick=handle.ondblclick=event=>{event.preventDefault();event.stopPropagation()};
        handle.onpointerdown=event=>{
          if(event.button!==0||resizeGesture||!Number.isFinite(event.clientX))return;
          event.preventDefault();event.stopPropagation();
          const previous={...columnWidths};freezeRenderedWidths();
          const key=handle.dataset.resizeColumn;
          resizeGesture={key,handle,previous,pointerId:event.pointerId,startX:event.clientX,startWidth:columnWidth(key),changed:false};
          handle.setPointerCapture(event.pointerId);handle.classList.add('is-resizing');root.classList.add('overview-resizing');applyWidths();
        };
        handle.onpointermove=moveResize;
        handle.onpointerup=event=>{if(resizeGesture?.pointerId===event.pointerId){moveResize(event);endResize()}};
        handle.onpointercancel=handle.onlostpointercapture=()=>endResize(true);
        handle.onkeydown=event=>{
          if(event.key==='Escape'&&resizeGesture){event.preventDefault();endResize(true);return}
          if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
          event.preventDefault();event.stopPropagation();const key=handle.dataset.resizeColumn,previous={...columnWidths};freezeRenderedWidths();
          const current=columnWidth(key);
          const width=clampWidth(key,columnWidth(key)+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?30:10));
          if(width===current){columnWidths=previous;return}columnWidths[key]=width;applyWidths();saveWidths();
        };
      });
    }
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
    const commissionDialog=$('#commissionTestDialog'),commissionForm=$('#commissionTestForm'),commissionLimit=$('#commissionTestLimit'),commissionPercent=$('#commissionTestPercent'),commissionError=$('#commissionTestError');let commissionBrl=null;
    function setCommissionError(message){commissionError.textContent=message||'';commissionDialog.dataset.syncValid=message?'false':'true'}
    function showCommissionDialog(data){commissionDialog.dataset.campaignId=data.campaignId;commissionBrl=Number(data.commissionBrl);commissionLimit.value=inputNumber(data.currentLimit);commissionPercent.value=String(data.currentPercent).replace('.',',');setCommissionError('');if(typeof commissionDialog.showModal==='function')commissionDialog.showModal();else commissionDialog.open=true;commissionPercent.focus?.()}
    commissionPercent.oninput=()=>{try{commissionLimit.value=inputNumber(OverviewDomain.testLimitForCommission(commissionBrl,commissionPercent.value));setCommissionError('')}catch(error){setCommissionError(error.message)}};
    commissionLimit.oninput=()=>{try{commissionPercent.value=String(OverviewDomain.percentForCommissionLimit(commissionBrl,commissionLimit.value)).replace('.',',');setCommissionError('')}catch(error){setCommissionError(error.message)}};
    $('#commissionTestCancel').onclick=()=>commissionDialog.close?.();
    commissionForm.onsubmit=async event=>{event.preventDefault();try{const percent=OverviewDomain.parseCommissionTestPercent(commissionPercent.value);OverviewDomain.testLimitForCommission(commissionBrl,percent);if(commissionDialog.dataset.syncValid==='false')throw new Error('Corrija os campos antes de confirmar.');commissionForm.querySelector('[type="submit"]').disabled=true;await actions.editCommissionTestPercent(commissionDialog.dataset.campaignId,percent);commissionDialog.close?.();if(typeof commissionDialog.close!=='function')commissionDialog.open=false}catch(error){setCommissionError(error.message||'Não foi possível salvar o limite.')}finally{commissionForm.querySelector('[type="submit"]').disabled=false}};
    const testRulesDialog=$('#overviewTestRulesDialog'),testRulesForm=$('#overviewTestRulesForm'),testRulesError=$('#overviewTestRulesError'),testRulesSubmit=testRulesForm.querySelector('[type="submit"]');
    const testRulesInputs={cpaMinimumPercent:$('#overviewTestCpaThreshold'),commissionPercent:$('#overviewTestCommissionPercent'),roiBySales:{1:$('#overviewTestRoiOne'),2:$('#overviewTestRoiTwo'),3:$('#overviewTestRoiThree'),4:$('#overviewTestRoiFour')}};
    function showTestRulesDialog(){const settings=OverviewDomain.testLimitSettings(getSnapshot().testLimitSettings);testRulesInputs.cpaMinimumPercent.value=inputNumber(settings.cpaMinimumPercent);testRulesInputs.commissionPercent.value=inputNumber(settings.commissionPercent);for(let sales=1;sales<=4;sales++)testRulesInputs.roiBySales[sales].value=inputNumber(settings.roiBySales[sales]);testRulesError.textContent='';if(typeof testRulesDialog.showModal==='function')testRulesDialog.showModal();else testRulesDialog.open=true;testRulesInputs.cpaMinimumPercent.focus?.()}
    $('#overviewTestRulesCancel').onclick=()=>testRulesDialog.close?.();
    testRulesForm.onsubmit=async event=>{event.preventDefault();const submit=testRulesSubmit;if(submit.disabled)return;let settings;try{settings={cpaMinimumPercent:OverviewDomain.parseCommissionTestPercent(testRulesInputs.cpaMinimumPercent.value),commissionPercent:OverviewDomain.parseCommissionTestPercent(testRulesInputs.commissionPercent.value),roiBySales:Object.fromEntries([1,2,3,4].map(sales=>[sales,OverviewDomain.parseMinimumRoi(testRulesInputs.roiBySales[sales].value)]))};testRulesError.textContent='';submit.disabled=true;submit.textContent='Salvando…';await actions.editTestLimitSettings(settings);testRulesDialog.close?.();if(typeof testRulesDialog.close!=='function')testRulesDialog.open=false}catch(error){testRulesError.textContent=error.message||'Não foi possível salvar as regras.'}finally{submit.disabled=false;submit.textContent='OK'}};
    const remainingDialog=$('#remainingAlertDialog'),remainingForm=$('#remainingAlertForm'),remainingInput=$('#remainingAlertMinimum'),remainingYellowInput=$('#remainingAlertYellowMinimum'),remainingError=$('#remainingAlertError');
    function showRemainingDialog(){const snapshot=getSnapshot(),yellow=OverviewDomain.remainingWarningThreshold(snapshot.remainingAlertYellowMinimum);remainingInput.value=inputNumber(OverviewDomain.remainingAlertThreshold(snapshot.remainingAlertMinimum));remainingYellowInput.value=yellow==null?'':inputNumber(yellow);remainingError.textContent='';if(typeof remainingDialog.showModal==='function')remainingDialog.showModal();else remainingDialog.open=true;remainingInput.focus?.()}
    $('#remainingAlertCancel').onclick=()=>remainingDialog.close?.();
    remainingForm.onsubmit=async event=>{event.preventDefault();const submit=remainingForm.querySelector('[type="submit"]');if(submit.disabled)return;try{const minimum=OverviewDomain.parseRemainingAlert(remainingInput.value),yellowMinimum=remainingYellowInput.value.trim()===''?null:OverviewDomain.parseRemainingAlert(remainingYellowInput.value);remainingError.textContent='';submit.disabled=true;submit.textContent='Salvando…';await actions.editRemainingAlert(minimum,yellowMinimum);remainingDialog.close?.();if(typeof remainingDialog.close!=='function')remainingDialog.open=false;refreshRemainingAlerts({minimum,yellowMinimum})}catch(error){remainingError.textContent=error.message||'Não foi possível salvar o alerta.'}finally{submit.disabled=false;submit.textContent='OK'}};
    function remainingAlertTitle(minimum,yellowMinimum){return`Vermelho abaixo de ${fmtMoney(minimum)}; ${yellowMinimum==null?'amarelo desativado':`amarelo abaixo de ${fmtMoney(yellowMinimum)}`} (vermelho tem prioridade)`}
    function refreshRemainingAlerts({minimum,yellowMinimum}){
      const red=OverviewDomain.remainingAlertThreshold(minimum),yellow=OverviewDomain.remainingWarningThreshold(yellowMinimum);
      $$('#totalsBody td[data-column="remaining"]').forEach(cell=>{const tone=OverviewDomain.remainingAlertTone(cell.dataset.remainingValue,red,yellow);cell.classList.toggle('negative',tone==='negative');cell.classList.toggle('remaining-warning',tone==='remaining-warning')});
      $$('.overview-remaining-edit').forEach(link=>link.setAttribute('title',remainingAlertTitle(red,yellow)));
    }
    const fractionalDialog=$('#fractionalValueDialog'),fractionalList=$('#fractionalValueList');
    const pausedTodayDialog=$('#pausedTodayDialog'),pausedTodayList=$('#pausedTodayList'),pausedTodaySummary=$('#pausedTodaySummary');
    function showPausedTodayDialog(){
      const snapshot=getSnapshot(),names=Array.isArray(snapshot.pausedTodayCampaigns)?snapshot.pausedTodayCampaigns:[],day=snapshot.pausedTodayDate?dateLabel(snapshot.pausedTodayDate):'hoje';
      pausedTodaySummary.textContent=names.length?fmtNum(names.length)+' campanha(s) com pausa registrada em '+day+'.':'Nenhuma campanha pausou hoje.';
      pausedTodayList.hidden=names.length===0;
      pausedTodayList.innerHTML=names.map(name=>'<li>'+esc(name)+'</li>').join('');
      if(typeof pausedTodayDialog.showModal==='function')pausedTodayDialog.showModal();else pausedTodayDialog.open=true;
      $('#pausedTodayClose').focus?.();
    }
    $('#pausedTodayClose').onclick=()=>pausedTodayDialog.close?.();
    function parseRealValue(value){let text=String(value??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');if(!text)throw new Error('Informe o novo valor em reais.');if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw new Error('Use um valor em reais com até duas casas decimais.');const amount=Number(text);if(!Number.isFinite(amount)||amount<=0)throw new Error('O valor real deve ser maior que zero.');return Number(amount.toFixed(2))}
    function renderFractionalValueRows(items=[],drafts=new Map()){
      const rows=Array.isArray(items)?items:[];
      if(!rows.length){fractionalList.innerHTML='<p class="overview-fractional-empty">Todos os valores reais pendentes foram confirmados.</p>';return}
      fractionalList.innerHTML=rows.map(item=>`<div class="overview-fractional-row" data-fractional-row="${esc(item.confirmationKey)}"><div class="overview-fractional-product"><strong>${esc(item.productName||'Produto não identificado')}</strong><small>${esc(dateLabel(item.date))} · ${item.period==='d1'?'D−1':'D0'} · MCC ${fmtNum(item.conversions)} conversão(ões)</small></div><div class="overview-fractional-current"><span>Atual (MCC)</span><strong>${item.currentValueBrl==null?'—':fmtMoney(item.currentValueBrl)}</strong></div><label class="overview-fractional-new"><span>Novo valor (R$)</span><input class="overview-fractional-value-input" data-fractional-value="" data-confirmation-key="${esc(item.confirmationKey)}" type="text" inputmode="decimal" autocomplete="off" placeholder="ex.: 240,00" value="${esc(drafts.get(item.confirmationKey)||'')}" aria-label="Novo valor real de ${esc(item.productName||'produto')}"></label><div class="overview-fractional-submit"><button class="btn primary overview-fractional-confirm-button" type="button" data-confirmation-key="${esc(item.confirmationKey)}">Confirmar</button><span class="overview-fractional-row-error" data-fractional-row-error="${esc(item.confirmationKey)}" role="alert" aria-live="polite"></span></div></div>`).join('');
      $$('.overview-fractional-confirm-button').forEach(button=>{button.onclick=async event=>{event.preventDefault();const key=button.dataset.confirmationKey,input=$$('.overview-fractional-value-input').find(node=>node.dataset.confirmationKey===key),rowError=$$('.overview-fractional-row-error').find(node=>node.dataset.fractionalRowError===key);if(!input)return;let amount;try{amount=parseRealValue(input.value);if(typeof actions.confirmFractionalValue!=='function')throw new Error('A confirmação de valores reais não está disponível.')}catch(error){if(rowError)rowError.textContent=error.message;return}button.disabled=true;button.textContent='Salvando…';if(rowError)rowError.textContent='';try{await actions.confirmFractionalValue(key,amount);const draftsNow=new Map($$('.overview-fractional-value-input').map(field=>[field.dataset.confirmationKey,field.value]));renderTotals();renderFractionalValueRows(getSnapshot().fractionalValuePendingItems||[],draftsNow)}catch(error){if(rowError)rowError.textContent=error.message||'Não foi possível confirmar este valor.';button.disabled=false;button.textContent='Confirmar'}}});
    }
    function showFractionalDialog(){renderFractionalValueRows(getSnapshot().fractionalValuePendingItems||[]);if(typeof fractionalDialog.showModal==='function')fractionalDialog.showModal();else fractionalDialog.open=true;$$('.overview-fractional-value-input')[0]?.focus?.()}
    $('#fractionalValueCancel').onclick=()=>fractionalDialog.close?.();
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
    function renderD1ProfitSummary(dayTotals){
      const result=OverviewDomain.sumObservedProfit(dayTotals),profitClass=result.value==null?'':result.value<0?'negative':result.value>0?'positive':'',status=result.value==null?'sem dados':result.value<0?'negativo':result.value>0?'positivo':'zerado',value=result.value==null?'—':`${result.value>0?'+':''}${fmtMoney(result.value)}`,tooltip=`Lucro de D−1 = comissão observada − investimento observado. Resultado ${status}. Cobertura: ${result.observedCount}/${result.totalCount} campanhas com investimento e comissão disponíveis.`;
      return`<section class="kpi overview-kpi overview-kpi-profit kpi-group-d1 kpi-d1-profit" title="${esc(tooltip)}" aria-label="Lucro de D−1 ${esc(status)}: ${esc(value)}"><div class="overview-kpi-heading"><span class="kpi-label">Lucro do dia</span><span class="overview-kpi-context">D−1</span></div><div class="overview-kpi-main"><strong class="kpi-value ${profitClass}">${value}</strong></div><div class="overview-kpi-details"><span class="kpi-foot">Comissão observada − investimento</span></div></section>`;
    }
    function renderD1MetricSummary(dayTotals){
      const metrics=[['Investimento','investment',fmtMoney],['Impressões','impressions',fmtNum],['Cliques','clicks',fmtNum]],results=metrics.map(([label,field,format])=>({label,format,result:OverviewDomain.sumObservedMetric(dayTotals,field)}));
      return`<section class="kpi overview-kpi overview-kpi-period kpi-group-d1" role="group" aria-label="Indicadores D−1"><div class="overview-kpi-heading"><span class="kpi-group-label">D−1</span></div><div class="overview-kpi-main"><span class="overview-kpi-main-label">${results[0].label}</span><strong class="kpi-value">${results[0].result.value==null?'—':results[0].format(results[0].result.value)}</strong></div><div class="overview-kpi-details">${metricDetail(results[1].label,results[1].result,results[1].format)}${metricDetail(results[2].label,results[2].result,results[2].format)}</div></section>`;
    }
    function manifestPeriodMarkup(snapshot,period,name){
      const dates=snapshot.dates||{},coverage=snapshot.manifestMccCoverage?.[period]||{},complete=coverage.complete===true,status=`${name}: ${Number(coverage.receivedCount)||0} de ${Number(coverage.expectedCount)||2} MCCs com captura para ${dateLabel(dates[period])}`;
      return`<span class="overview-manifest-period" title="${esc(status)}"><span class="dot overview-manifest-dot${complete?'':' warn'}" role="img" aria-label="${esc(status)}"></span><span>${name}</span><strong>${esc(dateLabel(dates[period]))}</strong></span>`;
    }
    function renderManifestSummary(snapshot){
      const capture=snapshot.manifestCaptureInfo||{},date=capture.timestamp?new Date(capture.timestamp):null,valid=date&&Number.isFinite(date.getTime()),options={timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'},time=valid?new Intl.DateTimeFormat('pt-BR',options).format(date):'—',label=capture.source==='generated'?'Manifesto gerado':'Última captura',detail=valid?`${label}: ${new Intl.DateTimeFormat('pt-BR',{...options,day:'2-digit',month:'2-digit',year:'numeric'}).format(date)} (Brasília)`:'Horário da última captura indisponível',updates=snapshot.mccImportUpdates||{},formatMccUpdate=(key,label)=>{const update=updates[key]||{},date=update.timestamp?new Date(update.timestamp):null,hasTimestamp=date&&Number.isFinite(date.getTime()),formatted=hasTimestamp?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date):'Sem registro',title=update.source==='capture'?'Horário da última captura da MCC; o histórico antigo não registra o horário individual de envio.':update.source==='import'?'Horário da última importação desta MCC.':'Nenhum horário de importação registrado para esta MCC.';return`<span aria-label="MCC ${esc(label)}: ${esc(formatted)}" title="${esc(title)}">${label}: ${esc(formatted)}</span>`};
      return`<section class="kpi overview-kpi overview-kpi-manifest" title="${esc(detail)}" aria-label="Manifesto MCC: horário e últimas atualizações das MCCs"><div class="overview-kpi-heading"><span class="kpi-label">Manifesto MCC</span></div><div class="overview-kpi-main overview-kpi-meta-main"><strong class="kpi-value">${esc(time)}</strong><span class="overview-kpi-main-label">${valid?label:'Horário indisponível'}</span></div><div class="overview-kpi-mcc-updates" aria-label="Últimas atualizações das MCCs">${formatMccUpdate('ecom','Ecom')}${formatMccUpdate('nutra','Nutra')}</div></section>`;
    }
    function renderBaseSummary(snapshot){
      const pending=Math.max(0,Number(snapshot.pendingSaleCount)||0),fractional=Math.max(0,Number(snapshot.fractionalSaleCount)||0),attention=pending+fractional,pendingTitle=fractional>0?(fractional===1?'Venda fracionária,':'Vendas fracionárias,'):(pending===1?'Venda provisória,':'Vendas provisórias,'),pendingStatus=fractional>0?`${fmtNum(fractional)} com valor real a confirmar${pending>0?` · ${fmtNum(pending)} pendente(s) de MCC`:''}`:pending===1?'pendente de confirmação':'pendentes de confirmação',pendingStatusMarkup=fractional>0?`<a class="overview-kpi-main-label overview-kpi-fractional-link" href="#" aria-haspopup="dialog" aria-controls="fractionalValueDialog">${esc(pendingStatus)}</a>`:`<span class="overview-kpi-main-label">${esc(pendingStatus)}</span>`,pendingDotClass=attention>0?'dot warn':'dot',tooltip=fractional>0?'A MCC reconheceu conversão(ões) fracionária(s), contada(s) como venda(s), mas o valor pode estar incompleto ou ausente. Clique no link para informar e confirmar o valor real.':'Vendas registradas manualmente permanecem provisórias até serem conciliadas com os dados da MCC.',updates=snapshot.mccImportUpdates||{},formatMccUpdate=(key,label)=>{const update=updates[key]||{},date=update.timestamp?new Date(update.timestamp):null,valid=date&&Number.isFinite(date.getTime()),formatted=valid?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date):'Sem registro',sourceSuffix=update.source==='capture'?' · captura':'',title=update.source==='capture'?'Horário da última captura da MCC; o histórico antigo não registra o horário individual de envio.':update.source==='import'?'Horário da última importação desta MCC.':'Nenhum horário de importação registrado para esta MCC.';return`<span title="${esc(title)}">${label}: ${esc(formatted+sourceSuffix)}</span>`};
      return`<section class="kpi overview-kpi overview-kpi-base" aria-label="Vendas provisórias e datas D−1 e D0"><div class="overview-kpi-heading"><span class="overview-kpi-pending-title"><span class="${pendingDotClass} overview-kpi-pending-dot" aria-hidden="true"></span><span class="kpi-label">${pendingTitle}</span></span><span class="overview-info-icon" role="img" aria-label="Informações sobre vendas provisórias e fracionárias" title="${esc(tooltip)}"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="6.25"/><path d="M8 7.1v4.1M8 4.8h.01"/></svg></span></div><div class="overview-kpi-main overview-kpi-meta-main"><strong class="kpi-value">${fmtNum(attention)}</strong>${pendingStatusMarkup}</div><div class="overview-kpi-dates" aria-label="Datas D−1 e D0">${manifestPeriodMarkup(snapshot,'d1','D−1')}<span class="overview-manifest-separator" aria-hidden="true">·</span>${manifestPeriodMarkup(snapshot,'d0','D0')}</div></section>`;
    }
    function renderRow({c,identity,totals,budget,testLimit,testRemaining,zeroDays,roi,profit,account,sales,adjustment,rejected,numberReuse,campaignId,policyLimitation,pausedAt,pauseConfirmedAt,diaryName,diarySource,saleHistory=[]},headers,referenceDate,remainingMinimum,remainingYellowMinimum){
      const paused=c._status==='pausada',historical=c._status==='historico',reactivated=c._movement==='reativada',
        baseStatus=historical?(diarySource==='legacy'?'Resumo Totais':'Histórico'):paused?(rejected?'Pausada por reprovação':'Pausada'):rejected?'Ativa · Reprovada':reactivated?'Reativada':'Ativa',
        statusLabel=numberReuse?`${baseStatus} · Renumerar`:baseStatus,
        statusClass=numberReuse?'numbering':paused||rejected?'paused':reactivated?'reactivated':'',
        rowClass=paused?'paused-row':numberReuse?'numbering-warning-row':rejected?'rejected-row':'',
        manualSales=adjustment?.manualSales??sales?.manualSales??0,
        saleLabel=manualSales?`${manualSales===1?'1 venda provisória':`${manualSales} vendas provisórias`}`:'',
        statusTitle=numberReuse?`A numeração ${numberReuse.group} já apareceu em outra campanha. Use um novo número antes da próxima coleta.`:paused?(pauseConfirmedAt?`Campanha pausada na data ${dateLabel(pauseConfirmedAt)}`:c._lastSeen?`Última aparição em ${dateLabel(c._lastSeen)}`:'Última aparição'):rejected?'A MCC informou reprovação ou não qualificação':statusLabel,
        commissionCaption=budget?.salesCount===0&&budget.cpaPercent>=budget.cpaMinimumPercent?`CPA ${fmtNum(budget.cpaPercent,budget.cpaPercent%1?2:0)}% · até ${fmtNum(budget.commissionTestPercent,budget.commissionTestPercent%1?2:0)}% / comissão`:'',
        budgetCaption=budget?.salesCount?`ROI mínimo ${fmtPct(budget.minimumRoi)} · ${fmtNum(budget.salesCount)} venda${budget.salesCount===1?'':'s'}`:commissionCaption,
        limitLink=commissionCaption?`<a class="test-budget-detail test-budget-roi-link test-budget-commission-link" href="#" data-campaign-id="${esc(campaignId||0)}" data-current-percent="${budget.commissionTestPercent}" data-current-limit="${budget.limit}" data-commission-brl="${budget.commissionBrl}" aria-label="Editar percentual da comissão e limite inicial de teste" aria-haspopup="dialog" aria-controls="commissionTestDialog" title="Editar percentual da comissão e limite inicial de teste">${esc(commissionCaption)}</a>`:budgetCaption?`<a class="test-budget-detail test-budget-roi-link" href="#" data-campaign-id="${esc(campaignId||0)}" data-current-roi="${budget.minimumRoi}" data-current-limit="${budget.limit}" data-total-revenue="${budget.revenue}" aria-label="Editar ROI mínimo e limite de teste" title="Editar ROI mínimo e limite de teste">${esc(budgetCaption)}</a>`:'',
        limitContent=budget?`${fmtMoney(testLimit.value)}${limitLink}`:displayCell(testLimit),
        remainingTitle=budget?(budget.remaining>=0?'Investimento ainda permitido até o limite.':`Limite de teste excedido em ${fmtMoney(Math.abs(budget.remaining))}.`):'',
        remainingValue=budget?.remaining??sortCell(testRemaining),
        remainingTone=OverviewDomain.remainingAlertTone(remainingValue,remainingMinimum,remainingYellowMinimum),
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
        remaining:`<td class="num ${remainingTone}" title="${esc(remainingTitle)}" data-remaining-value="${typeof remainingValue==='number'&&Number.isFinite(remainingValue)?remainingValue:''}">${budget?fmtMoney(testRemaining.value):displayCell(testRemaining)}</td>`,
        status:`<td><span class="status-tag ${statusClass}" title="${esc(statusTitle)}">${esc(statusLabel)}</span>${saleLabel?`<span class="status-tag sale-tag">${esc(saleLabel)}</span>`:''}${policyLimitation?`<span class="status-tag policy-limited" title="${esc(policyLimitation+'. Consulte “Detalhes da política” na tabela Anúncios para identificar a regra e o alcance da restrição.')}">Limitada pela política</span>`:''}</td>`};
      return`<tr class="${rowClass}${policyLimitation?' policy-limited-row':''}${OverviewDomain.rowVisible({c,pausedAt},state.campaignStatusFilter,referenceDate)?'':' hidden'}" data-campaign="${esc(diaryName||c.nome_campanha_exato)}" data-source="${diarySource||(paused?'workbook':'manifest')}" data-campaign-id="${esc(campaignId||'')}">${headers.map(([key])=>cells[key].replace('<td',`<td data-column="${key}"`)).join('')}</tr>`
    }
    function renderTotals(){
      endResize(true);
      const snapshot=getSnapshot(),{dates}=snapshot;
      const kpiMarkup=`${renderD1MetricSummary(snapshot.d1Totals)}${renderD1ProfitSummary(snapshot.d1Totals)}`;
      $('#totalsConsolidated').classList.toggle('active',state.totalsMode==='consolidated');$('#totalsD1').classList.toggle('active',state.totalsMode==='d1');$('#totalsD0').classList.toggle('active',state.totalsMode==='d0');
      const totalLabel=state.totalsMode==='d0'?'D zero':state.totalsMode==='d1'?'D−1':'total';
      const columns=OverviewDomain.totalsColumns(state.totalsMode,totalLabel),headers=OverviewDomain.visibleColumns(columns,selectedColumns),numericHeaders=new Set(['zeroDays','current','imp','clicks','conv','roi','saleRoiFirst','saleRoiSecond','profit','account','limit','remaining']);if(!headers.some(([key])=>key===state.sortKey)){state.sortKey=headers.some(([key])=>key==='current')?'current':'campaign';state.sortDir='desc'}
      renderColumnOptions(columns);
      visibleWidthKeys=headers.map(([key])=>key);
      const remainingMinimum=OverviewDomain.remainingAlertThreshold(snapshot.remainingAlertMinimum),remainingYellowMinimum=OverviewDomain.remainingWarningThreshold(snapshot.remainingAlertYellowMinimum);
$('#totalsHead').innerHTML='<tr>'+headers.map(([key,label])=>`<th data-column="${key}" style="width:${columnWidth(key)}px"><button class="sort-btn ${numericHeaders.has(key)?'num':''} ${state.sortKey===key?'active':''}" data-sort="${key}" aria-label="Ordenar por ${label}"${key.startsWith('saleRoi')?' title="ROI acumulado no momento do registro da venda manual; não recalculado por período"':''}>${label}<span class="sort-arrow">${state.sortKey===key?(state.sortDir==='asc'?'↑':'↓'):''}</span></button>${key==='limit'?`<a class="test-budget-roi-link overview-test-rules-edit hub-corner-edit" href="#" aria-label="Editar regras de exibição do limite de teste" aria-haspopup="dialog" aria-controls="overviewTestRulesDialog" title="Editar regras de CPA e ROI mínimo">Editar</a>`:key==='remaining'?`<a class="test-budget-roi-link overview-remaining-edit hub-corner-edit" href="#" aria-label="Editar valor mínimo de alerta do valor restante" aria-haspopup="dialog" aria-controls="remainingAlertDialog" title="${esc(remainingAlertTitle(remainingMinimum,remainingYellowMinimum))}">Editar</a>`:''}<span class="overview-column-resizer" data-resize-column="${key}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Redimensionar coluna ${esc(label)}" aria-valuemin="${widthMinimum(key)}" aria-valuemax="1200" aria-valuenow="${columnWidth(key)}" title="Arraste para ajustar a largura; use também as setas esquerda e direita"></span></th>`).join('')+'</tr>';
      applyWidths();bindColumnResizers();
      const rows=OverviewDomain.sortRows(snapshot.rows,state,sortCell);
      const pausedTodayNames=Array.isArray(snapshot.pausedTodayCampaigns)?snapshot.pausedTodayCampaigns:[],pausedTodayCount=pausedTodayNames.length,pausedTodayMarkup='<button id="overviewPausedToday" class="overview-kpi-detail overview-kpi-detail-action" type="button" aria-haspopup="dialog" aria-controls="pausedTodayDialog" aria-label="Ver as '+fmtNum(pausedTodayCount)+' campanhas que pausaram hoje"><span class="kpi-label">Pausaram hoje</span><strong class="overview-kpi-detail-value">'+fmtNum(pausedTodayCount)+'</strong></button>',d0ProfitMarkup=renderD0ProfitSummary(rows,snapshot).replace(metricDetail('Pausadas',{value:snapshot.pausedCount},fmtNum),pausedTodayMarkup);
      $('#kpis').innerHTML=kpiMarkup+renderD0MetricSummary(rows)+d0ProfitMarkup+renderManifestSummary(snapshot)+renderBaseSummary(snapshot);$('#kpis').classList.add('has-overview-cards');
      $('#overviewPausedToday').onclick=event=>{event.preventDefault();event.stopPropagation();showPausedTodayDialog()};
      const tableRows=[...rows,...OverviewDomain.historyNavigationRows(snapshot.historyEntries||[],rows)];
      const matchingRows=OverviewDomain.searchRows(OverviewDomain.sortRows(tableRows,state,sortCell),$('#search').value);
      $('#totalsBody').innerHTML=matchingRows.map(row=>renderRow(row,headers,snapshot.referenceDate,remainingMinimum,remainingYellowMinimum)).join('')||`<tr><td colspan="${headers.length}" class="empty">Nenhuma campanha encontrada.</td></tr>`;
      $$('.sort-btn').forEach(button=>button.onclick=()=>{const key=button.dataset.sort;if(state.sortKey===key)state.sortDir=state.sortDir==='asc'?'desc':'asc';else{state.sortKey=key;state.sortDir='asc'}renderTotals()});
      $$('.test-budget-roi-link').forEach(link=>{link.onclick=event=>{event.preventDefault();event.stopPropagation();if(link.classList.contains('overview-remaining-edit'))showRemainingDialog();else if(link.classList.contains('overview-test-rules-edit'))showTestRulesDialog();else if(link.classList.contains('test-budget-commission-link'))showCommissionDialog(link.dataset);else showRoiDialog(link.dataset.campaignId,link.dataset.currentRoi,link.dataset.currentLimit,link.dataset.totalRevenue)};link.ondblclick=event=>event.stopPropagation()});
      $$('.overview-kpi-fractional-link').forEach(link=>{link.onclick=event=>{event.preventDefault();event.stopPropagation();showFractionalDialog()};link.ondblclick=event=>event.stopPropagation()});
      $$('#totalsBody tr').forEach(tr=>tr.ondblclick=()=>tr.dataset.campaign&&actions.showProduct(tr.dataset.campaign,tr.dataset.source,tr.dataset.campaignId||null));$('#totalsConsolidated').onclick=()=>{state.totalsMode='consolidated';renderTotals()};$('#totalsD1').onclick=()=>{state.totalsMode='d1';renderTotals()};$('#totalsD0').onclick=()=>{state.totalsMode='d0';renderTotals()};
      $('#campaignStatusFilter').value=state.campaignStatusFilter;
      $('#totalsCaption').textContent=state.totalsMode==='d0'?'Total do dia por campanha, inclusive pausadas; o filtro de situação afeta apenas a tabela':state.totalsMode==='d1'?`Retrato fechado de D−1${dates.d1?` · ${dateLabel(dates.d1)}`:''}`:'';
    }
    $('#search').oninput=renderTotals;
    $('#campaignStatusFilter').onchange=event=>{state.campaignStatusFilter=event.target.value;renderTotals()};
    return{render:renderTotals,refreshRemainingAlerts};
  }
  global.OverviewView=Object.freeze({mount});
})(typeof window==='object'?window:globalThis);

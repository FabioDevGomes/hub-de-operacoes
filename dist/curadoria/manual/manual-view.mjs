import {mountTrendsSaveAction,trendPageState} from '../trends-save-action.mjs?v=4';
import * as Domain from './manual-domain.mjs?v=2';
import * as Trends from '../trends-domain.mjs';
import * as TrendsUI from '../trends-ui.mjs';
import * as Images from '../image-search-domain.mjs';
import * as ImagesUI from '../image-search-ui.mjs';
import * as Glimpse from '../glimpse-domain.mjs';
import * as DecisionUI from '../decision-ui.mjs?v=curation-decision-notes-2';
import * as SignalUI from '../automatic-signal-ui.mjs';
import * as Candidates from '../keyword-candidates-ui.mjs?v=20261004-saved-candidate-remove';
import {mountColumnPicker} from '../../table-columns.mjs';
import {formatLastCollection} from '../last-collection.mjs';

export const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function rowHtml(row) {
  const p=row.product,id=escape(p.productId),trend=row.trendLatest,g=row.glimpse;
  const imageStatus=[...row.progress.latest.values()].sort((a,b)=>String(b.capturedAt).localeCompare(String(a.capturedAt)))[0]?.status||'';
  const negative=[...row.progress.latest.values()].some(entry=>entry.negativeKeywordCandidates?.length);
  const action=(tab,label,classes)=>`<button type="button" class="${classes}" data-analysis="${tab}" data-id="${id}" data-curation-focus="${tab}">${label}</button>`;
  const payout=p.payout.value==null?'—':`${escape(p.payout.currency)} ${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(p.payout.value)}`;
  const trendClass=trend?.status||'unsearched',glimpseClass=g?'saved':'unsearched',imageLabel=row.progress.total?`${row.progress.done} de ${row.progress.total}${Candidates.keywordCandidateMarkerHtml(negative?1:0,'negative')}`:'Não verificado',imageClass=imageLabel==='Não verificado'?'unverified':imageStatus;
  return `<tr data-product="${id}" class="${DecisionUI.rowClass(row.decision.currentStatus)}"><td class="product-cell hub-edit-host"><button type="button" class="hub-corner-edit" data-hide="${id}">${p.hidden?'Reexibir':'Ocultar'}</button><strong>${escape(p.name)}</strong><small>${escape([p.productType,p.externalId?'ID '+p.externalId:'',p.countries.join(', ')].filter(Boolean).join(' · '))}</small><button type="button" class="hub-discreet-action edit-product" data-edit="${id}">Editar</button>${action('history','Histórico','hub-discreet-action')}</td><td>${escape(p.network||'—')}</td><td>${action('trends',escape(Trends.resultLabel(trend?.status))+Candidates.keywordCandidateMarkerHtml(row.trends.keywordCandidates.length),'trends-badge '+trendClass)}</td><td>${action('glimpse',g?escape(Glimpse.compactSummary(g)):'Pesquisar','glimpse-badge '+glimpseClass)}</td><td>${action('images',imageLabel,'image-badge '+imageClass)}</td><td>${payout}</td><td>${SignalUI.badgeHtml(row.signal)}</td><td>${DecisionUI.buttonHtml(row.decision.currentStatus,'data-decision',id)}</td><td class="hub-last-collection"><time datetime="${escape(p.updatedAt)}">${escape(formatLastCollection(p.updatedAt))}</time></td></tr>`;
}
export function mountManualView({root,actions,preferences}) {
  const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
  let state={products:[],trends:[],images:[],analyses:[],decisions:[]},activeId='',activeTab='trends',editProduct=null,restorePayload=null,sort='updatedAt',direction=-1,busy=false,draft=null;
  const sheet=$('#offerSheet'),form=$('#productForm'),formDialog=$('#productDialog');
  $('#tableHead').innerHTML='<tr>'+Domain.COLUMNS.map(([key,label])=>`<th><button type="button" class="sort-btn" data-sort="${key}">${label}</button></th>`).join('')+'</tr>';
  $('#decisionFilter').innerHTML='<option value="">Todas as decisões</option>'+DecisionUI.DECISION_OPTIONS.map(option=>`<option>${option.value}</option>`).join('');
  const columns=mountColumnPicker({picker:$('#columnPicker'),table:$('#productsTable'),columns:Domain.COLUMNS,required:['product'],preferences,preferenceKey:'hub:curadoria-manual:columns:v1'});
  const current=()=>state.products.find(p=>p.productId===activeId);
  const snapshot=()=>{const p=current();return p?Domain.productSnapshot(p,state):null;};
  function notice(message,error=false){trendsSave?.report(message,{error});for(const selector of ['#message','#sheetMessage']){const node=$(selector);node.textContent=message;node.classList.toggle('error',error);}}
  async function run(task,{target='#sheetMessage',success='',after=null}={}) {
    if(busy)return false;
    busy=true;updateSave();
    try{await task();if(target==='#sheetMessage')trendsSave?.confirmed();if(success){$(target).textContent=success;$(target).classList.remove('error');}after?.();return true;}
    catch(error){if(target==='#sheetMessage')trendsSave?.report(error.message,{error:true});$(target).textContent=error.message||'Não foi possível salvar. Tente novamente.';$(target).classList.add('error');return false;}
    finally{busy=false;updateSave();}
  }
  function filters(){return {search:$('#search').value,network:$('#networkFilter').value,decision:$('#decisionFilter').value,visibility:$('#visibilityFilter').value,sort,direction};}
  function renderTable(){
    const rows=Domain.filteredProducts(state,filters());$('#rows').innerHTML=rows.map(rowHtml).join('');columns.apply();
    $('#empty').hidden=rows.length>0;$('#empty').textContent=state.products.length?'Nenhum produto atende aos filtros.':'Cadastre o primeiro produto para começar.';
    const count=status=>state.decisions.filter(r=>r.currentStatus===status).length;
    $('#summary').innerHTML=[['Produtos',state.products.length],['No filtro',rows.length],['Ocultos',state.products.filter(p=>p.hidden).length],['Revisar',count('Revisar')],['Subir campanha',count('Subir campanha')],['No ar',count('Campanha no ar')]].map(([label,value])=>`<span class="chip">${label}<b>${value}</b></span>`).join('');
    $$('[data-sort]').forEach(button=>{button.classList.toggle('active',button.dataset.sort===sort);button.closest('th').setAttribute('aria-sort',button.dataset.sort===sort?(direction===1?'ascending':'descending'):'none');});
  }
  function render(next){
    state=next;const selected=$('#networkFilter').value;
    $('#networkFilter').innerHTML='<option value="">Todas as redes</option>'+[...new Set(state.products.map(p=>p.network).filter(Boolean))].sort().map(network=>`<option value="${escape(network)}">${escape(network)}</option>`).join('');
    $('#networkFilter').value=selected;renderTable();
  }
  function openForm(product=null){
    if(busy)return;
    editProduct=product;form.reset();$('#formTitle').textContent=product?'Editar produto':'Cadastrar produto';$('#formMessage').textContent='';
    if(product)for(const name of ['name','network','productType','externalId','countries','url','payoutValue','currency','notes'])form.elements.namedItem(name).value=name==='countries'?product.countries.join(', '):name==='payoutValue'?(product.payout.value??''):name==='currency'?(product.payout.currency||''):product[name]||'';
    formDialog.showModal();form.elements.namedItem('name').focus();
  }
  function updateSave(){
    const button=$('#saveSheetButton');
    if(activeTab==='glimpse')return; // Shared iframe helper owns its pending state.
    button.disabled=busy||button.dataset.trendsSaving==='true'||activeTab!=='trends';button.title=activeTab==='trends'?'Salvar a avaliação de Google Trends':activeTab==='images'?'Cada classificação e candidata é salva imediatamente.':'Histórico somente de leitura.';
  }
  function historyHtml(entries,label,{includeNotes=false}={}){return entries.slice().reverse().map(entry=>`<div class="history-row"><time>${escape(formatLastCollection(entry.capturedAt||entry.changedAt))}</time><b>${escape(label(entry))}</b><span>${escape([entry.productName,entry.searchTerm,entry.countries?.join(', '),entry.country,entry.negativeKeywordCandidates?.length?'Negativas: '+entry.negativeKeywordCandidates.join(', '):'',includeNotes&&entry.notes?`Observação: ${entry.notes}`:''].filter(Boolean).join(' · '))}</span></div>`).join('')||'<p class="sub">Nenhum registro.</p>';}
  function history(){const row=snapshot();if(!row)return;$('#trendsHistory').innerHTML=historyHtml(row.trends.assessments,entry=>Trends.resultLabel(entry.status));$('#imagesHistory').innerHTML=historyHtml(row.images.assessments,entry=>Images.resultLabel(entry.status));$('#allHistory').innerHTML='<h3>Cadastro</h3>'+historyHtml(row.product.history,entry=>entry.values.name)+'<h3>Decisões</h3>'+historyHtml(row.decision.history,entry=>entry.status,{includeNotes:true})+'<h3>Trends</h3>'+$('#trendsHistory').innerHTML+'<h3>Imagens</h3>'+$('#imagesHistory').innerHTML;}
  function renderCandidates(){const row=snapshot();if(!row)return;const id=activeId;
    Candidates.renderKeywordCandidates($('#trendCandidates'),{candidates:row.trends.keywordCandidates,variant:'positive',saved:true,showRemoveForSaved:true,onSearch:term=>actions.openTrends(term),onRemove:term=>run(()=>actions.changeTrendCandidates(id,values=>values.filter(value=>value!==term)),{after:()=>{if(activeId===id)renderCandidates();}})});
  }
  function renderTrendDraft(){
    const p=current();if(!p)return;
    $('#trendsTerm').value=draft.term;
    $('#trendCountries').innerHTML=p.countries.map(code=>`<button type="button" class="trends-country-action ${draft.countries.includes(code)?'selected':''}" data-country="${code}" aria-pressed="${draft.countries.includes(code)}">${code}</button>`).join('')||'<p class="sub">Nenhum país cadastrado.</p>';
    TrendsUI.renderProductAgeButtons($('#productAgeActions'),draft.productAge,value=>{draft.productAge=value;renderTrendDraft();});
    TrendsUI.renderResultButtons($('#trendResults'),draft.status,value=>{draft.status=value;renderTrendDraft();return trendsSave.select(value);});renderCandidates();
  }
  function renderImages(){
    const row=snapshot();if(!row)return;const id=activeId,latest=Images.latestByCountry(row.images.assessments);
    $('#imageProgress').textContent=row.product.countries.length?`${row.progress.done} de ${row.progress.total} países verificados.`:'Adicione países na aba Google Trends para validar imagens.';
    $('#imageCountries').innerHTML=row.product.countries.map(code=>`<article class="card image-country-card"><div class="image-country-head"><div class="image-country-title"><h2>${code}</h2><span class="sheet-status">${Images.resultLabel(latest.get(code)?.status)}</span></div><button type="button" class="btn primary image-search-button" data-image-search="${code}">Pesquisar imagens</button></div><div class="image-result-actions" data-image-actions="${code}"></div><div class="image-candidate-summary"><b>Candidatas a palavras-chave negativas</b><div class="image-candidate-entry"><input class="control" data-negative-input="${code}" aria-label="Nova candidata negativa · ${code}" placeholder="Digite uma candidata e pressione Enter"></div><div class="image-candidate-list" data-negative-list="${code}"></div></div></article>`).join('');
    const save=(country,status,values)=>run(()=>actions.saveImage(id,{country,status,searchTerm:$('#imagesTerm').value.trim()||row.product.name,negativeKeywordCandidates:values}),{success:'Avaliação visual salva.',after:()=>{if(activeId===id){renderImages();history();}}});
    $$('[data-image-actions]').forEach(container=>{const country=container.dataset.imageActions;ImagesUI.renderImageResultButtons(container,{country,selectedValue:latest.get(country)?.status,onSelect:(code,status)=>save(code,status,latest.get(code)?.negativeKeywordCandidates||[])});});
    $$('[data-negative-list]').forEach(container=>{const code=container.dataset.negativeList,entry=latest.get(code),values=entry?.negativeKeywordCandidates||[];Candidates.renderKeywordCandidates(container,{candidates:values,variant:'negative',saved:true,showRemoveForSaved:true,onSearchAll:all=>actions.openImages($('#imagesTerm').value.trim()||row.product.name,code,all),onRemove:value=>save(code,entry?.status,values.filter(candidate=>candidate!==value))});});
    $$('[data-negative-input]').forEach(input=>input.onkeydown=event=>{if(event.key!=='Enter')return;event.preventDefault();const value=input.value.trim();if(!value)return;const entry=latest.get(input.dataset.negativeInput);save(input.dataset.negativeInput,entry?.status,[...(entry?.negativeKeywordCandidates||[]),value]);});
  }
  function switchTab(tab){activeTab=tab;$$('[data-tab]').forEach(button=>{button.classList.toggle('active',button.dataset.tab===tab);button.setAttribute('role','tab');button.setAttribute('aria-selected',String(button.dataset.tab===tab));});$$('[data-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.panel!==tab));if(tab==='glimpse')actions.openGlimpse(current());if(tab==='images')renderImages();history();updateSave();trendsSave?.sync();}
  function openSheet(id,tab){if(busy)return;activeId=id;const row=snapshot();if(!row)return;const last=trendPageState(row.trends,row.trendLatest);draft={term:last?.searchTerm||row.product.name,status:last?.status||'',productAge:last?.productAge||'',countries:[...(last?.countries||[])]};$('#sheetTitle').textContent=row.product.name;$('#sheetMeta').textContent=[row.product.network,row.product.productType,row.product.externalId?'ID '+row.product.externalId:''].filter(Boolean).join(' · ');const link=$('#offerLink');link.hidden=!row.product.url;if(row.product.url)link.href=row.product.url;else link.removeAttribute('href');$('#imagesTerm').value=row.images.searchTerm||row.product.name;notice('');sheet.classList.remove('hidden');renderTrendDraft();switchTab(tab);sheet.scrollTop=0;$('#closeSheet').focus({preventScroll:true});}
  function closeSheet(){trendsSave.reset();sheet.classList.add('hidden');$$('[data-panel]').forEach(panel=>panel.classList.add('hidden'));activeId='';actions.restoreFocus();}
  $('#closeSheet').onclick=closeSheet;
  $$('.tabs [data-tab]').forEach(button=>button.onclick=()=>switchTab(button.dataset.tab));
  const trendsSave=mountTrendsSaveAction({
    button:$('#saveSheetButton'),scope:$('[data-panel="trends"]'),watch:'#trendsTerm',
    getContext:()=>({tab:sheet.classList.contains('hidden')?'':activeTab,offerKey:activeId,
      previous:snapshot()?.trendLatest,draft:{...draft,term:$('#trendsTerm').value.trim()||current()?.name||'',
        countries:$$('[data-country].selected').map(button=>button.dataset.country),
        productAge:$('#productAgeActions [data-trends-product-age].selected')?.dataset.trendsProductAge||''}}),
    persist:async(id,status,value)=>{await actions.saveTrend(id,{...value,status,searchTerm:value.term});if(activeId===id)history();return true;},
    feedback:message=>notice(message,/^Não foi possível/.test(message))
  });
  $('#trendsTerm').oninput=()=>{draft.term=$('#trendsTerm').value;};
  $('#openTrends').onclick=()=>actions.openTrends($('#trendsTerm').value.trim()||current().name);
  $('#trendCountries').onclick=event=>{const button=event.target.closest('[data-country]');if(!button)return;const code=button.dataset.country;if(draft.countries.includes(code))draft.countries=draft.countries.filter(c=>c!==code);else if(draft.countries.length<5)draft.countries.push(code);else{notice('Selecione no máximo cinco países.',true);return;}renderTrendDraft();};
  $('#trendCandidate').onkeydown=async event=>{if(event.key!=='Enter')return;event.preventDefault();const input=event.currentTarget,value=input.value.trim(),id=activeId;if(!value)return;await run(()=>actions.changeTrendCandidates(id,values=>[...values,value]),{after:()=>{if(activeId===id){input.value='';renderCandidates();}}});};
  const addCountry=()=>{const id=activeId,code=$('#manualCountry').value;return run(()=>actions.addCountry(id,code),{success:'País adicionado ao cadastro.',after:()=>{if(activeId===id){$('#manualCountry').value='';renderTrendDraft();}}});};
  $('#addCountry').onclick=addCountry;$('#manualCountry').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();void addCountry();}};
  $('#imageCountries').onclick=event=>{const button=event.target.closest('[data-image-search]');if(button)actions.openImages($('#imagesTerm').value.trim()||current().name,button.dataset.imageSearch);};
  $('#rows').onclick=event=>{
    const edit=event.target.closest('[data-edit]');if(edit){openForm(state.products.find(p=>p.productId===edit.dataset.edit));return;}
    const hide=event.target.closest('[data-hide]');if(hide){const p=state.products.find(p=>p.productId===hide.dataset.hide);run(()=>actions.setHidden(p.productId,!p.hidden),{target:'#message'});return;}
    const decision=event.target.closest('[data-decision]');if(decision){const p=state.products.find(p=>p.productId===decision.dataset.decision),row=Domain.productSnapshot(p,state);DecisionUI.openDecisionPicker({title:p.name,currentValue:row.decision.currentStatus,allowNotes:true,notes:row.decision.notes||'',onSelect:(status,notes)=>actions.saveDecision(p.productId,status,notes),onError:error=>notice(error.message,true)});return;}
    const analysis=event.target.closest('[data-analysis]');if(analysis)openSheet(analysis.dataset.id,analysis.dataset.analysis);
  };
  $('#tableHead').onclick=event=>{const button=event.target.closest('[data-sort]');if(!button)return;direction=sort===button.dataset.sort?-direction:1;sort=button.dataset.sort;renderTable();};
  $('#search').oninput=renderTable;for(const selector of ['#networkFilter','#decisionFilter','#visibilityFilter'])$(selector).onchange=renderTable;
  $('#clearFilters').onclick=()=>{$('#search').value='';$('#networkFilter').value='';$('#decisionFilter').value='';$('#visibilityFilter').value='visible';renderTable();};
  $('#newProduct').onclick=()=>openForm();
  $$('[data-close]').forEach(button=>button.onclick=()=>$('#'+button.dataset.close).close());
  form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity()||busy)return;const input=Object.fromEntries(new FormData(form)),previous=editProduct;$('#saveProduct').disabled=true;try{await run(()=>actions.saveProduct(input,previous),{target:'#formMessage',after:()=>{formDialog.close();notice(previous?'Cadastro atualizado; identidade e análises preservadas.':'Produto cadastrado.');}});}finally{$('#saveProduct').disabled=false;}};
  $('#exportBackup').onclick=()=>run(()=>actions.exportBackup(),{target:'#message'});
  $('#restoreButton').onclick=()=>$('#restoreFile').click();
  $('#restoreFile').onchange=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;await run(async()=>{restorePayload=Domain.validateBackup(JSON.parse(await file.text()));$('#restorePreview').textContent=`${restorePayload.products.length} produtos e ${restorePayload.analyses.length} análises Glimpse. Trends, Imagens e decisões estão incluídos.`;$('#restoreMessage').textContent='';$('#restoreDialog').showModal();},{target:'#message'});};
  $('#confirmRestore').onclick=async()=>{if(!restorePayload||busy)return;$('#confirmRestore').disabled=true;try{await run(async()=>{const result=await actions.restoreBackup(restorePayload);$('#restoreDialog').close();restorePayload=null;notice(`Restauração concluída: ${result.added} registros acrescentados, ${result.conflicts} conflitos locais preservados.`);},{target:'#restoreMessage'});}finally{$('#confirmRestore').disabled=false;}};
  return {render,notice,closeSheet,activeId:()=>activeId,activeTab:()=>activeTab};
}

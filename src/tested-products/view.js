(function(){
  // Presentation only. Catalog writes stay behind explicit Hub action callbacks.
  function mount({root,getSnapshot,domain,format,preferences,actions,dialogs,toast}){
    const $=selector=>root.querySelector(selector),$$=selector=>[...root.querySelectorAll(selector)];
    const {esc,num:fmtNum,money:fmtMoney,date:dateLabel}=format,{confirm}=dialogs;
    let editingProduct=null,editBusy=false,editTrigger=null,editBaseline={},editRestored=new Set();
    const editDialog=$('#testedEditDialog'),editInput=key=>$(`#tested-edit-${key}`),editRestore=key=>$(`#tested-restore-${key}`);
    const inputValue=(value,type)=>type==='status'?(value?'active':'history'):Array.isArray(value)?value.join('\n'):value==null?'':type==='number'?Number(value).toLocaleString('pt-BR',{useGrouping:false,maximumFractionDigits:20}):String(value);
    function calculatedText(field,value){if(value==null)return'—';if(field.type==='date')return dateLabel(value);if(field.type==='status')return value?'Ativo':'Histórico';if(field.type==='list')return value.join(' · ')||'Nenhuma';if(['totalBilled','totalProfit'].includes(field.key))return fmtMoney(value);return String(value)}
    function clearEditErrors(){$('#testedEditError').textContent='';for(const field of domain.EDIT_FIELDS){editInput(field.key).setAttribute('aria-invalid','false');$(`#tested-error-${field.key}`).textContent=''}}
    function setEditBusy(value){editBusy=value;$('#testedEditSave').disabled=value;$('#testedEditCancel').disabled=value;$('#testedEditClose').disabled=value;$('#testedEditReset').disabled=value;$('#testedEditSave').textContent=value?'Salvando…':'Salvar ajustes';for(const field of domain.EDIT_FIELDS){editRestore(field.key).disabled=value;editInput(field.key).disabled=value}}
    function closeEditor(){if(editBusy)return;editDialog.close();editingProduct=null;editTrigger?.focus()}
    function openEditor(product,trigger){
      editingProduct=product;editTrigger=trigger;editBaseline={};editRestored=new Set();const current=domain.editorValues(product),calculated=product.calculated||current;
      $('#testedEditFields').innerHTML=domain.EDIT_FIELDS.map(field=>{const id=`tested-edit-${field.key}`,control=field.type==='list'?`<textarea id="${id}" rows="3"></textarea>`:field.type==='status'?`<select id="${id}"><option value="active">Ativo</option><option value="history">Histórico</option></select>`:`<input id="${id}" type="${field.type==='number'?'text':field.type}" ${field.type==='number'?'inputmode="decimal"':''}>`;return`<div class="tested-edit-field" data-field="${field.key}"><div class="tested-edit-label"><label for="${id}">${esc(field.label)}</label><button id="tested-restore-${field.key}" class="tested-edit-restore" type="button" aria-label="Restaurar valor calculado: ${esc(field.label)}">Restaurar</button></div>${control.replace(`id="${id}"`,`id="${id}" aria-describedby="tested-calculated-${field.key} tested-error-${field.key}"`)}<small id="tested-calculated-${field.key}" class="tested-edit-calculated">Calculado: ${esc(calculatedText(field,calculated[field.key]))}</small><span id="tested-error-${field.key}" class="tested-edit-field-error"></span></div>`}).join('');
      for(const field of domain.EDIT_FIELDS){const input=editInput(field.key);input.value=inputValue(current[field.key],field.type);editBaseline[field.key]=input.value;editRestore(field.key).onclick=()=>restoreEditField(field)}
      clearEditErrors();setEditBusy(false);editDialog.showModal();editInput('label').focus()
    }
    $('#testedEditClose').onclick=closeEditor;$('#testedEditCancel').onclick=closeEditor;
    editDialog.oncancel=event=>{if(editBusy)event.preventDefault()};editDialog.onclose=()=>{if(editDialog.open)return;editingProduct=null;($$('.catalog-edit').find(button=>button.dataset.key===editTrigger?.dataset.key)||editTrigger)?.focus()};
    function restoreEditField(field){if(!editingProduct||editBusy)return;const calculated=editingProduct.calculated||domain.editorValues(editingProduct);editInput(field.key).value=inputValue(calculated[field.key],field.type);editBaseline[field.key]=editInput(field.key).value;editRestored.add(field.key);clearEditErrors()}
    $('#testedEditReset').onclick=()=>{if(!editingProduct||editBusy)return;for(const field of domain.EDIT_FIELDS)restoreEditField(field)};
    $('#testedEditForm').onsubmit=async event=>{
      event.preventDefault();if(!editingProduct||editBusy)return;clearEditErrors();const draft=Object.fromEntries(domain.EDIT_FIELDS.map(field=>[field.key,{changed:editInput(field.key).value!==editBaseline[field.key],restored:editRestored.has(field.key),value:editInput(field.key).value,invalid:editInput(field.key).validity?.badInput}])),result=domain.prepareDirectEdit(editingProduct,draft);
      if(!result.valid){for(const[key,message]of Object.entries(result.errors)){editInput(key).setAttribute('aria-invalid','true');$(`#tested-error-${key}`).textContent=message}editInput(Object.keys(result.errors)[0]).focus();$('#testedEditError').textContent='Revise os campos indicados antes de salvar.';return}
      const key=editingProduct.key;setEditBusy(true);
      try{await actions.saveAdjustments(key,result.values);setEditBusy(false);closeEditor();renderTestedProducts();$$('.catalog-edit').find(button=>button.dataset.key===key)?.focus();toast('Ajustes de Produtos Testados salvos; MCC e Diário preservados')}
      catch(error){setEditBusy(false);$('#testedEditError').textContent=error.message||'Não foi possível salvar. Seus ajustes ainda estão no formulário.'}
    };
    function manualCell(product,keys,html){return keys.some(key=>(product.manualFields||[]).includes(key))?html.replace('<td','<td data-manual="true" title="Ajuste manual somente em Produtos Testados"'):html}
    const TESTED_COLUMNS=[['date','Data'],['campaigns','Campanhas'],['sales','Vendas'],['revenue','Total faturado'],['profit','Lucro total'],['period','Período'],['status','Situação'],['related','Campanhas relacionadas'],['actions','Ação']],TESTED_COLUMNS_PREF='painel-produtos-testados-colunas-v1';let hiddenTestedColumns=new Set(),testedSortKey='status',testedSortDir='desc';try{hiddenTestedColumns=new Set(JSON.parse(preferences.getItem(TESTED_COLUMNS_PREF)||'[]').filter(column=>TESTED_COLUMNS.some(([id])=>id===column)))}catch{}
    const sortTestedProducts=products=>domain.sortProducts(products,testedSortKey,testedSortDir);
    const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
    function searchTestedProducts(products,query){const term=normalizeSearch(query.trim());if(!term)return products;return products.filter(product=>[product.label,...(Array.isArray(product.relatedCampaigns)?product.relatedCampaigns:[]),...(Array.isArray(product.campaigns)?product.campaigns:[])].some(value=>normalizeSearch(value).includes(term)))}
    function applyTestedColumnVisibility(){$$('[data-tested-col]').forEach(cell=>cell.classList.toggle('hidden-column',hiddenTestedColumns.has(cell.dataset.testedCol)))}
    function renderTestedColumnPicker(){$('#testedColumnsMenu').innerHTML='<strong>Exibir colunas</strong>'+TESTED_COLUMNS.map(([id,label])=>`<label><input type="checkbox" data-tested-column="${id}" ${hiddenTestedColumns.has(id)?'':'checked'}> ${label}</label>`).join('');$$('[data-tested-column]').forEach(input=>input.onchange=()=>{input.checked?hiddenTestedColumns.delete(input.dataset.testedColumn):hiddenTestedColumns.add(input.dataset.testedColumn);preferences.setItem(TESTED_COLUMNS_PREF,JSON.stringify([...hiddenTestedColumns]));applyTestedColumnVisibility()});applyTestedColumnVisibility()}
    function bindTestedSorting(){$$('[data-tested-sort]').forEach(button=>{const active=button.dataset.testedSort===testedSortKey;button.classList.toggle('active',active);button.querySelector('.sort-arrow').textContent=active?(testedSortDir==='asc'?'↑':'↓'):'';button.onclick=()=>{if(testedSortKey===button.dataset.testedSort)testedSortDir=testedSortDir==='asc'?'desc':'asc';else{testedSortKey=button.dataset.testedSort;testedSortDir='asc'}renderTestedProducts()}})}
    function renderTestedProducts(){
      const {products,removed}=getSnapshot(),sortedProducts=sortTestedProducts(products),visibleProducts=searchTestedProducts(sortedProducts,$('#testedSearch').value),searchTerm=normalizeSearch($('#testedSearch').value),activeProducts=products.filter(product=>product.active).length;
      $('#testedProductsCount').textContent=`${products.length} ${products.length===1?'produto':'produtos'}`;$('#testedActiveProductsCount').textContent=`${activeProducts} ${activeProducts===1?'com campanha ativa':'com campanhas ativas'}`;$('#restoreProducts').classList.toggle('hidden',!removed);$('#purgeProducts').classList.toggle('hidden',!removed);
      $('#testedProductsBody').innerHTML=visibleProducts.length?visibleProducts.map(p=>{
        const cells=[
          manualCell(p,['label'],`<td data-tested-col="product" class="name">${esc(p.label)}${p.manualFields?.length?'<span class="tested-adjustment-badge">Ajuste manual nesta lista</span>':''}</td>`),
          manualCell(p,['startDate'],`<td data-tested-col="date">${p.startDate?dateLabel(p.startDate):'—'}</td>`),
          manualCell(p,['campaignCount'],`<td data-tested-col="campaigns" class="num">${fmtNum(Object.hasOwn(p,'campaignCount')?p.campaignCount:p.campaigns.length)}</td>`),
          manualCell(p,['salesCount'],`<td data-tested-col="sales" class="num">${fmtNum(p.salesCount,Number.isInteger(p.salesCount)?0:2)}</td>`),
          manualCell(p,['totalBilled'],`<td data-tested-col="revenue" class="num">${fmtMoney(p.totalBilled)}</td>`),
          manualCell(p,['totalProfit'],`<td data-tested-col="profit" class="num${Number.isFinite(p.totalProfit)&&p.totalProfit<0?' negative':''}">${fmtMoney(p.totalProfit)}</td>`),
          manualCell(p,['first','last'],`<td data-tested-col="period">${p.first||p.last?`${p.first?dateLabel(p.first):'—'} a ${p.last?dateLabel(p.last):'—'}`:'Sem datas'}</td>`),
          manualCell(p,['active'],`<td data-tested-col="status"><span class="tag tested-status ${p.active?'active':'historical'}">${p.active?'Ativo':'Histórico'}</span></td>`),
          manualCell(p,['relatedCampaigns'],`<td data-tested-col="related" class="campaigns">${esc((p.relatedCampaigns||p.campaigns).join(' · '))}</td>`),
          `<td data-tested-col="actions"><div class="row-actions"><button class="catalog-edit" data-key="${esc(p.key)}" data-product="${esc(p.label)}" type="button">Editar produto</button><button class="catalog-remove" data-key="${esc(p.key)}" data-product="${esc(p.label)}" type="button">Remover</button></div></td>`
        ];return`<tr>${cells.join('')}</tr>`
      }).join(''):sortedProducts.length&&searchTerm?'<tr><td colspan="10" class="empty">Nenhum produto corresponde à busca.</td></tr>':'<tr><td colspan="10" class="empty">Nenhum produto disponível neste cadastro.</td></tr>';
      renderTestedColumnPicker();bindTestedSorting();
      $$('.catalog-edit').forEach(button=>button.onclick=()=>{const product=getSnapshot().products.find(item=>item.key===button.dataset.key);if(product)openEditor(product,button)});
      $$('.catalog-remove').forEach(button=>button.onclick=async()=>{const name=button.dataset.product;if(!confirm(`Remover “${name}” da lista de produtos testados?\n\nOs dados das campanhas serão preservados.`))return;await actions.hide(button.dataset.key);renderTestedProducts();toast(`${name} foi removido da lista; o histórico foi preservado`)})
    }
    $('#testedSearch').oninput=renderTestedProducts;
    $('#purgeProducts').onclick=actions.purge;
    $('#restoreProducts').onclick=async()=>{await actions.restore();renderTestedProducts();toast('Produtos removidos foram restaurados')};
    return Object.freeze({render:renderTestedProducts});
  }
  window.TestedProductsView=Object.freeze({mount});
})();

import {ANALYSIS_SECTIONS,CLASSIFICATIONS,sourcesFor,requestPrompt,resultCounts,isStale,exportAnalysis,requestStatus,fieldFor,analysisQuality} from './review-analysis-domain.mjs?v=2';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountAnalysis({root,controller,materials}){
  let message='',failed=false;
  function status(){
    const item=controller.current(),state=item.state,current=materials.current();
    const node=root.querySelector('[data-analysis-status]');
    node.textContent=message||(item.saved!==JSON.stringify(state)?'Alterações da análise ainda não salvas.':item.savedAt?'Análise recuperada deste navegador.':'Prepare o pedido, use-o com o assistente e cole a resposta para revisar.');node.classList.toggle('review-error',failed);
    const warning=root.querySelector('[data-analysis-stale]');
    const staleResult=isStale(state.result,current.draft),staleRequest=isStale(state.request,current.draft);
    const preparedStatus=requestStatus(state.request,current.draft,controller.selected());
    warning.hidden=!staleResult&&!staleRequest&&!['selection','materials'].includes(preparedStatus.code);
    warning.textContent=preparedStatus.code==='selection'?preparedStatus.message:staleResult?'Os materiais mudaram depois da análise aplicada. O resultado anterior foi preservado. Prepare um novo pedido para atualizar.':'Os materiais mudaram depois do pedido preparado. Prepare um novo pedido antes de aplicar uma resposta.';
    const count=resultCounts(state.result),summary=root.querySelector('[data-analysis-counts]');
    summary.textContent=state.result?`${count.explicit} explícitos · ${count.inferred} inferidos · ${count.confirmed} confirmados por você · ${count.missing} ausentes/pendentes`:'';
    const quality=analysisQuality(state,{draft:current.draft}),qualityNode=root.querySelector('[data-analysis-quality]');if(qualityNode)qualityNode.textContent=`Estado: ${quality.label}. ${quality.substantive} campos com conteúdo analítico; ${quality.missing} ausentes/pendentes.`;
    const reviewed=root.querySelector('[data-analysis-reviewed]');if(reviewed){reviewed.checked=state.reviewed&&!staleResult&&quality.code!=='empty';reviewed.disabled=quality.code==='empty'||quality.code==='stale'}
  }
  function resultMarkup(state){
    if(!state.result)return '<p class="review-analysis-empty">Após validar e aplicar a resposta, os blocos editáveis aparecerão aqui.</p>';
    const sources=state.result.request.sources.filter(source=>source.analyzable);
    return `<p class="review-analysis-warning" data-analysis-quality></p><div class="review-analysis-counts" data-analysis-counts></div>${ANALYSIS_SECTIONS.map(section=>`<details class="review-analysis-block"><summary>${esc(section.title)}</summary>${section.fields.map(([key,label])=>{
      const row=fieldFor(state.result,section.id,key),token=section.id+'-'+key;
      return `<div class="review-analysis-row"><label for="analysis-text-${token}">${esc(label)}<textarea id="analysis-text-${token}" data-analysis-section="${section.id}" data-analysis-key="${key}" data-analysis-property="text" rows="3">${esc(row.text)}</textarea></label><label for="analysis-class-${token}">Origem da informação<select id="analysis-class-${token}" data-analysis-section="${section.id}" data-analysis-key="${key}" data-analysis-property="classification">${Object.entries(CLASSIFICATIONS).map(([value,title])=>`<option value="${value}" ${row.classification===value?'selected':''}>${esc(title)}</option>`).join('')}</select></label><details class="review-analysis-origin"><summary>Fontes e trecho de origem</summary><div class="review-analysis-source-checks">${sources.map(source=>`<label><input type="checkbox" data-analysis-section="${section.id}" data-analysis-key="${key}" data-analysis-property="sourceIds" value="${source.id}" ${row.sourceIds.includes(source.id)?'checked':''}>${esc(source.label)}</label>`).join('')}</div><label for="analysis-evidence-${token}">Trecho literal da fonte<textarea id="analysis-evidence-${token}" data-analysis-section="${section.id}" data-analysis-key="${key}" data-analysis-property="evidence" rows="2">${esc(row.evidence)}</textarea></label></details></div>`;
    }).join('')}</details>`).join('')}<label class="review-analysis-check"><input type="checkbox" data-analysis-reviewed>Revisei esta análise, incluindo as lacunas e as fontes.</label><p>Confirmado por mim registra sua validação manual. Editar o conteúdo exige confirmar novamente. Alegações de fontes não equivalem a comprovação independente.</p>`;
  }
  function render(){
    const item=controller.current(),state=item.state,current=materials.current(),sources=sourcesFor(current.draft),selected=controller.selected();
    const options=materials.list(),currentDirty=options.find(row=>row.draft.id===current.draft.id)?.dirty;
    const canPrepare=current.revision&&!currentDirty&&sources.some(source=>source.analyzable&&selected.includes(source.id))&&!item.error;
    const currentRequest=requestStatus(state.request,current.draft,selected).code==='current';
    root.innerHTML=`<div class="review-analysis-intro"><span class="review-badge">Fluxo assistido · copiar e colar</span><p>O Hub prepara o pedido. Você usa o material com o assistente e traz o JSON de volta para conferir os resultados.</p></div>
      <label for="analysis-review">Review selecionada<select id="analysis-review" data-analysis-review>${options.map(row=>`<option value="${esc(row.draft.id)}" ${row.draft.id===current.draft.id?'selected':''}>${esc(row.draft.product||'Nova review (salve no passo 1)')} · ${esc([row.draft.market,row.draft.language].filter(Boolean).join(' / ')||'sem mercado/idioma')} · ${esc(row.draft.id.slice(0,8))}</option>`).join('')}</select></label>
      <p class="review-analysis-status" data-analysis-status role="status" aria-live="polite"></p>
      ${item.error?`<p class="review-error" role="alert">Não foi possível ler a análise salva: ${esc(item.error)}. O registro anterior não será sobrescrito.</p>`:''}
      <p class="review-analysis-warning" data-analysis-stale role="status" hidden></p>
      ${!current.revision||currentDirty?'<p class="review-analysis-warning">Salve os materiais desta review no passo 1 para preparar ou aplicar a análise.</p>':''}
      <section class="review-analysis-sources"><h4>1. Escolher as fontes</h4>${sources.map(source=>`<label class="review-analysis-source"><input type="checkbox" data-analysis-source="${source.id}" ${selected.includes(source.id)?'checked':''} ${!source.available?'disabled':''}><span><strong>${esc(source.label)}</strong><small>${esc(source.note)} ${source.available&&source.analyzable?`(${source.content.length.toLocaleString('pt-BR')} caracteres)` :''}</small></span></label>`).join('')}<p>As URLs são referências. Se houver somente links, cole o conteúdo no passo 1 antes de analisar.</p><button class="btn primary hub-standard-action" type="button" data-analysis-action="prepare" ${!canPrepare?'disabled':''}>Preparar análise</button></section>
      <section><h4>2. Levar o pedido ao assistente</h4><textarea class="review-analysis-prompt" data-analysis-prompt readonly rows="7" aria-label="Pedido preparado para o assistente" placeholder="Prepare um pedido atualizado para exibir o texto e o modelo de resposta.">${currentRequest?esc(requestPrompt(state.request)):''}</textarea><div class="review-actions"><button class="btn hub-standard-action" type="button" data-analysis-action="copy" ${!currentRequest?'disabled':''}>Copiar pedido</button><button class="btn hub-standard-action" type="button" data-analysis-action="prompt" ${!currentRequest?'disabled':''}>Baixar pedido .txt</button></div><p>Depois de preparar, salve a análise para retomar o mesmo pedido em outra sessão. Pedidos antigos permanecem no registro, mas não são apresentados como pedido atual.</p></section>
      <section><h4>3. Receber e conferir o resultado</h4><label for="analysis-response">Resposta estruturada do assistente<textarea id="analysis-response" data-analysis-import rows="7" placeholder="Cole aqui somente o JSON retornado pelo assistente.">${esc(state.importText)}</textarea></label><button class="btn hub-standard-action" type="button" data-analysis-action="validate" ${!currentRequest?'disabled':''}>Validar resposta e ver prévia</button><div data-analysis-preview>${item.preview?previewMarkup(item.preview,state):''}</div></section>
      <section><h4>4. Revisar os blocos</h4>${resultMarkup(state)}${!state.result?'<span data-analysis-counts hidden></span>':''}</section>
      <section><h4>5. Salvar e exportar</h4><div class="review-actions"><button class="btn primary hub-standard-action" type="button" data-analysis-action="save" ${item.error||!current.revision?'disabled':''}>Salvar análise</button><button class="btn hub-standard-action" type="button" data-analysis-action="md">Baixar análise .md</button><button class="btn hub-standard-action" type="button" data-analysis-action="json">Baixar análise .json</button></div><p>Os dados ficam neste navegador. A exportação JSON inclui fontes usadas, pedido e histórico de resultados.</p><details><summary>Resultados anteriores preservados (${state.previousResults.length})</summary>${state.previousResults.length?`<ul>${state.previousResults.map((result,index)=>`<li>Resultado ${index+1} · pedido ${esc(result.request.id.slice(0,8))} · ${esc(result.request.createdAt)}. Conteúdo completo disponível no JSON exportado.</li>`).join('')}</ul>`:'<p>Nenhum resultado anterior substituído nesta análise.</p>'}</details></section>`;
    status();
  }
  function previewMarkup(result,state){const counts=resultCounts(result);return `<div class="review-analysis-preview"><strong>Resposta válida para esta review e este pedido.</strong><p>${counts.explicit} campos explícitos · ${counts.inferred} inferidos · ${counts.missing} ausentes/pendentes.</p><p>${state.result?'Aplicar substituirá os campos em edição. O resultado atual será preservado no histórico.':'Confira os primeiros resultados antes de preencher os blocos.'}</p><ul>${result.sections.persona.slice(0,3).map(row=>`<li>${esc(ANALYSIS_SECTIONS[0].fields.find(([key])=>key===row.key)[1])}: ${esc(row.text||'Ausente')}</li>`).join('')}</ul><button class="btn primary hub-standard-action" type="button" data-analysis-action="apply">Aplicar análise recebida</button></div>`}
  function download(text,extension,name='analise'){
    const url=URL.createObjectURL(new Blob([text],{type:extension==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`review-${materials.current().draft.id.slice(0,8)}-${name}.${extension}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function updateField(event){
    const {analysisSection:section,analysisKey:key,analysisProperty:property}=event.target.dataset;if(!property)return;
    const value=property==='sourceIds'?[...root.querySelectorAll(`[data-analysis-section="${section}"][data-analysis-key="${key}"][data-analysis-property="sourceIds"]:checked`)].map(node=>node.value):event.target.value;
    controller.updateField(section,key,property,value);message='';failed=false;
    const classification=root.querySelector(`#analysis-class-${section}-${key}`);if(classification)classification.value=controller.current().state.result.sections[section].find(row=>row.key===key).classification;
    status();
  }
  root.addEventListener('input',event=>{
    if(event.target.matches('[data-analysis-import]')){controller.setImport(event.target.value);root.querySelector('[data-analysis-preview]').innerHTML='';message='';failed=false;status()}
    else if(event.target.tagName==='TEXTAREA')updateField(event);
  });
  root.addEventListener('change',event=>{
    try{
      if(event.target.matches('[data-analysis-review]')){materials.select(event.target.value);message='';failed=false;render()}
      else if(event.target.matches('[data-analysis-source]')){controller.selectSources([...root.querySelectorAll('[data-analysis-source]:checked')].map(node=>node.dataset.analysisSource));message='Fontes alteradas para o próximo pedido. Prepare novamente para atualizar o conteúdo enviado.';failed=false;render()}
      else if(event.target.matches('[data-analysis-reviewed]')){controller.setReviewed(event.target.checked);message='';failed=false;status()}
      else updateField(event);
    }catch(error){message=error.message;failed=true;status()}
  });
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-analysis-action]'),action=button?.dataset.analysisAction;if(!action)return;
    try{
      message='';failed=false;
      if(action==='prepare'){controller.prepare();message='Pedido preparado. Copie para o assistente e salve para retomar depois.';render()}
      if(action==='copy'){const currentText=controller.currentPrompt(),prompt=root.querySelector('[data-analysis-prompt]');try{await navigator.clipboard.writeText(currentText);message='Pedido copiado. Cole no chat com o assistente.'}catch{prompt.focus();prompt.select();message='Não foi possível copiar automaticamente. O pedido foi selecionado; use Ctrl+C ou Baixar pedido.'}status()}
      if(action==='prompt')download(controller.currentPrompt(),'txt','pedido');
      if(action==='validate'){controller.preview();message='Confira a prévia. Os campos atuais ainda não foram alterados.';render()}
      if(action==='apply'){controller.apply();message='Análise aplicada. Revise os blocos e salve.';render()}
      if(action==='save'){
        const id=materials.current().draft.id;button.disabled=true;
        try{if(navigator.locks?.request)await navigator.locks.request('hub-review-analysis-'+id,()=>controller.save(id));else controller.save(id);message='Análise salva neste navegador; revisões anteriores preservadas.';render()}finally{button.disabled=false}
      }
      if(action==='md'||action==='json'){const state=controller.current().state,draft=materials.current().draft,stale=isStale(state.result||state.request,draft),quality=analysisQuality(state,{draft});download(action==='json'?JSON.stringify({...state,reviewed:state.reviewed&&!stale&&quality.code!=='empty',materialsChanged:stale,quality:quality.code},null,2):exportAnalysis(state,{draft}),action);message='Análise exportada com as edições atuais.';status()}
    }catch(error){message=error.message;failed=true;status()}
  });
  render();
}

import * as Repository from './curation-observability-storage.mjs';
import * as Domain from './curation-observability-domain.mjs';

const SOURCE_LABELS={'guru-media-lista-gerente':'Lista de Gerente','guru-media-ecommerce-gm':'E-commerce GM',manager:'Lista de Gerente',top:'E-commerce GM'};
const $=(root,selector)=>root.querySelector(selector);
const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dateTime=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date)};
const label=value=>value==null||value===''?'—':typeof value==='object'?JSON.stringify(value):String(value);
const glimpseSignalLabel=value=>({strong:'Forte',positive:'Positivo',mixed:'Misto',weak:'Fraco',insufficient_data:'Dados insuficientes',medium:'Médio',limited:'Dados limitados'})[value]||label(value);
const glimpseDetailLabel=value=>({high:'Alta',medium:'Média',low:'Baixa',past_week:'última semana',past_month:'último mês',past_quarter:'último trimestre',past_year:'último ano'})[value]||label(value);

export async function mount({root,getOperationalEvents=()=>[]}={}){
  const started=performance.now();
  root.innerHTML=`<div class="curobs">
    <section class="curobs-toolbar">
      <div><span class="curobs-kicker">Histórico independente da operação</span><h2>Observabilidade da Curadoria</h2><p>O que estava registrado antes da decisão de testar. Nenhum dado é enviado ao Event Log operacional.</p></div>
      <div class="curobs-backup"><button class="curobs-button primary" data-export type="button">Exportar backup</button><label class="curobs-button">Restaurar backup<input data-import type="file" accept="application/json,.json" hidden></label></div>
    </section>
    <section class="curobs-panel">
      <div class="curobs-filters">
        <label>Produto exato<input data-filter="productName" type="search" placeholder="Nome do produto" autocomplete="off"></label>
        <label>Origem<select data-filter="origin"><option value="">Todas</option><option value="guru-media-lista-gerente">Lista de Gerente</option><option value="guru-media-ecommerce-gm">E-commerce GM</option></select></label>
        <label>Tipo<select data-filter="eventType"><option value="">Todos</option><option value="trends_saved">Trends salvo</option><option value="images_saved">Imagens salvo</option><option value="glimpse_completed">Glimpse concluído</option><option value="decision_changed">Decisão alterada</option><option value="snapshot_decisao_created">Snapshot de decisão</option></select></label>
        <label>Decisão<select data-filter="decisionStatus"><option value="">Todas</option><option>Não definido</option><option>Subir campanha</option><option>Campanha no ar</option><option>Revisar</option><option>Ocultar</option></select></label>
        <label>Correlação<select data-filter="correlationStatus"><option value="">Todos</option><option value="pending">Pendente</option><option value="confirmed">Confirmada</option></select></label>
      </div>
      <div class="curobs-list-head"><span data-count>Carregando histórico…</span><span data-load-time></span></div>
      <div class="curobs-table-wrap"><table class="curobs-table"><thead><tr><th>Data/hora</th><th>Produto</th><th>Origem · Offer ID</th><th>Registro</th><th>Trends</th><th>Imagens</th><th>Glimpse</th><th>Decisão</th><th>Correlação</th><th></th></tr></thead><tbody data-rows></tbody></table></div>
      <div class="curobs-empty" data-empty hidden></div>
      <div class="curobs-pager"><button class="curobs-button" data-prev type="button" disabled>← Anterior</button><span data-page-label>Página 1</span><button class="curobs-button" data-next type="button" disabled>Próxima →</button></div>
    </section>
    <p class="curobs-note">Avaliações são registradas ao serem salvas. O snapshot é criado somente quando a decisão muda para “Subir campanha” e permanece imutável. A correlação não altera nenhum dos dois históricos.</p>
    <div class="curobs-live" data-message role="status" aria-live="polite"></div>
  </div>`;

  await Repository.openDB();
  let filters={},cursorStack=[null],pageIndex=0,pageResult=null,detailCache=new Map(),operationalCandidateIndex=null,renderToken=0;
  const renderPage=async()=>{
    const token=++renderToken;
    const began=performance.now();
    const result=await Repository.listEventsPage({filters,cursor:cursorStack[pageIndex],limit:30,scanLimit:600});
    if(token!==renderToken)return;
    pageResult=result;
    const withCorrelations=await Promise.all(result.items.map(async event=>({event,correlation:event.correlationId?await Repository.getCorrelation(event.correlationId):null})));
    if(token!==renderToken)return;
    const total=await Repository.countEvents();
    $(root,'[data-count]').textContent=`${withCorrelations.length} registro(s) nesta página · ${total} no histórico`;
    $(root,'[data-load-time]').textContent=`Consulta: ${Math.round(performance.now()-began)} ms`;
    $(root,'[data-page-label]').textContent=`Página ${pageIndex+1}`;
    $(root,'[data-prev]').disabled=pageIndex===0;
    $(root,'[data-next]').disabled=!result.hasMore;
    $(root,'[data-empty]').hidden=withCorrelations.length>0;
    $(root,'[data-empty]').textContent=total?'Nenhum registro corresponde aos filtros deste trecho. Você pode continuar a busca na próxima página.':'As avaliações futuras de Trends, Imagens, Glimpse e decisões aparecerão aqui depois de serem salvas.';
    $(root,'[data-rows]').innerHTML=withCorrelations.map(({event,correlation})=>rowHtml(event,correlation)).join('');
    bindRows();
  };
  function currentFilters(){return Object.fromEntries([...root.querySelectorAll('[data-filter]')].map(control=>[control.dataset.filter,control.value.trim()]).filter(([,value])=>value))}
  for(const control of root.querySelectorAll('[data-filter]'))control.addEventListener(control.tagName==='INPUT'?'change':'change',()=>{filters=currentFilters();cursorStack=[null];pageIndex=0;detailCache.clear();renderPage().catch(showError)});
  $(root,'[data-prev]').onclick=()=>{if(pageIndex>0){pageIndex--;renderPage().catch(showError)}};
  $(root,'[data-next]').onclick=()=>{if(pageResult?.hasMore){cursorStack[pageIndex+1]=pageResult.nextCursor;pageIndex++;renderPage().catch(showError)}};
  $(root,'[data-export]').onclick=async()=>{try{const payload=await Repository.exportBackup(),blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`observabilidade-curadoria-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`Backup exportado: ${payload.events.length} eventos, ${payload.pretest_snapshots.length} snapshots e ${payload.correlations.length} correlações.`)}catch(error){showError(error)}};
  $(root,'[data-import]').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{const result=await Repository.mergeBackup(JSON.parse(await file.text()));message(`Backup mesclado: ${result.added} registros adicionados; ${result.skipped} existentes/inválidos preservados.`);cursorStack=[null];pageIndex=0;await renderPage()}catch(error){showError(error)}finally{event.target.value=''}};
  function message(value){$(root,'[data-message]').textContent=value;$(root,'[data-message]').classList.add('visible');setTimeout(()=>$(root,'[data-message]').classList.remove('visible'),4500)}
  function showError(error){console.error(error);message(error?.message||'Não foi possível concluir a ação.')}
  function bindRows(){
    for(const button of root.querySelectorAll('[data-expand]'))button.onclick=()=>toggleDetails(button.dataset.expand,button.dataset.correlation||'');
  }
  async function toggleDetails(eventId,correlationId){
    const row=root.querySelector(`[data-detail-row="${CSS.escape(eventId)}"]`);if(!row)return;
    const opened=!row.hidden;row.hidden=opened;if(opened)return;
    const content=row.querySelector('.curobs-detail-content');content.innerHTML='<span class="curobs-muted">Carregando detalhes…</span>';
    try{
      const event=pageResult.items.find(item=>item.eventId===eventId);if(!event)return;
      const detail=await getDetails(event);const correlation=correlationId?await Repository.getCorrelation(correlationId):null;
      content.innerHTML=`${renderSummaryDetail(event,detail)}${event.snapshotId?renderSnapshot(await Repository.getSnapshot(event.snapshotId)):''}${correlation?renderCorrelation(correlation):''}`;
      if(correlation)bindCorrelationControls(content,correlation);
    }catch(error){content.textContent=error?.message||'Falha ao carregar detalhes.'}
  }
  async function getDetails(event){
    if(detailCache.has(event.eventId))return detailCache.get(event.eventId);
    let detail=null;
    if(event.detailRef?.database==='radar-glimpse')detail=await readGlimpseAnalysis(event.detailRef.key);
    else if(event.detailId)detail=await Repository.getEventDetail(event.detailId);
    detailCache.set(event.eventId,detail);return detail;
  }
  async function readGlimpseAnalysis(key){return new Promise((resolve,reject)=>{const request=indexedDB.open('radar-glimpse',1);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('analyses')){db.close();resolve(null);return}const get=db.transaction('analyses').objectStore('analyses').get(key);get.onsuccess=()=>{db.close();resolve(get.result||null)};get.onerror=()=>{db.close();reject(get.error)}};request.onerror=()=>reject(request.error)})}
  function renderSummaryDetail(event,detail){
    const data=detail?.payload||detail;
    if(!data)return '<p class="curobs-muted">O detalhe original não está disponível. O registro resumido foi preservado.</p>';
    return `<details class="curobs-detail-block"><summary>Dados persistidos da ação</summary><pre>${safe(JSON.stringify(data,null,2))}</pre></details>`;
  }
  function renderSnapshot(snapshot){
    if(!snapshot)return '<p class="curobs-muted">Snapshot não encontrado neste backup.</p>';
    const trend=snapshot.signals?.trends?.latestAssessment||null,images=snapshot.signals?.images?.currentByCountry||[],glimpse=snapshot.signals?.glimpse;
    const trendsText=trend?[label(trend.status),trend.searchTerm,trend.countries?.join(', ')||trend.country,trend.period].filter(Boolean).join(' · '):'—';
    const imagesText=images.map(item=>`${item.country||'País não informado'}: ${label(item.status)} · ${item.searchTerm||'—'}${item.refinementOf?` · refinada de ${item.refinementOf}`:''}`).join(' | ')||'—';
    const glimpseText=glimpse?[glimpseSignalLabel(glimpse.signal?.level),glimpse.analyzerVersion?`Analisador ${glimpse.analyzerVersion}`:null,glimpse.parsed?.volume?.display,glimpse.parsed?.movement?.percent===null||glimpse.parsed?.movement?.percent===undefined?null:`${glimpse.parsed.movement.percent}% · ${glimpseDetailLabel(glimpse.parsed.movement.period||'janela não detectada')}`,glimpse.confidence?.level?`Confiança ${glimpseDetailLabel(glimpse.confidence.level)}`:null,glimpse.alerts?.length?`${glimpse.alerts.length} alerta(s)`:null,glimpse.indicators?.coverage?.level?`Cobertura ${glimpseDetailLabel(glimpse.indicators.coverage.level)}`:null].map(label).filter(x=>x!=='—').join(' · '):'—';
    return `<section class="curobs-snapshot"><h3>SNAPSHOT DE DECISÃO · ${safe(dateTime(snapshot.capturedAt))}</h3><div class="curobs-snapshot-grid"><div><small>Produto</small><b>${safe(snapshot.productName)}</b></div><div><small>Origem / Offer ID</small><b>${safe(`${SOURCE_LABELS[snapshot.origin]||snapshot.origin} · ${(snapshot.offerRefs||[]).map(ref=>ref.offerId).join(', ')||'—'}`)}</b></div><div><small>Decisão</small><b>${safe(snapshot.decision?.status)}</b></div><div><small>Trends</small><b>${safe(trendsText)}</b></div><div><small>Imagens</small><b>${safe(imagesText)}</b></div><div><small>Glimpse</small><b>${safe(glimpseText)}</b></div></div><details class="curobs-detail-block"><summary>Snapshot completo congelado</summary><pre>${safe(JSON.stringify(snapshot,null,2))}</pre></details></section>`;
  }
  function latestValue(items){return [...(items||[])].sort((a,b)=>String(b?.capturedAt||b?.date||'').localeCompare(String(a?.capturedAt||a?.date||'')))[0]||null}
  function renderCorrelation(correlation){
    const accounts=[...new Set((correlation.links||[]).map(link=>link.account_id).filter(Boolean))];
    const status=correlation.status==='confirmed'?`Confirmada · ${correlation.product_id} · conta(s) ${accounts.join(', ')||'—'}`:'Pendente de confirmação';
    return `<section class="curobs-correlation"><div><h3>Correlação com a Operação</h3><p>${safe(status)}. Sugestões por nome são apenas candidatas; nenhuma associação é automática.</p></div><button class="curobs-button" data-find-candidates type="button">${correlation.status==='confirmed'?'Revisar vínculo':'Buscar candidato'}</button><div class="curobs-candidate-area" data-candidate-area></div></section>`;
  }
  function bindCorrelationControls(content,correlation){
    content.querySelector('[data-find-candidates]').onclick=()=>showCandidates(content,correlation);
  }
  function getCandidateIndex(){
    const events=getOperationalEvents()||[];
    if(operationalCandidateIndex?.events===events)return operationalCandidateIndex.map;
    const map=new Map();
    for(const event of events){if(!event?.product_id||!event?.test_id||!event?.account_id||!event?.campaign_id)continue;const confidence=String(event.metadata?.identity_confidence||'');if(/ambiguous|missing|unresolved/i.test(confidence))continue;const key=Domain.normalizeName(event.product_name);if(!key)continue;const list=map.get(key)||[];list.push(event);map.set(key,list)}
    operationalCandidateIndex={events,map};return map;
  }
  function showCandidates(content,correlation){
    const area=content.querySelector('[data-candidate-area]'),list=getCandidateIndex().get(Domain.normalizeName(correlation.productName))||[],candidates=Domain.summarizeOperationalCandidates(list,correlation.productName);
    if(!candidates.length){area.innerHTML='<p class="curobs-muted">Não há candidato operacional confiável no histórico carregado. A correlação permanece pendente.</p>';return}
    area.innerHTML=`<label>Produto operacional candidato<select data-candidate>${candidates.map((candidate,index)=>{const accounts=[...new Set(candidate.tests.map(test=>test.account_id))],campaignCount=candidate.tests.reduce((sum,test)=>sum+test.campaigns.length,0);return `<option value="${index}">${safe(`${candidate.product_name} · ${candidate.product_id} · ${candidate.tests.length} teste(s) · conta(s) ${accounts.join(', ')} · ${campaignCount} campanha(s)`)}</option>`}).join('')}</select></label><p class="curobs-muted">A confirmação vincula os testes e campanhas observados deste product_id. A correspondência pelo nome não é aceita sem sua confirmação.</p><div class="curobs-correlation-actions"><button class="curobs-button primary" data-confirm-candidate type="button">${correlation.status==='confirmed'?'Corrigir vínculo':'Confirmar vínculo'}</button>${correlation.status==='confirmed'?'<button class="curobs-button danger" data-unlink type="button">Invalidar vínculo</button>':''}</div>`;
    area.querySelector('[data-confirm-candidate]').onclick=async()=>{const selected=candidates[Number(area.querySelector('[data-candidate]').value)];try{await Repository.updateCorrelation(correlation.correlationId,{action:correlation.status==='confirmed'?'correct':'confirm',candidate:selected,reason:'Confirmado manualmente na Observabilidade da Curadoria'});message('Correlação atualizada; os históricos de Curadoria e Operação não foram alterados.');await renderPage()}catch(error){showError(error)}};
    area.querySelector('[data-unlink]')?.addEventListener('click',async()=>{if(!confirm('Invalidar este vínculo? Os históricos originais serão preservados.'))return;try{await Repository.updateCorrelation(correlation.correlationId,{action:'unlink',reason:'Vínculo invalidado manualmente'});message('Vínculo invalidado e correção registrada.');await renderPage()}catch(error){showError(error)}});
  }
  function rowHtml(event,correlation){
    const origin=SOURCE_LABELS[event.origin]||event.origin||'—',offerIds=(event.offerRefs||[]).map(item=>item.offerId).filter(Boolean).join(', ')||'—',trends=event.summary?.trends,images=event.summary?.images,glimpse=event.summary?.glimpse,decision=event.decisionStatus||'—',corr=correlation?(correlation.status==='confirmed'?'Confirmada':'Pendente'):'—';
    return `<tr><td>${safe(dateTime(event.occurredAt))}</td><td>${safe(event.productName||'—')}</td><td>${safe(origin)}<small>Offer ID: ${safe(offerIds)}</small></td><td>${safe(Domain.EVENT_TYPES[event.eventType]||event.eventType)}</td><td>${safe(summaryValue(trends))}</td><td>${safe(summaryValue(images))}</td><td>${safe(glimpseSignalLabel(glimpse))}</td><td>${safe(decision)}</td><td><span class="curobs-state ${correlation?.status||''}">${safe(corr)}</span></td><td><button class="curobs-expand" data-expand="${safe(event.eventId)}" data-correlation="${safe(event.correlationId||'')}" type="button" aria-expanded="false">Detalhes</button></td></tr><tr data-detail-row="${safe(event.eventId)}" hidden><td colspan="10"><div class="curobs-detail-content"></div></td></tr>`;
  }
  function summaryValue(value){if(!value)return'—';if(typeof value==='object'){const item=value.status||value.signal||value.value||value;return `${label(item)}${value.country?` · ${value.country}`:''}${value.searchTerm?` · ${value.searchTerm}`:''}`}return label(value)}

  await renderPage();
  const openedInMs=Math.round(performance.now()-started);
  $(root,'[data-load-time]').textContent=`Abertura da tela: ${openedInMs} ms`;
  return {openedInMs};
}

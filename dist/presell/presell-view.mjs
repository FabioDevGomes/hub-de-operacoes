const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function reportHtml(report){
  const phases=report?.phases||[];
  const overall=report?.overall||'SEM RESULTADO';
  const lines=phases.flatMap(phase=>(phase.report?.checks||[]).map(check=>`<li><b>${escapeHtml(check.status)}</b> · ${escapeHtml(phase.name)} / ${escapeHtml(check.name)} — ${escapeHtml(check.message)}${check.items?.length?` <span>${escapeHtml(check.items.join(', '))}</span>`:''}</li>`));
  return `<div class="presell-result ${overall==='BLOCKED'?'is-error':overall==='PASS'?'is-pass':'is-warn'}"><strong>${escapeHtml(overall)}</strong><ul>${lines.join('')||'<li>Nenhum detalhe retornado.</li>'}</ul></div>`;
}

function parseFicha(text){
  let ficha;
  try{ficha=JSON.parse(text)}catch{throw new Error('A ficha precisa estar em JSON válido.')}
  if(!ficha||typeof ficha!=='object'||Array.isArray(ficha))throw new Error('A ficha precisa ser um objeto JSON.');
  for(const field of['destination','htmlLanguage','countryCode','pageTitle','affiliateUrl'])if(!String(ficha[field]||'').trim())throw new Error(`Campo obrigatório ausente: ${field}.`);
  if(!Array.isArray(ficha.faqs)||ficha.faqs.length!==4)throw new Error('A ficha deve conter exatamente quatro FAQs.');
  ficha.assetFolder=String(ficha.assetFolder||'assets');
  return ficha;
}

async function callApi(path,ficha){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({destination:ficha.destination,ficha})});
  const result=await response.json().catch(()=>({error:'Resposta inválida do serviço local.'}));
  if(!response.ok)throw new Error(result.error||'O serviço local recusou a operação.');
  return result;
}

export async function mount({root,toast}){
  root.innerHTML=`<div class="presell-shell"><div class="card presell-card"><div class="panel-head"><div><h2>Ficha da Pre-Sell</h2><p>Cole a ficha JSON normalizada. A validação é somente leitura; criar arquivos exige confirmação explícita.</p></div><span class="tag">Local</span></div><div class="presell-body"><label for="presellFicha">Ficha JSON</label><textarea id="presellFicha" class="presell-textarea" spellcheck="false" placeholder='{"destination":"C:\\Users\\...\\produtos\\Produto\\pag01","assetFolder":"assets","htmlLanguage":"en","countryCode":"US","pageTitle":"...","affiliateUrl":"https://...","cookieTitle":"...","cookieText":"...","acceptLabel":"...","declineLabel":"...","closeAriaLabel":"...","detailsLabel":"...","faqTitle":"...","offerMainTitle":"...","offerIntro":"...","offerOverviewTitle":"...","offerOverviewText":"...","priceTitle":"...","priceText":"...","shippingGuaranteeTitle":"...","shippingGuaranteeText":"...","faqs":[{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}]}'></textarea><p class="presell-help">O serviço usa exclusivamente o template fixo e exige <code>assets/01.png</code>, <code>02.png</code> e <code>03.png</code>. Não cria campanhas, rastreamento nem sobrescreve arquivos existentes.</p><div class="presell-actions"><button id="presellValidate" class="btn" type="button">Validar ficha e destino</button><button id="presellProduce" class="btn primary" type="button">Criar pre-sell</button></div><div id="presellMessage" class="presell-message">Nenhuma ficha analisada.</div><div id="presellReport"></div></div></div></div>`;
  const $=selector=>root.querySelector(selector),message=$('#presellMessage'),report=$('#presellReport');
  const execute=async(produce)=>{
    let ficha;
    try{ficha=parseFicha($('#presellFicha').value);message.textContent=produce?'Produzindo em estágio e validando…':'Validando destino e ficha…';report.innerHTML='';const result=await callApi(produce?'/api/presell/produce':'/api/presell/validate',ficha);message.textContent=produce?'Produção concluída.':'Validação concluída.';report.innerHTML=reportHtml(result.report||result);toast(produce?'Pre-sell processada.':'Ficha validada.');}
    catch(error){message.textContent=error.message;report.innerHTML='';toast(error.message,true)}
  };
  $('#presellValidate').onclick=()=>execute(false);
  $('#presellProduce').onclick=()=>{if(confirm('Criar somente se index.html, styles.css e scripts.js ainda não existirem no destino informado?'))execute(true)};
}

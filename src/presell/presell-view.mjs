import {reportHtml} from './presell-report.mjs?v=1';
import {parseFicha,callApi} from './presell-service.mjs?v=1';
// Compatibility entry points for legacy consumers.
export {reportHtml} from './presell-report.mjs?v=1';
export {parseFicha,createPresellFromFicha} from './presell-service.mjs?v=1';

export async function mount({root,toast}){
  root.innerHTML=`<div class="presell-shell"><div class="card presell-card"><div class="panel-head"><div><h2>Ficha da Presell</h2><p>Cole a ficha JSON normalizada. A validação é somente leitura; criar arquivos exige confirmação explícita.</p></div><span class="tag">Local</span></div><div class="presell-body"><label for="presellFicha">Ficha JSON</label><textarea id="presellFicha" class="presell-textarea" spellcheck="false" placeholder='{"destination":"C:\\Users\\...\\produtos\\Produto\\pag01","assetFolder":"assets","htmlLanguage":"en","countryCode":"US","pageTitle":"...","affiliateUrl":"https://...","cookieTitle":"...","cookieText":"...","acceptLabel":"...","declineLabel":"...","closeAriaLabel":"...","detailsLabel":"...","faqTitle":"...","offerMainTitle":"...","offerIntro":"...","offerOverviewTitle":"...","offerOverviewText":"...","priceTitle":"...","priceText":"...","shippingGuaranteeTitle":"...","shippingGuaranteeText":"...","faqs":[{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}]}'></textarea><p class="presell-help">O serviço usa exclusivamente o template fixo e exige <code>assets/01.png</code>, <code>02.png</code> e <code>03.png</code>. Não cria campanhas, rastreamento nem sobrescreve arquivos existentes.</p><div class="presell-actions"><button id="presellValidate" class="btn" type="button">Validar ficha e destino</button><button id="presellProduce" class="btn primary" type="button">Criar Presell</button></div><div id="presellMessage" class="presell-message">Nenhuma ficha analisada.</div><div id="presellReport"></div></div></div></div>`;
  const $=selector=>root.querySelector(selector),message=$('#presellMessage'),report=$('#presellReport');
  const execute=async(produce)=>{
    let ficha;
    try{ficha=parseFicha($('#presellFicha').value);message.textContent=produce?'Produzindo em estágio e validando…':'Validando destino e ficha…';report.innerHTML='';const result=await callApi(produce?'/api/presell/produce':'/api/presell/validate',ficha);message.textContent=produce?'Produção concluída.':'Validação concluída.';report.innerHTML=reportHtml(result.report||result);toast(produce?'Presell processada.':'Ficha validada.');}
    catch(error){message.textContent=error.message;report.innerHTML='';toast(error.message,true)}
  };
  $('#presellValidate').onclick=()=>execute(false);
  $('#presellProduce').onclick=()=>{if(confirm('Criar somente se index.html, styles.css e scripts.js ainda não existirem no destino informado?'))execute(true)};
}

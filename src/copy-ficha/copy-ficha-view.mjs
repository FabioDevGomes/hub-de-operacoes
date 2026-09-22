import {parseOfferText,generateAssets,fichaJson,formatSitelinks,dictionaryFor} from './copy-ficha-domain.mjs';

let mounted=false;
const STORAGE_KEY='copy-ficha-draft-v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const by=(root,id)=>root.querySelector(`#${id}`);
const state={packages:[{label:'',regularPrice:'',promoPrice:'',contents:''},{label:'',regularPrice:'',promoPrice:'',contents:''},{label:'',regularPrice:'',promoPrice:'',contents:''}]};

function packageValues(root){
  return [...root.querySelectorAll('.copy-ficha-package')].map(row=>({
    label:row.querySelector('[data-field="label"]').value,
    regularPrice:row.querySelector('[data-field="regularPrice"]').value,
    promoPrice:row.querySelector('[data-field="promoPrice"]').value,
    contents:row.querySelector('[data-field="contents"]').value
  }));
}

function renderPackages(root){
  const host=by(root,'copyPackages');
  host.innerHTML=state.packages.map((item,index)=>`<div class="copy-ficha-package ${item.confidence?'is-autofilled':''}" data-index="${index}">
    <div class="copy-ficha-field"><label>Nome do pacote${item.confidence?` <span class="copy-ficha-auto-tag">${item.confidence==='high'?'Detectado':'Revisar'}</span>`:''}</label><input class="copy-ficha-input" data-field="label" value="${esc(item.label)}" placeholder="Ex.: 6-month bundle"></div>
    <div class="copy-ficha-field"><label>Preço original</label><input class="copy-ficha-input" data-field="regularPrice" inputmode="decimal" value="${esc(item.regularPrice)}" placeholder="199.00"></div>
    <div class="copy-ficha-field"><label>Preço promocional</label><input class="copy-ficha-input" data-field="promoPrice" inputmode="decimal" value="${esc(item.promoPrice)}" placeholder="79.00"></div>
    <div class="copy-ficha-field"><label>Conteúdo confirmado</label><input class="copy-ficha-input" data-field="contents" value="${esc(item.contents)}" placeholder="Ex.: MyoGlow + 1 month of No-Tox"></div>
    <button class="copy-ficha-btn danger" type="button" data-remove-package="${index}" aria-label="Remover pacote">Remover</button>
  </div>`).join('');
  host.querySelectorAll('[data-remove-package]').forEach(button=>button.onclick=()=>{
    state.packages=packageValues(root).filter((_,index)=>index!==Number(button.dataset.removePackage));
    if(!state.packages.length)state.packages=[{label:'',regularPrice:'',promoPrice:'',contents:''}];
    renderPackages(root);
  });
}

function inputValue(root,id){return by(root,id)?.value?.trim()||''}
function normalizedUrl(value){
  const text=String(value||'').trim(),markdown=text.match(/^\[(https?:\/\/[^\]]+)\]\([^)]+\)$/);
  return markdown?markdown[1]:text;
}
function payload(root){
  return {
    dtcUrl:normalizedUrl(inputValue(root,'copyDtcUrl')),
    rawText:inputValue(root,'copyRawText'),
    product:inputValue(root,'copyProduct'),
    countryCode:inputValue(root,'copyCountry').toUpperCase(),
    htmlLanguage:inputValue(root,'copyLanguage'),
    currency:inputValue(root,'copyCurrency').toUpperCase(),
    confirmedDiscountPercent:inputValue(root,'copyDiscount'),
    pageTitle:inputValue(root,'copyPageTitle'),
    destination:inputValue(root,'copyDestination'),
    assetFolder:inputValue(root,'copyAssetFolder')||'assets',
    affiliateUrl:normalizedUrl(inputValue(root,'copyAffiliateUrl')),
    guaranteeDays:inputValue(root,'copyGuarantee'),
    freeShipping:inputValue(root,'copyFreeShipping'),
    fastShipping:inputValue(root,'copyFastShipping'),
    urgencyConfirmed:inputValue(root,'copyUrgency'),
    scarcityConfirmed:inputValue(root,'copyScarcity'),
    packages:packageValues(root)
  };
}
function saveDraft(root){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(payload(root)))}catch{}
}
function restoreDraft(root){
  try{
    const draft=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(!draft)return;
    const fields={copyDtcUrl:draft.dtcUrl,copyRawText:draft.rawText,copyProduct:draft.product,copyCountry:draft.countryCode,copyLanguage:draft.htmlLanguage,copyCurrency:draft.currency,copyDiscount:draft.confirmedDiscountPercent,copyPageTitle:draft.pageTitle,copyDestination:draft.destination,copyAssetFolder:draft.assetFolder,copyAffiliateUrl:draft.affiliateUrl,copyGuarantee:draft.guaranteeDays,copyFreeShipping:draft.freeShipping,copyFastShipping:draft.fastShipping,copyUrgency:draft.urgencyConfirmed,copyScarcity:draft.scarcityConfirmed};
    for(const [id,value] of Object.entries(fields))if(by(root,id)&&value!==undefined)by(root,id).value=value;
    if(Array.isArray(draft.packages)&&draft.packages.length){state.packages=draft.packages;renderPackages(root)}
  }catch{}
}

function applyDetected(root,id,value,{force=false}={}){
  const field=by(root,id);
  if(!field||value===null||value===undefined||String(value).trim()==='')return false;
  if(!force&&field.value&&field.dataset.autoFilled!=='true')return false;
  field.value=String(value);
  field.dataset.autoFilled='true';
  field.classList.add('is-autofilled');
  return true;
}

function analyze(root){
  const result=parseOfferText(inputValue(root,'copyRawText'),normalizedUrl(inputValue(root,'copyDtcUrl'))),applied=[];
  if(applyDetected(root,'copyProduct',result.productCandidate))applied.push('produto');
  if(applyDetected(root,'copyCountry',result.countryCode))applied.push('país');
  if(applyDetected(root,'copyLanguage',result.htmlLanguage,{force:Boolean(result.htmlLanguage)}))applied.push('idioma');
  if(applyDetected(root,'copyCurrency',result.currency,{force:Boolean(result.currency)}))applied.push('moeda');
  if(applyDetected(root,'copyDiscount',result.highestPercent))applied.push('desconto');
  if(applyDetected(root,'copyGuarantee',result.guaranteeDays))applied.push('garantia');
  const titleProduct=inputValue(root,'copyProduct')||result.productCandidate,titleLanguage=result.htmlLanguage||inputValue(root,'copyLanguage'),titleCandidate=titleProduct?`${titleProduct} | ${dictionaryFor(titleLanguage).packages}`:result.pageTitleCandidate;
  if(applyDetected(root,'copyPageTitle',titleCandidate))applied.push('título da página');
  if(result.freeShippingCandidate&&applyDetected(root,'copyFreeShipping','confirmed',{force:inputValue(root,'copyFreeShipping')==='pending'}))applied.push('frete grátis');
  if(result.fastShippingCandidate&&applyDetected(root,'copyFastShipping','confirmed',{force:inputValue(root,'copyFastShipping')==='pending'}))applied.push('envio rápido');
  if(result.urgencyCandidate&&applyDetected(root,'copyUrgency','confirmed',{force:inputValue(root,'copyUrgency')==='pending'}))applied.push('urgência');
  if(result.scarcityCandidate&&applyDetected(root,'copyScarcity','confirmed',{force:inputValue(root,'copyScarcity')==='pending'}))applied.push('escassez');
  const currentPackages=packageValues(root),hasPackageData=currentPackages.some(item=>Object.values(item).some(Boolean));
  if(result.packages.length&&!hasPackageData){state.packages=result.packages;renderPackages(root);applied.push(`${result.packages.length} pacote(s)`)}
  const chips=[];
  if(result.productCandidate)chips.push(`Produto: ${result.productCandidate}`);
  if(result.countryCode)chips.push(`País: ${result.countryCode}`);
  if(result.htmlLanguage)chips.push(`Idioma: ${result.htmlLanguage}`);
  if(result.highestPercent)chips.push(`Maior percentual detectado: ${result.highestPercent}%`);
  if(result.amounts.length)chips.push(`Valores: ${result.amounts.slice(0,8).join(' · ')}`);
  if(result.guaranteeDays)chips.push(`Garantia candidata: ${result.guaranteeDays} dias`);
  if(result.freeShippingCandidate)chips.push('Candidato: frete grátis');
  if(result.fastShippingCandidate)chips.push('Candidato: envio rápido');
  if(result.urgencyCandidate)chips.push('Candidato: urgência');
  if(result.scarcityCandidate)chips.push('Candidato: escassez');
  if(result.packages.length)chips.push(`Pacotes detectados: ${result.packages.length}`);
  by(root,'copyDetected').innerHTML=chips.length?chips.map(item=>`<span class="copy-ficha-chip">${esc(item)}</span>`).join(''):'<span class="copy-ficha-note">Nenhum preço, desconto ou condição reconhecível foi detectado automaticamente.</span>';
  by(root,'copyAnalysisNote').textContent=applied.length?`Preenchido automaticamente: ${applied.join(', ')}. Revise os campos destacados antes de gerar.`:'Os itens detectados foram mantidos como candidatos porque os campos já continham dados. Revise o passo 2.';
  saveDraft(root);
}

function setOutput(root,id,value){by(root,id).value=value}
function renderWarnings(root,warnings){
  const host=by(root,'copyWarnings');
  host.className=warnings.length?'copy-ficha-warning':'copy-ficha-success';
  host.textContent=warnings.length?warnings.join(' '):'Copy e ficha geradas com dados confirmados. Revise antes de publicar.';
}
function generate(root,toast){
  const data=payload(root);
  if(!data.product)throw new Error('Informe o nome do produto.');
  if(!data.countryCode)throw new Error('Informe o país (código de duas letras).');
  if(!data.htmlLanguage)throw new Error('Informe o idioma HTML.');
  if(!data.packages.some(item=>item.regularPrice&&item.promoPrice)&&!data.confirmedDiscountPercent)throw new Error('Informe pelo menos um preço original e promocional, ou um percentual confirmado.');
  if(data.affiliateUrl&&data.affiliateUrl!=='CONFIRMAR'&&!/^https?:\/\//i.test(data.affiliateUrl))throw new Error('A URL de afiliação precisa ser uma URL completa.');
  const assets=generateAssets(data),json=fichaJson(data);
  setOutput(root,'copyHeadlines',assets.headlines.join('\n'));
  setOutput(root,'copyDescriptions',assets.descriptions.join('\n'));
  setOutput(root,'copyCallouts',assets.callouts.join('\n'));
  setOutput(root,'copySitelinks',formatSitelinks(assets.sitelinks));
  setOutput(root,'copyFichaJson',json);
  by(root,'copyHeadlineCount').textContent=`${assets.headlines.length} opções · até 30 caracteres`;
  by(root,'copyDescriptionCount').textContent=`${assets.descriptions.length} opções · até 90 caracteres`;
  by(root,'copySitelinkCount').textContent=`${assets.sitelinks.length} opções · 3 linhas sem rótulos`;
  renderWarnings(root,assets.warnings);
  saveDraft(root);
  toast?.('Copy e Ficha JSON geradas');
}

async function copyOutput(root,id,toast){
  const field=by(root,id);
  if(!field.value)return;
  try{await navigator.clipboard.writeText(field.value)}catch{field.select();document.execCommand('copy')}
  toast?.('Conteúdo copiado');
}

function downloadFicha(root){
  const value=by(root,'copyFichaJson').value;
  if(!value)return;
  const product=inputValue(root,'copyProduct').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'oferta';
  const url=URL.createObjectURL(new Blob([value],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download=`ficha-${product}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),0);
}

export async function mount({root,toast}={}){
  if(!root)return;
  if(!mounted){
    root.innerHTML=`<div class="copy-ficha-shell">
      <section class="copy-ficha-card"><header><div><h2>1. Fonte da oferta</h2><p>A URL identifica a DTC; a colagem fornece os dados analisáveis sem depender de IA.</p></div></header><div class="copy-ficha-body">
        <div class="copy-ficha-grid"><div class="copy-ficha-field span-2"><label>URL da DTC / página do produtor</label><input id="copyDtcUrl" class="copy-ficha-input" type="url" placeholder="https://..."></div><div class="copy-ficha-field span-2"><label>URL de afiliação (sempre separada)</label><input id="copyAffiliateUrl" class="copy-ficha-input" type="url" placeholder="https://..."></div><div class="copy-ficha-field span-4"><label>Texto copiado da página (Ctrl+A, Ctrl+C, Ctrl+V)</label><textarea id="copyRawText" class="copy-ficha-textarea" placeholder="Cole aqui o conteúdo visível da oferta. O sistema preencherá o que reconhecer e destacará o que precisa de revisão."></textarea></div></div>
        <div class="copy-ficha-actions"><button id="copyAnalyze" class="copy-ficha-btn primary" type="button">Analisar e preencher</button></div><div id="copyDetected" class="copy-ficha-detected"></div><div id="copyAnalysisNote" class="copy-ficha-note"></div>
      </div></section>
      <section class="copy-ficha-card"><header><div><h2>2. Validação estruturada</h2><p>Os dados reconhecidos são preenchidos automaticamente; revise os campos destacados.</p></div></header><div class="copy-ficha-body">
        <div class="copy-ficha-grid">
          <div class="copy-ficha-field"><label>Produto</label><input id="copyProduct" class="copy-ficha-input" placeholder="MyoGlow"></div>
          <div class="copy-ficha-field"><label>País</label><input id="copyCountry" class="copy-ficha-input" maxlength="2" placeholder="US"></div>
          <div class="copy-ficha-field"><label>Idioma HTML</label><select id="copyLanguage" class="copy-ficha-select"><option value="en-US">en-US</option><option value="en-AU">en-AU</option><option value="en-CA">en-CA</option><option value="en-GB">en-GB</option><option value="pt-BR">pt-BR</option><option value="it-IT">it-IT</option><option value="es-ES">es-ES</option><option value="fr-FR">fr-FR</option><option value="de-DE">de-DE</option><option value="sv-SE">sv-SE</option></select></div>
          <div class="copy-ficha-field"><label>Moeda</label><select id="copyCurrency" class="copy-ficha-select"><option value="USD">USD</option><option value="AUD">AUD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="BRL">BRL</option><option value="SEK">SEK</option></select></div>
          <div class="copy-ficha-field"><label>Desconto confirmado (%)</label><input id="copyDiscount" class="copy-ficha-input" inputmode="decimal" placeholder="Calculado pelos pacotes"></div>
          <div class="copy-ficha-field"><label>Garantia confirmada (dias)</label><input id="copyGuarantee" class="copy-ficha-input" type="number" min="1" placeholder="90"></div>
          <div class="copy-ficha-field"><label>Frete grátis</label><select id="copyFreeShipping" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="no">Não exibido</option></select></div>
          <div class="copy-ficha-field"><label>Envio rápido</label><select id="copyFastShipping" class="copy-ficha-select"><option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="no">Não confirmado</option></select></div>
          <div class="copy-ficha-field"><label>Urgência atual</label><select id="copyUrgency" class="copy-ficha-select"><option value="pending">Não validada</option><option value="confirmed">Confirmada</option></select></div>
          <div class="copy-ficha-field"><label>Escassez atual</label><select id="copyScarcity" class="copy-ficha-select"><option value="pending">Não validada</option><option value="confirmed">Confirmada</option></select></div>
          <div class="copy-ficha-field span-2"><label>Título da página</label><input id="copyPageTitle" class="copy-ficha-input" placeholder="Produto | Package Options"></div>
          <div class="copy-ficha-field span-2"><label>Diretório da Pre-Sell</label><input id="copyDestination" class="copy-ficha-input" placeholder="C:\\Users\\...\\pag01"></div>
          <div class="copy-ficha-field"><label>Pasta de assets</label><input id="copyAssetFolder" class="copy-ficha-input" value="assets"></div>
        </div>
        <h3>Pacotes confirmados</h3><div id="copyPackages" class="copy-ficha-packages"></div><div class="copy-ficha-actions"><button id="copyAddPackage" class="copy-ficha-btn" type="button">Adicionar pacote</button><button id="copyGenerate" class="copy-ficha-btn primary" type="button">Gerar copy e ficha</button></div>
      </div></section>
      <section class="copy-ficha-card"><header><div><h2>3. Saídas</h2><p>Ativos respeitam os limites do Google Ads; a ficha segue o contrato do Gerador de Pre-Sell.</p></div><button id="copyDownloadFicha" class="copy-ficha-btn" type="button">Baixar JSON</button></header><div class="copy-ficha-body"><div class="copy-ficha-output-grid">
        <div class="copy-ficha-output"><h3>Headlines</h3><span id="copyHeadlineCount" class="copy-ficha-note"></span><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyHeadlines" type="button">Copiar</button><textarea id="copyHeadlines" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output"><h3>Descriptions</h3><span id="copyDescriptionCount" class="copy-ficha-note"></span><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyDescriptions" type="button">Copiar</button><textarea id="copyDescriptions" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output"><h3>Callouts</h3><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyCallouts" type="button">Copiar</button><textarea id="copyCallouts" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output"><h3>Sitelinks</h3><span id="copySitelinkCount" class="copy-ficha-note"></span><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copySitelinks" type="button">Copiar</button><textarea id="copySitelinks" class="copy-ficha-textarea" readonly></textarea></div>
        <div class="copy-ficha-output ficha"><h3>Ficha da Pre-Sell · JSON válido</h3><button class="copy-ficha-btn copy-ficha-copy" data-copy-output="copyFichaJson" type="button">Copiar</button><textarea id="copyFichaJson" class="copy-ficha-textarea" readonly></textarea></div>
      </div><div id="copyWarnings" class="copy-ficha-note">Preencha e valide os dados para gerar.</div></div></section>
    </div>`;
    renderPackages(root);restoreDraft(root);
    by(root,'copyAnalyze').onclick=()=>analyze(root);
    by(root,'copyAddPackage').onclick=()=>{state.packages=packageValues(root);state.packages.push({label:'',regularPrice:'',promoPrice:'',contents:''});renderPackages(root)};
    by(root,'copyGenerate').onclick=()=>{try{generate(root,toast)}catch(error){renderWarnings(root,[error.message]);toast?.(error.message)}};
    by(root,'copyDownloadFicha').onclick=()=>downloadFicha(root);
    root.querySelectorAll('[data-copy-output]').forEach(button=>button.onclick=()=>copyOutput(root,button.dataset.copyOutput,toast));
    const markManual=event=>{if(event.target.matches('.copy-ficha-input,.copy-ficha-select')){delete event.target.dataset.autoFilled;event.target.classList.remove('is-autofilled')}};
    root.addEventListener('input',markManual);root.addEventListener('change',markManual);
    mounted=true;
  }
}

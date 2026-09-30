import {dictionaryFor} from './copy-ficha-domain.mjs?v=20';

const fields={
  PRODUTO:'product',TEXTO_EXPANDIR:'detailsLabel',TITULO_PRINCIPAL:'offerMainTitle',
  INTRODUCAO:'offerIntro',TITULO_OFERTA:'offerOverviewTitle',TEXTO_OFERTA:'offerOverviewText',
  TITULO_PRECO:'priceTitle',TEXTO_PRECO:'priceText',
  TITULO_FRETE_GARANTIA:'shippingGuaranteeTitle',TEXTO_FRETE_GARANTIA:'shippingGuaranteeText',
  TITULO_FAQ:'faqTitle'
};
const trim=value=>String(value??'').trim();
const pending=value=>!trim(value)||trim(value).toUpperCase()==='CONFIRMAR';

export const structuredFichaFormat=[...Object.keys(fields),...Array.from({length:3},(_,i)=>[`PERGUNTA_${i+1}`,`RESPOSTA_${i+1}`]).flat()].map(key=>`[${key}] `).join('\n');

export function parseStructuredFicha(text=''){
  const source=trim(text).replace(/^\uFEFF/,'').replace(/^```[^\n]*\n|\n```$/g,''),values=Object.create(null),errors=[];
  const tags=[...source.matchAll(/^\s*\[([A-Za-z0-9_]+)\][ \t]*(.*)$/gm)];
  if(!tags.length)return {values,faqs:[],errors:['Texto da ficha: cole os dados no formato [PRODUTO], [TITULO_PRINCIPAL] e demais campos.']};
  if(source.slice(0,tags[0].index).trim())errors.push('Texto da ficha: há texto sem identificação antes do primeiro campo.');
  tags.forEach((tag,index)=>{
    const key=tag[1].toUpperCase(),value=source.slice(tag.index+tag[0].indexOf(']')+1,tags[index+1]?.index??source.length).trim();
    if(!Object.hasOwn(fields,key)&&! /^(PERGUNTA|RESPOSTA)_[1-4]$/.test(key))errors.push(`Texto da ficha: campo não reconhecido [${key}].`);
    else if(Object.hasOwn(values,key))errors.push(`Texto da ficha: campo duplicado [${key}].`);
    else values[key]=value;
  });
  for(const key of Object.keys(fields))if(pending(values[key]))errors.push(`Texto da ficha: preencha [${key}].`);
  const faqs=[];
  for(let i=1;i<=4;i++){
    const question=values[`PERGUNTA_${i}`],answer=values[`RESPOSTA_${i}`];
    if(i===4&&question===undefined&&answer===undefined)continue;
    if(pending(question))errors.push(`Texto da ficha: preencha [PERGUNTA_${i}].`);
    if(pending(answer))errors.push(`Texto da ficha: preencha [RESPOSTA_${i}].`);
    if(!pending(question)&&!pending(answer))faqs.push({question,answer});
  }
  return {values,faqs,errors};
}

export function buildStructuredFicha(text,data={}){
  const parsed=parseStructuredFicha(text),blockers=[...parsed.errors],targets=new Set(parsed.errors.length?['fichaSource']:[]);
  const requireField=(key,message,valid)=>{if(!valid){blockers.push(message);targets.add(key)}};
  requireField('htmlLanguage','Idioma HTML: selecione um idioma válido.',/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(trim(data.htmlLanguage)));
  requireField('countryCode','País: informe o código de duas letras.',/^[A-Z]{2}$/.test(trim(data.countryCode)));
  requireField('destination','Diretório da Pre-Sell: informe o destino.',!pending(data.destination));
  requireField('assetFolder','Pasta de assets: use apenas letras, números, hífen ou sublinhado.',/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(trim(data.assetFolder)||'assets'));
  let url;
  try{url=new URL(trim(data.affiliateUrl))}catch{}
  requireField('affiliateUrl','URL de afiliação: informe uma URL completa http:// ou https://.',url&&['https:','http:'].includes(url.protocol));
  if(blockers.length){const error=new Error('Ficha bloqueada. Revise os campos indicados.');error.blockers=blockers;error.fields=[...targets];error.blocked=true;throw error}
  const {values,faqs}=parsed,t=dictionaryFor(data.htmlLanguage),content=Object.fromEntries(Object.entries(fields).map(([tag,key])=>[key,values[tag]]));
  const warnings=['Textos preservados como fornecidos. Confira preços por unidade/pacote, descontos, frete, garantia e alegações antes de publicar.'];
  if(trim(data.product)&&trim(data.product)!==content.product)warnings.push(`O produto da ficha é “${content.product}”, conforme [PRODUTO]; o produto da copy não foi alterado.`);
  const ficha={
    destination:trim(data.destination),assetFolder:trim(data.assetFolder)||'assets',
    htmlLanguage:trim(data.htmlLanguage),countryCode:trim(data.countryCode),
    pageTitle:trim(data.pageTitle)||content.offerMainTitle,affiliateUrl:trim(data.affiliateUrl),
    cookieTitle:t.cookieTitle,cookieText:t.cookieText,acceptLabel:t.accept,declineLabel:t.decline,closeAriaLabel:t.close,
    ...content,faqs,
    mustContain:[...Object.values(content).filter(value=>value!==content.product),...faqs.flatMap(faq=>[faq.question,faq.answer])],
    mustNotContain:['Unverified health or result claims','Results within a specific timeframe','Studies prove the results','Testimonials prove the results'],
    pending:[],assumptions:['Offer details and FAQs were supplied by the user without rewriting or recalculating prices.','Cookie interface labels were generated from the selected language.']
  };
  return {ficha,warnings};
}

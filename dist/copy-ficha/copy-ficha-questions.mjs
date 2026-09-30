import {parseOfferText,offerEvidenceForDiscount,offerProductPrices} from './copy-ficha-domain.mjs?v=19';

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const missing='Não identificado no Ctrl+A.';
const amountPattern='(?:(?:US\\$|AU\\$|CA\\$|R\\$|\\$|€|£|kr)\\s*\\d(?:[\\d.,]*\\d)?|\\d(?:[\\d.,]*\\d)?\\s*(?:USD|AUD|CAD|BRL|EUR|GBP|SEK))';
const numeric=value=>{
  const text=clean(value).replace(/[^\d,.-]/g,'');if(!text)return null;
  const normalized=text.lastIndexOf(',')>text.lastIndexOf('.')?text.replace(/\./g,'').replace(',','.'):text.replace(/,/g,'');
  const result=Number(normalized);return Number.isFinite(result)?result:null;
};
const unique=values=>[...new Set(values)];
const formatMoney=(amount,currency,locale,{includeCode=true}={})=>{
  if(amount===null||!currency)return missing;
  try{return new Intl.NumberFormat(locale||'en-US',{style:'currency',currency}).format(amount)+(includeCode?` (${currency})`:'')}
  catch{return `${amount.toFixed(2)} ${currency}`}
};
const displayName=(code,type)=>{
  if(!code)return missing;
  try{const name=new Intl.DisplayNames(['pt-BR'],{type}).of(code);return `${name.charAt(0).toLocaleUpperCase('pt-BR')}${name.slice(1)} (${code})`}
  catch{return code}
};

function directOfferEvidence(raw,target){
  const lines=String(raw||'').split(/\r?\n/).map(line=>clean(line.replace(/^#+\s*/,'').replace(/\*\*/g,'')));
  const percentValues=unique(lines.filter(line=>/discount|\boff\b|\bsave\b|desconto|sconto|réduction|rabatt/i.test(line)).flatMap(line=>[...line.matchAll(/\b(\d{1,2}(?:[.,]\d+)?)\s*%/g)].map(match=>numeric(match[1]))));
  const savingsAllowed=percentValues.length<=1&&(target===null||percentValues.length!==1||Math.abs(percentValues[0]-target)<=0.6);
  const priceCue='(?:for\\s+(?:just|only)|pay\\s+(?:just|only)|now(?:\\s+(?:just|only))?|only|(?:sale|offer|your|product|current)\\s+price\\s*[:=-]?|preço(?:\\s+(?:atual|promocional))?\\s*[:=-]|precio\\s*[:=-]|prezzo\\s*[:=-]|prix\\s*[:=-])';
  const priceRegex=new RegExp(`${priceCue}\\s*(${amountPattern})`,'gi');
  const safeLines=lines.filter(line=>!/^\s*(?:shipping|frete|delivery|bonus|gift|brinde|garantia|guarantee|tax)\b/i.test(line));
  const priceText=safeLines.join('\n');
  const prices=unique([...priceText.matchAll(priceRegex)].filter(match=>!/^\s*(?:in\s+)?(?:savings|de economia|di risparmio)\b/i.test(priceText.slice(match.index+match[0].length))).map(match=>numeric(match[1])).filter(value=>value!==null));
  const savingRegex=new RegExp(`(?:save|saving(?:s)?|discount|economize|economia|risparmia|ahorra|économisez|ersparnis)\\s*[:=-]?\\s*(${amountPattern})|(${amountPattern})\\s*(?:in\\s+)?(?:instant\\s+)?(?:savings|price\\s+reduction|de\\s+economia|di\\s+risparmio)`,'gi');
  const savings=unique([...safeLines.join('\n').matchAll(savingRegex)].map(match=>numeric(match[1]||match[2])).filter(value=>value!==null));
  return {prices,amount:savingsAllowed&&savings.length===1?savings[0]:null};
}

export function minimumOfferProductPrice(raw=''){
  const candidates=[...offerProductPrices(raw),...directOfferEvidence(raw,null).prices.map(value=>({value,basis:'product',quantity:null,terms:''}))];
  candidates.sort((a,b)=>a.value-b.value||Number(Boolean(b.terms))-Number(Boolean(a.terms))||Number(b.basis==='unit')-Number(a.basis==='unit'));
  return candidates.find(item=>Number.isFinite(item.value)&&item.value>=0)||null;
}

export function productPriceCondition(price){
  if(!price)return '';
  const parts=[];
  if(price.basis==='unit')parts.push('por unidade');
  else if(price.quantity>1)parts.push('pelo conjunto');
  if(price.quantity>1)parts.push(`opção de ${price.quantity} unidades`);
  if(price.terms)parts.push(price.terms);
  return parts.join(' · ');
}

function bonusAnswer(raw){
  const lines=String(raw||'').split(/\r?\n/).map(line=>clean(line.replace(/^#+\s*/,'').replace(/\*\*/g,''))).filter(Boolean);
  const bonuses=[];
  const stop=/^(?:checkout|bonus deals|receipt|payment|customer|shipping|delivery|guarantee|order|terms|privacy|contact|address|email|frete|garantia|pagamento|value|worth)\b/i;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(/^bonus\s+deals\b/i.test(line))continue;
    if(/^(?:no\s+(?:bonus|gift)|sem\s+(?:b[oô]nus|brinde|bonifica)|bonus\s*:\s*(?:none|no)|b[oô]nus\s*:\s*n[aã]o)\b/i.test(line))return {answer:'Não',pending:false};
    const match=line.match(/^(?:free\s+)?(?:bonus(?:es)?|bonifica[cç][aã]o|b[oô]nus|free\s+gift|brindes?)\s*(?::|[-–—])?\s*(.*)$/i)||line.match(/\b(?:includes?|inclui|ganhe)\s+(?:a\s+)?(?:free\s+)?(?:bonus|gift|brinde)\s*(?::|[-–—])?\s*(.+)$/i);
    if(!match)continue;
    const value=clean(match[1]||lines[i+1]);
    if(value&&!stop.test(value)&&!/^\d+$/.test(value)&&value.length<=180)bonuses.push(value);
  }
  return bonuses.length?{answer:`Sim — ${unique(bonuses).join('; ')}.`,pending:false}:{answer:'Não',pending:false};
}

export function buildOfferQuestionAnswers(data={}){
  const detected=parseOfferText(data.rawText||'',data.dtcUrl||''),locale=clean(data.htmlLanguage)||detected.htmlLanguage,country=clean(data.countryCode).toUpperCase()||detected.countryCode,currency=clean(data.currency).toUpperCase()||detected.currency;
  const product=clean(data.product)||detected.productCandidate,discount=numeric(data.confirmedDiscountPercent)??detected.highestPercent;
  const confirmedAmount=numeric(data.confirmedDiscountAmount),evidence=offerEvidenceForDiscount(data.rawText,discount,confirmedAmount),direct=directOfferEvidence(data.rawText,discount);
  const amount=confirmedAmount??evidence?.amount??(discount===detected.highestPercent?detected.highestSavingsAmount:null)??direct.amount;
  const lowest=minimumOfferProductPrice(data.rawText),confirmedPrice=numeric(data.confirmedProductPrice),price=confirmedPrice??lowest?.value??null;
  const priceAnswer=formatMoney(price,currency,locale,{includeCode:false});
  const bonus=bonusAnswer(data.rawText),days=numeric(data.guaranteeDays)??detected.guaranteeDays;
  const guaranteeAnswer=data.guaranteeStatus==='no'?'Não há garantia informada.':days>0?`${days} dias.`:missing;
  const shippingAnswer=data.freeShipping==='confirmed'||data.freeShipping!=='no'&&detected.freeShippingCandidate?'Sim.':data.freeShipping==='no'?'Não exibido na oferta.':missing;
  return [
    {id:'locale',question:'Qual idioma e país você deseja que a copy seja criada?',answer:`Idioma: ${displayName(locale,'language')} · País: ${displayName(country,'region')}`,pending:!locale||!country},
    {id:'product',question:'Qual o nome do produto?',answer:product||missing,pending:!product},
    {id:'price',question:'Qual o valor do produto? (use a moeda referente ao anúncio)',answer:priceAnswer,pending:price===null||!currency},
    {id:'discountPercent',question:'Qual o desconto em porcentagem? (EX: 50%).',answer:discount!==null?`${discount}%`:missing,pending:discount===null},
    {id:'discountAmount',question:'Qual o desconto em valor? (EX: $50.00).',answer:formatMoney(amount,currency,locale),pending:amount===null||!currency},
    {id:'freeShipping',question:'Tem Frete Grátis? (ex: sim / não)',answer:shippingAnswer,pending:shippingAnswer===missing},
    {id:'bonus',question:'Tem alguma bonificação? (Se sim, descrever qual é).',...bonus},
    {id:'guarantee',question:'Qual a duração da garantia (se houver: ex: 90 dias)?',answer:guaranteeAnswer,pending:guaranteeAnswer===missing}
  ];
}

export function formatOfferQuestionAnswers(questions=[]){
  return questions.map(({question,answer})=>`${question}\nResposta: ${answer}`).join('\n\n');
}

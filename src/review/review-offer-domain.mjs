export const OFFER_SCHEMA='hub-review-offer-v1';
export const OFFER_FIELDS=Object.freeze([['currency','Moeda (código, ex.: USD)'],['checkedAt','Data da conferência (AAAA-MM-DD)'],['discountPercent','Desconto informado (%)'],['discountBasis','A qual pacote e comparação o desconto se refere'],['discountSource','Fonte ou referência da validação manual do desconto'],['guaranteeDays','Prazo da garantia em dias'],['guaranteeTerms','Condições e procedimento de reembolso'],['guaranteeSource','Fonte da garantia'],['dosage','Modo de uso conforme rótulo / fonte oficial'],['dosageSource','Fonte do modo de uso'],['notes','Observações da oferta']]);
export const PACKAGE_FIELDS=Object.freeze([['label','Nome do pacote'],['quantity','Quantidade de frascos'],['unitPrice','Preço por frasco exibido'],['totalPrice','Total do pacote exibido (sem frete)'],['regularTotal','Total de referência anterior (opcional)'],['shippingAmount','Valor do frete'],['shippingTerms','Condições / mercado do frete'],['source','Fonte dos preços e frete (URL, trecho ou referência)']]);
export function offerBinding(draft){return JSON.stringify({id:draft.id,product:draft.product,market:draft.market,salesUrl:draft.salesUrl,salesContent:draft.salesContent})}
export function createPackage(id){return {id,enabled:true,shipping:'unknown',...Object.fromEntries(PACKAGE_FIELDS.map(([key])=>[key,'']))}}
export function createOfferState(draft){return {schema:OFFER_SCHEMA,reviewId:draft.id,binding:offerBinding(draft),...Object.fromEntries(OFFER_FIELDS.map(([key])=>[key,''])),includeDiscount:false,confirmed:false,reviewed:false,packages:[1,2,3].map(i=>createPackage('package-'+i))}}
// No thousands separators or currency symbols: accepting them silently can change prices.
export function parseAmount(value){const text=String(value??'').trim();if(!text)return null;if(!/^\d+(?:[.,]\d{1,2})?$/.test(text))return NaN;const n=Number(text.replace(',','.'));return Number.isSafeInteger(Math.round(n*100))?n:NaN}
export function parseQuantity(value){const text=String(value??'').trim();if(!text)return null;return /^\d+$/.test(text)&&Number.isSafeInteger(Number(text))&&Number(text)>0?Number(text):NaN}
export function packageSummary(row){
  const quantity=parseQuantity(row.quantity),unit=parseAmount(row.unitPrice),total=parseAmount(row.totalPrice),shipping=parseAmount(row.shippingAmount),regular=parseAmount(row.regularTotal);
  const mismatch=Number.isFinite(quantity)&&Number.isFinite(unit)&&Number.isFinite(total)&&Math.abs(Math.round(unit*100)*quantity-Math.round(total*100))>quantity;
  const delivered=Number.isFinite(total)&&(row.shipping==='free'||row.shipping==='paid'&&Number.isFinite(shipping))?Math.round((total+(row.shipping==='paid'?shipping:0))*100)/100:null;
  return {quantity,unit,total,shipping,regular,mismatch,calculatedUnit:Number.isFinite(total)&&Number.isFinite(quantity)?Math.round(total/quantity*100)/100:null,delivered,calculatedDiscount:Number.isFinite(regular)&&regular>0&&Number.isFinite(total)&&total<=regular?Math.round((1-total/regular)*10000)/100:null};
}
export function validateOffer(state){
  const errors={};
  if(state.currency.trim()&&!/^[A-Z]{3}$/.test(state.currency.trim()))errors.currency='Informe três letras maiúsculas, por exemplo USD.';
  if(state.checkedAt.trim()&&(!/^\d{4}-\d{2}-\d{2}$/.test(state.checkedAt)||!Number.isFinite(Date.parse(state.checkedAt))||new Date(state.checkedAt).toISOString().slice(0,10)!==state.checkedAt))errors.checkedAt='Informe uma data válida em AAAA-MM-DD.';
  for(const key of ['discountPercent','guaranteeDays']){const n=key==='guaranteeDays'?parseQuantity(state[key]):parseAmount(state[key]);if(Number.isNaN(n)||key==='discountPercent'&&n!==null&&n>100)errors[key]=key==='guaranteeDays'?'Informe um número inteiro positivo de dias.':'Informe percentual de 0 a 100, sem o sinal %.'}
  for(const row of state.packages){if(Number.isNaN(parseQuantity(row.quantity)))errors['packages.'+row.id+'.quantity']='Quantidade deve ser um inteiro positivo.';for(const key of ['unitPrice','totalPrice','regularTotal','shippingAmount'])if(Number.isNaN(parseAmount(row[key])))errors['packages.'+row.id+'.'+key]='Use um valor não negativo, com até duas casas decimais, sem símbolo ou separador de milhar.'}
  return errors;
}
export function offerReadiness(state,draft){
  const gaps=[],errors=validateOffer(state),active=state.packages.filter(row=>row.enabled);
  if(state.binding!==offerBinding(draft))gaps.push('Reconfirmar correspondência com o produto, mercado e página de vendas atuais.');
  for(const key of ['currency','checkedAt','guaranteeDays','guaranteeTerms','guaranteeSource','dosage','dosageSource'])if(!state[key].trim())gaps.push(OFFER_FIELDS.find(([field])=>field===key)[1]);
  if(!active.length)gaps.push('Incluir ao menos um pacote.');
  active.forEach((row,index)=>{const title=row.label.trim()||'Pacote '+(index+1),summary=packageSummary(row);for(const key of ['quantity','totalPrice','source'])if(!row[key].trim())gaps.push(title+': '+PACKAGE_FIELDS.find(([field])=>field===key)[1]);if(row.shipping==='unknown')gaps.push(title+': informar a situação do frete.');if(row.shipping==='paid'&&!row.shippingAmount.trim())gaps.push(title+': informar o valor do frete.');if(!row.shippingTerms.trim())gaps.push(title+': informar condições / mercado do frete.');if(row.shipping==='free'&&summary.shipping!==null&&summary.shipping!==0)gaps.push(title+': frete grátis diverge do valor informado.');if(summary.mismatch)gaps.push(title+': preço unitário × quantidade diverge do total exibido.');if(Number.isFinite(summary.regular)&&Number.isFinite(summary.total)&&summary.regular<summary.total)gaps.push(title+': total de referência é menor que o total atual.');});
  if(state.includeDiscount)for(const key of ['discountPercent','discountBasis','discountSource'])if(!state[key].trim())gaps.push(OFFER_FIELDS.find(([field])=>field===key)[1]);
  if(!state.confirmed)gaps.push('Confirmar preços, frete, desconto, garantia e modo de uso com as fontes.');
  gaps.push(...Object.values(errors));
  const totals=active.map(row=>parseAmount(row.totalPrice));
  const range=active.length&&totals.every(Number.isFinite)&&/^[A-Z]{3}$/.test(state.currency.trim())?{lowPrice:Math.min(...totals),highPrice:Math.max(...totals),offerCount:active.length,currency:state.currency.trim()}:null;
  const days=parseQuantity(state.guaranteeDays),badge=days===null||!Number.isFinite(days)?'Prazo pendente: não selecionar selo.':days===60?'Prazo informado de 60 dias: selo de 60 dias compatível, sujeito à conferência da fonte.':'Solicitar selo com '+days+' dias; não usar o selo fixo de 60 dias.';
  return {gaps,ready:!gaps.length,label:state.reviewed&&!gaps.length?'Revisado para a próxima etapa':gaps.length?'Rascunho com pendências':'Dados preenchidos; revisão pendente',range,badge};
}
export function exportOffer(state,draft){
  const quality=offerReadiness(state,draft);
  return ['# Preço, desconto e garantia',`Review: ${state.reviewId}\n\nProduto: ${draft.product}\n\nMercado: ${draft.market||'Não informado'}\n\nEstado: ${quality.label}`,
    ...OFFER_FIELDS.filter(([key])=>state.includeDiscount||!key.startsWith('discount')).map(([key,label])=>`## ${label}\n\n${state[key]||'Não informado.'}`),
    state.includeDiscount?'Desconto: informado pelo usuário; conferir a referência antes da copy.':'Não incluir percentual de desconto na página.',
    '## Pacotes ativos',...state.packages.filter(row=>row.enabled).map((row,i)=>{const calc=packageSummary(row);return `### ${row.label||'Pacote '+(i+1)}\n\n${PACKAGE_FIELDS.map(([key,label])=>label+': '+(row[key]||'Não informado.')).join('\n\n')}\n\nFrete: ${row.shipping}.\n\nPreço unitário calculado (auxiliar, não extraído): ${calc.calculatedUnit??'Pendente'}.\n\nTotal com frete calculado: ${calc.delivered??'Pendente'}.\n\nDesconto calculado sobre o total de referência (auxiliar): ${calc.calculatedDiscount===null?'Pendente':calc.calculatedDiscount+'%'}.`}),
    '## Faixa dos totais exibidos (sem frete)',quality.range?JSON.stringify(quality.range):'Pendente; não substituir por preços unitários ou totais calculados.',
    '## Selo de garantia',quality.badge,'## Pendências',...(quality.gaps.length?quality.gaps.map(gap=>'- '+gap):['Nenhuma pendência estrutural identificada.']),
    'Este arquivo não publica a página nem certifica as fontes. Pacotes desativados permanecem no JSON e no histórico.'].join('\n\n');
}

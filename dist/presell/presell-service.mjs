export function parseFicha(text){
  let ficha;
  try{ficha=JSON.parse(text)}catch{throw new Error('A ficha precisa estar em JSON válido.')}
  if(!ficha||typeof ficha!=='object'||Array.isArray(ficha))throw new Error('A ficha precisa ser um objeto JSON.');
  for(const field of['destination','htmlLanguage','countryCode','pageTitle','affiliateUrl'])if(!String(ficha[field]||'').trim())throw new Error(`Campo obrigatório ausente: ${field}.`);
  if(!Array.isArray(ficha.faqs)||![3,4].includes(ficha.faqs.length))throw new Error('A ficha deve conter três ou quatro FAQs.');
  if(ficha.faqs.some(faq=>!String(faq?.question||'').trim()||!String(faq?.answer||'').trim()))throw new Error('Cada FAQ deve conter pergunta e resposta preenchidas.');
  ficha.assetFolder=String(ficha.assetFolder||'assets');
  return ficha;
}

export async function callApi(path,ficha){
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({destination:ficha.destination,ficha})});
  const result=await response.json().catch(()=>({error:'Resposta inválida do serviço local.'}));
  if(!response.ok)throw new Error(result.error||'O serviço local recusou a operação.');
  return result;
}

export async function createPresellFromFicha(ficha,{confirmCreate=message=>window.confirm(message)}={}){
  const normalized=parseFicha(JSON.stringify(ficha));
  if(!confirmCreate('O conteúdo obrigatório da ficha está válido. Criar a Presell no destino informado? A criação será interrompida se algum arquivo de saída já existir ou se os assets/template não passarem na validação.'))return {cancelled:true};
  const production=await callApi('/api/presell/produce',normalized);
  return {production};
}

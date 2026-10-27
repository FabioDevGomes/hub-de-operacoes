import {offerBinding} from './review-offer-domain.mjs?v=1';
export {offerBinding};
export const IMAGE_SCHEMA='hub-review-images-v1';
export const IMAGE_PREFIX='hub:review:images:v1:';
export const FIXED_IMAGES=Object.freeze({
  howItWorksDesktop:'https://media.atomicatmedia.net/u/tjhvVxg96ISFVbgKHTcXZMebdTj1/Pictures/gbeJEI0988662.png',
  howItWorksMobile:'https://media.atomicatmedia.net/u/tjhvVxg96ISFVbgKHTcXZMebdTj1/Pictures/BmQaju0988662.webp',
  guarantee60:'https://media.atomicatmedia.net/u/tjhvVxg96ISFVbgKHTcXZMebdTj1/Pictures/bblYCk0988662.webp',
});
export const IMAGE_ITEMS=Object.freeze([
  {number:1,key:'scamAlert',label:'Scam Alert',shape:'Horizontal 3:2 (referência: 1920 × 1280).'},
  {number:2,key:'whatIsIt',label:'What Is It',shape:'Horizontal 3:2.'},
  {number:3,key:'ingredients',label:'Ingredients',shape:'Foto legível do rótulo real; ou transcrição da lista do rótulo se não houver imagem.'},
  {number:4,key:'sixPack',label:'Pack de 6 potes',shape:'Confirme que a arte contém seis frascos. Será reutilizada em preços, Claim Your Discount e rodapé dos depoimentos.'},
  {number:5,key:'femaleAvatar',label:'Avatar do depoimento feminino',shape:'Quadrada; só use com autorização para essa identificação/imagem.'},
  {number:6,key:'maleAvatar',label:'Avatar do depoimento masculino',shape:'Quadrada; só use com autorização para essa identificação/imagem.'},
]);
export const IMAGE_FIELDS=Object.freeze(['url','source','fileName','fileType','fileBytes','text','confirmed','sixBottlesConfirmed']);
export function isPublicImageUrl(value){
  try{const url=new URL(String(value||'').trim());return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname.includes('.')&&!url.hostname.endsWith('.local')&&!url.hostname.endsWith('.internal')&&!/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)}
  catch{return false}
}
export function extractImageCandidates(html){
  const result=[],seen=new Set();
  for(const tag of String(html||'').matchAll(/<img\b[^>]*>/gi)){
    const src=tag[0].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i),alt=tag[0].match(/\balt\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value=(src?.[1]||src?.[2]||src?.[3]||'').replace(/&amp;/gi,'&').trim();if(!isPublicImageUrl(value)||seen.has(value))continue;seen.add(value);
    result.push({url:value,alt:(alt?.[1]||alt?.[2]||alt?.[3]||'').replace(/&amp;/gi,'&').slice(0,180)});
    if(result.length>=100)break;
  }
  return result;
}
const blankAsset=()=>({url:'',source:'',fileName:'',fileType:'',fileBytes:'',text:'',confirmed:false,sixBottlesConfirmed:false});
export function createImagesState(draft){return {schema:IMAGE_SCHEMA,reviewId:draft.id,binding:offerBinding(draft),offerRevision:0,fixedConfirmed:false,hero:{choice:'pending',candidate:'',...blankAsset()},items:Object.fromEntries(IMAGE_ITEMS.map(item=>[item.key,{...blankAsset(),kind:'image'}])),customBadge:blankAsset(),reviewed:false}}
export function validateImages(state){
  const errors={};
  const check=(path,item)=>{if(item.url&&!isPublicImageUrl(item.url))errors[path+'.url']='Informe uma URL pública HTTPS válida, sem credenciais.';if(item.fileType&&!item.fileType.startsWith('image/'))errors[path+'.fileType']='Selecione um arquivo de imagem.';if(item.fileBytes&&!/^[1-9]\d*$/.test(item.fileBytes))errors[path+'.fileBytes']='Tamanho de arquivo inválido.'};
  check('hero',state.hero);for(const item of IMAGE_ITEMS)check('items.'+item.key,state.items[item.key]);check('customBadge',state.customBadge);
  const asset=state.items.sixPack;if(asset.sixBottlesConfirmed&&asset.kind!=='image')errors['items.sixPack.sixBottlesConfirmed']='A confirmação de seis frascos só se aplica à imagem.';
  return errors;
}
export function imagesReadiness(state,draft,{offerEntry=null,offerDraft=null}={}){
  const gaps=[],errors=validateImages(state);
  if(state.binding!==offerBinding(draft))gaps.push('Confirmar que estes assets pertencem à oferta e à página de vendas atuais.');
  if(!offerEntry?.revision||!offerDraft||offerEntry.state.binding!==offerBinding(offerDraft))gaps.push('Salve e reconfirme a oferta no passo 4 antes de concluir os assets.');
  if(offerEntry?.revision&&state.offerRevision!==offerEntry.revision)gaps.push('A oferta foi salva ou atualizada no passo 4. Reconferir assets e o selo contra esta versão.');
  const offerCurrent=Boolean(offerEntry?.state?.confirmed&&offerEntry.revision===state.offerRevision&&offerEntry.state.binding===offerBinding(draft));
  const rawWarranty=offerCurrent?Number(offerEntry.state.guaranteeDays):NaN,warranty=Number.isSafeInteger(rawWarranty)&&rawWarranty>0?String(rawWarranty):'';
  if(!state.fixedConfirmed)gaps.push('Conferir adequação das duas imagens How It Works fixas ao produto.');
  const candidates=extractImageCandidates(draft.salesContent);
  if(state.hero.choice==='pending')gaps.push('Escolher o Hero extraído da página ou informar outro.');
  else if(state.hero.choice==='source'){if(!candidates.some(item=>item.url===state.hero.candidate))gaps.push('Escolher um Hero entre as imagens encontradas na página atual.');if(state.hero.candidate&&!isPublicImageUrl(state.hero.candidate))gaps.push('O Hero da página precisa de URL pública HTTPS.');if(!state.hero.confirmed)gaps.push('Confirmar que a imagem Hero selecionada corresponde ao produto.')}
  else if(state.hero.choice==='manual'){if(!isPublicImageUrl(state.hero.url))gaps.push('Informar URL pública HTTPS para o Hero.');if(!state.hero.source.trim())gaps.push('Informar de onde veio a imagem Hero alternativa.');if(!state.hero.confirmed)gaps.push('Confirmar identidade do produto e escolha do Hero alternativo.')}
  else gaps.push('Escolher se manterá a imagem Hero da página ou usará outra.');
  for(const def of IMAGE_ITEMS){const item=state.items[def.key],prefix=String(def.number)+'. '+def.label;
    if(def.key==='ingredients'&&item.kind==='text'){if(!item.text.trim())gaps.push(prefix+': transcrever a lista que aparece no rótulo.');if(!item.source.trim())gaps.push(prefix+': indicar a fonte do rótulo/lista.');if(!item.confirmed)gaps.push(prefix+': confirmar que a transcrição corresponde ao rótulo.');continue}
    if(!isPublicImageUrl(item.url))gaps.push(prefix+': URL pública HTTPS obrigatória, inclusive quando selecionar arquivo local.');
    if(item.fileName&&!item.fileType.startsWith('image/'))gaps.push(prefix+': o arquivo selecionado não parece ser imagem.');
    if(!item.source.trim())gaps.push(prefix+': indicar a origem do asset.');
    if(def.key==='sixPack'&&!item.sixBottlesConfirmed)gaps.push(prefix+': confirmar que a imagem mostra seis frascos.');
    if(['femaleAvatar','maleAvatar'].includes(def.key)&&!item.confirmed)gaps.push(prefix+': confirmar imagem correta e autorizada para o depoimento.');
    else if(!['femaleAvatar','maleAvatar'].includes(def.key)&&!item.confirmed)gaps.push(prefix+': confirmar que produto, conteúdo e número do asset correspondem.');
  }
  if(warranty==='60'){if(!state.fixedConfirmed)gaps.push('Conferir adequação das imagens fixas à oferta.')}
  else if(!/^\d+$/.test(warranty)||Number(warranty)<1){gaps.push('Garantia ainda não confirmada no passo 4; não selecionar selo de 60 dias.')}
  else {if(!isPublicImageUrl(state.customBadge.url))gaps.push('Garantia de '+warranty+' dias: fornecer URL pública para o selo correspondente.');if(!state.customBadge.source.trim())gaps.push('Garantia de '+warranty+' dias: indicar fonte do selo.');if(!state.customBadge.confirmed)gaps.push('Confirmar que o selo exibe exatamente '+warranty+' dias.')}
  gaps.push(...Object.values(errors));
  return {gaps,ready:!gaps.length,label:state.reviewed&&!gaps.length?'Revisado para a próxima etapa':gaps.length?'Rascunho com pendências':'Assets conferidos; revisão pendente',candidates,warranty,fixedBadgeIncluded:warranty==='60'&&offerCurrent,fixedImages:FIXED_IMAGES};
}
export function exportImages(state,draft,options={}){
  const quality=imagesReadiness(state,draft,options),out=['# Inventário de imagens',`Review: ${state.reviewId}\n\nProduto: ${draft.product}\n\nEstado: ${quality.label}`,'## How It Works (imagens fixas da skill)',`PC: ${FIXED_IMAGES.howItWorksDesktop}\n\nCelular/tablet: ${FIXED_IMAGES.howItWorksMobile}\n\nAdequação conferida: ${state.fixedConfirmed?'Sim':'Pendente'}`];
  out.push('## Hero',state.hero.choice==='source'?`Usar imagem extraída da página: ${state.hero.candidate}.\n\nIdentidade conferida: ${state.hero.confirmed?'Sim':'Pendente'}`:state.hero.choice==='manual'?`Usar imagem alternativa: ${state.hero.url}.\n\nFonte: ${state.hero.source||'Pendente'}.\n\nIdentidade conferida: ${state.hero.confirmed?'Sim':'Pendente'}`:'Escolha pendente.');
  for(const def of IMAGE_ITEMS){const item=state.items[def.key];out.push(`## ${def.number}. ${def.label}`,item.kind==='text'?`Alternativa: lista transcrita do rótulo.\n\nConteúdo: ${item.text||'Pendente'}.\n\nFonte: ${item.source||'Pendente'}.`:`URL pública: ${item.url||'Pendente'}.\n\nOrigem: ${item.source||'Pendente'}.\n\nArquivo local informado: ${item.fileName||'Nenhum'}.\n\nAutorização/conferência: ${item.confirmed?'Confirmada pelo usuário':'Pendente'}.${def.key==='sixPack'?'\n\nSeis frascos: '+(item.sixBottlesConfirmed?'confirmados':'pendente')+'.':''}`)}
  out.push('## Selo da garantia',quality.warranty==='60'?`60 dias (fixo): ${FIXED_IMAGES.guarantee60}. Prazo vem da oferta salva e confirmada.`:quality.warranty&&/^\d+$/.test(quality.warranty)?`${quality.warranty} dias (asset solicitado): ${state.customBadge.url||'Pendente'}.`:'Pendente; nenhum selo fixo selecionado.','## Pendências',...(quality.gaps.length?quality.gaps.map(item=>'- '+item):['Nenhuma pendência identificada.']),'A validação confere formato, associação e confirmações; não faz requisição de rede para provar que cada URL carrega. Arquivo local é apenas metadado e precisa ser hospedado para a página pública. Sem upload ou publicação automática.');
  return out.join('\n\n');
}

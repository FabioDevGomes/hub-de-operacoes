export const VSL_MODES=Object.freeze({have:'Tenho a transcrição',none:'Não tenho VSL',later:'Vou adicionar depois'});
export const MATERIAL_FIELDS=Object.freeze(['product','market','language','vslMode','transcript','salesUrl','salesContent','referenceLinks','notes','affiliateUrl','publicationUrl','portal']);
export function normalizeDraft(value={}){
  const source=value&&typeof value==='object'?value:{};
  const draft={schema:'hub-review-materials-v1',id:typeof source.id==='string'?source.id:''};
  for(const key of MATERIAL_FIELDS)draft[key]=typeof source[key]==='string'?source[key]:'';
  if(!Object.hasOwn(VSL_MODES,draft.vslMode))draft.vslMode='';
  return draft;
}
export function isPublicUrl(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&Boolean(url.hostname)&&!url.username&&!url.password}catch{return false}
}
export function validateDraft(value){
  const draft=normalizeDraft(value),errors={};
  if(!draft.product.trim())errors.product='Informe o nome do produto para salvar o rascunho.';
  for(const key of ['salesUrl','affiliateUrl','publicationUrl'])if(draft[key].trim()&&!isPublicUrl(draft[key].trim()))errors[key]='Use uma URL completa http:// ou https://, sem usuário e senha.';
  if(draft.referenceLinks.split(/\r?\n/).filter(line=>line.trim()).some(line=>!isPublicUrl(line.trim())))errors.referenceLinks='Informe uma URL http:// ou https:// por linha, sem usuário e senha.';
  return errors;
}
export function materialSummary(value){
  const draft=normalizeDraft(value),present=key=>Boolean(draft[key].trim());
  const vsl=draft.vslMode==='none'?{state:'optional',text:'Fluxo sem VSL escolhido'}:draft.vslMode==='later'?{state:'pending',text:present('transcript')?'Adicionar depois; texto anterior preservado':'Transcrição será adicionada depois'}:draft.vslMode==='have'?{state:present('transcript')?'ready':'pending',text:present('transcript')?'Transcrição informada':'Cole a transcrição que você tem'}:{state:'pending',text:'Escolha como deseja trabalhar com a VSL'};
  return [
    {label:'Produto',state:present('product')?'ready':'pending',text:present('product')?'Informado':'Obrigatório para salvar'},
    {label:'Mercado e idioma',state:present('market')&&present('language')?'ready':'pending',text:present('market')&&present('language')?'Informados':'Pode completar depois'},
    {label:'VSL',...vsl},
    {label:'Página de vendas',state:present('salesUrl')||present('salesContent')?'ready':'pending',text:present('salesContent')?'Conteúdo informado':present('salesUrl')?'URL registrada; conteúdo ainda não coletado':'URL ou conteúdo não informado'},
    {label:'Materiais complementares',state:present('referenceLinks')||present('notes')?'ready':'optional',text:present('referenceLinks')||present('notes')?'Informados':'Opcional nesta etapa'},
    ...[['affiliateUrl','Link afiliado'],['publicationUrl','URL de publicação'],['portal','Nome do portal']].map(([key,label])=>({label,state:present(key)?'ready':'pending',text:present(key)?'Informado':'Pode completar depois'}))
  ];
}
export function exportDraft(value){
  const draft=normalizeDraft(value);
  return ['# Materiais da Review',`Identificador: ${draft.id}`,`Produto: ${draft.product||'Não informado'}`,`Mercado: ${draft.market||'Não informado'}`,`Idioma: ${draft.language||'Não informado'}`,`VSL: ${VSL_MODES[draft.vslMode]||'A definir'}`,'## Transcrição da VSL',draft.transcript||'Não informada.','## Página de vendas',draft.salesUrl||'URL não informada.',draft.salesContent||'Conteúdo não informado.','## Materiais complementares',draft.referenceLinks||'Links não informados.',draft.notes||'Sem anotações.','## Destino',`Link afiliado: ${draft.affiliateUrl||'Não informado'}`,`URL de publicação: ${draft.publicationUrl||'Não informada'}`,`Portal: ${draft.portal||'Não informado'}`,'## Resumo dos materiais',...materialSummary(draft).map(item=>`- ${item.label}: ${item.text}`),'Este é um rascunho de entrada. URLs foram apenas registradas; não houve coleta automática, validação do conteúdo das fontes ou geração da página.'].join('\n\n');
}

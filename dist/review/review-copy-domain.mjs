export const COPY_SCHEMA='hub-review-copy-v1';
export const COPY_SECTIONS=Object.freeze([
  {number:1,key:'header',title:'Header fixo',guidance:'Identifique o site editorial e mantenha a navegação coerente com as páginas que existirão.'},
  {number:2,key:'hero',title:'Hero',guidance:'Apresente produto e ângulo editorial; registre a base de cada afirmação e evite promessas sem fonte.'},
  {number:3,key:'quickVerdict',title:'Quick verdict',guidance:'Resuma pontos fortes, limitações e para quem pode fazer sentido, usando a experiência e os dados da oferta.'},
  {number:4,key:'story',title:'Story',guidance:'Use somente a experiência real registrada; mantenha descoberta, dúvidas e ponto de virada fiéis ao relato.'},
  {number:5,key:'scorecard',title:'Scorecard, prós e contras',guidance:'Não transforme uma avaliação individual em prova de eficácia ou em média de clientes.'},
  {number:6,key:'howToUse',title:'How to use',guidance:'Transcreva o modo de uso da fonte oficial; não prescreva nem ajuste dose.'},
  {number:7,key:'scamAlert',title:'Scam Alert',guidance:'Não acuse concorrentes, marketplaces ou vendedores sem prova específica. Os exemplos MemoHoney não comprovam esta oferta.'},
  {number:8,key:'complaints',title:'Complaints',guidance:'Use reclamações identificáveis e fontes. A ausência de reclamações coletadas não prova que não existam.'},
  {number:9,key:'whatIsIt',title:'What Is It',guidance:'Descreva produto, formato e finalidade distinguindo dados de rótulo das alegações do vendedor.'},
  {number:10,key:'howItWorks',title:'How It Works',guidance:'Atribua mecanismos à VSL ou ao vendedor quando não houver comprovação independente.'},
  {number:11,key:'ingredients',title:'Ingredients',guidance:'Use somente ingredientes transcritos de rótulo ou fonte autorizada; não complete lacunas por inferência.'},
  {number:12,key:'safety',title:'Safety',guidance:'Use alertas de fontes oficiais. Não ofereça diagnóstico, conselho médico nem garantia de segurança.'},
  {number:13,key:'benefits',title:'Benefits',guidance:'Separe benefício alegado pelo vendedor do resultado que o reviewer realmente percebeu.'},
  {number:14,key:'testimonials',title:'Testimonials',guidance:'Reproduza apenas relatos reais, com origem e autorização registradas; não edite o sentido.'},
  {number:15,key:'refundPolicy',title:'Refund policy',guidance:'Siga prazo, condições e procedimento salvos na oferta; não amplie a garantia.'},
  {number:16,key:'pricing',title:'Pricing',guidance:'Use preços e frete atuais por pacote e mercado; mantenha cálculos auxiliares separados dos valores exibidos.'},
  {number:17,key:'claimDiscount',title:'Claim Your Discount',guidance:'Use somente o desconto informado e validado para esta oferta. Não presuma 73% nem outro percentual.'},
  {number:18,key:'faq',title:'FAQ',guidance:'Responda com fonte; quando a informação não existir, registre a lacuna ou omita a resposta.'},
  {number:19,key:'conclusion',title:'Conclusion',guidance:'Feche com critérios editoriais e ressalvas reais, sem criar urgência ou prometer resultado.'},
  {number:20,key:'footer',title:'Footer',guidance:'Use identidade, políticas e disclosures existentes; não invente certificações, afiliações ou páginas legais.'},
]);

export const COPY_STATUSES=Object.freeze({draft:'Rascunho',reviewed:'Revisada',omitted:'Omitida'});
export const COPY_BASES=Object.freeze([
  ['pending','Classificação pendente'],['offer','Dado da oferta (passo 4)'],['reviewer','Experiência real do reviewer (passo 3)'],
  ['label','Rótulo ou fonte oficial'],['salesPage','Alegação da página de vendas'],['vsl','Alegação da VSL'],
  ['external','Fonte externa identificada'],['userVerified','Conferido manualmente pelo usuário'],
  ['editorial','Opinião editorial sem afirmação factual'],['unsupported','Sem fonte suficiente'],
]);
export const CLAIM_CHECKS=Object.freeze([['pending','Ainda não conferido'],['checked','Conferido pelo usuário'],['flagged','Risco pendente'],['notApplicable','Sem alegação factual']]);
export const COPY_ASSETS=Object.freeze([
  ['none','Sem imagem'],['hero','Hero'],['howItWorksDesktop','How It Works — PC'],['howItWorksMobile','How It Works — celular/tablet'],
  ['scamAlert','1 · Scam Alert'],['whatIsIt','2 · What Is It'],['ingredients','3 · Rótulo / ingredientes'],['sixPack','4 · Pack de seis frascos'],
  ['femaleAvatar','5 · Avatar feminino'],['maleAvatar','6 · Avatar masculino'],['guaranteeBadge','7 · Selo da garantia (se aplicável)'],
]);
const SOURCE_BASES=new Set(['offer','reviewer','label','salesPage','vsl','external','userVerified']);
const newSection=()=>({status:'draft',copy:'',basis:'pending',sourceReference:'',evidence:'',claimCheck:'pending',claimNote:'',ctaLabel:'',ctaUrl:'',ctaConfirmed:false,assetKey:'none',decisionNote:''});

export function isPublicCtaUrl(value){
  try{
    const url=new URL(String(value||'').trim()),host=url.hostname.toLowerCase();
    if(!['http:','https:'].includes(url.protocol)||!host||url.username||url.password||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal'))return false;
    if(host==='[::1]'||host.startsWith('[fc')||host.startsWith('[fd')||host.startsWith('[fe80:'))return false;
    const octets=host.split('.').map(Number);
    if(octets.length===4&&octets.every(Number.isInteger)){
      const [a,b]=octets;
      if(a===0||a===10||a===127||a===169&&b===254||a===192&&b===168||a===172&&b>=16&&b<=31||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a>=224)return false;
    }
    return true;
  }catch{return false}
}

export function copyBinding(draft){return JSON.stringify({id:draft.id,product:draft.product,market:draft.market,language:draft.language,salesUrl:draft.salesUrl,publicationUrl:draft.publicationUrl,portal:draft.portal})}
export function createCopySnapshot(source={}){
  const material=source.materials||{},analysis=source.analysis||{},reviewer=source.reviewer||{},offer=source.offer||{},images=source.images||{};
  return {
    materials:{revision:Number(material.revision)||0,product:String(material.product||''),market:String(material.market||''),salesUrl:String(material.salesUrl||''),publicationUrl:String(material.publicationUrl||''),portal:String(material.portal||'')},
    analysis:{revision:Number(analysis.revision)||0,reviewed:Boolean(analysis.reviewed)},
    reviewer:{revision:Number(reviewer.revision)||0,reviewed:Boolean(reviewer.reviewed)},
    offer:{revision:Number(offer.revision)||0,reviewed:Boolean(offer.reviewed),confirmed:Boolean(offer.confirmed)},
    images:{revision:Number(images.revision)||0,reviewed:Boolean(images.reviewed),offerRevision:Number(images.offerRevision)||0},
  };
}
export function createCopyState(draft){return {schema:COPY_SCHEMA,reviewId:draft.id,binding:copyBinding(draft),sourceSnapshot:null,sections:Object.fromEntries(COPY_SECTIONS.map(section=>[section.key,newSection()])),reviewed:false}}

export function validateCopySection(section,{assets={}}={}){
  const errors={};
  if(!section||!Object.hasOwn(COPY_STATUSES,section.status)){errors.status='Escolha rascunho, revisada ou omitida.';return errors}
  if(section.status==='draft')return errors;
  if(section.status==='omitted'){if(!section.decisionNote.trim())errors.decisionNote='Explique por que esta seção foi omitida.';return errors}
  if(!section.copy.trim())errors.copy='Inclua a copy revisada desta seção.';
  if(!COPY_BASES.some(([key])=>key===section.basis)||section.basis==='pending')errors.basis='Classifique a base da copy.';
  if(section.basis==='unsupported')errors.basis='Copy sem fonte suficiente não pode ser marcada como revisada; revise ou omita a seção.';
  if(SOURCE_BASES.has(section.basis)){
    if(!section.sourceReference.trim())errors.sourceReference='Identifique a fonte ou o campo de origem.';
    if(!section.evidence.trim())errors.evidence='Registre o trecho ou resumo verificável que sustenta a copy.';
  }
  if(section.basis==='editorial'&&section.claimCheck!=='notApplicable')errors.claimCheck='Para opinião sem afirmação factual, marque “Sem alegação factual”; se houver alegação, indique a fonte.';
  else if(section.claimCheck==='pending')errors.claimCheck='Registre a conferência de alegações desta seção.';
  else if(section.claimCheck==='flagged')errors.claimNote='Resolva ou omita o risco pendente; o sistema não classifica a copy como compatível.';
  const hasCta=Boolean(section.ctaLabel.trim()||section.ctaUrl.trim()||section.ctaConfirmed);
  if(hasCta){
    if(!section.ctaLabel.trim())errors.ctaLabel='Informe o texto do CTA.';
    if(!section.ctaUrl.trim()||!isPublicCtaUrl(section.ctaUrl.trim()))errors.ctaUrl='Informe o destino público completo HTTP(S), sem usuário ou senha.';
    if(!section.ctaConfirmed)errors.ctaConfirmed='Confirme manualmente que o destino corresponde ao texto do CTA.';
  }
  if(section.assetKey!=='none'&&(!COPY_ASSETS.some(([key])=>key===section.assetKey)||!assets[section.assetKey]))errors.assetKey='O asset escolhido não tem URL disponível na versão atual do passo 5.';
  return errors;
}

export function copyReadiness(state,draft,source={}){
  const gaps=[],snapshot=createCopySnapshot(source),snapshotMatches=state.sourceSnapshot&&JSON.stringify(state.sourceSnapshot)===JSON.stringify(snapshot);
  if(state.binding!==copyBinding(draft))gaps.push('A copy pertence a outra identidade de produto/mercado/página; reconcilie as fontes.');
  if(!snapshotMatches)gaps.push(state.sourceSnapshot?'As fontes mudaram desde a conferência da copy; reconcilie e revise novamente.':'Conecte a copy às versões atuais dos passos anteriores.');
  const material=source.materials||{},requirements=[
    ['analysis','Análise dos materiais do passo 2'],['reviewer','Experiência real e depoimentos do passo 3'],
    ['offer','Oferta confirmada do passo 4'],['images','Inventário conferido do passo 5'],
  ];
  if(!material.revision||material.dirty)gaps.push('Salve os materiais atuais no passo 1 antes de revisar a copy.');
  for(const [key,label] of requirements){const item=source[key]||{};if(!item.revision||item.dirty||item.error)gaps.push(`${label}: salve a versão atual antes de continuar.`);else if(!item.reviewed)gaps.push(`${label}: conclua a revisão antes de aprovar a copy.`);if(key==='offer'&&item.revision&&!item.confirmed)gaps.push('Passo 4: confirme os dados da oferta atual antes de aprovar a copy.')}
  for(const def of COPY_SECTIONS){const section=state.sections[def.key],prefix=`${def.number}. ${def.title}`;if(section.status==='draft')gaps.push(`${prefix}: ainda está em rascunho.`);else if(section.status==='omitted'){if(!section.decisionNote.trim())gaps.push(`${prefix}: justifique a omissão.`)}else for(const [field,message] of Object.entries(validateCopySection(section,{assets:source.assets||{}})))gaps.push(`${prefix}: ${message}`)}
  return {gaps,ready:gaps.length===0,label:state.reviewed&&!gaps.length?'Copy revisada para a próxima etapa':gaps.length?'Rascunho de copy com pendências':'Seções conferidas; revisão final pendente',snapshot,snapshotMatches};
}

export function exportCopy(state,draft,source={}){
  const quality=copyReadiness(state,draft,source),out=['# Copy e revisão final',`Review: ${state.reviewId}`,`Produto: ${draft.product||'Não informado'}`,`Estado: ${quality.label}`,'A copy permanece editável. O registro de uma fonte ou uma conferência manual não representa verificação independente nem garantia de conformidade.'];
  for(const def of COPY_SECTIONS){const item=state.sections[def.key],title=`## ${def.number}. ${def.title}`;if(item.status==='omitted'){out.push(title,`Seção omitida. Motivo: ${item.decisionNote||'Pendente'}.`);continue}out.push(title,`Estado: ${COPY_STATUSES[item.status]||'Rascunho'}`,`Copy: ${item.copy||'Pendente'}`,`Base: ${COPY_BASES.find(([key])=>key===item.basis)?.[1]||'Pendente'}`,`Fonte: ${item.sourceReference||'Pendente'}`,`Trecho/resumo de apoio: ${item.evidence||'Pendente'}`,`Conferência de alegações: ${CLAIM_CHECKS.find(([key])=>key===item.claimCheck)?.[1]||'Pendente'}`,`Nota de risco: ${item.claimNote||'Nenhuma informada'}`,`CTA: ${item.ctaLabel||'Nenhum'}`,`Destino do CTA: ${item.ctaUrl||'Nenhum'}`,`CTA conferido pelo usuário: ${item.ctaConfirmed?'Sim':'Não'}`,`Asset: ${COPY_ASSETS.find(([key])=>key===item.assetKey)?.[1]||'Sem imagem'}`,`URL do asset: ${source.assets?.[item.assetKey]||'Pendente'}`,`Observação/decisão: ${item.decisionNote||'Nenhuma'}`)}
  out.push('## Pendências',...(quality.gaps.length?quality.gaps.map(gap=>`- ${gap}`):['Nenhuma pendência estrutural.']),'A saída é um pacote editorial para revisão e para a etapa de página; não gera HTML, não publica e não promete indexação.');return out.join('\n\n');
}

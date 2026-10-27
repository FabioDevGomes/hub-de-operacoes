import {isPublicUrl} from './review-materials-domain.mjs?v=1';
export const REVIEWER_SCHEMA='hub-review-reviewer-v1';
export const REVIEWER_FIELDS=Object.freeze([
  ['displayName','Nome público do reviewer'],['age','Idade (opcional)'],['location','Cidade / estado (opcional)'],['occupation','Ocupação / contexto (opcional)'],['source','Origem do relato / referência da entrevista'],['duration','Por quanto tempo usou'],['discovery','Como conheceu o mecanismo e o produto'],['skepticism','Dúvidas ou ceticismo que realmente teve'],['decision','O que levou à decisão de experimentar'],['routine','Como foi a rotina de uso'],['results','O que percebeu e após quanto tempo'],['unchanged','O que não mudou / limites da experiência'],['negatives','Dificuldades e pontos negativos'],['notes','Observações adicionais'],
]);
export const RATING_CRITERIA=Object.freeze([['experience','Experiência com o produto'],['ease','Facilidade de uso'],['value','Custo-benefício'],['purchase','Compra e entrega']]);
export const TESTIMONIAL_SLOTS=Object.freeze([['female','Depoimento feminino'],['male','Depoimento masculino']]);
export const TESTIMONIAL_FIELDS=Object.freeze([['displayName','Identificação pública'],['context','Contexto / tempo de uso'],['quote','Relato real'],['source','Origem do relato'],['avatarUrl','URL da imagem autorizada (opcional nesta etapa)']]);
export function reviewerBinding(draft){return JSON.stringify({id:draft.id,product:draft.product,market:draft.market})}
export function createReviewerState(draft){return {schema:REVIEWER_SCHEMA,reviewId:draft.id,binding:reviewerBinding(draft),reviewer:Object.fromEntries([...REVIEWER_FIELDS.map(([key])=>[key,'']),['realUseConfirmed',false],['publishConsent',false]]),rating:{include:false,method:'equal-mean-v1',confirmed:false,criteria:Object.fromEntries(RATING_CRITERIA.map(([key])=>[key,{score:'',reason:''}]))},includeTestimonials:true,testimonials:Object.fromEntries(TESTIMONIAL_SLOTS.map(([key])=>[key,Object.fromEntries([...TESTIMONIAL_FIELDS.map(([field])=>[field,'']),['realConfirmed',false],['publishConsent',false]])])),reviewed:false}}
export function parseScore(value){const text=String(value??'').trim();if(!text)return null;if(!/^\d+(?:[.,]\d+)?$/.test(text))return NaN;const number=Number(text.replace(',','.'));return number>=0&&number<=10?number:NaN}
export function calculateRating(state){
  const included=[],excluded=[],invalid=[];
  for(const [key,label] of RATING_CRITERIA){const value=parseScore(state.rating.criteria[key].score);if(value===null)excluded.push(label);else if(!Number.isFinite(value))invalid.push(label);else included.push({key,label,value})}
  return {included,excluded,invalid,value:invalid.length||!included.length?null:Math.round((included.reduce((sum,item)=>sum+item.value,0)/included.length+Number.EPSILON)*10)/10,partial:included.length<RATING_CRITERIA.length};
}
export function validateReviewer(state,{draft=false}={}){
  const errors={};
  for(const [slot] of TESTIMONIAL_SLOTS){const url=state.testimonials[slot].avatarUrl.trim();if(url&&!isPublicUrl(url))errors[`testimonials.${slot}.avatarUrl`]='Use uma URL de imagem HTTP(S) completa, sem usuário e senha.'}
  for(const [key,label] of RATING_CRITERIA){const row=state.rating.criteria[key],value=parseScore(row.score);if(Number.isNaN(value))errors[`rating.${key}.score`]=`${label}: informe uma nota entre 0 e 10, ou deixe sem avaliação.`;else if(!draft&&state.rating.include&&value!==null&&!row.reason.trim())errors[`rating.${key}.reason`]=`${label}: descreva o motivo da nota.`}
  return errors;
}
export function reviewerReadiness(state,draft){
  const gaps=[],rating=calculateRating(state),errors=validateReviewer(state);
  if(state.binding!==reviewerBinding(draft))gaps.push('Confirmar que o relato corresponde ao produto e mercado atuais.');
  for(const key of ['displayName','source','duration','discovery','skepticism','decision','routine','results','unchanged','negatives'])if(!state.reviewer[key].trim())gaps.push(REVIEWER_FIELDS.find(([field])=>field===key)[1]);
  if(!state.reviewer.realUseConfirmed)gaps.push('Confirmar que o reviewer realmente usou o produto.');
  if(!state.reviewer.publishConsent)gaps.push('Confirmar autorização para usar a identificação pública e o relato.');
  if(state.rating.include){if(rating.value===null)gaps.push('Informar ao menos um critério válido para a nota.');if(!state.rating.confirmed)gaps.push('Validar o método e a nota calculada.');}
  if(state.includeTestimonials)for(const [slot,label] of TESTIMONIAL_SLOTS){const item=state.testimonials[slot];if(!item.displayName.trim()||!item.quote.trim()||!item.source.trim())gaps.push(`${label}: identificação pública, relato e origem.`);if(!item.realConfirmed||!item.publishConsent)gaps.push(`${label}: confirmar autenticidade e autorização.`)}
  gaps.push(...Object.values(errors));
  return {gaps,ready:gaps.length===0,label:state.reviewed&&gaps.length===0?'Revisado para a próxima etapa':gaps.length?'Rascunho com pendências':'Dados preenchidos; revisão pendente',rating};
}
export function exportReviewer(state,draft){
  const readiness=reviewerReadiness(state,draft),rating=readiness.rating;
  return ['# Reviewer, nota e depoimentos',`Review: ${state.reviewId}`,`Produto: ${draft.product}`,`Estado: ${readiness.label}`,'## Experiência real',...REVIEWER_FIELDS.map(([key,label])=>`### ${label}\n\n${state.reviewer[key]||'Não informado.'}`),`Uso real confirmado pelo usuário: ${state.reviewer.realUseConfirmed?'Sim':'Pendente'}`,`Autorização de publicação declarada pelo usuário: ${state.reviewer.publishConsent?'Sim':'Pendente'}`,'## Nota editorial',
    state.rating.include?`Método inicial: média simples dos critérios avaliados (pesos iguais), escala 0 a 10.\n\nNota: ${rating.value===null?'Pendente':rating.value.toFixed(1)}. ${rating.included.length} de 4 critérios avaliados${rating.partial?' — avaliação parcial':''}.\n\nMétodo/nota validados pelo usuário: ${state.rating.confirmed?'Sim':'Pendente'}`:'Não incluir nota na saída da página. Valores de rascunho permanecem preservados no JSON.',
    ...(state.rating.include?RATING_CRITERIA.map(([key,label])=>`- ${label}: ${state.rating.criteria[key].score||'Não avaliado'}. Motivo: ${state.rating.criteria[key].reason||'Não informado.'}`):[]),
    'A nota é uma avaliação editorial de experiência, não comprovação científica de eficácia.',
    '## Depoimentos',...(state.includeTestimonials?TESTIMONIAL_SLOTS.map(([slot,label])=>{const item=state.testimonials[slot];return `### ${label}\n\n${TESTIMONIAL_FIELDS.map(([key,title])=>`${title}: ${item[key]||'Não informado.'}`).join('\n\n')}\n\nAutenticidade declarada: ${item.realConfirmed?'Sim':'Pendente'}. Autorização declarada: ${item.publishConsent?'Sim':'Pendente'}.`}):['Depoimentos desativados para a saída da página; registros preservados no JSON.']),
    '## Pendências',...(readiness.gaps.length?readiness.gaps.map(gap=>`- ${gap}`):['Nenhuma pendência estrutural identificada.']),
    'A revisão não publica os dados. Confira os dados autorizados antes de usá-los na copy; não transformar relato individual em promessa de resultado.'].join('\n\n');
}

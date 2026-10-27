import {normalizePlan} from './review-domain.mjs?v=1';
export const PLAN_KEY='hub:review:planning:v1';
function revisions(storage){
  const raw=storage.getItem(PLAN_KEY);
  if(raw===null)return [];
  const value=JSON.parse(raw);
  if(!Array.isArray(value)||value.some(item=>!item||typeof item!=='object'||!item.plan))throw new Error('O plano salvo não pôde ser lido. O conteúdo original foi preservado.');
  return value;
}
export function loadPlan(storage){
  const history=revisions(storage);
  return {plan:normalizePlan(history.at(-1)?.plan),savedAt:history.at(-1)?.savedAt||null};
}
export function savePlan(storage,value,{expectedSavedAt=null,now=()=>new Date().toISOString()}={}){
  const history=revisions(storage),latest=history.at(-1);
  if((latest?.savedAt||null)!==expectedSavedAt)throw new Error('O plano foi salvo em outra aba. Exporte suas alterações antes de recarregar.');
  const plan=normalizePlan(value);
  if(latest&&JSON.stringify(latest.plan)===JSON.stringify(plan))return latest.savedAt;
  const savedAt=now();
  storage.setItem(PLAN_KEY,JSON.stringify([...history,{savedAt,plan}]));
  return savedAt;
}

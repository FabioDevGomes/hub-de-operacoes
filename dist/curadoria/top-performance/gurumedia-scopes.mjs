// Capture lists are not product identities: the same Offer ID can occur in many.
export const GURU_MEDIA_SCOPES=Object.freeze([
  {key:'ecommerce',label:'eCommerce',category:'eCommerce'},
  {key:'nutra-diet',label:'Nutra / Diet',category:'Nutra / Diet'},
  {key:'nutra-male',label:'Nutra / Male',category:'Nutra / Male'},
  {key:'nutra-skin',label:'Nutra / Skin',category:'Nutra / Skin'},
  {key:'health',label:'Health',category:'Health'},
  {key:'biz-opp',label:'Biz Opp',category:'Biz Opp'},
  {key:'top-performers',label:'Top Performers',category:null},
  {key:'new-offers',label:'New Offers',category:null},
  {key:'brand-bidding-ok',label:'Brand Bidding OK',category:null},
  {key:'best-in-vertical',label:'Best in Vertical',category:null},
  {key:'offer-hub',label:'Offer Hub',category:null},
]);
const fold=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function scopeByKey(key){return GURU_MEDIA_SCOPES.find(scope=>scope.key===key)||null}
export function scopeByLabel(label){return GURU_MEDIA_SCOPES.find(scope=>fold(scope.label)===fold(label))||null}
export function categoryScope(category){return scopeByLabel(category)||(/^eCommerce\s*\//i.test(category||'')?scopeByKey('ecommerce'):null)}
export function captureHeader(lines=[]){
  // Only a standalone heading next to its offer count is evidence. Navigation
  // counts and badges do not establish either the selected list or its size.
  for(let index=0;index<lines.length;index++){
    const inline=lines[index].match(/^(.+?)\s+(\d+)\s+offers?$/i),scope=scopeByLabel(inline?.[1]||lines[index]);
    if(!scope)continue;
    const next=lines.slice(index+1).find(Boolean),count=inline?.[2]||next?.match(/^(\d+)\s+offers?$/i)?.[1];
    if(count!==undefined)return{scope,declaredCount:Number(count)};
  }
  return{scope:null,declaredCount:null};
}
export function collectionScope(collection={}){
  const explicit=scopeByKey(collection.captureScope)||scopeByLabel(collection.category);
  if(explicit)return explicit;
  return scopeByKey(collection.source==='gurumedia-ecommerce'?'ecommerce':collection.source==='offer-hub'?'offer-hub':collection.source==='top-performers'?'top-performers':null);
}

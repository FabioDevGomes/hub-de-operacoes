import {normalizeDraft,MATERIAL_FIELDS} from './review-materials-domain.mjs?v=1';
import {listDrafts,saveDraft} from './review-materials-storage.mjs?v=1';
export function createMaterialsController({storage,createId,now}){
  const loaded=listDrafts(storage),buffers=new Map();
  for(const item of loaded.items)buffers.set(item.draft.id,{...item,saved:JSON.stringify(item.draft)});
  let activeId=loaded.items[0]?.draft.id||null;
  function create(){
    const unused=[...buffers.values()].find(item=>!item.revision&&!item.draft.product&&!dirty(item));
    if(unused){activeId=unused.draft.id;return}
    const draft=normalizeDraft({id:createId()});
    if(buffers.has(draft.id))throw new Error('Não foi possível criar uma identidade única. Tente novamente.');
    buffers.set(draft.id,{draft,revision:0,savedAt:null,saved:JSON.stringify(draft)});activeId=draft.id;
  }
  function dirty(item){return JSON.stringify(item.draft)!==item.saved}
  if(!activeId)create();
  return {
    warnings:loaded.warnings,
    current:()=>buffers.get(activeId),
    list:()=>[...buffers.values()].map(item=>({...item,dirty:dirty(item)})),
    hasUnsaved:()=>[...buffers.values()].some(dirty),
    update(key,value){if(!MATERIAL_FIELDS.includes(key))return;buffers.get(activeId).draft[key]=String(value)},
    select(id){if(!buffers.has(id))throw new Error('Review não encontrada.');activeId=id},
    create,
    save(id=activeId){const item=buffers.get(id);if(!item)throw new Error('Review não encontrada.');const entry=saveDraft(storage,item.draft,{expectedRevision:item.revision,now});Object.assign(item,{draft:normalizeDraft(entry.draft),revision:entry.revision,savedAt:entry.savedAt,saved:JSON.stringify(entry.draft)});return entry}
  };
}

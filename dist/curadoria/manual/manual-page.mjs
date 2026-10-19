import * as Domain from './manual-domain.mjs?v=2';
import {manualStorage as storage} from './manual-storage.mjs?v=3';
import {mountManualView} from './manual-view.mjs?v=4';
import {exploreUrl} from '../trends-domain.mjs';
import {imageSearchUrl,imageSearchUrlExcluding} from '../image-search-domain.mjs';
import {mountCurationListFocus} from '../list-focus.mjs?v=3';
import {mountGlimpseHeaderAction} from '../glimpse-embed-controls.mjs?v=4';

const root=document.querySelector('#manualRoot'),frame=root.querySelector('#glimpseFrame');
let state={products:[],trends:[],images:[],decisions:[],analyses:[]},preferences;
try{preferences=localStorage;}catch{}
const focus=mountCurationListFocus('manual',{blockingSelector:'#offerSheet:not(.hidden), dialog[open]',highlightOnCapture:false,restoreOnWindowReturn:false,suppressPulseOnPageHide:true});
const openExternal=url=>window.open(url,'_blank','noopener,noreferrer');
const find=id=>{const product=state.products.find(p=>p.productId===id);if(!product)throw new Error('Produto não encontrado.');return product;};
async function refresh(){state=await storage.readState();view.render(state);}
async function change(task){const result=await task();try{await refresh();}catch{throw new Error('Dados salvos, mas a lista não pôde ser atualizada. Recarregue a tela antes de continuar.');}return result;}
const view=mountManualView({root,preferences,actions:{
  saveProduct:(input,previous)=>change(()=>storage.saveProduct(input,previous)),
  setHidden:(id,hidden)=>change(()=>storage.setHidden(id,hidden)),
  saveTrend:(id,input)=>change(()=>storage.saveTrend(id,input)),
  changeTrendCandidates:(id,operation)=>change(()=>storage.updateTrendCandidates(id,operation)),
  saveImage:(id,input)=>change(()=>storage.saveImage(id,input)),
  saveDecision:(id,status,notes)=>change(()=>storage.saveDecision(id,status,notes)),
  addCountry:(id,raw)=>{const countries=Domain.countryCodes(raw);if(countries.length!==1)throw new Error('Informe um país por vez.');const product=find(id);return change(()=>storage.saveProduct({...product,payoutValue:product.payout.value,currency:product.payout.currency,countries:[...product.countries,...countries]},product));},
  openTrends:term=>openExternal(exploreUrl(term)),
  openImages:(term,country,excluded=[])=>openExternal(excluded.length?imageSearchUrlExcluding(term,country,excluded):imageSearchUrl(term,country)),
  openGlimpse:product=>{if(!product)return;const query=new URLSearchParams({origin:'manual',productKey:product.productId,product:product.name,embedded:'1'}),url=`/curadoria/glimpse/?${query}`;if(frame.dataset.analysisUrl!==url){frame.dataset.analysisUrl=url;frame.src=url;}},
  restoreFocus:()=>void refresh().then(()=>focus.restore(),()=>{view.notice('Não foi possível atualizar a lista ao voltar. Recarregue a tela.',true);focus.restore();}),
  exportBackup:async()=>{const payload=await storage.exportBackup(),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='curadoria-manual-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},
  restoreBackup:payload=>change(()=>storage.mergeBackup(payload)),
}});
mountGlimpseHeaderAction({frame,panel:root.querySelector('[data-panel="glimpse"]'),backButton:root.querySelector('#closeSheet'),actionButton:root.querySelector('#saveSheetButton'),finishLabel:'Salvar',showSavedFeedback:true});
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
  if(event.data?.type==='hub-glimpse-save-result'&&event.data.saved===true){
    void refresh().then(()=>{if(root.querySelector('#offerSheet').classList.contains('hidden'))focus.restore();}).catch(()=>view.notice('Análise salva; recarregue a lista para atualizar o resultado.',true));
    return;
  }
  if(root.querySelector('#offerSheet').classList.contains('hidden')||root.querySelector('[data-panel="glimpse"]').classList.contains('hidden'))return;
  if(event.data?.type==='hub-glimpse-resize'&&Number.isFinite(event.data.height)&&event.data.height>0)frame.style.height=Math.min(event.data.height,100000)+'px';
  if(event.data?.type==='hub-glimpse-close')view.closeSheet();
});
refresh().catch(error=>view.notice('Não foi possível abrir a Curadoria manual. '+error.message,true));

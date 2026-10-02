import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {readDraft,writeDraft,clearDraft,STORAGE_KEY} from '../src/copy-ficha/copy-ficha-draft.mjs';
import {renderTemplate} from '../src/copy-ficha/copy-ficha-template.mjs';
import {createFromStructuredContent} from '../src/copy-ficha/copy-ficha-workflow.mjs';
import {buildStructuredFicha,structuredFichaFormat} from '../src/copy-ficha/copy-ficha-structured.mjs';
import {createPresellFromFicha,parseFicha} from '../src/presell/presell-service.mjs?v=1';
import {reportHtml} from '../src/presell/presell-report.mjs?v=1';
import {parseFicha as legacyParse,createPresellFromFicha as legacyCreate,reportHtml as legacyReport} from '../src/presell/presell-view.mjs';

const fields={PRODUTO:'Synthetic board',TEXTO_EXPANDIR:'View details',TITULO_PRINCIPAL:'Synthetic offer',INTRODUCAO:'Text & accents: ação.',TITULO_OFERTA:'Overview',TEXTO_OFERTA:'Terms unchanged.',TITULO_PRECO:'Price',TEXTO_PRECO:'$10 per unit. Save 70%.',TITULO_FRETE_GARANTIA:'Shipping',TEXTO_FRETE_GARANTIA:'See checkout.',TITULO_FAQ:'FAQ'};
const source=(count=3)=>Object.entries(fields).map(([key,value])=>'['+key+'] '+value).concat(Array.from({length:count},(_,i)=>['[PERGUNTA_'+(i+1)+'] Question '+(i+1),'[RESPOSTA_'+(i+1)+'] Answer '+(i+1)]).flat()).join('\n');
const data={countryCode:'US',htmlLanguage:'en-US',affiliateUrl:'https://example.com/offer',destination:'C:/synthetic/pag01',assetFolder:'assets'};
test('invalid structured fields block before the production boundary and retain field diagnostics',async()=>{
  let calls=0;
  await assert.rejects(createFromStructuredContent('[PRODUTO] Synthetic',data,{create:()=>{calls++}}),error=>error.fields.includes('fichaSource')&&error.blockers.length>0);
  await assert.rejects(createFromStructuredContent(source(),{...data,affiliateUrl:''},{create:()=>{calls++}}),error=>error.fields.includes('affiliateUrl'));
  assert.equal(calls,0);
});
test('three or four supplied FAQs reach production without rewording or recalculation',async()=>{
  for(const count of [3,4]){
    const original=structuredClone(data),expected=buildStructuredFicha(source(count),data);let supplied;
    const result=await createFromStructuredContent(source(count),data,{create:async ficha=>{supplied=ficha;return {production:{report:{overall:'PASS'}}}}});
    assert.deepEqual(supplied,expected.ficha);assert.deepEqual(result.ficha,expected.ficha);assert.deepEqual(result.warnings,expected.warnings);
    assert.equal(result.ficha.faqs.length,count);assert.equal(result.ficha.priceText,fields.TEXTO_PRECO);assert.deepEqual(data,original);
  }
});
test('cancellation, server blockers and production errors are preserved',async()=>{
  const cancelled=await createFromStructuredContent(source(),data,{create:async()=>({cancelled:true})});assert.equal(cancelled.cancelled,true);
  const blocked=await createFromStructuredContent(source(),data,{create:async()=>({production:{report:{overall:'BLOCKED'}}})});assert.equal(blocked.production.report.overall,'BLOCKED');
  const failure=new Error('Synthetic assets missing');
  await assert.rejects(createFromStructuredContent(source(),data,{create:async()=>{throw failure}}),error=>error===failure);
});
test('service validates JSON before confirmation; cancellation does not call API',async()=>{
  let confirmations=0,calls=0;const previous=globalThis.fetch;
  try{
    globalThis.fetch=async()=>{calls++;throw Error('must not call')};
    await assert.rejects(createPresellFromFicha({}, {confirmCreate:()=>{confirmations++;return true}}),/Campo obrigatório/);
    const ficha=buildStructuredFicha(source(),data).ficha;
    assert.deepEqual(await createPresellFromFicha(ficha,{confirmCreate:()=>{confirmations++;return false}}),{cancelled:true});
    assert.equal(confirmations,1);assert.equal(calls,0);
  }finally{globalThis.fetch=previous}
});
test('confirmed creation posts to produce directly; final files are not demanded beforehand',async()=>{
  const previous=globalThis.fetch,requests=[];
  try{
    globalThis.fetch=async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>({report:{overall:'PASS'}})}};
    const ficha=buildStructuredFicha(source(4),data).ficha,original=structuredClone(ficha);
    const result=await createPresellFromFicha(ficha,{confirmCreate:message=>{assert.match(message,/arquivo de saída já existir/);return true}});
    assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/presell/produce');assert.equal(requests[0].options.method,'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body),{destination:ficha.destination,ficha});
    assert.deepEqual(ficha,original);assert.equal(result.production.report.overall,'PASS');
    globalThis.fetch=async()=>({ok:false,json:async()=>({error:'Synthetic no-overwrite blocker'})});
    await assert.rejects(createPresellFromFicha(ficha,{confirmCreate:()=>true}),/no-overwrite blocker/);
  }finally{globalThis.fetch=previous}
});
test('draft round-trip keeps the existing key, manual/autofill origin and unknown historical properties',()=>{
  const map=new Map(),storage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
  const legacy={packages:[{name:'Synthetic legacy'}],packagesManuallyEdited:true,oldField:{keep:true},product:'Old'};
  storage.setItem(STORAGE_KEY,JSON.stringify(legacy));
  const update={product:'Manual',confirmedDiscountPercent:'70',confirmedDiscountAmount:'30',confirmedProductPrice:'10',autoFilledFields:['copyCountry']};
  writeDraft(update,storage);const restored=readDraft(storage);
  assert.equal(STORAGE_KEY,'copy-ficha-draft-v1');assert.deepEqual(restored.packages,legacy.packages);assert.deepEqual(restored.oldField,legacy.oldField);assert.equal(restored.packagesManuallyEdited,undefined);
  for(const key of Object.keys(update))assert.deepEqual(restored[key],update[key]);
  assert.equal(restored.fichaSource,undefined);
  const original=storage.getItem(STORAGE_KEY);readDraft(storage);assert.equal(storage.getItem(STORAGE_KEY),original,'reading never writes');
  clearDraft(storage);assert.equal(readDraft(storage),null);
  storage.setItem(STORAGE_KEY,'invalid json');assert.equal(readDraft(storage),null);
  const denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
  assert.equal(readDraft(denied),null);assert.doesNotThrow(()=>writeDraft(update,denied));assert.doesNotThrow(()=>clearDraft(denied));
});
test('presentation keeps creation separate from restored questions and safely escapes structured placeholder',()=>{
  const html=renderTemplate();for(const id of ['copyRawText','copyDiscount','copyDiscountAmount','copyProductPrice','copyFichaSource','copyGenerateFicha','copyPresellStatus','copyPresellReport','copyWarnings'])assert.ok(html.includes('id="'+id+'"'));
  assert.equal((html.match(/id="copyGenerateFicha"/g)||[]).length,1);
  assert.ok(html.includes(structuredFichaFormat));assert.ok(!html.includes('Gerar copy')&&!html.includes('copyPackages'));
  for(const id of ['copyGenerateQuestions','copyOfferQuestions','copyQuestionsCopy'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  const report=reportHtml({overall:'BLOCKED',phases:[{name:'<unsafe>',report:{checks:[{status:'BLOCK',name:'field',message:'<img onerror=bad>'}]}}]});
  assert.ok(report.includes('&lt;img onerror=bad&gt;')&&!report.includes('<img'));
  assert.equal(legacyParse,parseFicha);assert.equal(legacyCreate,createPresellFromFicha);assert.equal(legacyReport,reportHtml);
});
test('view delegates layout, drafts and workflow without importing another view or producing at mount time',async()=>{
  const view=await readFile(new URL('../src/copy-ficha/copy-ficha-view.mjs',import.meta.url),'utf8');
  assert.ok(view.includes('root.innerHTML=renderTemplate()')&&view.includes('const draft=readDraft()')&&view.includes('writeDraft({...payload(root)'));
  assert.ok(!view.includes('localStorage')&&!view.includes('presell-view.mjs')&&!view.includes('buildStructuredFicha('));
  assert.ok(view.includes("createFromStructuredContent(inputValue(root,'copyFichaSource'),payload(root))"));
  const mounting=view.slice(view.indexOf('export async function mount'));
  assert.ok(mounting.includes('by(root,\'copyGenerateFicha\').onclick=async()=>')&&mounting.includes('if(creatingPresell)return')&&mounting.includes('finally{creatingPresell=false;button.disabled=false;'));
});

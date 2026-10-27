import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMaterialsController} from '../src/review/review-materials-controller.mjs';
import {createCopyController} from '../src/review/review-copy-controller.mjs';
import {COPY_PREFIX,loadCopy} from '../src/review/review-copy-storage.mjs';
import {COPY_SECTIONS,createCopyState,copyReadiness,exportCopy,isPublicCtaUrl,validateCopySection} from '../src/review/review-copy-domain.mjs';
import {mountCopy} from '../src/review/review-copy-view.mjs';
import {createRoot} from './helpers/view-dom.mjs';

function memory(){const data=new Map();return {data,get length(){return data.size},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}}
function sourceController(state,revision=1){const row={state,revision,saved:JSON.stringify(state),savedAt:'2026-10-25T12:00:00.000Z',error:''};return {row,current:()=>row,hasUnsaved:()=>row.saved!==JSON.stringify(row.state)}}
function fixture(storage=memory(),id='copy-test'){
  const materials=createMaterialsController({storage,createId:()=>id});materials.update('product','Produto sintético');materials.update('market','Mercado sintético');materials.update('salesUrl','https://shop.example.com/product');materials.update('salesContent','Página de vendas sintética');materials.save();
  const analysis=sourceController({reviewed:true}),reviewer=sourceController({reviewed:true}),offer=sourceController({reviewed:true,confirmed:true,guaranteeDays:'60'}),images=sourceController({reviewed:true,offerRevision:1,hero:{choice:'manual',url:'https://cdn.example.com/hero.png'},items:{scamAlert:{url:''},whatIsIt:{url:''},ingredients:{kind:'text',url:''},sixPack:{url:''},femaleAvatar:{url:''},maleAvatar:{url:''}},customBadge:{url:''}});
  return {storage,materials,analysis,reviewer,offer,images,controller:createCopyController({storage,materials,analysis,reviewer,offer,images})};
}
function setReviewed(controller,key,{basis='salesPage',asset='none',cta=false,claimCheck='checked'}={}){
  const p='sections.'+key+'.';controller.update(p+'copy','Texto sintético vinculado à fonte.');controller.update(p+'basis',basis);controller.update(p+'claimCheck',claimCheck);
  if(['offer','reviewer','label','salesPage','vsl','external','userVerified'].includes(basis)){controller.update(p+'sourceReference','Fonte sintética');controller.update(p+'evidence','Trecho de apoio sintético');}
  if(claimCheck==='flagged')controller.update(p+'claimNote','Risco pendente documentado.');
  if(cta){controller.update(p+'ctaLabel','Ver oferta');controller.update(p+'ctaUrl','https://shop.example.com/checkout');controller.update(p+'ctaConfirmed',true)}
  if(asset!=='none')controller.update(p+'assetKey',asset);
  controller.update(p+'status','reviewed');
}

assert.equal(COPY_SECTIONS.length,20);assert.deepEqual(COPY_SECTIONS.map(item=>item.number),Array.from({length:20},(_,i)=>i+1));
assert.deepEqual(COPY_SECTIONS.map(item=>item.title),['Header fixo','Hero','Quick verdict','Story','Scorecard, prós e contras','How to use','Scam Alert','Complaints','What Is It','How It Works','Ingredients','Safety','Benefits','Testimonials','Refund policy','Pricing','Claim Your Discount','FAQ','Conclusion','Footer']);
for(const url of ['https://shop.example.com/checkout','http://shop.example.com/checkout'])assert.equal(isPublicCtaUrl(url),true,url);
for(const url of ['','javascript:alert(1)','file:///tmp/x','https://user:pass@shop.example.com','http://localhost:8080','https://private.local','http://192.168.1.3','http://10.0.0.1'])assert.equal(isPublicCtaUrl(url),false,url);
assert.deepEqual(validateCopySection({status:'draft'}),{},'drafts may be saved with missing fields');
assert.match(validateCopySection({status:'omitted',decisionNote:''}).decisionNote,/omitid/i);

const fx=fixture(),{controller,materials,storage,analysis}=fx,bytesBefore=storage.length;
assert.equal(controller.current().revision,0);assert.equal(storage.length,bytesBefore,'abrir passo 6 não grava');
assert.equal(controller.readiness().ready,false);assert.ok(controller.readiness().gaps.some(gap=>gap.includes('Conecte a copy')));
controller.confirmSources();assert.equal(controller.readiness().snapshotMatches,true);
assert.throws(()=>controller.update('sections.hero.status','reviewed'),/copy revisada|base da copy|Classifique/i);
controller.update('sections.hero.copy','Alegação sem prova.');controller.update('sections.hero.basis','unsupported');controller.update('sections.hero.claimCheck','checked');
assert.throws(()=>controller.update('sections.hero.status','reviewed'),/sem fonte suficiente/i);

controller.update('sections.hero.basis','salesPage');controller.update('sections.hero.sourceReference','Página de vendas · bloco de oferta');controller.update('sections.hero.evidence','Trecho sintético da página de vendas.');controller.update('sections.hero.claimCheck','flagged');controller.update('sections.hero.claimNote','Alegação ainda não conferida.');
assert.throws(()=>controller.update('sections.hero.status','reviewed'),/Risco pendente/i);
controller.update('sections.hero.claimCheck','checked');controller.update('sections.hero.ctaLabel','Ver oferta');controller.update('sections.hero.ctaUrl','http://localhost:8765/checkout');controller.update('sections.hero.ctaConfirmed',true);
assert.throws(()=>controller.update('sections.hero.status','reviewed'),/destino público/i);
controller.update('sections.hero.ctaUrl','https://shop.example.com/checkout');assert.equal(controller.current().state.sections.hero.ctaConfirmed,false,'alterar destino invalida confirmação anterior');
controller.update('sections.hero.ctaConfirmed',true);controller.update('sections.hero.assetKey','whatIsIt');assert.throws(()=>controller.update('sections.hero.status','reviewed'),/não tem URL disponível/i);
controller.update('sections.hero.assetKey','hero');controller.update('sections.hero.status','reviewed');assert.equal(controller.current().state.sections.hero.status,'reviewed');

for(const section of COPY_SECTIONS.filter(item=>item.key!=='hero')){controller.update(`sections.${section.key}.decisionNote`,'Seção omitida neste rascunho; aguarda material específico.');controller.update(`sections.${section.key}.status`,'omitted')}
assert.equal(controller.current().state.sections.story.status,'omitted');
controller.update('sections.story.decisionNote','Justificativa de omissão atualizada sem reabrir a seção.');assert.equal(controller.current().state.sections.story.status,'omitted','editing omission reason preserves omission status');
assert.equal(controller.readiness().ready,true,controller.readiness().gaps.join('; '));controller.setReviewed(true);assert.equal(controller.current().state.reviewed,true);
controller.save();assert.equal(controller.current().revision,1);controller.save();assert.equal(controller.current().revision,1,'idempotent save does not create duplicate history');
const history=JSON.parse(storage.getItem(COPY_PREFIX+materials.current().draft.id));assert.equal(history.length,1);assert.equal(history[0].state.reviewed,true);
assert.match(exportCopy(controller.current().state,materials.current().draft,controller.sourceContext()),/7\. Scam Alert/);assert.match(exportCopy(controller.current().state,materials.current().draft,controller.sourceContext()),/não gera HTML/);
assert.equal(loadCopy(storage,materials.current().draft).revision,1);

const reopened=createCopyController({storage,materials,analysis,reviewer:fx.reviewer,offer:fx.offer,images:fx.images});assert.equal(reopened.current().state.sections.hero.copy,'Alegação sem prova.');
const remote=createCopyController({storage,materials,analysis,reviewer:fx.reviewer,offer:fx.offer,images:fx.images});remote.update('sections.story.decisionNote','Edição concorrente.');remote.save();reopened.update('sections.story.decisionNote','Minha edição concorrente.');assert.throws(()=>reopened.save(),/outra aba/i);assert.equal(JSON.parse(storage.getItem(COPY_PREFIX+materials.current().draft.id)).length,2);

analysis.row.revision++;analysis.row.state={reviewed:true,revisionMarker:2};analysis.row.saved=JSON.stringify(analysis.row.state);
assert.equal(controller.readiness().snapshotMatches,false);assert.ok(controller.readiness().gaps.some(gap=>gap.includes('fontes mudaram')));
controller.confirmSources();assert.equal(controller.current().state.sections.hero.copy,'Alegação sem prova.','reconciliação preserva a copy');assert.equal(controller.current().state.sections.hero.status,'draft','reconciliação pede nova revisão');assert.equal(controller.current().state.sections.story.status,'draft');

const draft=materials.current().draft,invalid=createCopyState(draft);invalid.sections.hero.status='reviewed';invalid.sections.hero.copy='Texto';invalid.sections.hero.basis='editorial';invalid.sections.hero.claimCheck='notApplicable';
const invalidQuality=copyReadiness(invalid,draft,{});assert.equal(invalidQuality.ready,false);assert.ok(invalidQuality.gaps.length);
const html=await readFile(new URL('../src/review/review-copy-view.mjs',import.meta.url),'utf8');assert.match(html,/data-copy-section-status/);assert.match(html,/data-copy-cta-confirm/);assert.match(html,/maxlength="\$\{maxLength\}"/);
const ui=createRoot(),listeners={};ui.root.addEventListener=(type,fn)=>listeners[type]=fn;const viewController=createCopyController({storage,materials,analysis:fx.analysis,reviewer:fx.reviewer,offer:fx.offer,images:fx.images});viewController.update('sections.hero.copy','<script>alert(1)</script>');mountCopy({root:ui.root,controller:viewController,materials});
assert.equal((ui.root.innerHTML.match(/data-copy-section="/g)||[]).length,20);assert.match(ui.root.innerHTML,/data-copy-section-status="header"/);assert.match(ui.root.innerHTML,/data-copy-cta-confirm="hero"/);assert.match(ui.root.innerHTML,/Confirmar fontes atuais/);assert.match(ui.root.innerHTML,/não gera texto por IA/i);assert.doesNotMatch(ui.root.innerHTML,/<script>alert/);assert.match(ui.root.innerHTML,/&lt;script&gt;alert/);
assert.equal((await readFile(new URL('../src/review/review-view.mjs',import.meta.url),'utf8')).includes("mountCopy({root:copyRoot,controller:copy,materials})"),true);assert.match(await readFile(new URL('../src/review/review-view.mjs',import.meta.url),'utf8'),/copy\?\.hasUnsaved\(\)/);
for(const file of ['review-copy-domain.mjs','review-copy-controller.mjs','review-copy-storage.mjs','review-copy-view.mjs','review-domain.mjs','review-view.mjs','review.css'])assert.equal(await readFile(new URL('../src/review/'+file,import.meta.url),'utf8'),await readFile(new URL('../dist/review/'+file,import.meta.url),'utf8'),`${file} deve estar publicado no dist`);
console.log('review copy: 20 seções, rastreabilidade, alegações, omissão, CTA/asset, reconciliação, histórico e view isolada ok');

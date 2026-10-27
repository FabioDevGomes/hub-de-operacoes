import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMaterialsController} from '../src/review/review-materials-controller.mjs';
import {createCopyController} from '../src/review/review-copy-controller.mjs';
import {createPageController} from '../src/review/review-page-controller.mjs';
import {loadPage,savePage} from '../src/review/review-page-storage.mjs';
import {COPY_SECTIONS,createCopyState} from '../src/review/review-copy-domain.mjs';
import {PAGE_SCHEMA,PAGE_PREFIX,createPageState,pageBinding,createPageSnapshot,findPagePlaceholders,pageReadiness,renderReviewHtml,exportReviewHtml} from '../src/review/review-page-domain.mjs';
import {mountPage} from '../src/review/review-page-view.mjs';
import {createRoot} from './helpers/view-dom.mjs';

function memory(){const data=new Map();return{data,get length(){return data.size},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}}
function stub(state,revision=0){const row={state,revision,saved:JSON.stringify(state),savedAt:null,error:''};return{row,current:()=>row,hasUnsaved:()=>row.saved!==JSON.stringify(row.state)}}
function makeReady(draft){
  const copyState=createCopyState(draft);for(const def of COPY_SECTIONS){copyState.sections[def.key].status='reviewed';copyState.sections[def.key].copy=`Texto editorial seguro da seção ${def.number}.`;copyState.sections[def.key].basis='editorial';copyState.sections[def.key].claimCheck='notApplicable'}
  copyState.sections.hero.basis='salesPage';copyState.sections.hero.sourceReference='Página de vendas · apresentação';copyState.sections.hero.evidence='Trecho de origem';copyState.sections.hero.claimCheck='checked';copyState.sections.hero.copy='Informação editorial do produto.';copyState.sections.hero.assetKey='hero';copyState.sections.hero.ctaLabel='Ver oferta';copyState.sections.hero.ctaUrl=draft.affiliateUrl;copyState.sections.hero.ctaConfirmed=true;copyState.reviewed=true;
  copyState.sections.scamAlert.status='omitted';copyState.sections.scamAlert.decisionNote='Sem comparação verificável para esta página.';
  const source={materials:{revision:1,dirty:false,reviewed:false},analysis:{revision:1,dirty:false,reviewed:true},reviewer:{revision:1,dirty:false,reviewed:true},offer:{revision:1,dirty:false,reviewed:true,confirmed:true},images:{revision:1,dirty:false,reviewed:true,offerRevision:1},copy:{revision:1,dirty:false,reviewed:true,state:copyState},copyQuality:{ready:true,gaps:[]},assets:{hero:'https://cdn.example.com/hero.png'}};
  const page=createPageState(draft);page.seoTitle='Produto Review: experiência e informações';page.description='Confira os detalhes do produto, a oferta disponível e os pontos considerados nesta avaliação editorial.';page.binding=pageBinding(draft);page.sourceSnapshot=createPageSnapshot(source);page.imageAlts.hero={text:'Frasco do produto sobre fundo branco',confirmed:true};
  return{source,copyState,page};
}

const storage=memory(),materials=createMaterialsController({storage,createId:()=> 'page-controller-test'});materials.update('product','Produto de teste');materials.update('market','Estados Unidos');materials.update('language','en-US');materials.update('publicationUrl','https://review.example.com/product/');materials.update('portal','Review Portal');materials.update('affiliateUrl','https://shop.example.com/product');materials.save();
const draft=materials.current().draft;
assert.equal(PAGE_SCHEMA,'hub-review-page-v1');assert.equal(loadPage(storage,draft).revision,0);assert.equal(storage.length,1,'abrir a etapa não grava o rascunho');
assert.equal(findPagePlaceholders('Texto com TODO'),true);assert.equal(findPagePlaceholders('{{product_name}}'),true);assert.equal(findPagePlaceholders('Texto editorial pronto'),false);

const invalidSource={materials:{revision:0},analysis:{},reviewer:{},offer:{},images:{},copy:{},copyQuality:{ready:false,gaps:['copy pendente']}};
let readiness=pageReadiness(createPageState(draft),draft,invalidSource);assert.equal(readiness.ready,false);assert.ok(readiness.gaps.some(gap=>gap.includes('URL final')||gap.includes('título SEO')));assert.ok(readiness.gaps.some(gap=>gap.includes('Passo')));
const ready=makeReady(draft);readiness=pageReadiness(ready.page,draft,ready.source);assert.equal(readiness.ready,true,readiness.gaps.join('; '));ready.page.reviewed=true;assert.equal(pageReadiness(ready.page,draft,ready.source).exportReady,true);
const html=exportReviewHtml(ready.page,draft,ready.source);
assert.match(html,/<!doctype html>/i);assert.match(html,/<html lang="en-US">/);assert.match(html,/<meta name="robots" content="index,follow">/);assert.match(html,/<link rel="canonical" href="https:\/\/review\.example\.com\/product\/">/);assert.match(html,/<meta name="description" content="Confira os detalhes/);assert.match(html,/<h1>Produto Review: experiência e informações<\/h1>/);assert.match(html,/<p>Confira os detalhes do produto/);
assert.match(html,/application\/ld\+json/);assert.match(html,/"@type":"WebPage"/);assert.match(html,/"@type":"Organization"/);assert.doesNotMatch(html,/AggregateRating|"@type":"Review"/);assert.equal((html.match(/<script\b/g)||[]).length,1,'HTML final não carrega JavaScript executável');assert.match(html,/no-referrer/);assert.match(html,/alt="Frasco do produto sobre fundo branco"/);assert.match(html,/rel="sponsored nofollow noopener noreferrer"/);
assert.doesNotMatch(html,/7\. Scam Alert|Sem comparação verificável/);
for(let index=1;index<COPY_SECTIONS.length;index++){const before=html.indexOf(`id="review-${COPY_SECTIONS[index-1].key}"`),after=html.indexOf(`id="review-${COPY_SECTIONS[index].key}"`);if(COPY_SECTIONS[index-1].key==='scamAlert'||COPY_SECTIONS[index].key==='scamAlert')continue;if(before>=0&&after>=0)assert.ok(before<after,`ordem do modelo: ${COPY_SECTIONS[index-1].title} antes de ${COPY_SECTIONS[index].title}`)}

const unsafe=makeReady(draft);unsafe.copyState.sections.hero.copy='<script>alert(1)</script> & "texto"';unsafe.page.sourceSnapshot=createPageSnapshot(unsafe.source);unsafe.page.reviewed=true;
const escaped=renderReviewHtml(unsafe.page,draft,unsafe.source,{preview:false});assert.match(escaped,/&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;texto&quot;/);assert.doesNotMatch(escaped,/<script>alert/);
const preview=renderReviewHtml(ready.page,draft,ready.source,{preview:true});assert.match(preview,/PRÉVIA INTERNA/);assert.match(preview,/<meta name="robots" content="noindex,nofollow">/);assert.doesNotMatch(preview,/<link rel="canonical"|property="og:url"|application\/ld\+json/);
const placeholder=makeReady(draft);placeholder.copyState.sections.hero.copy='{{INSERT_RESULT}}';placeholder.page.sourceSnapshot=createPageSnapshot(placeholder.source);readiness=pageReadiness(placeholder.page,draft,placeholder.source);assert.ok(readiness.gaps.some(gap=>gap.includes('placeholders')));
const placeholderCta=makeReady(draft);placeholderCta.copyState.sections.hero.ctaLabel='[INSERT CTA]';placeholderCta.page.sourceSnapshot=createPageSnapshot(placeholderCta.source);readiness=pageReadiness(placeholderCta.page,draft,placeholderCta.source);assert.ok(readiness.gaps.some(gap=>gap.includes('placeholders')&&gap.includes('CTA')));
const wrongCanonical={...draft,publicationUrl:'http://localhost:8080/page'};const wrongState=createPageState(wrongCanonical);wrongState.seoTitle='Title';wrongState.description='Description';readiness=pageReadiness(wrongState,wrongCanonical,ready.source);assert.ok(readiness.gaps.some(gap=>gap.includes('canonical')));
const invalidPreview=renderReviewHtml(wrongState,wrongCanonical,ready.source,{preview:true});assert.doesNotMatch(invalidPreview,/<meta property="og:url"/);assert.doesNotMatch(invalidPreview,/application\/ld\+json/);
const missingAlt=makeReady(draft);missingAlt.page.imageAlts.hero={text:'',confirmed:false};readiness=pageReadiness(missingAlt.page,draft,missingAlt.source);assert.ok(readiness.gaps.some(gap=>gap.includes('alt')));

const pageState=createPageState(draft);pageState.seoTitle='Draft SEO title';const saved=savePage(storage,pageState,{now:()=> '2026-10-25T15:00:00.000Z'});assert.equal(saved.revision,1);assert.equal(loadPage(storage,draft).state.seoTitle,'Draft SEO title');assert.equal(JSON.parse(storage.getItem(PAGE_PREFIX+draft.id)).length,1);assert.equal(savePage(storage,pageState,{expectedRevision:1}).revision,1);
const concurrent={...pageState,description:'Concorrente'};savePage(storage,concurrent,{expectedRevision:1});assert.throws(()=>savePage(storage,{...pageState,description:'Local'}, {expectedRevision:1}),/outra aba/i);assert.equal(JSON.parse(storage.getItem(PAGE_PREFIX+draft.id)).length,2);

const analysis=stub({reviewed:false}),reviewer=stub({reviewed:false}),offer=stub({reviewed:false,confirmed:false}),images=stub({reviewed:false,offerRevision:0});
const controllerStorage=memory(),controllerMaterials=createMaterialsController({storage:controllerStorage,createId:()=> 'page-controller-state'});controllerMaterials.update('product','Produto do controller');controllerMaterials.save();
const copy=createCopyController({storage:controllerStorage,materials:controllerMaterials,analysis,reviewer,offer,images}),page=createPageController({storage:controllerStorage,materials:controllerMaterials,analysis,reviewer,offer,images,copy});assert.equal(page.current().revision,0);assert.throws(()=>page.confirmSources(),/passo|revisada/i);assert.match(page.previewHtml(),/PRÉVIA INTERNA/);assert.throws(()=>page.exportHtml(),/Passo|Confirme|Informe/i);
page.update('seoTitle','Título provisório');page.save();assert.equal(page.current().revision,1);const otherPage=createPageController({storage:controllerStorage,materials:controllerMaterials,analysis,reviewer,offer,images,copy});otherPage.update('description','Outra aba');otherPage.save();page.update('description','Edição local');assert.throws(()=>page.save(),/outra aba/i);

const ui=createRoot(),listeners={};ui.root.addEventListener=(type,handler)=>listeners[type]=handler;const uiCopy=createCopyController({storage,materials,analysis,reviewer,offer,images}),viewController=createPageController({storage,materials,analysis,reviewer,offer,images,copy:uiCopy});mountPage({root:ui.root,controller:viewController,materials});
assert.match(ui.root.innerHTML,/Canonical/);assert.match(ui.root.innerHTML,/JSON-LD usa WebPage e Organization/);assert.match(ui.root.innerHTML,/não garantem rastreamento, indexação/);assert.match(ui.root.innerHTML,/não gera sitemap/);assert.match(ui.root.innerHTML,/sandbox=""/);assert.match(ui.root.innerHTML,/data-page-action="preview"/);assert.match(ui.root.innerHTML,/Baixar HTML final/);
const integration=await readFile(new URL('../src/review/review-view.mjs',import.meta.url),'utf8');assert.match(integration,/mountPage\(\{root:pageRoot,controller:page,materials\}\)/);assert.match(integration,/page\?\.hasUnsaved\(\)/);
for(const file of ['review-page-domain.mjs','review-page-storage.mjs','review-page-controller.mjs','review-page-view.mjs','review-domain.mjs','review-view.mjs','review.css'])assert.equal(await readFile(new URL('../src/review/'+file,import.meta.url),'utf8'),await readFile(new URL('../dist/review/'+file,import.meta.url),'utf8'),`${file} deve estar publicado no dist`);
console.log('review page: compatibilidade com copy, SEO/canonical, JSON-LD sem ratings agregadas, HTML seguro, preview isolado, fontes e histórico ok');

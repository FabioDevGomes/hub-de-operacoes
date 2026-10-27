import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMaterialsController} from '../src/review/review-materials-controller.mjs';
import {createReviewerController} from '../src/review/review-reviewer-controller.mjs';
import {createReviewerState,calculateRating,parseScore,reviewerReadiness,exportReviewer,RATING_CRITERIA} from '../src/review/review-reviewer-domain.mjs';
import {REVIEWER_PREFIX,loadReviewer} from '../src/review/review-reviewer-storage.mjs';
const data=new Map(),storage={get length(){return data.size},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
let count=0;const createId=()=>`reviewer-test-${++count}`,materials=createMaterialsController({storage,createId});materials.update('product','Produto sintético');materials.save();const first=materials.current().draft.id;
const reviewer=createReviewerController({storage,materials}),keysBefore=storage.length;
assert.equal(reviewer.current().revision,0);assert.equal(reviewer.hasUnsaved(),false);assert.equal(storage.length,keysBefore,'abrir não grava');
reviewer.save();assert.equal(reviewer.current().revision,1,'rascunho incompleto pode ser salvo');reviewer.save();assert.equal(reviewer.current().revision,1,'save idempotente');
assert.equal(parseScore(''),null);assert.equal(parseScore('0'),0);assert.equal(parseScore('9,5'),9.5);assert.equal(parseScore('10'),10);
for(const bad of ['11','-1','NaN','1e2','0x10','abc'])assert.ok(Number.isNaN(parseScore(bad)));
reviewer.update('rating.include',true);reviewer.update('rating.experience.score','0');reviewer.update('rating.experience.reason','Experiência sintética desfavorável.');reviewer.update('rating.ease.score','8');reviewer.update('rating.ease.reason','Rotina sintética fácil.');
assert.equal(calculateRating(reviewer.current().state).value,4);assert.equal(calculateRating(reviewer.current().state).included.length,2);assert.equal(calculateRating(reviewer.current().state).excluded.length,2);assert.equal(calculateRating(reviewer.current().state).partial,true);
reviewer.update('rating.confirmed',true);reviewer.update('rating.ease.reason','Motivo editado');assert.equal(reviewer.current().state.rating.confirmed,false);
reviewer.update('rating.confirmed',true);assert.throws(()=>reviewer.setReviewed(true),/Nome público|Origem|usou/);
for(const key of ['displayName','source','duration','discovery','skepticism','decision','routine','results','unchanged','negatives'])reviewer.update('reviewer.'+key,'Dado sintético de teste');
reviewer.update('rating.confirmed',true);
reviewer.update('reviewer.realUseConfirmed',true);reviewer.update('reviewer.publishConsent',true);assert.equal(reviewerReadiness(reviewer.current().state,materials.current().draft).ready,false,'faltam depoimentos');
for(const slot of ['female','male']){for(const key of ['displayName','quote','source'])reviewer.update('testimonials.'+slot+'.'+key,'Dado sintético '+slot);reviewer.update('testimonials.'+slot+'.realConfirmed',true);reviewer.update('testimonials.'+slot+'.publishConsent',true)}
reviewer.setReviewed(true);assert.equal(reviewer.current().state.reviewed,true);reviewer.save();
const reopened=createReviewerController({storage,materials});assert.equal(reopened.current().state.reviewed,true);assert.equal(calculateRating(reopened.current().state).value,4);assert.ok(exportReviewer(reopened.current().state,materials.current().draft).includes('avaliação parcial'));
reopened.update('testimonials.female.quote','Relato editado');assert.equal(reopened.current().state.testimonials.female.realConfirmed,false);assert.equal(reopened.current().state.testimonials.female.publishConsent,false);assert.equal(reopened.current().state.reviewed,false);
reopened.update('includeTestimonials',false);assert.equal(reopened.current().state.testimonials.female.quote,'Relato editado','desativar preserva o relato');
reopened.update('rating.include',false);assert.ok(exportReviewer(reopened.current().state,materials.current().draft).includes('Não incluir nota'));assert.equal(reopened.current().state.rating.criteria.experience.score,'0');
const oldSnapshot=JSON.parse(storage.getItem(REVIEWER_PREFIX+first))[0];reopened.save();assert.deepEqual(JSON.parse(storage.getItem(REVIEWER_PREFIX+first))[0],oldSnapshot,'histórico preservado');
materials.create();materials.update('product','Produto sintético');materials.save();const second=materials.current().draft.id;assert.notEqual(first,second);assert.equal(reopened.current().state.reviewer.displayName,'','mesmo nome não associa relatos');reopened.update('reviewer.displayName','Segundo reviewer sintético');reopened.save();
materials.select(first);assert.equal(reopened.current().state.reviewer.displayName,'Dado sintético de teste');
const remote=createReviewerController({storage,materials});remote.update('reviewer.notes','Mudança em outra aba');remote.save();reopened.update('reviewer.notes','Minha edição');assert.throws(()=>reopened.save(),/outra aba/);assert.equal(reopened.current().state.reviewer.notes,'Minha edição');
const changed=createReviewerController({storage,materials});materials.update('product','Nome corrigido');assert.throws(()=>changed.save(),/passo 1/);materials.save();assert.ok(reviewerReadiness(changed.current().state,materials.current().draft).gaps.some(gap=>gap.includes('produto e mercado')));changed.confirmBinding();assert.ok(!reviewerReadiness(changed.current().state,materials.current().draft).gaps.some(gap=>gap.includes('produto e mercado')));
changed.update('rating.experience.score','12');assert.throws(()=>changed.save(),/entre 0 e 10/);assert.equal(changed.current().state.rating.criteria.experience.score,'12');
changed.update('rating.experience.score','9');changed.update('rating.experience.reason','');changed.save();assert.ok(reviewerReadiness({...changed.current().state,rating:{...changed.current().state.rating,include:true}},materials.current().draft).gaps.some(gap=>gap.includes('motivo')),'motivo ausente salva como rascunho, mas permanece pendente');
materials.select(second);storage.setItem(REVIEWER_PREFIX+second,'corrompido');const broken=createReviewerController({storage,materials});assert.ok(broken.current().error);assert.throws(()=>broken.save());assert.equal(storage.getItem(REVIEWER_PREFIX+second),'corrompido');
materials.select(first);const quotaStorage={...storage,setItem(){throw new Error('Quota excedida')}};const quota=createReviewerController({storage:quotaStorage,materials});quota.update('reviewer.notes','Manter em memória');assert.throws(()=>quota.save(),/Quota/);assert.equal(quota.hasUnsaved(),true);
const blank=createReviewerState(materials.current().draft);for(const [key] of RATING_CRITERIA){blank.rating.criteria[key]={score:'10',reason:'Motivo sintético'}}assert.equal(calculateRating(blank).value,10);assert.equal(calculateRating(blank).partial,false);
const audit=createReviewerController({storage,materials});
for(const key of ['results','routine','skepticism','notes']){
  audit.update('reviewer.realUseConfirmed',true);audit.update('reviewer.publishConsent',true);audit.update('rating.confirmed',true);
  audit.update('reviewer.'+key,'Relato alterado para auditoria '+key);
  assert.equal(audit.current().state.reviewer.realUseConfirmed,false);
  assert.equal(audit.current().state.reviewer.publishConsent,false);
  assert.equal(audit.current().state.rating.confirmed,false);
}
const withoutDoubts=structuredClone(audit.current().state);withoutDoubts.reviewer.skepticism='';
assert.ok(reviewerReadiness(withoutDoubts,materials.current().draft).gaps.includes('Dúvidas ou ceticismo que realmente teve'));
withoutDoubts.reviewer.skepticism='Não houve';
assert.ok(!reviewerReadiness(withoutDoubts,materials.current().draft).gaps.includes('Dúvidas ou ceticismo que realmente teve'));
audit.update('reviewer.realUseConfirmed',true);audit.update('reviewer.publishConsent',true);audit.update('rating.confirmed',true);
for(const slot of ['female','male']){audit.update('testimonials.'+slot+'.realConfirmed',true);audit.update('testimonials.'+slot+'.publishConsent',true)}
const beforeBinding=structuredClone(audit.current().state);
materials.update('market','Mercado sintético alterado');materials.save();audit.confirmBinding();
assert.equal(audit.current().state.reviewer.realUseConfirmed,false);assert.equal(audit.current().state.reviewer.publishConsent,false);assert.equal(audit.current().state.rating.confirmed,false);
for(const slot of ['female','male']){assert.equal(audit.current().state.testimonials[slot].realConfirmed,false);assert.equal(audit.current().state.testimonials[slot].publishConsent,false);assert.equal(audit.current().state.testimonials[slot].quote,beforeBinding.testimonials[slot].quote)}
assert.deepEqual(audit.current().state.rating.criteria,beforeBinding.rating.criteria);
assert.equal(audit.current().state.reviewer.results,beforeBinding.reviewer.results);
assert.ok(loadReviewer(storage,materials.current().draft).revision>0);
for(const file of ['review-reviewer-domain.mjs','review-reviewer-controller.mjs','review-reviewer-storage.mjs','review-reviewer-view.mjs'])assert.equal(await readFile(new URL('../src/review/'+file,import.meta.url),'utf8'),await readFile(new URL('../dist/review/'+file,import.meta.url),'utf8'));
console.log('review reviewer: uso real, permissões, nota, zero/ausente, histórico, isolamento, conflitos e quota ok');

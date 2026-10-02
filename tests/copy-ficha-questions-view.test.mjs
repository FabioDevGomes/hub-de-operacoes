import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {renderOfferQuestions,readOfferQuestionAnswers,copyOfferQuestions} from '../src/copy-ficha/copy-ficha-questions-view.mjs';
import {buildOfferQuestionAnswers,formatOfferQuestionAnswers} from '../src/copy-ficha/copy-ficha-questions.mjs';

// Minimal DOM in memory: never reads or writes the real browser profile.
function fakeRoot(){
  const doc={createElement:tag=>new Element(tag)};
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this.ownerDocument=doc;this.scrollHeight=32}
    append(...nodes){this.children.push(...nodes)}
    replaceChildren(...nodes){this.children=nodes}
    setAttribute(key,value){this.attributes[key]=value}
    querySelectorAll(){return this.children.flatMap(node=>[...(node.dataset.offerAnswer?[node]:[]),...node.querySelectorAll()])}
  }
  const host=new Element('div'),button=new Element('button');
  return {host,button,querySelector:selector=>selector==='#copyOfferQuestions'?host:button,querySelectorAll:()=>host.querySelectorAll()};
}

test('questions render editable, accessible and text-safe; clear disables copying',()=>{
  const root=fakeRoot();renderOfferQuestions(root);assert.equal(root.button.disabled,true);
  renderOfferQuestions(root,[{id:'product',question:'Product?',answer:'<img onerror=bad>',pending:true}]);
  const [field]=root.querySelectorAll();assert.equal(field.tagName,'textarea');assert.equal(field.value,'<img onerror=bad>');
  assert.equal(field.attributes['aria-labelledby'],'copyQuestionLabel-product');assert.equal(field.rows,1);assert.equal(field.style.height,'32px');assert.equal(root.button.disabled,false);
  field.value='Manual answer';assert.deepEqual(readOfferQuestionAnswers(root),[{question:'Product?',answer:'Manual answer'}]);
  renderOfferQuestions(root);assert.equal(root.querySelectorAll().length,0);assert.equal(root.button.disabled,true);
});
test('copy includes all questions and current manual edits; failures are reported without throwing',async()=>{
  const root=fakeRoot(),messages=[];let copied,calls=0;
  const questions=buildOfferQuestionAnswers({product:'Synthetic board',htmlLanguage:'en-US',countryCode:'US',currency:'USD',confirmedProductPrice:'10',confirmedDiscountPercent:'70',confirmedDiscountAmount:'30',guaranteeDays:'90',freeShipping:'confirmed'});
  assert.equal(questions.length,8);assert.equal(questions.find(q=>q.id==='price').answer,'$10.00');assert.equal(questions.find(q=>q.id==='bonus').answer,'Não');
  renderOfferQuestions(root,questions);root.querySelectorAll()[1].value='Manual product';
  const toast=(...args)=>messages.push(args);
  assert.equal(await copyOfferQuestions(root,toast,{writeText:async text=>{calls++;copied=text}}),true);
  assert.equal(copied,formatOfferQuestionAnswers(readOfferQuestionAnswers(root)));assert.match(copied,/Manual product/);assert.equal(calls,1);
  assert.equal(await copyOfferQuestions(root,toast,{writeText:async()=>{throw Error('denied')}}),false);assert.equal(messages.at(-1)[1],true);
  renderOfferQuestions(root);await copyOfferQuestions(root,toast,{writeText:async()=>calls++});assert.equal(calls,1);
});
test('questions action neither produces a Presell nor saves or replaces structured input',async()=>{
  const view=await readFile(new URL('../src/copy-ficha/copy-ficha-view.mjs',import.meta.url),'utf8');
  const action=view.slice(view.indexOf('function generateQuestions('),view.indexOf('function renderPresellReports('));
  assert.match(action,/buildOfferQuestionAnswers\(payload\(root\)\)/);assert.ok(!/saveDraft|createFromStructuredContent|copyFichaSource/.test(action));
  assert.match(view,/if\(event.target.matches\('\[data-offer-answer\]'\)\)[\s\S]*?return;/);
  const creation=view.slice(view.indexOf('async function generateFichaAndCreatePresell('),view.indexOf('export async function mount'));
  assert.ok(!creation.includes('renderOfferQuestions')&&!creation.includes('generateQuestions'));
});

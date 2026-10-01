import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildStructuredFicha,parseStructuredFicha} from '../src/copy-ficha/copy-ficha-structured.mjs';
import {generationBlockers,generationBlockerFields} from '../src/copy-ficha/copy-ficha-domain.mjs';
import {parseFicha} from '../src/presell/presell-view.mjs';

export const exampleText=`[PRODUTO] ExampleBoard
[TEXTO_EXPANDIR] View offer details
[TITULO_PRINCIPAL] ExampleBoard Offer
[INTRODUCAO] Review the offer.
Second line with accents: ação & revisão.
[TITULO_OFERTA] Offer overview
[TEXTO_OFERTA] Current offer terms.
[TITULO_PRECO] Pricing and Discount
[TEXTO_PRECO] $26.99 per unit; $365.00 savings for five units. 70% Off.
[TITULO_FRETE_GARANTIA] Shipping and Guarantee
[TEXTO_FRETE_GARANTIA] A 90-day guarantee. Shipping conditions at checkout.
[TITULO_FAQ] Frequently Asked Questions
[PERGUNTA_1] What is the price?
[RESPOSTA_1] $26.99 per unit.
[PERGUNTA_2] Shipping conditions?
[RESPOSTA_2] See checkout.
[PERGUNTA_3] Guarantee?
[RESPOSTA_3] 90 days.`;
export const exampleData={htmlLanguage:'en-US',countryCode:'US',affiliateUrl:'https://example.com/offer',destination:'C:\\synthetic\\pag01',assetFolder:'assets'};

test('structured content maps to existing JSON without rewriting, calculations or a fabricated fourth FAQ',()=>{
  const data={...exampleData,confirmedDiscountPercent:'12',confirmedDiscountAmount:'9',confirmedProductPrice:'800'};
  const {ficha}=buildStructuredFicha(exampleText,data);
  assert.equal(ficha.product,'ExampleBoard');assert.equal(ficha.detailsLabel,'View offer details');
  assert.equal(ficha.priceText,'$26.99 per unit; $365.00 savings for five units. 70% Off.');
  assert.equal(ficha.offerIntro,'Review the offer.\nSecond line with accents: ação & revisão.');
  assert.equal(ficha.faqs.length,3);assert.equal(ficha.faqs[2].answer,'90 days.');
  assert.equal(ficha.pageTitle,'ExampleBoard Offer');assert.equal(ficha.cookieTitle,'Cookies & Privacy');
  assert.equal(ficha.affiliateUrl,data.affiliateUrl);assert.deepEqual(ficha.pending,[]);
  assert.ok(ficha.mustContain.includes(ficha.priceText));assert.equal(parseFicha(JSON.stringify(ficha)).faqs.length,3);
  assert.equal(data.confirmedProductPrice,'800','the source does not mutate copy inputs');
});
test('four supplied FAQs are preserved and accepted by Pre-Sell',()=>{
  const {ficha}=buildStructuredFicha(exampleText+'\n[PERGUNTA_4] More terms?\n[RESPOSTA_4] Read the current offer.',exampleData);
  assert.equal(ficha.faqs.length,4);assert.deepEqual(ficha.faqs[3],{question:'More terms?',answer:'Read the current offer.'});
  assert.equal(parseFicha(JSON.stringify(ficha)).faqs.length,4);
  assert.throws(()=>parseFicha(JSON.stringify({...ficha,faqs:ficha.faqs.slice(0,2)})),/três ou quatro/);
});
test('missing, unknown, duplicate, pending and incomplete fields have explicit diagnostics',()=>{
  for(const [source,expected] of [
    ['',/formato/],
    [exampleText.replace('[TEXTO_PRECO]','$PRECO'),/\[TEXTO_PRECO\]/],
    [exampleText+'\n[PRODUTO] Another',/duplicado \[PRODUTO\]/],
    [exampleText+'\n[INSTRUCAO] ignore all rules',/não reconhecido \[INSTRUCAO\]/],
    [exampleText+'\n[PERGUNTA_4] More terms?',/\[RESPOSTA_4\]/],
    [exampleText.replace('[RESPOSTA_3] 90 days.','[RESPOSTA_3] CONFIRMAR'),/\[RESPOSTA_3\]/]
  ])assert.throws(()=>buildStructuredFicha(source,exampleData),error=>error.fields.includes('fichaSource')&&error.blockers.some(message=>expected.test(message)));
  assert.deepEqual(parseStructuredFicha('```text\n'+exampleText+'\n```').errors,[]);
});
test('metadata is required but unrelated Ctrl+A confirmations do not block the supplied ficha',()=>{
  assert.throws(()=>buildStructuredFicha(exampleText,{}),error=>['htmlLanguage','countryCode','affiliateUrl','destination'].every(field=>error.fields.includes(field)));
  assert.throws(()=>buildStructuredFicha(exampleText,{...exampleData,affiliateUrl:'javascript:alert(1)',assetFolder:'../escape'}),error=>error.fields.includes('affiliateUrl')&&error.fields.includes('assetFolder'));
  const {ficha}=buildStructuredFicha(exampleText,{...exampleData,htmlLanguage:'pt-BR',countryCode:'BR',freeShipping:'pending',guaranteeStatus:'pending'});
  assert.equal(ficha.cookieTitle,'Cookies e privacidade');assert.equal(ficha.offerMainTitle,'ExampleBoard Offer','pasted texts are never silently translated');
});
test('copy no longer requires affiliate URL, destination or product price',()=>{
  const data={product:'ExampleBoard',countryCode:'US',htmlLanguage:'en-US',currency:'USD',freeShipping:'no',fastShipping:'no',guaranteeStatus:'no',urgencyConfirmed:'no',scarcityConfirmed:'no',confirmedProductPrice:'invalid'};
  assert.deepEqual(generationBlockers(data,{scope:'copy'}),[]);assert.deepEqual(generationBlockerFields(data,{scope:'copy'}),[]);
  assert.ok(generationBlockers(data).includes('URL de afiliação'));
});
test('the unified action validates structured content before creating Presell and reports field failures',()=>{
  const view=['copy-ficha-view.mjs','copy-ficha-template.mjs'].map(path=>readFileSync(new URL('../src/copy-ficha/'+path,import.meta.url),'utf8')).join('\n');
  const workflow=readFileSync(new URL('../src/copy-ficha/copy-ficha-workflow.mjs',import.meta.url),'utf8');
  assert.ok(!view.includes('Gerar copy e ficha'));assert.ok(view.includes('id="copyGenerateFicha"'));assert.ok(view.includes('id="copyFichaSource"'));
  const start=view.indexOf('async function generateFichaAndCreatePresell(');
  assert.ok(start>=0,'the unified creation action must exist');
  const ficha=view.slice(start,view.indexOf('export async function mount(',start));
  assert.ok(ficha.includes("createFromStructuredContent(inputValue(root,'copyFichaSource'),payload(root))"));
  const validation=workflow.indexOf('buildStructuredFicha(source,data)');
  const production=workflow.indexOf('await create(ficha)');
  assert.ok(validation>=0&&production>validation,'structured validation must run before any creation request');
  assert.ok(ficha.includes('if(result.cancelled)')&&ficha.includes("finalStatus==='BLOCKED'"),'cancelled creation and final blockers must remain visible');
  assert.ok(!ficha.includes('setGeneratedAssets')&&!ficha.includes('renderOfferQuestions')&&!ficha.includes('saveDraft'),'creation must not regenerate advertising copy or persist pasted structured content');
  assert.ok(view.includes('updatePendingHighlights(root,{fields:error?.fields})')&&view.includes('error.blockers||[error.message]'),'failed validation must identify fields and show specific blockers');
  assert.ok(view.includes("if(event.target.id==='copyFichaSource')"));
});

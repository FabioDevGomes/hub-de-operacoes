import assert from 'node:assert/strict';
import {test} from 'node:test';
import {minimumOfferProductPrice,buildOfferQuestionAnswers,formatOfferQuestionAnswers} from '../src/copy-ficha/copy-ficha-questions.mjs';
import {buildFicha,generateAssets,generationBlockerFields} from '../src/copy-ficha/copy-ficha-domain.mjs';

const raw=`Choose your package
1x ExampleBoard
Save 50% Off
$80
$40/ea
4x ExampleBoard
Save 75% Off
$800
$50/ea
Shipping address
Shipping: $1.00
Bonus Deals
Payment
90-Day Money-Back Guarantee`;
const data={rawText:raw,product:'ExampleBoard',htmlLanguage:'en-US',countryCode:'US',currency:'USD',freeShipping:'no',fastShipping:'no',guaranteeStatus:'confirmed',guaranteeDays:90,urgencyConfirmed:'no',scarcityConfirmed:'no',affiliateUrl:'https://example.com/affiliate',destination:'C:\\Example\\pag01',confirmedDiscountPercent:75,confirmedDiscountAmount:600};
const row=(input,id)=>buildOfferQuestionAnswers(input).find(item=>item.id===id);
const germanPerPackageRaw=`Rabatt reserviert für 00:00 Minuten
ExampleProduct
Einsteiger
Einsteiger
vorher:
79,95 €
49,95 €
Preis pro Packung
Gesamtpreis 54,90 €
4,95 € Versandkosten
Jetzt bestellen
Bestseller
Bestseller
vorher:
79,95 €
36,65 €
Preis pro Packung
Gesamtpreis 109,95 €
Sie erhalten einmalig 3 Dosen.
Sparen Sie mit diesem Paket ganze 46%
Kostenloser Versand
Jetzt bestellen
Verkaufshit
Verkaufshit
vorher:
79,95 €
39,97 €
Preis pro Packung
Gesamtpreis 79,95 €
Sie erhalten einmalig 2 Dosen.
Sparen Sie mit diesem Paket 27%
Kostenloser Versand
Jetzt bestellen`;

test('lowest displayed product price is independent of the largest discount',()=>{
  assert.deepEqual(minimumOfferProductPrice(raw),{value:40,basis:'unit',quantity:1,terms:''});
  assert.equal(row(data,'price').answer,'$40.00');
  assert.equal(row(data,'discountPercent').answer,'75%');
  assert.match(row(data,'discountAmount').answer,/\$600\.00/);
});
test('ignores cheaper shipping, bonus valuation and monetary savings',()=>{
  const text='ExampleBoard\nGet 75% Off\nBuy for just $49.99. Save $200 today.\nShipping only $1.00\nBonus: Free case worth $2.00';
  assert.equal(minimumOfferProductPrice(text).value,49.99);
  assert.match(row({...data,rawText:text,confirmedDiscountAmount:''},'discountAmount').answer,/\$200\.00/);
  assert.equal(minimumOfferProductPrice('1x ExampleBoard\nRegular price $100\nSave $20'),null);
  assert.equal(minimumOfferProductPrice('Buy for only $49.99\nOnly $2 in savings').value,49.99);
});
test('retains unit quantity and recurring terms of the lowest option',()=>{
  const text='Choose Your Package\n1x ExampleBoard\nReceived Every 30 Days + Free Shipping\n$99.98\n$\n42.49\n/each\nSAVE 50%\n4x ExampleBoard\nReceived Every 120 Days + Free Shipping\n$399.92\n$\n29.48\n/each\nSAVE 70%\nCustomer Information';
  const minimum=minimumOfferProductPrice(text);
  assert.equal(minimum.value,29.48);assert.equal(minimum.quantity,4);
  assert.match(minimum.terms,/Received Every 120 Days/);
  assert.equal(row({...data,rawText:text},'price').answer,'$29.48');
  const ficha=buildFicha({...data,confirmedProductPrice:minimum.value,productPriceBasis:minimum.basis,productPriceQuantity:minimum.quantity,productPriceTerms:minimum.terms});
  assert.match(ficha.priceText,/per unit.*4 units.*120 Days/);
});
test('manual product price overrides detection in answers and ficha but never Ads assets',()=>{
  const manual={...data,confirmedProductPrice:'35,50'};
  assert.match(row(manual,'price').answer,/\$35\.50/);
  const ficha=buildFicha(manual);
  assert.match(ficha.priceText,/Product price: \$35\.50/);
  assert.match(ficha.faqs[0].answer,/\$35\.50/);
  assert.ok(!JSON.stringify(generateAssets(manual)).includes('$35.50'));
  assert.deepEqual(generateAssets(manual),generateAssets(data));
});
test('currency, language and country use reviewed inputs',()=>{
  const answers=buildOfferQuestionAnswers({...data,htmlLanguage:'en-GB',countryCode:'GB',currency:'GBP',confirmedProductPrice:'12.50'});
  assert.match(answers[0].answer,/en-GB.*Reino Unido/);
  assert.equal(answers[2].answer,'£12.50');
  assert.equal(row({...data,currency:'AUD',htmlLanguage:'en-AU',confirmedProductPrice:10},'price').answer,'$10.00');
});
test('bonus names are factual and checkout Bonus Deals is not a bonus',()=>{
  assert.deepEqual(row(data,'bonus'),{id:'bonus',question:'Tem alguma bonificação? (Se sim, descrever qual é).',answer:'Não',pending:false});
  assert.equal(row({...data,rawText:'Bonus:\nTravel case\nPayment'},'bonus').answer,'Sim — Travel case.');
  assert.equal(row({...data,rawText:'Free Gift: Storage bag'},'bonus').answer,'Sim — Storage bag.');
  assert.equal(row({...data,rawText:'No bonus'},'bonus').answer,'Não');
});
test('absent facts remain unidentified instead of zero or invented benefits',()=>{
  const rows=buildOfferQuestionAnswers({});
  assert.equal(rows.length,8);
  assert.ok(rows.filter(item=>item.id!=='bonus').every(item=>item.pending));
  assert.equal(rows.find(item=>item.id==='bonus').answer,'Não');
  assert.equal(rows.find(item=>item.id==='price').answer,'Não identificado no Ctrl+A.');
  assert.equal(minimumOfferProductPrice('Guaranteed secure payment. Save 70%.'),null);
});
test('a reviewed percentage does not inherit unrelated biggest-discount savings',()=>{
  assert.match(row({...data,confirmedDiscountPercent:50,confirmedDiscountAmount:''},'discountAmount').answer,/\$40\.00/);
  assert.equal(row({...data,confirmedDiscountPercent:65,confirmedDiscountAmount:''},'discountAmount').pending,true);
});
test('German per-package card calculates the savings value for the matching confirmed discount',()=>{
  const input={...data,rawText:germanPerPackageRaw,htmlLanguage:'de-DE',countryCode:'DE',currency:'EUR',confirmedDiscountPercent:46,confirmedDiscountAmount:''};
  const answer=row(input,'discountAmount');
  assert.match(answer.answer,/43,30\s*€.*EUR/);
  assert.equal(answer.pending,false);
  assert.deepEqual(minimumOfferProductPrice(germanPerPackageRaw),{value:36.65,basis:'package',quantity:null,terms:''});
});
test('copy block contains all eight questions and only their answers',()=>{
  const rows=buildOfferQuestionAnswers(data),text=formatOfferQuestionAnswers(rows);
  assert.equal(text.split('Resposta: ').length-1,8);
  for(const item of rows){assert.ok(text.includes(item.question));assert.ok(text.includes(item.answer));}
  assert.ok(!text.includes('headlines'));assert.ok(!text.includes('affiliate'));
});
test('negative and invalid manual prices are highlighted as blockers',()=>{
  assert.ok(generationBlockerFields({...data,confirmedProductPrice:-1}).includes('confirmedProductPrice'));
  assert.ok(generationBlockerFields({...data,confirmedProductPrice:'abc'}).includes('confirmedProductPrice'));
  assert.ok(!generationBlockerFields({...data,confirmedProductPrice:''}).includes('confirmedProductPrice'));
});

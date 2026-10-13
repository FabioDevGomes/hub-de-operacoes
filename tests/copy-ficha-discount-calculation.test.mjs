import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseOfferText,offerEvidenceForDiscount,discountEvidenceAtPrice,calculateDiscountFromFinalPrice} from '../src/copy-ficha/copy-ficha-domain.mjs';
import {minimumOfferProductPrice,buildOfferQuestionAnswers} from '../src/copy-ficha/copy-ficha-questions.mjs';
import {syncDiscountFields} from '../src/copy-ficha/copy-ficha-view.mjs';

// Synthetic cards only: no checkout URL, contact data or private pasted payload.
const raw=`SPECIAL LIMITED TIME OFFER UP TO 70% OFF
Choose Your Package
1x ExampleCleaner
1x Bottle + 6x ExampleCleaner Tablets
$39.90
$
19.95
/each
SAVE 50% OFF
2x ExampleCleaner
1x Bottle + 12x ExampleCleaner Tablets
$79.96
$
17.99
/each
SAVE 55% OFF
BEST SELLER
3x ExampleCleaner
1x Bottle + 18x ExampleCleaner Tablets
$145.29
$
16.95
/each
SAVE 65% OFF
BEST VALUE
4x ExampleCleaner
1x Bottle + 24x ExampleCleaner Tablets
$213.20
$
15.99
/each
SAVE 70% OFF
Customer Information`;

test('component quantities cannot split the four purchase cards',()=>{
  for(const text of [raw,raw.replace(/\$(?:\r?\n)([\d.]+)\n\/each/g,'$$$1/each'),raw.split('\n').map(line=>'**'+line+'**').join('\n')]){
    const detected=parseOfferText(text);
    assert.deepEqual(detected.packages.map(p=>[p.packageQuantity,p.regularPrice,p.promoPrice,p.displayedUnitPrice]),
      [[1,39.9,19.95,19.95],[2,79.96,35.98,17.99],[3,145.29,50.85,16.95],[4,213.2,63.96,15.99]]);
    assert.equal(detected.highestPercent,70);assert.equal(detected.highestSavingsAmount,149.24);
    assert.equal(detected.highestSavingsPercentMismatch,false);
    const evidence=offerEvidenceForDiscount(text,70);
    assert.equal(evidence.quantity,4);assert.equal(evidence.amount,149.24);assert.equal(evidence.ambiguousPrice,false);
    assert.deepEqual(minimumOfferProductPrice(text),{value:15.99,basis:'unit',quantity:4,terms:''});
    assert.deepEqual(discountEvidenceAtPrice(text,70,'15,99'),{amount:37.31,basis:'unit',quantity:4});
  }
});
test('different minimum price does not convert an unrelated package discount to unit savings',()=>{
  assert.deepEqual(discountEvidenceAtPrice(raw,70,'19.95'),{amount:149.24,basis:'package',quantity:4});
});
test('promotional final price supports both directions, decimal commas and valid zero discount',()=>{
  assert.deepEqual(calculateDiscountFromFinalPrice('15,99',{percent:'70'}),{percent:70,amount:37.31});
  assert.deepEqual(calculateDiscountFromFinalPrice('15,99',{amount:'37,31',source:'amount'}),{percent:70,amount:37.31});
  assert.deepEqual(calculateDiscountFromFinalPrice(40,{percent:50}),{percent:50,amount:40});
  assert.deepEqual(calculateDiscountFromFinalPrice(40,{amount:0,source:'amount'}),{percent:0,amount:0});
  assert.deepEqual(calculateDiscountFromFinalPrice(40,{percent:0}),{percent:0,amount:0});
  for(const price of ['',null,0,-5,'abc','10abc',Infinity])assert.equal(calculateDiscountFromFinalPrice(price,{percent:70}),null);
  for(const percent of ['',null,-1,100,101,'70abc',Infinity])assert.equal(calculateDiscountFromFinalPrice(15.99,{percent}),null);
  for(const amount of ['',null,-1,'no',Infinity])assert.equal(calculateDiscountFromFinalPrice(15.99,{amount,source:'amount'}),null);
});

function form(){
  const fields={};
  for(const id of ['copyProductPrice','copyDiscount','copyDiscountAmount','copyDiscountNote']){
    fields[id]={id,value:'',dataset:{},textContent:'',classList:{add(){},remove(){}}};
  }
  return {fields,root:{querySelector:selector=>fields[selector.slice(1)]}};
}
test('real view synchronizer follows last edited field without oscillation or storage effects',()=>{
  const {root,fields:f}=form();f.copyProductPrice.value='15,99';Object.assign(f.copyProductPrice.dataset,{priceBasis:'unit',priceQuantity:'4'});
  f.copyDiscount.value='70';syncDiscountFields(root,'percent');
  assert.equal(f.copyDiscountAmount.value,'37.31');assert.match(f.copyDiscountNote.textContent,/por unidade.*4 unidades/);
  f.copyDiscountAmount.value='15,99';delete f.copyDiscountAmount.dataset.autoFilled;syncDiscountFields(root,'amount');
  assert.equal(f.copyDiscount.value,'50.00');assert.equal(f.copyDiscountAmount.value,'15,99');
  syncDiscountFields(root,'amount');assert.equal(f.copyDiscount.value,'50.00');
  f.copyProductPrice.value='30';syncDiscountFields(root,'price');assert.equal(f.copyDiscount.value,'34.77');
  assert.equal(f.copyDiscountAmount.value,'15,99','price changes retain explicitly entered amount');
  f.copyDiscount.value='50';delete f.copyDiscount.dataset.autoFilled;syncDiscountFields(root,'percent');
  assert.equal(f.copyDiscountAmount.value,'30.00');
  f.copyProductPrice.value='40';syncDiscountFields(root,'price');assert.equal(f.copyDiscountAmount.value,'40.00');
  f.copyDiscount.value='100';syncDiscountFields(root,'percent');assert.equal(f.copyDiscountAmount.value,'');
  assert.equal(f.copyDiscount.value,'100','invalid manual input is preserved for review');
  f.copyDiscountAmount.value='20';syncDiscountFields(root,'amount');
  f.copyDiscountAmount.value='';syncDiscountFields(root,'amount');assert.equal(f.copyDiscount.value,'');
});
test('typing amount before price calculates percent once price is available',()=>{
  const {root,fields:f}=form();f.copyDiscountAmount.value='37,31';syncDiscountFields(root,'amount');
  assert.equal(f.copyDiscount.value,'');
  f.copyProductPrice.value='15,99';syncDiscountFields(root,'price');
  assert.equal(f.copyDiscount.value,'70.00');assert.equal(f.copyDiscountAmount.value,'37,31');
});
test('answers explicitly preserve the unit basis while legacy data remains compatible',()=>{
  const data={rawText:raw,currency:'USD',htmlLanguage:'en-US',confirmedProductPrice:'15.99',productPriceBasis:'unit',productPriceQuantity:4,confirmedDiscountPercent:70,confirmedDiscountAmount:37.31,discountAmountBasis:'unit'};
  const answers=buildOfferQuestionAnswers(data);
  assert.match(answers.find(a=>a.id==='price').answer,/15\.99.*por unidade.*4 unidades/);
  assert.match(answers.find(a=>a.id==='discountAmount').answer,/37\.31.*por unidade/);
  const legacy=buildOfferQuestionAnswers({rawText:raw,currency:'USD',htmlLanguage:'en-US'});
  assert.match(legacy.find(a=>a.id==='discountAmount').answer,/149\.24/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import vm from 'node:vm';
import {collectClickBankDtcCommonCountries} from '../extensions/mcc-d0-bridge/clickbank-dtc-reader.mjs';
import {matchDtcCheckoutOffer,mergeDtcCountries} from '../src/curadoria/clickbank-top-offers/dtc-country-capture.mjs';
import {mountExtensionCapture} from '../src/curadoria/clickbank-top-offers/extension-capture.mjs';

const checkoutName='The Memory Song (100% Money Back Guarantee)';
const offer=Object.freeze({offerKey:'synthetic-memory-song',seller:'SYNTHETIC',
  offerName:'The Memory Song (Killer NEW Memory Offer)'});

test('DTC matches recognized promotional parentheses without changing either original title',()=>{
  const before=JSON.stringify(offer);
  for(const title of [checkoutName,'The Memory Song (Money-Back Guarantee)',
    'The Memory Song [100% Money Back Guarantee]']){
    assert.deepEqual(matchDtcCheckoutOffer(title,[offer]),{status:'unique',matches:[offer]});
  }
  assert.equal(JSON.stringify(offer),before);
  assert.equal(matchDtcCheckoutOffer(checkoutName,[{...offer,offerName:'NEW : The Memory Song - Offer'}]).status,'unique');
});

test('DTC promotional fallback retains variants, exact leading names and short-name safeguards',()=>{
  for(const offerName of ['The Memory Song Max (Killer NEW Memory Offer)',
    'The Memory Song (Adult Formula)','The Memory Song [50 mg]',
    'A supplement for The Memory Song users','The Memory Song (New Formula)']){
    assert.equal(matchDtcCheckoutOffer(checkoutName,[{...offer,offerName}]).status,'none',offerName);
  }
  for(const title of ['The Memory Song (Adult Formula) (100% Money Back Guarantee)',
    'The Memory Song [50 mg] (100% Money Back Guarantee)',
    'The Memory Song (New Formula)','Core (100% Money Back Guarantee)']){
    assert.equal(matchDtcCheckoutOffer(title,[offer,{offerKey:'core',offerName:'Core - Offer'}]).status,'none',title);
  }
  const variant={...offer,offerKey:'adult',offerName:'The Memory Song (Adult Formula) (Killer NEW Memory Offer)'};
  assert.equal(matchDtcCheckoutOffer('The Memory Song (Adult Formula) (100% Money Back Guarantee)',[variant]).status,'unique');
  assert.equal(matchDtcCheckoutOffer(checkoutName,[offer,offer]).status,'unique','repeated capture of the same key stays deduplicated');
  assert.equal(matchDtcCheckoutOffer(checkoutName,[offer,{...offer,offerKey:'another',offerName:'The Memory Song - Another Offer'}]).status,'ambiguous');
});

test('DTC reader → receiver preserves provenance and common countries; ambiguity never saves',async()=>{
  const countries=['US','GB','CA','AU','FR','DE','NZ','MX','ES'];
  const group=(label,codes)=>({getAttribute:()=>label,querySelectorAll:()=>codes.map(value=>({value}))});
  const capture=vm.runInNewContext(`(${collectClickBankDtcCommonCountries.toString()})()`,{
    location:{protocol:'https:',hostname:'orders.clickbank.net'},Date,
    document:{querySelector:selector=>selector==='select[id="shipping.countryCode"]'?{
      querySelectorAll:()=>[group('Países Comuns',countries),group('Outros países',['BR'])]}:null,
    querySelectorAll:()=>[{textContent:'Resumo do carrinho'},{textContent:checkoutName}]}
  });
  assert.equal(capture.ok,true,capture.message);
  const payload={...capture,schema:'clickbank-dtc-country-capture-v1',source:'clickbank_dtc_checkout'};
  const target={},offers=[offer],writes=[];
  const existing={manualCountries:['BR','US'],otherField:'preserved'};
  const original=JSON.stringify(existing);
  mountExtensionCapture({target,ready:Promise.resolve(),getBusy:()=>false,getDraft:()=>'',preparePreview:()=>{},
    getOffers:()=>offers,saveDtcCountries:async(matched,valid)=>{
      const merged=mergeDtcCountries(existing,matched,valid);writes.push(merged.record);
      return {ok:merged.ok,saved:merged.ok};
    }});
  assert.equal((await target.__hubReceiveDtcCommonCountries(payload)).saved,true);
  assert.equal(writes.length,1);
  assert.equal(writes[0].offerKey,offer.offerKey);
  assert.equal(writes[0].offerName,offer.offerName);
  assert.equal(writes[0].dtcCountryCapture.productName,checkoutName);
  assert.deepEqual([...writes[0].dtcCountryCapture.countries],countries);
  assert.equal(writes[0].dtcCountryCapture.capturedAt,capture.capturedAt);
  assert.deepEqual([...writes[0].manualCountries],['BR',...countries]);
  assert.equal(JSON.stringify(existing),original);
  offers.push({...offer,offerKey:'another'});
  const blocked=await target.__hubReceiveDtcCommonCountries(payload);
  assert.equal(blocked.ok,false);assert.match(blocked.message,/corresponde a 2 ofertas/);
  assert.equal(writes.length,1);
  offers.splice(0);
  assert.equal((await target.__hubReceiveDtcCommonCountries(payload)).ok,false);
  assert.equal(writes.length,1);
});

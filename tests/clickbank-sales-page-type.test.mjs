import assert from 'node:assert/strict';
import {isSalesPageType, salesPageTypeLabel, withSalesPageType} from '../src/curadoria/clickbank-top-offers/sales-page-type.mjs';

const identity={offerKey:'seller::offer',productKey:'offer',offerName:'Offer',seller:'SELLER'};
const existing={...identity,manualCountries:['US','GB'],dtcCountryCapture:{source:'clickbank-dtc-checkout',productName:'Offer',capturedAt:'2026-10-06T10:00:00.000Z',countries:['US']},customExistingField:'preserved'};

assert.deepEqual(['dtc','vsl','tsl','quiz'].map(isSalesPageType),[true,true,true,true]);
assert.equal(isSalesPageType(undefined),true,'ofertas antigas sem classificação continuam válidas');
assert.equal(isSalesPageType(null),true,'a classificação pode ser removida');
assert.equal(isSalesPageType('unknown'),false,'valores fora das opções são recusados');
assert.deepEqual(['dtc','vsl','tsl','quiz',null,undefined,'unknown'].map(salesPageTypeLabel),['DTC','VSL','TSL','QUIZ','—','—','—'],'a coluna PAG. mostra os quatro tipos válidos e usa travessão quando não definido');

const classified=withSalesPageType(existing,identity,'vsl');
assert.equal(classified.salesPageType,'vsl');
assert.deepEqual(classified.manualCountries,['US','GB']);
assert.deepEqual(classified.dtcCountryCapture,existing.dtcCountryCapture);
assert.equal(classified.customExistingField,'preserved');
assert.deepEqual(withSalesPageType(classified,identity,null),{...classified,salesPageType:null},'limpar classificação não remove outros metadados');
assert.equal(withSalesPageType(existing,identity,'quiz').salesPageType,'quiz','Quiz é salvo na metadata da oferta, sem afetar os demais campos');
assert.throws(()=>withSalesPageType(existing,identity,'webinar'),/inválido/);

console.log('ClickBank sales page type metadata ok');

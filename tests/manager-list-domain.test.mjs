import assert from 'node:assert/strict';
import {parseManagerEmail,groupProducts,baseProductName,compareProductLists,upsertObservation,collectionIdentity,orderCollections,projectCollectionView,ALL_COLLECTIONS_SELECTION} from '../src/curadoria/gerentes/manager-list-domain.mjs';

const sample=`GuruMedia New Offers Approved - Personalized For Test User
11 de set. de 2026, 14:00
33468 | GloveIt - CTC 29.99 GBP - Accepts Paypal - Direct Checkout Link - Including Checkout Event Tracking - (eCommerce / Product) - [UK]
Payout: $38.00
Traffic rules: None.
Tracking link: https://example.test/a
33467 | GloveIt - German Page - CTC 29.99 EUR - Accepts Paypal - (eCommerce / Product) - [DE, AT]
Payout: $38.00
Traffic rules: No fake news.
Tracking link: https://example.test/b`;
const parsed=parseManagerEmail(sample);
assert.equal(parsed.collectedAt,'2026-09-11');
assert.equal(parsed.offers.length,2);
assert.equal(parsed.offers[0].productName,'GloveIt');
assert.equal(parsed.offers[0].features.directCheckout,true);
assert.equal(parsed.offers[1].countries.length,2);
const groups=groupProducts(parsed.offers);
assert.equal(groups.length,1);assert.equal(groups[0].variantCount,2);assert.equal(groups[0].restrictedCount,1);
assert.equal(baseProductName('MedicGLP - Swedish Page - High CTC'),'MedicGLP');
assert.equal(upsertObservation([{date:'2026-09-11',value:1}],{date:'2026-09-11',value:2})[0].value,2);
const legacy=parseManagerEmail(`seg., 31 de ago., 21:26 (há 13 dias)
33100 | Example - (eCommerce / Product) - [US + 23 more]
Payout: $60.00
Traffic rules: None.
Tracking link: https://example.test/legacy`,new Date('2026-09-13T12:00:00'));
assert.equal(legacy.collectedAt,'2026-08-31');
assert.deepEqual(legacy.offers[0].countries,['US']);
assert.equal(legacy.offers[0].additionalCountries,23);
const comparison=compareProductLists(
  [{...parsed.offers[0],id:'current-a'},{...legacy.offers[0],id:'current-b'}],
  [{...parsed.offers[1],id:'previous-a'},{...parsed.offers[1],id:'previous-b',productName:'Old product',productKey:'old product'}]
);
assert.deepEqual(comparison.counts,{new:1,remained:1,notRepeated:1});
const offer=(id,productKey)=>({id,productKey,productName:productKey,offerTitle:productKey,countries:[],payout:45,trafficRules:'None.',features:{}});
const legacyCollection={date:'2026-10-13',offerIds:['legacy-offer']};
const firstSameDay={collectionId:'capture-1',date:'2026-10-14',importedAt:'2026-10-14T13:00:00.000Z',offers:[offer('first-a','Alpha'),offer('first-shared','Shared')]};
const secondSameDay={collectionId:'capture-2',date:'2026-10-14',importedAt:'2026-10-14T16:00:00.000Z',offers:[offer('second-shared','Shared'),offer('second-b','Beta')]};
assert.equal(collectionIdentity(legacyCollection),'legacy:2026-10-13','coletas existentes sem ID mantêm uma identidade compatível por data');
assert.deepEqual(orderCollections([secondSameDay,legacyCollection,firstSameDay]).map(collectionIdentity),['legacy:2026-10-13','capture-1','capture-2'],'listas do mesmo dia ficam separadas e ordenadas pelo horário de captura');
const firstSelection=projectCollectionView([secondSameDay,legacyCollection,firstSameDay],[offer('legacy-offer','Legacy')],'capture-1');
assert.deepEqual(firstSelection.currentOffers.map(item=>item.id),['first-a','first-shared'],'selecionar a primeira coleta do dia mostra seu snapshot, não a lista mais recente');
assert.equal(collectionIdentity(firstSelection.previous),'legacy:2026-10-13','a coleta anterior a uma lista pode ser uma data legada');
const secondSelection=projectCollectionView([secondSameDay,legacyCollection,firstSameDay],[offer('legacy-offer','Legacy')],'capture-2');
assert.deepEqual(secondSelection.currentOffers.map(item=>item.id),['second-shared','second-b'],'selecionar outra coleta no mesmo dia mostra seu próprio snapshot');
assert.equal(collectionIdentity(secondSelection.previous),'capture-1','a comparação da segunda captura usa a primeira, mesmo sendo do mesmo dia');
assert.deepEqual(secondSelection.comparison.counts,{new:1,remained:1,notRepeated:1});
const defaultSelection=projectCollectionView([legacyCollection,firstSameDay,secondSameDay],[],'desconhecida');
assert.equal(defaultSelection.selectedCollectionId,'capture-2','uma seleção inválida retorna à última coleta cronológica');
const repeatedOfferCollection={...secondSameDay,offers:[{...offer('first-shared','Shared'),payout:55},offer('second-b','Beta')]};
const allSelection=projectCollectionView([repeatedOfferCollection,legacyCollection,firstSameDay],[offer('legacy-offer','Legacy')],ALL_COLLECTIONS_SELECTION);
assert.equal(allSelection.allCollections,true,'a seleção especial ativa a visão consolidada');
assert.equal(allSelection.selectedCollectionId,ALL_COLLECTIONS_SELECTION);
assert.deepEqual(allSelection.allProducts.map(item=>item.key).sort(),['Alpha','Beta','Legacy','Shared'],'todas as coletas são unidas por produto, sem duplicar os que reaparecem');
assert.equal(allSelection.allOffers.length,4,'uma mesma oferta repetida em capturas diferentes é contada uma vez');
assert.equal(allSelection.allProducts.find(item=>item.key==='Shared').maxPayout,55,'a visão consolidada conserva o valor mais recente da oferta repetida');
assert.deepEqual(Object.fromEntries(allSelection.allProducts.map(item=>[item.key,item.movement])),{Alpha:'nao_repetido',Beta:'novo',Legacy:'nao_repetido',Shared:'permaneceu'},'movimento na visão consolidada compara a última coleta com a anterior e mantém os demais produtos como ausentes da última');
assert.deepEqual(allSelection.comparison.counts,{new:1,remained:1,notRepeated:2});
const emptyAll=projectCollectionView([],[],ALL_COLLECTIONS_SELECTION);
assert.equal(emptyAll.selectedCollectionId,ALL_COLLECTIONS_SELECTION,'a opção consolidada continua válida antes da primeira coleta');
assert.deepEqual(emptyAll.allProducts,[]);
console.log('manager list domain ok');

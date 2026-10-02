import assert from 'node:assert/strict';
import test from 'node:test';
import * as Domain from '../src/curadoria/hot-offers-ms/hot-offers-ms-domain.mjs';

const header = ['ID','Oferta','Países','Países','Categoria','Pagamento','Criado','Pré-visualização'].join('\t');
function row(id,title,countries,affiliation,category,payment,date,preview='Capturas de tela') {
  return [id,title,countries,affiliation,category,payment,date,preview].join('\t');
}

test('lê o Ctrl+A tabular com países repetidos, status de afiliação e campos de oferta', () => {
  const input = [header,
    row('4108','**HOT** FuelSync Pro ~ CTC $29.95 (+DTC, Alt-Landers, Advertorial) (Event Tracking)','US, DE, CA, +229 More','Aplicar','Ecommerce: Gadgets & Devices','$45.00','5/4/2026','Prévia ao vivo'),
    row('3736','**HOT** Jetterix Pressure Nozzle ~ CTC $59.99 {+DTC, Multi-Lang, Alt-Landers}','US, DE','Aprovado','Ecommerce: Home Goods','$60.00','3/19/2026'),
  ].join('\n');
  const parsed = Domain.parseHotOffersText(input,{scope:'bottom'});
  assert.equal(parsed.valid,true);
  assert.equal(parsed.parsedCount,2);
  assert.deepEqual(parsed.issues,[]);
  assert.equal(parsed.offers[0].offerId,'4108');
  assert.equal(parsed.offers[0].offerKey,'bottom:4108');
  assert.equal(parsed.offers[0].productName,'FuelSync Pro');
  assert.equal(parsed.offers[0].hot,true);
  assert.equal(parsed.offers[0].affiliationStatus,'request');
  assert.equal(parsed.offers[0].category,'Ecommerce: Gadgets & Devices');
  assert.equal(parsed.offers[0].payment.amount,45);
  assert.equal(parsed.offers[0].payment.currency,null,'a fonte não identifica a moeda do símbolo $');
  assert.equal(parsed.offers[0].createdAt,'2026-05-04');
  assert.deepEqual(parsed.offers[0].countriesVisible,['US','DE','CA']);
  assert.equal(parsed.offers[0].additionalCountryCount,229);
  assert.equal(parsed.offers[0].previewActions[0],'Prévia ao vivo');
  assert.equal(parsed.offers[1].affiliationStatus,'approved');
  assert.equal(parsed.offers[1].ctc.currency,null);
  assert.equal(parsed.declaredCount,null,'não inventa total que a origem não fornece');
});

test('recusa um escopo ausente, cabeçalho diferente e IDs repetidos', () => {
  const input = [header,row('123','**HOT** Oferta','US','Aprovado','Health: General Health','$60.00','6/4/2026')].join('\n');
  assert.equal(Domain.parseHotOffersText(input).valid,false);
  assert.match(Domain.parseHotOffersText('colagem sem cabeçalho',{scope:'bottom'}).issues[0].reason,/Cabeçalho/);
  const duplicate = Domain.parseHotOffersText([header,row('123','Oferta A','US','Aprovado','Categoria','$60.00','6/4/2026'),row('123','Oferta B','US','Aplicar','Categoria','$50.00','6/4/2026')].join('\n'),{scope:'top'});
  assert.equal(duplicate.valid,false);
  assert.ok(duplicate.issues.some(issue=>issue.severity==='error'&&issue.offerId==='123'));
});

test('junta uma categoria que foi quebrada em uma linha física do Ctrl+A', () => {
  const input = [header,
    ['2232','**HOT** Produto','US','Aprovado','Ecommerce:'].join('\t'),
    ['Home Goods','$68.00','10/10/2025','Capturas de tela'].join('\t'),
  ].join('\n');
  const parsed = Domain.parseHotOffersText(input,{scope:'top'});
  assert.equal(parsed.valid,true);
  assert.equal(parsed.offers[0].category,'Ecommerce: Home Goods');
  assert.equal(parsed.offers[0].payment.amount,68);
  assert.equal(parsed.offers[0].createdAt,'2025-10-10');
});

test('separa escopos e acompanha movimentos só entre capturas comparáveis', () => {
  const first = Domain.parseHotOffersText([header,row('1','**HOT** Produto','US','Aprovado','Cat A','$10.00','8/31/2026'),row('2','Produto B','DE','Aplicar','Cat B','$20.00','9/1/2026')].join('\n'),{scope:'bottom'}).offers;
  const second = Domain.parseHotOffersText([header,row('2','Produto B','DE','Aprovado','Cat B','$20.00','9/1/2026'),row('1','**HOT** Produto','US','Aprovado','Cat A','$12.00','8/31/2026'),row('3','Produto C','FR','Aplicar','Cat C','$30.00','9/2/2026')].join('\n'),{scope:'bottom'}).offers;
  const comparison = Domain.compareCollections(second,first,first.map(item=>item.offerKey));
  assert.equal(comparison.summary.up,1);
  assert.equal(comparison.summary.down,1);
  assert.equal(comparison.summary.new,1);
  assert.equal(comparison.summary.remained,2);
  assert.equal(comparison.summary.exited,0);
  assert.equal(comparison.summary.paymentChanges,1);
  assert.equal(comparison.summary.affiliationChanges,1);
  assert.equal(comparison.summary.countryChanges,0);
  const otherScope = Domain.parseHotOffersText([header,row('1','Produto','US','Aprovado','Cat','$10.00','8/31/2026')].join('\n'),{scope:'top'}).offers[0];
  assert.equal(otherScope.offerKey,'top:1');
  assert.notEqual(otherScope.offerKey,first[0].offerKey);
});

test('preserva informações incompletas da coleta anterior e países manuais', () => {
  const existing = {offerKey:'bottom:4',scope:'bottom',productName:'Anterior',rawOfferTitle:'HOT Anterior',productKey:'anterior',countriesRaw:'US, +4 More',countriesVisible:['US'],additionalCountryCount:4,affiliationStatus:'approved',affiliationRaw:'Aprovado',category:'Cat antiga',payment:{amount:60,currency:null,raw:'$60.00'},createdRaw:'1/1/2026',createdAt:'2026-01-01',ctc:{amount:4},previewActions:['Prévia ao vivo'],manualCountries:['BR']};
  const next = {offerKey:'bottom:4',scope:'bottom',productName:'Anterior',rawOfferTitle:'HOT Anterior',productKey:'anterior',countriesRaw:'',countriesVisible:[],additionalCountryCount:0,affiliationStatus:'unknown',affiliationRaw:'',category:'',payment:{amount:null,currency:null,raw:''},createdRaw:'',createdAt:null,ctc:null,previewActions:[],availableFields:{productName:true,countries:false,affiliation:false,category:false,payment:false,createdAt:false,ctc:false,previewActions:false}};
  const merged = Domain.mergeOffer(existing,next,{collectionId:'c2',capturedAt:'2026-10-01T12:00:00Z',movement:'same'});
  assert.deepEqual(merged.countriesVisible,['US']);
  assert.equal(merged.affiliationStatus,'approved');
  assert.equal(merged.category,'Cat antiga');
  assert.equal(merged.payment.amount,60);
  assert.equal(merged.createdAt,'2026-01-01');
  assert.deepEqual(merged.manualCountries,['BR']);
  assert.deepEqual(Domain.offerCountryCodes(merged),['US','BR']);
});

test('filtra e ordena ofertas sem misturar itens ocultos ou decisões diferentes', () => {
  const items = [
    {offerKey:'bottom:1',offerId:'1',scope:'bottom',productName:'A',category:'Saúde',affiliationStatus:'approved',countriesVisible:['US'],payment:{amount:20},latestMovement:'up'},
    {offerKey:'bottom:2',offerId:'2',scope:'bottom',productName:'B',category:'Casa',affiliationStatus:'request',countriesVisible:['DE'],payment:{amount:45},latestMovement:'new'},
  ];
  const decisions = new Map([['bottom:1',{currentStatus:'Subir campanha'}],['bottom:2',{currentStatus:'Ocultar'}]]);
  assert.deepEqual(Domain.filterOffers(items,{category:'Saúde',paymentMin:'10',decision:'Subir campanha'},decisions).map(item=>item.offerId),['1']);
  assert.deepEqual(Domain.filterOffers(items,{paymentMax:'30'},decisions).map(item=>item.offerId),['1','2'],'o filtro removido não deve afetar a lista');
  assert.deepEqual(Domain.filterOffers(items,{country:'US'},decisions).map(item=>item.offerId),['1','2'],'o filtro removido não deve afetar a lista');
  assert.deepEqual(Domain.filterOffers(items,{visibility:'hidden'},decisions).map(item=>item.offerId),['2']);
  assert.deepEqual(Domain.sortOffers(items,'payment','desc').map(item=>item.offerId),['2','1']);
});

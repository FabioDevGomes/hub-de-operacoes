import assert from 'node:assert/strict';
import {clickBankOfferDetailsUrl, compareCapturedOffers, movementLabel, parseTopOffersClipboard} from '../src/curadoria/clickbank-top-offers/clickbank-top-offers-domain.mjs';

const tabular = [
  'ClickBank Affiliate Marketplace',
  'Top Offers',
  '3 results',
  'Rank\tOffer Name\tSeller\tAvg $\tInitial $\tFuture $\tEPC\tCVR\tGravity\tActions',
  '1\tOferta Alfa (2026)\tSELLERA\t$51.32\t$51.32\t-\t$0.00\t1.55%\t148.47\tPromote',
  '2\tOferta Beta\tSELLERB\t$140.60\t$139.84\t$0.75\t$0.56\t0.40%\t126.94\tPromote',
  'Results per page',
  '50',
  '1 - 2 of 3',
].join('\n');

const parsed = parseTopOffersClipboard(tabular);
assert.equal(parsed.valid, true);
assert.equal(parsed.sourceFormat, 'clickbank-top-offers-v1');
assert.equal(parsed.listName, 'Top Offers');
assert.equal(parsed.parsedCount, 2);
assert.equal(parsed.page.total, 3);
assert.equal(parsed.page.pageSize, 50);
assert.equal(parsed.page.expectedOnPage, 2);
assert.equal(parsed.page.completeUniverse, false);
assert.equal(parsed.offers[0].rank, 1);
assert.equal(parsed.offers[0].average.value, 51.32);
assert.equal(parsed.offers[0].future.value, null, 'traço continua como dado ausente');
assert.equal(parsed.offers[0].epc.value, 0, 'zero observado não pode virar ausência');
assert.equal(parsed.offers[0].cvr.value, 1.55);
assert.equal(parsed.offers[0].gravity.value, 148.47);
assert.equal(parsed.offers[0].identitySource, 'seller+normalized-title');
assert.equal(parsed.offers[0].offerId, null, 'capturas antigas continuam sem ID e não ganham link inventado');
assert.equal(parsed.offers[0].average.currency, undefined, 'o símbolo $ não deve ser convertido em moeda não verificada');

const withOfferId = [
  'Top Offers', '1 result',
  'Rank\tOffer Name\tSeller\tAvg $\tInitial $\tFuture $\tEPC\tCVR\tGravity\tOffer ID\tActions',
  '1\tOferta Alfa (2026)\tSELLERA\t$51.32\t$51.32\t-\t$0.00\t1.55%\t148.47\tENREV\tPromote',
  'Results per page', '50', '1 - 1 of 1',
].join('\n');
const parsedWithId = parseTopOffersClipboard(withOfferId);
assert.equal(parsedWithId.valid, true);
assert.equal(parsedWithId.sourceFormat, 'clickbank-top-offers-v2');
assert.equal(parsedWithId.offers[0].offerId, 'ENREV');
assert.equal(parsedWithId.offers[0].offerKey, parsed.offers[0].offerKey, 'adicionar o ID não reatribui identidade nem históricos antigos');
assert.equal(clickBankOfferDetailsUrl('ENREV'), 'https://accounts.clickbank.com/master/dashboard/affiliate-marketplace#/offer-details?offer=ENREV&clickUrl=undefined');
assert.equal(clickBankOfferDetailsUrl('https://example.com'), null, 'o link só aceita IDs com formato validado');

const lineCells = [
  'Top Offers', '2 results', 'Rank', 'Offer Name', 'Seller', 'Avg $', 'Initial $', 'Future $', 'EPC', 'CVR', 'Gravity', 'Actions',
  '1', 'Oferta Alfa (2026)', 'SELLERA', '$51.32', '$51.32', '-', '$0.00', '1.55%', '148.47',
  '2', 'Oferta Beta', 'SELLERB', '$140.60', '$139.84', '$0.75', '$0.56', '0.40%', '126.94',
  'Results per page', '50', '1 - 2 of 2',
].join('\n');
const lineParsed = parseTopOffersClipboard(lineCells);
assert.equal(lineParsed.valid, true, 'também aceita colagem em que cada célula fica em uma linha');
assert.equal(lineParsed.parsedCount, 2, 'a paginação não deve virar uma oferta extra');

const marketplaceBlocks = [
  'CB Marketplace', 'Search', 'Top Offers', 'Travel (6)', 'Home & Garden (32)',
  'Top Offers', '1,251 results', '', 'Rank', '', 'Offer Name', 'Seller', '',
  'Avg $', 'Initial $', 'Future $', 'EPC', 'CVR', 'Gravity', 'Actions', '',
  '12', 'Synthetic Alpha Offer', 'SELLERA', '$174.92', '$174.92', '—', '$0.80', '0.45%', '43.32',
  '13', 'Synthetic Beta Offer', 'SELLERB', '$48.38', '$48.38', '—', '$0.15', '0.31%', '81.89',
  'Results per page', '', '50', '© 2023 ClickBank',
].join('\n');
const marketplaceParsed = parseTopOffersClipboard(marketplaceBlocks);
assert.equal(marketplaceParsed.valid, true, 'reconhece o Ctrl+A do Marketplace mesmo com espaços em branco entre o cabeçalho e as células');
assert.equal(marketplaceParsed.page.total, 1251);
assert.equal(marketplaceParsed.page.start, 12);
assert.equal(marketplaceParsed.page.end, 13);
assert.equal(marketplaceParsed.parsedCount, 2);
assert.equal(marketplaceParsed.offers[0].offerName, 'Synthetic Alpha Offer');
assert.equal(marketplaceParsed.offers[0].gravity.value, 43.32);

const prior = [{...parsed.offers[0], rank: 4}, {...parsed.offers[1], rank: 2}];
const comparison = compareCapturedOffers(parsed.offers, prior);
assert.equal(comparison[0].movement, 'up');
assert.equal(comparison[0].rankDelta, 3);
assert.equal(movementLabel(comparison[0]), '↑ 3');
assert.equal(comparison[1].movement, 'same');
assert.equal(movementLabel(compareCapturedOffers([parsed.offers[0]], [])[0]), '—', 'item sem par anterior não deve ser chamado de novo ou removido');

const duplicate = parseTopOffersClipboard(tabular.replace('2\tOferta Beta\tSELLERB\t$140.60\t$139.84\t$0.75\t$0.56\t0.40%\t126.94\tPromote', '2\tOferta Alfa (2026)\tSELLERA\t$140.60\t$139.84\t$0.75\t$0.56\t0.40%\t126.94\tPromote'));
assert.equal(duplicate.valid, false, 'duplicidade do fingerprint bloqueia comparação insegura');
assert.ok(duplicate.issues.some(issue => issue.reason.includes('combinação')));
const incomplete = parseTopOffersClipboard(tabular.replace('1 - 2 of 3', '1 - 3 of 3'));
assert.equal(incomplete.valid, false, 'a faixa declarada deve coincidir com a quantidade copiada');
assert.equal(parseTopOffersClipboard('texto sem cabeçalho').valid, false);

console.log('clickbank top offers domain ok');

import assert from 'node:assert/strict';
import {captureOfferHistory, historyLabel, parseSmartAdvOffersClipboard, productNameFromOfferName} from '../src/curadoria/smartadv-offers/smartadv-offers-domain.mjs';
import {createInitialCapture} from '../src/curadoria/smartadv-offers/smartadv-offers-initial-capture.mjs';

const initialCapture = createInitialCapture();
assert.equal(initialCapture.offers.length, 16);
assert.equal(initialCapture.offers[0].offerId, '17962');
assert.equal(initialCapture.offers.at(-1).offerId, '14697');
assert.match(initialCapture.sourceLabel, /data\/hora original não informadas/);

const markdown = [
  'SmartAdv marketplace',
  '| **ID** | **Name** | **Vertical** |',
  '| :--- | :--- | :--- |',
  '| 70601 | [HOT OFFER - Sample Formula [DE, AT, CH] (Social, Banner, SEO, Search, Brand Bidding) - CPA](https://portal.smartadv.com/offers/70601) | Diet |',
  '| 70602 | [Sample Home Product [INTL] (Native, Push) - CPA {No BrandBidding}](https://portal.smartadv.com/offers/70602) | Ecommerce / Retail |',
  '',
  'Account Manager',
  'contact@example.invalid',
].join('\n');

const parsed = parseSmartAdvOffersClipboard(markdown);
assert.equal(parsed.valid, true);
assert.equal(parsed.sourceFormat, 'smartadv-offers-v1');
assert.equal(parsed.coverage, 'unknown');
assert.equal(parsed.parsedCount, 2);
assert.equal(parsed.offers[0].offerId, '70601');
assert.equal(parsed.offers[0].vertical, 'Diet');
assert.deepEqual(parsed.offers[0].geoTargets, ['DE', 'AT', 'CH']);
assert.deepEqual(parsed.offers[0].allowedChannels, ['Banner', 'Social', 'SEO', 'Search']);
assert.equal(parsed.offers[0].brandBidding, 'yes');
assert.equal(parsed.offers[0].offerUrl, 'https://portal.smartadv.com/offers/70601');
assert.equal(productNameFromOfferName(parsed.offers[0].offerName), 'Sample Formula', 'prefixo HOT, países, meios e CPA não poluem a identidade do produto');
assert.equal(productNameFromOfferName('! HOT OFFER - MeltPeak Weight Management [DE,AT,CH] (Social,Banner,Native,Push,SEO,Search,Brand Bidding) - CPA'), 'MeltPeak Weight Management');
assert.equal(parsed.offers[1].brandBidding, 'no');
assert.equal(productNameFromOfferName(parsed.offers[1].offerName), 'Sample Home Product', 'anotações de Brand Bidding não entram no nome usado pelo Glimpse');
assert.deepEqual(parsed.offers[1].geoTargets, ['INTL']);
assert.equal(parsed.offers.some(offer => offer.offerName.includes('Account Manager')), false, 'texto depois da tabela não vira oferta');
assert.equal(parsed.offers.some(offer => offer.offerName.includes('contact@example')), false, 'contatos fora da tabela não são persistidos');

const tabular = [
  'ID\tName\tVertical',
  '80701\tProduto Alpha [US, CA] (Shopping, PPC) {No BrandBidding}\tHealth',
].join('\n');
const tabularParsed = parseSmartAdvOffersClipboard(tabular);
assert.equal(tabularParsed.valid, true);
assert.equal(tabularParsed.offers[0].offerUrl, 'https://portal.smartadv.com/offers/80701', 'sem link na colagem, o endereço usa apenas o ID observado');
assert.deepEqual(tabularParsed.offers[0].allowedChannels, ['PPC', 'Shopping']);
assert.equal(productNameFromOfferName('! HOT OFFER - SodaPeak ME - DTC [US] (Native,Social,SEO,Search,Banner) - CPA {No BrandBidding}'), 'SodaPeak ME - DTC');

const cells = ['ID', 'Name', 'Vertical', '90701', 'Sample Device [AU, NZ] (Native, Search)', 'Retail'].join('\n');
assert.equal(parseSmartAdvOffersClipboard(cells).parsedCount, 1, 'reconhece conteúdo de células em linhas');

const duplicate = parseSmartAdvOffersClipboard(`${tabular}\n80701\tNome repetido\tHealth`);
assert.equal(duplicate.valid, false, 'IDs duplicados bloqueiam a confirmação');
assert.ok(duplicate.issues.some(issue => issue.reason.includes('ID duplicado')));

const untrustedLink = parseSmartAdvOffersClipboard('ID\tName\tVertical\n90702\t[Example](https://evil.invalid/offers/90702)\tHealth');
assert.equal(untrustedLink.valid, true);
assert.equal(untrustedLink.offers[0].offerUrl, 'https://portal.smartadv.com/offers/90702');
assert.equal(untrustedLink.issues[0].severity, 'warning');
assert.equal(parseSmartAdvOffersClipboard('texto sem cabeçalho').valid, false);

const older = {offers:[{offerId:'70601'},{offerId:'70000'}]};
const history = captureOfferHistory({offers:[{offerId:'70601'},{offerId:'70602'}]}, [older]);
assert.deepEqual(history.map(item => item.historyState), ['known', 'first-seen']);
assert.equal(historyLabel('known'), 'Já capturada');
assert.equal(historyLabel('first-seen'), 'Primeiro registro');

console.log('smartadv offers domain ok');

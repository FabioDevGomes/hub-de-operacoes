import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const start = template.indexOf('    function parseSaleClipboard(raw,source=saleSource){');
const end = template.indexOf('\n    function saleCampaignCandidates', start);
assert.ok(start >= 0 && end > start, 'não foi possível isolar os parsers de venda');
const parserSource = template.slice(start, end).trim();
const parse = new Function('state', `let saleSource='flowtracking'; ${parserSource}; return parseSaleClipboard;`)({ rate: 5.1 });

const paidSale = `CPA Omni

998877665

-
2026-09-29 17:37:35 Paid
29.09 17:37 (1)

98765432xxx
(spa) Example Buyer
Approve (+upsale) Erovitan - remedy for potency For direct sale: 52.16 USD
Pricing: Auto
Price on the landing page: 39.00 EUR52.16 USD`;
const paid = parse(paidSale, 'cpa-omni');
assert.equal(paid.platform, 'CPA Omni');
assert.equal(paid.origin, 'CPA Omni');
assert.equal(paid.identifier, '998877665', 'usa o número do pedido, não o identificador mascarado do cliente');
assert.equal(paid.date, '2026-09-29');
assert.equal(paid.hour, '17:37');
assert.equal(paid.sourceStatus, 'Paid');
assert.equal(paid.product, 'Erovitan - remedy for potency');
assert.equal(paid.trackProduct, 'Erovitan');
assert.equal(paid.sourceAmount, 52.16);
assert.equal(paid.amount, 52.16 * 5.1, 'converte For direct sale em USD pela cotação do painel');
assert.equal(paid.account, '', 'não inventa uma conta ausente na origem');
assert.deepEqual(paid.countries, [], 'não infere país a partir de um marcador que pode ser idioma');

const unpaidSale = `112233445
-
2026-10-01 09:17:39 No paid
01.10 14:39 (3)
87654321xxx
(pol) Example Buyer
Approve (+upsale) Artodip gel - joint cream For direct sale: 13.59 USD
Pricing: Auto
Price on the landing page: 99.00 PLN13.59 USD`;
const unpaid = parse(unpaidSale, 'cpa-omni');
assert.equal(unpaid.sourceStatus, 'No paid');
assert.equal(unpaid.date, '2026-10-01');
assert.equal(unpaid.hour, '09:17');
assert.equal(unpaid.product, 'Artodip gel - joint cream');
assert.equal(unpaid.sourceAmount, 13.59, 'usa a comissão da venda direta, não o preço da página');
assert.equal(unpaid.amount, 13.59 * 5.1);

assert.throws(() => parse(`${paidSale}\n\n${unpaidSale}`, 'cpa-omni'), /uma venda da CPA Omni por vez/);
assert.throws(() => parse(paidSale.replace('52.16 USD','52.16 EUR'), 'cpa-omni'), /somente USD/);
assert.match(template, /class="sale-source-tab active"[^>]*aria-selected="true"[^>]*data-sale-source="flowtracking"[\s\S]*?class="sale-source-tab"[^>]*aria-selected="false"[^>]*data-sale-source="cpa-omni"/,
  'FlowTracking inicia selecionada e CPA Omni é a segunda aba');
assert.match(template, /function selectSaleSource\(source\)[\s\S]*?saleModalTitle[\s\S]*?saleGuideImage/,
  'trocar de plataforma atualiza título, instruções e limpa a colagem anterior');
assert.ok(template.includes("$('#parseSale').onclick=analyzeSalePaste") && template.includes('saleCampaignCandidates(draft)'),
  'a colagem analisada continua sendo associada a uma campanha ativa');

console.log('CPA Omni sale clipboard: parsing sintético e conversão verificados em memória');

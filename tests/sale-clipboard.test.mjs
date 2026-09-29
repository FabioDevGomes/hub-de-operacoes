import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const start = template.indexOf('    function parseSaleClipboard(raw){');
const end = template.indexOf('\n    function saleCampaignCandidates', start);
assert.ok(start >= 0 && end > start, 'não foi possível isolar o parser da colagem');
const parserSource = template.slice(start, end).trim();
const parse = new Function('state', `${parserSource}; return parseSaleClipboard;`)({ rate: 5.1 });

const sample = `29/09/2026
08:30
Akemi Coffee Boost - CTC AU$29.99 - Including Checkout Event Tracking - (Nutra / Diet) - [AU, NZ]
Gurumedia logo
Gurumedia
Akemi - homeandlifeinsights
Venda
CjwKCAjw...QAvD_BwE
R$ 235,12
Austrália`;
const parsed = parse(sample);
assert.equal(parsed.amount, 235.12, 'o preço do produto AU$29.99 não pode substituir a venda de R$ 235,12');
assert.equal(parsed.date, '2026-09-29');
assert.equal(parsed.hour, '08:30');
assert.equal(parsed.platform, 'Gurumedia');
assert.deepEqual(parsed.countries, ['AU', 'NZ']);
assert.equal(parse('Akemi Coffee Boost - CTC AU$29.99').amount, null, 'preço embutido no nome do produto não é valor de venda');
assert.ok(Math.abs(parse('US$ 29.99').amount - 152.949) < 1e-9, 'valores em USD com ponto decimal continuam convertidos pela cotação');

console.log('sale clipboard: evita confundir AU$ do produto com valor da venda');

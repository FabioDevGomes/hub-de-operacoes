import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../src/index.template.html', import.meta.url), 'utf8');
const start = html.indexOf('function accountCpaCoverage(');
const end = html.indexOf('\n    function accountCommissionLabel(', start);
assert.ok(start >= 0 && end > start, 'função de cobertura por faixa de CPA não encontrada');

const context = vm.createContext({
  cpaTitleInfo: campaign => ({ range: Number(campaign.match(/(\d+)%/)?.[1]) || null, payout: null, payoutCurrency: 'USD' }),
});
vm.runInContext(`${html.slice(start, end)};this.accountCpaCoverage=accountCpaCoverage;`, context);

const rows = [
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 70%', status: 'ativa' },
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 70%', status: 'pausada' },
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 100%', status: 'ativa' },
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 100%', status: 'pausada' },
];
const [product] = context.accountCpaCoverage(rows, [70, 100, 150]);

assert.deepEqual(JSON.parse(JSON.stringify([...product.ranges])), [
  [70, { active: 1, paused: 1 }],
  [100, { active: 1, paused: 1 }],
]);
assert.deepEqual(JSON.parse(JSON.stringify(product.missing)), [150]);
console.log('account CPA coverage distinguishes active, paused and untested ranges');

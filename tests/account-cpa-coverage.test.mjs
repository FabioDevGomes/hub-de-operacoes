import assert from 'node:assert/strict';
import {accountCpaCoverage,filterAccountCpaCoverageRows} from '../src/accounts/accounts-domain.mjs';

const rows = [
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 70%', status: 'ativa', account: 'A' },
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 70%', status: 'pausada', account: 'A' },
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 100%', status: 'ativa', account: 'A' },
  { productKey: 'slinkear', product: 'Slinkear', campaign: 'Slinkear 100%', status: 'pausada', account: 'B' },
].map(row=>({...row,cpa:{range:Number(row.campaign.match(/(\d+)%/)?.[1]),payout:null,payoutCurrency:'USD'}}));
const [product] = accountCpaCoverage(rows, [70, 100, 150]);

assert.deepEqual(JSON.parse(JSON.stringify([...product.ranges])), [
  [70, { active: 1, paused: 1 }],
  [100, { active: 1, paused: 1 }],
]);
assert.deepEqual(JSON.parse(JSON.stringify(product.missing)), [150]);
assert.deepEqual(filterAccountCpaCoverageRows(rows, 'ativa', 'all').map(row => row.status), ['ativa', 'ativa']);
assert.deepEqual(filterAccountCpaCoverageRows(rows, 'pausada', 'A').map(row => row.campaign), ['Slinkear 70%']);
assert.deepEqual(filterAccountCpaCoverageRows(rows, 'all', 'B').map(row => row.status), ['pausada']);
console.log('account CPA coverage filters active, paused and all campaigns within the selected account');

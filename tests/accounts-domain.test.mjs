import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAccountState, buildAccountReport, accountProductsByCpaRange,
  accountCpaCoverage, accountDomainUrl, sortAccountDetailRows
} from '../src/accounts/accounts-domain.mjs';

const row = (productKey, account, status, range, overrides = {}) => ({
  productKey, product:productKey.toUpperCase(), account, status,
  campaign:productKey+' '+range+'% '+account,
  identity:{name:productKey, dateLabel:'01/01', dateSort:101},
  cpa:{range,payout:10,payoutCurrency:'USD'}, domain:'.example.shop',
  zeroDays:0, totals:{investment:0,impressions:0,clicks:null,conversions:0},
  roi:null, ...overrides
});
const rows = [
  row('alpha','A','ativa',70), row('alpha','A','ativa',70),
  row('alpha','B','pausada',80), row('beta','B','ativa',90),
  row('gamma','Sem conta','pausada',null)
];

test('default active report preserves grouping, counts and first selection', () => {
  const state = createAccountState(), report = buildAccountReport(rows,state);
  assert.equal(state.status,'ativa');
  assert.deepEqual(report.products.map(x=>x.key),['alpha','beta']);
  assert.equal(report.selected,'alpha');
  assert.deepEqual(report.detail.map(x=>x.account),['A','A']);
  assert.deepEqual(report.kpis,{products:2,campaigns:3,active:3,paused:0,accounts:2,multiAccount:0,missing:0});
});

test('paused and all scopes apply identically to matrix, detail and coverage', () => {
  const state = createAccountState();
  const paused = buildAccountReport(rows,{...state,status:'pausada'});
  assert.equal(paused.detail.length,1);
  assert.ok(paused.rows.every(x=>x.status==='pausada'));
  assert.deepEqual(paused.ranges,[80]);
  assert.deepEqual(paused.coverage[0].ranges.get(80),{active:0,paused:1});
  const all = buildAccountReport(rows,{...state,status:'all'});
  assert.deepEqual(all.kpis,{products:3,campaigns:5,active:3,paused:2,accounts:2,multiAccount:1,missing:1});
  assert.deepEqual(all.accounts,['A','B','Sem conta']);
});

test('product limits rows, not CPA columns; account limits both', () => {
  const report = buildAccountReport(rows,{...createAccountState(),product:'ALPHA'});
  assert.deepEqual(report.ranges,[70,90],'90% remains a coverage gap for the selected product');
  assert.deepEqual(report.coverage[0].missing,[90]);
  assert.equal(report.detail.length,2);
  const account = buildAccountReport(rows,{...createAccountState(),account:'A',product:'ALPHA'});
  assert.deepEqual(account.ranges,[70]);
  assert.deepEqual(account.coverage[0].missing,[]);
});

test('selection survives while visible and falls back safely when filtered out', () => {
  const state = {...createAccountState(),selected:'beta'};
  assert.equal(buildAccountReport(rows,state).selected,'beta');
  assert.equal(buildAccountReport(rows,{...state,account:'A'}).selected,'alpha');
  const empty = buildAccountReport([],state);
  assert.equal(empty.selected,null);
  assert.deepEqual(empty.detail,[]);
  assert.deepEqual(empty.kpis,{products:0,campaigns:0,active:0,paused:0,accounts:0,multiAccount:0,missing:0});
});

test('removed option resets to all without persisting or mutating filters', () => {
  const filters = Object.freeze({...createAccountState(),account:'deleted',product:'deleted'});
  const report = buildAccountReport(rows,filters);
  assert.equal(report.account,'all'); assert.equal(report.product,'all');
  assert.equal(filters.account,'deleted');
});

test('CPA product bars count unique products, preserve zero and missing ranges', () => {
  const bars = accountProductsByCpaRange([...rows,row('alpha','C','ativa',70),row('delta','A','ativa',0)]);
  assert.deepEqual(bars.map(x=>[x.range,x.count]),[[0,1],[70,1],[80,1],[90,1],[null,1]]);
});

test('coverage counts mixed statuses, commissions only in USD and fractional ranges', () => {
  const sample = [
    row('alpha','A','ativa',70.5),
    row('alpha','A','pausada',70.5,{cpa:{range:70.5,payout:12,payoutCurrency:'EUR'}}),
    row('alpha','B','ativa',80,{cpa:{range:80,payout:20,payoutCurrency:'USD'}})
  ];
  const [product] = accountCpaCoverage(sample,[70.5,80,90]);
  assert.deepEqual(product.ranges.get(70.5),{active:1,paused:1});
  assert.deepEqual([...product.commissions],[10,20]);
  assert.deepEqual(product.missing,[90]);
});

test('sorting keeps null last in either direction and does not confuse zero', () => {
  const sample = [
    row('missing','A','ativa',70,{totals:{investment:null}}),
    row('zero','A','ativa',70,{totals:{investment:0}}),
    row('negative','A','ativa',70,{totals:{investment:-2}}),
    row('positive','A','ativa',70,{totals:{investment:12}})
  ];
  assert.deepEqual(sortAccountDetailRows(sample,'investment','asc').map(x=>x.productKey),['negative','zero','positive','missing']);
  assert.deepEqual(sortAccountDetailRows(sample,'investment','desc').map(x=>x.productKey),['positive','zero','negative','missing']);
  assert.deepEqual(sample.map(x=>x.productKey),['missing','zero','negative','positive']);
});

test('sorting uses campaign display identity, date key and numeric account order', () => {
  const sample = [
    row('one','Conta 10','ativa',70,{identity:{name:'Option 10',dateSort:1002,dateLabel:'02/10'},zeroDays:2}),
    row('two','Conta 2','ativa',70,{identity:{name:'Option 2',dateSort:101,dateLabel:'01/01'},zeroDays:0}),
    row('three','Sem conta','pausada',80,{identity:{name:'Option 3',dateSort:null,dateLabel:'—'},zeroDays:null})
  ];
  for(const key of ['account','campaign','campaignDate','zeroDays']) {
    assert.deepEqual(sortAccountDetailRows(sample,key,'asc').map(x=>x.productKey),key==='campaign'?['two','three','one']:['two','one','three']);
  }
  assert.deepEqual(sortAccountDetailRows(sample,'campaignDate','desc').map(x=>x.productKey),['one','two','three']);
});

test('domain links support other extensions and reject unsafe or malformed hosts', () => {
  assert.equal(accountDomainUrl('.example.shop'),'https://hpanel.hostinger.com/websites/example.shop');
  assert.equal(accountDomainUrl(' .sub.example.store '),'https://hpanel.hostinger.com/websites/sub.example.store');
  for(const domain of [null,'—','javascript:alert(1)','https://example.shop','example.shop/','..example.shop','<script>','bad-.shop']) assert.equal(accountDomainUrl(domain),null);
});

test('all projections leave rows, campaign identities, totals and input state untouched', () => {
  const sample = structuredClone(rows);
  const freeze = value => {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}};
  freeze(sample);
  const before = JSON.stringify(sample), filters = Object.freeze({...createAccountState(),status:'all'});
  buildAccountReport(sample,filters); accountCpaCoverage(sample,[70,80]); sortAccountDetailRows(sample,'roi','desc');
  assert.equal(JSON.stringify(sample),before);
});

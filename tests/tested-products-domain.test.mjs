import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const start = html.indexOf('function testedProducts(){');
const end = html.indexOf('\n    function applyTestedColumnVisibility()', start);
assert.ok(start >= 0 && end > start, 'função de consolidação dos produtos testados não encontrada');

const campaigns = [
  { id: 'alpha-1', nome_mcc: 'Alpha 01', nome_exibicao: 'Alpha 01' },
  { id: 'alpha-2', nome_mcc: 'Alpha 02', nome_exibicao: 'Alpha 02' },
  { id: 'zero', nome_mcc: 'Zero', nome_exibicao: 'Zero' },
  { id: 'missing', nome_mcc: 'Missing', nome_exibicao: 'Missing' },
];
const context = {
  dailyByCampaign: new Map([
    ['alpha-1', [{ data: '2026-09-20', celulas: { P: { value: 100 } } }, { data: '2026-09-21', celulas: { P: { value: 0 } } }]],
    ['alpha-2', [{ data: '2026-09-21', celulas: { P: { value: 50 } } }]],
    ['zero', [{ data: '2026-09-21', celulas: { P: { value: 0 } } }]],
    ['missing', [{ data: '2026-09-21', celulas: { P: { value: null } } }]],
  ]),
  salesAdjustments: new Map([['alpha-1', { commissionAdjustment: 25 }]]),
};
const sandbox = {
  derivedContext: () => context,
  state: { database: { campanhas: campaigns }, productCatalog: {} },
  currentCampaignRows: () => [],
  testedProductName: campaign => campaign.nome_exibicao,
  campaignSheet: name => name,
  campaignIdentity: () => ({ dateSort: null }),
  normalizeTestedDate: value => value || null,
  manifestDates: () => ({ d0: '2026-09-22', d1: null }),
  ProductCatalog: { normalize: () => ({ ocultos: [], aliases: {}, datas_inicio: {} }) },
};
const testedProducts = vm.runInNewContext(`(${html.slice(start, end).trim()})`, sandbox)();
assert.equal(testedProducts.find(product => product.label === 'Alpha').totalBilled, 175,
  'soma os valores oficiais das variantes e a venda provisória pendente');
assert.equal(testedProducts.find(product => product.label === 'Zero').totalBilled, 0,
  'preserva zero como faturamento válido');
assert.equal(testedProducts.find(product => product.label === 'Missing').totalBilled, null,
  'preserva ausência de faturamento sem convertê-la em zero');
console.log('tested products domain ok');

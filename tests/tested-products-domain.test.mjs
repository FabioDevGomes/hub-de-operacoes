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
  { id: 'derila-1', nome_mcc: 'Derila 1° [MS]', nome_exibicao: 'Derila 1° [MS]', legacy_totais: { end_date: '2026-09-18', metrics: { commission_brl: { value: 100, state: 'observed' } } } },
  { id: 'derila-2', nome_mcc: 'Derila 2° [MS]', nome_exibicao: 'Derila 2° [MS]', legacy_totais: { end_date: '2026-09-19', metrics: { commission_brl: { value: 200, state: 'observed' } } } },
  { id: 'derila-3', nome_mcc: 'Derila 3° [MS]', nome_exibicao: 'Derila 3° [MS]', legacy_totais: { end_date: '2026-09-20', metrics: { commission_brl: { value: 0, state: 'observed' } } } },
  { id: 'single-model', nome_mcc: 'Modelo 1° [MS]', nome_exibicao: 'Modelo 1° [MS]' },
  { id: 'zero', nome_mcc: 'Zero', nome_exibicao: 'Zero' },
  { id: 'missing', nome_mcc: 'Missing', nome_exibicao: 'Missing' },
  { id: 'legacy-no-end-date', nome_mcc: 'Legacy No End Date', nome_exibicao: 'Legacy No End Date', legacy_totais: { metrics: { commission_brl: { value: 50, state: 'observed' } } } },
];
const context = {
  dailyByCampaign: new Map([
    ['alpha-1', [{ data: '2026-09-20', celulas: { P: { value: 100 } } }, { data: '2026-09-21', celulas: { P: { value: 0 } } }]],
    ['alpha-2', [{ data: '2026-09-21', celulas: { P: { value: 50 } } }]],
    ['derila-1', [{ data: '2026-09-18', celulas: { P: { value: 100 } } }, { data: '2026-09-20', celulas: { P: { value: 25 } } }]],
    ['derila-2', [{ data: '2026-09-19', celulas: { P: { value: 200 } } }, { data: '2026-09-21', celulas: { P: { value: 40 } } }]],
    ['derila-3', [{ data: '2026-09-20', celulas: { P: { value: 300 } } }]],
    ['legacy-no-end-date', [{ data: '2026-09-21', celulas: { P: { value: 20 } } }]],
    ['zero', [{ data: '2026-09-21', celulas: { P: { value: 0 } } }]],
    ['missing', [{ data: '2026-09-21', celulas: { P: { value: null } } }]],
  ]),
  salesAdjustments: new Map([
    ['alpha-1', { commissionAdjustment: 25 }],
    ['derila-1', { commissionAdjustment: 19, byDate: { '2026-09-18': { commissionAdjustment: 7 }, '2026-09-21': { commissionAdjustment: 12 } } }],
  ]),
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
const derila = testedProducts.find(product => product.label === 'Derila');
assert.ok(derila, 'agrupa campanhas numeradas de um mesmo produto mesmo com ordinal e sufixo entre colchetes');
assert.equal(derila.campaigns.length, 3, 'mantém todas as campanhas relacionadas dentro do produto');
assert.equal(derila.totalBilled, 377, 'soma o resumo histórico por campanha com diário e provisórias posteriores à data final, sem duplicar o período histórico');
assert.equal(testedProducts.find(product => product.label === 'Legacy No End Date').totalBilled, 50,
  'sem data final confiável, usa o resumo histórico sem acrescentar diário possivelmente sobreposto');
assert.ok(testedProducts.some(product => product.label === 'Modelo 1° [MS]'),
  'não remove a numeração de um produto isolado sem outra variante que confirme a família');
console.log('tested products domain ok');

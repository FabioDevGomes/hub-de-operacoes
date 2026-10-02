import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const start = html.indexOf('function testedProducts(){');
const end = html.indexOf('\n    let testedProductsController', start);
assert.ok(start >= 0 && end > start, 'função de consolidação dos produtos testados não encontrada');

const campaigns = [
  { id: 'alpha-1', nome_mcc: 'Alpha 01', nome_exibicao: 'Alpha 01' },
  { id: 'alpha-2', nome_mcc: 'Alpha 02', nome_exibicao: 'Alpha 02' },
  { id: 'derila-1', nome_mcc: 'Derila 1° [MS]', nome_exibicao: 'Derila 1° [MS]', legacy_totais: { end_date: '2026-09-18', metrics: { commission_brl: { value: 100, state: 'observed' }, investment_brl: { value: 50, state: 'observed' }, conversions: { value: 4, state: 'observed' } } } },
  { id: 'derila-2', nome_mcc: 'Derila 2° [MS]', nome_exibicao: 'Derila 2° [MS]', legacy_totais: { end_date: '2026-09-19', metrics: { commission_brl: { value: 200, state: 'observed' }, investment_brl: { value: 100, state: 'observed' }, conversions: { value: 5, state: 'observed' } } } },
  { id: 'derila-3', nome_mcc: 'Derila 3° [MS]', nome_exibicao: 'Derila 3° [MS]', legacy_totais: { end_date: '2026-09-20', metrics: { commission_brl: { value: 0, state: 'observed' }, investment_brl: { value: 0, state: 'observed' } } } },
  { id: 'single-model', nome_mcc: 'Modelo 1° [MS]', nome_exibicao: 'Modelo 1° [MS]' },
  { id: 'zero', nome_mcc: 'Zero', nome_exibicao: 'Zero' },
  { id: 'missing', nome_mcc: 'Missing', nome_exibicao: 'Missing' },
  { id: 'partial-1', nome_mcc: 'Partial 1', nome_exibicao: 'Partial 1' },
  { id: 'partial-2', nome_mcc: 'Partial 2', nome_exibicao: 'Partial 2' },
  { id: 'legacy-no-end-date', nome_mcc: 'Legacy No End Date', nome_exibicao: 'Legacy No End Date', legacy_totais: { metrics: { commission_brl: { value: 50, state: 'observed' }, investment_brl: { value: 50, state: 'observed' }, conversions: { value: 6, state: 'observed' } } } },
];
const context = {
  dailyByCampaign: new Map([
    ['alpha-1', [{ data: '2026-09-20', celulas: { F: { value: 3 }, O: { value: 40 }, P: { value: 100 } } }, { data: '2026-09-21', celulas: { F: { value: 0 }, O: { value: 10 }, P: { value: 0 } } }]],
    ['alpha-2', [{ data: '2026-09-21', celulas: { F: { value: 2 }, O: { value: 20 }, P: { value: 50 } } }]],
    ['derila-1', [{ data: '2026-09-18', celulas: { F: { value: 9 }, O: { value: 99 }, P: { value: 100 } } }, { data: '2026-09-20', celulas: { F: { value: 2 }, O: { value: 10 }, P: { value: 25 } } }, { data: '2026-09-21', celulas: { F: { value: 1 }, O: { value: 5 }, P: { value: 0 } } }]],
    ['derila-2', [{ data: '2026-09-19', celulas: { F: { value: 8 }, O: { value: 88 }, P: { value: 200 } } }, { data: '2026-09-21', celulas: { F: { value: 1 }, O: { value: 7 }, P: { value: 40 } } }]],
    ['derila-3', [{ data: '2026-09-20', celulas: { F: { value: 3 }, O: { value: 300 }, P: { value: 300 } } }]],
    ['legacy-no-end-date', [{ data: '2026-09-21', celulas: { F: { value: 20 }, O: { value: 20 }, P: { value: 20 } } }]],
    ['zero', [{ data: '2026-09-21', celulas: { F: { value: 0 }, O: { value: 0 }, P: { value: 0 } } }]],
    ['missing', [{ data: '2026-09-21', celulas: { F: { value: null }, O: { value: null }, P: { value: null } } }]],
    ['partial-1', [{ data: '2026-09-21', celulas: { O: { value: 10 }, P: { value: 30 } } }]],
    ['partial-2', [{ data: '2026-09-21', celulas: { O: { value: null }, P: { value: 20 } } }]],
  ]),
  salesAdjustments: new Map([
    ['alpha-1', { commissionAdjustment: 25, byDate: { '2026-09-20': { manualSales: 2 }, '2026-09-22': { manualSales: 1 } } }],
    ['derila-1', { commissionAdjustment: 19, byDate: { '2026-09-18': { commissionAdjustment: 7, manualSales: 1 }, '2026-09-21': { commissionAdjustment: 12, manualSales: 2 } } }],
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
const domainContext=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/tested-products/domain.js',import.meta.url),'utf8'),domainContext);
sandbox.TestedProductsDomain=domainContext.window.TestedProductsDomain;
const testedProducts = vm.runInNewContext(`(${html.slice(start, end).trim()})`, sandbox)();
assert.equal(testedProducts.find(product => product.label === 'Alpha').totalBilled, 175,
  'soma os valores oficiais das variantes e a venda provisória pendente');
assert.equal(testedProducts.find(product => product.label === 'Alpha').totalInvestment, 70,
  'soma o investimento da coluna O entre todas as campanhas do produto');
assert.equal(testedProducts.find(product => product.label === 'Alpha').totalProfit, 105,
  'calcula o lucro total pela diferença entre faturamento e investimento');
assert.equal(testedProducts.find(product => product.label === 'Zero').totalBilled, 0,
  'preserva zero como faturamento válido');
assert.equal(testedProducts.find(product => product.label === 'Zero').totalProfit, 0,
  'zero observado para ambos os totais produz lucro zero');
assert.equal(testedProducts.find(product => product.label === 'Missing').totalProfit, null,
  'não trata faturamento ou investimento ausente como zero ao calcular lucro');
assert.equal(testedProducts.find(product => product.label === 'Partial').totalBilled, 50);
assert.equal(testedProducts.find(product => product.label === 'Partial').totalInvestment, 10);
assert.equal(testedProducts.find(product => product.label === 'Partial').totalProfit, null,
  'lucro permanece ausente quando qualquer campanha relacionada não tem investimento observado');
assert.equal(testedProducts.find(product => product.label === 'Missing').totalBilled, null,
  'preserva ausência de faturamento sem convertê-la em zero');
assert.equal(testedProducts.find(product => product.label === 'Alpha').salesCount, 6,
  'soma conversões de todas as campanhas e vendas provisórias que ainda não foram conciliadas');
assert.equal(testedProducts.find(product => product.label === 'Zero').salesCount, 0,
  'preserva zero como contagem observada de vendas');
assert.equal(testedProducts.find(product => product.label === 'Missing').salesCount, null,
  'preserva a ausência de histórico de conversões');
const derila = testedProducts.find(product => product.label === 'Derila');
assert.ok(derila, 'agrupa campanhas numeradas de um mesmo produto mesmo com ordinal e sufixo entre colchetes');
assert.equal(derila.campaigns.length, 3, 'mantém todas as campanhas relacionadas dentro do produto');
assert.equal(derila.totalBilled, 377, 'soma o resumo histórico por campanha com diário e provisórias posteriores à data final, sem duplicar o período histórico');
assert.equal(derila.totalInvestment, 172, 'soma investimento histórico e diário somente após a data final, preservando a mesma precedência por campanha');
assert.equal(derila.totalProfit, 205, 'deriva o lucro do produto após agregar as campanhas sem sobrepor o resumo legado');
assert.equal(derila.salesCount, 17, 'soma conversões históricas e posteriores entre campanhas, evitando sobreposição e mantendo provisórias não conciliadas');
assert.equal(testedProducts.find(product => product.label === 'Legacy No End Date').totalBilled, 50,
  'sem data final confiável, usa o resumo histórico sem acrescentar diário possivelmente sobreposto');
assert.equal(testedProducts.find(product => product.label === 'Legacy No End Date').salesCount, 6,
  'sem data final confiável, preserva o total histórico de conversões sem acrescentar diário possivelmente sobreposto');
assert.equal(testedProducts.find(product => product.label === 'Legacy No End Date').totalInvestment, 50,
  'sem data final confiável, mantém investimento histórico e não adiciona diário possivelmente sobreposto');
assert.equal(testedProducts.find(product => product.label === 'Legacy No End Date').totalProfit, 0,
  'calcula o lucro com os dois totais observados do resumo sem data final');
assert.ok(testedProducts.some(product => product.label === 'Modelo 1° [MS]'),
  'não remove a numeração de um produto isolado sem outra variante que confirme a família');

const snapshotProducts=domainContext.window.TestedProductsDomain.buildProducts({
  source:[{id:'current',nome_mcc:'Current Product',nome_exibicao:'Current Product'}],
  activeCampaigns:[{nome_campanha_exato:'Current Product',metricas_D_menos_1:{presente:true,data:'2026-10-01',conversoes:{value:2}},metricas_D_zero:{presente:true,data:'2026-10-02',conversoes:{value:3}}}],
  investmentSnapshots:[{campaignName:'Current Product',d1:{date:'2026-10-01',value:5},d0:{date:'2026-10-02',value:7}}],
  metricDates:{d1:'2026-10-01',d0:'2026-10-02'},catalog:{ocultos:[],aliases:{},datas_inicio:{}},
  salesAdjustments:new Map([['current',{byDate:{'2026-10-02':{manualSales:1},'2026-10-03':{manualSales:2}}}]]),
  dailyByCampaign:new Map([['current',[{data:'2026-10-01',celulas:{F:{value:2},O:{value:20},P:{value:30}}},{data:'2026-10-02',celulas:{F:{value:1},O:{value:10},P:{value:40}}}]]]),
  referenceDate:'2026-10-02',getProductName:campaign=>campaign.nome_exibicao,getCampaignIdentity:()=>({dateSort:null}),getCampaignSheet:name=>name,
});
assert.equal(snapshotProducts[0].salesCount,7,'D−1/D0 atuais sobrepõem a própria data do diário e incluem as vendas provisórias não conciliadas');
assert.equal(snapshotProducts[0].totalInvestment,12,'snapshots de investimento MCC D−1/D0 substituem os valores da coluna O na mesma data');
assert.equal(snapshotProducts[0].totalBilled,70,'preserva o faturamento diário usado na consolidação');
assert.equal(snapshotProducts[0].totalProfit,58,'calcula lucro usando o investimento mais recente e o faturamento agregado');
console.log('tested products domain ok');

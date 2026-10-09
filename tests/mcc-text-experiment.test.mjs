import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectMccSelectableText } from '../extensions/mcc-d0-bridge/mcc-text-reader.mjs';
import { compareMccTextToCsv, parseMccSelectableText } from '../extensions/mcc-d0-bridge/mcc-text-domain.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('extensions/mcc-d0-bridge/manifest.json', root), 'utf8'));
const background = await readFile(new URL('extensions/mcc-d0-bridge/background.js', root), 'utf8');
const popup = await readFile(new URL('extensions/mcc-d0-bridge/popup.html', root), 'utf8');
const popupScript = await readFile(new URL('extensions/mcc-d0-bridge/popup.js', root), 'utf8');
const readerSource = await readFile(new URL('extensions/mcc-d0-bridge/mcc-text-reader.mjs', root), 'utf8');

assert.deepEqual(manifest.permissions, ['scripting', 'activeTab', 'clipboardWrite'], 'clipboardWrite atende apenas à nova cópia ClickBank; o leitor MCC não usa clipboard');
assert.ok(background.includes("message?.type === 'READ_ACTIVE_MCC_TEXT'") && background.includes('parseMccSelectableText(capture.text)'),
  'o parser legado permanece isolado, sem ser acionado pelo popup');
assert.ok(!popup.includes('id="read-text"') && !popupScript.includes("type: 'READ_ACTIVE_MCC_TEXT'"),
  'a captura textual experimental não deve mais aparecer como opção da extensão');
assert.ok(!popup.includes('role manualmente a página da MCC até o final'), 'o popup não orienta mais o experimento textual removido');
assert.ok(!popupScript.includes('DIAGNÓSTICO POSICIONAL DE MÉTRICAS') && !popupScript.includes('não é mapeamento confirmado'),
  'o popup não apresenta mais o diagnóstico posicional experimental');
assert.ok(!/navigator\.clipboard|document\.execCommand|window\.getSelection|\.select\s*\(/i.test(readerSource), 'captura não deve selecionar a página nem ler clipboard');
assert.ok(!/indexedDB|chrome\.storage|fetch\s*\(/i.test(readerSource), 'leitor textual não deve persistir nem transmitir');

const bodyText = 'Campanhas (1)\n20/09 - Produto Sintético 01 - U$ 45\nUS$ 100,00/dia\n1 - 1 de 1';
assert.deepEqual(collectMccSelectableText({ title: 'MCC private title', body: { innerText: bodyText } }), {
  ok: true, text: bodyText
});
assert.equal(collectMccSelectableText({}).ok, false, 'página ainda sem body deve falhar de forma segura');

function makeCopy(count, { declared = count, first = 1, last = count, total = count } = {}) {
  const lines = ['MCC', `Campanhas (${declared})`, 'Campanhas', 'Total da visualização', '53', '8'];
  for (let i = 1; i <= count; i++) {
    const number = String(i).padStart(2, '0');
    lines.push(
      `20/09 - Produto Sintético ${number} - U$ 45`,
      'US$ 100,00/dia',
      i % 2 ? 'Qualificada (configuração incorreta)' : 'Qualificada (aprendizado)',
      ...(i % 2 ? ['Seu site não tem uma tag do Google'] : ['Estratégia de lances com aprendizado em andamento']),
      'US$ 23,45', '17', i % 2 ? '0' : '—', 'US$ 1,38', '37,50%', '87,50%', '0,00', 'US$ 23,45',
      `6001 - Conta de teste`, '111-222-3333', '0,00%', '29,41%', '0,00', 'CPA desejado', '29,41%', '—', '—', 'US$ 4,73', '0,00'
    );
  }
  lines.push(`Mostrar linhas: 100`, `${first} - ${last} de ${total}`);
  return lines.join('\n');
}

const complete = parseMccSelectableText(makeCopy(60));
assert.equal(complete.campaignCount, 60);
assert.equal(complete.uniqueCampaignCount, 60);
assert.equal(complete.declaredCampaigns, 60);
assert.deepEqual(complete.pagination, { first: 1, last: 60, total: 60, text: '1 - 60 de 60' });
assert.equal(complete.complete, true, 'só confirma quando campanhas, declarado e paginação coincidem');
assert.equal(complete.textLength, makeCopy(60).length);
assert.equal(complete.sampleCampaigns.length, 5);
assert.deepEqual(complete.recognizedHeaders, [], 'não inventa cabeçalho ausente na cópia');
assert.ok(!Object.hasOwn(complete, 'text') && !Object.hasOwn(complete, 'rawText'), 'a prévia não devolve o texto bruto');
assert.equal(complete.fieldMatrix.campaign.classification, 'A');
assert.equal(complete.fieldMatrix.budget.classification, 'B');
assert.equal(complete.fieldMatrix.account.classification, 'B');
assert.equal(complete.fieldMatrix.status.classification, 'B');
assert.equal(complete.fieldMatrix.currency.classification, 'B');
assert.equal(complete.fieldMatrix.impressions.classification, 'D');
assert.equal(complete.fieldMatrix.search_impression_share.classification, 'D', 'não inferir parcela de pesquisa pelo texto sem associação à coluna');
assert.equal(complete.fieldMatrix.clicks.classification, 'D');
assert.equal(complete.fieldMatrix.target_cpa.classification, 'D', 'não usa CPA escrito no nome da campanha como campo');
assert.ok(complete.unmappedValues.numeric > 0 && complete.unmappedValues.zeroNumeric > 0 && complete.unmappedValues.dash > 0,
  'zero explícito e traço devem ser contados separadamente sem atribuição a uma métrica');
assert.ok(!Object.hasOwn(complete.records[0], 'impressions') && !Object.hasOwn(complete.records[0], 'clicks'));
assert.equal(complete.records[0].budget, 'US$ 100,00');
assert.equal(complete.records[0].status, 'Qualificada (configuração incorreta)');
assert.equal(complete.records[0].currency, 'USD');
assert.equal(complete.records[0].account_id, '111-222-3333');
assert.equal(complete.records[0].bid_strategy, 'CPA desejado');

const masculineQualification = parseMccSelectableText(makeCopy(1)
  .replace('Qualificada (configuração incorreta)', 'Qualificado (configuração incorreta)'));
assert.equal(masculineQualification.fieldCoverage.status, 1, 'qualificação no masculino também deve ser reconhecida');
assert.equal(masculineQualification.records[0].status, 'Qualificado (configuração incorreta)');

const genericCurrency = parseMccSelectableText(makeCopy(1).replace('US$ 100,00/dia', '$100/day'));
assert.equal(genericCurrency.fieldMatrix.currency.classification, 'D', 'símbolo $ genérico não deve virar USD automaticamente');
assert.equal(Object.hasOwn(genericCurrency.records[0], 'currency'), false);

const partial = parseMccSelectableText(makeCopy(60, { declared: 150, first: 1, last: 60, total: 150 }));
assert.equal(partial.complete, false);
assert.equal(partial.completeness, 'partial');
const inconsistent = parseMccSelectableText(makeCopy(59, { declared: 60, first: 1, last: 60, total: 60 }));
assert.equal(inconsistent.complete, false, '59 registros contra faixa/declarado de 60 é inconsistente');
assert.equal(inconsistent.completeness, 'inconsistent');

const small = parseMccSelectableText(makeCopy(2));
const csv = [
  'Campaign,Account,Status,Currency,Daily budget,Bid strategy,Cost',
  '"20/09 - Produto Sintético 01 - U$ 45","111-222-3333","Qualificada (configuração incorreta)",USD,"US$ 100.00/day","CPA desejado","US$ 23.45"',
  '"20/09 - Produto Sintético 02 - U$ 45","111-222-3333","Qualificada (aprendizado)",USD,"US$ 100.00/day","CPA desejado","US$ 23.45"'
].join('\r\n');
const comparison = compareMccTextToCsv(small, csv);
assert.deepEqual(comparison.comparableFields, ['campaign', 'budget', 'status', 'currency', 'bid_strategy', 'account']);
assert.equal(comparison.onlyText.length, 0);
assert.equal(comparison.onlyCsv.length, 0);
assert.equal(comparison.divergenceCount, 0, 'campos nomeados explicitamente devem comparar sem conversão adicional');
assert.ok(comparison.valuesCompared > 0);
assert.ok(comparison.textMissingFields.includes('impressions'));

const positionalSnapshot = {
  ...small,
  recognizedHeaders: ['impressions', 'clicks'],
  records: small.records.map((record, index) => ({
    ...record,
    textCandidateTokens: [
      { kind: 'number', value: String((index + 1) * 10) },
      { kind: 'number', value: String(index + 1) }
    ]
  }))
};
const positionalCsv = [
  'Campaign,Impressions,Clicks',
  '"20/09 - Produto Sintético 01 - U$ 45",10,1',
  '"20/09 - Produto Sintético 02 - U$ 45",20,2'
].join('\r\n');
const positionalComparison = compareMccTextToCsv(positionalSnapshot, positionalCsv);
assert.deepEqual(positionalComparison.positionalMetricAlignment.map(item => item.status), [
  'ordem do cabeçalho coincide neste CSV', 'ordem do cabeçalho coincide neste CSV'
]);
assert.deepEqual(positionalComparison.positionalMetricAlignment.map(item => item.bestPosition), [1, 2]);
assert.equal(positionalComparison.comparableFields.includes('impressions'), false,
  'o teste posicional continua diagnóstico e não promove métricas a campos confirmados');

const ambiguousPositionalSnapshot = {
  ...positionalSnapshot,
  records: positionalSnapshot.records.map(record => ({
    ...record,
    textCandidateTokens: [{ kind: 'number', value: '0' }, { kind: 'number', value: '0' }]
  }))
};
const zeroCsv = positionalCsv.replace(',10,1', ',0,0').replace(',20,2', ',0,0');
const ambiguousPositionComparison = compareMccTextToCsv(ambiguousPositionalSnapshot, zeroCsv);
assert.ok(ambiguousPositionComparison.positionalMetricAlignment.every(item => item.status.startsWith('ambíguo')),
  'zeros repetidos em posições diferentes não devem confirmar um alinhamento posicional');

const normalizedSnapshot = {
  ...small,
  records: small.records.map(record => ({ ...record, bid_strategy: 'Maximizar conversões' })),
  fieldCoverage: { ...small.fieldCoverage, bid_strategy: small.records.length }
};
const csvWithPlaceholderAndDifferences = [
  'Campaign,Account,Status,Currency,Daily budget,Bid strategy,Cost',
  '"20/09 - Produto Sintético 01 - U$ 45","111-222-3333","Qualificado (configuracao incorreta)",USD,"US$ 100.00/day","Maximizar as conversões","US$ 23.45"',
  '"20/09 - Produto Sintético 02 - U$ 45","111-222-3333","Qualificado (aprendizado)",USD,"US$ 99.00/day","Maximizar as conversões","US$ 23.45"',
  '"--","","","","","",""'
].join('\r\n');
const normalizedComparison = compareMccTextToCsv(normalizedSnapshot, csvWithPlaceholderAndDifferences);
assert.equal(normalizedComparison.csvRows, 3);
assert.equal(normalizedComparison.csvPlaceholderCount, 1, 'placeholder exato é ignorado apenas no comparador textual');
assert.equal(normalizedComparison.csvCampaigns, 2);
assert.equal(normalizedComparison.csvUniqueCampaigns, 2);
assert.deepEqual(normalizedComparison.onlyCsv, [], 'placeholder não aparece como campanha exclusiva');
assert.equal(normalizedComparison.normalizedEquivalentCount, 4, 'normaliza diferenças conhecidas de gênero e artigo');
assert.deepEqual(normalizedComparison.normalizedEquivalentByField, { status: 2, bid_strategy: 2 });
assert.equal(normalizedComparison.divergenceCount, 1, 'diferença real de orçamento permanece divergente');
assert.deepEqual(normalizedComparison.divergenceByField, { budget: 1 });

const manyDivergencesSnapshot = {
  ...small,
  records: small.records.map((record, index) => ({ ...record, budget: index ? 'US$ 50' : 'US$ 60' }))
};
const manyDivergencesCsv = csv.replaceAll('US$ 100.00/day', 'US$ 1.00/day');
const aggregateComparison = compareMccTextToCsv(manyDivergencesSnapshot, manyDivergencesCsv);
assert.equal(aggregateComparison.divergenceCount, 2);
assert.deepEqual(aggregateComparison.divergenceByField, { budget: 2 }, 'agregação inclui divergências além da amostra visual');

const duplicateText = {
  ...small,
  records: [...small.records, { ...small.records[0], status: 'Outra qualificação' }],
  fieldCoverage: { campaign: 3, account: 3, budget: 3, status: 3, currency: 3, bid_strategy: 3 }
};
const duplicateCsv = `${csv}\r\n"20/09 - Produto Sintético 01 - U$ 45","111-222-3333","Outra qualificação",USD,"US$ 100.00/day","CPA desejado","US$ 23.45"`;
const duplicateComparison = compareMccTextToCsv(duplicateText, duplicateCsv);
assert.equal(duplicateComparison.duplicateScreen.length, 1);
assert.equal(duplicateComparison.duplicateCsv.length, 1);
assert.equal(duplicateComparison.divergenceCount, 0, 'nomes duplicados não escolhem arbitrariamente qual linha comparar');
assert.equal(duplicateComparison.valuesCompared, 5, 'só compara a campanha com correspondência unívoca');

console.log('mcc text experiment: innerText, blocos, paginação, campos seguros, estados ausente/zero e comparação local ok');

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {computeAutomaticSignal, AUTOMATIC_SIGNAL_VERSION} from '../src/curadoria/automatic-signal-domain.mjs';

const t = status => ({assessments: [{assessmentId: `t-${status}`, status, capturedAt: '2026-09-22T10:00:00.000Z'}]});
const i = status => ({currentByCountry: [{assessmentId: `i-${status}`, country: 'US', status, capturedAt: '2026-09-22T10:00:00.000Z'}]});
const g = level => ({analysisId: `g-${level}`, capturedAt: '2026-09-22T10:00:00.000Z', signal: {level}, parsed: {volume: {display: '8K'}}});

assert.deepEqual(computeAutomaticSignal(), {
  result: 'no_data', label: 'Sem dados', coverage: {available: 0, total: 3, label: '0/3'}, version: AUTOMATIC_SIGNAL_VERSION,
  components: {
    trends: {available: false, status: null, label: 'Não avaliado', classification: 'missing', capturedAt: null},
    images: {available: false, status: null, label: 'Não avaliado', classification: 'missing', capturedAt: null},
    glimpse: {available: false, status: null, label: 'Sem análise', classification: 'missing', capturedAt: null},
  },
}, '0/3 não deve parecer um sinal negativo');

const oneFavorable = computeAutomaticSignal({trends: t('up')});
assert.equal(oneFavorable.label, 'Inconclusivo');
assert.equal(oneFavorable.coverage.label, '1/3', 'um único pilar nunca fica positivo, mesmo se favorável');
assert.equal(computeAutomaticSignal({trends: t('up'), images: i('dominant')}).label, 'Positivo', 'dois pilares favoráveis produzem leitura parcial positiva com cobertura explícita');
assert.equal(computeAutomaticSignal({trends: t('up'), images: i('scarce')}).label, 'Misto', 'sinais conflitantes geram leitura mista');
assert.equal(computeAutomaticSignal({trends: t('stable'), images: i('dominant'), glimpse: g('strong')}).label, 'Positivo', 'três pilares favoráveis geram resultado positivo');
assert.equal(computeAutomaticSignal({trends: t('stable'), images: i('mixed')}).label, 'Misto', 'favorável junto de cautela é misto');
assert.equal(computeAutomaticSignal({trends: t('low_volume'), images: i('scarce')}).label, 'Inconclusivo', 'cautela não vira sinal negativo');
assert.equal(computeAutomaticSignal({images: i('absent')}).label, 'Inconclusivo', 'um pilar desfavorável sozinho ainda é insuficiente');
assert.equal(computeAutomaticSignal({images: i('absent'), trends: t('down')}).label, 'Fraco', 'sinal desfavorável mais cautela sem apoio favorável é fraco');
assert.equal(computeAutomaticSignal({images: i('absent'), trends: t('stable')}).label, 'Misto', 'apoio favorável em conflito com sinal desfavorável é misto');
assert.equal(computeAutomaticSignal({trends: t('no_data')}).coverage.label, '1/3', 'uma avaliação salva sem dados conta como pilar avaliado, mas insuficiente');
assert.equal(computeAutomaticSignal({trends: t('inconclusive')}).components.trends.classification, 'insufficient');
assert.equal(computeAutomaticSignal({trends: t('down')}).components.trends.classification, 'caution');
assert.equal(computeAutomaticSignal({trends: t('stable')}).components.trends.classification, 'favorable');
assert.equal(computeAutomaticSignal({images: i('ambiguous')}).components.images.classification, 'insufficient');
assert.equal(computeAutomaticSignal({images: i('absent')}).components.images.classification, 'unfavorable');
const glimpse = computeAutomaticSignal({glimpse: g('strong')});
assert.equal(glimpse.components.glimpse.label, 'Forte');
assert.equal(glimpse.components.glimpse.monthlyVolume, '8K');
assert.equal(computeAutomaticSignal({glimpse: g('medium')}).components.glimpse.classification, 'caution');
assert.equal(computeAutomaticSignal({glimpse: g('limited')}).components.glimpse.classification, 'insufficient');
assert.equal(computeAutomaticSignal({images: {currentByCountry: [{status: 'dominant', country: 'US', capturedAt: '2026-09-20', refinementOf: 'consulta anterior'}]}}).components.images.dominanceContext, 'after_refinement');
assert.equal(computeAutomaticSignal({trends: {assessments: [{status: 'up', capturedAt: '2026-09-20'}, {status: 'down', capturedAt: '2026-09-22'}]}}).components.trends.status, 'down', 'a avaliação mais recente prevalece mesmo se a ordem do histórico não for cronológica');

const [observabilityDomain, manager, top, styles] = await Promise.all([
  readFile(new URL('../src/curadoria/curation-observability-domain.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/curadoria/gerentes/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/curadoria/top-performance/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/curadoria/trends-sheet.css', import.meta.url), 'utf8'),
]);
assert.ok(observabilityDomain.includes('automatic_signal_version') && observabilityDomain.includes('automatic_signal_components'), 'snapshot decisao congela versão e componentes do sinal automático');
assert.ok(manager.includes('automaticSignalBadge') && top.includes('automaticSignalBadge'), 'as duas listagens exibem a coluna automática');
const badgeStyle = styles.match(/\.automatic-signal\{([^}]+)\}/)?.[1] || '';
assert.ok(badgeStyle.includes('flex-direction:row') && badgeStyle.includes('white-space:nowrap'), 'resultado e cobertura do sinal automático devem ficar na mesma linha');
assert.ok(manager.includes("addEventListener('pageshow'") && top.includes("addEventListener('pageshow'"), 'voltar do Glimpse atualiza as avaliações mais recentes');
assert.ok(manager.includes('latestTrendIndex.set(record.productKey') && top.includes('latestTrendIndex.set(record.offerId'), 'salvamentos de Trends atualizam o índice de sinal sem nova varredura do histórico');
assert.ok(manager.includes('updateLatestImageSnapshotIndex(record.productKey,record)') && top.includes('updateLatestImageSnapshotIndex(record.offerId,record)'), 'salvamentos de Imagens atualizam o índice mais recente');
console.log('automatic signal rules, coverage, component classifications and UI integration ok');

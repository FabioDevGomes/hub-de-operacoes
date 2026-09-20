import assert from 'node:assert/strict';
import { parseClassic, parseModern, upsertCollection, upsertAssessment, appendAssessment, latestAssessment, resultLabel, exploreUrl, VIEW_TYPES, RESULT_TYPES } from '../src/curadoria/trends-domain.mjs';

const classic = parseClassic(`Orivelle\nTermo de pesquisa\nMundo\nÚltimos 30 dias\nPesquisa na Web\nInteresse por região\n1\nJersey100\n2\nIsrael5\nMostrando 1 a 5 de 26 regiões\nAssuntos relacionados\n1\nDerila - Assunto\nPesquisas relacionadas\n1\nderila ergo`);
assert.equal(classic.valid, true);
assert.equal(classic.view, VIEW_TYPES.CLASSIC);
assert.equal(classic.term, 'Orivelle');
assert.deepEqual(classic.regions[0], { rank: 1, region: 'Jersey', interest: 100 });
assert.equal(classic.coverage.total, 26);

const modern = parseModern(`Orivelle\nTermo de pesquisa\nInteresse ao longo do tempo\nMundo · Último mês\n-50%\nem comparação ao mês anterior\n+400%\nem comparação ao mesmo período do ano anterior\nInteresse por região\nGoogle Trends\nÍndice e Região\tInteresse na pesquisa\n1\tIsrael\n2\tIrlanda\n1–5 de 25\nConsultas mais pesquisadas`);
assert.equal(modern.valid, true);
assert.equal(modern.monthDelta, -50);
assert.equal(modern.yearDelta, 400);
assert.deepEqual(modern.regions[0], { rank: 1, name: 'Israel' });

const updated = upsertCollection([{ date: '2026-09-13', view: 'classic', value: 1 }], { date: '2026-09-13', view: 'classic', value: 2 });
assert.equal(updated.length, 1);
assert.equal(updated[0].value, 2);

const assessments = upsertAssessment([{ date: '2026-09-12', capturedAt: '2026-09-12T10:00:00Z', status: RESULT_TYPES.STABLE }], { date: '2026-09-13', capturedAt: '2026-09-13T10:00:00Z', status: RESULT_TYPES.UP });
assert.equal(latestAssessment(assessments).status, RESULT_TYPES.UP);
const auditTrail = appendAssessment(
  [{ date: '2026-09-13', capturedAt: '2026-09-13T10:00:00Z', status: RESULT_TYPES.STABLE }],
  { date: '2026-09-13', capturedAt: '2026-09-13T11:00:00Z', status: RESULT_TYPES.DOWN },
);
assert.equal(auditTrail.length, 2);
assert.equal(latestAssessment(auditTrail).status, RESULT_TYPES.DOWN);
assert.equal(resultLabel(RESULT_TYPES.LOW_VOLUME), 'Volume baixo');
assert.match(exploreUrl('Water Freedom System'), /q=Water%20Freedom%20System/);
console.log('trends domain ok');

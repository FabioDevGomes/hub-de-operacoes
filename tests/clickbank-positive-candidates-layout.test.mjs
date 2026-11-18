import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const html=await readFile(new URL('src/curadoria/clickbank-top-offers/index.html',root),'utf8');
const css=await readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers.css',root),'utf8');
const view=await readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',root),'utf8');
const page=await readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',root),'utf8');

assert.ok(html.includes('Candidatas a palavras-chave positivas')&&html.includes('Novas candidatas · uma por linha'),'a tela identifica a lista positiva e orienta a colagem por linha');
assert.ok(html.includes('id="addTrendCandidates"')&&html.includes('id="trendCandidates"')&&html.includes('id="trendCandidateCount"'),'a entrada, a lista salva e a contagem permanecem conectadas');
assert.ok(css.includes('grid-template-columns:minmax(245px,.82fr) minmax(300px,1.18fr)')&&css.includes('#offerSheet #trendCandidates .keyword-candidate.trends-keyword-candidate{display:grid'),'entrada e termos salvos seguem a disposição em duas colunas com itens verdes alinhados');
assert.ok(view.includes('input.value.split(/\\r?\\n/u)')&&view.includes('actions.addTrendCandidates(activeOfferKey,terms)'),'o botão transforma cada linha colada em uma candidata independente');
assert.ok(page.includes('async function addTrendCandidates(offerKey,values)')&&page.includes('new Set(candidates.map(Domain.normalize))'),'a gravação em lote evita duplicatas normalizadas');
assert.ok(page.includes('Array.from(term).length>80')&&page.includes('candidates.length+additions.length>100'),'a lista respeita os mesmos limites de transferência da criação de campanha');
assert.ok(page.includes('Storage.putOfferRecord(Storage.STORES.trends,stored)'),'as candidatas continuam salvas no mesmo registro de Trends');
assert.ok(page.includes('positiveKeywords: source?.keywords || trendRecord.keywordCandidates || []'),'a lista positiva continua disponível para a criação de campanhas');

console.log('clickbank positive candidates layout ok');

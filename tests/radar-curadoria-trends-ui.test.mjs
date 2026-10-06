import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html = await readFile(new URL('../dist/curadoria/index.html', import.meta.url), 'utf8');
assert.ok(html.includes("import * as KeywordCandidatesUI from './keyword-candidates-ui.mjs?v=2'"));
assert.ok(html.includes("import {mountCurationListFocus} from './list-focus.mjs?v=2'"));
assert.ok(html.includes("mountCurationListFocus('radar-spyhero',{blockingSelector:'#productSheet:not(.hidden)'})"));
assert.ok(html.includes('data-curation-focus="trends"') && html.includes('data-curation-focus="clickbank"') && html.includes('data-curation-focus="landing"'));
assert.ok(html.includes('data-product="${safe(x.id)}"'), 'cada linha Radar expõe chave estável para restaurar o foco');
assert.ok(html.includes('closeProductSheet({restoreFocus:false});await refresh();listFocus.restore();'), 'salvar Trends/ClickBank restaura o destaque após a lista ser redesenhada');
assert.ok(html.includes('id="spyHeroTrendKeywordInput"') && html.includes('id="spyHeroTrendKeywordAdd"'));
assert.ok(html.includes('id="spyHeroTrendKeywordList"') && html.includes('Candidatas à palavra-chave'));
assert.ok(html.includes('data-trends-result="point_peak"') && html.includes('Pico pontual'));
assert.ok(html.includes("if(event.key==='Enter'){event.preventDefault();addRadarTrendKeywordCandidate(record)}"));
assert.ok(html.includes('TrendsDomain.exploreUrl(term),\'google-trends-radar\''));
assert.ok(html.includes('variant:\'positive\''));
assert.ok(html.includes('trendsKeywordCandidates:old?.trendsKeywordCandidates||[]'), 'reimport must preserve candidate words');

const persist = html.match(/async function persistRadarTrendKeywordCandidates\(record,candidates\)\{([^}]+)\}/)?.[1] || '';
assert.ok(persist.includes('record.trendsKeywordCandidates=candidates') && persist.includes('await putMany([record])'));
assert.doesNotMatch(persist, /trendsAssessments|trendsCollections|history/, 'candidate maintenance must not create a Trends assessment/history entry');
assert.ok(!html.includes('Google Imagens · Radar SpyHero'), 'SpyHero candidate feature is Trends-only');
console.log('radar SpyHero Trends candidate UI ok');

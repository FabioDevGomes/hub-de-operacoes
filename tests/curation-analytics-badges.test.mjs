import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const root = new URL('../src/curadoria/', import.meta.url);
const consumers = [
  ['Hot Offers MS','hot-offers-ms/hot-offers-ms-view.mjs','trendBadge','imageBadge','glimpseBadge'],
  ['SmartAdv','smartadv-offers/smartadv-offers-view.mjs','trendsBadge','imagesBadge','glimpseBadge'],
  ['Top Offers CB','clickbank-top-offers/clickbank-top-offers-view.mjs','trendBadge','imageBadge','glimpseBadge'],
];
const css = await readFile(new URL('trends-sheet.css', root),'utf8');
function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function badgeRenderer(source, name, state) {
  const fn = source.match(new RegExp('  function '+name+'\\(item\\) \\{[\\s\\S]*?\\n  \\}'))?.[0];
  assert.ok(fn, 'renderizador ausente: '+name);
  const context = vm.createContext({
    escape, dateTime: value => value,
    Trends: {latestAssessment: () => state.trend, resultLabel: status => status || 'Não pesquisado'},
    Images: {progress: () => ({done:state.image?1:0,total:state.image?1:0,latest:new Map(state.image?[['US',state.image]]:[])}),resultLabel: status => status || 'Não verificado'},
    Glimpse: {compactSummary: analysis => analysis?'4K · Positivo':'Pesquisar'},
    KeywordCandidatesUI: {keywordCandidateMarkerHtml: count => count?' <span>· !</span>':''},
    Domain: {offerCountryCodes: () => state.image ? ['US'] : []},
    trendsFor: () => ({assessments:[],keywordCandidates:[]}), trendLatest: () => state.trend,
    imagesFor: () => ({assessments:[]}), countriesFor: () => state.image ? ['US'] : [],
    imageProgress: () => ({done:state.image?1:0,total:state.image?1:0,latest:new Map(state.image?[['US',state.image]]:[])}),
    glimpseFor: () => state.analysis, latestGlimpse: () => state.analysis,
  });
  vm.runInContext(fn+'; this.renderBadge='+name,context);
  return context.renderBadge({offerId:'test-offer',offerKey:'test-offer',productKey:'test-product'});
}
for (const [label,path,trendName,imageName,glimpseName] of consumers) {
  const source = await readFile(new URL(path,root),'utf8');
  test(label+': o status real dirige as cores dos atalhos, sem verde genérico de salvo', () => {
    for (const status of ['up','stable','down','low_volume','point_peak','no_data','inconclusive']) {
      const html=badgeRenderer(source,trendName,{trend:{status,countries:['US']}});
      assert.match(html,new RegExp('class="table-action trends-badge '+status+'"'));
      assert.match(html,/data-action="trends"/);
      assert.doesNotMatch(html,/\bsaved\b/);
    }
    for (const status of ['dominant','mixed','scarce','absent','ambiguous','inconclusive']) {
      const html=badgeRenderer(source,imageName,{image:{status,negativeKeywordCandidates:['teste']}});
      assert.match(html,new RegExp('class="table-action image-badge '+status+'"'));
      assert.match(html,/data-action="images"/);
      assert.match(html,/· !/,'marcador de negativas preservado');
      assert.doesNotMatch(html,/\bsaved\b/);
    }
    assert.match(badgeRenderer(source,trendName,{}),/class="table-action trends-badge unsearched"/);
    if(label!=='SmartAdv') assert.match(badgeRenderer(source,imageName,{}),/class="table-action image-badge unverified"/);
    assert.match(badgeRenderer(source,glimpseName,{}),/class="table-action glimpse-badge unsearched"/);
    assert.match(badgeRenderer(source,glimpseName,{analysis:{capturedAt:'2026-01-01'}}),/class="table-action glimpse-badge saved"/);
    assert.match(badgeRenderer(source,trendName,{trend:{status:'"><img src=x>'}}),/trends-badge &quot;&gt;&lt;img src=x&gt;/,'status externo escapado');
  });
}
test('paleta E-commerce GM, sombra suave e alinhamento têm uma fonte compartilhada', () => {
  assert.match(css,/html body :is\(button\.trends-badge,button\.image-badge,\.glimpse-badge\)\{[\s\S]*?align-items:center;justify-content:center[\s\S]*?box-shadow:0 3px 9px rgba\(0,0,0,\.16\)/);
  for (const [state,bg,color] of [
    ['up','#102d24','#83e5bb'],['stable','#132b44','#a9d6ff'],
    ['down','#301823','#ffb5c3'],['low_volume','#292511','#ffe58a'],
    ['point_peak','#211b38','#d4c4ff'],['no_data','#18202d','#ccd4df'],
    ['inconclusive','#2a2113','#ffd99e'],
  ]) {
    assert.match(css,new RegExp('html body [^{]*button\\.trends-badge\\.'+state+'[^}]*--curation-badge-bg:'+bg+';--curation-badge-text:'+color));
  }
  assert.match(css,/html body \.glimpse-badge\{background:transparent;color:#c9c9ff\}/);
  assert.match(css,/html body \.glimpse-badge\.saved\{background:transparent;color:#83e5bb\}/);
});
test('somente estados explicitamente sem pesquisa usam baixo contraste sem apagar estados avaliados', () => {
  assert.match(css,/button\.trends-badge\.unsearched[^}]*background:#182337;color:#8794a5/);
  assert.match(css,/\.glimpse-badge\.unsearched[^}]*background:#182337;color:#8794a5/);
  assert.match(css,/button\.image-badge\.unverified[^}]*background:#182337;color:#8794a5/);
  assert.match(css,/button\.decision-badge\.undefined\{color:#8794a5\}/);
  assert.doesNotMatch(css,/\.trends-badge:not\(\.up\).*color:#8794a5/,'Sem dados e outros resultados não entram por exclusão genérica');
  for (const state of ['up','stable','down','low_volume','point_peak','inconclusive','dominant','mixed','scarce','absent','ambiguous','saved']) {
    assert.ok(css.includes('.'+state), 'estado semântico preservado: '+state);
  }
});
test('todas as listas da Curadoria carregam a mesma folha atualizada', async () => {
  for (const path of ['index.html','gerentes/index.html','top-performance/index.html','hot-offers-ms/index.html','smartadv-offers/index.html','clickbank-top-offers/index.html','manual/index.html']) {
    const page=await readFile(new URL(path,root),'utf8'),version='20261021-curation-low-contrast';
    assert.ok(page.includes(`trends-sheet.css?v=${version}`));
  }
  const topPerformance=await readFile(new URL('top-performance/index.html',root),'utf8');
  assert.ok(topPerformance.includes('curation-low-contrast-states.mjs?v=1'),'a tabela inline sincroniza classes nos quatro botões após renderização');
});

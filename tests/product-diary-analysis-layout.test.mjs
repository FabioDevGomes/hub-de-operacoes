import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const template = await readFile(new URL('../src/product-diary/template.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/product-diary/product-diary.css', import.meta.url), 'utf8');
const diaryHead = template.match(/<div id="productDiaryPanel" class="card panel">\s*<div class="panel-head">([\s\S]*?)<\/div>\s*<div id="productTableWrap"/);
assert.match(template, /<div id="productCaptureAnalysis" class="product-capture-analysis hidden">/, 'o painel conjunto deve existir no template do Diário');
assert.match(template, /<section id="productCaptureChart" class="card product-capture-chart"[\s\S]*?<h3 id="productCaptureChartTitle">Cliques e impressões por captura<\/h3>[\s\S]*?<label for="productCaptureChartDate">Data<select id="productCaptureChartDate"[\s\S]*?<\/section>\s*<aside id="productCampaignKeywordInventory" class="card product-campaign-keyword-inventory"/, 'gráfico e palavras-chave devem ter cartões irmãos, com data dentro do cartão do gráfico');
assert.ok(diaryHead, 'o cabeçalho do Diário deve estar presente');
assert.match(diaryHead[1], /id="productCampaignPresell"/, 'o link da pré-sell deve ficar no cabeçalho do Diário');
assert.doesNotMatch(template.match(/<div id="productCampaignEventsToolbar">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] || '', /id="productCampaignPresell"/, 'o link da pré-sell não deve permanecer no bloco de eventos');
assert.match(styles, /#productView \.product-capture-analysis\{display:grid;grid-template-columns:minmax\(0,1\.3fr\) minmax\(320px,\.9fr\)/, 'os cartões devem ficar lado a lado em telas largas');
assert.match(styles, /#productView \.product-capture-analysis\{[^}]*align-items:start/, 'os cartões não devem se esticar para a altura do irmão mais alto');
assert.match(styles, /#productView \.product-campaign-keyword-inventory\{display:grid;grid-template-rows:auto auto;align-content:start;gap:10px;align-self:start\}/, 'as seções positivas e negativas devem usar somente a altura do próprio conteúdo');
assert.match(styles, /@media\(max-width:980px\)\{#productView \.product-capture-analysis\{grid-template-columns:minmax\(0,1fr\)\}/, 'os cartões devem empilhar em telas menores');
assert.match(styles, /@media\(max-width:620px\)[\s\S]*?#productView \.product-campaign-keyword-inventory\{grid-template-columns:minmax\(0,1fr\)\}/, 'as tabelas de palavras-chave devem empilhar em telas estreitas');
console.log('product diary capture and keyword panels layout ok');

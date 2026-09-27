import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Glimpse é uma ferramenta compartilhada nas duas listas',async()=>{
  const [manager,top,page,styles,shortcut,glimpsePage,glimpseStyles]=await Promise.all([
    readFile(new URL('../src/curadoria/gerentes/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/trends-sheet.css',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse-shortcut.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/glimpse-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/glimpse.css',import.meta.url),'utf8')
  ]);
  assert.match(manager,/data-sort="glimpse"/);
  assert.match(manager,/glimpse-storage\.mjs/);
  assert.match(top,/data-open-top-glimpse/);
  assert.match(top,/glimpse-storage\.mjs/);
  assert.match(page,/Colar dados do Glimpse \/ Google Trends/);
  assert.match(page,/Ao colar aqui, a análise é feita automaticamente/);
  assert.match(page,/>Analisar novamente</);
  assert.match(page,/Indicadores principais/);
  assert.match(page,/id="v2Details"/);
  assert.match(page,/id="confidenceValue"/);
  assert.match(page,/id="alertRows"/);
  assert.match(page,/id="dimensionRows"/);
  assert.match(page,/id="signalReasons"/);
  assert.match(page,/Intenção das queries/);
  assert.match(page,/Sinais emergentes/);
  assert.match(page,/glimpse-page\.mjs\?v=3/);
  assert.match(glimpsePage,/addEventListener\('paste',\(\)=>setTimeout\(\(\)=>analyzeInput\(true\),0\)\)/);
  assert.match(glimpsePage,/Análise preparada automaticamente\. Revise os dados; clique em Concluir para salvar\./);
  assert.match(glimpsePage,/Domain\.movementValueLabel\(p\.movement\.percent\)/);
  assert.match(glimpsePage,/i\.intent\?\.commercialCount\?\?legacyCommercial/);
  assert.match(glimpsePage,/renderV2Details\(analysis\)/);
  assert.match(glimpsePage,/analysis\.signal\.reasons/);
  assert.match(glimpsePage,/Analisador \$\{item\.analyzerVersion\}/,'histórico identifica explicitamente a versão gravada sem recalcular coletas antigas');
  assert.match(glimpsePage,/movementCard\.dataset\.direction=/);
  assert.match(glimpseStyles,/strong\[data-direction="negative"\]\{color:var\(--red\)\}/);
  assert.match(glimpseStyles,/strong\[data-direction="positive"\]\{color:var\(--green\)\}/);
  assert.match(glimpsePage,/\$\('#finish'\)\.onclick=async\(\)=>\{if\(draft&&!history\.some/);
  assert.match(styles,/\.glimpse-badge:hover,\.glimpse-badge:focus-visible/);
  assert.match(styles,/filter:brightness\(1\.25\)/);
  assert.match(manager,/glimpse-shortcut\.mjs\?v=1" data-origin="manager"/);
  assert.match(top,/glimpse-shortcut\.mjs\?v=1" data-origin="top"/);
  assert.match(shortcut,/Abrir Glimpse/);
  assert.match(shortcut,/origin==='top'\?topContext\(\):managerContext\(\)/);
});

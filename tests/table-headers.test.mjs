import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entryPages = [
  ['../src/index.template.html', 9],
  ['../src/asset-studio/index.html', 9],
  ['../src/curadoria/glimpse/index.html', 9],
  ['../src/preparador-MCC/index.html', 9],
  ['../src/curadoria/hot-offers-ms/index.html', 9],
];
for (const [file, version] of entryPages) {
  const html = await readFile(new URL(file, import.meta.url), 'utf8');
  assert.match(html, new RegExp(`href="/table-headers\\.css\\?v=${version}"`), `${file} não carrega os estilos globais de tabelas atualizados`);
}

for (const file of [
  '../src/curadoria/index.html',
  '../src/curadoria/gerentes/index.html',
  '../src/curadoria/top-performance/index.html',
  '../src/curadoria/hot-offers-ms/index.html',
  '../src/curadoria/smartadv-offers/index.html',
  '../src/curadoria/clickbank-top-offers/index.html',
]) {
  const html = await readFile(new URL(file, import.meta.url), 'utf8');
  const version = '20261007-glimpse-borderless';
  assert.match(html, new RegExp(`trends-sheet\\.css\\?v=${version}`), `${file} não carrega a folha compartilhada de curadoria atualizada`);
}
const curationStyles = await readFile(new URL('../src/curadoria/trends-sheet.css', import.meta.url), 'utf8');
assert.match(curationStyles, /^@import url\("\/table-headers\.css\?v=9"\);/, 'as listas de curadoria não importam o padrão global');

const css = await readFile(new URL('../src/table-headers.css', import.meta.url), 'utf8');
assert.match(css, /table thead th[\s\S]*?font-weight:\s*400\s*!important/i);
assert.match(css, /table thead th \*[\s\S]*?font-weight:\s*400\s*!important/i);
assert.match(css, /text-transform:\s*lowercase\s*!important/i);
assert.match(css, /table thead th::first-letter[\s\S]*?text-transform:\s*uppercase\s*!important/i);
assert.match(css, /letter-spacing:\s*normal\s*!important/i);
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?min-height:\s*28px\s*!important/i, 'ações em células de tabela devem compartilhar a altura compacta');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?font-weight:\s*400\s*!important/i, 'ações em células de tabela devem usar peso regular');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?border:\s*0\s*!important/i, 'ações em células de tabela devem ficar sem borda');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\)[\s\S]*?box-shadow:\s*0 4px 9px rgba\(0, 0, 0, \.55\)\s*!important/i, 'ações em células de tabela devem compartilhar a sombra preta aprovada');
assert.match(css, /table tbody td :is\(button, input\[type="button"\], input\[type="submit"\], \[role="button"\], a\.btn, a\.table-action, a\.glimpse-badge\):not\(\.hub-corner-edit\):not\(\.hub-discreet-action\):is\(:hover, :focus-visible\)[\s\S]*?box-shadow:\s*0 5px 12px rgba\(0, 0, 0, \.65\)\s*!important/i, 'hover e foco das ações elevadas não devem sobrescrever ações discretas');
assert.doesNotMatch(css, /box-shadow:[^;]*(?:rgba\(37,\s*117,\s*205|rgba\(115,\s*159,\s*207)/i, 'o padrão das ações em tabela não deve incluir brilho colorido ou claro');
assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid rgba\(101, 169, 255, \.45\)/i, 'o foco de teclado deve permanecer visível, separado da sombra');
assert.equal((css.match(/:not\(\.hub-corner-edit\):not\(\.hub-discreet-action\)/g) || []).length, 3, 'as ações discretas devem ser excluídas da elevação global em base, hover e foco');
assert.match(css, /\.hub-table-toolbar-actions \.btn[\s\S]*?font-weight:\s*400\s*!important[\s\S]*?border:\s*0\s*!important[\s\S]*?box-shadow:\s*0 4px 9px rgba\(0, 0, 0, \.55\)\s*!important/i, 'ações opcionais no canto da tabela reutilizam peso regular, sem borda e sombra padrão');
assert.match(css, /\.hub-table-toolbar-actions \.btn:is\(:hover, :focus-visible\)[\s\S]*?box-shadow:\s*0 5px 12px rgba\(0, 0, 0, \.65\)\s*!important/i, 'a sombra das ações de canto aumenta em hover/foco');

const buttonBehaviorSelector = 'html body table.hub-table-button-behavior :is(button, input[type="button"], input[type="submit"], input[type="reset"], a.hub-table-button-appearance)';
assert.ok(css.replace(/\r\n/g, '\n').includes(buttonBehaviorSelector + ':hover:not(:focus-visible) {\n  outline: none !important;'), 'o hover dos botões opt-in não deve ter contorno, sem esconder foco de teclado');
assert.ok(css.replace(/\r\n/g, '\n').includes(buttonBehaviorSelector + ':focus-visible {\n  outline: 2px solid rgba(101, 169, 255, .45) !important;'), 'botões opt-in preservam o foco de teclado também no cabeçalho');
const behaviorRules = css.match(/html body table\.hub-table-button-behavior[^}]+\}/g) || [];
assert.equal(behaviorRules.length, 4);
const liftRule = behaviorRules.find(rule => rule.includes('tbody td')) || '';
assert.match(liftRule, /:not\(:disabled, \.hub-corner-edit, \.hub-discreet-action\):is\(:hover, :focus-visible\)/, 'a elevação exclui desabilitados e ações discretas');
assert.match(liftRule, /filter:\s*brightness\(1\.25\);[\s\S]*transform:\s*translateY\(-1px\)/, 'os botões elevados usam o movimento e brilho aprovados da Decisão');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.hub-table-button-behavior tbody td[\s\S]*transition:\s*none !important;[\s\S]*transform:\s*none !important;/, 'movimento reduzido remove a elevação e a transição');
assert.ok(css.includes(buttonBehaviorSelector + '[data-curation-focus].curation-focus-pulse'), 'o retorno ao botão da tabela reutiliza o estado compartilhado, sem alterar o helper');
assert.match(css, /animation-name:\s*hub-table-return-button-pulse\s*!important/, 'o controle deve substituir a animação azul legada');
const returnAnimation = css.match(/@keyframes hub-table-return-button-pulse\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.match(returnAnimation, /filter:\s*brightness\(1\.25\)/, 'o retorno continua sinalizando o botão por brilho');
assert.doesNotMatch(returnAnimation, /outline|border|box-shadow/, 'o pulso de retorno não pode recriar contorno ou halo azul');
for (const rule of behaviorRules) {
  const selector = rule.split('{')[0];
  assert.ok(selector.includes('a.hub-table-button-appearance'), 'links com pedido explícito reutilizam o padrão sem virar botões');
  assert.doesNotMatch(selector.replace('a.hub-table-button-appearance', ''), /\[role=|a\.|\ba(?:\s|\[|:)/, 'links sem opt-in e papéis ARIA genéricos continuam fora do comportamento de botão');
}
for (const page of [
  'index.html',
  'gerentes/index.html',
  'top-performance/index.html',
  'hot-offers-ms/index.html',
  'smartadv-offers/index.html',
  'clickbank-top-offers/index.html',
  'glimpse/index.html',
]) {
  for (const tree of ['src', 'dist']) {
    const html = await readFile(new URL(`../${tree}/curadoria/${page}`, import.meta.url), 'utf8');
    assert.match(html, /href="\/table-headers\.css\?v=9"/, `${tree}/${page} deve carregar diretamente o comportamento compartilhado atualizado`);
    const tables = [...html.matchAll(/<table\b[^>]*>/g)];
    assert.ok(tables.length, `${tree}/${page} deve ter tabelas cobertas pelo contrato`);
    for (const [tag] of tables) {
      const classes = tag.match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) || [];
      assert.ok(classes.includes('hub-table-button-behavior'), `${tree}/${page}: ${tag} deve adotar o comportamento de botões, inclusive em tabelas auxiliares`);
    }
  }
}

const build = await readFile(new URL('../build.mjs', import.meta.url), 'utf8');
assert.match(build, /src\/table-headers\.css"\), resolve\(root, "dist\/table-headers\.css"\)/, 'o build não publica o CSS compartilhado');

console.log('table header styles ok');

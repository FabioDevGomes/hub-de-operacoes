import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../'+path,import.meta.url),'utf8');
const controls = ':is(button, input[type="button"], input[type="submit"], input[type="reset"])';
const scope = 'html body .hub-button-hover-effects '+controls;

test('Meu Tempo opta apenas pelos efeitos compartilhados em toda a raiz, inclusive diálogos',async()=>{
  const [source,published,view,css,publishedCss] = await Promise.all([
    read('src/index.template.html'),read('dist/index.html'),read('src/meu-tempo/meu-tempo-view.mjs'),
    read('src/table-headers.css'),read('dist/table-headers.css'),
  ]);
  assert.equal(css,publishedCss);
  for(const app of [source,published]) {
    assert.match(app,/<div id="timeModuleRoot" class="hub-button-hover-effects">/);
    assert.match(app,/href="\/table-headers\.css\?v=10"/);
    assert.equal((app.match(/class="hub-button-hover-effects"/g)||[]).length,1,'não propagar para outras telas/sidebar');
  }
  assert.match(view,/root\.innerHTML=`[\s\S]*?time-shell[\s\S]*?renderItemEditDialog[\s\S]*?timeCellModal/,'diálogos permanecem dentro da raiz');
  assert.doesNotMatch(view,/hub-table-button-behavior/,'não adotar formato da Curadoria na tabela de Meu Tempo');
  const shared=css.match(/html body table\.hub-table-button-behavior tbody td[^{}]+\{([^}]+)\}/);
  assert.ok(shared?.[0].includes(scope+':not(:disabled, [aria-disabled="true"]):is(:hover, :focus-visible):not(:active)'));
  assert.match(shared[1],/filter: brightness\(1\.25\);/);
  assert.match(shared[1],/transform: translateY\(-1px\);/);
  assert.doesNotMatch(shared[1],/padding|margin|width|height|font|border|outline|background|box-shadow/,'só brilho/movimento, sem alterar formato');
});

test('efeitos preservam links, campos, foco, disabled, pressionado e movimento reduzido',async()=>{
  const css=await read('src/table-headers.css');
  const ownRules=[...css.matchAll(/html body \.hub-button-hover-effects[^{}]+\{([^}]+)\}/g)];
  assert.equal(ownRules.length,3,'realce, transição e movimento reduzido');
  for(const rule of ownRules) {
    assert.doesNotMatch(rule[0].split('{')[0],/a\.|\[role=|input\[type="(?:text|number|checkbox)"\]/,'links e campos não são botões');
    assert.doesNotMatch(rule[1],/padding|margin|width|height|font|border|outline|color|background\s*:|box-shadow\s*:/,'sem aparência ou geometria novas');
  }
  assert.ok(css.includes(scope+':not(:disabled, [aria-disabled="true"]) {'));
  assert.match(ownRules[1][1],/filter \.15s ease, transform \.15s ease !important/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*html body \.hub-button-hover-effects[\s\S]*transition: none !important;[\s\S]*transform: none !important;/);
  const white=await read('src/white-button.css');
  assert.match(white,/body \.btn\.hub-white-button:active:not\(:disabled\)\{[\s\S]*?transform:translateY\(1px\)/,'pressionado conserva o bisel original');
  assert.match(white,/body \.btn\.hub-white-button:focus-visible\{outline:2px solid/,'foco acessível continua no consumidor');
});

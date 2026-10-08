import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const [page,controller,styles,distPage,distController,distStyles]=await Promise.all([
  readFile(new URL('../src/curadoria/glimpse/index.html',import.meta.url),'utf8'),
  readFile(new URL('../src/curadoria/glimpse/glimpse-page.mjs',import.meta.url),'utf8'),
  readFile(new URL('../src/curadoria/glimpse/glimpse.css',import.meta.url),'utf8'),
  readFile(new URL('../dist/curadoria/glimpse/index.html',import.meta.url),'utf8'),
  readFile(new URL('../dist/curadoria/glimpse/glimpse-page.mjs',import.meta.url),'utf8'),
  readFile(new URL('../dist/curadoria/glimpse/glimpse.css',import.meta.url),'utf8')
]);

test('todas as fichas Glimpse usam retorno explícito sem Cancelar no rodapé',()=>{
  assert.equal(distPage,page,'o HTML servido corresponde à fonte');
  assert.equal(distController,controller,'a lógica servida corresponde à fonte');
  assert.equal(distStyles,styles,'os estilos servidos correspondem à fonte');
  assert.doesNotMatch(page,/<footer class="footer">/,'não há um segundo retorno durante a carga da referência');
  assert.match(controller,/referencePresentation=true/,'links antigos de todas as origens adotam o padrão');
  const clickbankBranch=controller.match(/if\(referencePresentation\)\{([^}]*)\}/)?.[1]||'';
  assert.match(clickbankBranch,/\$\('\.footer'\)\?\.remove\(\)/,'a ficha ClickBank remove o botão e toda a faixa do rodapé');
  assert.match(controller,/const cancelButton=\$\('#cancel'\);if\(cancelButton\)cancelButton\.onclick=/,'as telas restantes mantêm a ação de retorno');
  assert.match(styles,/html\.embedded \.footer\{padding:8px 0\}/,'as outras fichas incorporadas mantêm o estilo do rodapé');
});

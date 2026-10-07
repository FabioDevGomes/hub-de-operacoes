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

test('Top Offers CB remove o botão Cancelar e sua faixa apenas na ficha ClickBank',()=>{
  assert.equal(distPage,page,'o HTML servido corresponde à fonte');
  assert.equal(distController,controller,'a lógica servida corresponde à fonte');
  assert.equal(distStyles,styles,'os estilos servidos correspondem à fonte');
  assert.match(page,/<footer class="footer"><button class="button" id="cancel"[^>]*>Cancelar<\/button><\/footer>/,'o rodapé continua disponível nos outros hosts Glimpse');
  const clickbankBranch=controller.match(/if\(clickbankOrigin\)\{([^}]*)\}/)?.[1]||'';
  assert.match(clickbankBranch,/\$\('\.footer'\)\?\.remove\(\)/,'a ficha ClickBank remove o botão e toda a faixa do rodapé');
  assert.match(controller,/const cancelButton=\$\('#cancel'\);if\(cancelButton\)cancelButton\.onclick=/,'as telas restantes mantêm a ação de retorno');
  assert.match(styles,/html\.embedded \.footer\{padding:8px 0\}/,'as outras fichas incorporadas mantêm o estilo do rodapé');
});

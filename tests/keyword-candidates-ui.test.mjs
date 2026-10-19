import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {keywordCandidateMarkerHtml,renderKeywordCandidates} from '../dist/curadoria/keyword-candidates-ui.mjs';

const imagesStyles=await readFile(new URL('../dist/curadoria/trends-sheet.css',import.meta.url),'utf8');
assert.ok(imagesStyles.includes('.image-candidate{font-size:.9rem;font-weight:400}'),'candidatas de Google Imagens devem ter peso normal');
assert.ok(imagesStyles.includes('.keyword-candidate.trends-keyword-candidate,\n.keyword-candidate.trends-keyword-candidate .keyword-candidate-text{font-weight:400}'),'texto das candidatas Google Trends deve usar peso regular em todas as telas compartilhadas');
const positiveSearchStyle=imagesStyles.match(/\.keyword-candidate\.trends-keyword-candidate \.keyword-candidate-search\{([^}]*)\}/)?.[1]||'';
assert.ok(['appearance:none','-webkit-appearance:none','border:1px solid rgba(53,198,145,.42)','border-radius:7px','background:rgba(5,34,24,.38)','box-shadow:none','color:#83e5bb','font-size:.578rem','font-weight:400'].every(style=>positiveSearchStyle.includes(style)),'pesquisar das candidatas Trends deve compartilhar o botão verde plano sem relevo');
assert.ok(imagesStyles.includes('.keyword-candidate.image-candidate .keyword-candidate-search{border-color:rgba(169,214,255,.35);background:rgba(7,22,40,.25);font-weight:400}'),'estilo das candidatas negativas de Imagens deve permanecer independente');
assert.ok(!imagesStyles.includes('.keyword-candidate.trends-keyword-candidate.saved'),'a regra compartilhada não deve alterar aparência de candidatas salvas de Imagens');
for(const page of ['index.html','gerentes/index.html','top-performance/index.html','clickbank-top-offers/index.html','hot-offers-ms/index.html','manual/index.html','smartadv-offers/index.html']){
  const html=await readFile(new URL(`../dist/curadoria/${page}`,import.meta.url),'utf8');
  assert.match(html,/trends-sheet\.css\?v=20261016-trends-keyword-candidates-flat/,`${page} deve carregar o CSS compartilhado atualizado`);
}

assert.equal(keywordCandidateMarkerHtml(0), '', 'não deve mostrar marcador sem candidatas');
assert.match(keywordCandidateMarkerHtml(1), /keyword-candidate-marker positive[^>]*>.*keyword-candidate-marker-dot[^>]*>·.*keyword-candidate-marker-exclamation[^>]*>!/);
assert.match(keywordCandidateMarkerHtml(3, 'negative'), /keyword-candidate-marker negative[^>]*>.*keyword-candidate-marker-dot[^>]*>·.*keyword-candidate-marker-exclamation[^>]*>!/);
assert.match(keywordCandidateMarkerHtml(1, 'negative'), /candidatas à negativação/);

class FakeElement {
  constructor(ownerDocument, tagName = 'span') {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.textContent = '';
    const classes = new Set();
    this.classList = {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(this, tagName); }
}

const document = new FakeDocument();
const container = new FakeElement(document, 'div');
let searched = null;
let removed = null;
renderKeywordCandidates(container, {
  candidates: ['<script>alert(1)</script>', 'second'],
  variant: 'negative',
  searchContext: 'Google Imagens · DE',
  onSearch: candidates => { searched = candidates; },
  onRemove: (value, index) => { removed = [value, index]; },
});

assert.equal(container.children.length, 2);
const [itemList, searchAll] = container.children;
assert.equal(itemList.className, 'keyword-candidate-items');
assert.equal(itemList.children.length, 2);
assert.equal(searchAll.className, 'btn primary image-search-button image-candidate-search-all');
assert.equal(searchAll.textContent, 'Pesquisar imagens (excluindo todas)');
assert.match(searchAll.title, /<script>alert\(1\)<\/script>, second/);
assert.equal(container.classList.contains('image-candidate-collection'), true);
const [first] = itemList.children;
assert.equal(first.className, 'keyword-candidate image-candidate');
assert.equal(first.children[0].textContent, '<script>alert(1)</script>');
assert.equal(first.children.length, 2, 'a candidata negativa não deve ter botão individual de pesquisa');
first.children[1].onclick({preventDefault() {}, stopPropagation() {}});
assert.deepEqual(removed, ['<script>alert(1)</script>', 0]);
searchAll.onclick({preventDefault() {}, stopPropagation() {}});
assert.deepEqual(searched, ['<script>alert(1)</script>', 'second'], 'a busca coletiva deve receber todas as candidatas de uma vez');

renderKeywordCandidates(container, {
  candidates: ['saved'], variant: 'negative', saved: true,
  onSearch() {}, onRemove() {},
});
assert.equal(container.children[0].children[0].className, 'keyword-candidate image-candidate saved');
assert.equal(container.children[0].children[0].children.length, 1, 'saved negative candidates do not expose per-word search or removal');
assert.equal(container.children[1].className, 'btn primary image-search-button image-candidate-search-all');

removed = null;
renderKeywordCandidates(container, {
  candidates: ['persistent'], variant: 'negative', saved: true, showRemoveForSaved: true,
  onRemove: (value, index) => { removed = [value, index]; },
});
const persistentCandidate = container.children[0].children[0];
assert.equal(persistentCandidate.className, 'keyword-candidate image-candidate saved', 'candidata permanece marcada como salva mesmo exibindo remoção');
assert.equal(persistentCandidate.children.length, 2, 'telas que habilitam remoção mantêm o X após salvar/reabrir');
persistentCandidate.children[1].onclick({preventDefault() {}, stopPropagation() {}});
assert.deepEqual(removed, ['persistent', 0]);

searched = null;
renderKeywordCandidates(container, {
  candidates: ['trend idea'], variant: 'positive', onSearch: (value, index) => { searched = [value, index]; },
});
assert.equal(container.children[0].children[1].className, 'keyword-candidate-search', 'Google Trends keeps its per-keyword search');
container.children[0].children[1].onclick({preventDefault() {}, stopPropagation() {}});
assert.deepEqual(searched, ['trend idea', 0]);

renderKeywordCandidates(container, {candidates: [], emptyText: 'Lista vazia'});
assert.equal(container.children[0].textContent, 'Lista vazia');
console.log('keyword candidates ui ok');

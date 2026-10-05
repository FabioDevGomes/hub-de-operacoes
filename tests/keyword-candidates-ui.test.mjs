import assert from 'node:assert/strict';
import {keywordCandidateMarkerHtml,renderKeywordCandidates} from '../dist/curadoria/keyword-candidates-ui.mjs';

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

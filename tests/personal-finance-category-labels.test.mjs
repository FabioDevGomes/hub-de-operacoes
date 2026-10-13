import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('    const categoryGroups ='), source.indexOf('    const categoryPanel ='));
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function categoryFixture() {
  const state = {
    groups: [{ group_id: 'synthetic-group', name: 'Grupo de teste', active: true }],
    categories: [
      { category_id: 'synthetic-a', name: 'Categoria A', group_id: 'synthetic-group', currency: 'BRL', default_plan: null, active: true },
      { category_id: 'synthetic-b', name: 'Categoria B', group_id: 'synthetic-group', currency: 'USD', default_plan: 12, active: false },
      { category_id: 'synthetic-c', name: 'Categoria <C>', group_id: 'synthetic-group', currency: 'BRL', default_plan: 0, active: true },
    ],
  };
  const before = structuredClone(state);
  const context = vm.createContext({ state, esc });
  vm.runInContext(`${renderer}\nglobalThis.result = { categories, categoryGroups };`, context);
  assert.deepEqual(state, before, 'Renderização não pode alterar os dados das categorias');
  return context.result;
}

test('Catálogo mostra somente os nomes das categorias e preserva ações e dados', () => {
  const { categories } = categoryFixture();
  assert.doesNotMatch(categories, /<small|padrão|não definido| · BRL| · USD/);
  for (const name of ['Categoria A', 'Categoria B', 'Categoria &lt;C&gt;']) assert.ok(categories.includes(`<strong>${name}</strong>`));
  assert.equal((categories.match(/data-action="edit-category"/g) || []).length, 3);
  assert.equal((categories.match(/data-action="toggle-category"/g) || []).length, 3);
  assert.equal((categories.match(/data-action="move-category"/g) || []).length, 4);
  assert.match(categories, /data-id="synthetic-b">Ativar<\/button>/);
  assert.match(categories, /data-id="synthetic-a">Inativar<\/button>/);
});

test('Grupos conservam a contagem de categorias e suas ações', () => {
  const { categoryGroups } = categoryFixture();
  assert.match(categoryGroups, /<small>3 categoria\(s\) vinculada\(s\)<\/small>/);
  assert.match(categoryGroups, /data-action="edit-group"/);
  assert.match(categoryGroups, /data-action="toggle-group"/);
});

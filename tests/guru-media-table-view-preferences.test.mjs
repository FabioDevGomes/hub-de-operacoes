import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLE_VIEW_PREFERENCES_KEY,
  captureGuruMediaTablePreferences,
  readGuruMediaTablePreferences,
  restoreGuruMediaTableFilters,
  saveGuruMediaTablePreferences
} from '../src/curadoria/top-performance/table-view-preferences.mjs';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

test('persiste filtros e ordenação com uma chave isolada para a tabela Guru Media', () => {
  const storage = memoryStorage();
  const root = { getElementById: id => ({ value: ({ search: 'gauge', categoryFilter: 'health', visibilityFilter: 'all' })[id] || '' }) };
  const saved = captureGuruMediaTablePreferences(root, { sortKey: 'movement', sortDirection: 'asc' });
  assert.equal(saveGuruMediaTablePreferences(saved, storage), true);
  const restored = readGuruMediaTablePreferences(storage);
  assert.equal(TABLE_VIEW_PREFERENCES_KEY, 'hub:curation:guru-media-top-performance:view:v1');
  assert.equal(restored.filters.search, 'gauge');
  assert.equal(restored.filters.categoryFilter, 'health');
  assert.equal(restored.filters.visibilityFilter, 'all');
  assert.equal(restored.sortKey, 'movement');
  assert.equal(restored.sortDirection, 'asc');
});

test('ignora estado inválido e usa padrões seguros', () => {
  const storage = memoryStorage({
    [TABLE_VIEW_PREFERENCES_KEY]: JSON.stringify({ filters: { visibilityFilter: 'unknown' }, sortKey: 'unsafe', sortDirection: 'sideways' })
  });
  const restored = readGuruMediaTablePreferences(storage);
  assert.equal(restored.filters.visibilityFilter, 'visible');
  assert.equal(restored.sortKey, 'payout');
  assert.equal(restored.sortDirection, 'desc');
});

test('restaura seleções de filtros dinâmicos somente quando a opção existe', () => {
  const controls = {
    categoryFilter: { tagName: 'SELECT', value: '', options: [{ value: '' }, { value: 'health' }] },
    countryFilter: { tagName: 'SELECT', value: '', options: [{ value: '' }] },
    languageFilter: { tagName: 'SELECT', value: '', options: [{ value: '' }, { value: 'de' }] },
    badgeFilter: { tagName: 'SELECT', value: '', options: [{ value: '' }, { value: 'best' }] }
  };
  const root = { getElementById: id => controls[id] };
  const preferences = { filters: { categoryFilter: 'health', countryFilter: 'US', languageFilter: 'de', badgeFilter: 'best' } };
  restoreGuruMediaTableFilters(root, preferences, { dynamic: true });
  restoreGuruMediaTableFilters(root, preferences);
  assert.equal(controls.categoryFilter.value, 'health');
  assert.equal(controls.countryFilter.value, '');
  assert.equal(controls.languageFilter.value, 'de');
  assert.equal(controls.badgeFilter.value, 'best');
});

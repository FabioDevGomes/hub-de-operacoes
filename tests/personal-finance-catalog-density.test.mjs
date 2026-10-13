import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const css = await readFile(new URL('../src/personal-finance/personal-finance.css', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/personal-finance/personal-finance-view.mjs', import.meta.url), 'utf8');

test('Categorias e grupos reduz a altura padrão em 25% apenas pelo padding vertical', () => {
  const rule = css.match(/\.pf-catalog-list>\.pf-catalog-row\{([^}]+)\}/);
  assert.ok(rule, 'A compactação deve ficar restrita ao catálogo');
  assert.equal(rule[1], 'padding-block:1.25px');
  // Browser baseline: two-line content 37px + border 1px + vertical padding 16px.
  assert.equal((37 + 1 + 2 * 1.25) / (37 + 1 + 2 * 8), .75);
  assert.ok(css.includes('.pf-catalog-row,.pf-position-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid rgba(36,52,77,.52)}'));
  assert.ok(css.includes('.pf-shell .pf-icon-button{padding:3.19px 5.95px;font-size:.578rem}'));
  assert.match(view, /class="pf-catalog-row"/);
  assert.match(view, /class="pf-catalog-row pf-category-catalog"/);
  assert.match(view, /<div class="pf-catalog-list">\$\{categoryGroups\}\$\{categories\}<\/div>/);
  assert.doesNotMatch(rule[1], /font|height|overflow|border|transform/);
});

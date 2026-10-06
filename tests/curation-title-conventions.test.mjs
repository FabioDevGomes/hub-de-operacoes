import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const radar = await readFile(new URL('../src/curadoria/index.html',import.meta.url),'utf8');
const managers = await readFile(new URL('../src/curadoria/gerentes/index.html',import.meta.url),'utf8');
const sharedCss = await readFile(new URL('../src/sidebar-component.css',import.meta.url),'utf8');
const maintenance = await readFile(new URL('../docs/maintenance.md',import.meta.url),'utf8');

test('Radar SpyHero and Lista de Gerente use the shared Curadoria eyebrow prefix', () => {
  assert.match(radar,/<div class="eyebrow">Curadoria · SpyHero<\/div><h1>Sinais para investigar<\/h1>/);
  assert.match(managers,/<div class="eyebrow">Curadoria · GuruMedia<\/div><h1>Lista de Gerente GM<\/h1>/);
});

test('the Curadoria eyebrow convention is documented for future screens', () => {
  assert.match(maintenance,/Nas telas da sessão Curadoria, use no eyebrow verde o prefixo \*\*Curadoria · \[fonte\]\*\*/);
});

test('Radar SpyHero and Lista de Gerente share the Curadoria page spacing and header typography', () => {
  for (const page of ['radar', 'manager']) {
    assert.ok(sharedCss.includes(`data-hub-sidebar-active="${page}"`), `${page} has a shared route rule`);
  }
  assert.match(sharedCss,/padding: 24px 28px 52px;/);
  assert.match(sharedCss,/padding: 18px;/);
  assert.match(sharedCss,/align-items: flex-start; gap: 18px; margin-bottom: 16px;/);
  assert.match(sharedCss,/color: #42e7c0; font-size: \.72rem; line-height: normal; letter-spacing: \.14em; font-weight: 400;/);
  assert.match(sharedCss,/font-size: 1\.2rem; line-height: normal; margin: 5px 0 3px;/);
});

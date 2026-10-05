import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';

const published = '../dist/curadoria/smartadv-offers/';
for (const file of ['index.html','smartadv-offers.css','smartadv-offers-domain.mjs','smartadv-offers-initial-capture.mjs','smartadv-offers-storage.mjs','smartadv-offers-view.mjs','smartadv-offers-page.mjs']) {
  await access(new URL(`${published}${file}`, import.meta.url));
}
const page = await readFile(new URL(`${published}index.html`, import.meta.url), 'utf8');
const curationHome = await readFile(new URL('../dist/curadoria/index.html', import.meta.url), 'utf8');
const sidebar = await readFile(new URL('../dist/sidebar-component.js', import.meta.url), 'utf8');
assert.ok(page.includes('Curadoria · SmartAdv'));
assert.ok(curationHome.includes('/curadoria/smartadv-offers/'));
assert.ok(sidebar.includes("key: 'smartadv-offers'"));

console.log('smartadv offers build ok');

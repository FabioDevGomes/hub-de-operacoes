import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseVersion, nextVersion, readmeVersionBlock, validateReleaseDocuments, readRelease, versionPage } from '../scripts/system-version.mjs';
import { updateVersion } from '../scripts/set-version.mjs';

const root = new URL('../', import.meta.url);
const release = await readRelease(fileURLToPath(root));
const source = await readFile(new URL('../src/system-version.js', import.meta.url), 'utf8');

test('versão estável válida; incremento maior e seguro', () => {
  assert.equal(parseVersion(' 1.2.3\n'), '1.2.3');
  for (const value of ['v1.2.3', '1.2', '01.2.3', '1.2.3-beta', '1.2.3<script>', '-1.2.3', '9007199254740992.0.0']) assert.throws(() => parseVersion(value));
  assert.equal(nextVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(nextVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(nextVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(nextVersion('1.2.3', '1.2.10'), '1.2.10');
  for (const value of ['1.2.3', '1.1.9', '0.9.0', 'patches']) assert.throws(() => nextVersion('1.2.3', value));
});

test('build rejeita versão divergente no README/CHANGELOG, inclusive bloco duplicado', () => {
  const readme = readmeVersionBlock('1.0.0');
  const changelog = '## [1.0.0] - 2026-10-09\n\n- Marco inicial.';
  assert.equal(validateReleaseDocuments('1.0.0', readme, changelog), '1.0.0');
  assert.equal(validateReleaseDocuments('1.0.0', readme.replaceAll('\n', '\r\n'), changelog), '1.0.0');
  assert.throws(() => validateReleaseDocuments('1.0.1', readme, changelog), /README/);
  assert.throws(() => validateReleaseDocuments('1.0.0', readme + readme, changelog), /README/);
  assert.throws(() => validateReleaseDocuments('1.0.0', readme, changelog.replace('1.0.0', '0.9.0')), /CHANGELOG/);
});

test('atualização explícita só altera os três documentos e preserva o histórico', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hub-version-'));
  try {
    const readme = 'Antes\n' + readmeVersionBlock('1.0.0') + '\nDepois\n';
    const changelog = '# Histórico\n\n## [1.0.0] - 2026-10-09\n\n- Inicial.\n';
    await Promise.all([['VERSION', '1.0.0\n'], ['README.md', readme], ['CHANGELOG.md', changelog]]
      .map(([file, text]) => writeFile(join(directory, file), text)));
    await assert.rejects(updateVersion(directory, 'patch', ''), /descrição/);
    await assert.rejects(updateVersion(directory, '1.0.0', 'Não pode repetir'), /maior/);
    assert.equal((await readRelease(directory)).version, '1.0.0');
    assert.equal(await updateVersion(directory, 'minor', 'Adiciona recurso compatível', '2026-10-10'), '1.1.0');
    const updated = await readRelease(directory);
    assert.equal(updated.version, '1.1.0');
    assert.ok(updated.readme.startsWith('Antes\n') && updated.readme.endsWith('\nDepois\n'));
    assert.ok(updated.changelog.includes('## [1.1.0] - 2026-10-10\n\n- Adiciona recurso compatível'));
    assert.ok(updated.changelog.includes(changelog.split('## ')[1]));
    assert.deepEqual((await readdir(directory)).sort(), ['CHANGELOG.md', 'README.md', 'VERSION']);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('hub-version-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('página versionada é idempotente; templates parciais ficam intactos', () => {
  const page = '<!doctype html><html><head><title>Meu Tempo</title></head><body><h1>Meu Tempo</h1></body></html>';
  const decorated = versionPage(page, '1.2.3');
  assert.match(decorated, /<title>Hub v1.2.3 · Meu Tempo<\/title>/);
  assert.equal(versionPage(decorated, '1.2.3'), decorated);
  assert.equal((versionPage(decorated, '1.2.4').match(/meta name="hub-system-version"/g) || []).length, 1);
  assert.match(versionPage(decorated, '1.2.4'), /Hub v1.2.4 · Meu Tempo/);
  assert.equal(versionPage('<section><h1>Tela</h1></section>', '1.2.3'), '<section><h1>Tela</h1></section>');
  assert.throws(() => versionPage('<html><head></head></html>', '1.2.3'), /title\/head/);
});

async function completePages(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) result.push(...await completePages(path));
    else if (entry.name.endsWith('.html') && /<html(?:\s|>)/i.test(await readFile(path, 'utf8'))) result.push(path);
  }
  return result;
}

test('todas as páginas completas canônicas publicam versão e assets; não usa payload JSON', async () => {
  const pages = await completePages(new URL('../src/', import.meta.url));
  assert.ok(pages.length >= 11, 'inclui SPA, Preparador, Curadorias, Glimpse e Asset Studio');
  for (const page of pages) {
    const relative = page.href.split('/src/')[1].replace('index.template.html', 'index.html');
    const html = await readFile(new URL('../dist/' + relative, import.meta.url), 'utf8');
    assert.ok(html.includes(`<meta name="hub-system-version" content="${release.version}">`), relative);
    assert.ok(html.includes(`/system-version.js?v=${release.version}`), relative);
    assert.ok(html.includes(`/system-version.css?v=${release.version}`), relative);
    assert.ok(html.includes(`<title>Hub v${release.version} · `), relative);
    assert.equal((html.match(/name="hub-system-version"/g) || []).length, 1, relative);
  }
  for (const file of ['system-version.js', 'system-version.css']) {
    assert.equal(await readFile(new URL('../src/' + file, import.meta.url), 'utf8'), await readFile(new URL('../dist/' + file, import.meta.url), 'utf8'));
  }
  assert.doesNotMatch(source, /localStorage|indexedDB|fetch\(|XMLHttpRequest/);
});

function browserHarness({ embedded = false, version = '1.2.3', loading = false } = {}) {
  const badgeList = [], classes = new Set();
  let callback, ready, titleWrites = 0, observerCalls = 0, storedTitle = 'Visão geral';
  const heading = {
    textContent: 'Visão geral', classList: { add: value => classes.add(value) },
    insertAdjacentElement: (position, badge) => { assert.equal(position, 'afterend'); badgeList.push(badge); },
  };
  const document = {
    readyState: loading ? 'loading' : 'complete', head: {},
    get title() { return storedTitle; }, set title(value) { storedTitle = value; titleWrites++; },
    querySelector: selector => selector.startsWith('meta[') ? { content: version }
      : selector === 'main h1, h1' ? heading : badgeList[0],
    createElement: tag => { assert.equal(tag, 'span'); return { dataset: {}, setAttribute(key, value) { this[key] = value; } }; },
    addEventListener: (name, fn, options) => { assert.equal(name, 'DOMContentLoaded'); assert.equal(options.once, true); ready = fn; },
  };
  const window = {}; window.self = window; window.top = embedded ? {} : window;
  class MutationObserver {
    constructor(fn) { callback = fn; }
    observe(target, options) { assert.equal(target, document.head); assert.ok(options.subtree && options.childList && options.characterData); observerCalls++; }
  }
  vm.runInNewContext(source, { document, window, MutationObserver });
  return { document, window, heading, classes, badgeList, refresh: () => callback?.(), ready: () => ready?.(), writes: () => titleWrites, observers: () => observerCalls };
}

test('título acompanha navegação/subabas/campanhas sem repetir versão ou perder contexto', () => {
  const h = browserHarness();
  assert.equal(h.document.title, 'Hub v1.2.3 · Visão geral');
  for (const name of ['Meu Tempo · Histórico', 'Campanha sintética 01', 'Glimpse · Produto sintético']) {
    h.document.title = name; h.refresh();
    assert.equal(h.document.title, 'Hub v1.2.3 · ' + name);
    const writes = h.writes(); h.refresh(); assert.equal(h.writes(), writes, 'sem loop de observação');
  }
  h.document.title = 'Hub v1.0.0 · Outra tela'; h.refresh();
  assert.equal(h.document.title, 'Hub v1.2.3 · Outra tela');
  assert.equal(h.badgeList.length, 1);
  assert.equal(h.badgeList[0].textContent, 'v1.2.3');
  assert.equal(h.badgeList[0]['aria-label'], 'Versão do sistema: 1.2.3');
  assert.equal(h.heading.textContent, 'Visão geral', 'selo não entra no texto do título contextual');
  assert.ok(h.classes.has('hub-version-heading'));
});

test('aguarda DOM; iframe mantém título sem selo duplicado e metadado inválido não interfere', () => {
  const h = browserHarness({ loading: true });
  assert.equal(h.observers(), 0); h.ready();
  assert.equal(h.observers(), 1); assert.equal(h.badgeList.length, 1);
  const iframe = browserHarness({ embedded: true });
  assert.equal(iframe.badgeList.length, 0);
  assert.equal(iframe.document.title, 'Hub v1.2.3 · Visão geral');
  const invalid = browserHarness({ version: 'inválida' });
  assert.equal(invalid.document.title, 'Visão geral');
  assert.equal(invalid.badgeList.length, 0); assert.equal(invalid.observers(), 0);
});

import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
async function htmlPages(directory='src') {
  const found=[];
  for(const entry of await readdir(new URL('../'+directory+'/',import.meta.url),{withFileTypes:true})) {
    const path=directory+'/'+entry.name;
    if(entry.isDirectory())found.push(...await htmlPages(path));
    else if(entry.name.endsWith('.html') && (await read(path)).includes('</head>'))found.push(path);
  }
  return found;
}

test('every standalone screen and the SPA load the published global input standard', async () => {
  const [source,built,build] = await Promise.all([read('src/input-standard.css'),read('dist/input-standard.css'),read('build.mjs')]);
  assert.equal(source,built);
  assert.ok(build.includes('src/input-standard.css'));
  const pages=await htmlPages();
  assert.ok(pages.length>=10);
  for(const path of pages) {
    const html=await read(path);
    const publishedPath=path==='src/index.template.html'?'dist/index.html':path.replace(/^src\//,'dist/');
    assert.ok(html.includes('href="/input-standard.css?v=1"'),path);
    assert.ok((await read(publishedPath)).includes('href="/input-standard.css?v=1"'),publishedPath);
  }
});

test('global input presentation excludes native controls and preserves geometry and accessible states', async () => {
  const css=await read('src/input-standard.css');
  assert.ok(css.includes('@import url("/control-surfaces.css?v=5")'));
  for(const type of ['checkbox','radio','file','hidden','range','color','button','submit','reset','image']) {
    assert.equal(css.split(':not([type="'+type+'"])').length-1,4,type);
  }
  assert.ok(css.includes('background: var(--hub-input-inset-bg) !important'));
  assert.ok(css.includes('box-shadow: var(--hub-input-inset-shadow) !important'));
  assert.ok(css.includes('border-color: transparent !important'));
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('var(--hub-control-focus) !important'));
  assert.ok(css.includes(':is([aria-invalid="true"],.invalid,.error,:invalid)'));
  assert.ok(css.includes('var(--hub-control-error) !important'));
  assert.ok(css.includes(':disabled'));
  assert.ok(!css.match(/(?:^|\n)\s*(?:width|height|padding|font-size|border-width|border):/), 'global surface must not change component dimensions');
  assert.ok(!css.match(/(?:select|textarea)\s*[{,:]/), 'selects and textareas retain their own contract');
});

import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {cp,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import vm from 'node:vm';
import {test} from 'node:test';

const root=fileURLToPath(new URL('../',import.meta.url)),run=promisify(execFile);
const canonical=join(root,'src/preparador-MCC/index.html');
test('Preparador published page matches canonical source and preserves executable contracts',async()=>{
  const source=await readFile(canonical),published=await readFile(join(root,'dist/preparador-MCC/index.html'));
  assert.deepEqual(published,source,'run node build.mjs: Preparador must come from src, without transformations');
  const html=source.toString('utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  for(const contract of ['window.__hubReceiveMccD0Grid','window.__hubReceiveMccD1Grid','id="apply-manifest"',
    'const PANEL_DB_VERSION = HubDatabase.DB_VERSION;','const PANEL_DB_NAME = HubDatabase.DB_NAME;','/database.js',
    '/sidebar-component.js','/sidebar-component.css','/table-headers.css',
    "import('../billing/billing-storage.mjs?v=5')"]){
    assert.ok(html.includes(contract),'existing contract missing: '+contract);
  }
  // Behavioral parsing, receiver, safety and persistence regressions remain in
  // preparador-d0/d1, mcc-grid-production, mcc-numbering and mcc-extension-parity.
});
test('clean isolated build creates Preparador and rebuilds from src without publishing historical copies',async t=>{
  const temporary=await mkdtemp(join(tmpdir(),'hub-preparer-build-'));
  t.after(async()=>{
    // Only remove the exact fixture directory created by this test.
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));
    assert.ok(basename(temporary).startsWith('hub-preparer-build-'));
    await rm(temporary,{recursive:true,force:true});
  });
  await cp(join(root,'build.mjs'),join(temporary,'build.mjs'));
  await cp(join(root,'src'),join(temporary,'src'),{recursive:true});
  // Local backups are deliberately not canonical inputs or distribution files.
  await writeFile(join(temporary,'src/preparador-MCC/index.before-test.html'),'synthetic unused historical page','utf8');
  const source=await readFile(canonical);
  const build=()=>run(process.execPath,[join(temporary,'build.mjs')],{cwd:temporary,windowsHide:true,maxBuffer:1024*1024});
  await build();
  const output=join(temporary,'dist/preparador-MCC/index.html');
  assert.deepEqual(await readFile(output),source);
  assert.deepEqual(await readdir(join(temporary,'dist/preparador-MCC')),['index.html']);
  // Corrupt only the disposable generated fixture, never the real dist or base.
  await writeFile(output,'synthetic stale output','utf8');
  await build();
  assert.deepEqual(await readFile(output),source,'rebuild must restore the canonical page');
  const changed=Buffer.concat([source,Buffer.from('\n<!-- synthetic build marker -->\n')]);
  await writeFile(join(temporary,'src/preparador-MCC/index.html'),changed);
  await build();
  assert.deepEqual(await readFile(output),changed,'source changes must propagate on build');
  assert.deepEqual(await readFile(canonical),source,'test must not alter the real source');
});

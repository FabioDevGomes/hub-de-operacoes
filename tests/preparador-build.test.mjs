import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
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
    "import('../billing/billing-storage.mjs?v=7')"]){
    assert.ok(html.includes(contract),'existing contract missing: '+contract);
  }
  assert.match(html,/h1\s*\{[^}]*font-size:\s*clamp\(\.93rem,\s*1\.8vw,\s*1\.41rem\)/,'título do Preparador deve seguir a escala compacta compartilhada do Hub');
  assert.match(html,/\.subtitle\s*\{[^}]*font-size:\s*\.92rem/,'texto auxiliar deve seguir a escala tipográfica das telas compartilhadas');
  assert.match(html,/Carregue o D0 ou os relatórios D−1 e D0, confira as diferenças e atualize a base\./,'descrição do Preparador deve resumir o fluxo de carga');
  assert.match(html,/\.upload-grid\s*\{[^}]*align-items:\s*start/,'captura carregada não deve esticar o cartão vazio');
  assert.match(html,/\.paste-box\.loaded\s*\{[^}]*grid-template-areas:\s*"label label" "area meta"/,'resumo carregado deve ficar ao lado da área de colagem');
  assert.match(html,/\.paste-box\.loaded \.file-meta\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,'indicadores da captura devem formar blocos curtos em três colunas');
  assert.match(html,/\.file-meta\[hidden\]\s*\{\s*display:\s*none/,'resumo vazio não deve renderizar uma borda sem conteúdo');
  assert.match(html,/\.paste-box\.loaded \.paste-area\s*\{[^}]*height:\s*60px/,'área da captura deve ficar compacta após o carregamento');
  assert.ok(html.includes("classList.toggle('has-capture', Object.values(slots).some(item => Boolean(item && !item.error)))"),'cartão vazio não acompanha o tamanho inicial depois da captura');
  assert.match(html,/\.paste-box\.loaded \.paste-actions\s*\{\s*display:\s*none/,'orientações de colagem não devem ocupar espaço depois da captura');
  assert.equal((html.match(/class="file-input" type="file" accept="\.csv,text\/csv"/g)||[]).length,2,'D−1 e D0 devem manter o fallback CSV');
  assert.match(html,/\.upload-grid\.has-capture \.paste-box:not\(\.loaded\):not\(\.error\) \.paste-actions \.helper\s*\{\s*display:\s*none/,'compactar o cartão vazio não deve esconder seu seletor CSV');
  assert.match(html,/\.file-meta\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,'resumo da captura deve distribuir os dados em uma grade compacta');
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
  await mkdir(join(temporary,'scripts'));
  await cp(join(root,'scripts/distribution-privacy.mjs'),join(temporary,'scripts/distribution-privacy.mjs'));
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

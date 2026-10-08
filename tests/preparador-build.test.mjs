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
  const d1Panel=html.indexOf('id="d1-changes-panel"');
  const reportsPanel=html.indexOf('<section class="panel" aria-labelledby="step1-title">');
  const validationPanel=html.indexOf('id="validation-panel"');
  assert.ok(d1Panel>=0 && d1Panel<reportsPanel && reportsPanel<validationPanel,'fechamento D−1 precede Relatórios da MCC e Validação na ordem do documento');
  assert.equal((html.match(/id="d1-changes-panel"/g)||[]).length,1,'o quadro D−1 é movido, não duplicado');
  assert.match(html,/\.steps > #d0-changes-panel\s*\{\s*order:\s*-1/,'a prioridade visual anterior do histórico D0 permanece');
  assert.equal((html.match(/<table class="delta-table"/g)||[]).length,2,'D0 e D−1 compartilham o mesmo estilo de linhas');
  assert.match(html,/\.delta-table th, \.delta-table td\s*\{\s*padding-block:\s*6px;\s*\}/,'as duas tabelas de alterações usam linhas cerca de 20% mais baixas, sem reduzir a fonte');
  assert.match(html,/th, td\s*\{\s*padding:\s*10px 12px;/,'a compactação das alterações não reduz as células das outras tabelas');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  for(const contract of ['window.__hubReceiveMccD0Grid','window.__hubReceiveMccD1Grid','id="apply-manifest"',
    'class="button ghost hub-panel-action" id="clear-all"','class="button primary hub-panel-action" id="apply-manifest"',
    'const PANEL_DB_VERSION = HubDatabase.DB_VERSION;','const PANEL_DB_NAME = HubDatabase.DB_NAME;','/database.js',
    '/sidebar-component.js','/sidebar-component.css','/table-headers.css',
    "import('../billing/billing-storage.mjs?v=7')"]){
    assert.ok(html.includes(contract),'existing contract missing: '+contract);
  }
  assert.match(html,/h1\s*\{[^}]*font-size:\s*clamp\(\.93rem,\s*1\.8vw,\s*1\.41rem\)/,'título do Preparador deve seguir a escala compacta compartilhada do Hub');
  assert.match(html,/\.subtitle\s*\{[^}]*font-size:\s*\.92rem/,'texto auxiliar deve seguir a escala tipográfica das telas compartilhadas');
  assert.ok(!html.includes('Carregue D−1, D0 ou ambos, confira as diferenças e atualize a base.'),'a descrição removida não deve aparecer no cabeçalho do Preparador');
  assert.match(html,/\.capture-grid\s*\{[^}]*align-items:\s*start/,'cartões das capturas devem manter alinhamento compacto');
  assert.match(html,/\.capture-box\.loaded\s*\{[^}]*display:\s*block/,'captura carregada deve usar o cartão de resumo');
  assert.equal((html.match(/class="capture-summary" hidden/g)||[]).length,2,'D−1 e D0 devem exibir resumos no mesmo formato');
  assert.match(html,/\.capture-origin-mark\s*\{[^}]*width:\s*40px/,'resumo deve mostrar um identificador visual da origem, não um ícone de arquivo');
  assert.match(html,/originMark\.textContent = 'MCC'/,'identificador da captura deve mostrar a origem MCC');
  assert.ok(html.includes("originDetail.textContent = 'Grade da MCC · extensão'"),'resumo deve informar a origem da captura recebida');
  assert.ok(html.includes("metaLine('Campanhas válidas'") && html.includes("metaLine('Data detectada'") && html.includes("metaLine('Moedas'") && !html.includes("metaLine('Tipo de captura'") && !html.includes("metaLine('Consumo acumulado do dia'") && !html.includes('formatCaptureConsumption'),'resumo compacto mantém MCC, campanhas, data e moedas sem os dois campos removidos');
  assert.ok(!html.includes("metaLine('Arquivo'") && !html.includes('data.name'),'a interface não deve associar os dados a um nome de arquivo');
  assert.match(html,/\.capture-meta\[hidden\]\s*\{\s*display:\s*none/,'resumo vazio não deve renderizar uma borda sem conteúdo');
  assert.ok(!/<textarea\b|type="file"|Selecionar arquivo|Ctrl\+V/i.test(html),'a tela não deve incluir controles de colagem ou seleção manual de arquivo');
  assert.match(html,/\.capture-meta\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,'resumo da captura deve distribuir os dados em uma grade de duas colunas');
  assert.match(html,/\.button\.hub-panel-action\s*\{[^}]*min-height:\s*36px[^}]*padding:\s*8px 11px[^}]*border:\s*0[^}]*font-size:\s*\.78rem[^}]*font-weight:\s*400[^}]*box-shadow:\s*0 4px 9px rgba\(0, 0, 0, \.55\)/,'ações opt-in dos painéis repetem o padrão compacto do topo');
  assert.match(html,/\.button\.hub-panel-action\.primary\s*\{[^}]*var\(--curation-header-action-accent, #38bdf8\)/,'Atualizar base usa a configuração azul aprovada para ações primárias');
  assert.match(html,/section\[aria-labelledby="step1-title"\] > \.panel-head, #d0-changes-panel > \.panel-head, #d1-changes-panel > \.panel-head\s*\{\s*padding:\s*8px 16px/,'somente os cabeçalhos destacados do Preparador usam o espaçamento vertical mais compacto');
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

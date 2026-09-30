import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const domain = require('../src/control-macro/domain.js');
const template = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const databaseContext = vm.createContext({ window:{}, structuredClone });
vm.runInContext(await readFile(new URL('../src/database.js', import.meta.url), 'utf8'), databaseContext);
const db = databaseContext.window.CampaignDatabase;
let persisted = db.create();
persisted.diario = [{ campanha_id:'synthetic', data:'2026-09-29', celulas:{ O:{value:100}, P:{value:50}, C:{value:10}, F:{value:1} } }];
const state = { database:null, controlMacroRows:null };
const context = vm.createContext({ state, CampaignDatabase:db, ControlMacroDomain:domain, embeddedManifest:null,
  renderLegacyMigrationNotice(){}, render(){},
  openLocalDb:async () => ({ close(){}, transaction(names, mode){
    assert.equal(mode, 'readonly');
    const requests = [];
    const tx = { objectStore:name => ({
      get(){ const request = {}; requests.push([request, structuredClone(persisted)]); return request; },
      getAll(){ const request = {}; requests.push([request, []]); return request; },
    }) };
    queueMicrotask(() => { for(const [request,result] of requests){ request.result = result; request.onsuccess(); } tx.oncomplete(); });
    return tx;
  } }),
});
const helpers = ['macroHistory','refreshControlMacroCache','macroAllRows'].map(name => template.match(new RegExp(`function ${name}\\([^\\n]+`))[0]).join('\n');
const restoreStart = template.indexOf('    async function restoreLocalBase(');
const restoreEnd = template.indexOf('    async function restoreProductCatalog(', restoreStart);
vm.runInContext(`let derivedCache={stale:true};\n${helpers}\n${template.slice(restoreStart,restoreEnd)}`, context);
const september = () => context.macroAllRows().filter(row => row.date.startsWith('2026-09'));
assert.equal(september().length, 0, 'primeiro render ocorre antes da leitura assíncrona');
await context.restoreLocalBase({ persist:false, renderPage:false });
assert.equal(september().length, 1, 'carregar a base deve recalcular o Macro vazio');
assert.equal(september()[0].investment, 100);
assert.equal(vm.runInContext('derivedCache', context), null);
persisted.diario[0].celulas.O.value = 120;
await context.restoreLocalBase({ persist:false, renderPage:false });
assert.equal(september()[0].investment, 120, 'atualização de outra aba também invalida o resumo anterior');
console.log('Control Macro sync: async load and cross-tab cache refresh ok');

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('ROI update skips unrelated billing sync but still refreshes other tabs',async()=>{
  const source=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
  assert.match(source,/announceBaseUpdated\(\{reason:'campaign-minimum-roi'\}\)/);
  const body=source.match(/restoreLocalBase\(\{persist:false,renderPage:false,includeCatalog:true\}\)\.then\(async\(\)=>\{\s*(if\(event\.data\.reason[^\n]+)\s*render\(\);/);
  assert.ok(body,'other tabs must restore and render after the message');
  for(const [data,fromBase,expected] of [
    [{reason:'campaign-minimum-roi',source:'panel'},true,0],
    [{source:'panel'},true,1],
    [{reason:'campaign-minimum-roi',source:'mcc'},true,1],
    [{reason:'campaign-minimum-roi',source:'panel'},false,1]
  ]){
    let calls=0;
    const run=vm.runInNewContext(`(async()=>{${body[1]}})`,{event:{data},fromBase,syncMccDiaryRowsToBilling:()=>{calls++}});
    await run();assert.equal(calls,expected);
  }
});

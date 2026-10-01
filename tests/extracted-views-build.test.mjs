import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const template=await readFile(new URL('../src/index.template.html',import.meta.url),'utf8');
for(const [folder,token,section] of [['control-macro','CONTROL_MACRO','controlMacroView'],['cpa','CPA','cpaReportView'],['tested-products','TESTED_PRODUCTS','testedProductsView'],['overview','OVERVIEW','totalsView'],['product-diary','PRODUCT_DIARY','productView']]){
  test(folder+' canonical template and scripts are built without duplicated UI',async()=>{
    const markup=(await readFile(new URL('../src/'+folder+'/template.html',import.meta.url),'utf8')).trim();
    assert.ok(template.includes('__'+token+'_VIEW__'));assert.ok(!html.includes('__'+token+'_VIEW__'));
    assert.ok(html.includes(markup));assert.equal((html.match(new RegExp('id="'+section+'"','g'))||[]).length,1);
    const view=await readFile(new URL('../src/'+folder+'/view.js',import.meta.url),'utf8');
    assert.equal(view,await readFile(new URL('../dist/'+folder+'/view.js',import.meta.url),'utf8'));
    assert.ok(html.includes(folder+'/view.js?v=1'));new vm.Script(view);
    assert.ok(view.includes('root.querySelector('));assert.ok(!view.includes('document.querySelector('));
    if(folder!=='control-macro'&&folder!=='overview'){
      const domain=await readFile(new URL('../src/'+folder+'/domain.js',import.meta.url),'utf8');
      assert.equal(domain,await readFile(new URL('../dist/'+folder+'/domain.js',import.meta.url),'utf8'));
      new vm.Script(domain);
    }
  });
}

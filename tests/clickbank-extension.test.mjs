import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { CLICKBANK_COLUMNS, isClickBankMarketplace, productsToTsv } from '../extensions/mcc-d0-bridge/clickbank-domain.mjs';
import { collectClickBankProducts } from '../extensions/mcc-d0-bridge/clickbank-reader.mjs';
import { mountClickBankCapture } from '../extensions/mcc-d0-bridge/clickbank-popup.mjs';

const marketplace = 'https://accounts.clickbank.com/master/dashboard/affiliate-marketplace?v=1#/results?resultsPerPage=50&offset=0';
const attrs = attributes => ({ getAttribute:key => attributes[key] ?? null });
function fixture(t, { count=50, capped=false, missing=null, footer=true, total=1251, offset=0 } = {}) {
  const originals = new Map(['location','document','getComputedStyle','__hubClickBankProductsCapture'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => { for (const [key,descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]; } });
  delete globalThis.__hubClickBankProductsCapture;
  let styleText = 'border: 0;';
  const writes = [];
  const scroller = { isConnected:true, scrollTop:17, scrollLeft:22, clientWidth:400, scrollWidth:1200,
    get clientHeight() { return capped || !writes.length ? 200 : count*52; },
    get scrollHeight() { return count*52; } };
  const fields = CLICKBANK_COLUMNS.map((column,index) => ({...column, field:`opaqueField${index}`}));
  const visible = () => fields.slice(Math.floor(scroller.scrollLeft/800*6), Math.floor(scroller.scrollLeft/800*6)+3);
  const values = n => ({ rank:String(n+offset), name:`Produto sintético ${n}`, seller:`VENDOR${n}`, avg:'$55.41', initial:'$55.41', future:'-', epc:'$0.14', cvr:'0.26%', gravity:'40.87' });
  const grid = {
    isConnected:true, parentElement:null,
    getAttribute:key => key === 'style' ? styleText : null,
    setAttribute:(key,value) => { if (key === 'style') styleText=value; },
    removeAttribute:key => { if (key === 'style') styleText=null; },
    style:{ setProperty:(key,value,priority) => { writes.push([key,value,priority]); styleText=`${key}: ${value} !important`; } },
    getBoundingClientRect:() => ({height:280}),
    querySelector(selector) {
      if (selector === 'a[id="title-offer-details"]') return {};
      if (selector === '.MuiDataGrid-virtualScroller') return scroller;
      if (selector === '.MuiDataGrid-virtualScrollerContent') return {scrollHeight:count*52,getBoundingClientRect:()=>({height:count*52})};
      if (selector === '.MuiTablePagination-displayedRows' && footer) return {textContent:`${offset+1}–${offset+count} of ${total}`};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[role="columnheader"]') return visible().map(column => ({
        ...attrs({'data-field':column.field,'aria-colindex':String(fields.indexOf(column)+2)}), textContent:column.label,
        querySelector:()=>({textContent:column.label})
      }));
      if (selector !== '.MuiDataGrid-row') return [];
      const first = Math.floor(scroller.scrollTop/52);
      const size = capped ? 5 : count;
      return Array.from({length:Math.min(size,count-first)}, (_,i) => {
        const n = first+i+1, data = values(n);
        return {...attrs({'data-id':`row${n}`,'aria-rowindex':String(n+1)}),
          querySelectorAll:()=>[
            {...attrs({'data-field':'checkbox'}),textContent:'Menu',querySelector:()=>null},
            ...visible().filter(column=>column.key!==missing).reverse().map(column=>({
              ...attrs({'data-field':column.field,'aria-colindex':String(fields.indexOf(column)+2)}),
              textContent:data[column.key], querySelector:()=> column.key==='name' ? {textContent:data.name} : null
            })),
            {...attrs({'data-field':'actions'}),textContent:'Buy now',querySelector:()=>null}
          ]};
      });
    }
  };
  Object.assign(globalThis,{ location:{href:marketplace.replace('offset=0',`offset=${offset}`)},
    document:{body:{innerText:`${total} results`},querySelectorAll:()=>[grid]},getComputedStyle:()=>({overflowY:'visible'}) });
  return { grid, scroller, writes, get styleText(){return styleText;} };
}

test('ClickBank URLs are restricted and TSV protects names, normalizes cells and keeps nine columns', () => {
  assert.ok(isClickBankMarketplace(marketplace));
  for (const url of ['https://accounts.clickbank.com.evil.test/master/dashboard/affiliate-marketplace','http://accounts.clickbank.com/master/dashboard/affiliate-marketplace','https://accounts.clickbank.com/login','chrome://extensions']) assert.equal(isClickBankMarketplace(url),false);
  const tsv=productsToTsv([{rank:'1',name:' =HYPERLINK("test")\tname\n',seller:'@vendor',avg:'-1.20',future:'-'}]);
  assert.equal(tsv.split('\n').length,2);
  assert.equal(tsv.split('\n')[1].split('\t').length,9);
  assert.match(tsv,/'=HYPERLINK/); assert.match(tsv,/'@vendor/); assert.match(tsv,/\t-1\.20\t/);
});

test('50 products with both-axis virtualization, shuffled cells and repeat capture without duplicates; restore exact styles/scroll', async t => {
  const f=fixture(t,{capped:true});
  for (let attempt=0;attempt<2;attempt++) {
    const initialTop=17+attempt*100;
    f.scroller.scrollTop=initialTop;
    const result=await collectClickBankProducts(CLICKBANK_COLUMNS,'capture',{settleMs:0});
    assert.equal(result.ok,true,result.message); assert.equal(result.capturedCount,50);
    assert.deepEqual(result.rows.map(row=>row.rank),Array.from({length:50},(_,i)=>String(i+1)));
    assert.ok(result.rows.every(row=>Object.keys(row).length===9));
    assert.equal(result.rows[0].future,'-'); assert.equal(result.rows[0].gravity,'40.87');
    assert.equal(f.scroller.scrollTop,initialTop); assert.equal(f.scroller.scrollLeft,22);
  }
  assert.ok(f.writes.every(([, ,priority])=>priority==='important'));
  assert.equal((await collectClickBankProducts(CLICKBANK_COLUMNS,'restore')).ok,true);
  assert.equal(f.styleText,'border: 0;');
  assert.equal(globalThis.__hubClickBankProductsCapture.originals.size,0);
});

test('expanded table confirms a smaller page and last-page URL/total fallback', async t => {
  fixture(t,{count:1,total:51,offset:50,footer:false});
  const result=await collectClickBankProducts(CLICKBANK_COLUMNS,'capture',{settleMs:0});
  assert.equal(result.ok,true,result.message); assert.equal(result.expectedCount,1); assert.equal(result.rows[0].rank,'51');
});

test('missing horizontal metric does not announce complete capture', async t => {
  fixture(t,{count:3,missing:'gravity'});
  const result=await collectClickBankProducts(CLICKBANK_COLUMNS,'capture',{settleMs:0});
  assert.equal(result.ok,false); assert.equal(result.capturedCount,3); assert.match(result.message,/incompleta/);
});

test('unknown count, loading, wrong route, missing table, timeout and concurrent clicks fail safely', async t => {
  const f=fixture(t,{count:3,footer:false});
  globalThis.location.href=marketplace.split('#')[0];
  assert.equal((await collectClickBankProducts(CLICKBANK_COLUMNS)).ok,false);
  globalThis.location.href=marketplace;
  const originalAttribute=f.grid.getAttribute;
  f.grid.getAttribute=key=>key==='aria-busy'?'true':originalAttribute(key);
  assert.match((await collectClickBankProducts(CLICKBANK_COLUMNS)).message,/carregar/);
  f.grid.getAttribute=originalAttribute;
  const pending=collectClickBankProducts(CLICKBANK_COLUMNS,'capture',{settleMs:10,timeoutMs:1});
  assert.match((await collectClickBankProducts(CLICKBANK_COLUMNS)).message,/andamento/);
  assert.equal((await pending).ok,false);
  globalThis.location.href='https://example.com/';
  assert.equal((await collectClickBankProducts(CLICKBANK_COLUMNS)).ok,false);
  globalThis.location.href=marketplace; globalThis.document.querySelectorAll=()=>[];
  assert.match((await collectClickBankProducts(CLICKBANK_COLUMNS)).message,/ausente/);
});

function popupFixture(response, clipboard) {
  const node=()=>({disabled:false,hidden:true,value:'',textContent:'',selected:false,
    classList:{toggle(){}},addEventListener(type,handler){this[type]=handler;},focus(){},select(){this.selected=true;}});
  const nodes=Object.fromEntries(['capture-clickbank','restore-clickbank','clickbank-status','clickbank-manual','clickbank-text'].map(id=>[`#${id}`,node()]));
  const requests=[]; const disabled=[];
  mountClickBankCapture({document:{querySelector:key=>nodes[key]},sendMessage:async msg=>{requests.push(msg.type);return typeof response==='function'?response(msg):response;},clipboard,setDisabled:value=>disabled.push(value)});
  return {nodes,requests,disabled};
}

test('popup copies complete rows, reports real count, locks buttons and restores', async () => {
  let resolve, copied;
  const f=popupFixture(()=>new Promise(r=>resolve=r),{writeText:async text=>copied=text});
  const pending=f.nodes['#capture-clickbank'].click();
  await f.nodes['#capture-clickbank'].click();
  assert.equal(f.requests.length,1); assert.equal(f.nodes['#capture-clickbank'].disabled,true);
  assert.match(f.nodes['#clickbank-status'].textContent,/Preparando/);
  resolve({ok:true,result:{ok:true,rows:[{rank:'1',name:'Synthetic',seller:'TEST'}],capturedCount:1}});
  await pending;
  assert.match(copied,/Rank\tOffer Name/); assert.equal(f.nodes['#clickbank-manual'].hidden,true);
  assert.match(f.nodes['#clickbank-status'].textContent,/1 produtos copiados/);
  assert.equal(f.nodes['#capture-clickbank'].disabled,false);
  const restore=f.nodes['#restore-clickbank'].click(); resolve({ok:true,result:{message:'Restaurado'}}); await restore;
  assert.deepEqual(f.requests,['CAPTURE_CLICKBANK_PRODUCTS','RESTORE_CLICKBANK_TABLE']);
});

test('clipboard failure exposes selectable TSV; partial capture is explicitly warned and never auto-copied', async () => {
  let writes=0;
  const rows=[{rank:'1',name:'Synthetic'}];
  const f=popupFixture({ok:true,result:{ok:true,rows,capturedCount:1}},{writeText:async()=>{writes++;throw new Error('denied');}});
  await f.nodes['#capture-clickbank'].click();
  assert.equal(f.nodes['#clickbank-manual'].hidden,false); assert.equal(f.nodes['#clickbank-text'].selected,true);
  assert.match(f.nodes['#clickbank-status'].textContent,/Ctrl\+C/);
  const partial=popupFixture({ok:false,result:{ok:false,rows,message:'Captura incompleta: 1 de 50.'}},{writeText:async()=>writes++});
  await partial.nodes['#capture-clickbank'].click();
  assert.equal(writes,1); assert.equal(partial.nodes['#clickbank-manual'].hidden,false);
  assert.match(partial.nodes['#clickbank-status'].textContent,/incompleta/);
});

test('service worker rejects incompatible sites without injection and routes capture/restore in isolated context', async () => {
  const source=await readFile(new URL('../extensions/mcc-d0-bridge/background.js',import.meta.url),'utf8');
  let listener, options, tab={id:8,url:'https://example.com/'};
  const helper=()=>{};
  vm.runInNewContext(source.replace(/^import .*?;\s*/gm,''),{
    isClickBankMarketplace, CLICKBANK_COLUMNS,collectClickBankProducts:helper,
    chrome:{runtime:{onMessage:{addListener:value=>listener=value}},tabs:{query:async()=>[tab]},scripting:{executeScript:async value=>{options=value;return [{result:{ok:true,rows:[],capturedCount:0}}];}}}
  });
  const request=type=>new Promise(resolve=>listener({type},null,resolve));
  assert.equal((await request('CAPTURE_CLICKBANK_PRODUCTS')).ok,false); assert.equal(options,undefined);
  tab={id:8,url:marketplace};
  assert.equal((await request('CAPTURE_CLICKBANK_PRODUCTS')).ok,true);
  assert.equal(options.func,helper); assert.equal(options.target.tabId,8); assert.equal(options.world,undefined);
  await request('RESTORE_CLICKBANK_TABLE'); assert.equal(options.args[1],'restore');
});

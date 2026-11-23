import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {test} from 'node:test';

const context=vm.createContext({window:{}});
vm.runInContext(await readFile(new URL('../src/overview/bulk-adjustment-preview-domain.js',import.meta.url),'utf8'),context);
const domain=context.window.OverviewBulkAdjustmentPreviewDomain;

test('resuming a confirmed stale budget continues only campaigns without a final outcome',()=>{
  const campaigns=[{id:'already-applied'},{id:'stale-confirmation'},{id:'not-yet-run'},{id:'uncertain'},{id:'not-run'}];
  const outcomes=new Map([
    [campaigns[0],{status:'success'}],
    [campaigns[1],{status:'confirmation_required'}],
    [campaigns[3],{status:'uncertain'}],
    [campaigns[4],{status:'not_run'}]
  ]);

  assert.deepEqual(Array.from(domain.pendingItems(campaigns.map(row=>({row})),outcomes),item=>item.row.id),['stale-confirmation','not-yet-run']);

  outcomes.set(campaigns[1],{status:'success'});
  assert.deepEqual(Array.from(domain.pendingItems(campaigns.map(row=>({row})),outcomes),item=>item.row.id),['not-yet-run']);
});

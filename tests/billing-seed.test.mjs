import assert from 'node:assert/strict';
import { planSeedImport } from '../src/billing/billing-storage.mjs';

const seed = {
  version:1,
  sales:[{sale_id:'synthetic-sale-1'},{sale_id:'synthetic-sale-2'}],
  movements:[{movement_id:'synthetic-movement-1'}],
};

const plan1 = planSeedImport(seed);
assert.equal(plan1.sales.length,2);
assert.equal(plan1.movements.length,1);
const planAfterRestart = planSeedImport(seed, { installedVersion:1, existingSales:seed.sales.map(sale => sale.sale_id), existingMovements:seed.movements.map(move => move.movement_id) });
assert.deepEqual(planAfterRestart, { alreadyApplied:true, sales:[], movements:[] });
console.log('billing seed planner ok with synthetic data');

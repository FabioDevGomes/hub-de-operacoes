import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const guru=await readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8');
const clickbank=await readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs',import.meta.url),'utf8');

test('Guru Media badge derives Em análise from saved curation inputs before an assessment',()=>{
  assert.match(guru,/import \{hasSavedAnalysisInput\} from '\.\.\/saved-analysis-status\.mjs\?v=1'/);
  assert.match(guru,/inAnalysis=!latest&&hasSavedAnalysisInput\(\{trend\}\)/);
  assert.match(guru,/label=inAnalysis\?'Em análise':Trends\.resultLabel\(latest\?\.status\)/);
});

test('ClickBank badge includes saved trend and offer metadata before an assessment',()=>{
  assert.match(clickbank,/import \{hasSavedAnalysisInput\} from '\.\.\/saved-analysis-status\.mjs\?v=1'/);
  assert.match(clickbank,/inAnalysis=!latest&&hasSavedAnalysisInput\(\{trend,metadata:tableMetadataFor\(item\)\}\)/);
  assert.match(clickbank,/label=inAnalysis\?'Em análise':Trends\.resultLabel\(latest\?\.status\)/);
});

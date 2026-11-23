import test from 'node:test';
import assert from 'node:assert/strict';
import {hasSavedAnalysisInput} from '../src/curadoria/saved-analysis-status.mjs';

test('marks saved Trends drafts and metadata as analysis in progress',()=>{
  assert.equal(hasSavedAnalysisInput({trend:{pageDraft:{countries:['US']}}}),true);
  assert.equal(hasSavedAnalysisInput({trend:{salesPageType:'tsl'}}),true);
  assert.equal(hasSavedAnalysisInput({trend:{keywordCandidates:['product brand']}}),true);
  assert.equal(hasSavedAnalysisInput({trend:{searchHistory:[{term:'product'}]}}),true);
  assert.equal(hasSavedAnalysisInput({metadata:{manualCountries:['US']}}),true);
  assert.equal(hasSavedAnalysisInput({metadata:{brandBidding:'no_brand_bidding'}}),true);
});

test('keeps untouched offers without saved inputs unsearched',()=>{
  assert.equal(hasSavedAnalysisInput({trend:{assessments:[],keywordCandidates:[]},metadata:{manualCountries:[]}}),false);
  assert.equal(hasSavedAnalysisInput({}),false);
});

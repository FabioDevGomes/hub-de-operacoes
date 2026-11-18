import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { loadGoogleAdsCampaignBatches, saveGoogleAdsCampaignBatch } from '../src/google-ads/google-ads-campaign-batches-storage.mjs';
import { renderGoogleAdsCampaignCopySummary } from '../src/google-ads/google-ads-campaign-copy-summary-view.mjs';

class MemoryElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.textContent = '';
    this.className = '';
    this.open = false;
  }
  append(...children) { this.children.push(...children); }
}

const document = { createElement: tagName => new MemoryElement(tagName) };
function flattenText(element) {
  return [element.textContent, ...element.children.map(flattenText)].filter(Boolean).join(' ');
}

test('saved batch snapshot round-trips and renders headlines, descriptions and promotion details visibly', () => {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
  const formSnapshot = {
    headline: ['Título de teste 1', 'Título de teste 2'],
    description: ['Descrição de teste 1', 'Descrição de teste 2'],
    promotion_target: 'VenoPlus 8',
    promotion_occasion: 'BLACK_FRIDAY',
    discount_type: 'percent_off',
    discount_value: '62',
    trigger_type: 'none',
    trigger_value: '',
    language_code: 'en',
    final_url: 'https://example.test/presell',
    start_date: '',
    end_date: '',
  };
  saveGoogleAdsCampaignBatch({
    id: 'copy-summary-batch', label: 'Lote sintético', createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z', campaigns: [{
      managerCustomerId: '1234567890', customerId: '2234567890', campaignId: '123', campaignName: 'Campanha sintética',
    }], formSnapshot,
  }, { storage });

  const savedBatch = loadGoogleAdsCampaignBatches({ storage }).batches[0];
  const container = new MemoryElement('div');
  const rendered = renderGoogleAdsCampaignCopySummary({ document, container, snapshot: savedBatch.formSnapshot });
  const text = flattenText(rendered);

  assert.equal(rendered.className, 'google-ads-campaign-copy-summary');
  assert.match(text, /Título de teste 1/);
  assert.match(text, /Título de teste 2/);
  assert.match(text, /Descrição de teste 1/);
  assert.match(text, /Descrição de teste 2/);
  assert.match(text, /VenoPlus 8/);
  assert.match(text, /Black Friday/);
  assert.match(text, /Percentual/);
  assert.match(text, /62/);
  assert.match(text, /https:\/\/example\.test\/presell/);
  assert.equal(rendered.children[1].open, true, 'títulos e descrições ficam expandidos no lote salvo');
  assert.equal(rendered.children[2].open, true, 'promoção fica expandida no lote salvo');
});

test('campaign creation result connects a reopened batch snapshot to the saved-copy summary', async () => {
  const source = await readFile(new URL('../src/google-ads/google-ads-campaign-creation-view.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  function renderCampaignResult() {');
  const end = source.indexOf('\n  async function applyAudienceExclusionsBatch(', start);
  assert.ok(start >= 0 && end > start, 'saved campaign result renderer should exist');
  const renderer = source.slice(start, end);
  assert.match(renderer, /createdCampaigns\.length\s*&&\s*activeCampaignBatchFormRestored\s*&&\s*activeCampaignBatchFormSnapshot/);
  assert.match(renderer, /renderGoogleAdsCampaignCopySummary\(\{\s*document,\s*container:\s*resultArea,\s*snapshot:\s*activeCampaignBatchFormSnapshot\s*\}\)/);
});

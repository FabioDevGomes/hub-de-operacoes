import assert from 'node:assert/strict';
import {googleAdsCampaignBatchFinalUrlIndex} from '../src/google-ads/google-ads-campaign-batch-final-urls.mjs';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

test('history final URLs match exact account and campaign, preferring only verified batch updates',()=>{
  const customerId='1234567890';
  const originalUrl='https://store.example/presell/page-one';
  const updatedUrl='https://Store.example/presell/page-two';
  const signature=JSON.stringify([customerId,updatedUrl]);
  const index=googleAdsCampaignBatchFinalUrlIndex({batches:[
    {createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',campaigns:[
      {customerId,campaignId:'11',finalUrl:originalUrl},
      {customerId:'2234567890',campaignId:'11',finalUrl:'https://other.example/presell'},
      {customerId,campaignId:'12',finalUrl:'https://store.example/presell/safe'},
      {customerId,campaignId:'13',finalUrl:'javascript:alert(1)'},
      {customerId,campaignId:'14',finalUrl:'https://store.example/presell/old'},
    ]},
    {createdAt:'2026-10-02T00:00:00.000Z',updatedAt:'2026-10-02T00:00:00.000Z',destinationUrls:[{accountId:customerId,url:updatedUrl}],campaigns:[
      {customerId,campaignId:'11',finalUrl:originalUrl,destinationUrlResult:{verified:true,signature}},
      {customerId,campaignId:'12',finalUrl:'https://store.example/presell/safe',destinationUrlResult:{verified:false,signature:JSON.stringify([customerId,'https://store.example/presell/not-applied'])}},
      {customerId,campaignId:'14',finalUrl:''},
    ]}
  ]});

  assert.equal(index.get(`${customerId}:11`),updatedUrl);
  assert.equal(index.get('2234567890:11'),'https://other.example/presell');
  assert.equal(index.get(`${customerId}:12`),'https://store.example/presell/safe');
  assert.equal(index.has(`${customerId}:13`),false,'unsafe URLs are not emitted as links');
  assert.equal(index.has(`${customerId}:14`),false,'a newer batch without a URL does not reuse an older address');
});

test('conflicting same-time campaign URLs are omitted instead of guessing',()=>{
  const source=[
    {customerId:'1234567890',campaignId:'77',finalUrl:'https://one.example/presell'},
    {customerId:'1234567890',campaignId:'77',finalUrl:'https://two.example/presell'}
  ];
  const index=googleAdsCampaignBatchFinalUrlIndex({batches:[{
    updatedAt:'2026-10-03T00:00:00.000Z',campaigns:source
  }]});
  assert.equal(index.has('1234567890:77'),false);
});

test('Google Ads history renders the saved Pre-Sell address as a new-tab link in the campaign row',async()=>{
  const source=await readFile(new URL('../src/google-ads/google-ads-view.mjs',import.meta.url),'utf8');
  const start=source.indexOf('  function renderCaptureHistoryDetails(record) {');
  const end=source.indexOf('\n  function renderCaptureHistory()',start);
  assert.ok(start>=0&&end>start);
  const renderer=source.slice(start,end);
  assert.match(renderer,/href="\$\{escapeHtml\(campaignFinalUrl\)\}" target="_blank"/);
  assert.match(renderer,/title="URL final da Pre-Sell registrada no lote local"/);
  assert.match(renderer,/URL final não registrada no lote local/);
  assert.doesNotMatch(renderer,/ID Google Ads/);
});

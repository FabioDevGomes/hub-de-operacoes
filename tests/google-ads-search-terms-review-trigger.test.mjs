import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGoogleAdsSearchTerms } from '../src/google-ads/google-ads-search-terms-recommendations.mjs';
import { renderGoogleAdsSearchTermsResults } from '../src/google-ads/google-ads-search-terms-results.mjs';

const reports = [{
  managerCustomerId: '3533796641',
  managerName: 'MCC de exemplo',
  customerId: '4404265713',
  accountName: 'Conta de exemplo',
  currencyCode: 'USD',
  rowCount: 2,
  rows: ['2026-11-06', '2026-11-07'].map(date => ({
    date,
    campaignId: '24441216136',
    campaignName: '05/11 - Campanha de teste (GM-NBB-DE/AT/CH) 70% - U$ 81.00',
    searchTerm: 'glp5 glt',
    searchTermMatchType: 'EXACT',
    keywordText: 'glp5 glt',
    impressions: 10,
    clicks: 1,
    costMicros: 1_000_000,
    conversions: 0,
  })),
}];

const periodRecommendations = summarizeGoogleAdsSearchTerms(reports);
const dailyRecommendations = summarizeGoogleAdsSearchTerms(reports, new Map(), { groupByDate: true });
const termId = periodRecommendations[0].termId;

function render({ groupingMode, recommendations }) {
  return renderGoogleAdsSearchTermsResults({
    reports,
    dateFrom: '2026-11-06',
    dateTo: '2026-11-07',
    recommendations,
    aiRecommendations: new Map([[termId, { decision: 'KEEP', confidence: 74 }]]),
    reviewStates: new Map([[termId, { status: 'keep', reasonCode: 'offer_relevant', completedAtUtc: '2026-11-07T16:00:00.000Z' }]]),
    reviewEnabled: true,
    groupingMode,
    showGroupingControl: true,
  });
}

test('period evaluation badge opens review without rendering a separate review button', () => {
  const html = render({ groupingMode: 'period', recommendations: periodRecommendations });

  assert.match(html, /<button class="google-ads-search-terms-ai-decision is-clickable is-keep"[^>]*data-google-ads-search-terms-review="[^"]+"/);
  assert.match(html, />Manter · 74%<\/button>/);
  assert.doesNotMatch(html, /google-ads-search-terms-review-button/);
  assert.match(html, /Estado da revisão: Revisado · Mantido/);
});

test('daily evaluation badges open the period review and progress counts each term once', () => {
  assert.equal(dailyRecommendations.length, 2);
  assert.ok(dailyRecommendations.every(group => group.termId === termId));

  const html = render({ groupingMode: 'day', recommendations: dailyRecommendations });

  assert.equal((html.match(/data-google-ads-search-terms-review=/g) || []).length, 2);
  assert.match(html, /Avaliação IA · período/);
  assert.match(html, /1 de 1 termos exibidos concluídos/);
  assert.doesNotMatch(html, /google-ads-search-terms-review-button/);
});

test('an evaluation without imported AI analysis still opens the review modal', () => {
  const html = renderGoogleAdsSearchTermsResults({
    reports,
    recommendations: periodRecommendations,
    reviewEnabled: true,
    groupingMode: 'period',
    showGroupingControl: true,
  });

  assert.match(html, /<button class="google-ads-search-terms-ai-decision is-clickable is-empty"[^>]*data-google-ads-search-terms-review=/);
  assert.match(html, />Sem análise importada<\/button>/);
});

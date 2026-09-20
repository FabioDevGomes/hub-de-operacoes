import assert from 'node:assert/strict';
import { parseLandingPages, parseOffer, summarizeProduct, upsertObservation } from '../src/curadoria/landing-pages-domain.mjs';

const sample = `Logo
Landing Pages
8 Dec 2025 - 13 Sep 2026
Build a shed this weekend
https://example.com/shed
Offer\tMy Shed Plans (Clickbank)
Page\tWalter Smith
First Seen\t08 December 2025
Last Seen\t13 September 2026
Days running\t280
3 - 13 Sep
Still Waking Up at 3 AM?
https://example.com/sleep
Page\tRestless Generation
First Seen\t03 September 2026
Last Seen\t13 September 2026
Days running\t11
Total Results: 22512`;

const parsed = parseLandingPages(sample);
assert.equal(parsed.parsedCount, 2);
assert.equal(parsed.totalResults, 22512);
assert.equal(parsed.items[0].offerName, 'My Shed Plans');
assert.equal(parsed.items[0].network, 'Clickbank');
assert.equal(parsed.items[0].daysRunning, 280);
assert.equal(parsed.items[1].offerName, '');
assert.deepEqual(parseOffer('Mortgage ()'), { name: 'Mortgage', network: '' });

let history = upsertObservation([], { capturedDate: '2026-09-13', daysRunning: 10 });
history = upsertObservation(history, { capturedDate: '2026-09-13', daysRunning: 11 });
assert.equal(history.length, 1);
assert.equal(history[0].daysRunning, 11);
assert.deepEqual(summarizeProduct([{ productId: 'a', daysRunning: 12, affiliateId: 'one' }, { productId: 'a', daysRunning: 30, affiliateId: 'two' }], 'a'), { count: 2, maxDays: 30, affiliates: 2 });

console.log('landing pages domain ok');

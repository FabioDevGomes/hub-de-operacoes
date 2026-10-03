import assert from 'node:assert/strict';
import { scrollMccPageToBottom } from '../extensions/mcc-d0-bridge/mcc-page-scroll.mjs';

class ScrollElement {
  constructor({ parentElement = null, scrollHeight = 0, clientHeight = 0, overflowY = 'visible' } = {}) {
    this.parentElement = parentElement;
    this.scrollHeight = scrollHeight;
    this.clientHeight = clientHeight;
    this.overflowY = overflowY;
    this._scrollTop = 0;
    this.moves = 0;
    this.onAdvance = null;
  }

  get scrollTop() { return this._scrollTop; }
  set scrollTop(value) {
    if (value > this._scrollTop) {
      this.moves += 1;
      this.onAdvance?.(this);
    }
    this._scrollTop = value;
  }

  getClientRects() { return [this]; }
}

function makeDocument({ grid, pageScroller }) {
  return {
    scrollingElement:pageScroller,
    documentElement:pageScroller,
    querySelectorAll:() => grid ? [grid] : []
  };
}

const win = {
  getComputedStyle:element => ({ overflowY:element.overflowY }),
  setTimeout:callback => { queueMicrotask(callback); return 1; }
};

// A semantically associated grid uses its closest scrollable ancestor rather
// than the page/sidebar, and the helper follows height added by lazy loading.
const page = new ScrollElement({ scrollHeight:2400, clientHeight:600 });
const gridScroller = new ScrollElement({ parentElement:page, scrollHeight:1000, clientHeight:200, overflowY:'auto' });
const grid = new ScrollElement({ parentElement:gridScroller });
let loadedMore = false;
gridScroller.onAdvance = element => {
  if (element.moves === 2 && !loadedMore) {
    element.scrollHeight += 400;
    loadedMore = true;
  }
};
const gridResult = await scrollMccPageToBottom(makeDocument({ grid, pageScroller:page }), win);
assert.equal(gridResult.ok, true);
assert.ok(gridResult.steps > 2, 'scroll continues after lazy-loaded content increases the scroll range');
assert.equal(loadedMore, true);
assert.equal(gridScroller.scrollTop, gridScroller.scrollHeight - gridScroller.clientHeight);
assert.equal(page.scrollTop, 0, 'the page itself is left alone when the grid has its own scroller');

// Without a semantic grid scroller, use the ordinary document scroll area.
const pageOnly = new ScrollElement({ scrollHeight:1400, clientHeight:350 });
const pageResult = await scrollMccPageToBottom(makeDocument({ pageScroller:pageOnly }), win);
assert.equal(pageResult.ok, true);
assert.equal(pageOnly.scrollTop, pageOnly.scrollHeight - pageOnly.clientHeight);

// No overflow is a successful no-op: there is nowhere further to scroll.
const shortPage = new ScrollElement({ scrollHeight:400, clientHeight:500 });
const shortResult = await scrollMccPageToBottom(makeDocument({ pageScroller:shortPage }), win);
assert.equal(shortResult.ok, true);
assert.equal(shortResult.alreadyAtBottom, true);
assert.equal(shortResult.steps, 0);

console.log('MCC page scroll: nearest grid scroller, lazy loading, page fallback, no-op');

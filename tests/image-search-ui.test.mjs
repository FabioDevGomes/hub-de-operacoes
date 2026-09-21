import assert from 'node:assert/strict';
import { renderImageResultButtons } from '../src/curadoria/image-search-ui.mjs';

let selected = null;
const button = { dataset: { imageCountry: 'DE', imageResult: 'mixed' }, onclick: null };
const container = {
  innerHTML: '',
  querySelectorAll() { return [button]; },
};

renderImageResultButtons(container, {
  country: 'DE',
  selectedValue: 'mixed',
  onSelect: (country, status) => { selected = { country, status }; },
});

assert.match(container.innerHTML, /image-result-action dominant/);
assert.match(container.innerHTML, /image-result-action mixed selected/);
assert.match(container.innerHTML, /aria-pressed="true"/);
button.onclick();
assert.deepEqual(selected, { country: 'DE', status: 'mixed' });

console.log('image search ui ok');

import assert from 'node:assert/strict';
import { renderProductAgeButtons, renderResultButtons } from '../src/curadoria/trends-ui.mjs';

function fakeContainer(buttons) {
  return {
    innerHTML: '',
    querySelectorAll() { return buttons; },
  };
}

let selectedAge = '';
const ageButton = { dataset: { trendsProductAge: 'new' }, onclick: null };
const ageContainer = fakeContainer([ageButton]);
renderProductAgeButtons(ageContainer, 'new', value => { selectedAge = value; });
assert.match(ageContainer.innerHTML, /trends-country-action selected/);
assert.match(ageContainer.innerHTML, /aria-pressed="true"/);
ageButton.onclick();
assert.equal(selectedAge, 'new');

let selectedResult = '';
const resultButton = { dataset: { trendsResult: 'stable' }, onclick: null };
const resultContainer = fakeContainer([resultButton]);
renderResultButtons(resultContainer, 'stable', value => { selectedResult = value; });
assert.match(resultContainer.innerHTML, /trends-result-action stable selected/);
assert.match(resultContainer.innerHTML, /trends-result-action up/);
resultButton.onclick();
assert.equal(selectedResult, 'stable');

console.log('trends ui ok');

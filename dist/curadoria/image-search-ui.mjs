import { resultLabel } from './image-search-domain.mjs';

export const IMAGE_RESULT_OPTIONS = Object.freeze([
  'dominant',
  'mixed',
  'scarce',
  'absent',
  'ambiguous',
  'inconclusive',
]);

export function renderImageResultButtons(container, { country, selectedValue, onSelect }) {
  container.innerHTML = IMAGE_RESULT_OPTIONS.map(value =>
    `<button class="btn image-result-action ${value} ${selectedValue === value ? 'selected' : ''}" data-image-result="${value}" data-image-country="${country}" type="button" aria-pressed="${selectedValue === value}">${resultLabel(value)}</button>`
  ).join('');
  container.querySelectorAll('[data-image-result]').forEach(button => {
    button.onclick = () => onSelect(button.dataset.imageCountry, button.dataset.imageResult);
  });
}

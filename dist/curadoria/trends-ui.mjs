export const PRODUCT_AGE_OPTIONS = Object.freeze([
  { value: 'new', label: 'Produto novo' },
  { value: 'old', label: 'Produto antigo' },
]);

export const RESULT_OPTIONS = Object.freeze([
  { value: 'up', label: 'Em alta' },
  { value: 'stable', label: 'Estável' },
  { value: 'down', label: 'Em queda' },
  { value: 'point_peak', label: 'Pico pontual' },
  { value: 'low_volume', label: 'Volume baixo' },
  { value: 'no_data', label: 'Sem dados' },
  { value: 'inconclusive', label: 'Inconclusivo' },
]);

export function renderProductAgeButtons(container, selectedValue, onSelect) {
  container.innerHTML = PRODUCT_AGE_OPTIONS.map(({ value, label }) =>
    `<button class="trends-country-action ${selectedValue === value ? 'selected' : ''}" data-trends-product-age="${value}" type="button" aria-pressed="${selectedValue === value}">${label}</button>`
  ).join('');
  container.querySelectorAll('[data-trends-product-age]').forEach(button => {
    button.onclick = () => onSelect(button.dataset.trendsProductAge);
  });
}

export function renderResultButtons(container, selectedValue, onSelect) {
  container.innerHTML = RESULT_OPTIONS.map(({ value, label }) =>
    `<button class="btn trends-result-action ${value} ${selectedValue === value ? 'selected' : ''}" data-trends-result="${value}" type="button" aria-pressed="${selectedValue === value}">${label}</button>`
  ).join('');
  container.querySelectorAll('[data-trends-result]').forEach(button => {
    button.onclick = () => onSelect(button.dataset.trendsResult);
  });
}

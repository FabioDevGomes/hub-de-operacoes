const LOW_CONTRAST_BADGES = Object.freeze([
  {selector: '.trends-badge', className: 'unsearched', matches: label => label.startsWith('Não pesquisado')},
  {selector: '.glimpse-badge', className: 'unsearched', matches: label => label === 'Pesquisar'},
  {selector: '.image-badge', className: 'unverified', matches: label => label.startsWith('Não verificado')},
]);

export function lowContrastClassForBadge(kind, label) {
  const rule = LOW_CONTRAST_BADGES.find(item => item.selector.slice(1) === kind);
  return rule?.matches(String(label ?? '').trim()) ? rule.className : '';
}

export function applyLowContrastClasses(rows) {
  for (const row of rows || []) {
    for (const rule of LOW_CONTRAST_BADGES) {
      row.querySelectorAll(rule.selector).forEach(badge => {
        const label = badge.textContent.trim();
        badge.classList.toggle(rule.className, rule.matches(label));
      });
    }
  }
}

if (typeof document !== 'undefined') {
if (typeof document !== 'undefined') {
  const rows = document.querySelector('#rows');
  if (rows && typeof MutationObserver !== 'undefined') {
    const sync = () => applyLowContrastClasses(rows.querySelectorAll('tr'));
    sync();
    new MutationObserver(sync).observe(rows, {subtree: true, childList: true, characterData: true});
  }
  }
}

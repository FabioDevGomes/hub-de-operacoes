// Presentation preferences only. Each consumer supplies its own storage key.
export function createColumnPreference({columns, required = [], preferences, preferenceKey}) {
  const keys = columns.map(([key]) => key), mandatory = new Set(required);
  const normalize = values => keys.filter(key => mandatory.has(key) || values.includes(key));
  let selected = null;
  try {
    const stored = JSON.parse(preferences?.getItem(preferenceKey) || 'null');
    if (Array.isArray(stored)) selected = normalize(stored);
  } catch {}
  function save(reset = false) {
    try {
      if (!preferences) throw new Error('Storage unavailable');
      if (reset) preferences.removeItem(preferenceKey);
      else preferences.setItem(preferenceKey, JSON.stringify(selected));
      return '';
    } catch { return 'Preferência válida nesta sessão; não foi possível salvá-la no navegador.'; }
  }
  return {
    visibleKeys: () => selected == null ? [...keys] : [...selected],
    isRequired: key => mandatory.has(key),
    toggle(key, visible) {
      if (!keys.includes(key) || mandatory.has(key)) return '';
      const chosen = new Set(selected || keys);
      visible ? chosen.add(key) : chosen.delete(key);
      selected = normalize([...chosen]);
      return save();
    },
    reset() { selected = null; return save(true); },
  };
}

export function mountColumnPicker({picker, table, columns, required, preferences, preferenceKey}) {
  const state = createColumnPreference({columns, required, preferences, preferenceKey});
  const doc = picker.ownerDocument, viewport = doc.defaultView;
  const options = picker.querySelector('[data-column-options]');
  const menu = picker.querySelector('.hub-column-menu');
  const message = picker.querySelector('[data-column-message]');
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  function apply() {
    const visible = new Set(state.visibleKeys());
    for (const row of table.rows) {
      [...row.cells].forEach((cell, index) => {
        const key = columns[index]?.[0];
        if (!key) return;
        cell.dataset.column = key;
        cell.hidden = !visible.has(key);
      });
    }
    table.dataset.columnSelection = visible.size === columns.length ? 'all' : 'custom';
  }
  function renderOptions() {
    const visible = new Set(state.visibleKeys());
    options.innerHTML = columns.map(([key, label]) => `<label><input type="checkbox" data-column-choice="${escape(key)}" ${visible.has(key) ? 'checked' : ''} ${state.isRequired(key) ? 'disabled' : ''}><span>${escape(label)}</span></label>`).join('');
  }
  function positionMenu() {
    if (!picker.open || !viewport) return;
    const box = picker.getBoundingClientRect(), below = viewport.innerHeight - box.bottom - 16, above = box.top - 16;
    const upward = below < 300 && above > below;
    menu.style.top = upward ? 'auto' : 'calc(100% + 8px)';
    menu.style.bottom = upward ? 'calc(100% + 8px)' : 'auto';
    menu.style.maxHeight = Math.max(100, upward ? above : below) + 'px';
  }
  function close({focus = false} = {}) { picker.open = false; if (focus) picker.querySelector('summary').focus(); }
  function outside(event) { if (picker.open && !picker.contains(event.target)) close(); }
  function keydown(event) { if (event.key === 'Escape' && picker.open) { event.preventDefault(); close({focus:true}); } }
  function change(event) {
    const input = event.target.closest('[data-column-choice]');
    if (!input || input.disabled) return;
    message.textContent = state.toggle(input.dataset.columnChoice, input.checked);
    apply();
  }
  function reset() { message.textContent = state.reset(); renderOptions(); apply(); }
  const resetButton = picker.querySelector('[data-column-reset]');
  options.addEventListener('change', change);
  resetButton.addEventListener('click', reset);
  picker.addEventListener('toggle', positionMenu);
  picker.addEventListener('keydown', keydown);
  doc.addEventListener('pointerdown', outside);
  viewport?.addEventListener('resize', positionMenu);
  renderOptions(); apply();
  return {
    apply,
    destroy() {
      options.removeEventListener('change', change); resetButton.removeEventListener('click', reset);
      picker.removeEventListener('toggle', positionMenu); picker.removeEventListener('keydown', keydown);
      doc.removeEventListener('pointerdown', outside); viewport?.removeEventListener('resize', positionMenu);
    },
  };
}

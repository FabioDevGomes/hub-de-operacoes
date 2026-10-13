// Presentation only: callers supply the table, local preferences and error feedback.
export const columnMinimum = key => /^(product|offer|offerName)$/.test(key) ? 160 : key === 'lastSeen' ? 156 : /^(id|rank)$/.test(key) ? 52 : 64;
export const clampColumnWidth = (key, value) => Math.round(Math.max(columnMinimum(key), Math.min(1200, value)));

export function readColumnWidths(preferences, preferenceKey) {
  try {
    const saved = JSON.parse(preferences?.getItem(preferenceKey) || '{}');
    if (!saved || Array.isArray(saved) || typeof saved !== 'object') return {};
    return Object.fromEntries(Object.entries(saved).filter(([key,value]) => key && typeof value === 'number' && Number.isFinite(value) && value > 0).map(([key,value]) => [key,clampColumnWidth(key,value)]));
  } catch { return {}; }
}

export function columnKey(header) {
  return header.dataset.col || header.dataset.column || header.querySelector('[data-sort]')?.dataset.sort || header.textContent.trim().replace(/[↑↓↕]/g,'').trim();
}

export function mountColumnWidths({table, preferences, preferenceKey, onError = () => {}}) {
  const doc = table.ownerDocument;
  let widths = readColumnWidths(preferences, preferenceKey), entries = [], gesture = null, cols = [], group = null;
  table.classList.add('hub-widths-table');
  const visible = entry => !entry.header.hidden && !entry.header.classList.contains('hidden-column');
  const renderedWidth = entry => {
    const measured = entry.header.getBoundingClientRect().width;
    return clampColumnWidth(entry.key, Number.isFinite(measured) && measured > 0 ? measured : columnMinimum(entry.key));
  };
  const width = entry => widths[entry.key] ?? renderedWidth(entry);
  function apply() {
    const shown = entries.filter(visible), custom = Object.keys(widths).length > 0;
    table.classList.toggle('hub-widths-custom', custom);
    if (!custom) {
      group?.remove(); group = null; cols = [];
      table.style.removeProperty('width'); table.style.removeProperty('min-width');
      entries.forEach(entry => entry.handle.setAttribute('aria-valuenow', String(width(entry))));
      return;
    }
    if (!group) { group = doc.createElement('colgroup'); group.dataset.hubWidths = ''; table.prepend(group); }
    if (cols.length !== shown.length) {
      cols = shown.map(() => doc.createElement('col')); group.replaceChildren(...cols);
    }
    const total = shown.reduce((sum,entry,index) => {
      const pixels = width(entry); cols[index].style.width = pixels + 'px';
      entry.handle.setAttribute('aria-valuenow', String(pixels)); return sum + pixels;
    },0);
    table.style.width = total + 'px'; table.style.minWidth = total + 'px';
  }
  function save() {
    try {
      if (!preferences?.setItem) throw new Error('Unavailable preferences');
      preferences.setItem(preferenceKey, JSON.stringify(widths)); onError('');
    } catch { onError('Larguras ajustadas nesta sessão; não foi possível salvá-las no navegador.'); }
  }
  // Freeze all visible widths once, before writing; adjacent columns must not jump.
  function freeze() {
    const measurements = entries.filter(visible).map(entry => [entry.key, renderedWidth(entry)]);
    widths = {...widths, ...Object.fromEntries(measurements)};
  }
  function end(cancel = false) {
    if (!gesture) return;
    const previous = gesture; gesture = null; // release can synchronously emit lostpointercapture
    table.classList.remove('hub-widths-resizing'); previous.handle.classList.remove('is-resizing');
    if (previous.handle.hasPointerCapture?.(previous.pointerId)) previous.handle.releasePointerCapture(previous.pointerId);
    if (cancel || !previous.changed) widths = previous.widths; else save();
    apply();
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.pointerId || !Number.isFinite(event.clientX)) return;
    const pixels = clampColumnWidth(gesture.key, gesture.startWidth + event.clientX - gesture.startX);
    gesture.changed = pixels !== gesture.startWidth; widths[gesture.key] = pixels; apply();
  }
  function bind(entry) {
    const handle = entry.handle;
    const stop = event => { event.preventDefault(); event.stopPropagation(); };
    handle.onclick = handle.ondblclick = stop;
    handle.onpointerdown = event => {
      if (event.button !== 0 || gesture || !Number.isFinite(event.clientX)) return;
      stop(event); const previous = {...widths}; freeze();
      gesture = {key:entry.key, handle, pointerId:event.pointerId, startX:event.clientX, startWidth:widths[entry.key], widths:previous, changed:false};
      handle.setPointerCapture(event.pointerId); table.classList.add('hub-widths-resizing'); handle.classList.add('is-resizing'); apply();
    };
    handle.onpointermove = move;
    handle.onpointerup = event => { if (gesture?.pointerId === event.pointerId) { move(event); end(); } };
    handle.onpointercancel = handle.onlostpointercapture = event => { if (gesture?.pointerId === event.pointerId) end(true); };
    handle.onkeydown = event => {
      if (event.key === 'Escape' && gesture) { stop(event); end(true); return; }
      if (!['ArrowLeft','ArrowRight'].includes(event.key) || gesture) return;
      stop(event); const previous = {...widths}; freeze();
      const before = widths[entry.key], after = clampColumnWidth(entry.key, before + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 30 : 10));
      if (before === after) { widths = previous; apply(); return; }
      widths[entry.key] = after; apply(); save();
    };
  }
  function refresh() {
    end(true);
    entries = [...(table.tHead?.rows[0]?.cells || [])].filter(header => header.tagName === 'TH' && header.colSpan <= 1).map(header => {
      const key = columnKey(header);
      let handle = header.querySelector('.hub-column-resizer');
      if (!handle) {
        handle = doc.createElement('span'); handle.className = 'hub-column-resizer'; handle.tabIndex = 0;
        header.append(handle);
      }
      if (!header.classList.contains('hub-widths-heading')) header.classList.add('hub-widths-heading');
      handle.setAttribute('role','separator'); handle.setAttribute('aria-orientation','vertical');
      handle.setAttribute('aria-label','Ajustar largura: ' + header.textContent.trim().replace(/[↑↓↕]/g,'').trim());
      handle.setAttribute('aria-valuemin',String(columnMinimum(key))); handle.setAttribute('aria-valuemax','1200');
      handle.title = 'Arraste para ajustar a largura. Setas: 10px; Shift + setas: 30px.';
      const entry = {key,header,handle}; bind(entry); return entry;
    });
    apply();
  }
  refresh();
  return {refresh, cancel:() => end(true), destroy() {
    end(true); entries.forEach(entry => entry.handle.remove()); group?.remove();
    table.classList.remove('hub-widths-table','hub-widths-custom');
    table.style.removeProperty('width'); table.style.removeProperty('min-width');
  }};
}

import {columnKey, mountColumnWidths} from './column-widths.mjs?v=1';

// Explicit opt-in on each Curadoria page. No operational data or view dependency.
export function mountCurationWidths({root, screen, preferences, Observer, schedule = queueMicrotask}) {
  const mounted = new Map(); let pending = false, stopped = false;
  function scan() {
    if (stopped) return;
    const tables = [...root.querySelectorAll('table')];
    for (const [table,controller] of mounted) if (!tables.includes(table)) { controller.destroy(); mounted.delete(table); }
    tables.forEach((table,index) => {
      if (mounted.has(table) || !table.tHead?.rows[0]?.cells.length) return;
      const identity = index === 0 && screen !== 'glimpse' ? 'main' : table.id || [...table.tHead.rows[0].cells].map(columnKey).join('|');
      let notice;
      const controller = mountColumnWidths({table, preferences, preferenceKey:`hub:curation:column-widths:v1:${screen}:${identity}`, onError(message) {
        if (!notice && message) { notice = root.createElement('p'); notice.className = 'hub-widths-message'; notice.setAttribute('role','status'); table.before(notice); }
        if (notice) { notice.textContent = message; notice.hidden = !message; }
      }});
      mounted.set(table,controller);
    });
  }
  const observer = new Observer(records => {
    const refresh = new Set(); let discover = false;
    for (const record of records) {
      if (record.type === 'attributes' && record.target.tagName === 'TH') {
        const controller = mounted.get(record.target.closest('table')); if (controller) refresh.add(controller);
      } else if (record.type === 'childList') {
        // Ignore row updates and our own spans/colgroup: never walk the data cells.
        if (record.target.closest?.('tbody')) continue;
        const nodes = [...record.addedNodes,...record.removedNodes];
        if (nodes.some(node => ['TH','TR','THEAD'].includes(node.tagName)) && record.target.closest?.('thead')) {
          const controller = mounted.get(record.target.closest('table')); if (controller) refresh.add(controller); else discover = true;
        }
        if (nodes.some(node => node.tagName === 'TABLE' || node.tagName === 'THEAD' || node.querySelector?.('table'))) discover = true;
      }
    }
    // Geometry is patched only for headings/visibility changes, not tbody refreshes.
    refresh.forEach(controller => controller.refresh());
    if (discover && !pending) { pending = true; schedule(() => { pending = false; scan(); }); }
  });
  scan();
  observer.observe(root.body, {childList:true, subtree:true, attributes:true, attributeFilter:['hidden','class','data-col','data-column']});
  return {destroy() { stopped = true; observer.disconnect(); mounted.forEach(controller => controller.destroy()); mounted.clear(); }};
}

if (typeof document !== 'undefined') {
  const screen = document.querySelector('script[data-curation-widths]')?.dataset.curationWidths;
  let preferences;
  try { preferences = window.localStorage; } catch { /* Session adjustments remain available. */ }
  if (screen) mountCurationWidths({root:document, screen, preferences, Observer:window.MutationObserver});
}

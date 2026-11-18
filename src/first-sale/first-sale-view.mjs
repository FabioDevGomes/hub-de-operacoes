import { firstSaleRows } from './first-sale-domain.mjs?v=6';

const COLUMN_WIDTHS_KEY = 'hub:first-sale:column-widths:v1';
const columns = [
  { key: 'campaignName', label: 'Campanha', min: 180, initial: '36%' },
  { key: 'saleDate', label: 'Primeira venda', min: 220, initial: '34%' },
  { key: 'clicks', label: 'Cliques', min: 110, initial: '15%', numeric: true },
  { key: 'impressions', label: 'Impressões', min: 110, initial: '15%', numeric: true },
];
const columnByKey = new Map(columns.map(column => [column.key, column]));
const clampWidth = (key, width) => Math.round(Math.min(900, Math.max(columnByKey.get(key)?.min || 110, width)));
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function mount({ root, getSnapshot, format = {} }) {
  root.innerHTML = `
    <section class="first-sale-surface" aria-label="Histórico de primeiras vendas">
      <p class="first-sale-note">Atraso de referência para a conversão aparecer nos dados do Google Ads/Faturamento: cerca de 6–7 horas, como estimativa e não prazo garantido. O horário de primeira inclusão no Faturamento fica registrado; cliques e impressões acompanham revisões posteriores dos relatórios. Conversões MCC/API são agregadas por dia e não têm hora individual da venda.</p>
      <div class="first-sale-table-wrap">
        <table class="first-sale-table hub-table-layout">
          <colgroup>${columns.map(column => `<col data-column="${column.key}" style="width:${column.initial}">`).join('')}</colgroup>
          <thead><tr>${columns.map(column => `<th scope="col" class="${column.numeric ? 'num' : ''}" data-column="${column.key}" aria-sort="none"><button type="button" class="first-sale-sort" data-first-sale-sort="${column.key}" aria-label="Ordenar por ${esc(column.label)}" aria-pressed="false"><span>${esc(column.label)}</span><span class="first-sale-sort-arrow" aria-hidden="true">↕</span></button><span class="first-sale-column-resizer" data-first-sale-resizer="${column.key}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Redimensionar coluna ${esc(column.label)}" aria-valuemin="${column.min}" aria-valuemax="900" aria-valuenow="0" title="Arraste para ajustar; use as setas esquerda e direita"></span></th>`).join('')}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="first-sale-widths-status" role="status" aria-live="polite"></p>
    </section>`;

  const body = root.querySelector('tbody');
  const table = root.querySelector('.first-sale-table');
  const widthsStatus = root.querySelector('.first-sale-widths-status');
  let sortKey = 'saleDate';
  let sortDirection = 'desc';
  let columnWidths = {};
  let resizeGesture = null;
  let widthStorage = null;
  try { widthStorage = root.ownerDocument?.defaultView?.localStorage || globalThis.localStorage; } catch {}
  try {
    const saved = JSON.parse(widthStorage?.getItem?.(COLUMN_WIDTHS_KEY) || 'null');
    if (saved && typeof saved === 'object' && !Array.isArray(saved) && columns.every(({ key }) => Number.isFinite(saved[key]) && saved[key] > 0)) {
      columnWidths = Object.fromEntries(columns.map(({ key }) => [key, clampWidth(key, saved[key])]));
    }
  } catch {}

  function applyColumnWidths() {
    if (!table) return;
    const cols = [...table.querySelectorAll('col[data-column]')];
    if (!Object.keys(columnWidths).length) {
      table.removeAttribute('style');
    } else {
      const total = columns.reduce((sum, { key }) => sum + (columnWidths[key] || 0), 0);
      table.style.width = `${total}px`;
      table.style.minWidth = `${total}px`;
      cols.forEach(col => { col.style.width = `${columnWidths[col.dataset.column]}px`; });
    }
    const renderedWidths = new Map([...table.querySelectorAll('th[data-column]')].map(header => [header.dataset.column, header.getBoundingClientRect().width]));
    root.querySelectorAll('[data-first-sale-resizer]').forEach(handle => {
      const key = handle.dataset.firstSaleResizer;
      const width = columnWidths[key] || renderedWidths.get(key);
      if (Number.isFinite(width) && width > 0) handle.setAttribute('aria-valuenow', String(Math.round(width)));
    });
  }

  function freezeColumnWidths() {
    table.querySelectorAll('th[data-column]').forEach(header => {
      const width = header.getBoundingClientRect().width;
      if (Number.isFinite(width) && width > 0) columnWidths[header.dataset.column] = clampWidth(header.dataset.column, width);
    });
  }

  function saveColumnWidths() {
    try {
      if (!widthStorage?.setItem) throw new Error('Armazenamento local indisponível.');
      widthStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
      widthsStatus.textContent = '';
    } catch {
      widthsStatus.textContent = 'As larguras valem nesta sessão, mas o navegador não permitiu salvá-las.';
    }
  }

  function endColumnResize(cancel = false) {
    if (!resizeGesture) return;
    const gesture = resizeGesture;
    resizeGesture = null;
    root.classList.remove('first-sale-resizing');
    gesture.handle.classList.remove('is-resizing');
    if (gesture.handle.hasPointerCapture?.(gesture.pointerId)) gesture.handle.releasePointerCapture(gesture.pointerId);
    if (cancel || !gesture.changed) columnWidths = gesture.previous;
    else saveColumnWidths();
    applyColumnWidths();
  }

  function moveColumnResize(event) {
    const gesture = resizeGesture;
    if (!gesture || event.pointerId !== gesture.pointerId || !Number.isFinite(event.clientX)) return;
    const width = clampWidth(gesture.key, gesture.startWidth + event.clientX - gesture.startX);
    columnWidths[gesture.key] = width;
    gesture.changed = width !== gesture.startWidth;
    applyColumnWidths();
  }

  root.addEventListener('pointerdown', event => {
    const handle = event.target?.closest?.('[data-first-sale-resizer]');
    if (!handle || event.button !== 0 || resizeGesture || !Number.isFinite(event.clientX)) return;
    event.preventDefault();
    event.stopPropagation();
    const previous = { ...columnWidths };
    freezeColumnWidths();
    const key = handle.dataset.firstSaleResizer;
    resizeGesture = { key, handle, previous, pointerId: event.pointerId, startX: event.clientX, startWidth: columnWidths[key], changed: false };
    handle.setPointerCapture?.(event.pointerId);
    handle.classList.add('is-resizing');
    root.classList.add('first-sale-resizing');
    applyColumnWidths();
  });
  root.addEventListener('pointermove', moveColumnResize);
  root.addEventListener('pointerup', event => {
    if (resizeGesture?.pointerId === event.pointerId) { moveColumnResize(event); endColumnResize(); }
  });
  root.addEventListener('pointercancel', () => endColumnResize(true));
  root.addEventListener('lostpointercapture', () => endColumnResize(true));
  root.addEventListener('keydown', event => {
    const handle = event.target?.closest?.('[data-first-sale-resizer]');
    if (!handle) return;
    if (event.key === 'Escape' && resizeGesture) { event.preventDefault(); endColumnResize(true); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const key = handle.dataset.firstSaleResizer;
    const previous = { ...columnWidths };
    freezeColumnWidths();
    const current = columnWidths[key];
    const width = clampWidth(key, current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 30 : 10));
    if (width === current) { columnWidths = previous; return; }
    columnWidths[key] = width;
    applyColumnWidths();
    saveColumnWidths();
  });

  function compareRows(left, right) {
    const valueFor = row => sortKey === 'saleDate'
      ? `${row.saleDate || ''}T${row.saleTime || '00:00:00'}`
      : row[sortKey];
    const leftValue = valueFor(left);
    const rightValue = valueFor(right);
    const leftMissing = leftValue == null || leftValue === '';
    const rightMissing = rightValue == null || rightValue === '';
    if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
    let compared;
    if (sortKey === 'clicks' || sortKey === 'impressions') compared = Number(leftValue) - Number(rightValue);
    else compared = String(leftValue).localeCompare(String(rightValue), 'pt-BR', { numeric: true, sensitivity: 'base' });
    if (!compared && sortKey !== 'campaignName') compared = left.campaignName.localeCompare(right.campaignName, 'pt-BR', { numeric: true, sensitivity: 'base' });
    return Math.sign(compared) * (sortDirection === 'asc' ? 1 : -1);
  }

  function updateSortHeaders() {
    root.querySelectorAll('[data-first-sale-sort]').forEach(button => {
      const key = button.dataset.firstSaleSort;
      const active = key === sortKey;
      const header = button.closest('th[data-column]');
      header?.setAttribute('aria-sort', active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `Ordenar por ${columnByKey.get(key)?.label || key}${active ? (sortDirection === 'asc' ? ' crescente' : ' decrescente') : ''}`);
      const arrow = button.querySelector('.first-sale-sort-arrow');
      if (arrow) arrow.textContent = active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕';
    });
  }

  root.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-first-sale-sort]');
    if (!button) return;
    const key = button.dataset.firstSaleSort;
    if (!columnByKey.has(key)) return;
    if (sortKey === key) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDirection = 'asc'; }
    render();
  });

  function recordedAtLabel(value) {
    if (!value) return 'Horário de registro indisponível';
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.getTime())) return 'Horário de registro indisponível';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(timestamp);
  }

  async function render() {
    updateSortHeaders();
    const rows = firstSaleRows(await getSnapshot?.() || {}).sort(compareRows);
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'first-sale-empty';
      cell.colSpan = columns.length;
      cell.textContent = 'Nenhuma venda registrada com campanha vinculada.';
      row.append(cell);
      body.replaceChildren(row);
      applyColumnWidths();
      return;
    }

    body.replaceChildren(...rows.map(item => {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      name.className = 'first-sale-campaign';
      name.textContent = item.campaignName;
      const date = document.createElement('td');
      date.textContent = format.date?.(item.saleDate) || item.saleDate;
      if (item.saleTime) date.textContent += ` · ${item.saleTime}`;
      const recorded = document.createElement('small');
      recorded.className = 'first-sale-recorded';
      recorded.textContent = `1º registro no Faturamento: ${recordedAtLabel(item.recordedAt)} · ${item.sourceLabel}`;
      date.append(document.createElement('br'), recorded);
      const clicks = document.createElement('td');
      clicks.className = 'num';
      clicks.textContent = item.clicks == null ? '—' : (format.num?.(item.clicks) ?? String(item.clicks));
      const impressions = document.createElement('td');
      impressions.className = 'num';
      impressions.textContent = item.impressions == null ? '—' : (format.num?.(item.impressions) ?? String(item.impressions));
      row.append(name, date, clicks, impressions);
      return row;
    }));
    applyColumnWidths();
  }

  return { render };
}

export { mount };

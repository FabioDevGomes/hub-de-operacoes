// Presentation-only contract: callers provide collection timestamps and identities.
// No storage access, current-time fallback, or timestamps from manual assessments.
const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
});
const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function collectionTime(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.getTime() : null;
}

export function latestCollectionValue(...values) {
  return values.reduce((latest, value) => {
    const time = collectionTime(value);
    return time != null && (latest == null || time > collectionTime(latest)) ? value : latest;
  }, null);
}

export function latestCollectionIndex(captures = [], itemKey = item => item.offerId) {
  const index = new Map();
  for (const capture of captures) {
    if (collectionTime(capture.capturedAt) == null) continue;
    for (const item of capture.offers || []) {
      const key = itemKey(item);
      if (key == null || key === '') continue;
      const identity = String(key);
      index.set(identity, latestCollectionValue(index.get(identity), capture.capturedAt));
    }
  }
  return index;
}

export function formatLastCollection(value) {
  if (collectionTime(value) == null) return '—';
  // A date without a time must not become an invented midnight (or previous day).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return formatter.format(new Date(value));
}

export function lastCollectionCell(value) {
  const valid = collectionTime(value) != null;
  const title = valid && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? 'Última coleta · horário não informado'
    : 'Última coleta · horário de Brasília';
  return '<td class="hub-last-collection" data-col="lastSeen" title="' + title + '">' +
    (valid ? '<time datetime="' + escape(value) + '">' + escape(formatLastCollection(value)) + '</time>' : '—') +
    '</td>';
}

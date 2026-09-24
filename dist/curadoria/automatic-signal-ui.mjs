const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

export function tooltip(signal) {
  const names = {trends: 'Trends', images: 'Imagens', glimpse: 'Glimpse'};
  const lines = Object.entries(signal?.components || {}).map(([key, item]) => {
    const context = [item.country, item.searchTerm, item.monthlyVolume ? `volume ${item.monthlyVolume}` : null, item.refinementOf ? `refinada de ${item.refinementOf}` : null].filter(Boolean).join(' · ');
    return `${names[key] || key}: ${item.label}${context ? ` · ${context}` : ''}`;
  });
  return [`Resultado: ${signal?.label || 'Sem dados'} · Cobertura: ${signal?.coverage?.label || '0/3'}`, ...lines].join('\n');
}

export function badgeHtml(signal) {
  const result = signal?.result || 'no_data';
  const label = signal?.label || 'Sem dados';
  const coverage = signal?.coverage?.label || '0/3';
  const title = escape(tooltip(signal));
  return `<span class="automatic-signal automatic-signal-${escape(result)}" tabindex="0" title="${title}" aria-label="${escape(`${label}, cobertura ${coverage}`)}"><strong>${escape(label)}</strong><small>${escape(coverage)}</small></span>`;
}

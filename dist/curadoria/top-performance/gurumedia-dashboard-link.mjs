const summary = document.querySelector('#summary');
if (summary && !summary.closest('.gurumedia-summary-row')) {
  const row = document.createElement('div');
  row.className = 'gurumedia-summary-row';
  summary.parentNode.insertBefore(row, summary);
  row.append(summary);

  const link = document.createElement('a');
  link.className = 'gurumedia-dashboard-link';
  link.href = 'https://stats.gurumedia.com/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Abrir dashboard Guru Media';
  row.append(link);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./gurumedia-dashboard-link.css', import.meta.url).href;
  document.head.append(stylesheet);
}

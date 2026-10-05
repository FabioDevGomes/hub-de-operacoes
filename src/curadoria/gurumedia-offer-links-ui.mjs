import {guruMediaOfferUrl} from './gurumedia-offer-link.mjs';

const view = new URL(import.meta.url).searchParams.get('view');
const sheet = document.querySelector(view === 'top' ? '#offerSheet' : '#productSheet');

function offerIds() {
  if (view === 'top') {
    const title = document.querySelector('#sheetTitle')?.textContent || '';
    return [title.match(/#(\d+)\s*$/)?.[1]].filter(Boolean);
  }
  if (view === 'manager') {
    return [...document.querySelectorAll('#variantRows tr td:first-child')]
      .map(cell => cell.textContent.trim())
      .filter(id => /^\d+$/.test(id));
  }
  return [];
}

function linkTopTableOfferIds() {
  if (view !== 'top') return;
  const rows = document.querySelector('#rows');
  if (!rows) return;
  for (const row of rows.querySelectorAll('tr[data-offer]')) {
    const cell = row.querySelector('td[data-col="id"]'), id = String(row.dataset.offer || '').trim(), url = guruMediaOfferUrl(id);
    if (!cell || !url || cell.querySelector('[data-gurumedia-offer-link]')) continue;
    const link = document.createElement('a');
    link.className = 'offer-id-link';
    link.dataset.gurumediaOfferLink = '';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Abrir oferta ${id} na GuruMedia`);
    link.textContent = id;
    link.addEventListener('click', event => event.stopPropagation());
    cell.replaceChildren(link);
  }
}

function renderOfferLinks() {
  const actions = document.querySelector(view === 'top' ? '#topProductAgeActions' : '#managerProductAgeActions');
  const ageRow = actions?.closest('.trends-product-age');
  if (!ageRow) return;

  let group = ageRow.nextElementSibling;
  if (!group?.classList.contains('trends-gurumedia-offers')) {
    group = document.createElement('div');
    group.className = 'trends-gurumedia-offers';
    ageRow.after(group);
  }

  const ids = [...new Set(offerIds())].filter(id => guruMediaOfferUrl(id));
  const signature = ids.join(',');
  if (group.dataset.offerIds === signature) return;
  group.dataset.offerIds = signature;
  group.innerHTML = ids.length
    ? `<span>Oferta(s) específica(s) na GuruMedia</span><div class="trends-gurumedia-links">${ids.map(id => `<a class="btn trends-gurumedia-link" href="${guruMediaOfferUrl(id)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir oferta ${id} na GuruMedia">Abrir oferta #${id}</a>`).join('')}</div>`
    : '';
}

if (sheet && (view === 'top' || view === 'manager')) {
  renderOfferLinks();
  new MutationObserver(renderOfferLinks).observe(sheet, {childList:true,characterData:true,subtree:true});
}

const topOfferRows = view === 'top' ? document.querySelector('#rows') : null;
if (topOfferRows) {
  linkTopTableOfferIds();
  new MutationObserver(linkTopTableOfferIds).observe(topOfferRows, {childList:true});
}

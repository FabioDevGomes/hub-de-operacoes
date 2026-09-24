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

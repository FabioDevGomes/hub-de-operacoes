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

function ensureTopOfferActionTarget() {
  const card = sheet?.querySelector('.trends-country-card');
  const heading = card?.querySelector('h2');
  if (!card || !heading) return null;

  let headingRow = card.querySelector('.trends-country-heading');
  if (!headingRow) {
    headingRow = document.createElement('div');
    headingRow.className = 'trends-country-heading';
    card.insertBefore(headingRow, heading);
    headingRow.append(heading);
  }

  let target = headingRow.querySelector('#topGuruMediaOfferAction');
  if (!target) {
    target = document.createElement('div');
    target.id = 'topGuruMediaOfferAction';
    target.className = 'trends-country-offer-action';
    headingRow.append(target);
  }

  if (!document.querySelector('style[data-gurumedia-offer-action]')) {
    const style = document.createElement('style');
    style.dataset.gurumediaOfferAction = '';
    style.textContent = '#offerSheet .trends-country-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}#offerSheet .trends-country-heading h2{margin:0}#offerSheet .trends-country-offer-action{display:flex;justify-content:flex-end;min-width:0}#offerSheet .trends-country-offer-action .trends-gurumedia-links{justify-content:flex-end}@media(max-width:560px){#offerSheet .trends-country-heading{align-items:flex-start;flex-wrap:wrap}#offerSheet .trends-country-offer-action{margin-left:auto}}';
    document.head.append(style);
  }

  return target;
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
  const links = ids.map(id => `<a class="btn trends-gurumedia-link" href="${guruMediaOfferUrl(id)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir oferta ${id} na GuruMedia">Abrir oferta #${id}</a>`).join('');
  const target = view === 'top' ? ensureTopOfferActionTarget() : null;
  const linksHtml = `<div class="trends-gurumedia-links">${links}</div>`;
  const groupHtml = ids.length
    ? `<span>Oferta(s) específica(s) na GuruMedia</span>${target ? '' : linksHtml}`
    : '';
  const targetHtml = ids.length && target ? linksHtml : '';

  if (group.innerHTML !== groupHtml) group.innerHTML = groupHtml;
  if (target && target.innerHTML !== targetHtml) target.innerHTML = targetHtml;
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

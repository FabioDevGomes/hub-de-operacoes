const VARIANTS = Object.freeze({
  positive: 'trends-keyword-candidate',
  negative: 'image-candidate',
});

function normalizedCandidates(values) {
  return [...new Set((values || []).map(value => String(value ?? '').trim()).filter(Boolean))];
}

/**
 * Render the compact list marker used when a saved keyword candidate exists.
 * The marker intentionally describes presence, not candidate count.
 */
export function keywordCandidateMarkerHtml(count, variant = 'positive') {
  if (!(Number(count) > 0)) return '';
  const kind = variant === 'negative' ? 'negative' : 'positive';
  const label = kind === 'negative'
    ? 'Há palavras-chave candidatas à negativação'
    : 'Há candidatas à palavra-chave';
  return `<span class="keyword-candidate-marker ${kind}" title="${label}" aria-label="${label}" role="img"><span class="keyword-candidate-marker-dot">·</span><span class="keyword-candidate-marker-exclamation">!</span></span>`;
}

/**
 * Render keyword candidates using one shared accessible presentation.
 * Persistence and URL construction stay with each owning screen.
 */
export function renderKeywordCandidates(container, {
  candidates = [],
  variant = 'positive',
  saved = false,
  showRemoveForSaved = false,
  searchLabel = 'Pesquisar',
  searchContext = 'Google Trends',
  searchAllLabel = 'Pesquisar imagens (excluindo todas)',
  emptyText = 'Nenhuma candidata adicionada.',
  onSearch = null,
  onSearchAll = null,
  onRemove = null,
} = {}) {
  if (!container?.ownerDocument || typeof container.replaceChildren !== 'function') {
    throw new TypeError('A lista de candidatas precisa ser um elemento DOM.');
  }

  const document = container.ownerDocument;
  const items = normalizedCandidates(candidates);
  const variantClass = VARIANTS[variant] || VARIANTS.positive;
  if (variant === 'negative') container.classList?.add('image-candidate-collection');
  else container.classList?.remove('image-candidate-collection');

  if (!items.length) {
    const empty = document.createElement('span');
    empty.className = 'trends-keyword-empty keyword-candidate-empty';
    empty.textContent = emptyText;
    container.replaceChildren(empty);
    return items;
  }

  if (variant === 'negative') {
    // Negative candidates share one search action; the callback receives the full list.
    const itemList = document.createElement('div');
    itemList.className = 'keyword-candidate-items';

    const rows = items.map((value, index) => {
      const row = document.createElement('span');
      row.className = `keyword-candidate ${variantClass}${saved ? ' saved' : ''}`;

      const text = document.createElement('span');
      text.className = 'keyword-candidate-text';
      text.textContent = value;
      row.append(text);

      if ((!saved || showRemoveForSaved) && typeof onRemove === 'function') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'keyword-candidate-remove';
        remove.textContent = '×';
        remove.title = `Remover candidata: ${value}`;
        remove.setAttribute('aria-label', `Remover candidata ${value}`);
        remove.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          onRemove(value, index);
        };
        row.append(remove);
      }

      return row;
    });
    itemList.append(...rows);

    const children = [itemList];
    const searchAllHandler = typeof onSearchAll === 'function' ? onSearchAll : onSearch;
    if (typeof searchAllHandler === 'function') {
      const searchAll = document.createElement('button');
      searchAll.type = 'button';
      searchAll.className = 'btn primary image-search-button image-candidate-search-all';
      searchAll.textContent = searchAllLabel;
      searchAll.title = `${searchAllLabel}: ${items.join(', ')} · ${searchContext}`;
      searchAll.setAttribute('aria-label', `${searchAllLabel}: ${items.join(', ')} · ${searchContext}`);
      searchAll.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        searchAllHandler([...items]);
      };
      children.push(searchAll);
    }

    container.replaceChildren(...children);
    return items;
  }

  const rows = items.map((value, index) => {
    const row = document.createElement('span');
    row.className = `keyword-candidate ${variantClass}${saved ? ' saved' : ''}`;

    const text = document.createElement('span');
    text.className = 'keyword-candidate-text';
    text.textContent = value;
    row.append(text);

    if (typeof onSearch === 'function') {
      const search = document.createElement('button');
      search.type = 'button';
      search.className = 'keyword-candidate-search';
      search.textContent = searchLabel;
      search.title = `${searchLabel}: ${value} · ${searchContext}`;
      search.setAttribute('aria-label', `${searchLabel} “${value}” em ${searchContext}`);
      search.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        onSearch(value, index);
      };
      row.append(search);
    }

    if ((!saved || showRemoveForSaved) && typeof onRemove === 'function') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'keyword-candidate-remove';
      remove.textContent = '×';
      remove.title = `Remover candidata: ${value}`;
      remove.setAttribute('aria-label', `Remover candidata ${value}`);
      remove.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        onRemove(value, index);
      };
      row.append(remove);
    }

    return row;
  });

  container.replaceChildren(...rows);
  return items;
}

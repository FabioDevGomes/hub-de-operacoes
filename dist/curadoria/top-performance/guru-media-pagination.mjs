export const DEFAULT_GURU_MEDIA_PAGE_SIZE = 50;
export const GURU_MEDIA_PAGE_SIZES = Object.freeze([50, 100, 200]);

export function paginateGuruMediaOffers(items, page = 1, pageSize = DEFAULT_GURU_MEDIA_PAGE_SIZE) {
  const size = GURU_MEDIA_PAGE_SIZES.includes(Number(pageSize))
    ? Number(pageSize)
    : DEFAULT_GURU_MEDIA_PAGE_SIZE;
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(Number(page) || 1)));
  const startIndex = (currentPage - 1) * size;
  return {
    items: items.slice(startIndex, startIndex + size),
    page: currentPage,
    pageSize: size,
    pageCount,
    total,
    start: total ? startIndex + 1 : 0,
    end: Math.min(startIndex + size, total)
  };
}

export function renderGuruMediaPagination(container, pagination, { onPageChange, onPageSizeChange } = {}) {
  const { page, pageSize, pageCount, total, start, end } = pagination;
  container.hidden = total === 0;
  if (!total) {
    container.replaceChildren();
    return;
  }
  container.innerHTML = `<span class="guru-media-pagination-count" aria-live="polite">Ofertas ${start}–${end} de ${total}</span><div class="guru-media-pagination-controls"><label>Tamanho da página <select class="control" data-page-size aria-label="Ofertas por página">${GURU_MEDIA_PAGE_SIZES.map(size => `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`).join('')}</select></label><button class="btn" data-page-previous type="button" ${page <= 1 ? 'disabled' : ''} aria-label="Página anterior">Anterior</button><span class="guru-media-pagination-page" aria-current="page">${page} / ${pageCount}</span><button class="btn" data-page-next type="button" ${page >= pageCount ? 'disabled' : ''} aria-label="Próxima página">Próxima</button></div>`;
  container.querySelector('[data-page-previous]').onclick = () => onPageChange?.(page - 1);
  container.querySelector('[data-page-next]').onclick = () => onPageChange?.(page + 1);
  container.querySelector('[data-page-size]').onchange = event => onPageSizeChange?.(Number(event.currentTarget.value));
}

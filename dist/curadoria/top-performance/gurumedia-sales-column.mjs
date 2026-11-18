import { readGuruMediaSalesSnapshot } from '../../tracking/tracking-gurumedia-storage.mjs?v=3';
import { readTrackingDomainList } from '../../tracking/tracking-domain-list-storage.mjs?v=8';
import * as Domain from './top-performance-domain.mjs?v=2';

const GURUMEDIA_SOURCES = new Set(['gurumedia-category', 'gurumedia-ecommerce', 'top-performers']);

function buildSalesIndex(report, guruDomains, offers) {
  const offersById = new Map(offers
    .filter(offer => GURUMEDIA_SOURCES.has(offer.sourceFormat))
    .map(offer => [String(offer.offerId), offer]));
  const offersByProductKey = new Map();
  for (const offer of offersById.values()) {
    const key = Domain.normalize(offer.productName || offer.productKey);
    if (!key) continue;
    const matches = offersByProductKey.get(key) || new Map();
    matches.set(String(offer.offerId), offer);
    offersByProductKey.set(key, matches);
  }

  const productKeysByOfferId = new Map();
  const ambiguousOfferIds = new Set();
  const domainsByHost = new Map();
  const linkedOfferIds = new Set();
  let nameMatchedTracks = 0;

  for (const domain of guruDomains) {
    let offerId = domain.offerId ? String(domain.offerId) : '';
    if (offerId) {
      const productKeys = productKeysByOfferId.get(offerId) || new Set();
      productKeys.add(Domain.normalize(domain.productKey));
      productKeysByOfferId.set(offerId, productKeys);
    } else {
      const candidates = offersByProductKey.get(Domain.normalize(domain.productKey));
      if (candidates?.size === 1) {
        offerId = candidates.keys().next().value;
        nameMatchedTracks += 1;
      } else if (candidates?.size > 1) {
        for (const candidateId of candidates.keys()) ambiguousOfferIds.add(candidateId);
      }
    }

    const hostRows = domainsByHost.get(domain.hostname) || [];
    hostRows.push({ ...domain, resolvedOfferId: offerId });
    domainsByHost.set(domain.hostname, hostRows);
    if (offerId) linkedOfferIds.add(offerId);
  }

  for (const [offerId, productKeys] of productKeysByOfferId) {
    if (productKeys.size > 1) ambiguousOfferIds.add(offerId);
  }

  const salesByOfferId = new Map();
  let unlinkedSales = 0;
  let ambiguousSales = 0;
  for (const sale of report.rows) {
    const hostRows = domainsByHost.get(sale.presellHost) || [];
    const matches = sale.productKey === null
      ? hostRows
      : hostRows.filter(domain => domain.productKey === sale.productKey);
    if (matches.length !== 1 || !matches[0].resolvedOfferId) {
      unlinkedSales += sale.salesCount;
      continue;
    }
    const offerId = matches[0].resolvedOfferId;
    if (ambiguousOfferIds.has(offerId)) {
      ambiguousSales += sale.salesCount;
      continue;
    }
    salesByOfferId.set(offerId, (salesByOfferId.get(offerId) || 0) + sale.salesCount);
  }

  return { salesByOfferId, linkedOfferIds, ambiguousOfferIds, unlinkedSales, ambiguousSales, nameMatchedTracks };
}

function emptySalesIndex() {
  return {
    salesByOfferId: new Map(),
    linkedOfferIds: new Set(),
    ambiguousOfferIds: new Set(),
    unlinkedSales: 0,
    ambiguousSales: 0,
    nameMatchedTracks: 0,
  };
}

export function mountGuruMediaSalesColumn({ document = globalThis.document, diagnostics = null } = {}) {
  const table = document.querySelector('.offer-table-surface table');
  const body = table?.querySelector('tbody');
  const lastSeenHeader = table?.querySelector('th[data-col="lastSeen"]');
  if (!table || !body || !lastSeenHeader) {
    return { renderRows() {}, async refresh() {} };
  }

  let requestId = 0;
  let currentOffers = [];
  let guruDomains = [];
  let currentReport = null;
  let index = emptySalesIndex();
  let reportRange = null;
  let loading = false;

  let salesHeader = table.querySelector('th[data-col="sales"]');
  if (!salesHeader) {
    salesHeader = document.createElement('th');
    salesHeader.dataset.col = 'sales';
    lastSeenHeader.before(salesHeader);
  }

  function renderRows(offers = undefined) {
    if (Array.isArray(offers)) currentOffers = offers;
    if (currentReport) {
      const performanceToken = diagnostics?.startStage?.('sales-index-build');
      try {
        index = buildSalesIndex(currentReport, guruDomains, currentOffers);
      } finally {
        diagnostics?.endStage?.(performanceToken, { offerCount: currentOffers.length, trackCount: guruDomains.length, salesRowCount: currentReport.rows.length });
      }
    }
    const periodDays = reportRange ? Math.round((Date.parse(`${reportRange.endDate}T00:00:00Z`) - Date.parse(`${reportRange.startDate}T00:00:00Z`)) / 86400000) + 1 : 0;
    salesHeader.textContent = periodDays > 0 ? `Vendas (${periodDays} dias)` : 'Vendas';
    salesHeader.title = reportRange
      ? `Vendas GuruMedia lidas do cache atualizado em Tracking GuruMedia, de ${reportRange.startDate} a ${reportRange.endDate} UTC. Contagem por produto/Track, sem atribuição a campanha Google Ads.`
      : 'Atualize vendas na tela Tracking GuruMedia para preencher esta coluna.';

    const offersById = new Map(currentOffers.map(item => [String(item.offerId), item]));
    const hidden = document.querySelector('#columnMenu input[data-column="sales"]')?.checked === false;
    salesHeader.classList.toggle('hidden-column', hidden);
    for (const row of body.querySelectorAll('tr[data-offer]')) {
      row.querySelector('td[data-col="sales"]')?.remove();
      const offerId = String(row.dataset.offer || '');
      const item = offersById.get(offerId);
      const cell = document.createElement('td');
      cell.dataset.col = 'sales';
      cell.className = 'number';
      cell.classList.toggle('hidden-column', hidden);

      if (!item || !GURUMEDIA_SOURCES.has(item.sourceFormat)) {
        cell.textContent = '—';
        cell.title = 'Sem associação GuruMedia confiável para este item.';
      } else if (index.ambiguousOfferIds.has(offerId)) {
        cell.textContent = 'Ambíguo';
        cell.title = 'Há mais de uma associação possível para esta oferta; as vendas não foram somadas.';
      } else if (index.linkedOfferIds.has(offerId) && reportRange) {
        const count = index.salesByOfferId.get(offerId) || 0;
        cell.textContent = String(count);
        cell.title = `${count} venda(s) associada(s) ao produto/Track entre ${reportRange.startDate} e ${reportRange.endDate} UTC. Não identifica a campanha Google Ads.`;
      } else if (loading) {
        cell.textContent = '…';
        cell.title = 'Lendo o cache local de vendas GuruMedia.';
      } else {
        cell.textContent = '—';
        cell.title = 'Sem Track GuruMedia associada de forma única a esta oferta.';
      }

      const lastSeen = row.querySelector('td[data-col="lastSeen"]');
      if (lastSeen) lastSeen.before(cell);
      else row.append(cell);
    }
  }

  async function refreshFromCache() {
    const thisRequest = ++requestId;
    const performanceToken = diagnostics?.startStage?.('sales-cache-read');
    loading = true;
    renderRows();

    try {
      const [snapshot] = await Promise.all([readGuruMediaSalesSnapshot()]);
      if (thisRequest !== requestId) return;
      const cachedDomains = readTrackingDomainList();
      guruDomains = cachedDomains.rows.filter(domain => domain.platform === 'gurumedia');
      currentReport = snapshot?.report || null;
      reportRange = currentReport ? { startDate: currentReport.startDate, endDate: currentReport.endDate } : null;
      index = currentReport ? buildSalesIndex(currentReport, guruDomains, currentOffers) : emptySalesIndex();
      renderRows();
    } catch {
      if (thisRequest !== requestId) return;
      currentReport = null;
      reportRange = null;
      guruDomains = readTrackingDomainList().rows.filter(domain => domain.platform === 'gurumedia');
      index = emptySalesIndex();
      renderRows();
    } finally {
      if (thisRequest === requestId) {
        loading = false;
        renderRows();
      }
      diagnostics?.endStage?.(performanceToken, { offerCount: currentOffers.length, trackCount: guruDomains.length, salesRowCount: currentReport?.rows?.length || 0 });
    }
  }

  let channel = null;
  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel('hub-tracking-gurumedia-sales');
      channel.addEventListener('message', event => {
        if (event.data?.type === 'snapshot-updated') void refreshFromCache();
      });
    }
  } catch { channel = null; }
  const onPageShow = () => void refreshFromCache();
  globalThis.addEventListener?.('pageshow', onPageShow);

  renderRows();
  void refreshFromCache();
  return {
    renderRows,
    refresh: refreshFromCache,
    destroy() {
      requestId += 1;
      channel?.close();
      globalThis.removeEventListener?.('pageshow', onPageShow);
    },
  };
}

import * as Storage from './top-performance-storage.mjs?v=2';
import { collectionScope } from './gurumedia-scopes.mjs?v=1';
import * as Domain from './top-performance-domain.mjs?v=3';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const dateTime = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(date) : 'Data indisponível';
};

const button = $('#openCollections');
const dialog = $('#collectionsDialog');
const list = $('#collectionList');
const snapshot = $('#collectionSnapshot');
const diagnostics = $('#collectionDiagnostics');

if (button && dialog && list && snapshot && diagnostics) {
  let saved = { offers: [], collections: [], snapshots: [], trends: [], images: [] };

  function renderSnapshots(rows, collection = null) {
    const movements = new Map((collection?.movements || []).map(item => [String(item.offerId), item]));
    const ordered = [...rows].sort((a, b) => Number(a.sourceOrder || 0) - Number(b.sourceOrder || 0));
    snapshot.innerHTML = `<h3>${escape(collectionScope(collection || {})?.label || 'Snapshots salvos')} · ${escape(dateTime(collection?.capturedAt || ordered[0]?.capturedAt))}</h3>${ordered.length
      ? `<table class="hub-table-button-behavior"><thead><tr><th>Posição</th><th>ID</th><th>Produto</th><th>Payout</th><th>Países</th><th>Movimento</th></tr></thead><tbody>${ordered.map(item => {
        const movement = movements.get(String(item.offerId));
        return `<tr><td>${escape(item.sourceOrder ?? '—')}</td><td>#${escape(item.offerId)}</td><td>${escape(item.productName || 'Nome indisponível')}</td><td>$${escape(item.payout?.value ?? '—')}</td><td>${escape((item.countriesVisible || []).join(', ') || '—')}</td><td>${movement ? escape(Domain.movementLabel(movement.movement, movement.positionDelta)) : '—'}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<p class="sub">Esta coleta não tem snapshots de produtos salvos.</p>'}`;
  }

  function renderSavedOffers() {
    snapshot.innerHTML = `<h3>Ofertas salvas (${saved.offers.length})</h3>${saved.offers.length
      ? `<table class="hub-table-button-behavior"><thead><tr><th>ID</th><th>Produto</th><th>Categoria / lista</th><th>Última coleta</th></tr></thead><tbody>${saved.offers.map(item => `<tr><td>#${escape(item.offerId)}</td><td>${escape(item.productName || 'Nome indisponível')}</td><td>${escape(item.category || collectionScope({ source: item.sourceFormat })?.label || '—')}</td><td>${escape(dateTime(item.lastSeenAt))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="sub">Nenhuma oferta está salva na lista principal.</p>'}`;
  }

  function renderSearchRecords() {
    const records = new Map();
    for (const [store, entries] of [['Google Trends', saved.trends], ['Google Imagens', saved.images]]) {
      for (const entry of entries) {
        const id = String(entry.offerId || '');
        if (!id) continue;
        const record = records.get(id) || { offerId: id, productName: entry.productName || '', sources: new Set() };
        if (!record.productName && entry.productName) record.productName = entry.productName;
        record.sources.add(store);
        records.set(id, record);
      }
    }
    const rows = [...records.values()].sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'));
    snapshot.innerHTML = `<h3>Produtos com buscas salvas (${rows.length})</h3>${rows.length
      ? `<table class="hub-table-button-behavior"><thead><tr><th>ID</th><th>Produto</th><th>Dados disponíveis</th></tr></thead><tbody>${rows.map(item => `<tr><td>#${escape(item.offerId)}</td><td>${escape(item.productName || 'Nome indisponível')}</td><td>${escape([...item.sources].join(', '))}</td></tr>`).join('')}</tbody></table>`
      : '<p class="sub">Nenhum registro de Trends ou Imagens foi encontrado.</p>'}`;
  }

  function renderCollections() {
    const collectionIds = new Set(saved.collections.map(item => String(item.collectionId)));
    const orphanGroups = new Map();
    for (const item of saved.snapshots) {
      const id = String(item.collectionId || '');
      if (!id || collectionIds.has(id)) continue;
      const rows = orphanGroups.get(id) || [];
      rows.push(item);
      orphanGroups.set(id, rows);
    }
    const items = saved.collections.map(item => ({
      id: String(item.collectionId),
      label: collectionScope(item)?.label || 'Lista não informada',
      capturedAt: item.capturedAt,
      count: item.parsedCount ?? item.offerIds?.length ?? 0,
      summary: item.summary || {},
      orphan: false,
    }));
    for (const [id, rows] of orphanGroups) {
      items.push({ id, label: 'Snapshots sem registro-resumo', capturedAt: rows[0]?.capturedAt, count: rows.length, summary: {}, orphan: true });
    }
    items.sort((a, b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')));
    list.innerHTML = items.length ? items.map(item => `<div class="collection-item"><b>${escape(dateTime(item.capturedAt))}</b><span>${escape(item.label)} · ${escape(item.count)} ofertas</span><span>${item.orphan ? 'Metadados resumidos indisponíveis' : `Novas ${escape(item.summary.new ?? 0)} · Subiram ${escape(item.summary.up ?? 0)} · Caíram ${escape(item.summary.down ?? 0)} · Saíram ${escape(item.summary.exited ?? 0)}`}</span><button class="btn" type="button" data-open-guru-collection="${escape(item.id)}">Abrir</button></div>`).join('')
      : '<div class="empty">Nenhuma coleta ou snapshot de coleta foi encontrado.</div>';
    list.querySelectorAll('[data-open-guru-collection]').forEach(control => {
      control.onclick = () => {
        const id = control.dataset.openGuruCollection;
        const collection = saved.collections.find(item => String(item.collectionId) === id) || null;
        renderSnapshots(saved.snapshots.filter(item => String(item.collectionId) === id), collection);
      };
    });

    snapshot.innerHTML = '';
    diagnostics.textContent = `Registros locais — ofertas: ${saved.offers.length}; coletas: ${saved.collections.length}; snapshots: ${saved.snapshots.length}; Trends: ${saved.trends.length}; Imagens: ${saved.images.length}.`;
    if (!saved.collections.length && !saved.snapshots.length) {
      if (saved.offers.length) renderSavedOffers();
      else if (saved.trends.length || saved.images.length) renderSearchRecords();
    }
  }

  async function loadHistory() {
    diagnostics.textContent = 'Lendo o histórico local em modo somente leitura…';
    snapshot.innerHTML = '';
    try {
      const [offers, collections, snapshots, trends, images] = await Promise.all([
        Storage.getAll(Storage.STORES.offers),
        Storage.getAll(Storage.STORES.collections),
        Storage.getAll(Storage.STORES.snapshots),
        Storage.getAll(Storage.STORES.trends),
        Storage.getAll(Storage.STORES.images),
      ]);
      saved = { offers, collections, snapshots, trends, images };
      renderCollections();
    } catch (error) {
      console.error('Não foi possível ler o histórico de coletas Guru Media.', error);
      diagnostics.textContent = 'Não foi possível ler o histórico local. Nenhum registro foi alterado.';
      list.innerHTML = '<div class="empty">Falha ao abrir o banco local da Guru Media.</div>';
      snapshot.innerHTML = '';
    }
  }

  button.onclick = () => {
    if (!dialog.open) dialog.showModal();
    void loadHistory();
  };
  dialog.querySelectorAll('[data-close="collectionsDialog"]').forEach(control => {
    control.onclick = () => dialog.close();
  });
}

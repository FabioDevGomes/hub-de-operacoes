import { dateInTimeZone, makeAudit, makeId, mccConversionSaleId, normalizeMovement, normalizeSale, provisionalSaleToBilling } from './billing-domain.mjs?v=15';
import { readGoogleAdsSourceMode } from '../google-ads/google-ads-source-preference.mjs?v=2';
import { DB_NAME, DB_VERSION, ensureStores, openDatabase, BILLING_STORES as SCHEMA_BILLING_STORES, PERSONAL_FINANCE_STORES } from '../storage/hub-database.mjs?v=1';

export const BILLING_DB_NAME = DB_NAME;
export const BILLING_DB_VERSION = DB_VERSION;
export const BILLING_STORES = Object.freeze({ sales: 'billing_sales', movements: 'billing_movements', audit: 'billing_audit', meta: 'billing_meta' });
export const BILLING_STORE_NAMES = Object.freeze(Object.values(BILLING_STORES));
export const BILLING_SEED_KEY = 'seed:legacy-faturamento:v1';
export const LEGACY_BILLING_SEED_SOURCE = 'legacy_faturamento_xlsx';

// Retain the public compatibility helper without another schema declaration.
export function ensureBillingStores(db, transaction) {
  ensureStores(db, transaction, [...SCHEMA_BILLING_STORES, ...PERSONAL_FINANCE_STORES]);
}

export function validateBillingBundle(bundle) {
  if (!bundle || bundle.schema !== 'billing_backup_v1') throw new Error('O backup não contém um módulo Faturamento compatível.');
  for (const field of ['sales', 'movements', 'audit', 'meta']) if (!Array.isArray(bundle[field])) throw new Error(`Backup de Faturamento inválido: lista ${field} ausente.`);
  const sales = bundle.sales.map(sale => normalizeSale(sale));
  const saleIds = new Set(sales.map(sale => sale.sale_id));
  if (saleIds.size !== sales.length) throw new Error('Backup de Faturamento contém IDs de venda duplicados.');
  const movements = bundle.movements.map(move => normalizeMovement(move));
  if (movements.some(move => !saleIds.has(move.sale_id))) throw new Error('Backup de Faturamento contém movimento sem venda correspondente.');
  const movementIds = new Set(movements.map(move => move.movement_id));
  if (movementIds.size !== movements.length) throw new Error('Backup de Faturamento contém IDs de movimento duplicados.');
  return { schema: 'billing_backup_v1', version: 1, exported_at: bundle.exported_at || new Date().toISOString(), sales, movements, audit: bundle.audit, meta: bundle.meta };
}

export function planSeedImport(seed, { installedVersion = 0, existingSales = [], existingMovements = [] } = {}) {
  if (Number(installedVersion) >= Number(seed.version)) return { alreadyApplied: true, sales: [], movements: [] };
  const salesIds = new Set(existingSales);
  const movementIds = new Set(existingMovements);
  return {
    alreadyApplied: false,
    sales: (seed.sales || []).filter(record => !salesIds.has(record.sale_id)),
    movements: (seed.movements || []).filter(record => !movementIds.has(record.movement_id)),
  };
}

export function writeBillingBundleToTransaction(transaction, bundle) {
  const normalized = validateBillingBundle(bundle);
  for (const name of BILLING_STORE_NAMES) transaction.objectStore(name).clear();
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const movements = transaction.objectStore(BILLING_STORES.movements);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  const meta = transaction.objectStore(BILLING_STORES.meta);
  for (const item of normalized.sales) sales.put(item);
  for (const item of normalized.movements) movements.put(item);
  for (const item of normalized.audit) audit.put(item);
  for (const item of normalized.meta) meta.put(item);
}

export function migrateAccountAliasesToTransaction(transaction, aliases, campaignAccounts, { now = new Date().toISOString() } = {}) {
  const resolved = new Map(Object.entries(aliases || {}).filter(([suffix, id]) => /^\d{4}$/.test(suffix) && /^\d{3}-\d{3}-\d{4}$/.test(String(id))));
  if (!resolved.size) return;
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  const request = sales.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const previous = cursor.value;
    const account = resolved.get(String(previous.account || '').trim());
    const linkedAccount = campaignAccounts?.[String(previous.campaign_id || '')];
    if (account && account === linkedAccount && account !== previous.account) {
      cursor.update({ ...previous, account, updated_at:now });
      audit.add(makeAudit('account_id_linked_from_mcc', 'sale', previous.sale_id, [
        { field:'account', old_value:previous.account, new_value:account }
      ], { now }));
    }
    cursor.continue();
  };
  request.onerror = () => transaction.abort();
}

export function upsertProvisionalSalesToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(item => {
    const legacyId = String(item?.id || '').match(/^sale_([a-z0-9]+)$/i)?.[1];
    const billingSaleId = String(item?.billing_sale_id || '').trim() || (legacyId ? `manual-sale:cmp_${legacyId}` : '');
    if (!billingSaleId || !item?.id || !item?.campanha_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.data||'')) || !Number.isFinite(Number(item.valor_brl)) || Number(item.valor_brl)<=0) return null;
    const source = { ...item, billing_sale_id:billingSaleId };
    return { source, sale:provisionalSaleToBilling(source, { now }) };
  }).filter(Boolean);
  if (!entries.length) return 0;
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const { source, sale: incoming } of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing) {
        sales.add(incoming);
        audit.add(makeAudit('manual_sale_linked', 'sale', incoming.sale_id, Object.entries(incoming)
          .filter(([field]) => !['sale_id', 'created_at', 'updated_at'].includes(field))
          .map(([field, newValue]) => ({ field, old_value:null, new_value:newValue })), { now }));
        reconcileMccAggregateForManualSale(transaction, sales, audit, incoming, source, now);
        return;
      }
      if (existing.source_ref !== String(source.id)) return;
      const patch = {
        confirmation_status:incoming.confirmation_status,
        confirmation_source:incoming.confirmation_source,
        confirmed_at:incoming.confirmed_at,
        account:existing.account || incoming.account,
        campaign_id:existing.campaign_id || incoming.campaign_id,
      };
      const changed = Object.keys(patch).filter(field => !Object.is(existing[field] ?? null, patch[field] ?? null));
      if (!changed.length) return;
      const updated = normalizeSale({ ...existing, ...patch, updated_at:now }, { now });
      sales.put(updated);
      audit.add(makeAudit(incoming.confirmation_status === 'confirmed' ? 'sale_confirmed_by_mcc' : 'sale_confirmation_reverted_by_mcc', 'sale', incoming.sale_id,
        changed.map(field => ({ field, old_value:existing[field] ?? null, new_value:updated[field] ?? null })), { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

export function linkProvisionalSaleAccountsToCampaignsToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(source => {
    const legacyId = String(source?.id || '').match(/^sale_([a-z0-9]+)$/i)?.[1];
    const saleId = String(source?.billing_sale_id || '').trim() || (legacyId ? `manual-sale:cmp_${legacyId}` : '');
    const sourceRef = String(source?.id || '').trim();
    const campaignId = String(source?.campanha_id || '').trim();
    const account = String(source?.conta || '').trim();
    if (!saleId || !sourceRef || !campaignId || !account || source?.status === 'cancelada') return null;
    return { saleId, sourceRef, campaignId, account };
  }).filter(Boolean);
  if (!entries.length) return 0;

  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const entry of entries) {
    const request = sales.get(entry.saleId);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing || existing.source !== 'hub_manual_capture' || existing.source_ref !== entry.sourceRef
        || existing.campaign_id !== entry.campaignId || existing.active === false || existing.cancelled_at
        || String(existing.account || '').trim()) return;

      const updated = normalizeSale({ ...existing, account:entry.account, updated_at:now }, { now });
      sales.put(updated);
      audit.add(makeAudit('manual_sale_account_linked_from_campaign', 'sale', entry.saleId, [
        { field:'account', old_value:existing.account || null, new_value:updated.account },
      ], { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

function accountMatchingProductKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function linkManualSaleAccountsFromDiaryToTransaction(transaction, diaryCandidates, { now = new Date().toISOString() } = {}) {
  const candidatesByDate = new Map();
  for (const source of diaryCandidates || []) {
    const saleDate = String(source?.sale_date || source?.data || '').trim();
    const productKey = accountMatchingProductKey(source?.product || source?.produto);
    const account = String(source?.account || source?.conta || '').trim();
    const conversions = Number(source?.conversion_count ?? source?.conversions);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate) || !productKey || !account || !Number.isFinite(conversions) || conversions <= 0) continue;
    if (!candidatesByDate.has(saleDate)) candidatesByDate.set(saleDate, []);
    candidatesByDate.get(saleDate).push({ productKey, account });
  }
  if (!candidatesByDate.size) return 0;

  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const [saleDate, candidates] of candidatesByDate) {
    const request = sales.index('sale_date').openCursor(saleDate);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const existing = cursor.value;
      const productKey = accountMatchingProductKey(existing?.product);
      if (existing?.source === 'manual' && !String(existing.account || '').trim() && !String(existing.campaign_id || '').trim()
        && !String(existing.source_ref || '').trim() && existing.active !== false && !existing.cancelled_at) {
        const matches = candidates.filter(candidate => productKey === candidate.productKey || productKey.startsWith(`${candidate.productKey} `));
        const specificity = matches.reduce((max, candidate) => Math.max(max, candidate.productKey.length), 0);
        const accounts = new Set(matches.filter(candidate => candidate.productKey.length === specificity).map(candidate => candidate.account));
        if (specificity && accounts.size === 1) {
          const account = [...accounts][0];
          const updated = normalizeSale({ ...existing, account, updated_at:now }, { now });
          cursor.update(updated);
          audit.add(makeAudit('manual_sale_account_linked_from_unique_diary_match', 'sale', existing.sale_id, [
            { field:'account', old_value:existing.account || null, new_value:updated.account },
          ], { now }));
        }
      }
      cursor.continue();
    };
    request.onerror = () => transaction.abort();
  }
  return candidatesByDate.size;
}

export function correctProvisionalSaleValuesToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(source => {
    if (!source?.id || !source?.billing_sale_id || !Number.isFinite(Number(source.valor_brl)) || Number(source.valor_brl) <= 0) return null;
    return { source, incoming: provisionalSaleToBilling(source, { now }) };
  }).filter(Boolean);
  if (!entries.length) throw new Error('Nenhum lançamento manual válido foi informado para corrigir.');
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const { source, incoming } of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing || existing.source !== 'hub_manual_capture' || existing.source_ref !== String(source.id)) {
        transaction.abort();
        return;
      }
      if (Object.is(Number(existing.value_brl), Number(incoming.value_brl))) return;
      const updated = normalizeSale({ ...existing, value_brl: incoming.value_brl, updated_at: now }, { now });
      sales.put(updated);
      audit.add(makeAudit('financial_value_corrected', 'sale', incoming.sale_id, [
        { field: 'value_brl', old_value: existing.value_brl ?? null, new_value: updated.value_brl },
      ], { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

export function syncEditedProvisionalSalesToTransaction(transaction, provisionalSales, { now = new Date().toISOString() } = {}) {
  const entries = (provisionalSales || []).map(source => {
    if (!source?.id || !source?.billing_sale_id || !source?.campanha_id || !Number.isFinite(Number(source.valor_brl)) || Number(source.valor_brl) <= 0) return null;
    return { source, incoming: provisionalSaleToBilling(source, { now }) };
  }).filter(Boolean);
  if (!entries.length) throw new Error('Nenhum lançamento provisório válido foi informado para sincronizar.');
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const { source, incoming } of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (!existing || existing.source !== 'hub_manual_capture' || existing.source_ref !== String(source.id)) {
        transaction.abort();
        return;
      }
      const patch = {
        sale_date:incoming.sale_date,
        product:incoming.product,
        platform:incoming.platform,
        account:incoming.account,
        value_brl:incoming.value_brl,
        campaign_id:incoming.campaign_id,
        country_code:incoming.country_code,
        sale_time:incoming.sale_time,
        confirmation_status:incoming.confirmation_status,
        confirmation_source:incoming.confirmation_source,
        confirmed_at:incoming.confirmed_at,
        notes:incoming.notes,
      };
      const changed = Object.keys(patch).filter(field => !Object.is(existing[field] ?? null, patch[field] ?? null));
      if (!changed.length) return;
      const updated = normalizeSale({ ...existing, ...patch, updated_at:now }, { now });
      sales.put(updated);
      const action = changed.includes('campaign_id') && source.conciliacao_origem === 'mcc_d0' ? 'manual_sale_linked_to_mcc_d0'
        : changed.includes('campaign_id') && source.conciliacao_origem === 'mcc_d1' ? 'manual_sale_linked_to_mcc_d1'
          : changed.length === 1 && changed[0] === 'value_brl' ? 'financial_value_corrected' : 'provisional_sale_updated';
      audit.add(makeAudit(action, 'sale', incoming.sale_id,
        changed.map(field => ({ field, old_value:existing[field] ?? null, new_value:updated[field] ?? null })), { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

function reconcileMccAggregateForManualSale(transaction, sales, audit, manual, source, now) {
  if (!source?.campanha_id || !source?.data) return;
  const request = sales.get(mccConversionSaleId(source.campanha_id, source.data));
  request.onsuccess = () => {
    const existing = request.result;
    if (!existing || existing.source !== 'mcc_conversion_aggregate' || existing.active === false && !(existing.mcc_linked_sale_ids || []).length) return;
    const linkedIds = Array.isArray(existing.mcc_linked_sale_ids) ? existing.mcc_linked_sale_ids : [];
    const reportedCount = Math.max(0, Number(existing.mcc_reported_conversion_count ?? (Number(existing.conversion_count || 0) + linkedIds.length)) - 1);
    const reportedStatus = reportedCount > 0 ? existing.mcc_reported_confirmation_status || existing.confirmation_status : 'represented_by_billing_sale';
    const reportedNotes = `${existing.mcc_reported_notes || existing.notes || ''}${existing.mcc_reported_notes || existing.notes ? ' ' : ''}Uma venda manual também foi vinculada; o valor agregado não é separável.`;
    const patch = linkedIds.length ? coveredMccAggregatePatch(existing, {
      linkedIds,
      reportedConversionCount:reportedCount,
      reportedValueBrl:null,
      reportedValueUsd:null,
      reportedConfirmationStatus:reportedStatus,
      reportedConfirmationSource:existing.mcc_reported_confirmation_source || existing.confirmation_source,
      reportedActive:reportedCount > 0,
      reportedNotes,
      reportedManualValueOverride:false,
      now,
    }) : {
      conversion_count:Math.max(0, Number(existing.conversion_count || 0) - 1),
      active:Math.max(0, Number(existing.conversion_count || 0) - 1) > 0,
      value_brl:null,
      value_usd:null,
      manual_value_override:false,
      confirmation_status:Math.max(0, Number(existing.conversion_count || 0) - 1) > 0 ? existing.confirmation_status : 'represented_by_manual',
      notes:Math.max(0, Number(existing.conversion_count || 0) - 1) > 0
        ? `Restam ${Math.max(0, Number(existing.conversion_count || 0) - 1)} conversão(ões) MCC sem vínculo individual. O valor agregado não foi dividido após associar uma conversão a lançamento manual.`
        : 'Conversões MCC cobertas por lançamento(s) manual(is); valor agregado removido do total para evitar duplicidade.',
    };
    patch.updated_at = now;
    const changed = Object.keys(patch).filter(field => !Object.is(existing[field] ?? null, patch[field] ?? null));
    if (!changed.length) return;
    sales.put(normalizeSale({ ...existing, ...patch }, { now }));
    audit.add(makeAudit('mcc_aggregate_adjusted_for_manual_sale', 'sale', existing.sale_id,
      changed.map(field => ({ field, old_value:existing[field] ?? null, new_value:patch[field] ?? null })), { now }));
  };
  request.onerror = () => transaction.abort();
}

function coveredMccAggregatePatch(existing, { linkedIds, reportedConversionCount, reportedValueBrl, reportedValueUsd,
  reportedConfirmationStatus, reportedConfirmationSource, reportedActive, reportedNotes, reportedManualValueOverride = false, now }) {
  const ids = [...new Set((linkedIds || []).map(value => String(value || '').trim()).filter(Boolean))];
  const count = Math.max(0, Number(reportedConversionCount) || 0);
  const remaining = Math.max(0, count - ids.length);
  const active = remaining > 0 && reportedActive !== false;
  const mismatch = ids.length > count;
  return {
    ...existing,
    mcc_linked_sale_ids:ids,
    mcc_reported_conversion_count:count,
    mcc_reported_value_brl:reportedValueBrl == null ? null : Number(reportedValueBrl),
    mcc_reported_value_usd:reportedValueUsd == null ? null : Number(reportedValueUsd),
    mcc_reported_confirmation_status:reportedConfirmationStatus || null,
    mcc_reported_confirmation_source:reportedConfirmationSource || null,
    mcc_reported_active:reportedActive !== false,
    mcc_reported_notes:String(reportedNotes || ''),
    mcc_reported_manual_value_override:reportedManualValueOverride === true,
    conversion_count:remaining,
    active,
    value_brl:ids.length ? null : (reportedValueBrl == null ? null : Number(reportedValueBrl)),
    value_usd:ids.length ? null : (reportedValueUsd == null ? null : Number(reportedValueUsd)),
    manual_value_override:ids.length ? false : reportedManualValueOverride === true,
    confirmation_status:remaining > 0 ? reportedConfirmationStatus || existing.confirmation_status
      : ids.length && count >= ids.length ? 'represented_by_billing_sale' : reportedConfirmationStatus || existing.confirmation_status,
    confirmation_source:remaining > 0 ? reportedConfirmationSource || existing.confirmation_source
      : ids.length ? 'Venda GuruMedia vinculada' : reportedConfirmationSource || existing.confirmation_source,
    notes:ids.length
      ? `${String(reportedNotes || '').trim()}${String(reportedNotes || '').trim() ? ' ' : ''}${remaining > 0
        ? `${remaining} conversão(ões) residuais permanecem sem valor individual. O valor bruto MCC foi preservado nos dados de origem para evitar somá-lo novamente à comissão GuruMedia.`
        : mismatch
          ? `O agregado informa ${count} conversão(ões) disponíveis para ${ids.length} vínculo(s) GuruMedia; revise a captura MCC. A comissão GuruMedia continua registrada.`
          : 'A(s) conversão(ões) MCC foi(ram) vinculada(s) a venda(s) GuruMedia; o agregado não entra novamente nos totais financeiros.'}`
      : String(reportedNotes || ''),
    updated_at:now,
  };
}

function removeGuruMediaCoverageFromAggregate(aggregate, saleId, now) {
  if (!aggregate || aggregate.source !== 'mcc_conversion_aggregate') return null;
  const currentIds = Array.isArray(aggregate.mcc_linked_sale_ids) ? aggregate.mcc_linked_sale_ids : [];
  if (!currentIds.includes(String(saleId))) return null;
  const linkedIds = currentIds.filter(value => value !== String(saleId));
  const reportedCount = aggregate.mcc_reported_conversion_count ?? (Number(aggregate.conversion_count || 0) + currentIds.length);
  const reportedValuesAreKnown = Object.hasOwn(aggregate, 'mcc_reported_value_brl') || Object.hasOwn(aggregate, 'mcc_reported_value_usd');
  const reportedNotes = aggregate.mcc_reported_notes || '';
  const patch = coveredMccAggregatePatch(aggregate, {
    linkedIds,
    reportedConversionCount:reportedCount,
    reportedValueBrl:reportedValuesAreKnown ? aggregate.mcc_reported_value_brl : aggregate.value_brl,
    reportedValueUsd:reportedValuesAreKnown ? aggregate.mcc_reported_value_usd : aggregate.value_usd,
    reportedConfirmationStatus:aggregate.mcc_reported_confirmation_status || aggregate.confirmation_status,
    reportedConfirmationSource:aggregate.mcc_reported_confirmation_source || aggregate.confirmation_source,
    reportedActive:aggregate.mcc_reported_active ?? aggregate.active,
    reportedNotes,
    reportedManualValueOverride:aggregate.mcc_reported_manual_value_override,
    now,
  });
  return normalizeSale(patch, { now });
}

export function linkGuruMediaSaleToMccToTransaction(transaction, saleId, aggregateSaleId, { now = new Date().toISOString() } = {}) {
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  const result = { updated:null, failure:null };
  const saleRequest = sales.get(String(saleId));
  saleRequest.onsuccess = () => {
    const sale = saleRequest.result;
    if (!sale || sale.source !== 'gurumedia_postback' || sale.active === false || sale.cancelled_at) {
      result.failure = new Error('A venda GuruMedia ativa não foi encontrada para conciliar.');
      transaction.abort();
      return;
    }
    if (sale.mcc_match_aggregate_id) {
      result.failure = new Error('Esta venda GuruMedia já está vinculada a um agregado MCC.');
      transaction.abort();
      return;
    }
    const aggregateRequest = sales.get(String(aggregateSaleId));
    aggregateRequest.onsuccess = () => {
      const aggregate = aggregateRequest.result;
      const count = Number(aggregate?.conversion_count);
      if (!aggregate || aggregate.source !== 'mcc_conversion_aggregate' || aggregate.active === false
          || !Number.isInteger(count) || count < 1) {
        result.failure = new Error('O agregado MCC selecionado não tem conversão inteira residual disponível. Atualize o Faturamento e revise novamente.');
        transaction.abort();
        return;
      }
      const linkedIds = [...new Set([...(aggregate.mcc_linked_sale_ids || []), sale.sale_id])];
      const hasPriorLinks = (aggregate.mcc_linked_sale_ids || []).length > 0;
      const reportedCount = hasPriorLinks ? aggregate.mcc_reported_conversion_count ?? (count + (aggregate.mcc_linked_sale_ids || []).length) : count;
      const reportedValueBrl = hasPriorLinks ? aggregate.mcc_reported_value_brl : aggregate.value_brl;
      const reportedValueUsd = hasPriorLinks ? aggregate.mcc_reported_value_usd : aggregate.value_usd;
      const updatedAggregate = normalizeSale(coveredMccAggregatePatch(aggregate, {
        linkedIds,
        reportedConversionCount:reportedCount,
        reportedValueBrl,
        reportedValueUsd,
        reportedConfirmationStatus:hasPriorLinks ? aggregate.mcc_reported_confirmation_status || aggregate.confirmation_status : aggregate.confirmation_status,
        reportedConfirmationSource:hasPriorLinks ? aggregate.mcc_reported_confirmation_source || aggregate.confirmation_source : aggregate.confirmation_source,
        reportedActive:hasPriorLinks ? aggregate.mcc_reported_active ?? aggregate.active : aggregate.active,
        reportedNotes:hasPriorLinks ? aggregate.mcc_reported_notes || aggregate.notes : aggregate.notes,
        reportedManualValueOverride:hasPriorLinks ? aggregate.mcc_reported_manual_value_override : aggregate.manual_value_override,
        now,
      }), { now });
      const saleOverrides = new Set(Array.isArray(sale.source_overrides) ? sale.source_overrides : []);
      const saleCreatedAt = Date.parse(sale.created_at || '');
      const aggregateCreatedAt = Date.parse(aggregate.created_at || '');
      const aggregateArrivedFirst = Number.isFinite(saleCreatedAt) && Number.isFinite(aggregateCreatedAt) && aggregateCreatedAt < saleCreatedAt;
      const sourceDate = aggregateArrivedFirst
        ? aggregate.sale_date
        : dateInTimeZone(sale.source_conversion_at_utc, 'America/Sao_Paulo')
          || dateInTimeZone(sale.source_received_at_utc, 'America/Sao_Paulo')
          || sale.sale_date;
      const preserveManualDate = saleOverrides.has('sale_date');
      const resolvedSaleDate = preserveManualDate ? sale.sale_date : sourceDate;
      saleOverrides.add('sale_date');
      const updatedSale = normalizeSale({ ...sale, sale_date:resolvedSaleDate, source_overrides:[...saleOverrides], mcc_match_aggregate_id:aggregate.sale_id, mcc_match_confirmed_at:now, updated_at:now }, { now });
      sales.put(updatedAggregate);
      sales.put(updatedSale);
      audit.add(makeAudit('gurumedia_sale_linked_to_mcc', 'sale', sale.sale_id, [
        { field:'mcc_match_aggregate_id', old_value:null, new_value:aggregate.sale_id },
        { field:'mcc_match_confirmed_at', old_value:null, new_value:now },
        ...(sale.sale_date !== updatedSale.sale_date ? [{ field:'sale_date', old_value:sale.sale_date, new_value:updatedSale.sale_date }] : []),
        ...(JSON.stringify(sale.source_overrides || []) !== JSON.stringify(updatedSale.source_overrides || []) ? [{ field:'source_overrides', old_value:sale.source_overrides || [], new_value:updatedSale.source_overrides || [] }] : []),
      ], { now }));
      const aggregateFields = Object.keys(updatedAggregate).filter(field => !['sale_id','created_at','updated_at'].includes(field)
        && !Object.is(aggregate[field] ?? null, updatedAggregate[field] ?? null));
      audit.add(makeAudit('mcc_aggregate_adjusted_for_gurumedia_sale', 'sale', aggregate.sale_id,
        aggregateFields.map(field => ({ field, old_value:aggregate[field] ?? null, new_value:updatedAggregate[field] ?? null })), { now }));
      result.updated = updatedSale;
    };
    aggregateRequest.onerror = () => { result.failure = aggregateRequest.error; transaction.abort(); };
  };
  saleRequest.onerror = () => { result.failure = saleRequest.error; transaction.abort(); };
  return result;
}

export async function linkGuruMediaSaleToMcc(saleId, aggregateSaleId, { now = new Date().toISOString() } = {}) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const result = linkGuruMediaSaleToMccToTransaction(tx, saleId, aggregateSaleId, { now });
    tx.oncomplete = () => { db.close(); resolve(result.updated); };
    tx.onerror = () => { db.close(); reject(result.failure || tx.error); };
    tx.onabort = () => { db.close(); reject(result.failure || tx.error || new Error('Não foi possível vincular a venda GuruMedia ao agregado MCC.')); };
  });
}

export function unlinkGuruMediaSaleFromMccToTransaction(transaction, saleId, { now = new Date().toISOString() } = {}) {
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  const result = { updated:null, failure:null };
  const saleRequest = sales.get(String(saleId));
  saleRequest.onsuccess = () => {
    const sale = saleRequest.result;
    if (!sale || sale.source !== 'gurumedia_postback' || !sale.mcc_match_aggregate_id) {
      result.failure = new Error('A venda GuruMedia não tem um vínculo MCC para remover.');
      transaction.abort();
      return;
    }
    const aggregateRequest = sales.get(String(sale.mcc_match_aggregate_id));
    aggregateRequest.onsuccess = () => {
      const aggregate = aggregateRequest.result;
      const updatedAggregate = removeGuruMediaCoverageFromAggregate(aggregate, sale.sale_id, now);
      if (!updatedAggregate) {
        result.failure = new Error('O vínculo salvo não foi encontrado no agregado MCC. Nenhum dado foi alterado.');
        transaction.abort();
        return;
      }
      const updatedSale = normalizeSale({ ...sale, mcc_match_aggregate_id:null, mcc_match_confirmed_at:null, updated_at:now }, { now });
      sales.put(updatedAggregate);
      sales.put(updatedSale);
      audit.add(makeAudit('gurumedia_sale_unlinked_from_mcc', 'sale', sale.sale_id, [
        { field:'mcc_match_aggregate_id', old_value:sale.mcc_match_aggregate_id, new_value:null },
        { field:'mcc_match_confirmed_at', old_value:sale.mcc_match_confirmed_at || null, new_value:null },
      ], { now }));
      audit.add(makeAudit('mcc_aggregate_restored_after_gurumedia_unlink', 'sale', aggregate.sale_id,
        Object.keys(updatedAggregate).filter(field => !['sale_id','created_at','updated_at'].includes(field)
          && !Object.is(aggregate[field] ?? null, updatedAggregate[field] ?? null))
          .map(field => ({ field, old_value:aggregate[field] ?? null, new_value:updatedAggregate[field] ?? null })), { now }));
      result.updated = updatedSale;
    };
    aggregateRequest.onerror = () => { result.failure = aggregateRequest.error; transaction.abort(); };
  };
  saleRequest.onerror = () => { result.failure = saleRequest.error; transaction.abort(); };
  return result;
}

export async function unlinkGuruMediaSaleFromMcc(saleId, { now = new Date().toISOString() } = {}) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const result = unlinkGuruMediaSaleFromMccToTransaction(tx, saleId, { now });
    tx.oncomplete = () => { db.close(); resolve(result.updated); };
    tx.onerror = () => { db.close(); reject(result.failure || tx.error); };
    tx.onabort = () => { db.close(); reject(result.failure || tx.error || new Error('Não foi possível remover o vínculo GuruMedia–MCC.')); };
  });
}

export function upsertMccConversionSalesToTransaction(transaction, mccSales, { now = new Date().toISOString(), onlyIfMissing = false, preserveExistingPlatform = false, sourceMode = readGoogleAdsSourceMode(), onChanged = null } = {}) {
  const entries = (mccSales || []).map(item => normalizeSale({ ...item, updated_at:now }, { now }));
  if (!entries.length) return 0;
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  for (const incoming of entries) {
    const request = sales.get(incoming.sale_id);
    request.onsuccess = () => {
      const existing = request.result;
      if (incoming.data_source === 'google_ads_api' && sourceMode !== 'api') return;
      if (sourceMode === 'api' && existing?.data_source === 'google_ads_api' && incoming.data_source !== 'google_ads_api' && incoming.source_period !== 'd1') return;
      if (existing && onlyIfMissing && !(existing.source === 'mcc_conversion_aggregate' && existing.source_period !== 'd1' && incoming.source_period === 'd1')) return;
      if (!existing && incoming.active === false) return;
      if (existing && existing.source !== 'mcc_conversion_aggregate') return;
      if (existing?.source_period === 'd1' && incoming.source_period === 'd0') return;
      const paymentFields = existing ? {
        payment_status:existing.payment_status,
        observed_payment_status:existing.observed_payment_status,
        created_at:existing.created_at,
      } : {};
      const manualValueOverride = existing?.source === 'mcc_conversion_aggregate' && existing.manual_value_override === true
        ? { value_brl:existing.value_brl, value_usd:existing.value_usd, manual_value_override:true }
        : {};
      const manualPlatformOverride = existing?.source === 'mcc_conversion_aggregate' && existing.manual_platform_override === true
        ? { platform:existing.platform, mcc_source_platform:existing.mcc_source_platform || existing.platform, manual_platform_override:true }
        : {};
      const preservedPlatform = preserveExistingPlatform && existing?.source === 'mcc_conversion_aggregate' && existing.manual_platform_override !== true
        ? { platform:existing.platform }
        : {};
      const linkedSaleIds = existing?.source === 'mcc_conversion_aggregate' && Array.isArray(existing.mcc_linked_sale_ids)
        ? [...new Set(existing.mcc_linked_sale_ids.map(value => String(value || '').trim()).filter(Boolean))] : [];
      const preserveReportedOverride = existing?.source === 'mcc_conversion_aggregate' && existing.mcc_reported_manual_value_override === true;
      const reportedValueBrl = preserveReportedOverride ? existing.mcc_reported_value_brl : incoming.value_brl;
      const reportedValueUsd = preserveReportedOverride ? existing.mcc_reported_value_usd : incoming.value_usd;
      const reportedCount = Number(incoming.conversion_count || 0);
      const reportedStatus = incoming.confirmation_status;
      const reportedActive = incoming.active !== false;
      const updatedInput = linkedSaleIds.length ? coveredMccAggregatePatch({ ...existing, ...incoming, ...paymentFields, ...manualPlatformOverride, ...preservedPlatform }, {
        linkedIds:linkedSaleIds,
        reportedConversionCount:reportedCount,
        reportedValueBrl,
        reportedValueUsd,
        reportedConfirmationStatus:reportedStatus,
        reportedConfirmationSource:incoming.confirmation_source,
        reportedActive,
        reportedNotes:incoming.notes,
        reportedManualValueOverride:preserveReportedOverride,
        now,
      }) : { ...existing, ...incoming, ...paymentFields, ...manualValueOverride, ...manualPlatformOverride, ...preservedPlatform, updated_at:now };
      const updated = normalizeSale({ ...updatedInput, updated_at:now }, { now });
      const fields = existing
        ? Object.keys(updated).filter(field => !['sale_id', 'created_at', 'updated_at'].includes(field) && !Object.is(existing[field] ?? null, updated[field] ?? null))
        : Object.keys(updated).filter(field => !['sale_id', 'created_at', 'updated_at'].includes(field));
      if (!fields.length) return;
      if (existing) sales.put(updated); else sales.add(updated);
      if (typeof onChanged === 'function') onChanged({ saleId:incoming.sale_id, inserted:!existing, fields });
      const action = incoming.confirmation_status === 'confirmed'
        ? 'mcc_conversion_confirmed_d1'
        : incoming.confirmation_status === 'provisional'
          ? 'mcc_conversion_provisional_d0'
          : incoming.confirmation_status === 'represented_by_manual'
            ? 'mcc_conversion_covered_by_manual_sale'
            : 'mcc_conversion_not_confirmed';
      audit.add(makeAudit(incoming.data_source === 'google_ads_api' ? action.replace(/^mcc_/, 'google_ads_api_') : action, 'sale', incoming.sale_id,
        fields.map(field => ({ field, old_value:existing?.[field] ?? null, new_value:updated[field] ?? null })), { now }));
    };
    request.onerror = () => transaction.abort();
  }
  return entries.length;
}

export async function upsertExternalSalesToBilling(records, { now = new Date().toISOString() } = {}) {
  if (!Array.isArray(records) || records.length > 500) throw new Error('A página de vendas externa excede o limite seguro do Faturamento.');
  const entries = records.map((record, index) => normalizeSale(record, { now, id: `external-sale-${index}` }));
  if (!entries.length) return { inserted: 0, updated: 0, unchanged: 0, conflicts: 0 };
  const ids = new Set();
  for (const entry of entries) {
    if (!entry.external_id || !['gurumedia_postback', 'clickbank_ins_v8'].includes(entry.source)) {
      throw new Error('Uma venda externa não contém origem e identificador estáveis.');
    }
    if (ids.has(entry.sale_id)) throw new Error('A página externa contém IDs de venda duplicados.');
    ids.add(entry.sale_id);
  }
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const sales = tx.objectStore(BILLING_STORES.sales);
    const audit = tx.objectStore(BILLING_STORES.audit);
    const result = { inserted: 0, updated: 0, unchanged: 0, conflicts: 0 };
    for (const incoming of entries) {
      const request = sales.get(incoming.sale_id);
      request.onsuccess = () => {
        const existing = request.result;
        if (!existing) {
          sales.add(incoming);
          audit.add(makeAudit('external_sale_imported', 'sale', incoming.sale_id,
            Object.keys(incoming).filter(field => !['sale_id', 'created_at', 'updated_at'].includes(field))
              .map(field => ({ field, old_value: null, new_value: incoming[field] ?? null })), { now }));
          result.inserted += 1;
          return;
        }
        if (existing.source !== incoming.source || existing.external_id !== incoming.external_id) {
          result.conflicts += 1;
          return;
        }
        const preservedFields = [
          'payment_status', 'observed_payment_status', 'confirmation_status', 'confirmation_source', 'confirmed_at',
          'campaign_id', 'country_code', 'conversion_count', 'active', 'cancelled_at', 'cancellation_reason',
          'manual_value_override', 'manual_platform_override', 'mcc_source_platform',
          'mcc_match_aggregate_id', 'mcc_match_confirmed_at',
        ];
        const merged = { ...incoming, created_at: existing.created_at || incoming.created_at, source_overrides: existing.source_overrides || [] };
        for (const field of preservedFields) if (Object.hasOwn(existing, field)) merged[field] = existing[field];
        for (const field of Array.isArray(merged.source_overrides) ? merged.source_overrides : []) {
          if (Object.hasOwn(existing, field)) merged[field] = existing[field];
        }
        let updated;
        try { updated = normalizeSale({ ...merged, updated_at: now }, { now }); }
        catch { tx.abort(); return; }
        const changes = Object.keys(updated)
          .filter(field => !['sale_id', 'created_at', 'updated_at'].includes(field)
            && !Object.is(existing[field] ?? null, updated[field] ?? null))
          .map(field => ({ field, old_value: existing[field] ?? null, new_value: updated[field] ?? null }));
        if (!changes.length) {
          result.unchanged += 1;
          return;
        }
        sales.put(updated);
        audit.add(makeAudit('external_sale_refreshed', 'sale', incoming.sale_id, changes, { now }));
        result.updated += 1;
      };
      request.onerror = () => tx.abort();
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Não foi possível sincronizar vendas no Faturamento local.')); };
  });
}

export function openBillingDatabase() { return openDatabase(); }

export async function readBillingMetaRecord(key) {
  const normalizedKey = String(key ?? '').trim();
  if (!normalizedKey || normalizedKey.length > 180) throw new Error('A chave dos metadados do Faturamento é inválida.');
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.meta], 'readonly');
    const request = tx.objectStore(BILLING_STORES.meta).get(normalizedKey);
    let record = null;
    request.onsuccess = () => { record = request.result || null; };
    request.onerror = () => { db.close(); reject(request.error || new Error('Não foi possível ler os metadados do Faturamento.')); };
    tx.oncomplete = () => { db.close(); resolve(record); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível ler os metadados do Faturamento.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A leitura dos metadados do Faturamento foi cancelada.')); };
  });
}

export async function writeBillingMetaRecord(record) {
  const key = String(record?.key ?? '').trim();
  if (!key || key.length > 180 || !record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('O registro de metadados do Faturamento é inválido.');
  }
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.meta], 'readwrite');
    tx.objectStore(BILLING_STORES.meta).put({ ...record, key });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível salvar os metadados do Faturamento.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A gravação dos metadados do Faturamento foi cancelada.')); };
  });
}

export async function installBillingSeed(seed) {
  if (!seed || seed.schema !== 'billing_seed_v1' || !Number.isInteger(seed.version)) throw new Error('Carga inicial do Faturamento inválida.');
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, 'readwrite');
    const metaStore = tx.objectStore(BILLING_STORES.meta);
    const salesStore = tx.objectStore(BILLING_STORES.sales);
    const movementsStore = tx.objectStore(BILLING_STORES.movements);
    let result = { applied: false, alreadyApplied: false, salesAdded: 0, movementsAdded: 0 };
    const metaRequest = metaStore.get(BILLING_SEED_KEY);
    metaRequest.onsuccess = () => {
      const existing = metaRequest.result;
      if (existing && Number(existing.version) >= seed.version) {
        result = { ...result, alreadyApplied: true };
        return;
      }
      const existingSales = [], existingMovements = [];
      const remaining = seed.sales.length + seed.movements.length;
      if (!remaining) return finishSeed([], []);
      let waiting = remaining;
      const done = () => { waiting -= 1; if (waiting === 0) finishSeed(existingSales, existingMovements); };
      for (const sale of seed.sales) {
        const request = salesStore.get(sale.sale_id);
        request.onsuccess = () => { if (request.result) existingSales.push(sale.sale_id); done(); };
        request.onerror = () => tx.abort();
      }
      for (const movement of seed.movements) {
        const request = movementsStore.get(movement.movement_id);
        request.onsuccess = () => { if (request.result) existingMovements.push(movement.movement_id); done(); };
        request.onerror = () => tx.abort();
      }
      function finishSeed(foundSales, foundMovements) {
        const plan = planSeedImport(seed, { existingSales: foundSales, existingMovements: foundMovements });
        for (const item of plan.sales) salesStore.add(item);
        for (const item of plan.movements) movementsStore.add(item);
        const meta = { key: BILLING_SEED_KEY, version: seed.version, applied_at: new Date().toISOString(), sales_total: seed.sales.length, sales_inserted: plan.sales.length, movements_total: seed.movements.length, movements_inserted: plan.movements.length, source: seed.source };
        metaStore.put(meta);
        result = { applied: true, alreadyApplied: false, salesAdded: plan.sales.length, movementsAdded: plan.movements.length, meta };
      }
    };
    metaRequest.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível instalar a carga histórica do Faturamento.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A carga histórica do Faturamento foi cancelada.')); };
  });
}

function isLegacyBillingSeedMeta(meta) {
  return Number(meta?.version) >= 1 && meta?.source?.type === LEGACY_BILLING_SEED_SOURCE;
}

function scanLegacyBillingSeed({ remove = false } = {}) {
  return openBillingDatabase().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, remove ? 'readwrite' : 'readonly');
    const result = { installed:false, sales:0, movements:0, audit:0 };
    const saleIds = new Set();
    const metaStore = tx.objectStore(BILLING_STORES.meta);
    const metaRequest = metaStore.get(BILLING_SEED_KEY);
    let seedMeta = null;
    const finish = () => {
      if (remove && result.installed && result.sales + result.movements + result.audit > 0) {
        metaStore.put({
          key:BILLING_SEED_KEY,
          version:Number(seedMeta.version),
          applied_at:seedMeta.applied_at || null,
          source:{ type:LEGACY_BILLING_SEED_SOURCE },
          cleaned_at:new Date().toISOString(),
          removed:{ sales:result.sales, movements:result.movements, audit:result.audit },
        });
      }
    };
    const scan = (store, matches, key, onDone) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { onDone(); return; }
        try {
          if (matches(cursor.value)) {
            result[key] += 1;
            if (remove) cursor.delete();
          }
          cursor.continue();
        } catch { tx.abort(); }
      };
      request.onerror = () => tx.abort();
    };
    const scanRelated = () => {
      let pending = 2;
      const oneDone = () => { pending -= 1; if (pending === 0) finish(); };
      scan(tx.objectStore(BILLING_STORES.movements),
        movement => movement.source === LEGACY_BILLING_SEED_SOURCE || saleIds.has(movement.sale_id),
        'movements', oneDone);
      scan(tx.objectStore(BILLING_STORES.audit),
        record => saleIds.has(record.entity_id),
        'audit', oneDone);
    };
    metaRequest.onsuccess = () => {
      seedMeta = metaRequest.result;
      if (!isLegacyBillingSeedMeta(seedMeta)) return;
      result.installed = true;
      scan(tx.objectStore(BILLING_STORES.sales), sale => sale.source === LEGACY_BILLING_SEED_SOURCE, 'sales', () => scanRelated());
    };
    metaRequest.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Não foi possível revisar a carga antiga do Faturamento.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A limpeza da carga antiga do Faturamento foi cancelada.')); };
  }));
}

export function previewLegacyBillingSeedCleanup() {
  return scanLegacyBillingSeed();
}

export function removeLegacyBillingSeed() {
  return scanLegacyBillingSeed({ remove:true });
}

export async function countBillingData() {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, 'readonly');
    const names = Object.entries(BILLING_STORES).map(([key, store]) => [key, tx.objectStore(store).count()]);
    const result = {};
    for (const [key, request] of names) request.onsuccess = () => { result[key] = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function hasBillingData() {
  const counts = await countBillingData();
  return Object.values(counts).some(Number);
}

export async function exportBillingBundle() {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORE_NAMES, 'readonly');
    const result = { schema: 'billing_backup_v1', version: 1, exported_at: new Date().toISOString(), sales: [], movements: [], audit: [], meta: [] };
    for (const [key, storeName] of Object.entries(BILLING_STORES)) {
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => { result[key] = request.result || []; };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function queryByDate(storeName, indexName, start, end) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const range = IDBKeyRange.bound(start, end);
    const request = tx.objectStore(storeName).index(indexName).getAll(range);
    request.onsuccess = () => resolve(request.result || []);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function querySalesByDate(start, end) {
  return queryByDate(BILLING_STORES.sales, 'sale_date', start, end);
}

export async function queryAllSales() {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.sales, 'readonly');
    const request = tx.objectStore(BILLING_STORES.sales).getAll();
    request.onsuccess = () => resolve(request.result || []);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function queryMovementsByDate(start, end) {
  return queryByDate(BILLING_STORES.movements, 'effective_date', start, end);
}

export async function adjacentRecordedMonth(mode, month, direction) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '')) || !['previous', 'next'].includes(direction)) return null;
  const cash = mode === 'cash';
  const storeName = cash ? BILLING_STORES.movements : BILLING_STORES.sales;
  const indexName = cash ? 'effective_date' : 'sale_date';
  const range = direction === 'previous'
    ? IDBKeyRange.upperBound(`${month}-01`, true)
    : IDBKeyRange.lowerBound(`${month}-31`, true);
  const cursorDirection = direction === 'previous' ? 'prev' : 'next';
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).index(indexName).openCursor(range, cursorDirection);
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    request.onsuccess = () => {
      const cursor = request.result;
      finish(resolve, cursor ? String(cursor.key).slice(0, 7) : null);
    };
    request.onerror = () => finish(reject, request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); finish(reject, tx.error); };
  });
}

export async function movementsForSales(saleIds) {
  const ids = [...new Set(saleIds)];
  if (!ids.length) return [];
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.movements, 'readonly');
    const index = tx.objectStore(BILLING_STORES.movements).index('sale_id');
    const result = [];
    let pending = ids.length;
    for (const id of ids) {
      const request = index.getAll(IDBKeyRange.only(id));
      request.onsuccess = () => { result.push(...request.result); pending -= 1; if (!pending) result.sort((a, b) => String(a.effective_date || '').localeCompare(String(b.effective_date || ''))); };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function salesByIds(saleIds) {
  const ids = [...new Set(saleIds)];
  if (!ids.length) return [];
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.sales, 'readonly');
    const store = tx.objectStore(BILLING_STORES.sales);
    const result = [];
    for (const id of ids) {
      const request = store.get(id);
      request.onsuccess = () => { if (request.result) result.push(request.result); };
    }
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listAudit(saleId, { limit = 50 } = {}) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BILLING_STORES.audit, 'readonly');
    const request = tx.objectStore(BILLING_STORES.audit).index('sale_id').getAll(IDBKeyRange.only(saleId));
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, limit));
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function createSale(input) {
  const now = new Date().toISOString();
  const sale = normalizeSale(input, { now });
  const audit = makeAudit('sale_created', 'sale', sale.sale_id, Object.entries(sale).filter(([key]) => !['sale_id', 'created_at', 'updated_at'].includes(key)).map(([field, newValue]) => ({ field, old_value: null, new_value: newValue })), { now });
  const db = await openBillingDatabase();
  return writeSaleTransaction(db, sale, audit, 'add');
}

export async function updateSale(saleId, patch, action = 'sale_updated') {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const sales = tx.objectStore(BILLING_STORES.sales);
    const request = sales.get(saleId);
    let updated = null;
    request.onsuccess = () => {
      const prior = request.result;
      if (!prior) { tx.abort(); return; }
      const now = new Date().toISOString();
      const candidate = normalizeSale({ ...prior, ...patch, sale_id: prior.sale_id, created_at: prior.created_at, updated_at: now }, { now });
      const changes = Object.keys(patch).filter(key => !Object.is(prior[key] ?? null, candidate[key] ?? null)).map(field => ({ field, old_value: prior[field] ?? null, new_value: candidate[field] ?? null }));
      if (!changes.length) return;
      const editableSourceFields = new Set(['sale_date', 'sale_time', 'product', 'platform', 'commission_type', 'account', 'value_brl', 'value_usd', 'notes']);
      const sourceOverrides = new Set(prior.source_overrides || []);
      if (['gurumedia_postback', 'clickbank_ins_v8'].includes(prior.source)) {
        for (const change of changes) if (editableSourceFields.has(change.field)) sourceOverrides.add(change.field);
      }
      updated = normalizeSale({ ...candidate, source_overrides: [...sourceOverrides] }, { now });
      sales.put(updated);
      tx.objectStore(BILLING_STORES.audit).add(makeAudit(action, 'sale', saleId, changes, { now }));
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(updated); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A venda não foi encontrada ou não pôde ser atualizada.')); };
  });
}

export function updateMccConversionValuesToTransaction(tx, saleId, values = {}, options = {}) {
  const patch = {};
  const valueFields = ['value_brl', 'value_usd'].filter(field => Object.hasOwn(values, field));
  for (const field of valueFields) patch[field] = values[field];
  const hasPlatform = Object.hasOwn(options, 'platform');
  if (!valueFields.length && !hasPlatform) {
    throw new Error('Informe o valor corrigido em R$ ou US$.');
  }
  if (hasPlatform && !String(options.platform ?? '').trim()) throw new Error('Informe uma plataforma.');
  const sales = tx.objectStore(BILLING_STORES.sales);
  const request = sales.get(saleId);
  const result = { updated:null, failure:null };
  request.onsuccess = () => {
    const prior = request.result;
    if (!prior || prior.source !== 'mcc_conversion_aggregate') {
      result.failure = new Error('A linha agregada da MCC não foi encontrada para corrigir.');
      tx.abort();
      return;
    }
    if (hasPlatform) {
      const platform = String(options.platform).trim();
      const sourcePlatform = prior.manual_platform_override === true ? prior.mcc_source_platform || prior.platform : prior.platform;
      patch.platform = platform;
      patch.mcc_source_platform = sourcePlatform || null;
      patch.manual_platform_override = platform !== sourcePlatform;
    }
    if (valueFields.length) patch.manual_value_override = true;
    const now = new Date().toISOString();
    try {
      result.updated = normalizeSale({ ...prior, ...patch, sale_id:prior.sale_id, created_at:prior.created_at, updated_at:now }, { now });
      if (valueFields.length && result.updated.value_brl == null && result.updated.value_usd == null) throw new Error('Informe o valor corrigido em R$ ou US$.');
    } catch (error) {
      result.failure = error;
      tx.abort();
      return;
    }
    const changes = Object.keys(patch)
      .filter(field => !Object.is(prior[field] ?? null, result.updated[field] ?? null))
      .map(field => ({ field, old_value:prior[field] ?? null, new_value:result.updated[field] ?? null }));
    if (!changes.length) return;
    sales.put(result.updated);
    const action = valueFields.length
      ? (hasPlatform ? 'mcc_conversion_updated' : 'mcc_conversion_value_corrected')
      : result.updated.manual_platform_override ? 'mcc_platform_overridden' : 'mcc_platform_override_removed';
    tx.objectStore(BILLING_STORES.audit).add(makeAudit(action, 'sale', saleId, changes, { now }));
  };
  request.onerror = () => { result.failure = request.error; tx.abort(); };
  return result;
}

export async function updateMccConversionValues(saleId, values = {}, options = {}) {
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const result = updateMccConversionValuesToTransaction(tx, saleId, values, options);
    tx.oncomplete = () => { db.close(); resolve(result.updated); };
    tx.onerror = () => { db.close(); reject(result.failure || tx.error); };
    tx.onabort = () => { db.close(); reject(result.failure || tx.error || new Error('A correção do valor MCC não pôde ser salva.')); };
  });
}

export async function createMovement(input) {
  const movement = normalizeMovement(input);
  const audit = makeAudit(input.type === 'refund' ? 'refund_created' : 'receipt_created', 'sale', movement.sale_id, [
    { field: 'movement_id', old_value: null, new_value: movement.movement_id },
    { field: 'type', old_value: null, new_value: movement.type },
    { field: 'effective_date', old_value: null, new_value: movement.effective_date },
    { field: 'value_brl', old_value: null, new_value: movement.value_brl },
    { field: 'value_usd', old_value: null, new_value: movement.value_usd },
  ]);
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.movements, BILLING_STORES.audit], 'readwrite');
    const sales = tx.objectStore(BILLING_STORES.sales), movementStore = tx.objectStore(BILLING_STORES.movements), auditStore = tx.objectStore(BILLING_STORES.audit);
    const request = sales.get(movement.sale_id);
    request.onsuccess = () => {
      const sale = request.result;
      if (!sale) { tx.abort(); return; }
      movementStore.add(movement);
      if (movement.type === 'receipt') {
        const receipts = movementStore.index('sale_id').getAll(IDBKeyRange.only(movement.sale_id));
        receipts.onsuccess = () => {
          const receiptRows = receipts.result.filter(row => row.type === 'receipt');
          const knownFields = ['value_brl', 'value_usd'].filter(field => typeof sale[field] === 'number');
          const complete = knownFields.length > 0 && knownFields.every(field => receiptRows.reduce((sum, row) => sum + (typeof row[field] === 'number' ? row[field] : 0), 0) >= sale[field]);
          const hasReceiptValue = receiptRows.some(row => knownFields.some(field => typeof row[field] === 'number' && row[field] > 0));
          const nextStatus = complete ? 'paid' : hasReceiptValue ? 'partially_paid' : sale.payment_status;
          if (nextStatus !== sale.payment_status) {
            sales.put({ ...sale, payment_status: nextStatus, updated_at: new Date().toISOString() });
            auditStore.add(makeAudit('payment_status_changed', 'sale', movement.sale_id, [{ field: 'payment_status', old_value: sale.payment_status, new_value: nextStatus }]));
          }
          auditStore.add(audit);
        };
        receipts.onerror = () => tx.abort();
      } else auditStore.add(audit);
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(movement); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('A venda associada ao movimento não foi encontrada.')); };
  });
}

export function cancelSaleToTransaction(transaction, saleId, reason, { now = new Date().toISOString() } = {}) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('Informe o motivo do cancelamento.');
  const sales = transaction.objectStore(BILLING_STORES.sales);
  const audit = transaction.objectStore(BILLING_STORES.audit);
  const result = { updated:null, failure:null };
  const request = sales.get(saleId);
  request.onsuccess = () => {
    const prior = request.result;
    if (!prior) {
      result.failure = new Error('A venda não foi encontrada para cancelar.');
      transaction.abort();
      return;
    }
    if (prior.active === false || prior.cancelled_at) {
      result.updated = prior;
      return;
    }
    const finishCancellation = (saleBeforeCancel, aggregate = null) => {
      try {
        result.updated = normalizeSale({ ...saleBeforeCancel, active:false, cancelled_at:now, cancellation_reason:why,
          mcc_match_aggregate_id:null, mcc_match_confirmed_at:null, updated_at:now }, { now });
      } catch (error) {
        result.failure = error;
        transaction.abort();
        return;
      }
      const changes = ['active','cancelled_at','cancellation_reason','mcc_match_aggregate_id','mcc_match_confirmed_at']
        .filter(field => !Object.is(prior[field] ?? null, result.updated[field] ?? null))
        .map(field => ({ field, old_value:prior[field] ?? null, new_value:result.updated[field] ?? null }));
      if (!changes.length) return;
      if (aggregate) {
        const restored = removeGuruMediaCoverageFromAggregate(aggregate, saleId, now);
        if (!restored) {
          result.failure = new Error('O agregado vinculado não foi encontrado; a venda não foi cancelada.');
          transaction.abort();
          return;
        }
        sales.put(restored);
        audit.add(makeAudit('mcc_aggregate_restored_after_gurumedia_cancel', 'sale', aggregate.sale_id,
          Object.keys(restored).filter(field => !['sale_id','created_at','updated_at'].includes(field)
            && !Object.is(aggregate[field] ?? null, restored[field] ?? null))
            .map(field => ({ field, old_value:aggregate[field] ?? null, new_value:restored[field] ?? null })), { now }));
      }
      sales.put(result.updated);
      audit.add(makeAudit('sale_cancelled', 'sale', saleId, changes, { now }));
    };
    if (prior.source === 'gurumedia_postback' && prior.mcc_match_aggregate_id) {
      const aggregateRequest = sales.get(String(prior.mcc_match_aggregate_id));
      aggregateRequest.onsuccess = () => {
        if (!aggregateRequest.result) {
          result.failure = new Error('O agregado MCC vinculado não foi encontrado; a venda não foi cancelada.');
          transaction.abort();
          return;
        }
        finishCancellation(prior, aggregateRequest.result);
      };
      aggregateRequest.onerror = () => { result.failure = aggregateRequest.error; transaction.abort(); };
    } else finishCancellation(prior);
  };
  request.onerror = () => { result.failure = request.error; transaction.abort(); };
  return result;
}

export async function cancelSale(saleId, reason, options = {}) {
  const why = String(reason || '').trim();
  if (!why) throw new Error('Informe o motivo do cancelamento.');
  const db = await openBillingDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    const result = cancelSaleToTransaction(tx, saleId, why, options);
    tx.oncomplete = () => { db.close(); resolve(result.updated); };
    tx.onerror = () => { db.close(); reject(result.failure || tx.error); };
    tx.onabort = () => { db.close(); reject(result.failure || tx.error || new Error('A venda não foi encontrada ou não pôde ser cancelada.')); };
  });
}

function writeSaleTransaction(db, sale, audit, mode) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([BILLING_STORES.sales, BILLING_STORES.audit], 'readwrite');
    tx.objectStore(BILLING_STORES.sales)[mode](sale);
    tx.objectStore(BILLING_STORES.audit).add(audit);
    tx.oncomplete = () => { db.close(); resolve(sale); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Não foi possível salvar a venda.')); };
  });
}

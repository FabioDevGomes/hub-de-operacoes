const DATABASE_NAME = 'hub-google-ads-geographic-reports';
const DATABASE_VERSION = 1;
const STORE_NAME = 'reports';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
let databasePromise = null;

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('O armazenamento local de localizações não está disponível neste navegador.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'recordKey' });
      if (!store.indexNames.contains('account_date')) store.createIndex('account_date', 'accountDateKey', { unique: true });
      if (!store.indexNames.contains('date')) store.createIndex('date', 'date', { unique: false });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(new Error('Não foi possível abrir o armazenamento local de localizações.'));
    request.onblocked = () => reject(new Error('Feche outras abas antigas do Hub para abrir o armazenamento de localizações.'));
  }).catch(error => { databasePromise = null; throw error; });
  return databasePromise;
}

function accountKey(managerCustomerId, customerId) {
  return `${managerCustomerId || 'direct'}|${customerId}`;
}

function recordKey(managerCustomerId, customerId, date) {
  return `${accountKey(managerCustomerId, customerId)}|${date}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(row => {
    const date = String(row?.date || '');
    const campaignId = String(row?.campaignId ?? row?.campaign_id ?? '');
    const countryCriterionId = String(row?.countryCriterionId ?? row?.country_criterion_id ?? '');
    const countryCode = String(row?.countryCode ?? row?.country_code ?? '').toUpperCase();
    const clicks = Number(row?.clicks);
    const impressions = Number(row?.impressions);
    const costMicros = Number(row?.costMicros ?? row?.cost_micros);
    const campaignName = String(row?.campaignName ?? row?.campaign_name ?? '').trim();
    const countryName = String(row?.countryName ?? row?.country_name ?? '').trim();
    if (!DATE_PATTERN.test(date) || !/^\d{1,20}$/.test(campaignId) || !/^\d{1,20}$/.test(countryCriterionId)
        || !COUNTRY_PATTERN.test(countryCode) || !campaignName || !countryName
        || !Number.isSafeInteger(clicks) || clicks < 1 || !Number.isSafeInteger(impressions) || impressions < 0
        || !Number.isSafeInteger(costMicros) || costMicros < 0) return [];
    return [{ date, campaignId, campaignName, countryCriterionId, countryCode, countryName, clicks, impressions, costMicros }];
  });
}

function notifyUpdated() {
  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('google-ads-geographic-reports-updated'));
  }
}

function putAttempt({ managerCustomerId = null, customerId, accountName = '', managerName = '', timeZone = '', currencyCode = '', dateFrom, dateTo, rowsByDate = new Map(), completedAtUtc, status, errorCode = '' }) {
  if (!/^\d{10}$/.test(String(customerId || '')) || (managerCustomerId != null && !/^\d{10}$/.test(String(managerCustomerId)))
      || !DATE_PATTERN.test(String(dateFrom || '')) || !DATE_PATTERN.test(String(dateTo || '')) || dateFrom > dateTo
      || !Number.isFinite(Date.parse(completedAtUtc || ''))) {
    return Promise.reject(new Error('O registro de localização não passou na validação de conta, período e horário.'));
  }
  const manager = managerCustomerId == null ? null : String(managerCustomerId);
  const customer = String(customerId);
  const key = accountKey(manager, customer);
  const dbPromise = openDatabase();
  return dbPromise.then(database => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(`${key}|${dateFrom}`, `${key}|${dateTo}`);
    const request = store.index('account_date').getAll(range);
    let failure = null;
    request.onsuccess = () => {
      try {
        const previousByDate = new Map(request.result.map(record => [record.date, record]));
        const count = Math.round((Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) / 86400000);
        for (let offset = 0; offset <= count; offset += 1) {
          const date = addDays(dateFrom, offset);
          const previous = previousByDate.get(date) || {};
          const newRows = status === 'complete' ? normalizeRows(rowsByDate.get(date) || []) : [];
          const hasNewRows = newRows.length > 0;
          const record = {
            ...previous,
            schemaVersion: 1,
            recordKey: recordKey(manager, customer, date),
            accountDateKey: `${key}|${date}`,
            accountKey: key,
            managerCustomerId: manager,
            customerId: customer,
            accountName: String(accountName || previous.accountName || `Conta ${customer.slice(-4)}`).slice(0, 300),
            managerName: String(managerName || previous.managerName || '').slice(0, 300),
            timeZone: String(timeZone || previous.timeZone || '').slice(0, 100),
            currencyCode: /^[A-Z]{3}$/.test(String(currencyCode || '')) ? String(currencyCode) : String(previous.currencyCode || ''),
            date,
            lastAttemptAtUtc: new Date(completedAtUtc).toISOString(),
            lastAttemptStatus: status === 'complete' ? (hasNewRows ? 'complete_with_rows' : 'complete_no_rows') : 'failed',
            lastErrorCode: status === 'complete' ? '' : String(errorCode || 'unclassified').replace(/[^a-z0-9_]/gi, '').slice(0, 80),
            ...(hasNewRows ? { rows: newRows, lastDataAtUtc: new Date(completedAtUtc).toISOString() } : { rows: Array.isArray(previous.rows) ? previous.rows : [] }),
          };
          if (status === 'complete') record.lastQueryCompleteAtUtc = new Date(completedAtUtc).toISOString();
          else if (previous.lastQueryCompleteAtUtc) record.lastQueryCompleteAtUtc = previous.lastQueryCompleteAtUtc;
          store.put(record);
        }
      } catch (error) {
        failure = error;
        try { transaction.abort(); } catch {}
      }
    };
    request.onerror = () => { failure = request.error; try { transaction.abort(); } catch {} };
    transaction.oncomplete = () => { notifyUpdated(); resolve(true); };
    transaction.onerror = () => reject(failure || new Error('Não foi possível gravar as localizações consultadas.'));
    transaction.onabort = () => reject(failure || new Error('O salvamento das localizações foi cancelado.'));
  }));
}

export function saveGoogleAdsGeographicReportAttempt(report, { account = {}, completedAtUtc = new Date().toISOString() } = {}) {
  const rowsByDate = new Map();
  for (const row of report.rows || []) {
    const rows = rowsByDate.get(row.date) || [];
    rows.push(row);
    rowsByDate.set(row.date, rows);
  }
  return putAttempt({
    managerCustomerId: report.managerCustomerId,
    customerId: report.customerId,
    accountName: account.name || '',
    managerName: account.managerName || '',
    timeZone: account.timeZone || '',
    currencyCode: account.currencyCode || '',
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    rowsByDate,
    completedAtUtc,
    status: 'complete',
  });
}

export function saveGoogleAdsGeographicFailure({ account, dateFrom, dateTo, failedAtUtc = new Date().toISOString(), errorCode = 'unclassified' } = {}) {
  return putAttempt({
    managerCustomerId: account?.managerCustomerId ?? null,
    customerId: String(account?.customerId ?? ''),
    accountName: account?.name || '',
    managerName: account?.managerName || '',
    timeZone: account?.timeZone || '',
    currencyCode: account?.currencyCode || '',
    dateFrom,
    dateTo,
    completedAtUtc: failedAtUtc,
    status: 'failed',
    errorCode,
  });
}

export async function listGoogleAdsGeographicReports({ dateFrom = '', dateTo = '', managerCustomerId = null, customerId = null } = {}) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const range = dateFrom && dateTo && globalThis.IDBKeyRange?.bound
      ? globalThis.IDBKeyRange.bound(dateFrom, dateTo)
      : null;
    const request = range ? store.index('date').getAll(range) : store.getAll();
    request.onsuccess = () => {
      const rows = request.result.filter(record => (!dateFrom || record.date >= dateFrom)
        && (!dateTo || record.date <= dateTo)
        && (managerCustomerId == null || record.managerCustomerId === String(managerCustomerId))
        && (customerId == null || record.customerId === String(customerId)));
      rows.sort((left, right) => String(right.date).localeCompare(String(left.date))
        || String(left.accountName).localeCompare(String(right.accountName), 'pt-BR')
        || String(left.customerId).localeCompare(String(right.customerId)));
      resolve(rows);
    };
    request.onerror = () => reject(new Error('Não foi possível ler os relatórios geográficos locais.'));
  });
}

export async function exportGoogleAdsGeographicReports() {
  return listGoogleAdsGeographicReports();
}

function validateBackupRecord(record) {
  const managerCustomerId = record?.managerCustomerId == null ? null : String(record.managerCustomerId);
  const customerId = String(record?.customerId ?? '');
  const date = String(record?.date ?? '');
  const status = String(record?.lastAttemptStatus ?? '');
  if (!/^\d{10}$/.test(customerId) || (managerCustomerId != null && !/^\d{10}$/.test(managerCustomerId))
      || !DATE_PATTERN.test(date) || !['complete_with_rows', 'complete_no_rows', 'failed'].includes(status)
      || !Number.isFinite(Date.parse(record?.lastAttemptAtUtc || ''))) return null;
  const rows = normalizeRows(record.rows);
  if (rows.some(row => row.date !== date)) return null;
  const key = accountKey(managerCustomerId, customerId);
  return {
    schemaVersion: 1,
    recordKey: recordKey(managerCustomerId, customerId, date),
    accountDateKey: `${key}|${date}`,
    accountKey: key,
    managerCustomerId,
    customerId,
    accountName: String(record.accountName || `Conta ${customerId.slice(-4)}`).slice(0, 300),
    managerName: String(record.managerName || '').slice(0, 300),
    timeZone: String(record.timeZone || '').slice(0, 100),
    currencyCode: /^[A-Z]{3}$/.test(String(record.currencyCode || '')) ? String(record.currencyCode) : '',
    date,
    lastAttemptAtUtc: new Date(record.lastAttemptAtUtc).toISOString(),
    lastAttemptStatus: status,
    lastErrorCode: String(record.lastErrorCode || '').replace(/[^a-z0-9_]/gi, '').slice(0, 80),
    lastQueryCompleteAtUtc: Number.isFinite(Date.parse(record.lastQueryCompleteAtUtc || '')) ? new Date(record.lastQueryCompleteAtUtc).toISOString() : null,
    lastDataAtUtc: Number.isFinite(Date.parse(record.lastDataAtUtc || '')) ? new Date(record.lastDataAtUtc).toISOString() : null,
    rows,
  };
}

export function validateGoogleAdsGeographicReportsBackup(value) {
  if (!Array.isArray(value) || value.length > 250000) throw new Error('A lista de relatórios geográficos do backup é inválida ou excede o limite seguro.');
  const records = value.map(validateBackupRecord);
  if (records.some(record => !record)) throw new Error('Um registro geográfico do backup está inválido; os dados atuais foram preservados.');
  return records;
}

export async function importGoogleAdsGeographicReports(records) {
  const incoming = validateGoogleAdsGeographicReportsBackup(records);
  if (!incoming.length) return { imported: 0 };
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    let imported = 0;
    let failure = null;
    request.onsuccess = () => {
      try {
        const existingByKey = new Map(request.result.map(record => [record.recordKey, record]));
        for (const record of incoming) {
          const existing = existingByKey.get(record.recordKey);
          if (existing && Date.parse(existing.lastAttemptAtUtc || '') > Date.parse(record.lastAttemptAtUtc)) continue;
          const preserveRows = record.rows.length === 0 && Array.isArray(existing?.rows) && existing.rows.length > 0;
          store.put(preserveRows ? { ...record, rows: existing.rows, lastDataAtUtc: existing.lastDataAtUtc || record.lastDataAtUtc } : record);
          imported += 1;
        }
      } catch (error) {
        failure = error;
        try { transaction.abort(); } catch {}
      }
    };
    request.onerror = () => { failure = request.error; try { transaction.abort(); } catch {} };
    transaction.oncomplete = () => { notifyUpdated(); resolve({ imported }); };
    transaction.onerror = () => reject(failure || new Error('Não foi possível restaurar os relatórios geográficos do backup.'));
    transaction.onabort = () => reject(failure || new Error('A restauração dos relatórios geográficos foi cancelada.'));
  });
}


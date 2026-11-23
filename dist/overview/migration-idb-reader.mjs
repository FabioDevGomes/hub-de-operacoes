// This reader never creates a database or starts a write transaction.
export async function readMigrationDatabase(factory, name, expectedStores) {
  if (typeof factory?.databases !== 'function') return { status: 'nao_verificado', reason: 'O navegador não informa quais bancos existem.' };
  let available;
  try { available = await factory.databases(); }
  catch { return { status: 'nao_verificado', reason: 'Não foi possível enumerar os bancos locais.' }; }
  if (!available.some(item => item.name === name)) return { status: 'ausente' };
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const request = factory.open(name);
      let blocked = false;
      request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('O banco deixou de existir durante a leitura.')); };
      request.onerror = () => reject(request.error || new Error('Falha ao abrir banco.'));
      request.onblocked = () => { blocked = true; reject(new Error('A abertura do banco está bloqueada.')); };
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    });
    const existing = expectedStores.filter(store => db.objectStoreNames.contains(store));
    const missing = expectedStores.filter(store => !db.objectStoreNames.contains(store));
    const stores = {};
    if (existing.length) await new Promise((resolve, reject) => {
      const tx = db.transaction(existing, 'readonly');
      for (const name of existing) {
        const store = tx.objectStore(name), keys = store.getAllKeys(), values = store.getAll();
        const indexes = Array.from(store.indexNames, indexName => {
          const index = store.index(indexName);
          return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
        });
        stores[name] = { keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes, records: [] };
        tx.addEventListener('complete', () => {
          stores[name].records = keys.result.map((key, index) => ({ key, value: values.result[index] }));
        });
      }
      tx.addEventListener('complete', resolve);
      tx.addEventListener('abort', () => reject(tx.error || new Error('Leitura cancelada.')));
      tx.addEventListener('error', () => reject(tx.error || new Error('Falha na leitura.')));
    });
    return { status: missing.length ? 'parcial' : 'presente', version: db.version, stores, missing };
  } catch (error) { return { status: 'erro', reason: error?.message || 'Erro de leitura.' }; }
  finally { db?.close(); }
}

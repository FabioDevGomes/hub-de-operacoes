export async function persistControlMacroApiSync(sync, {
  openDatabase = globalThis.HubDatabase?.openDatabase,
  database = globalThis.CampaignDatabase,
} = {}) {
  if (typeof openDatabase !== 'function' || !database?.normalize) throw new Error('O armazenamento local do Hub não está disponível.');
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let updated = null;
      let failure = null;
      const tx = db.transaction(['bases'], 'readwrite');
      const store = tx.objectStore('bases');
      const request = store.get('atual');
      request.onsuccess = () => {
        try {
          if (request.result?.schema !== database.SCHEMA) throw new Error('A base local não foi encontrada ou está em formato inválido.');
          const base = database.normalize(request.result);
          const previous = Array.isArray(base.control_macro_api_syncs) ? base.control_macro_api_syncs : [];
          updated = {
            ...base,
            control_macro_api_syncs: [...previous, structuredClone(sync)],
            atualizado_em: sync.syncedAt,
          };
          store.put(updated, 'atual');
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      request.onerror = () => { failure = request.error; };
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(failure || tx.error || new Error('Não foi possível salvar a captura do Controle Macro.'));
      tx.onabort = () => reject(failure || tx.error || new Error('A gravação da captura foi cancelada.'));
    });
  } finally {
    db.close();
  }
}

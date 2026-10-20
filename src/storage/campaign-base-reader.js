/* Read the operational snapshot without changing its schema or writing data. */
(function (root) {
  'use strict';
  async function read({openDatabase, includeCatalog = false}) {
    const db = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const stores = includeCatalog ? ['bases', 'catalogos'] : ['bases'];
        const tx = db.transaction(stores, 'readonly');
        const snapshot = {base:null, catalog:null};
        const base = tx.objectStore('bases').get('atual');
        base.onsuccess = () => { snapshot.base = base.result || null; };
        if (includeCatalog) {
          const catalog = tx.objectStore('catalogos').get('atual');
          catalog.onsuccess = () => { snapshot.catalog = catalog.result || null; };
        }
        // Requests succeeding individually do not prove the transaction completed.
        tx.oncomplete = () => resolve(snapshot);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Leitura da base local interrompida.'));
      });
    } finally {
      db.close();
    }
  }
  const api = Object.freeze({read});
  root.CampaignBaseReader = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);

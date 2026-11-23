// Inspeção de base preparada em leitura; não inicia servidor nem ativa as telas.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createExperimentalRepository} from './repositorio-entrega-experimental.mjs';
import {createReconstructedReader} from './leitor-pacote-reconstruido-experimental.mjs';
import {createExperimentalService} from './servico-entrega-experimental.mjs';
import {createExperimentalIndexedStore} from './indexeddb-central-experimental.mjs';
import {createExperimentalLocalStorage} from './armazenamento-local-central-experimental.mjs';
import {createCentralTransaction} from './transacao-central-experimental.mjs';
import {createRealProgressQuery} from './progresso-central-fontes-reais.mjs';

export function inspectPreparedDatabase(path) {
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Integridade inválida');
    const marker=db.prepare('SELECT value FROM lab_marker').all();
    if(marker.length!==1 || marker[0].value!=='hub-central-lab-v1')throw Error('Marcador inválido');
    const rows=db.prepare('SELECT id,version,value FROM state').all();
    const original=db.prepare('SELECT value FROM local_storage WHERE key=?').get('hub:campaign-delivery:records:v1');
    if(rows.length!==1 || rows[0].id!==1 || !Number.isSafeInteger(rows[0].version) || rows[0].version<1 || !original || original.value!==rows[0].value)throw Error('Entregas divergentes');
    const deliveries=JSON.parse(rows[0].value);
    if(!Array.isArray(deliveries) || deliveries.some(r=>!r || typeof r.id!=='string' || !r.id) || new Set(deliveries.map(r=>r.id)).size!==deliveries.length)throw Error('Entregas inválidas');
    const digest=data=>createHash('sha256').update(data).digest('hex');
    let entries=0,binaries=0;
    for(const row of db.prepare('SELECT size,sha256,data FROM package_entries').iterate()) {if(row.data.length!==row.size || digest(row.data)!==row.sha256)throw Error('Entrada divergente');entries++;}
    for(const row of db.prepare('SELECT size,sha256,data FROM binaries').iterate()) {if(row.data.length!==row.size || digest(row.data)!==row.sha256)throw Error('Binário divergente');binaries++;}
    const sources=db.prepare('SELECT source,status FROM source_info').all();
    return {revision:rows[0].version,deliveries:deliveries.length,entries,binaries,records:db.prepare('SELECT count(*) AS n FROM records').get().n,stores:db.prepare('SELECT count(*) AS n FROM stores').get().n,localKeys:db.prepare('SELECT count(*) AS n FROM local_storage').get().n,sources};
  } finally {db.close()}
}

export function openPreparedReadOnlyService(path,origin='http://127.0.0.1:18781') {
  const report=inspectPreparedDatabase(path);
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    db.exec('PRAGMA query_only=ON');
    const repo=createExperimentalRepository({database:db,initialize:false});
    const local=createExperimentalLocalStorage(db),indexed=createExperimentalIndexedStore(db);
    const service=createExperimentalService({origin,repository:repo,queryProgress:createRealProgressQuery(db),reconstructedReader:createReconstructedReader(db),centralLocalStorage:local,centralIndexedStore:indexed,centralTransaction:createCentralTransaction(db,{local,indexed}),readOnly:true});
    return {report,service,close(){repo.close()}};
  } catch(error){db.close();throw error}
}

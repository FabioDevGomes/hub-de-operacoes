// Leitor de laboratório; recebe uma conexão aberta em modo somente leitura.
export function createReconstructedReader(db) {
  if (!db || typeof db.prepare!=='function') throw Error('Base indisponível');
  const hasVisibility=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='indexed_visibility'").get();
  const activePredicate=hasVisibility?' AND COALESCE((SELECT visible FROM indexed_visibility v WHERE v.source=records.source AND v.store=records.store AND v.ordinal=records.ordinal ORDER BY revision DESC LIMIT 1),1)=1':'';
  function sources() {
    return db.prepare('SELECT source,status,version_json,missing_json FROM source_info ORDER BY source').all().map(row=>({source:row.source,status:row.status,version:JSON.parse(row.version_json),missing:JSON.parse(row.missing_json)}));
  }
  function readStore(source,store) {
    if (typeof source!=='string' || typeof store!=='string' || !source || !store) throw Error('Fonte inválida');
    const meta=db.prepare('SELECT status FROM source_info WHERE source=?').get(source);
    if (!meta || meta.status!=='presente') throw Error('Fonte ausente ou incompleta');
    const info=db.prepare('SELECT keypath_json,auto_increment FROM stores WHERE source=? AND store=?').get(source,store);
    if (!info) throw Error('Store ausente');
    const count=db.prepare('SELECT count(*) AS count FROM records WHERE source=? AND store=?'+activePredicate).get(source,store).count;
    return {source,store,keyPath:JSON.parse(info.keypath_json),autoIncrement:!!info.auto_increment,count};
  }
  function record(source,store,ordinal) {
    readStore(source,store);
    if (!Number.isSafeInteger(ordinal) || ordinal<0) throw Error('Índice inválido');
    const row=db.prepare('SELECT key_json,value_json FROM records WHERE source=? AND store=? AND ordinal=?'+activePredicate).get(source,store,ordinal);
    if (!row) return null;
    return {key:JSON.parse(row.key_json),value:JSON.parse(row.value_json)};
  }
  return {sources,readStore,record};
}

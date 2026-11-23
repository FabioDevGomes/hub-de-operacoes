// Cópia consistente SQLite para arquivo novo; nunca substitui banco existente.
import {DatabaseSync, backup} from 'node:sqlite';
import {closeSync, lstatSync, openSync, realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPreparedDatabase} from './servico-base-preparada-leitura.mjs';

export async function copyCentralDatabase(source, destination) {
  const src=resolve(source), dst=resolve(destination);
  if(src===dst) throw Error('Origem e destino devem ser diferentes');
  const stat=lstatSync(src);
  if(!stat.isFile()||stat.isSymbolicLink()||realpathSync(src)!==src) throw Error('Origem inválida');
  inspectPreparedDatabase(src);
  const db=new DatabaseSync(src,{readOnly:true});
  try {
    const marker=db.prepare('SELECT value FROM central_activation_marker').all();
    if(marker.length!==1||marker[0].value!=='hub-central-write-v1') throw Error('Base central não reconhecida');
    closeSync(openSync(dst,'wx'));
    await backup(db,dst);
  } finally {db.close()}
  inspectPreparedDatabase(dst);
  const restored=new DatabaseSync(dst,{readOnly:true});
  try {
    const result=restored.prepare('PRAGMA integrity_check').get();
    const marker=restored.prepare('SELECT value FROM central_activation_marker').all();
    if(result.integrity_check!=='ok'||marker.length!==1||marker[0].value!=='hub-central-write-v1') throw Error('Cópia inválida');
  } finally {restored.close()}
  return dst;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [, ,source,destination]=process.argv;
  if(!source||!destination){console.error('Informe origem e destino novos.');process.exitCode=1}
  else try {await copyCentralDatabase(source,destination);console.log('Cópia verificada criada.')} catch(error){console.error('Cópia não concluída:',error.message);process.exitCode=1}
}

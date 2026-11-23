import {test} from 'node:test';
import {deepStrictEqual} from 'node:assert';
import {readAllowedStorage} from '../src/overview/migration-export.mjs';

test('exporta dados de reenvio e diagnósticos sem incluir credenciais por prefixo', () => {
  const values={
    'hub:google-ads:auto-pause-server-evaluation-inputs:v1':'snapshot',
    'hub:auto-pause-diagnostics:events:v1:aba-exemplo':'eventos',
    'hub:campaign-base-cache-marker:v1':'marcador',
    'hub:system-version:accepted-notice:v1':'aviso',
    'hub:system-version:confirmed-update:v1':'versão',
    'hub:tracking:api-token:v1':'segredo'
  };
  const names=Object.keys(values),storage={length:names.length,key:i=>names[i],getItem:k=>values[k]};
  const result=readAllowedStorage(storage);
  delete values['hub:tracking:api-token:v1'];
  deepStrictEqual(result,values);
});

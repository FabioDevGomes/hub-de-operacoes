import test from 'node:test';
import assert from 'node:assert/strict';
import {readClipboardText} from '../src/curadoria/glimpse/clipboard.mjs';

test('leitor retorna o texto completo da área de transferência sem alterar o conteúdo',async()=>{
  const raw='Produto\n8K searches past month\nRelated Queries';
  assert.equal(await readClipboardText({readText:async()=>raw}),raw);
});

test('leitor identifica clipboard vazio e API indisponível para informar o erro de captura',async()=>{
  await assert.rejects(readClipboardText({readText:async()=>''}),error=>error.code==='clipboard-empty');
  await assert.rejects(readClipboardText({}),error=>error.code==='clipboard-unavailable');
});

test('leitor propaga bloqueio de permissão sem capturar nem registrar o texto',async()=>{
  const denied=Object.assign(new Error('Permission denied'),{name:'NotAllowedError'});
  await assert.rejects(readClipboardText({readText:async()=>{throw denied}}),error=>error===denied);
});

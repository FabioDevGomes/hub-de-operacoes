import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const extension = new URL('extensions/mcc-d0-bridge/', root);
const [manifestText, popup, script] = await Promise.all([
  readFile(new URL('manifest.json', extension), 'utf8'),
  readFile(new URL('popup.html', extension), 'utf8'),
  readFile(new URL('popup.js', extension), 'utf8')
]);
const manifest = JSON.parse(manifestText);

assert.equal(manifest.version, '1.2.2', 'a atualização remove opções e incrementa o patch da extensão');
assert.match(manifest.description, /Captura a grade da MCC/);
assert.ok(popup.includes('id="capture-d0"') && popup.includes('id="capture-d1"'), 'capturas diretas D0/D−1 permanecem disponíveis');
for (const removedId of [
  'send-form','csv-file','send-button','read-grid','read-text','compare-csv','compare-button','experiment-status','experiment-result'
]) assert.ok(!popup.includes(`id="${removedId}"`), `popup não deve mais exibir ${removedId}`);
assert.doesNotMatch(popup, /Fallback · CSV manual|Experimento local|Testar leitura da MCC|Testar captura por texto|Comparar prévia com CSV/);
assert.doesNotMatch(script, /createCsvTransferPayload|READ_ACTIVE_MCC_GRID|READ_ACTIVE_MCC_TEXT|FORWARD_D0_CSV|compareMcc/i,
  'o popup mantém somente as ações diretas de captura');
assert.ok(script.includes("type: 'CAPTURE_AND_FORWARD_MCC_D0'") && script.includes("type: 'CAPTURE_AND_FORWARD_MCC_D1'"));

console.log('MCC extension popup: only direct D0/D−1 capture; retired options removed; version 1.2.2');

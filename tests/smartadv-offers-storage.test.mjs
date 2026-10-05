import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as Storage from '../src/curadoria/smartadv-offers/smartadv-offers-storage.mjs';

assert.equal(Storage.DB_NAME, 'radar-smartadv-offers');
assert.equal(Storage.DB_VERSION, 3);
assert.deepEqual(Object.values(Storage.STORES), ['captures','trends','images','decisions']);
assert.equal(Storage.BACKUP_FORMAT, 'radar-smartadv-offers-backup-v3');
assert.equal(Storage.LEGACY_BACKUP_V2_FORMAT, 'radar-smartadv-offers-backup-v2');
const source = await readFile(new URL('../src/curadoria/smartadv-offers/smartadv-offers-storage.mjs', import.meta.url), 'utf8');
assert.match(source, /createObjectStore\(STORES\.captures,\s*\{keyPath:\s*'captureId'\}\)/);
assert.match(source, /if \(!db\.objectStoreNames\.contains\(STORES\.trends\)\) db\.createObjectStore\(STORES\.trends,\s*\{keyPath:\s*'offerKey'\}\)/, 'a migração preserva capturas e adiciona histórico independente de Trends');
assert.match(source, /if \(!db\.objectStoreNames\.contains\(STORES\.images\)\) db\.createObjectStore\(STORES\.images,\s*\{keyPath:\s*'offerKey'\}\)/, 'a migração adiciona registros de Imagens sem apagar o banco local existente');
assert.match(source, /if \(!db\.objectStoreNames\.contains\(STORES\.decisions\)\) db\.createObjectStore\(STORES\.decisions,\s*\{keyPath:\s*'offerKey'\}\)/, 'a migração adiciona decisões sem apagar as stores existentes');
assert.match(source, /tx\.objectStore\(STORES\.captures\)\.add\(capture\)/, 'capturas são acrescentadas sem substituir as anteriores');
assert.match(source, /trends, images/);
assert.match(source, /export async function exportBackup\(\)/);
assert.match(source, /export async function mergeBackup\(payload\)/);
assert.match(source, /LEGACY_BACKUP_FORMAT = 'radar-smartadv-offers-backup-v1'/, 'backups anteriores seguem importáveis');
assert.match(source, /LEGACY_BACKUP_V2_FORMAT = 'radar-smartadv-offers-backup-v2'/, 'backups v2 sem decisões continuam importáveis');
assert.match(source, /export async function putDecision\(record\)/, 'as decisões ficam na store isolada desta tela');
assert.match(source, /mergeAssessmentList\(existing\.assessments, incoming\.assessments\)/, 'restauração combina histórico analítico em vez de apagá-lo');
assert.match(source, /export async function seedInitialCaptureIfEmpty\(capture\)/);
assert.match(source, /if \(count\.result === 0\)/, 'a captura inicial só é adicionada quando não há histórico salvo');
assert.match(source, /result\.conflicts\+\+/);
assert.doesNotMatch(source, /\.clear\(|\.delete\(|tx\.objectStore\(STORES\.captures\)\.put\(/, 'a restauração não apaga nem sobrescreve capturas existentes');
assert.doesNotMatch(source, /indexedDB\.open\(['"]radar-(?:clickbank-top-offers|hot-offers-ms|top-performance)/, 'SmartAdv possui armazenamento isolado');

console.log('smartadv offers storage ok');

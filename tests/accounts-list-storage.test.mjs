import assert from 'node:assert/strict';
import test from 'node:test';
import {ACCOUNT_DIRECTORY_EMAIL_KEY, ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY, ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY, ACCOUNT_DIRECTORY_STATUS_KEY, createAccountDirectoryEmailStorage, createAccountDirectoryManualAccountsStorage, createAccountDirectoryPaymentProfileStorage, createAccountDirectoryStatusStorage} from '../src/accounts/accounts-list-storage.mjs';

function memoryStorage(initial = null) {
  const values = new Map(initial == null ? [] : [[ACCOUNT_DIRECTORY_STATUS_KEY, initial]]);
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

test('account status is read without writing and explicit selections persist independently by account', () => {
  const storage = memoryStorage();
  const statuses = createAccountDirectoryStatusStorage(storage);
  assert.deepEqual(Object.keys(statuses.read()), []);
  assert.equal(storage.values.size, 0);

  statuses.save('111-222-3333', 'active');
  statuses.save('444-555-6666', 'suspended');
  assert.deepEqual({...statuses.read()}, {
    '111-222-3333':'active',
    '444-555-6666':'suspended'
  });
  assert.equal(storage.values.size, 1);
  assert.equal(ACCOUNT_DIRECTORY_STATUS_KEY, 'hub:account-directory:manual-status:v1');
});

test('account status rejects invalid states and does not overwrite malformed local data', () => {
  const malformed = memoryStorage('{invalid json');
  const statuses = createAccountDirectoryStatusStorage(malformed);
  assert.deepEqual(Object.keys(statuses.read()), []);
  assert.throws(() => statuses.save('111-222-3333', 'paused'), /Selecione Ativa ou Suspensa/);
  assert.throws(() => statuses.save('111-222-3333', 'active'), /não pôde ser lido e não foi substituído/);
  assert.equal(malformed.getItem(ACCOUNT_DIRECTORY_STATUS_KEY), '{invalid json');
});

test('account status reports browser storage failures without claiming a save', () => {
  const unavailable = createAccountDirectoryStatusStorage(null);
  assert.deepEqual(Object.keys(unavailable.read()), []);
  assert.throws(() => unavailable.save('111-222-3333', 'suspended'), /armazenamento local não está disponível/);

  const denied = {
    getItem() { return null; },
    setItem() { throw new Error('quota'); }
  };
  assert.throws(() => createAccountDirectoryStatusStorage(denied).save('111-222-3333', 'active'), /Não foi possível salvar o status/);
});

test('account e-mails are manual, persistent per account and stored separately from status', () => {
  const storage = memoryStorage();
  const emails = createAccountDirectoryEmailStorage(storage);
  assert.deepEqual({...emails.read()}, {});
  assert.equal(storage.values.size, 0, 'ler e-mails vazios não grava valores');

  createAccountDirectoryStatusStorage(storage).save('111-222-3333', 'active');
  emails.save('111-222-3333', 'owner+ads@example.com');
  emails.save('444-555-6666', '  ops@example.org  ');
  assert.deepEqual({...emails.read()}, {
    '111-222-3333':'owner+ads@example.com',
    '444-555-6666':'ops@example.org'
  });
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_STATUS_KEY))['111-222-3333'],'active');
  assert.equal(ACCOUNT_DIRECTORY_EMAIL_KEY,'hub:account-directory:manual-email:v1');
});

test('account e-mail validation and failed writes preserve saved local data', () => {
  const storage = memoryStorage();
  const emails = createAccountDirectoryEmailStorage(storage);
  assert.throws(() => emails.save('111-222-3333',''),/Informe um e-mail válido/);
  assert.throws(() => emails.save('111-222-3333','not-an-email'),/Informe um e-mail válido/);
  assert.throws(() => emails.save('','owner@example.com'),/conta precisa estar identificada/);

  const malformed = memoryStorage();
  malformed.setItem(ACCOUNT_DIRECTORY_EMAIL_KEY,'{invalid json');
  const malformedEmails = createAccountDirectoryEmailStorage(malformed);
  assert.deepEqual({...malformedEmails.read()},{});
  assert.throws(() => malformedEmails.save('111-222-3333','owner@example.com'),/não puderam ser lidos e não foram substituídos/);
  assert.equal(malformed.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY),'{invalid json');

  const denied = {getItem(){return null;},setItem(){throw new Error('quota');}};
  assert.throws(() => createAccountDirectoryEmailStorage(denied).save('111-222-3333','owner@example.com'),/Não foi possível salvar o e-mail/);
});

test('payment profile IDs are manual, persistent per account and independent from e-mail and status', () => {
  const storage = memoryStorage();
  const paymentProfiles = createAccountDirectoryPaymentProfileStorage(storage);
  assert.deepEqual({...paymentProfiles.read()},{});
  assert.equal(storage.values.size,0,'ler IDs vazios não grava valores');

  createAccountDirectoryStatusStorage(storage).save('111-222-3333','active');
  createAccountDirectoryEmailStorage(storage).save('111-222-3333','owner@example.com');
  paymentProfiles.save('111-222-3333','  profile-123456789012  ');
  paymentProfiles.save('444-555-6666','profile-987654321098');
  assert.deepEqual({...paymentProfiles.read()},{
    '111-222-3333':'profile-123456789012',
    '444-555-6666':'profile-987654321098'
  });
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_STATUS_KEY))['111-222-3333'],'active');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['111-222-3333'],'owner@example.com');
  assert.equal(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY,'hub:account-directory:manual-payment-profile-id:v1');
});

test('payment profile ID validation and failed writes preserve local data', () => {
  const storage = memoryStorage();
  const paymentProfiles = createAccountDirectoryPaymentProfileStorage(storage);
  assert.throws(()=>paymentProfiles.save('111-222-3333',''),/Informe um ID de perfil de pagamento/);
  assert.throws(()=>paymentProfiles.save('111-222-3333','x'.repeat(129)),/Informe um ID de perfil de pagamento/);
  assert.throws(()=>paymentProfiles.save('','profile-123'),/conta precisa estar identificada/);

  const malformed = memoryStorage();
  malformed.setItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY,'{invalid json');
  const malformedProfiles = createAccountDirectoryPaymentProfileStorage(malformed);
  assert.deepEqual({...malformedProfiles.read()},{});
  assert.throws(()=>malformedProfiles.save('111-222-3333','profile-123'),/não puderam ser lidos e não foram substituídos/);
  assert.equal(malformed.getItem(ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY),'{invalid json');

  const unavailable = createAccountDirectoryPaymentProfileStorage(null);
  assert.throws(()=>unavailable.save('111-222-3333','profile-123'),/armazenamento local não está disponível/);
  const denied = {getItem(){return null;},setItem(){throw new Error('quota');}};
  assert.throws(()=>createAccountDirectoryPaymentProfileStorage(denied).save('111-222-3333','profile-123'),/Não foi possível salvar o ID do perfil de pagamento/);
});

test('manual account registry is additive, normalized and independent from MCC and annotations', () => {
  const storage = memoryStorage();
  const accounts = createAccountDirectoryManualAccountsStorage(storage);
  assert.deepEqual(accounts.read(),[]);
  assert.equal(storage.values.size,0,'a tela não cadastra conta automaticamente');
  createAccountDirectoryStatusStorage(storage).save('123-456-7890','active');
  createAccountDirectoryEmailStorage(storage).save('123-456-7890','owner@example.com');

  assert.deepEqual(accounts.add('1234567890'),['123-456-7890']);
  assert.deepEqual(accounts.read(),['123-456-7890']);
  assert.throws(()=>accounts.add('123-456-7890'),/já está cadastrada manualmente/);
  assert.throws(()=>accounts.add('7890'),/ID completo/);
  assert.equal(ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY,'hub:account-directory:manual-accounts:v1');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_STATUS_KEY))['123-456-7890'],'active');
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_DIRECTORY_EMAIL_KEY))['123-456-7890'],'owner@example.com');
});

test('manual account registry never overwrites malformed or unavailable local data', () => {
  const malformed = memoryStorage();
  malformed.setItem(ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY,'{invalid json');
  const accounts = createAccountDirectoryManualAccountsStorage(malformed);
  assert.deepEqual(accounts.read(),[]);
  assert.throws(()=>accounts.add('123-456-7890'),/não puderam ser lidas e não foram substituídas/);
  assert.equal(malformed.getItem(ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY),'{invalid json');

  const unavailable = createAccountDirectoryManualAccountsStorage(null);
  assert.throws(()=>unavailable.add('123-456-7890'),/armazenamento local não está disponível/);
  const denied = {getItem(){return null;},setItem(){throw new Error('quota');}};
  assert.throws(()=>createAccountDirectoryManualAccountsStorage(denied).add('123-456-7890'),/Não foi possível salvar a conta/);
});

import {normalizeAccountDirectoryId} from './accounts-list-domain.mjs?v=2';

export const ACCOUNT_DIRECTORY_STATUS_KEY = 'hub:account-directory:manual-status:v1';
export const ACCOUNT_DIRECTORY_EMAIL_KEY = 'hub:account-directory:manual-email:v1';
export const ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY = 'hub:account-directory:manual-payment-profile-id:v1';
export const ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY = 'hub:account-directory:manual-accounts:v1';

const validStatuses = new Set(['active', 'suspended']);
const emptyStatuses = () => Object.create(null);

function parseStatuses(raw) {
  if (raw == null || raw === '') return emptyStatuses();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('O status salvo neste navegador tem um formato inválido.');
  }
  const statuses = emptyStatuses();
  for (const [account, status] of Object.entries(parsed)) {
    if (account.trim() && validStatuses.has(status)) statuses[account] = status;
  }
  return statuses;
}

export function createAccountDirectoryStatusStorage(storage, key = ACCOUNT_DIRECTORY_STATUS_KEY) {
  function read() {
    if (typeof storage?.getItem !== 'function') return emptyStatuses();
    try {
      return parseStatuses(storage.getItem(key));
    } catch {
      return emptyStatuses();
    }
  }

  function save(accountValue, status) {
    const account = String(accountValue ?? '').trim();
    if (!account) throw new TypeError('A conta precisa estar identificada para salvar o status.');
    if (!validStatuses.has(status)) throw new TypeError('Selecione Ativa ou Suspensa.');
    if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
      throw new Error('O armazenamento local não está disponível; o status não foi alterado.');
    }

    let statuses;
    try {
      statuses = parseStatuses(storage.getItem(key));
    } catch {
      throw new Error('O status salvo neste navegador não pôde ser lido e não foi substituído.');
    }
    statuses[account] = status;
    try {
      storage.setItem(key, JSON.stringify(statuses));
    } catch {
      throw new Error('Não foi possível salvar o status neste navegador. Tente novamente.');
    }
    return statuses;
  }

  return {read, save};
}

const emptyEmails = () => Object.create(null);
const validEmail = value => {
  const email = String(value ?? '').trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

function parseEmails(raw) {
  if (raw == null || raw === '') return emptyEmails();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Os e-mails salvos neste navegador têm um formato inválido.');
  }
  const emails = emptyEmails();
  for (const [account, value] of Object.entries(parsed)) {
    const email = String(value ?? '').trim();
    if (account.trim() && validEmail(email)) emails[account] = email;
  }
  return emails;
}

export function createAccountDirectoryEmailStorage(storage, key = ACCOUNT_DIRECTORY_EMAIL_KEY) {
  function read() {
    if (typeof storage?.getItem !== 'function') return emptyEmails();
    try {
      return parseEmails(storage.getItem(key));
    } catch {
      return emptyEmails();
    }
  }

  function save(accountValue, emailValue) {
    const account = String(accountValue ?? '').trim();
    const email = String(emailValue ?? '').trim();
    if (!account) throw new TypeError('A conta precisa estar identificada para salvar o e-mail.');
    if (!validEmail(email)) throw new TypeError('Informe um e-mail válido.');
    if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
      throw new Error('O armazenamento local não está disponível; o e-mail não foi alterado.');
    }

    let emails;
    try {
      emails = parseEmails(storage.getItem(key));
    } catch {
      throw new Error('Os e-mails salvos neste navegador não puderam ser lidos e não foram substituídos.');
    }
    emails[account] = email;
    try {
      storage.setItem(key, JSON.stringify(emails));
    } catch {
      throw new Error('Não foi possível salvar o e-mail neste navegador. Tente novamente.');
    }
    return emails;
  }

  return {read, save};
}

const emptyPaymentProfileIds = () => Object.create(null);
const validPaymentProfileId = value => {
  const id = String(value ?? '').trim();
  return id.length > 0 && id.length <= 128;
};

function parsePaymentProfileIds(raw) {
  if (raw == null || raw === '') return emptyPaymentProfileIds();
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Os IDs de perfil de pagamento salvos neste navegador têm um formato inválido.');
  }
  const ids = emptyPaymentProfileIds();
  for (const [account, value] of Object.entries(parsed)) {
    const id = String(value ?? '').trim();
    if (!account.trim() || !validPaymentProfileId(id)) {
      throw new TypeError('Os IDs de perfil de pagamento salvos neste navegador têm um formato inválido.');
    }
    ids[account] = id;
  }
  return ids;
}

export function createAccountDirectoryPaymentProfileStorage(storage, key = ACCOUNT_DIRECTORY_PAYMENT_PROFILE_KEY) {
  function read() {
    if (typeof storage?.getItem !== 'function') return emptyPaymentProfileIds();
    try {
      return parsePaymentProfileIds(storage.getItem(key));
    } catch {
      return emptyPaymentProfileIds();
    }
  }

  function save(accountValue, idValue) {
    const account = String(accountValue ?? '').trim();
    const id = String(idValue ?? '').trim();
    if (!account) throw new TypeError('A conta precisa estar identificada para salvar o ID do perfil de pagamento.');
    if (!validPaymentProfileId(id)) throw new TypeError('Informe um ID de perfil de pagamento com até 128 caracteres.');
    if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
      throw new Error('O armazenamento local não está disponível; o ID do perfil de pagamento não foi alterado.');
    }

    let ids;
    try {
      ids = parsePaymentProfileIds(storage.getItem(key));
    } catch {
      throw new Error('Os IDs de perfil de pagamento salvos neste navegador não puderam ser lidos e não foram substituídos.');
    }
    ids[account] = id;
    try {
      storage.setItem(key, JSON.stringify(ids));
    } catch {
      throw new Error('Não foi possível salvar o ID do perfil de pagamento neste navegador. Tente novamente.');
    }
    return ids;
  }

  return {read, save};
}

function parseManualAccounts(raw) {
  if (raw == null || raw === '') return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new TypeError('A lista de contas manuais tem um formato inválido.');
  const accounts = [];
  for (const value of parsed) {
    const account = normalizeAccountDirectoryId(value);
    if (!account) throw new TypeError('A lista de contas manuais contém um ID inválido.');
    if (!accounts.includes(account)) accounts.push(account);
  }
  return accounts;
}

export function createAccountDirectoryManualAccountsStorage(storage, key = ACCOUNT_DIRECTORY_MANUAL_ACCOUNTS_KEY) {
  function read() {
    if (typeof storage?.getItem !== 'function') return [];
    try {
      return parseManualAccounts(storage.getItem(key));
    } catch {
      return [];
    }
  }

  function add(accountValue) {
    const account = normalizeAccountDirectoryId(accountValue);
    if (!account) throw new TypeError('Informe o ID completo da conta no formato 123-456-7890.');
    if (typeof storage?.getItem !== 'function' || typeof storage?.setItem !== 'function') {
      throw new Error('O armazenamento local não está disponível; a conta não foi adicionada.');
    }

    let accounts;
    try {
      accounts = parseManualAccounts(storage.getItem(key));
    } catch {
      throw new Error('As contas manuais salvas neste navegador não puderam ser lidas e não foram substituídas.');
    }
    if (accounts.includes(account)) throw new Error('Esta conta já está cadastrada manualmente.');
    accounts.push(account);
    try {
      storage.setItem(key, JSON.stringify(accounts));
    } catch {
      throw new Error('Não foi possível salvar a conta neste navegador. Tente novamente.');
    }
    return accounts;
  }

  return {read, add};
}

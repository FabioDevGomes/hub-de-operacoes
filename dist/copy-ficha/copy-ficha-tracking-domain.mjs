export function normalizeTrackingAccountId(value) {
  const accountId = String(value ?? '').trim();
  if (!/^(?:\d{10}|\d{3}[- ]\d{3}[- ]\d{4})$/.test(accountId)) {
    throw new Error('Selecione uma conta alvo ou informe o ID completo da conta Google Ads (10 dígitos).');
  }
  const digits = accountId.replace(/\D/g, '');
  if (digits.length !== 10) throw new Error('O ID da conta Google Ads precisa ter 10 dígitos.');
  return digits;
}

export function formatTrackingAccountId(value) {
  const digits = normalizeTrackingAccountId(value);
  return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
}

export function buildTrackingProductLabel(productName, accountId) {
  const product = String(productName ?? '').trim();
  if (!product) throw new Error('Informe [PRODUTO] para montar o nome da Track.');
  const digits = normalizeTrackingAccountId(accountId);
  const chars = [...product];
  chars[0] = chars[0].toLocaleUpperCase('pt-BR');
  return `${chars.join('')} - conta ${digits.slice(-4)}`;
}

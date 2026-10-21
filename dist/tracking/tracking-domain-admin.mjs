export const TRACKING_DOMAIN_ADMIN_CONFIG_FILE = 'tracking-domain-admin-config.php';

const HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

function validHost(value) {
  return typeof value === 'string' && HOST_PATTERN.test(value) && !/^\d+(?:\.\d+){3}$/.test(value);
}

export function normalizeTrackingDomainInput(value) {
  const input = String(value ?? '').trim();
  if (!input || input.length > 2048 || /[\x00-\x20\x7f]/.test(input)) {
    throw new Error('Informe somente o domínio da pre-sell, por exemplo: presell.com.');
  }
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let url;
  try { url = new URL(candidate); } catch { throw new Error('Esse domínio não tem um formato válido.'); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || (url.pathname !== '/' && url.pathname !== '') || (url.port && url.port !== '443')
      || !validHost(hostname)) {
    throw new Error('Use apenas um domínio HTTPS, sem caminho, parâmetros, credenciais ou porta diferente de 443.');
  }
  return hostname;
}

export function normalizeTrackingDomainList(payload) {
  if (!payload || payload.ok !== true || !Array.isArray(payload.domains)) {
    throw new Error('O servidor retornou uma lista de domínios ilegível.');
  }
  const domains = payload.domains.map(row => {
    const hostname = typeof row?.page_host === 'string' ? row.page_host.toLowerCase() : '';
    if (!validHost(hostname) || row?.origin !== `https://${hostname}`) {
      throw new Error('O servidor retornou um domínio com formato inválido.');
    }
    return {
      hostname,
      origin: row.origin,
      createdAtUtc: typeof row.created_at_utc === 'string' ? row.created_at_utc : '',
    };
  });
  return domains.sort((left, right) => left.hostname.localeCompare(right.hostname));
}

export function normalizeTrackingDomainSave(payload) {
  if (!payload || payload.ok !== true || !Array.isArray(payload.added) || !Array.isArray(payload.already_allowed)) {
    throw new Error('O servidor retornou uma confirmação de cadastro ilegível.');
  }
  const validate = values => values.map(value => {
    const host = typeof value === 'string' ? value.toLowerCase() : '';
    if (!validHost(host)) throw new Error('O servidor retornou um resultado de cadastro inválido.');
    return host;
  });
  return { added: validate(payload.added), alreadyAllowed: validate(payload.already_allowed) };
}

export function createTrackingDomainAdminToken(cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('Este navegador não oferece geração criptográfica segura de token.');
  }
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function trackingDomainAdminConfigPhp(token) {
  const value = String(token ?? '').trim();
  if (!TOKEN_PATTERN.test(value)) throw new Error('Gere um token administrativo antes de baixar a configuração.');
  return `<?php\ndeclare(strict_types=1);\n\nreturn [\n    'tracking_domain_admin_token' => '${value}',\n];\n`;
}

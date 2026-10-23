export const TRACKING_EMAIL_CONFIG_FILE = 'clickbank-email-config.php';

function normalizeEmail(value, field) {
  const email = String(value ?? '').trim();
  const pattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
  const local = email.split('@')[0] || '';
  if (!email || email.length > 254 || /[\x00-\x20\x7f]/.test(email)
      || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !pattern.test(email)) {
    throw new Error(field === 'to' ? 'Informe um e-mail destinatário válido.' : 'Informe um e-mail remetente válido.');
  }
  return email;
}

function normalizeHost(value) {
  const host = String(value ?? '').trim().toLowerCase();
  if (!host || host.length > 253 || /[\x00-\x20\x7f/\\:@]/.test(host)) {
    throw new Error('Informe o servidor SMTP sem protocolo, caminho ou porta.');
  }
  const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)
    && host.split('.').every(part => Number(part) >= 0 && Number(part) <= 255);
  const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
  if (!ipv4 && !hostname) throw new Error('O servidor SMTP informado não é válido.');
  return host;
}

export function normalizeTrackingEmailConfig(input = {}) {
  const toEmail = normalizeEmail(input.toEmail, 'to');
  const fromEmail = normalizeEmail(input.fromEmail, 'from');
  const smtpHost = normalizeHost(input.smtpHost);
  const portText = String(input.smtpPort ?? '').trim();
  const smtpPort = Number(portText);
  if (!/^\d{1,5}$/.test(portText) || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error('Informe uma porta SMTP válida entre 1 e 65535.');
  }
  const smtpSecurity = String(input.smtpSecurity ?? '');
  if (!['ssl', 'starttls'].includes(smtpSecurity)) throw new Error('Escolha SSL ou STARTTLS para a conexão SMTP.');
  const smtpUsername = String(input.smtpUsername ?? '');
  const smtpPassword = String(input.smtpPassword ?? '');
  if (!smtpUsername.trim() || smtpUsername.length > 320 || /[\x00-\x1f\x7f]/.test(smtpUsername)) {
    throw new Error('Informe o usuário SMTP sem caracteres de controle.');
  }
  if (!smtpPassword || smtpPassword.length > 1024 || /[\x00-\x1f\x7f]/.test(smtpPassword)) {
    throw new Error('Informe a senha SMTP sem quebras de linha ou caracteres de controle.');
  }
  return { toEmail, fromEmail, smtpHost, smtpPort, smtpSecurity, smtpUsername, smtpPassword };
}

function phpSingleQuoted(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Generate a private server config locally; callers must not persist or transmit input. */
export function trackingEmailConfigPhp(input) {
  const config = normalizeTrackingEmailConfig(input);
  return `<?php\ndeclare(strict_types=1);\n\n/* Contains SMTP credentials. Keep this file outside public_html and out of Git/backups shared with others. */\nreturn [\n`
    + `    'to_email' => ${phpSingleQuoted(config.toEmail)},\n`
    + `    'from_email' => ${phpSingleQuoted(config.fromEmail)},\n`
    + `    'smtp_host' => ${phpSingleQuoted(config.smtpHost)},\n`
    + `    'smtp_port' => ${config.smtpPort},\n`
    + `    'smtp_security' => ${phpSingleQuoted(config.smtpSecurity)},\n`
    + `    'smtp_username' => ${phpSingleQuoted(config.smtpUsername)},\n`
    + `    'smtp_password' => ${phpSingleQuoted(config.smtpPassword)},\n`
    + `];\n`;
}

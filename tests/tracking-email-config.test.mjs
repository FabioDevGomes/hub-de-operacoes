import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRACKING_EMAIL_CONFIG_FILE,
  normalizeTrackingEmailConfig,
  trackingEmailConfigPhp,
} from '../src/tracking/tracking-email-config.mjs';

const valid = {
  toEmail: 'notify@example.com',
  fromEmail: 'alerts@example.com',
  smtpHost: 'smtp.example.com',
  smtpPort: '465',
  smtpSecurity: 'ssl',
  smtpUsername: 'alerts@example.com',
  smtpPassword: "s3cr'et\\$phrase",
};

test('valida campos SMTP sem alterar a senha e aceita credenciais específicas de outro provedor', () => {
  const config = normalizeTrackingEmailConfig(valid);
  assert.equal(config.smtpHost, 'smtp.example.com');
  assert.equal(config.smtpPort, 465);
  assert.equal(config.smtpPassword, valid.smtpPassword);
  assert.equal(TRACKING_EMAIL_CONFIG_FILE, 'clickbank-email-config.php');
});

test('rejeita endereços, host e protocolo SMTP inválidos ou com caracteres de controle', () => {
  for (const [field, value] of [
    ['toEmail', 'not-an-email'],
    ['fromEmail', 'a@b'],
    ['smtpHost', 'smtp.example.com\r\nMAIL FROM:<evil@example.com>'],
    ['smtpPort', '465x'],
    ['smtpPort', '65536'],
    ['smtpSecurity', 'plain'],
    ['smtpUsername', 'user\nAUTH PLAIN'],
    ['smtpPassword', 'secret\r\nMAIL FROM:<evil@example.com>'],
  ]) {
    assert.throws(() => normalizeTrackingEmailConfig({ ...valid, [field]: value }));
  }
});

test('gera configuração PHP escapada para arquivo privado sem qualquer dependência de endpoint', () => {
  const php = trackingEmailConfigPhp(valid);
  assert.match(php, /'to_email' => 'notify@example\.com'/);
  assert.match(php, /'smtp_password' => 's3cr\\'et\\\\\$phrase'/);
  assert.match(php, /Contains SMTP credentials/);
  assert.doesNotMatch(php, /https?:\/\//);
});

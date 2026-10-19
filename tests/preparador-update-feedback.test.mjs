import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../dist/preparador-MCC/index.html', import.meta.url), 'utf8');
const formatter = html.match(/function formatPanelUpdateTime\([^\n]*\) \{[\s\S]*?\n    \}/)[0];
const rateFormatter = html.match(/function formatPanelExchangeRate\([^\n]*\) \{[\s\S]*?\n    \}/)[0];
const handler = html.match(/q\('#apply-manifest'\)\.addEventListener\('click', async \(\) => \{[\s\S]*?\n    \}\);/)[0];

function harness(apply) {
  let click;
  const button = { addEventListener: (type, callback) => { click = callback; } };
  const feedback = { hidden:true, textContent:'' };
  const announcer = { textContent:'' };
  const elements = { '#apply-manifest':button, '#apply-feedback':feedback, '#announcer':announcer };
  const context = {
    Intl,
    q: selector => elements[selector],
    currentResult: { manifest: { campanhas:[{}, {}, {}] } },
    applyManifestToPanel:apply,
    formatPanelExchangeRate:quote=>context.rateFormatter(quote),
    panelUpdateError: error => error.message,
    numberingIssues:[],
    updateD0ApplyAvailability: () => {},
    console: { error: () => {} }
  };
  vm.runInNewContext(`${formatter}\nglobalThis.formatTime = formatPanelUpdateTime;\n${rateFormatter}\nglobalThis.rateFormatter = formatPanelExchangeRate;\n${handler}`, context);
  return { button, feedback, announcer, click: () => click(), formatTime:context.formatTime, rateFormatter:context.rateFormatter };
}

test('o horário usa o instante persistido e o fuso de Brasília, inclusive na virada do dia', () => {
  const { formatTime, rateFormatter } = harness(async () => {});
  assert.equal(formatTime('2026-10-06T12:11:42.000Z'), '09:11:42');
  assert.equal(formatTime('2026-10-06T02:05:09.000Z'), '23:05:09');
  for (const missing of [undefined, null, '', ' ', 'inválido']) {
    assert.equal(formatTime(missing), 'horário indisponível');
  }
  assert.equal(rateFormatter({rate:6.7,quoteDate:'2026-10-13'}),'PTAX venda consultada: US$ 1 = R$ 6,7000 (13/10/2026).');
  assert.equal(rateFormatter({rate:5.1,isStale:true,isFallback:true}),'Aviso: a cotação não foi confirmada; usada a taxa legada de compatibilidade: US$ 1 = R$ 5,1000.');
});

test('o aviso mostra o horário retornado pela gravação somente depois do sucesso', async () => {
  let finish;
  const saved = new Promise(resolve => { finish = resolve; });
  const quote={rate:6.7,quoteDate:'2026-10-13'};
  const ui = harness(() => saved);
  const pending = ui.click();
  assert.equal(ui.feedback.textContent, 'Consultando a PTAX e atualizando a base…');
  assert.equal(ui.button.disabled, true);
  finish({ base: { atualizado_em:'2026-10-06T12:11:42.000Z' }, exchangeRateQuote:quote });
  await pending;
  assert.equal(ui.feedback.textContent, 'Base atualizada com sucesso · 3 campanha(s) · 09:11:42 (Brasília). PTAX venda consultada: US$ 1 = R$ 6,7000 (13/10/2026).');
  assert.equal(ui.feedback.className, 'apply-feedback success');
  assert.equal(ui.feedback.hidden, false);
  assert.equal(ui.announcer.textContent, ui.feedback.textContent);
  assert.equal(ui.button.textContent, 'Atualizada ✓');
});

test('a MCC é aplicada mesmo com cotação indisponível e o aviso distingue a taxa legada', async () => {
  const ui = harness(async () => ({base:{atualizado_em:'2026-10-06T12:11:42.000Z'},exchangeRateQuote:{rate:5.1,isStale:true,isFallback:true}}));
  await ui.click();
  assert.equal(ui.feedback.className, 'apply-feedback warning');
  assert.match(ui.feedback.textContent, /Base atualizada com sucesso/);
  assert.match(ui.feedback.textContent, /Aviso: a cotação não foi confirmada; usada a taxa legada de compatibilidade: US\$ 1 = R\$ 5,1000\./);
  assert.equal(ui.announcer.textContent,ui.feedback.textContent);
});

test('uma gravação que falha não exibe sucesso nem horário de atualização', async () => {
  const ui = harness(async () => { throw new Error('Falha de gravação sintética'); });
  await ui.click();
  assert.equal(ui.feedback.className, 'apply-feedback error');
  assert.equal(ui.feedback.textContent, 'Falha ao atualizar a base · Falha de gravação sintética');
  assert.equal(ui.button.textContent, 'Falhou — tentar novamente');
});

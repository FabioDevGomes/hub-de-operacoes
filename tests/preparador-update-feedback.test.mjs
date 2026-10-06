import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const html = await readFile(new URL('../dist/preparador-MCC/index.html', import.meta.url), 'utf8');
const formatter = html.match(/function formatPanelUpdateTime\([^\n]*\) \{[\s\S]*?\n    \}/)[0];
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
    panelUpdateError: error => error.message,
    numberingIssues:[],
    updateD0ApplyAvailability: () => {},
    console: { error: () => {} }
  };
  vm.runInNewContext(`${formatter}\nglobalThis.formatTime = formatPanelUpdateTime;\n${handler}`, context);
  return { button, feedback, announcer, click: () => click(), formatTime:context.formatTime };
}

test('o horário usa o instante persistido e o fuso de Brasília, inclusive na virada do dia', () => {
  const { formatTime } = harness(async () => {});
  assert.equal(formatTime('2026-10-06T12:11:42.000Z'), '09:11:42');
  assert.equal(formatTime('2026-10-06T02:05:09.000Z'), '23:05:09');
  for (const missing of [undefined, null, '', ' ', 'inválido']) {
    assert.equal(formatTime(missing), 'horário indisponível');
  }
});

test('o aviso mostra o horário retornado pela gravação somente depois do sucesso', async () => {
  let finish;
  const saved = new Promise(resolve => { finish = resolve; });
  const ui = harness(() => saved);
  const pending = ui.click();
  assert.equal(ui.feedback.textContent, 'Atualizando a base…');
  assert.equal(ui.button.disabled, true);
  finish({ base: { atualizado_em:'2026-10-06T12:11:42.000Z' } });
  await pending;
  assert.equal(ui.feedback.textContent, 'Base atualizada com sucesso · 3 campanha(s) · 09:11:42 (Brasília).');
  assert.equal(ui.feedback.className, 'apply-feedback success');
  assert.equal(ui.feedback.hidden, false);
  assert.equal(ui.announcer.textContent, ui.feedback.textContent);
  assert.equal(ui.button.textContent, 'Atualizada ✓');
});

test('uma gravação que falha não exibe sucesso nem horário de atualização', async () => {
  const ui = harness(async () => { throw new Error('Falha de gravação sintética'); });
  await ui.click();
  assert.equal(ui.feedback.className, 'apply-feedback error');
  assert.equal(ui.feedback.textContent, 'Falha ao atualizar a base · Falha de gravação sintética');
  assert.equal(ui.button.textContent, 'Falhou — tentar novamente');
});

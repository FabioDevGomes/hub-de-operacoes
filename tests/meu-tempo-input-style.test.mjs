import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Meu Tempo opts all scalar inputs into the approved shared inset surface', async () => {
  const [view, css, published] = await Promise.all([read('src/meu-tempo/meu-tempo-view.mjs'), read('src/meu-tempo/meu-tempo.css'), read('dist/meu-tempo/meu-tempo.css')]);
  assert.equal(css, published);
  assert.ok(view.includes("['time-input','hub-inset-input',extraClass]"));
  const inputs = view.match(/<input[^>]*class="time-input[^"]*"[^>]*>/g);
  assert.ok(inputs.length >= 10, 'o campo de remoção separado foi substituído pelo ajuste com sinal');
  assert.ok(inputs.every(markup => markup.includes('hub-inset-input')));
  assert.ok(!view.match(/<(?:select|textarea)[^>]*hub-inset-input/));
  assert.ok(!view.match(/<input[^>]*type="checkbox"[^>]*hub-inset-input/));
  assert.ok(css.includes('@import url("/control-surfaces.css?v=5")'));
  assert.ok(css.includes('background:var(--hub-input-inset-bg);border:0;border-radius:8px;padding:9px 11px;box-shadow:var(--hub-input-inset-shadow)'));
  assert.ok(css.includes('input.time-input.hub-inset-input{padding:4px 8px}'));
  assert.ok(css.includes('input#timeDate.time-input.hub-inset-input{padding:0 4px}'));
  assert.ok(!css.includes('box-shadow:inset 1.4px'), 'shadow remains owned by shared CSS');
});

import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('Meu Tempo shares the cream bevel and Arial bold between Undo and Save day, preserving their actions', async () => {
  const [css, published, view, localCss, app, build] = await Promise.all([read('src/white-button.css'), read('dist/white-button.css'), read('src/meu-tempo/meu-tempo-view.mjs'), read('src/meu-tempo/meu-tempo.css'), read('dist/index.html'), read('build.mjs')]);
  assert.equal(css, published);
  const sharedSelector = 'body .btn.hub-white-button';
  assert.ok(app.includes('/white-button.css?v=2'), 'shared finish is loaded by the consumer');
  assert.ok(build.includes('src/white-button.css'), 'build publishes the reusable stylesheet');
  assert.ok(!css.includes('#timeUndo') && !css.includes('#saveDay') && !css.includes('time-mode'), 'standard does not depend on a screen or an ID');
  assert.ok(!localCss.includes('#fffaf0'), 'consumer does not duplicate the approved palette');
  assert.equal((view.match(/hub-white-button/g) || []).length, 2, 'only the two approved buttons opt in');
  const surface = css.split(sharedSelector + '{')[1]?.split('}')[0];
  assert.ok(surface, 'both requested buttons share one finish, without affecting other controls');
  assert.ok(surface.includes('background:linear-gradient(145deg,#fffaf0 0%,#f1eadc 55%,#e7decd 100%)'), 'cream face stays light, like the reference');
  assert.ok(!surface.includes('#132b44'), 'discard the experimental blue palette');
  assert.ok(surface.includes('color:#201d18'), 'original dark text restored');
  assert.ok(surface.includes('font-family:Arial,Helvetica,sans-serif'), 'both buttons use the same local font, without remote dependencies');
  assert.ok(surface.includes('text-shadow:none'), 'remove the fractional text highlight, not the button relief');
  assert.ok(!/font-smooth|text-rendering|font-synthesis/.test(surface), 'do not impose nonportable smoothing or synthetic typography settings');
  assert.ok(surface.includes('inset 0 0 0 1px rgba(var(--hub-bevel-rim,255,250,239),.9)'), 'continuous inner highlight frames the face with the unchanged cream fallback');
  assert.ok(surface.includes('inset 1.5px 1.5px 1px rgba(var(--hub-bevel-shine,255,255,255),.8)'), 'light top bevel matches the reference contour');
  assert.ok(surface.includes('font-weight:700'), 'both buttons keep the approved bold text');
  assert.ok(surface.includes('border-width:1px') && surface.includes('border-style:solid'), 'the contour remains visible even on a primary button');
  assert.ok(surface.includes('border-radius:8px'), 'rounded rectangle, rather than a pill');
  assert.ok(surface.includes('border-color:var(--hub-bevel-top,#fff8eb) var(--hub-bevel-right,#d5c9b5) var(--hub-bevel-bottom,#b3a48d) var(--hub-bevel-left,#eee4d2)'), 'light top and darker base define the bevel');
  assert.ok(surface.includes('box-shadow:inset'));
  assert.ok(surface.includes('1px 3px 0 var(--hub-bevel-base,#b5a68e)'), 'warm solid base stays shallow');
  assert.ok(surface.includes('inset -1px -2px 1px rgba(var(--hub-bevel-shade,156,134,98),.15)'), 'bottom inner bevel separates face and base');
  assert.ok(surface.includes('2px 5px 8px rgba(0,0,0,.24)'), 'short soft shadow keeps the relief restrained');
  assert.ok(css.includes('transform:translateY(1px)'), 'press feedback matches the lower relief');
  assert.ok(!/(?:^|;)\s*(?:padding|margin|width|height|font-size|position|display)\s*:/.test(surface), 'existing geometry stays owned by existing rules');
  for (const state of [':hover:not(:disabled)', ':focus-visible', ':active:not(:disabled)', ':disabled']) {
    assert.ok(css.includes(`${sharedSelector}${state}{`), `missing shared ${state}`);
  }
  assert.ok(css.includes('outline:2px solid var(--blue,#4fa7ff);outline-offset:4px'));
  assert.ok(css.includes(`@media(prefers-reduced-motion:reduce){${sharedSelector}{transition:none}${sharedSelector}:active:not(:disabled){transform:none}}`));
  assert.ok(view.includes("button('Desfazer último','id=\"timeUndo\"','hub-white-button')"));
  assert.ok(view.includes('await Storage.undoLast(selectedDate)'));
  assert.ok(view.includes("button('Salvar dia','id=\"saveDay\"','primary hub-white-button')"));
  assert.ok(view.includes("root.querySelector('#saveDay').onclick=async()=>{await Storage.saveDay("));
  assert.ok(!css.includes('body.time-mode #timeUndo.btn{'), 'avoid two independently maintained copies of this design');
});

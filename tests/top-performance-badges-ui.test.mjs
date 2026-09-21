import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/curadoria/top-performance/index.html', import.meta.url), 'utf8');

assert.ok(html.includes('.badges{align-items:center;flex-wrap:nowrap}'), 'badges podem quebrar em mais de uma linha');
assert.ok(html.includes('.badges{min-width:142px}'), 'coluna de badges não reserva largura para as pílulas separadas');
assert.ok(html.includes('.pill.badge-top{color:#ffd379;border-color:#7c5b1c;background:#32250f}'), 'badge Top não possui estilo próprio e pode herdar o layout do cabeçalho');
assert.ok(html.includes("badgeHtml=function(b)"), 'renderização compacta dos badges não foi aplicada');
assert.ok(html.includes('<span class="pill new">New</span>'), 'badge New perdeu seu bloco e cor próprios');
assert.ok(html.includes('<span class="pill badge-top">Top</span>'), 'badge Top perdeu seu bloco, cor ou alinhamento próprios');
assert.ok(html.includes('<span class="pill brand">Brand OK</span>'), 'badge Brand OK perdeu seu bloco e cor próprios');

console.log('top performance badges ui ok');

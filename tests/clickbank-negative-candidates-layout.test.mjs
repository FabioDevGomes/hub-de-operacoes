import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const view = await readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers-view.mjs', root), 'utf8');
const page = await readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs', root), 'utf8');
const html = await readFile(new URL('src/curadoria/clickbank-top-offers/index.html', root), 'utf8');
const css = await readFile(new URL('src/curadoria/clickbank-top-offers/clickbank-top-offers.css', root), 'utf8');
const bridge = await readFile(new URL('src/google-ads/google-ads-clickbank-keyword-bridge.mjs', root), 'utf8');

assert.ok(view.includes('Colagem à esquerda; lista usada pela integração à direita.'), 'a ficha explica o propósito das duas colunas');
assert.ok(view.includes('Novas candidatas · uma por linha') && view.includes('Cole termos ou frases entre aspas'), 'o campo orienta a colagem multilinha');
assert.ok(view.includes('data-image-candidate-input=') && view.includes('data-image-candidate-add='), 'o campo e a ação existentes permanecem ligados');
assert.ok(view.includes('Lista usada pela integração') && view.includes('candidateCountLabel'), 'a lista integrada apresenta a contagem salva');
assert.ok(view.includes('showRemoveForSaved:true') && view.includes('onEdit:') && view.includes('onRemove:'), 'edição e remoção continuam disponíveis na lista salva');
assert.ok(css.includes('grid-template-columns:minmax(245px,.82fr) minmax(300px,1.18fr)'), 'colagem e lista ficam alinhadas em duas colunas');
assert.ok(css.includes('grid-template-columns:minmax(0,1fr) 26px 26px') && css.includes('border-bottom:1px solid rgba(96,124,157,.24)'), 'as ações ficam alinhadas à direita e cada termo é separado por uma divisória');
assert.ok(css.includes(':focus-visible') && css.includes('@media(max-width:760px)'), 'os controles mantêm foco visível e empilham em telas estreitas');
assert.ok(page.includes('parseImageKeywordCandidateLines') && page.includes('split(/\\r?\\n/u)'), 'a colagem preserva cada linha como candidata independente');
assert.ok(page.includes('saveImage(item.offerKey,country,latest.status,[...current,...additions],{candidateOnly:true,duplicateCount:duplicates})'), 'Adicionar continua salvando candidatas e informa duplicatas sem esconder uma falha de sincronização');
assert.ok(bridge.includes('getAll(STORES.images)') && bridge.includes('assessment?.negativeKeywordCandidates'), 'a criação de campanhas continua lendo a lista salva de Imagens');
assert.match(html, /clickbank-top-offers\.css\?v=65/);
assert.match(html, /clickbank-top-offers-page\.mjs\?v=65/);
assert.match(page, /clickbank-top-offers-view\.mjs\?v=62/);
assert.match(page, /delivery-store\.mjs\?v=13/);
assert.match(page, /await syncDeliveryNegativeKeywords\(item\)/);

console.log('clickbank negative candidates layout ok');

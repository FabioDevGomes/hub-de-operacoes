import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';

const html=await readFile(new URL('../dist/asset-studio/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../dist/asset-studio/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/asset-studio/styles.css',import.meta.url),'utf8');

assert.ok(html.includes('Conversão para PNG, mantendo tamanho e fundo'));
assert.ok(!html.includes('id="removeLightBg"'),'controle de remoção de fundo ainda aparece');
assert.ok(!html.includes('16 × 16'),'instrução de redimensionamento ainda aparece');
assert.ok(app.includes('canvas.width = width')&&app.includes('canvas.height = height'),'favicon não preserva as dimensões originais');
assert.ok(app.includes("if (blob.type === 'image/png')")&&app.includes('return { blob, width, height }'),'PNG original não é preservado sem recodificação');
assert.ok(app.includes("canvas.toBlob(resolve, 'image/png')"),'favicon não é convertido para PNG');
assert.ok(!app.includes('removeLightBackground'),'remoção de fundo ainda está ativa');
for(const group of['operation','curation','products'])assert.ok(html.includes(`data-sidebar-group="${group}"`),`grupo lateral ${group} ausente`);
assert.ok(html.includes('painel-sidebar-grupo-aberto-v1'),'menu lateral não compartilha o acordeão do painel');
assert.ok(html.includes('class="active" href="/asset-studio/"'),'Asset Studio não fica ativo no próprio menu');
assert.ok(css.includes('color-scheme: dark')&&css.includes('grid-template-columns: 224px minmax(0, 1fr)'),'tema escuro ou largura do menu lateral ausente');
console.log('asset studio ok');

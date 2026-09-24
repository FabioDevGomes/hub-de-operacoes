import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';

const html=await readFile(new URL('../dist/asset-studio/index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../dist/asset-studio/app.js',import.meta.url),'utf8');
const css=await readFile(new URL('../dist/asset-studio/styles.css',import.meta.url),'utf8');

assert.ok(html.includes('PNG, JPG, WebP ou SVG · mantém tamanho e fundo'));
assert.ok(html.includes('accept="image/*,.svg,image/svg+xml"'),'seletor do favicon não aceita SVG explicitamente');
assert.ok(!html.includes('id="removeLightBg"'),'controle de remoção de fundo ainda aparece');
assert.ok(!html.includes('16 × 16'),'instrução de redimensionamento ainda aparece');
assert.ok(app.includes('canvas.width = width')&&app.includes('canvas.height = height'),'favicon não preserva as dimensões originais');
assert.ok(app.includes("if (blob.type === 'image/png')")&&app.includes('return { blob, width, height }'),'PNG original não é preservado sem recodificação');
assert.ok(app.includes("canvas.toBlob(result => result ? resolve(result)")&&app.includes("'image/png'"),'favicon não é convertido para PNG');
assert.ok(app.includes("blob.type === 'image/svg+xml'")&&app.includes("/\\.svg$/i.test(blob.name || '')"),'arquivo SVG não usa decodificação compatível');
assert.ok(app.includes("getData('image/svg+xml')")&&app.includes("new Blob([text], { type: 'image/svg+xml' })"),'SVG colado como texto não é reconhecido');
assert.ok(app.includes("image.onerror = () => reject(new Error('Não foi possível interpretar o SVG do favicon.'))"),'falha de leitura do SVG não é informada');
assert.ok(app.includes("async function setFaviconBlob")&&app.includes("$('#faviconMessage').textContent = 'Validando favicon…'"),'favicon SVG não é validado no momento da entrada');
assert.ok(!app.includes('removeLightBackground'),'remoção de fundo ainda está ativa');
assert.ok(html.includes('data-hub-sidebar-active="asset-studio"')&&html.includes('data-hub-sidebar-products'),'Asset Studio não monta o menu compartilhado nem marca a rota ativa');
assert.ok(html.includes('/sidebar-component.js')&&html.includes('/sidebar-component.css'),'Asset Studio não carrega o componente lateral compartilhado');
assert.ok(html.includes('id="openFolder"')&&html.includes('hidden>Abrir pasta</button>'),'botão Abrir pasta deve começar oculto');
assert.ok(app.includes("$('#openFolder').hidden = false")&&app.includes('state.outputDirectory = assetsDirectory'),'pasta de saída só fica disponível após geração');
assert.ok(app.includes('startIn: state.outputDirectory')&&app.includes("id: 'asset-studio-output'"),'Abrir pasta deve posicionar o seletor nativo na pasta assets gerada');
assert.ok(app.includes('O File System Access API não expõe o caminho local nem permite abrir o Explorer'),'limitação de abertura direta do Explorer deve ser documentada no código');
assert.ok(css.includes('color-scheme: dark')&&css.includes('grid-template-columns: 224px minmax(0, 1fr)'),'tema escuro ou largura do menu lateral ausente');
console.log('asset studio ok');

import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';

const html=await readFile(new URL('../dist/curadoria/gerentes/index.html',import.meta.url),'utf8');
assert.ok(!html.includes('Como funciona a triagem automática'),'quadro da triagem automática ainda aparece');
assert.ok(!html.includes('data-col="signal"'),'coluna Sinal automático ainda aparece');
assert.ok(!html.includes('id="signalFilter"'),'filtro do sinal automático ficou órfão');
assert.ok(!html.includes('data-copy='),'ícone de copiar nome ainda aparece');
assert.ok(html.includes('id="visibilityFilter"'),'filtro de itens visíveis e ocultos ausente');
assert.ok(html.includes('data-toggle-product-visibility'),'ação de ocultar ou reexibir produto ausente');
assert.ok(html.includes("const HIDDEN_PRODUCTS_PREFS='radar-gerentes-itens-ocultos-v1'"),'preferência de itens ocultos não é persistida');
assert.ok(html.includes("visibility==='all'||(visibility==='hidden'?hidden:!hidden)"),'filtro de visibilidade não cobre visíveis, ocultos e todos');
assert.ok(html.includes('class="product-cell-layout"'),'ação de ocultar não está centralizada verticalmente na célula do produto');
assert.ok(html.includes("import * as TrendsUI from '../trends-ui.mjs'"),'Lista de Gerente não reutiliza o módulo visual de Trends');
assert.ok(html.includes('id="managerProductAgeActions"')&&html.includes('id="managerTrendsResults"'),'controles compartilhados de Trends ausentes na Lista de Gerente');
assert.ok(html.includes("sortKey='payout',sortDirection='desc'"),'Pagamento não inicia ordenado do maior para o menor');
console.log('manager list ui ok');

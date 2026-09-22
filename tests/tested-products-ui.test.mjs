import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
assert.ok(html.includes('id="testedActiveProductsCount"'),'indicador de produtos com campanhas ativas ausente');
assert.ok(html.includes('products.filter(product=>product.active).length'),'indicador não conta produtos ativos consolidados');
assert.ok(html.includes('id="testedColumnsPicker"')&&html.includes('id="testedColumnsMenu"'),'seletor de colunas de Produtos Testados ausente');
assert.ok(html.includes("TESTED_COLUMNS_PREF='painel-produtos-testados-colunas-v1'"),'preferência de colunas não possui chave persistente');
assert.ok(html.includes('localStorage.setItem(TESTED_COLUMNS_PREF'),'preferência de colunas não é salva');
assert.ok(html.includes('data-tested-col="related"')&&html.includes('data-tested-col="actions"'),'colunas da tabela não estão identificadas para ocultação');
assert.ok(html.includes("classList.toggle('hidden-column',hiddenTestedColumns.has(cell.dataset.testedCol))"),'visibilidade das colunas não é reaplicada');
assert.ok(html.includes('numericFamilies')&&html.includes('variants.add(name.toLocaleLowerCase'),'famílias de variantes numéricas não são identificadas');
assert.ok(html.includes("?.size||0)>1?baseName:originalName"),'produto isolado com número final pode ser alterado indevidamente');
assert.ok(html.includes('data-tested-sort="product"')&&html.includes('data-tested-sort="campaigns"'),'cabeçalhos ordenáveis ausentes');
assert.ok(html.includes("testedSortKey='product',testedSortDir='asc'"),'ordenação padrão por produto ausente');
assert.ok(html.includes('function sortTestedProducts(products)')&&html.includes('function bindTestedSorting()'),'comportamento de ordenação de Produtos Testados ausente');
assert.ok(html.includes('campaignDates[0]||normalizeTestedDate(catalog.datas_inicio[x.key])||first'),'data do produto não prioriza a primeira campanha agrupada');
assert.ok(html.includes("return date>reference?`2025-${match[2]}-${match[3]}`:date"),'datas futuras da listagem não são corrigidas para 2025');
console.log('tested products ui ok');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/billing/billing-view.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/billing/billing.css', import.meta.url), 'utf8');

assert.match(view, /const actions = `<div class="billing-action-buttons">/,
  'ações de venda devem compartilhar um contêiner horizontal');
assert.match(view, /billing-month-navigation[\s\S]*?data-billing-month-nav="previous"[\s\S]*?id="billingMonthLabel"[\s\S]*?data-billing-month-nav="next"/,
  'a barra deve oferecer navegação entre meses registrados');
assert.ok(view.includes('aria-label="Mês anterior"') && view.includes('aria-label="Próximo mês"'), 'os controles mensais possuem rótulos acessíveis');
assert.match(view, /adjacentRecordedMonth\(mode, month, 'previous'\)[\s\S]*?adjacentRecordedMonth\(mode, month, 'next'\)/,
  'a navegação mostra somente meses com registros no modo temporal atual');
assert.match(view, /dateRangeForMonth\(targetMonth\)[\s\S]*?root\.dataset\.preset = 'custom'/,
  'selecionar um mês registrado aplica o intervalo mensal correspondente');
assert.match(view, /function invalidateMonthNavigation\(root\)[\s\S]*?delete root\.dataset\.billingMonthNavKey/,
  'inclusões e alterações de dados atualizam a disponibilidade dos meses');
assert.ok(view.includes("['confirmation_status','Confirmação']"), 'tabela de competência deve expor o estado do lançamento manual/confirmado');
assert.ok(view.includes('Lançamento manual') && view.includes("Confirmada · ${esc(sale.confirmation_source || 'MCC D−1')}"), 'a indicação manual deve ser substituída visualmente após conciliação');
assert.ok(view.includes("['conversion_count','Conversões']"), 'tabela expõe a contagem do registro agregado sem criar vendas fictícias');
assert.equal((view.match(/class="billing-product-cell"/g) || []).length, 2, 'tanto a tabela de vendas quanto a de movimentações marcam a coluna Produto para truncamento');
assert.match(css, /\.billing-root \.billing-product-cell span\{display:block;width:260px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/,
  'nomes longos de produto devem caber em coluna compacta e terminar com reticências');
assert.ok(view.includes('Provisória · MCC D0') && view.includes('Não confirmada · ${esc(sale.confirmation_source || \'MCC D−1\')}') && view.includes('Coberta por lançamento manual'), 'estados de agregados MCC e cobertura manual ficam explícitos');
assert.ok(view.includes("sale.source === 'mcc_conversion_aggregate'"), 'linhas agregadas são reconhecidas para proteger os dados derivados');
assert.ok(view.includes("sale?.source === 'hub_manual_capture' && sale.source_ref") && view.includes('root.__updateManualSale({ sourceSaleId:sourceSaleRef, data:saleDate'), 'edição da venda manual vinculada atualiza o lançamento original junto do espelho');
assert.ok(view.includes('billingSourceCorrectionNotice') && view.includes('source_campaign_id') && view.includes('source_country_code') && view.includes('source_sale_time') && view.includes("!['sale_id','sale_date','product','platform','value_brl','source_campaign_id','source_country_code','source_sale_time'].includes(field.name)"), 'edição vinculada libera campos da venda usados no sistema e mantém separados os recebimentos e reembolsos');
for (const action of ['edit', 'receipt', 'refund', 'audit', 'cancel']) {
  assert.ok(view.includes(`data-billing-action="${action}"`), `ação ${action} deve continuar disponível`);
}
assert.match(css, /\.billing-root td\.billing-actions-cell\{[^}]*white-space:nowrap/,
  'a célula de ações deve impedir quebra de linha');
assert.match(css, /\.billing-root \.billing-action-buttons\{display:inline-flex;[^}]*white-space:nowrap/,
  'os botões devem ficar em uma única linha');
assert.match(css, /\.billing-root \.billing-action-buttons \.btn\{margin:0;[^}]*font-size:\.64rem/,
  'os botões devem usar espaçamento compacto');
assert.match(css, /\.billing-custom-period\{align-items:flex-end;flex-wrap:nowrap\}/,
  'datas e botão Aplicar devem alinhar pela base dos campos em telas largas');
assert.match(css, /\.billing-custom-period input\{box-sizing:border-box;width:12ch;min-width:0/,
  'campos de data devem ser compactos para o formato dd/mm/aaaa');
assert.match(css, /@media\(max-width:700px\)\{\.billing-custom-period\{width:100%;flex-wrap:wrap\}/,
  'o filtro de data pode quebrar linha em telas estreitas');
assert.match(css, /\.billing-month-navigation\{display:flex;align-items:center/,
  'os controles do navegador mensal devem permanecer agrupados horizontalmente');
assert.match(view, /billing-detail-panel[\s\S]*?billing-monthly-chart-panel[\s\S]*?id="billingModal"/,
  'o gráfico mensal deve ser o último painel da tela, abaixo da tabela de vendas');
assert.match(view, /function renderMonthlyChart\(root\)[\s\S]*?monthlyFinancialSeries[\s\S]*?function buildMonthlyChartSvg/,
  'o gráfico usa a série mensal do domínio e desenha as categorias do período');
assert.ok(view.includes('lançamento(s) manual(is) incluído(s)') && view.includes('item.manualBrl.amount'), 'o tooltip do gráfico detalha o subtotal manual já incluído no valor mensal');
assert.ok(view.includes('querySalesByDate(chartRange.start, chartRange.end)') && view.includes('queryMovementsByDate(chartRange.start, chartRange.end)'),
  'o gráfico consulta uma janela histórica indexada de doze meses, independente do mês da tabela');
assert.ok(view.includes("'Caixa líquido mensal (R$)'"), 'na referência Caixa, o gráfico informa claramente o valor líquido de movimentos');
assert.match(css, /\.billing-month-chart-scroll\{[^}]*overflow-x:auto/,
  'o gráfico pode acomodar períodos com muitos meses sem criar rolagem vertical interna');

console.log('billing-view: ações e filtros compactos, gráfico mensal acessível e datas alinhadas');

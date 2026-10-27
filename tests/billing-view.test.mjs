import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/billing/billing-view.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/billing/billing.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');

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
assert.equal((view.match(/Domain\.displayProductName\(/g) || []).length, 2, 'as colunas Produto em Competência e Caixa exibem apenas o rótulo simplificado sem trocar o valor salvo');
assert.match(css, /\.billing-root \.billing-product-cell span\{display:block;width:260px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/,
  'nomes longos de produto devem caber em coluna compacta e terminar com reticências');
assert.ok(view.includes("Provisória · ${esc(sale.confirmation_source || 'MCC D0')}") && view.includes('Não confirmada · ${esc(sale.confirmation_source || \'MCC D−1\')}') && view.includes('Coberta por lançamento manual'), 'agregados provisórios exibem a fonte observada (MCC ou API), preservando os demais estados');
assert.ok(view.includes("sale.source === 'mcc_conversion_aggregate'"), 'linhas agregadas são reconhecidas para proteger os dados derivados');
assert.match(view, /const actions = `<div class="billing-action-buttons"><button class="btn" data-billing-action="edit"/,
  'todas as vendas, inclusive agregados MCC e registros inativos, exibem Editar');
assert.match(view, /onCancelSale = null[\s\S]*?root\.__cancelSale = onCancelSale/,
  'a tela pode delegar cancelamentos ao adaptador compartilhado para sincronizar a Visão Geral');
assert.match(view, /if \(root\.__cancelSale\) await root\.__cancelSale\(\{ saleId, reason \}\);[\s\S]*?else await Storage\.cancelSale\(saleId, reason\)/,
  'o cancelamento da venda usa a integração atômica quando disponível e mantém fallback do módulo');
assert.ok(view.includes('billingMccCorrectionNotice') && view.includes("form.dataset.mccAggregateCorrection = 'true'")
  && view.includes('root.__updateMccConversionValues')
  && view.includes('Storage.updateMccConversionValues(form.elements.sale_id.value, values,'),
  'Editar agregado MCC envia a correção ao adaptador compartilhado e mantém a operação de fallback auditada');
assert.ok(view.includes('id="billingPlatformField"') && view.includes('form.elements.platform.disabled = false')
  && view.includes("platformChanged ? {platform} : {}") && view.includes("...(platformChanged ? {platform} : {})"),
  'Editar agregado MCC permite sobrescrever a plataforma e salva mudanças junto da correção de valor quando aplicável');
assert.ok(view.includes('Plataforma atualizada e registrada no Histórico') && view.includes('preservada nas próximas sincronizações MCC'),
  'a confirmação informa que a sobrescrita de plataforma persiste após sincronizações');
assert.ok(view.includes('Controle Macro, relatórios e páginas de produto foram atualizados.')
  && view.includes('Como a moeda original não está identificada'),
  'o usuário recebe a confirmação de propagação e evita assumir ou combinar moedas');
assert.ok(view.includes("sale?.source === 'hub_manual_capture' && sale.source_ref") && view.includes('root.__updateManualSale({ sourceSaleId:sourceSaleRef, data:saleDate'), 'edição da venda manual vinculada atualiza o lançamento original junto do espelho');
assert.ok(view.includes('onManualSaleSaved = null') && view.includes('root.__onManualSaleSaved = onManualSaleSaved') && view.includes('await root.__onManualSaleSaved?.(sale)')
  && app.includes('onManualSaleSaved:()=>syncMccDiaryRowsToBilling({force:true})'),
  'ao salvar uma venda manual, o Faturamento tenta imediatamente rastrear uma conta por evidência inequívoca do Diário');
assert.ok(view.includes('billingPaymentStatusDialog') && view.includes('data-payment-status-choice') && view.includes('data-billing-action="payment-status"'), 'o status na coluna de vendas é acionável e abre o seletor de pagamento');
assert.ok(view.includes('billingManualMccMatchDialog') && view.includes('data-billing-action="manual-mcc-match"') && view.includes('root.__linkManualSaleToMcc'), 'sugestões de correspondência MCC exigem selecionar e confirmar o vínculo');
assert.ok(view.includes('manualMccMatchCandidates') && view.includes('A conversão inteira exibida no D0 pode confirmar o vínculo'), 'a revisão mostra candidatos e explica a confirmação D0 sem tratar pagamento como recebido');
assert.ok(app.includes("placeholder=candidates.length===1?'':") && app.includes("if(candidates.length!==1)$('#saleCampaign').value=''"), 'com mais de uma campanha possível, o formulário exige escolha explícita');
assert.ok(app.includes('manualMccMatchCandidates(state.database)') && app.includes('A sugestão mudou ou deixou de ser compatível'), 'o adaptador recalcula a compatibilidade antes de gravar um vínculo');
assert.ok(view.includes('getCampaigns = () => []') && view.includes('inferPlatformFromCampaignName = null')
  && view.includes('Domain.resolveMccSalePlatforms(rawAllSales, campaigns, root.__inferBillingCampaignPlatform)')
  && view.includes('Domain.resolveMccSalePlatforms(raw, campaigns, root.__inferBillingCampaignPlatform)'),
  'os registros MCC antigos são classificados antes dos filtros, totais e tabela usando a campanha associada');
assert.ok(app.includes('inferPlatformFromCampaignName:CampaignDatabase.inferAffiliatePlatformFromCampaignName')
  && app.includes('CampaignDatabase.mccBillingSalesFromDiary(database,{manifestOnly:true})')
  && app.includes('CampaignDatabase.mccBillingSalesFromManifest(database)')
  && app.includes('preserveExistingPlatform:true'),
  'a listagem deriva plataformas antigas sem trocar dados ao abrir; novas capturas MCC gravam a classificação inferida');
assert.match(view, /competenceKpis\(context\.sales, context\.movements, context\.allSales\)[\s\S]*?kpi\('Total de vendas', lifetimeSalesCount/,
  'total de vendas usa todo o histórico, sem herdar o período/filtros da seleção atual');
assert.match(view, /const \[raw, rawAllSales\] = await Promise\.all\([\s\S]*?Storage\.queryAllSales\(\)[\s\S]*?Domain\.resolveMccSalePlatforms\(rawAllSales/,
  'Faturamento total consulta o histórico persistido no IndexedDB, não uma constante da interface');
assert.match(view, /function lifetimeTotalKpi\(sales\)[\s\S]*?Domain\.sumCurrency\(activeSales, 'value_brl'\)[\s\S]*?Domain\.sumCurrency\(activeSales, 'value_usd'\)/,
  'o faturamento total é calculado a partir das vendas lidas do banco local e exclui canceladas');
assert.ok(view.includes("Storage.querySalesByDate(chartRange.start, chartRange.end)") && view.includes("Storage.queryMovementsByDate(chartRange.start, chartRange.end)"),
  'o gráfico mensal consulta registros persistidos por data em vez de conter uma série de faturamento embutida');
const monthlyChartView = view.replaceAll('\r\n', '\n').match(/async function renderMonthlyChart\(root\) \{([\s\S]*?)\n\}\n\nfunction buildMonthlyChartSvg/)?.[1] || '';
assert.ok(monthlyChartView.includes('monthlyFinancialSeries({ sales:rawSales') && monthlyChartView.includes('monthlyFinancialSeries({ movements:rawMovements'),
  'o gráfico agrega diretamente todas as vendas e movimentos consultados no período');
assert.ok(monthlyChartView.includes('exchangeRate:root.__billingExchangeRate') && monthlyChartView.includes('chartRateNote(root)')
  && view.includes("style:'currency', currency:'BRL'") && view.includes('equivalente em R$ indisponível'),
  'o gráfico converte USD para BRL pela taxa operacional e identifica indisponibilidade sem apresentar USD como real');
assert.ok(view.includes('No gráfico mensal e na coluna Valor R$ das vendas')
  && view.includes('Domain.billingValueInBrlForPresentation(sale, root.__billingExchangeRate)')
  && view.includes('não gravado no lançamento') && view.includes('renderTable(root)')
  && app.includes('exchangeRate:state.rate,exchangeRateQuote:state.exchangeRateQuote')
  && app.includes("state.activeView==='billing')$('#billingRoot').__setBillingExchangeRate?.(state.rate,quote)"),
  'a tabela exibe somente como equivalente o valor em R$ derivado da mesma taxa operacional, sem persistir conversão');
assert.ok(view.includes('Domain.billingValueInUsdForPresentation(sale, root.__billingExchangeRate)')
  && view.includes('const usdCell = usdEquivalent.source === \'brl\'')
  && view.includes('chartUsdEquivalentRateNote(root)')
  && view.includes('Equivalente calculado de ${money(sale.value_brl, \'BRL\')}; não gravado no lançamento')
  && view.includes('${usdCell}</td><td class="num">${brlCell}'),
  'a tabela exibe em US$ o equivalente somente de vendas originalmente em BRL, sinaliza a conversão e não persiste alteração');
assert.ok(!monthlyChartView.includes('getFilters(root)') && !monthlyChartView.includes('Domain.filterRows'),
  'filtros e paginação da tabela não removem lançamentos das séries mensais');
assert.ok(monthlyChartView.includes('sem os filtros da tabela') && !monthlyChartView.includes('filtros atuais'),
  'a legenda informa que o gráfico mensal não herda os filtros da tabela');
assert.ok(view.includes('BILLING_MANUAL_STATUS_OPTIONS') && view.includes("Storage.updateSale(saleId, { payment_status:paymentStatus }, 'payment_status_changed')"), 'as três opções de pagamento são salvas e auditadas pela API de Faturamento');
assert.ok(view.includes('Pagamento emitido') && view.includes('Pagamento recebido') && view.includes('não cria um lançamento de caixa'), 'a janela distingue emissão de recebimento de caixa');
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
assert.match(css, /\.billing-mcc-correction \.billing-form-grid>label:not\(#billingPlatformField\):not\(#billingValueBrlField\):not\(#billingValueUsdField\)\{display:none\}/,
  'o editor de agregado MCC mostra plataforma e os campos de valor sem liberar outros dados derivados');
assert.match(css, /\.billing-custom-period\{align-items:flex-end;flex-wrap:nowrap\}/,
  'datas e botão Aplicar devem alinhar pela base dos campos em telas largas');
assert.match(css, /\.billing-custom-period input\{box-sizing:border-box;width:12ch;min-width:0/,
  'campos de data devem ser compactos para o formato dd/mm/aaaa');
assert.match(css, /@media\(max-width:700px\)\{\.billing-custom-period\{width:100%;flex-wrap:wrap\}/,
  'o filtro de data pode quebrar linha em telas estreitas');
assert.match(view, /class="billing-month-navigation hub-month-navigation"/,
  'os controles do navegador mensal devem reutilizar a apresentação compartilhada');
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
const statusCss = await readFile(new URL('../src/billing/billing-status.css', import.meta.url), 'utf8');
assert.match(statusCss, /\.billing-payment-dialog::backdrop/);
assert.match(statusCss, /\.billing-payment-option\.selected/);

console.log('billing-view: ações e filtros compactos, gráfico mensal acessível e datas alinhadas');

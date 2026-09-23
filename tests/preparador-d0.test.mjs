import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('../dist/preparador-MCC/index.html',import.meta.url),'utf8');
assert.ok(html.includes("'D0_metricas_parciais'"),'D0 ainda não é classificado como métricas parciais');
assert.ok(html.includes('metricas_D_zero:metrics0'),'manifesto não contém as métricas completas de D0');
assert.ok(html.includes('totais_controle_D_zero'),'totais de validação de D0 ausentes');
assert.ok(html.includes("campaign.metricas_D_zero, 'd0'"),'aplicação direta não grava a linha diária de D0');
assert.ok(html.includes('Campanha duplicada em D0; métricas não associadas.'),'mensagem antiga de D0 ainda limita a coleta ao custo');
assert.ok(html.includes('function panelStatusObservation(field)'),'normalização do status da MCC ausente no Preparador');
assert.ok(html.includes("const disqualified = search.includes('nao qualificad')"),'Preparador não reconhece “Não qualificado” no masculino');
assert.ok(html.includes("new BroadcastChannel('painel-campanhas')"),'Preparador não avisa a Visão Geral após atualizar a base');
assert.ok(html.includes('const PANEL_DB_VERSION = 3;'),'Preparador MCC não participa da migração aditiva do Event Log');
assert.ok(html.includes("createObjectStore(PANEL_EVENT_STORE, { keyPath:'event_id' })"),'Preparador MCC não cria o armazenamento append-only dos eventos');
assert.ok(html.includes('transaction.objectStore(PANEL_EVENT_STORE).getAll()'),'Preparador MCC não mescla o Event Log ao ler a base compartilhada');
assert.ok(html.includes('eventStore.add(event)'),'Preparador MCC não persiste eventos sem sobrescrever registros anteriores');
assert.ok(html.includes("source:'preparador_mcc'"),'importação do Preparador MCC não identifica a origem dos eventos');
assert.ok(html.includes('Q:{ value:panelStatusObservation(metrics.status_campanha) }'),'Preparador não grava o status nas observações diárias');
assert.ok(html.includes("campaign_state: ['status da campanha'"),'estado operacional e status de qualificação continuam misturados');
assert.ok(html.includes("status: ['status', 'estado', 'status de qualificacao'"),'coluna de status de qualificação não é reconhecida');
assert.ok(html.includes('estado_campanha:stateValue(r0?.estado_campanha)')&&html.includes('status_qualificacao:stateValue(r0?.status_qualificacao)'),'estado operacional e qualificação não são preservados em campos separados no manifesto');
assert.ok(html.includes("status_campanha:raw.status?.trim() || raw.campaign_state?.trim() || null"),'status de qualificação não tem prioridade sobre o estado da campanha');
assert.ok(html.includes("target_cpa: ['cpa desejado'"),'coluna CPA desejado não é reconhecida');
assert.ok(html.includes("cpa_desejado:field(r0,'target_cpa',parseNumber)"),'CPA desejado de D0 não é preservado no manifesto');
assert.ok(html.includes("conversion_value: ['valor conv'"),'coluna Valor conv. não é reconhecida');
assert.ok(html.includes("valor_conversao:field(r0,'conversion_value',parseNumber)"),'valor de conversão de D0 não é preservado no manifesto');
assert.ok(html.includes('P:{ value:panelValue(metrics.valor_conversao)'),'valor de conversão não é gravado no Diário do Produto');
assert.ok(html.includes('grid-template-columns: 224px minmax(0, 1fr)'),'menu lateral do Preparador não segue a largura compacta do painel');
assert.ok(html.includes('overflow-y: scroll; scrollbar-gutter: stable;'),'Preparador não mantém a rolagem vertical da tela disponível e visível');
assert.ok(html.includes('.hub-app { display: grid; grid-template-columns: 224px minmax(0, 1fr); min-height: 100vh; height: auto; overflow: visible; align-items: start; }'),'estrutura do Preparador ainda pode bloquear a rolagem vertical da tela');
assert.ok(html.includes('.hub-main { min-width: 0; min-height: 100vh; overflow: visible; }'),'conteúdo principal do Preparador ainda pode criar um contêiner de rolagem indevido');
assert.ok(['operation','analysis','personal','curation','creation','products'].every(group=>html.includes(`data-sidebar-group="${group}"`)),'grupos expansíveis do menu não estão completos no Preparador');
const personalMenu=html.match(/data-sidebar-group="personal"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
assert.ok(personalMenu.includes('Meu Tempo')&&!personalMenu.includes('Observabilidade decisória'),'grupo Pessoal deve conter Meu Tempo sem repetir observabilidade');
const analysisMenu=html.match(/data-sidebar-group="analysis"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
assert.ok(analysisMenu.includes('Análise por faixa de CPA')&&analysisMenu.includes('Mapa por conta')&&analysisMenu.includes('Observabilidade decisória'),'grupo de análises do Preparador está incompleto');
const operationMenu=html.match(/data-sidebar-group="operation"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
const productsMenu=html.match(/data-sidebar-group="products"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
const creationMenu=html.match(/data-sidebar-group="creation"[\s\S]*?<\/div>\s*<\/div>/)?.[0]||'';
assert.ok(operationMenu.includes('Controle Macro')&&operationMenu.includes('Preparador MCC'),'grupo Operação do Preparador está incompleto');
assert.ok(productsMenu.includes('Produtos testados')&&productsMenu.includes('Diário do produto'),'grupo Produtos do Preparador está incompleto');
assert.ok(creationMenu.includes('Gerador de Pre-Sell')&&creationMenu.includes('Asset Studio')&&creationMenu.includes('Copy e Ficha'),'grupo de criação do Preparador está incompleto');
assert.ok(html.includes("localStorage.setItem(SIDEBAR_GROUP_KEY, openName)"),'estado expansível do menu não é compartilhado com as demais telas');
assert.ok(html.includes("setSidebarGroup(isOpen ? '' : toggle.dataset.sidebarToggle)"),'menu do Preparador não fecha o grupo anterior ao abrir outro');
assert.ok(analysisMenu.includes('/?view=cpa')&&analysisMenu.includes('/?view=accounts')&&personalMenu.includes('/?view=time')&&analysisMenu.includes('/?view=observability'),'rotas do Preparador estão ausentes nos agrupamentos adequados');
assert.ok(creationMenu.includes('/?view=presell')&&creationMenu.includes('/asset-studio/'),'ferramentas de Pre-Sell estão ausentes no menu do Preparador');
assert.ok(html.includes('validatePreparedNumbering(result)'),'validação de numeração não ocorre ao carregar o CSV');
assert.ok(html.includes('BASE NÃO ATUALIZADA — Renumere:'),'alerta claro de renumeração ausente');
assert.ok(html.includes("error.code = 'CAMPAIGN_NUMBER_REUSE'"),'aplicação não possui bloqueio defensivo para numeração reutilizada');
assert.ok(!html.includes('function confirmPanelConflicts('),'confirmação antiga de divergências ainda aparece durante a atualização');
assert.ok(html.includes('const overwrite = preview.conflicts.length > 0;'),'valores fechados do CSV não substituem silenciosamente os parciais após a validação');
assert.ok(
  html.indexOf('id="validation-panel"') < html.indexOf('id="apply-panel"')
  && html.indexOf('id="apply-panel"') < html.indexOf('id="preview-panel"'),
  'Atualizar base não aparece imediatamente após a Validação automática'
);
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
console.log('preparador D0 completo ok');

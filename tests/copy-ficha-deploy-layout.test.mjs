import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/copy-ficha/copy-ficha-deploy.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../src/index.template.html', import.meta.url), 'utf8');
const deploy = await readFile(new URL('../src/copy-ficha/copy-ficha-deploy.mjs', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/copy-ficha/copy-ficha-view.mjs', import.meta.url), 'utf8');

test('arquivos da prévia pronta ocupam linhas horizontais e quebram em telas estreitas', () => {
  assert.ok(css.includes('.copy-ficha-deploy-plan.is-ready>ul{display:flex;flex-wrap:wrap;'), 'a lista usa fluxo horizontal com quebra de linha');
  assert.ok(css.includes('.copy-ficha-deploy-plan.is-ready>ul>li{display:inline-flex;'), 'cada arquivo permanece legível como item próprio');
  assert.ok(css.includes('.copy-ficha-deploy-plan.is-ready>ul>li::before{content:\'•\';'), 'os itens mantêm marcador sem ocupar uma linha inteira');
  assert.match(html, /copy-ficha\/copy-ficha-deploy\.css\?v=23/, 'a folha de estilos do modal usa sua chave atual de cache');
});

test('deploy mostra indicador de carregamento durante análise e publicação', () => {
  assert.match(deploy, /data-deploy-spinner[^>]*hidden/, 'o modal inclui o indicador de carregamento');
  assert.match(deploy, /const showSpinner=value&&\['analyze','publish'\]\.includes\(action\)/, 'análise e publicação ativam o indicador');
  assert.match(deploy, /setBusy\(true,'Enviando os arquivos para os destinos confirmados…','publish'\)/, 'o envio identifica sua ação para a interface');
  assert.match(deploy, /publishButton\.setAttribute\('aria-busy',String\(Boolean\(value&&action==='publish'\)\)\)/, 'o botão de publicação expõe o estado ocupado');
});

test('a conferência diferencia ausência na resposta da API de ausência real no HPanel', () => {
  assert.match(deploy, /file\.status==='missing'\?'Não localizado pela listagem da API Hostinger\.'/);
  assert.match(deploy, /Isso não confirma que estejam ausentes no HPanel/);
  assert.match(deploy, /Detalhes da consulta à Hostinger/);
  assert.match(deploy, /A API não retornou itens nesta consulta/);
});

test('a validação manual confirma funcionamento e fica verde com um visto', () => {
  assert.match(deploy, /data-deploy-action="manual-verify"/);
  assert.match(deploy, /✓ Funcionando · validado manualmente/);
  assert.ok(css.includes('.copy-ficha-deploy-summary-manual{'), 'o controle manual tem estilo próprio e discreto');
  assert.ok(css.includes('.copy-ficha-deploy-summary-manual.is-confirmed{'), 'a confirmação manual usa o estado verde');
  assert.match(deploy, /O Hub considera este destino verificado e validado para prosseguir/);
  assert.ok(deploy.includes('validado(s) manualmente como funcionando'));
});

test('a validação manual oculta a confirmação automática incompatível do inventário', () => {
  assert.match(deploy, /const inventoryHtml=!manualVerified&&latestExecution&&\(latestVerification\|\|verificationNeedsAction\)\?/);
});

test('cada cartão de domínio oferece HPanel para seu domínio principal associado', () => {
  assert.match(deploy, /renderTargetSummary\(dialog\.querySelector\('\[data-deploy-summary\]'\),job,hpanelUrlForDomain\)/);
  assert.match(deploy, /hpanelUrlForDomain\(domain,parent\)/);
  assert.match(deploy, /copy-ficha-deploy-summary-hpanel/);
  assert.ok(css.includes('.copy-ficha-deploy-summary-domain-group{'), 'o atalho aparece agrupado com o domínio do cartão');
  assert.match(view, /hpanelUrlForDomain:\(domain,parentDomain\)=>accountDomainUrl\(parentDomain\)\|\|accountDomainUrl\(domain\)/, 'o HPanel abre o domínio principal, com fallback para o destino');
});

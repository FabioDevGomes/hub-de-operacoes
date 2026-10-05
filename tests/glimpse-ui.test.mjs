import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Glimpse é compartilhado entre as listas e curadorias',async()=>{
  const [manager,top,page,hotOffersPage,styles,shortcut,glimpsePage,glimpseStyles,peopleAlsoSearchStyles,distPage,distScript,distHighlightStyles,distGlimpseStyles,clickbankPage,clickbankController,smartadvPage,smartadvController,headerControls,distHeaderControls,distSharedStyles]=await Promise.all([
    readFile(new URL('../src/curadoria/gerentes/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/top-performance/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/hot-offers-ms/hot-offers-ms-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/trends-sheet.css',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse-shortcut.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/glimpse-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/glimpse.css',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse/people-also-search.css',import.meta.url),'utf8'),
    readFile(new URL('../dist/curadoria/glimpse/index.html',import.meta.url),'utf8'),
    readFile(new URL('../dist/curadoria/glimpse/glimpse-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../dist/curadoria/glimpse/people-also-search.css',import.meta.url),'utf8'),
    readFile(new URL('../dist/curadoria/glimpse/glimpse.css',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/clickbank-top-offers/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/clickbank-top-offers/clickbank-top-offers-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/smartadv-offers/index.html',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/smartadv-offers/smartadv-offers-page.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/curadoria/glimpse-embed-controls.mjs',import.meta.url),'utf8'),
    readFile(new URL('../dist/curadoria/glimpse-embed-controls.mjs',import.meta.url),'utf8'),
    readFile(new URL('../dist/curadoria/trends-sheet.css',import.meta.url),'utf8')
  ]);
  assert.equal(distPage,page,'a página Glimpse servida corresponde à fonte atual');
  assert.equal(distScript,glimpsePage,'o renderizador Glimpse servido corresponde à fonte atual');
  assert.equal(distHighlightStyles,peopleAlsoSearchStyles,'os estilos do destaque são publicados pelo build');
  assert.equal(distGlimpseStyles,glimpseStyles,'os estilos do layout Glimpse são publicados pelo build');
  assert.equal(distHeaderControls,headerControls,'o controle compartilhado do cabeçalho é publicado pelo build');
  assert.equal(distSharedStyles,styles,'os estilos dos cabeçalhos hospedeiros correspondem à fonte');
  assert.match(manager,/data-sort="glimpse"/);
  assert.match(manager,/glimpse-storage\.mjs/);
  assert.match(top,/data-open-top-glimpse/);
  assert.match(top,/glimpse-storage\.mjs/);
  assert.match(page,/Colar dados do Glimpse \/ Google Trends/);
  assert.match(page,/Ao colar aqui, a análise é feita e salva automaticamente/);
  assert.match(page,/>Analisar novamente</);
  assert.match(page,/Indicadores principais/);
  assert.match(page,/id="v2Details"/);
  assert.match(page,/id="confidenceValue"/);
  assert.match(page,/id="alertRows"/);
  assert.match(page,/id="dimensionRows"/);
  assert.match(page,/id="signalReasons"/);
  assert.match(page,/Intenção das queries/);
  assert.match(page,/Sinais emergentes/);
  assert.match(page,/glimpse\.css\?v=\d+/,'CSS do componente compartilhado tem versão de cache; conteúdo servido é comparado à fonte acima');
  assert.match(page,/glimpse-page\.mjs\?v=\d+/,'script compartilhado tem versão de cache; conteúdo servido é comparado à fonte acima');
  assert.match(page,/people-also-search\.css\?v=1/);
  assert.match(page,/id="peopleAlsoSearchPanel"[\s\S]*?<h2 id="peopleAlsoSearchTitle">People Also Search<\/h2>/,'People Also Search ganha um painel destacado próprio');
  assert.match(page,/<header class="hero"/,'a versão independente do Glimpse mantém cabeçalho e contexto próprios');
  assert.match(page,/<div class="hero-actions"><button class="button finish-button" id="finish"[^>]*>Concluir<\/button><button class="button back-button" id="cancelTop"/,'na Lista de Gerente, Concluir fica no cabeçalho imediatamente antes do retorno sem borda');
  assert.match(page,/<footer class="footer"><button class="button" id="cancel"[^>]*>Cancelar<\/button><\/footer>/,'Cancelar permanece disponível sem duplicar Concluir no rodapé');
  assert.match(glimpsePage,/if\(embedded\)\{document\.documentElement\.classList\.add\('embedded'\);document\.querySelector\('\.hero'\)\?\.classList\.add\('hidden'\)\}/,'o modo incorporado ativa o layout compacto e oculta o cabeçalho duplicado');
  assert.match(glimpsePage,/document\.documentElement\.classList\.add\('embedded'\)/,'o modo incorporado ativa o layout compacto compartilhado');
  assert.match(glimpsePage,/function resizeRawInput\(\)/,'a área colada aumenta de altura conforme o conteúdo');
  assert.match(glimpsePage,/type:'hub-glimpse-resize',height/,'o Glimpse informa ao host a altura completa do conteúdo');
  assert.match(glimpsePage,/addEventListener\('paste',\(\)=>setTimeout\(\(\)=>\{resizeRawInput\(\);analyzeInput\(true\)\},0\)\)/);
  assert.match(glimpsePage,/Análise preparada automaticamente\. Salvando\.\.\./);
  assert.match(glimpsePage,/Domain\.movementValueLabel\(p\.movement\.percent\)/);
  assert.match(glimpsePage,/i\.intent\?\.commercialCount\?\?legacyCommercial/);
  assert.match(glimpsePage,/renderV2Details\(analysis\)/);
  assert.match(glimpsePage,/function renderPeopleAlsoSearch\(section\)/,'a seção de People Also Search é renderizada como painel próprio');
  assert.match(glimpsePage,/detected=Boolean\(section&&section\.state!==\'not_detected\'\)/,'análises sem a seção, inclusive registros legados sem esse campo, não mostram um destaque vazio');
  assert.match(glimpsePage,/items\.map\(item=>`<span class="people-also-search-item">\$\{safe\(item\)\}<\/span>`\)/,'termos do Glimpse aparecem destacados e escapados como texto');
  assert.match(glimpsePage,/renderPeopleAlsoSearch\(p\.peopleAlsoSearch\)/,'o destaque usa os itens extraídos do campo colado');
  assert.match(glimpsePage,/analysis\.signal\.reasons/);
  assert.match(glimpsePage,/Analisador \$\{item\.analyzerVersion\}/,'histórico identifica explicitamente a versão gravada sem recalcular coletas antigas');
  assert.match(glimpsePage,/movementCard\.dataset\.direction=/);
  assert.match(glimpseStyles,/strong\[data-direction="negative"\]\{color:var\(--red\)\}/);
  assert.match(glimpseStyles,/strong\[data-direction="positive"\]\{color:var\(--green\)\}/);
  assert.match(glimpseStyles,/html\.embedded\{overflow-x:hidden;overflow-y:auto\}/,'o componente mantém seu fallback vertical e evita rolagem horizontal; o host acompanha a altura comunicada');
  assert.match(glimpseStyles,/html\.embedded \.input-card\{max-width:920px\}/,'o quadro de colagem incorporado usa largura mais compacta');
  assert.match(glimpseStyles,/\.button\.finish-button\{background:linear-gradient\(135deg,#278de9,#38b9c5\);border-color:transparent;color:#03101c\}/,'Concluir fica azul-claro sem recuperar uma borda decorativa');
  assert.match(glimpseStyles,/overflow-y:hidden;resize:none/,'a área de texto não cria rolagem vertical interna');
  assert.match(glimpseStyles,/html\.embedded \.input-card \.actions,html\.embedded \.footer\{width:min\(100%,720px\)/,'as ações compactas continuam alinhadas dentro do iframe');
  assert.match(styles,/#offerSheet:has\(\[data-panel="glimpse"\]:not\(\.hidden\)\)\{position:absolute;[^}]*overflow:visible\}/,'a ficha Glimpse passa ao fluxo do documento e não mantém rolagem interna');
  assert.match(styles,/body:has\(#offerSheet:not\(\.hidden\) \[data-panel="glimpse"\]:not\(\.hidden\)\)\{overflow:auto!important\}/,'a rolagem da ficha Glimpse fica na janela externa');
  assert.match(peopleAlsoSearchStyles,/\.people-also-search\{border-color:rgba\(90,177,255,\.72\)/,'o painel recebe contraste visual para destacar a informação capturada');
  assert.match(glimpsePage,/async function finishAnalysis\(\)\{if\(draft&&!await saveAnalysis\(draft\)\)return;await goBack\(\)\}/,'Concluir salva um rascunho manual antes de retornar');
  assert.match(glimpsePage,/event\.source!==window\.parent\|\|event\.data\?\.type!==\'hub-glimpse-finish\'/,'o iframe aceita Concluir somente de sua janela pai e da mesma origem');
  assert.match(headerControls,/child\.postMessage\(\{type:\'hub-glimpse-finish\'\},location\.origin\)/,'o cabeçalho envia Concluir ao iframe Glimpse');
  assert.match(headerControls,/finishButton\.hidden\s*=\s*!active/,'Concluir só aparece enquanto o painel Glimpse está ativo');
  assert.match(styles,/\.glimpse-host-finish\{[^}]*background:linear-gradient\(135deg,#278de9,#38b9c5\)!important;color:#03101c!important/,'Concluir mantém o mesmo azul nos cabeçalhos das telas consumidoras');
  assert.match(headerControls,/backButton\.classList\.add\(\'glimpse-host-back\'\)/,'o helper remove apenas o contorno externo do botão de retorno');
  assert.match(styles,/\.glimpse-host-back\{border:0!important;background:transparent!important\}/,'retorno sem borda preserva foco com outline separado');
  assert.match(styles,/\.glimpse-badge:hover,\.glimpse-badge:focus-visible/);
  assert.match(styles,/filter:brightness\(1\.25\)/);
  assert.match(manager,/glimpse-shortcut\.mjs\?v=4" data-origin="manager"/);
  assert.match(top,/glimpse-shortcut\.mjs\?v=4" data-origin="top"/);
  assert.match(shortcut,/Abrir Glimpse/);
  assert.match(shortcut,/origin==='top'\?topContext\(\):managerContext\(\)/);
  assert.match(shortcut,/overviewTab\?\.remove\(\)/,'a aba Resumo da ficha E-commerce GM deve ser removida sem afetar as demais');
  assert.ok(shortcut.includes("!sheet.querySelector('[data-panel=\"overview\"]')?.classList.contains('hidden'))trendsTab.click()"),'a ficha deve abrir em Google Trends quando Resumo não está disponível');
  assert.match(shortcut,/id='topGlimpseTab'/,'E-commerce GM deve incluir Glimpse como aba da ficha');
  assert.match(shortcut,/imagesTab\.before\(button\)/,'a aba Glimpse deve ficar entre Google Trends e Google Imagens');
  assert.match(shortcut,/id='topGlimpseFrame'/,'a tela Glimpse deve abrir dentro da ficha para manter os botões de navegação');
  assert.match(shortcut,/mountGlimpseHeaderAction\(\{frame,panel,backButton:sheet\.querySelector\('#closeSheet'\)\}\)/,'E-commerce GM coloca Concluir no cabeçalho hospedeiro');
  assert.match(shortcut,/hub-glimpse-resize/,'E-commerce GM ajusta a altura do iframe à página Glimpse completa');
  assert.match(shortcut,/event\.source!==frame\.contentWindow/,'a mensagem de redimensionamento só pode vir do iframe Glimpse esperado');
  assert.match(shortcut,/url\.searchParams\.set\('embedded','1'\)/,'o Glimpse embutido deve preservar o contexto da oferta');
  assert.match(hotOffersPage,/embedded:'1'/,'a ficha da Hot Offers MS também declara o modo incorporado e compartilha a remoção do cabeçalho duplicado');
  assert.match(hotOffersPage,/mountGlimpseHeaderAction\(\{frame:document\.querySelector\('#glimpseFrame'\),panel:document\.querySelector\('\[data-panel="glimpse"\]'\),backButton:document\.querySelector\('#closeSheet'\)\}\)/,'Hot Offers MS usa o controle compartilhado no cabeçalho');
  assert.match(hotOffersPage,/hub-glimpse-resize/,'Hot Offers MS também ajusta a altura do iframe Glimpse');
  assert.match(clickbankController,/mountGlimpseHeaderAction/,'Top Offers CB usa o controle compartilhado no cabeçalho');
  assert.match(clickbankController,/event\.source!==frame\.contentWindow/,'Top Offers CB mantém a validação da janela da mensagem');
  assert.match(smartadvController,/mountGlimpseHeaderAction/,'SmartAdv usa o controle compartilhado no cabeçalho');
  assert.match(smartadvController,/event\.source!==frame\.contentWindow/,'SmartAdv mantém a validação da janela da mensagem');
  assert.match(shortcut,/closest\('\[data-open-top-glimpse\]'\)[\s\S]*?event\.preventDefault\(\);event\.stopPropagation\(\)[\s\S]*?row\.click\(\);button\.click\(\)/,'abrir Glimpse pela coluna deve manter a ficha com suas abas e selecionar a aba Glimpse');
  assert.match(glimpsePage,/embedded&&window\.parent!==window/,'a tela embutida deve retornar à ficha, sem navegar para fora');
  assert.match(glimpsePage,/hub-glimpse-close/,'Concluir/Cancelar no Glimpse embutido deve retornar à ficha');
  assert.match(glimpsePage,/clickbank-top-offers/,'Glimpse reconhece a origem Top Offers CB, retorna à tela e registra a análise com essa origem');
  assert.match(glimpsePage,/smartadv-offers/,'Glimpse reconhece a origem SmartAdv, retorna à tela e registra a análise com essa origem');
  assert.match(glimpsePage,/offerKey:params\.get\('offerKey'\)/,'a identidade da oferta ClickBank acompanha o retorno e a observabilidade');
  assert.match(shortcut,/return;trendsTab\.click\(\)\}\);/,'fechar o Glimpse deve retornar à aba Google Trends');
  assert.match(styles,/#offerSheet \.tabs\{position:sticky/,'a navegação deve permanecer visível enquanto o Glimpse é consultado');
  assert.match(styles,/#offerSheet \.glimpse-embedded-frame/,'o painel embutido do Glimpse precisa de layout próprio');
});

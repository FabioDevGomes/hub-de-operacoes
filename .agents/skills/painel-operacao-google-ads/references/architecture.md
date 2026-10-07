# Arquitetura e telas

## Princípios para futuras implementações

O guia [Manutenção gradual do Hub](../../../../docs/maintenance.md#regras-para-novas-implementações) contém as regras normativas, o roteiro para novas telas e o critério de conclusão. Consulte-o antes de alterar a estrutura. Este documento mapeia as fontes atuais; não substitui os contratos de comportamento do domínio.

- Regras puras ficam no domínio; DOM/eventos na view; apresentação no template/CSS; leitura e integração no adaptador; efeitos explícitos nos storages e serviços próprios.
- O painel coordena os módulos existentes, sem recolocar no HTML principal o código já extraído. Reutilize componentes por dados/callbacks, sem importar uma view de outra tela.
- Registro de telas, navegação e menu têm fontes únicas. Schema/abertura do banco compartilhado não incluem transações de negócio nem unificam os bancos pessoais/curadoria.
- Preserve funcionalidades, exports, IDs, chaves, cálculos, zero/ausência e dados existentes. Remoção de recurso ou mudança de regra só por pedido explícito; uma refatoração não autoriza isso.
- Use `src/` como fonte e o build para publicar `dist/`. Testes verificam comportamentos e contratos, não a permanência física de uma função no HTML antigo.

## Padrão visual reutilizável

O guia [Padrão visual reutilizável](visual-style.md) define a referência aprovada para o piloto da Visão Geral: tema escuro, sidebar compacta, cartões e painéis com bordas claras e tabelas densas porém legíveis. Novas telas devem consultar esse guia e reutilizar a linguagem visual, preservando a estrutura adequada a cada domínio, cores semânticas, acessibilidade e comportamento existente. O piloto deve ser revisto visualmente antes de ampliar estilos compartilhados a outras telas.

## Fontes canônicas

- `src/index.template.html`: painel principal, integração das views e interfaces.
- `src/view-registry.js`: IDs estáveis, query, título/subtítulo, IDs de seção/menu e habilitação das telas.
- `src/table-layout.css`: fundo uniforme e hover das linhas de tabelas; carregado pela SPA e páginas de Curadoria e copiado pelo build para `dist/table-layout.css`.
- `src/table-columns.css` e `.mjs`: aparência global do seletor Colunas (Visão Geral/SmartAdv) e componente reutilizável de visibilidade por chave. SmartAdv monta com preferências locais próprias e reaplica após renderizar; o componente não acessa bancos operacionais. Visão Geral conserva sua lógica/IDs e compartilha a folha visual.
- `src/curadoria/curation-list-layout.css`: geometria compartilhada das seis listas independentes de Curadoria; `main.hub-curation-viewport` distribui a altura restante para a tabela em desktop e mantém 8px de respiro inferior. Layout responsivo permanece no fluxo da página; não altera fichas, eventos ou dados. Publicado pelo build da pasta Curadoria.
- `src/curadoria/last-collection.mjs` e `.css`: coluna final Última coleta das seis listas, com renderização/formato compartilhados por dados e timestamps de cada adaptador; não acessa storage. A folha é importada pelo layout de listas. Ver contrato e fontes em `docs/maintenance.md`.
- `src/control-surfaces.css`: superfícies globais reutilizáveis para controles, buscas de listas (`.hub-search-filter`) e filtros de tabelas (`.hub-table-filter`); importada por `theme-colors.css` e copiada pelo build para `dist/control-surfaces.css`.
- `src/month-navigation.css`: padrão global dos navegadores de mês/dia, com setas, valor central e ação para retornar ao período atual; o rótulo varia conforme a granularidade (por exemplo, “Hoje” ou “Mês atual”). Copiado pelo build e compartilhado entre Controle Macro, Faturamento, Controle de gastos e Meu Tempo.
- `src/database.js`: modelo normalizado, importadores MCC/Excel, consolidação e regras de domínio de campanhas.
- `src/storage/hub-database.js` e `.mjs`: nome/versão do IndexedDB, stores/índices aditivos e abertura da conexão, compartilhados pelo painel, Preparador e módulos financeiros. Transações de negócio continuam em seus consumidores.
- `src/preparador-MCC/index.html`: fonte canônica do Preparador; o build publica somente essa página em `dist/preparador-MCC/index.html`, sem copiar arquivos históricos.
- `src/curadoria/`: Radar, Lista de Gerente, E-commerce GM, Hot Offers MS, SmartAdv, Top Offers CB e Glimpse. Hot Offers MS, SmartAdv e Top Offers CB são módulos independentes com parser/domínio, view, adaptador e IndexedDB próprios; apresentação reutilizável usa componentes compartilhados.
- `src/control-macro/`: domínio de agregação do Controle Macro e estilos próprios da tela.
- `src/accounts/`: domínio puro, interface/eventos e CSS do Mapa por Conta. `accountReportSnapshot()` no painel é o adaptador de leitura das projeções existentes; filtros e renderização pertencem ao módulo.
- `src/personal-finance/`: domínio, armazenamento local, sincronização entre abas e interface do Controle de gastos pessoais.
- `src/meu-tempo/`, `src/asset-studio/`: módulos próprios.
- `src/copy-ficha/`: domínio/parser estruturado, template de apresentação, rascunho compatível e workflow de validação→criação. Em **Ficha e Presell**, `Analisar oferta` lê o clipboard somente no clique explícito e encaminha o texto ao parser; se a leitura for bloqueada ou estiver vazia, a colagem manual aparece como fallback. `src/presell/presell-service.mjs` é o limite da API/confirmação; `presell-report.mjs` apresenta relatórios sem acesso ao servidor.
- `dist/index.html` e a maioria de `dist/**`: saída gerada. Edite fontes e rode o build.

## Registro de telas

Uma view principal deve ser registrada em `src/view-registry.js`; mantenha `id`, `query`, `enabled`, `activeView`, IDs de seção/menu, título e subtítulo no registro. Renderizadores obtêm metadados por `PanelViews.definition()`, resolvem entrada por `resolveRoute()` e criam links por `urlFor()`. Não replique esses dados manualmente na navegação se o registro puder fornecê-los. Rotas desconhecidas voltam para Visão Geral.

O registro não é lugar para estado de filtros, dados de domínio, consultas IndexedDB, funções de renderização ou regras de negócio.

O piloto de separação do Mapa por Conta está documentado em `docs/maintenance.md` na raiz. Não adicione novamente wrappers de renderização/listeners dessa tela ao HTML principal; use `src/accounts/accounts-view.mjs`. A consolidação financeira existente e a barra de rolagem compartilhada com CPA continuam no adaptador do painel, sem alteração de persistência.

## Rotas centrais atuais

- `/`: Visão Geral / Diário de campanha (seleção de uma campanha por vez).
- `/?view=tested`: Produtos Testados.
- `/?view=cpa`: Análise por Faixa de CPA.
- `/?view=accounts`: Mapa de Produtos por Conta.
- `/?view=macro`: Controle Macro, com resumo diário da operação.
- `/?view=observability`: Observabilidade Decisória Operacional.
- `/?view=curation-observability`: Observabilidade da Curadoria (domínio pré-teste, separado da operação).
- `/?view=time`: Meu Tempo.
- `/?view=personal-finance`: Controle de gastos pessoais (skill dedicada `../../controle-gastos-pessoal/SKILL.md`).
- `/?view=copy`: Ficha e Presell; análise da oferta, conteúdo estruturado obrigatório e criação local da Presell. Também gera perguntas/respostas editáveis por ação independente, com cópia do quadro. Não gera copy de anúncios nem download JSON.
- `/?view=presell`: alias compatível para Ficha e Presell, com o mesmo item ativo `copyFichaNav`.
- `/preparador-MCC/`: Preparador MCC.
- `/curadoria/`, `/curadoria/gerentes/`, `/curadoria/top-performance/`, `/curadoria/hot-offers-ms/`, `/curadoria/clickbank-top-offers/`, `/curadoria/smartadv-offers/`, `/curadoria/glimpse/`: módulos de curadoria.
- `/asset-studio/`: preparação local de assets.

### ROI mínimo e limite de teste da Visão Geral

O ROI histórico no lançamento de uma venda é distinto do ROI mínimo de teste. A projeção pura fica em `src/overview/sale-roi-domain.js`; o adaptador `saveProvisionalSale` guarda a fotografia junto da venda antes de `persistLocalBase`. `overviewSnapshot` e `productDiarySnapshot` fornecem o histórico de vendas por ID estável às views. A tabela mostra primeira/segunda venda manual; o Diário tem um quadro separado com todas as fotografias, inclusive vendas conciliadas. As views não recalculam nem persistem esses ROIs. Ver [contrato de dados](data-model.md#roi-no-momento-do-registro-de-venda-manual).

O seletor **Colunas** pertence a `src/overview/view.js`; definições, larguras por chave e filtragem ficam em `OverviewDomain`. A seleção de colunas é preferência local de apresentação e preserva a coluna Campanha, os três períodos, filtros e navegação. Estilos usam `data-column`, não a posição visível, para manter alinhamento/larguras depois de ocultar colunas.

O redimensionamento manual da Visão Geral fica também na view e no CSS local: separador de cabeçalho com Pointer Events/captura e setas de teclado, pixels por chave em `localStorage` (`hub:overview:column-widths:v1`). Salva somente no fim do gesto; limites/fallback protegem preferências inválidas ou storage bloqueado. Não há reset de larguras nem efeitos nos bancos; o reset de Colunas continua exclusivo da visibilidade. Ver contrato e regressão em `docs/maintenance.md` > Visão Geral e Diário.

`OverviewDomain.deriveTestBudget()` calcula o limite usando a receita confirmada da campanha (ou comissão por venda multiplicada pelas vendas, quando necessário). O link do texto de ROI mínimo abre um diálogo que sincroniza **Valor máximo do limite de teste** e **ROI mínimo do limite de teste** com essa mesma receita. Digitar o ROI recalcula o limite; digitar o limite recalcula o ROI. `OK` persiste somente `campanhas[].roi_minimo_pct` na base atual; não há store/schema adicional. Valores negativos são válidos desde que maiores que −100%, mantendo limite finito e não negativo. A tabela continua exibindo os mesmos rótulos de valor, ROI mínimo e quantidade de vendas.

O lembrete global do item `item-agua` é baseado nos lançamentos de Meu Tempo, não nos gastos. `src/meu-tempo/water-reminder.mjs` salva somente os horários locais e é iniciado pelo componente compartilhado de navegação; seus avisos recorrentes respeitam a janela de 8h a 20h e apontam para `/?view=time`. O link **Abrir Meu Tempo** centraliza verticalmente o rótulo e usa espaçamento vertical reduzido em 20%; siga também o padrão global de alinhamento e validação dos botões em `docs/maintenance.md`.

As listas da Lista de Gerente, E-commerce GM e Hot Offers MS usam `src/curadoria/list-focus.mjs` para registrar em `sessionStorage` a rolagem da página e do contêiner `.tablewrap`, a identidade da linha e a coluna acionada (Glimpse, Trends, Imagens ou Decisão). Ao voltar do Glimpse, fechar as fichas ou atualizar a lista após uma decisão, a página restaura as posições e anima a linha e o controle acionado com três pulsos azuis sutis. O estado é temporário por aba e expira após 30 minutos.

### Botão de decisão de curadoria

As listas que exibem decisão usam `src/curadoria/decision-ui.mjs` para o badge e `src/curadoria/trends-sheet.css` para sua apresentação. O padrão visual é o da E-commerce GM: pílula compacta, fundo escuro neutro, borda discreta e texto sem negrito forte; as cores semânticas existentes para “Subir campanha”, “Campanha no ar”, “Revisar” e “Ocultar” permanecem. A marcação de linha também segue a E-commerce GM: a mesma decisão sempre produz o mesmo fundo e estado de hover em todas as listas — “Subir campanha” em dourado discreto e “Campanha no ar” em verde; decisões sem destaque de linha permanecem neutras. Sinal automático e movimento não definem essa cor. As linhas devem usar `DecisionUI.rowClass()` e o CSS compartilhado, sem sobrescrever as cores por tela. Ao adicionar o botão ou a marcação a outra lista, reutilize o mesmo renderizador e folha; revise todos os consumidores existentes: Lista de Gerente, E-commerce GM e Hot Offers MS.

### Google Trends nas fichas de Curadoria

Na Hot Offers MS, o `×` das candidatas positivas de Google Trends persiste a lista atualizada e sincroniza o estado da view antes de redesenhar a ficha, para que a palavra removida desapareça imediatamente. Essa edição mantém o armazenamento da Hot Offers MS separado dos demais consumidores do componente compartilhado.

E-commerce GM (`src/curadoria/top-performance/`) é a referência visual. As fichas que usam a experiência completa devem compartilhar a estrutura compacta de pesquisa e candidatas, chips de países, inclusão manual, momento do produto, resultado e histórico, usando `src/curadoria/trends-sheet.css`, `trends-ui.mjs` e `keyword-candidates-ui.mjs`. Hot Offers MS segue o mesmo desenho e mantém sua ação própria **Abrir oferta na plataforma**, os países oriundos da captura separados dos manuais e seu fluxo de gravação/ficha aberta. O CSS compartilhado da ficha (`#offerSheet`) prevalece sobre estilos locais genéricos de cada página.

Nas fichas de oferta da E-commerce GM e Hot Offers MS, apresente a navegação como um grupo de abas dentro de uma única moldura arredondada: aba ativa preenchida, abas inativas sem bordas próprias e sem linha/divisor entre elas. Em telas estreitas, preserve uma única linha com rolagem horizontal. As chaves e a ordem de abas específicas de cada tela continuam próprias; apenas a apresentação é compartilhada. A área interna de ambas tem largura máxima de `1280px`, centralizada, com padding de `24px`; o cabeçalho da oferta usa título branco de `1.2rem` e eyebrow verde `#42e7c0` de `.72rem`, peso normal, line-height normal e letter-spacing `.14em`.

Antes de alterar Google Trends no E-commerce GM ou em componentes/estilos compartilhados, verifique todos os consumidores: E-commerce GM, Lista de Gerente, Hot Offers MS e Radar SpyHero. Compare função, layout, contexto de busca, fonte e persistência. Propague uma mudança somente onde os contratos correspondam; diferenças de plataforma ou fluxo devem continuar locais e ser registradas, sem unificar bancos. Veja `docs/maintenance.md` para a checklist e os testes obrigatórios.

### Hot Offers MS

`src/curadoria/hot-offers-ms/` implementa a captura periódica da lista tabular copiada do site Hot Offers MS. `hot-offers-ms-domain.mjs` interpreta o cabeçalho com os dois campos chamados “Países”, mantém a coluna de aprovação de afiliação separada dos países e trata o texto `+N More` apenas como uma contagem parcial. Título original, rótulo HOT, tags/CTC, preço bruto, categoria e ações de pré-visualização são preservados. A moeda do símbolo `$` não é presumida.

Cada coleta exige um escopo explícito (Fundo quente ou Topo quente) e confirmação humana de que a colagem está completa: a origem não oferece um total verificável. Só após a confirmação a tela salva snapshots e compara posições, entradas, retornos, mudanças de campo e saídas, dentro do mesmo escopo; IDs iguais em escopos diferentes permanecem ofertas distintas (`scope:offerId`). Não use uma colagem parcial para inferir que ofertas saíram.

O módulo persiste em IndexedDB isolado `radar-hot-offers-ms`; decisões, Trends, Imagens e coleções não alteram `radar-top-performance`. Tendências e Imagens usam os domínios e renderizadores compartilhados, com candidatas de busca positivas no Trends e países manuais separados dos países extraídos da fonte. A aba Google Trends monta também um link para `https://admin.mediascalers.com/offers/[Offer ID]` a partir do ID numérico validado da oferta, sem inferir URLs durante a coleta. Glimpse continua compartilhando a identidade normalizada do produto em `radar-glimpse`; origem, Offer ID e funil são encaminhados para retorno à tela e observabilidade. Na aba Glimpse da ficha, a análise é apresentada diretamente no iframe, sem cartão/introdutório extra, e a largura e o recuo internos seguem a ficha de E-commerce GM; as outras abas mantêm seu layout próprio. A view não grava dados; importações, decisão, avaliações e inclusão de país manual só persistem após ação explícita. A captura não assume URLs nem conteúdo de prévia que o texto copiado não fornece.

### Top Offers CB

Na ficha de oferta, a barra sticky acompanha a rolagem, ocupa a largura do conteúdo e mantém abas, um único botão `Salvar` e `Voltar à lista` em todas as abas. O significado do salvamento segue o contexto: Trends grava explicitamente a avaliação; Glimpse usa o botão compartilhado para concluir/salvar no iframe e mostra feedback após sucesso; Imagens já persiste cada classificação/candidata por ação e deixa Salvar desativado com explicação; Histórico é somente leitura e também deixa Salvar desativado. A seleção pendente de Trends permanece disponível em caso de falha. O retorno de Imagens não é duplicado dentro do painel. O contrato global reutilizável e sua referência para pedidos futuros de “aplicar o cenário global” ficam em `docs/curation-analysis-pattern.md` e `references/visual-style.md`.

O botão existente **Capturar produtos ClickBank** da extensão também abre/preenche o diálogo de importação e valida sua prévia, sem salvar. `extensions/mcc-d0-bridge/clickbank-forward.mjs` envia o envelope apenas à rota local `/curadoria/clickbank-top-offers/`; `extension-capture.mjs` valida schema/contagem/paginação/timestamp, aguarda a leitura inicial e preserva qualquer rascunho existente. O page chama `view.prepareImport()` e o parser/comparador existentes; somente **Salvar captura** persiste, usando o horário da coleta. Não modifica MCC, VSL, schema ou identidades. A extensão 1.2.11 exige reload manual e acesso exclusivamente à rota local adicional.

`src/curadoria/clickbank-top-offers/` mantém a captura ClickBank separada das demais origens e reutiliza os componentes compartilhados de Google Trends, candidatas e Imagens. A tabela tem atalhos compactos para Google Trends, Glimpse e Imagens; cada um abre a ficha na aba correspondente. Trends mantém candidatas positivas pesquisáveis/removíveis e histórico de avaliações; Imagens usa avaliação manual por país, candidatas negativas com Enter e `×` sempre visível, pesquisa coletiva com exclusões e histórico. Glimpse permanece em `radar-glimpse` sob a chave de produto normalizada e reconhece o retorno/observabilidade `clickbank-top-offers`. Na aba Glimpse, o controle do cabeçalho diz `Salvar`; após persistência bem-sucedida a ficha fica aberta e mostra a confirmação verde `Salvo` antes do botão, preservando a posição deste. `Voltar à lista` permanece explícito e falhas de armazenamento não confirmam sucesso.

Após receber `hub-glimpse-save-result` com `saved: true` do iframe validado, o host recarrega o snapshot Glimpse usado pela tabela, mantendo a ficha aberta para que o badge da mesma oferta mostre o resultado recém-salvo.

O texto do ClickBank não declara países nem Offer ID: nunca inferir GEO nem construir URL de oferta da plataforma. Países são acrescentados explicitamente na ficha e ficam em `offerMetadata.manualCountries`, separados da captura. As avaliações/países usam o banco isolado `radar-clickbank-top-offers`; adicionar os stores à versão 2 é uma migração estritamente aditiva, preservando capturas da versão 1. Backup v2 contém capturas, países manuais, Trends e Imagens; a restauração aceita backups v1 e mescla por chave, preservando conflitos locais.

`src/curadoria/keyword-candidates-ui.mjs` é o componente de apresentação compartilhado para listas de candidatas e seus botões de pesquisa/remoção. Ele recebe callbacks e contexto; cada tela continua responsável por persistir no domínio correspondente e montar a URL da plataforma. Lista de Gerente e E-commerce GM o usam tanto para candidatas positivas do Google Trends quanto para negativas do Google Imagens: no Trends, cada candidata tem busca individual; em Imagens, as candidatas não têm botões individuais e um único botão coletivo fica à direita da lista, excluindo todos os termos registrados naquele produto/país. `imageSearchUrlExcluding` aceita um termo ou uma lista, adiciona `-palavra` (ou `-"frase com espaços"`) para cada negativa e preserva país/idioma do cartão; a busca normal de imagens permanece sem exclusão. Nas telas de Google Imagens da Lista de Gerente, E-commerce GM e Hot Offers MS, Enter em uma candidata e sua remoção salvam imediatamente uma nova avaliação com o resultado visual atual e a lista completa, preservando as entradas anteriores no histórico. E-commerce GM e Hot Offers MS deixam o `×` de remoção visível nas candidatas já salvas, inclusive ao reabrir a ficha; a remoção não depende de um modo **Editar**. A Lista de Gerente mantém a remoção escondida nas candidatas salvas e **Adicionar/Editar** abre seu editor compacto. E-commerce GM e Hot Offers MS mantêm o campo de inclusão sempre visível. Os botões Adicionar, Salvar candidatas e Cancelar junto ao campo não são necessários; sem classificação visual, a UI deve pedir que o usuário selecione um resultado antes de gravar, sem inventar status. Radar SpyHero usa somente o fluxo de Trends, com `trendsKeywordCandidates` no registro do sinal, sem criar avaliações ou entradas no histórico de Trends. Ao incluir outra tela, reutilize o renderizador e mantenha separado o armazenamento e o contexto de busca.

No E-commerce GM, países incluídos manualmente na ficha de Google Trends são persistidos em `offers.manualCountries`, separados de `countriesVisible` vindos da coleta GuruMedia. `Domain.offerCountryCodes()` combina e deduplica as duas listas para os chips de Trends e para gerar uma seção por país em Google Imagens; países manuais são identificados visualmente. `mergeOffer()` preserva `manualCountries` em coletas futuras, enquanto snapshots continuam registrando apenas os países obtidos da fonte. Não grave países manuais como se fizessem parte da coleta original.

O badge de progresso da coluna Imagens e sua ordenação usam a mesma lista combinada de países. Portanto, incluir um país manualmente aumenta o total de validações esperadas; se houver uma avaliação de Imagens salva para esse código, ela também conta como verificada. Ao modificar esse progresso, atualize a apresentação e a ordenação em conjunto.

Nas colunas Imagens da E-commerce GM e Hot Offers MS, mantenha o rótulo numérico compacto (concluídas de esperadas), sem “verificado(s)”. Se a avaliação mais recente de qualquer país guardar candidatas negativas, acrescente · ! com KeywordCandidatesUI.keywordCandidateMarkerHtml(..., 'negative'); esse marcador expressa apenas presença e conserva a cor/semântica acessível negativa. Novas telas que exibirem candidatas negativas na listagem devem reutilizar esse componente sem compartilhar a persistência própria da tela.

Nas fichas Google Imagens da Lista de Gerente e E-commerce GM, selecionar `Mista` salva imediatamente a avaliação, mesmo sem candidatas negativas. O editor de candidatas é opcional; se a pessoa as preencher depois, a avaliação atualizada é salva com elas. Ao persistir após ações assíncronas, capture a chave do produto/oferta antes do `await`, pois a ficha pode ser fechada durante a gravação.

## Grupos do menu lateral

O menu lateral das telas principais e dos módulos independentes usa o componente comum `src/sidebar-component.js` e seus estilos `src/sidebar-component.css`. O build publica esses arquivos na raiz de `dist/`. Cada tela mantém somente um mount com `data-hub-sidebar` e um mount `data-hub-sidebar-products`, configurando o modo SPA ou a chave ativa da página; rótulos, grupos, links, acordeão, estado aberto compartilhado e animação ficam centralizados. Na SPA, IDs de navegação vêm de `src/view-registry.js`; o mount de Produtos oferece somente Produtos Testados. A seleção de campanha para o Diário pertence à tabela da Visão Geral, incluindo seu filtro Histórico. Glimpse é exceção intencional: é uma janela transitória focada e permanece sem menu.

Ao criar/alterar uma entrada, edite a configuração em `src/sidebar-component.js` (e registre views da SPA em `src/view-registry.js`), sem copiar rótulos, destinos ou lógica do acordeão para cada HTML. Para validar, rode `tests/sidebar-component.test.mjs`, `tests/sidebar-layout.test.mjs`, `tests/build.test.mjs` e a suíte completa; confira visualmente a Visão Geral, Preparador MCC, Lista de Gerente, E-commerce GM, Radar e Asset Studio, incluindo estado ativo e expansão do grupo.

- Operação: Visão geral, Preparador MCC e Produtos Testados, como item direto após Preparador MCC.
- Análises: CPA, Mapa por Conta, Observabilidade Decisória e Observabilidade da Curadoria.
- Financeiro: Controle Macro e Faturamento.
- Curadoria: Radar SpyHero, Lista de Gerente, E-commerce GM e Hot Offers MS.
- Criação de ofertas: Asset Studio e Ficha e Presell, nessa ordem.
- Pessoal: Meu Tempo e Controle de gastos pessoais.
- Não há seção expansível Produtos: Produtos Testados usa o mesmo nível dos outros itens de Operação, preservando `testedProductsNav` e `/?view=tested`. O Diário de campanha é acessado por duplo clique na tabela da Visão Geral; o filtro Histórico preserva os acessos às campanhas pausadas, abas antigas e resumos Totais. Chamadas antigas `setOpenGroup('products')` continuam abrindo Operação.

### Produtos e campanhas no diário

O editor por linha fica em `src/product-diary/view.js` e usa o CSS global `src/table-edit-actions.css` (também adotado pelo Editar da Visão Geral). `observation-domain.js` valida e projeta as anotações por ID estável/data; `observation-storage.js` grava apenas a alteração aditiva na base mais recente em uma transação. O adaptador fornece snapshots/callbacks, sem duplicar os listeners. Notas manuais não reescrevem Q, status, métricas nem linhas virtuais. Ver [contrato de edição](../../../../docs/maintenance.md#edição-de-observações-do-diário-de-campanha).

O acesso pela Visão Geral preserva nome completo, fonte e ID estável. `OverviewDomain.historyNavigationRows()` apresenta os acessos históricos antes exclusivos do menu, sem duplicar diários operacionais nem criar métricas MCC. Resumos Totais mantêm o acesso `legacy` separado, inclusive quando associados a campanhas nativas. Seus atalhos não alteram KPIs nem contagens operacionais; métricas permanecem no resumo aberto. O contrato e os testes ficam em [Manutenção — acesso ao Diário](../../../../docs/maintenance.md#ajustes-de-teste-e-alerta-da-visão-geral).

O Diário de campanha é campanha-cêntrico: cada seleção mostra somente as linhas diárias e métricas daquela campanha. Um mesmo produto pode reunir várias campanhas relacionadas; mantenha-as como campanhas distintas, com identidades e históricos próprios. Produtos Testados é a visão agregada por produto e lista as campanhas relacionadas, enquanto o Diário de campanha abre cada uma individualmente. Não some nem funda diários de campanhas automaticamente. No desktop, o painel do Diário usa o espaço restante do primeiro viewport e mantém a rolagem vertical na área da tabela; em larguras responsivas, permanece no fluxo normal da página.

### Migração histórica única da aba `totais`

`src/legacy-totais-migration.mjs` conserva o planejador puro e os relatórios de uma migração versionada (`legacy_totais_migration.version = 1`) para `bases/atual`. Cargas privadas permanecem em `data-local/`, ignoradas pelo Git: o build não as copia e a página não as busca automaticamente. O runtime preserva resumos/relatórios já persistidos, inclusive os associados a campanhas nativas. Campanhas legadas mantêm `status: 'historico'`, `registro_origem: 'legacy_totais'`, identidade e resumo consolidado; nenhuma linha diária é inventada. Bases e backups locais são a fonte persistente. `scripts/distribution-privacy.mjs` limita os arquivos publicados e isola cópias privadas antigas fora de `dist/`.

O Controle Macro é uma tela principal registrada no `src/view-registry.js`. Sua lógica pura fica em `src/control-macro/domain.js`; a interface, os eventos e os gráficos ficam em `src/control-macro/view.js`, com apresentação em `template.html` e `control-macro.css`. O painel mantém os adaptadores de leitura, sincronização e importação/persistência em `src/index.template.html`. A tela navega por meses completos (anterior, posterior e mês atual), abre sempre no mês atual e conserva a navegação manual enquanto permanece aberta. As alterações MCC recalculam as métricas agregadas ao salvar/recarregar a base. O Preparador MCC também publica `base-updated` pelo `BroadcastChannel('painel-campanhas')`, fazendo a tela aberta restaurar a base e recalcular sem nova importação do histórico. O arquivo histórico importado fica como `controle_macro_historico` na base existente, sem nova store ou migração de IndexedDB. A planilha prevalece campo a campo: MCC/D−1 só complementa cliques e vendas ausentes desde 13/09/2026; não substitui investimento, faturamento ou zeros explícitos. Consulte `references/data-model.md` para a regra integral e o tratamento de suspensões e vendas.

Para as próximas atualizações diárias, a política operacional é usar somente MCC D0/D−1, sem nova importação da planilha. O histórico legado permanece. Isso não modifica a precedência existente em datas sobrepostas; veja `references/data-model.md` antes de afirmar que MCC substituiu um valor histórico.

O Controle Macro também apresenta uma evolução com dois escopos: diário do mês selecionado e consolidado mensal desde abril de 2026. `src/control-macro/domain.js` expõe `dailyTrendBuckets()` e `monthlyTrendBuckets()` para preparar séries sem converter dados ausentes em zero; agregados incluem cobertura observada. O ROI mensal deve ser ponderado pela soma de faturamento menos investimento nos dias pareados, dividida pelo investimento pareado, e não por média de percentuais diários. A interface mantém Financeiro, ROI, Cliques e Vendas em visualizações próprias e inclui Desempenho, que agrupa ROI, cliques e vendas num único painel com três faixas alinhadas no mesmo eixo de tempo e escala independente por métrica; o tooltip de vendas informa totais oficiais e provisórios. Preserve lacunas por falta de dados e a cobertura dos pontos nos tooltips. `tests/control-macro.test.mjs` valida os agregados; `tests/build.test.mjs` verifica controles e integração da visualização.

## Observabilidade da Curadoria (pré-teste)

`src/curadoria/curation-observability-domain.mjs`, `curation-observability-storage.mjs`, `curation-observability.mjs` e `curation-observability-view.mjs` implementam uma view principal registrada como `curation-observability`. A pergunta deste domínio é “o que eu sabia sobre este produto antes do teste?”; não acrescente esses eventos ao Event Log operacional. A store usa o banco independente `radar-curadoria-observability`; decisões “Subir campanha” geram `snapshot_decisao` imutável e uma correlação inicialmente pendente. Snapshot de início de teste ainda não existe no MVP.

Trends, Imagens, Glimpse e decisão são capturados após o salvamento original, de forma assíncrona e idempotente. Para performance, não abra a base de Observabilidade ao carregar as listas de curadoria; o banco é aberto na primeira gravação ou ao acessar a view. Grave somente o novo evento/detalhe. Snapshot mantém projeção compacta do sinal atual; Glimpse aponta para sua análise existente e eventos detalhados são lidos por chave só ao expandir. A lista consulta páginas de 30 itens por índice, com limite de 600 posições por página/filtro; o estado aberto de uma linha não carrega ao navegar para outra página. Exportação integral só ocorre quando o usuário solicita backup e a restauração é merge-only.

Correlação por nome é sugestão, não confirmação. A busca do Event Log operacional é sob demanda; exija confirmação humana do `product_id` e registre cada confirmação, correção ou invalidação em `correlations`, sem editar os dois históricos. Ver [modelo e persistência](data-model.md) e [workflow de testes](engineering-workflow.md) para stores, índices e validação.

Em Meu Tempo (`src/meu-tempo/`), a aba Histórico inicia com 13 dias inclusivos até a data atual. Na comparação, a coluna Média calcula também os tempos produtivo e total incluindo dias sem registros como zero. O quadro “Tempo trabalhado” nos últimos 7 dias soma somente lançamentos de duração na categoria Trabalho e usa o snapshot da categoria do lançamento; se não existir, recorre à categoria atual do item. O quadro “Tempo produtivo” no mesmo período soma os lançamentos de duração de qualquer categoria cujo `productiveSnapshot` esteja marcado como verdadeiro. Na comparação e no detalhamento do Histórico, itens de tipo booleano exibem `1` como “Sim” e `0` como “Não”; valores ausentes permanecem como “—”, sem serem tratados como zero. As tabelas da aba não devem ter limite de altura nem rolagem vertical interna: a tabela cresce com o conteúdo, mantém apenas rolagem horizontal quando necessária e a rolagem vertical fica na página.

No Diário, o KPI “Tempo até começar a trabalhar” soma, para a data selecionada, apenas lançamentos de duração dos IDs `item-cama-acordar`, `item-preparo-levantar`, `item-cafe` e `item-kakashi`. Conta a duração completa de Kakashi; não aplica sua fração de produtividade. O item `item-dormindo` e demais atividades ficam excluídos. O cálculo é derivado dos lançamentos existentes e não grava nem migra dados.

O botão e o fluxo de importação de Excel foram removidos de Meu Tempo. O banco não carrega nem grava novos metadados de importação. Lançamentos/metadados Excel existentes são preservados; os lançamentos legados mantêm sua origem, não são elegíveis a “Desfazer último” e ficam fora do quadro “Histórico de lançamentos do dia”, pois `createdAt` representa a importação, não o horário original. A store antiga de importações, se já existir no IndexedDB, não é lida nem apagada.

O Diário também mostra o quadro “Histórico de lançamentos do dia” para a data selecionada: lançamentos manuais de duração e registros numéricos de Água, do mais recente para o mais antigo, com atividade, duração/volume e hora local de `createdAt`. O quadro é somente de leitura e não altera o armazenamento.

Na aba Configurar, a edição de itens e atividades usa um diálogo nativo integrado à página, em vez de caixas `prompt`/`confirm` do navegador. O formulário edita nome, categoria, tipo, ordem, produtividade, exibição nas análises, tipo de gráfico e agregação; a regra fixa de 10% do Kakashi é informativa e permanece controlada pelo domínio. Salvar continua chamando `Storage.saveItem`, preserva IDs e snapshots dos lançamentos antigos e altera a configuração apenas após confirmação explícita no formulário.

Na comparação do Histórico, bebida alcoólica, refrigerante (`item-refrigerante`) e Verde 16:20 (`item-verde-horario`) recebem destaque vermelho suave somente na célula da atividade/data quando o valor é “Sim”. O cabeçalho da data continua sendo destacado exclusivamente por bebida alcoólica.

## Build e servidor

O padrão tipográfico dos cabeçalhos das tabelas fica centralizado em `src/table-headers.css`, copiado para a raiz de `dist/` pelo build. A SPA principal e páginas independentes carregam essa folha global; as telas de curadoria a incluem pela folha compartilhada `src/curadoria/trends-sheet.css`. Novas páginas com tabelas devem carregar/reutilizar o estilo compartilhado em vez de recriar uppercase ou negrito localmente.

Na raiz, `node build.mjs` gera o painel. O uso operacional é `iniciar-painel.cmd`, servido em `http://127.0.0.1:8765/`. Não selecione outra porta automaticamente: o IndexedDB é isolado por origem. O build padrão deve continuar sem manifesto operacional real.

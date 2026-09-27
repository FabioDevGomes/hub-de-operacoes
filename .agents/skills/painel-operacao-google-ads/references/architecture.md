# Arquitetura e telas

## Fontes canônicas

- `src/index.template.html`: painel principal, integração das views e interfaces.
- `src/view-registry.js`: IDs estáveis, query, título/subtítulo, IDs de seção/menu e habilitação das telas.
- `src/database.js`: schema compartilhado, importadores MCC/Excel, consolidação e persistência de domínio.
- `dist/preparador-MCC/index.html`: atualmente é a fonte editável do Preparador; o build não o gera.
- `src/curadoria/`: Radar, Lista de Gerente, E-commerce GM e Glimpse.
- `src/control-macro/`: domínio de agregação do Controle Macro e estilos próprios da tela.
- `src/personal-finance/`: domínio, armazenamento local, sincronização entre abas e interface do Controle de gastos pessoais.
- `src/meu-tempo/`, `src/presell/`, `src/asset-studio/`: módulos próprios.
- `dist/index.html` e a maioria de `dist/**`: saída gerada. Edite fontes e rode o build.

## Registro de telas

Uma view principal deve ser registrada em `src/view-registry.js`; mantenha `id`, `query`, `enabled`, `activeView`, IDs de seção/menu, título e subtítulo no registro. Renderizadores obtêm metadados por `PanelViews.definition()`, resolvem entrada por `resolveRoute()` e criam links por `urlFor()`. Não replique esses dados manualmente na navegação se o registro puder fornecê-los. Rotas desconhecidas voltam para Visão Geral.

O registro não é lugar para estado de filtros, dados de domínio, consultas IndexedDB, funções de renderização ou regras de negócio.

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
- `/?view=copy`: Copy e Ficha.
- `/?view=presell`: Gerador de Pre-Sell.
- `/preparador-MCC/`: Preparador MCC.
- `/curadoria/`, `/curadoria/gerentes/`, `/curadoria/top-performance/`, `/curadoria/glimpse/`: módulos de curadoria.
- `/asset-studio/`: preparação local de assets.

O lembrete global do item `item-agua` é baseado nos lançamentos de Meu Tempo, não nos gastos. `src/meu-tempo/water-reminder.mjs` salva somente os horários locais e é iniciado pelo componente compartilhado de navegação; seus avisos recorrentes respeitam a janela de 8h a 20h e apontam para `/?view=time`.

As listas da Lista de Gerente e de E-commerce GM usam `src/curadoria/list-focus.mjs` para registrar em `sessionStorage` a rolagem da página e do contêiner `.tablewrap`, a identidade da linha e a coluna acionada (Glimpse, Trends, Imagens ou Decisão). Ao voltar do Glimpse, fechar as fichas ou atualizar a lista após uma decisão, a página restaura as posições e anima a linha e o controle acionado com três pulsos azuis sutis. O estado é temporário por aba e expira após 30 minutos.

`src/curadoria/keyword-candidates-ui.mjs` é o componente de apresentação compartilhado para listas de candidatas e seus botões de pesquisa/remoção. Ele recebe callbacks e contexto; cada tela continua responsável por persistir no domínio correspondente e montar a URL da plataforma. Lista de Gerente e E-commerce GM o usam tanto para candidatas positivas do Google Trends quanto para negativas do Google Imagens: no Trends, cada candidata tem busca individual; em Imagens, as candidatas não têm botões individuais e um único botão coletivo fica à direita da lista, excluindo todos os termos registrados naquele produto/país. `imageSearchUrlExcluding` aceita um termo ou uma lista, adiciona `-palavra` (ou `-"frase com espaços"`) para cada negativa e preserva país/idioma do cartão; a busca normal de imagens permanece sem exclusão. Radar SpyHero usa somente o fluxo de Trends, com `trendsKeywordCandidates` no registro do sinal, sem criar avaliações ou entradas no histórico de Trends. Ao incluir outra tela, reutilize o renderizador e mantenha separado o armazenamento e o contexto de busca.

No E-commerce GM, países incluídos manualmente na ficha de Google Trends são persistidos em `offers.manualCountries`, separados de `countriesVisible` vindos da coleta GuruMedia. `Domain.offerCountryCodes()` combina e deduplica as duas listas para os chips de Trends e para gerar uma seção por país em Google Imagens; países manuais são identificados visualmente. `mergeOffer()` preserva `manualCountries` em coletas futuras, enquanto snapshots continuam registrando apenas os países obtidos da fonte. Não grave países manuais como se fizessem parte da coleta original.

O badge de progresso da coluna Imagens e sua ordenação usam a mesma lista combinada de países. Portanto, incluir um país manualmente aumenta o total de validações esperadas; se houver uma avaliação de Imagens salva para esse código, ela também conta como verificada. Ao modificar esse progresso, atualize a apresentação e a ordenação em conjunto.

Nas fichas Google Imagens da Lista de Gerente e E-commerce GM, selecionar `Mista` salva imediatamente a avaliação, mesmo sem candidatas negativas. O editor de candidatas é opcional; se a pessoa as preencher depois, a avaliação atualizada é salva com elas. Ao persistir após ações assíncronas, capture a chave do produto/oferta antes do `await`, pois a ficha pode ser fechada durante a gravação.

## Grupos do menu lateral

O menu lateral das telas principais e dos módulos independentes usa o componente comum `src/sidebar-component.js` e seus estilos `src/sidebar-component.css`. O build publica esses arquivos na raiz de `dist/`. Cada tela mantém somente um mount com `data-hub-sidebar` e um mount `data-hub-sidebar-products`, configurando o modo SPA ou a chave ativa da página; rótulos, grupos, links, acordeão, estado aberto compartilhado e animação ficam centralizados. Na SPA, IDs de navegação vêm de `src/view-registry.js`; os controles/lista dinâmica de campanhas do Diário continuam no mount de Produtos e preservam seus IDs existentes. Glimpse é exceção intencional: é uma janela transitória focada e permanece sem menu.

Ao criar/alterar uma entrada, edite a configuração em `src/sidebar-component.js` (e registre views da SPA em `src/view-registry.js`), sem copiar rótulos, destinos ou lógica do acordeão para cada HTML. Para validar, rode `tests/sidebar-component.test.mjs`, `tests/sidebar-layout.test.mjs`, `tests/build.test.mjs` e a suíte completa; confira visualmente a Visão Geral, Preparador MCC, Lista de Gerente, E-commerce GM, Radar e Asset Studio, incluindo estado ativo e expansão do grupo.

- Operação: Visão geral e Preparador MCC.
- Financeiro: Controle Macro e Faturamento.
- Análises: CPA, Mapa por Conta, Observabilidade Decisória e Observabilidade da Curadoria.
- Curadoria: Radar SpyHero, Lista de Gerente e E-commerce GM.
- Criação de ofertas: Copy e Ficha, Gerador de Pre-Sell e Asset Studio.
- Pessoal: Meu Tempo e Controle de gastos pessoais.
- Produtos: Produtos Testados e acesso ao Diário de campanha; a lista de campanhas permanece no painel principal.

### Produtos e campanhas no diário

O Diário de campanha é campanha-cêntrico: cada seleção mostra somente as linhas diárias e métricas daquela campanha. Um mesmo produto pode reunir várias campanhas relacionadas; mantenha-as como campanhas distintas, com identidades e históricos próprios. Produtos Testados é a visão agregada por produto e lista as campanhas relacionadas, enquanto o Diário de campanha abre cada uma individualmente. Não some nem funda diários de campanhas automaticamente.

### Migração histórica única da aba `totais`

`src/legacy-totais-migration.mjs` planeja uma migração versionada (`legacy_totais_migration.version = 1`) para o objeto de base que já existe em `bases/atual`. Não cria tela, importador visível, store IndexedDB nem outra base de campanhas. O payload privado é local e ignorado pelo Git (`data-local/legacy-totais-migration-v1.json`); `node build.mjs` o copia para `dist/` somente quando presente. A página principal lê esse payload uma vez durante a restauração da base, pré-valida nomes/contas/IDs e aborta sem persistir se houver ambiguidade. Linhas de contas MCC que já existem na base são excluídas pelo sufixo de quatro dígitos e ficam explícitas no relatório; campanhas sem conta definida são aceitas sem associação. Campanhas sem identidade operacional exata viram registros `status: 'historico'`, `registro_origem: 'legacy_totais'` com um resumo consolidado de campanha; nenhuma linha diária é criada. Correspondências nativas inequívocas recebem `legacy_totais`, sem substituir diário, status ou métricas MCC. O resumo de investimento e lucro fica visível no Histórico mesmo quando associado a uma campanha nativa. Depois da conclusão, a base e os backups são a fonte persistente; não há dependência do XLSX no fluxo normal.

O Controle Macro é uma tela principal registrada no `src/view-registry.js`. Sua lógica pura fica em `src/control-macro/domain.js`; a interface e persistência são integradas em `src/index.template.html`. A tela navega por meses completos (anterior, posterior e mês atual), abre sempre no mês atual e conserva a navegação manual enquanto permanece aberta. As alterações MCC recalculam as métricas agregadas ao salvar/recarregar a base. O Preparador MCC também publica `base-updated` pelo `BroadcastChannel('painel-campanhas')`, fazendo a tela aberta restaurar a base e recalcular sem nova importação do histórico. O arquivo histórico importado fica como `controle_macro_historico` na base existente, sem nova store ou migração de IndexedDB. A planilha prevalece campo a campo: MCC/D−1 só complementa cliques e vendas ausentes desde 13/09/2026; não substitui investimento, faturamento ou zeros explícitos. Consulte `references/data-model.md` para a regra integral e o tratamento de suspensões e vendas.

Para as próximas atualizações diárias, a política operacional é usar somente MCC D0/D−1, sem nova importação da planilha. O histórico legado permanece. Isso não modifica a precedência existente em datas sobrepostas; veja `references/data-model.md` antes de afirmar que MCC substituiu um valor histórico.

O Controle Macro também apresenta uma evolução com dois escopos: diário do mês selecionado e consolidado mensal desde abril de 2026. `src/control-macro/domain.js` expõe `dailyTrendBuckets()` e `monthlyTrendBuckets()` para preparar séries sem converter dados ausentes em zero; agregados incluem cobertura observada. O ROI mensal deve ser ponderado pela soma de faturamento menos investimento nos dias pareados, dividida pelo investimento pareado, e não por média de percentuais diários. A interface mantém Financeiro, ROI, Cliques e Vendas em visualizações próprias e inclui Desempenho, que agrupa ROI, cliques e vendas num único painel com três faixas alinhadas no mesmo eixo de tempo e escala independente por métrica; o tooltip de vendas informa totais oficiais e provisórios. Preserve lacunas por falta de dados e a cobertura dos pontos nos tooltips. `tests/control-macro.test.mjs` valida os agregados; `tests/build.test.mjs` verifica controles e integração da visualização.

## Observabilidade da Curadoria (pré-teste)

`src/curadoria/curation-observability-domain.mjs`, `curation-observability-storage.mjs`, `curation-observability.mjs` e `curation-observability-view.mjs` implementam uma view principal registrada como `curation-observability`. A pergunta deste domínio é “o que eu sabia sobre este produto antes do teste?”; não acrescente esses eventos ao Event Log operacional. A store usa o banco independente `radar-curadoria-observability`; decisões “Subir campanha” geram `snapshot_decisao` imutável e uma correlação inicialmente pendente. Snapshot de início de teste ainda não existe no MVP.

Trends, Imagens, Glimpse e decisão são capturados após o salvamento original, de forma assíncrona e idempotente. Para performance, não abra a base de Observabilidade ao carregar as listas de curadoria; o banco é aberto na primeira gravação ou ao acessar a view. Grave somente o novo evento/detalhe. Snapshot mantém projeção compacta do sinal atual; Glimpse aponta para sua análise existente e eventos detalhados são lidos por chave só ao expandir. A lista consulta páginas de 30 itens por índice, com limite de 600 posições por página/filtro; o estado aberto de uma linha não carrega ao navegar para outra página. Exportação integral só ocorre quando o usuário solicita backup e a restauração é merge-only.

Correlação por nome é sugestão, não confirmação. A busca do Event Log operacional é sob demanda; exija confirmação humana do `product_id` e registre cada confirmação, correção ou invalidação em `correlations`, sem editar os dois históricos. Ver [modelo e persistência](data-model.md) e [workflow de testes](engineering-workflow.md) para stores, índices e validação.

Em Meu Tempo (`src/meu-tempo/`), a aba Histórico inicia com 13 dias inclusivos até a data atual. Na comparação, a coluna Média calcula também os tempos produtivo e total incluindo dias sem registros como zero. O quadro “Tempo trabalhado” nos últimos 7 dias soma somente lançamentos de duração na categoria Trabalho e usa o snapshot da categoria do lançamento; se não existir, recorre à categoria atual do item. O quadro “Tempo produtivo” no mesmo período soma os lançamentos de duração de qualquer categoria cujo `productiveSnapshot` esteja marcado como verdadeiro. Na comparação e no detalhamento do Histórico, itens de tipo booleano exibem `1` como “Sim” e `0` como “Não”; valores ausentes permanecem como “—”, sem serem tratados como zero. As tabelas da aba não devem ter limite de altura nem rolagem vertical interna: a tabela cresce com o conteúdo, mantém apenas rolagem horizontal quando necessária e a rolagem vertical fica na página.

## Build e servidor

O padrão tipográfico dos cabeçalhos das tabelas fica centralizado em `src/table-headers.css`, copiado para a raiz de `dist/` pelo build. A SPA principal e páginas independentes carregam essa folha global; as telas de curadoria a incluem pela folha compartilhada `src/curadoria/trends-sheet.css`. Novas páginas com tabelas devem carregar/reutilizar o estilo compartilhado em vez de recriar uppercase ou negrito localmente.

Na raiz, `node build.mjs` gera o painel. O uso operacional é `iniciar-painel.cmd`, servido em `http://127.0.0.1:8765/`. Não selecione outra porta automaticamente: o IndexedDB é isolado por origem. O build padrão deve continuar sem manifesto operacional real.

# Manutenção gradual do Hub

## Antes de alterar

1. Leia a skill local `.agents/skills/painel-operacao-google-ads/SKILL.md` e as referências do domínio afetado.
2. Confira `git status --short` e preserve alterações preexistentes. Faça uma mudança de responsabilidade por vez.
3. Edite a fonte canônica, execute `node build.mjs` e depois `node --test` na raiz. Não há instalação de dependências necessária para essa suíte.
4. Para interface, confira a rota no servidor existente `http://127.0.0.1:8765/`. Não mude a origem nem introduza fixtures no perfil real.

## Regras para novas implementações

Estas regras orientam futuras mudanças, inclusive quando executadas por um modelo mais simples. Os detalhes e exemplos dos passos abaixo descrevem a implementação atual; não são autorização para remover recursos existentes.

### Escolha a responsabilidade antes de editar

| Responsável | Deve fazer | Não deve fazer |
| --- | --- | --- |
| Domínio (`domain.js`, `*-domain.mjs`, parsers) | Calcular, filtrar e validar entradas explícitas; retornar resultados sem modificar os dados recebidos | Consultar DOM, abrir banco, chamar API ou depender da view |
| View (`view.js`, `*-view.mjs`) | Renderizar, manter estado visual, ligar eventos locais e encaminhar ações | Duplicar cálculos, schema ou lógica de outra tela |
| Template e CSS | Definir apresentação, IDs e layout responsivo | Importar dados, persistir ou produzir arquivos |
| Adaptador no painel | Fornecer snapshots atuais, formatadores e callbacks existentes; integrar navegação | Virar um segundo domínio, template ou conjunto de listeners de uma tela extraída |
| Storage | Ler/gravar no domínio correspondente, preservando transações e chaves | Interpretar HTML ou gravar registros só por renderizar |
| Workflow e service | Coordenar validação e efeitos explícitos; confirmar criação e tratar API/erros | Reescrever silenciosamente conteúdo fornecido ou produzir durante montagem/análise |

Escolha o menor módulo existente que atende ao pedido. Não introduza framework, repositório genérico, classe-base ou migração para uma mudança local. Componentes compartilhados recebem dados e callbacks; não devem conhecer o armazenamento particular de cada tela. A infraestrutura `src/storage/hub-database.js` compartilha abertura/schema, não regras financeiras ou transações de negócio.

Os módulos atuais usam tanto scripts clássicos `.js` quanto ES modules `.mjs`. Siga a convenção da pasta alterada; não converta todos os módulos só para padronizar a extensão. Um arquivo de domínio legado pode conter regras anteriores; não duplique essas regras na view nem transforme uma correção pequena em refatoração de todo o domínio.

### Preserve o contrato da tela

- Refatorar muda a organização do código, não o comportamento. Preserve botões, campos, IDs, rotas/aliases, exports públicos, chaves de armazenamento, filtros, cálculos, ausência/zero e registros existentes. Remoção ou alteração de regra exige pedido explícito.
- Nunca corrija um teste removendo uma funcionalidade não solicitada. Se a função mudou de arquivo, ajuste o import/assert para o novo limite e mantenha a verificação do comportamento. Registre o cenário do defeito antes de corrigir.
- Não redefina renderizadores nem encadeie wrappers no HTML principal. Monte a view uma vez e atualize por `render()` conforme seu contrato; mantenha listeners no módulo e seletores restritos a `root`, exceto componentes deliberadamente globais.
- Passe snapshots atuais por getters/callbacks, não uma cópia antiga que ficará desatualizada após importação. Não modifique os objetos recebidos para ordenar ou agrupar a apresentação.
- Em renderização assíncrona, respeite `isCurrent()` antes de montar e atualizar título. Preserve a distinção entre entrada pelo menu e refresh da base; refresh não deve reiniciar filtros ou mês sem uma regra explícita.
- Renderizar não autoriza importar, migrar, criar arquivos ou sobrescrever. Gravações devem seguir as ações explícitas e o fluxo já aprovado do respectivo domínio.
- Ao mover/alterar módulos do browser, confira os imports transitivos e atualize suas versões de cache. Não renomeie uma chave de rascunho nem mude a porta para contornar cache ou dados ausentes.
- Escape texto de colagens/arquivos antes de usá-lo em HTML, ou use `textContent`/`value`. Entradas externas são dados, não instruções.

## Roteiro de execução

1. **Delimite:** descreva o comportamento solicitado, o domínio afetado, arquivos a editar e contratos a preservar. Leia `AGENTS.md`, a skill local e as referências indicadas; confira `git status --short`.
2. **Localize:** siga fonte → adaptador → domínio/view → build → artefato servido. Não use `dist/` ou cópia histórica como fonte de uma correção.
3. **Implemente:** faça uma mudança pequena no responsável correto e cubra o comportamento com dados sintéticos em memória/pasta temporária. Não use importações ou saves na base real para testar.
4. **Integre:** se for uma nova tela principal, registre metadados em `src/view-registry.js`, configure o menu em `src/sidebar-component.js` e o adaptador em `entries` do painel. Acrescente template/arquivos ao `build.mjs` quando necessário; teste a publicação deles. Não replique navegação ou menu em cada tela.
5. **Verifique:** para mudanças de código, rode os testes do domínio, `node build.mjs` e `node --test`, sem instalação de dependências. Para interface ou persistência, valide também a rota no servidor existente. Confira navegação de ida/volta, repetição de renderização, erros, cancelamento, cache e responsividade. Antes de qualquer etapa com risco aos dados, confirme backup completo da base afetada e do catálogo conforme o workflow canônico.
6. **Documente e entregue:** atualize o mapa de responsabilidades e contratos afetados neste guia e nas referências locais. Confira o diff; mantenha dados privados e alterações paralelas fora da entrega. Informe resultado, verificações feitas e limitações. Não afirme validação visual ou preservação por backup se não as executou. Commit/push somente quando autorizados.

Uma alteração apenas de documentação não exige reconstruir `dist/` ou abrir bancos: confira links, caminhos e coerência com o código. Não invente um teste de comportamento novo para fazer a documentação parecer validada.

### Critério de conclusão

- O recurso solicitado funciona e os recursos anteriores permanecem, salvo mudança autorizada.
- Cada regra/efeito tem um responsável claro, sem cópia da implementação em outra tela.
- Artefatos servidos correspondem às fontes alteradas e usam versões de cache coerentes.
- Os testes aplicáveis passam; falhas ou verificações não executadas estão explicitamente informadas.
- Dados, identidades e chaves existentes permanecem preservados; nenhum conteúdo privado entrou no código/fixtures.
- A documentação permite localizar o módulo, entender o contrato e saber como verificar a próxima mudança.

## Onde mexer

| Mudança | Fonte | Verificação principal |
| --- | --- | --- |
| Rota, título e item ativo da SPA | `src/view-registry.js` | `tests/view-registry.test.mjs` |
| Troca de telas, limpeza visual e carregamento assíncrono | `src/navigation-controller.js`, adaptadores no painel | `tests/navigation-controller.test.mjs` |
| Aviso de base atualizada entre telas abertas (duração do toast) | `src/index.template.html` | `tests/build.test.mjs` |
| Meu Tempo: aviso prolongado com destaque da duração lançada | `src/meu-tempo/meu-tempo-view.mjs`, `src/index.template.html` | `tests/meu-tempo-daily-order-ui.test.mjs`, `tests/build.test.mjs` |
| Menu, grupos e tipografia lateral | `src/sidebar-component.js`, `src/sidebar-component.css` | `tests/sidebar-component.test.mjs`, `tests/sidebar-layout.test.mjs` |
| Curadoria Hot Offers MS: parser, histórico, filtros e decisões | `src/curadoria/hot-offers-ms/` | `tests/hot-offers-ms-domain.test.mjs`, `tests/hot-offers-ms-storage.test.mjs`, `tests/hot-offers-ms-ui.test.mjs`, `tests/sidebar-component.test.mjs` |
| Integração das telas e projeção da base | `src/index.template.html` | `tests/build.test.mjs` e testes do domínio |
| Mapa por Conta: filtros, agrupamentos e ordenação | `src/accounts/accounts-domain.mjs` | `tests/accounts-domain.test.mjs`, `tests/account-cpa-coverage.test.mjs` |
| Mapa por Conta: quadros, eventos e layout | `src/accounts/accounts-view.mjs`, `accounts.css` | `tests/accounts-view.test.mjs`, `tests/build.test.mjs` |
| Controle Macro: interface, gráficos e eventos | `src/control-macro/view.js`, `template.html`, `control-macro.css` | `tests/control-macro-view.test.mjs`, testes de domínio e sincronização |
| Controle de gastos: saldo futuro líquido e comparação com a reserva | `src/personal-finance/personal-finance-domain.mjs`, `personal-finance-view.mjs` | `tests/personal-finance-domain.test.mjs`, `tests/build.test.mjs` |
| Faturamento: status de pagamento, competência e diálogo de alteração | `src/billing/billing-domain.mjs`, `billing-view.mjs`, `billing-status.css`, `billing-storage.mjs` | `tests/billing-domain.test.mjs`, `tests/billing-view.test.mjs`, `tests/billing-storage.test.mjs` |
| CPA: filtros e resumo por faixa | `src/cpa/domain.js` | `tests/cpa-view.test.mjs` |
| CPA: interface, eventos e estilos | `src/cpa/view.js`, `template.html`, `cpa.css` | `tests/cpa-view.test.mjs`, `tests/extracted-views-build.test.mjs` |
| Produtos Testados: agrupamento, vendas/lucro agregados e ordenação | `src/tested-products/domain.js` | `tests/tested-products-domain.test.mjs`, `tests/tested-products-view.test.mjs` |
| Produtos Testados: interface e preferências de colunas | `src/tested-products/view.js`, `template.html`, `tested-products.css` | `tests/tested-products-ui.test.mjs`, `tests/tested-products-view.test.mjs` |
| Visão Geral: ordenação e visibilidade por situação | `src/overview-domain.js` | `tests/overview-domain.test.mjs`, `tests/overview-view.test.mjs` |
| Visão Geral: tabela, indicadores, eventos e estilos | `src/overview/view.js`, `template.html`, `overview.css` | `tests/overview-view.test.mjs`, `tests/mcc-campaign-status.test.mjs` |
| Meu Tempo: indicadores diários e destaques do Histórico | `src/meu-tempo/meu-tempo-domain.mjs`, `src/meu-tempo/meu-tempo-view.mjs`, `src/meu-tempo/meu-tempo.css` | `tests/meu-tempo-domain.test.mjs`, `tests/meu-tempo-daily-order-ui.test.mjs`, `tests/meu-tempo-history-ui.test.mjs`, `tests/build.test.mjs` |
| Diário: datas e linhas virtuais de vendas provisórias | `src/product-diary/domain.js` | `tests/product-diary-ui.test.mjs`, `tests/product-diary-view.test.mjs` |
| Diário: tabela nativa, resumo legado e viewport com rolagem interna | `src/product-diary/view.js`, `template.html`, `product-diary.css` | `tests/product-diary-view.test.mjs`, `tests/product-diary-ui.test.mjs`, `tests/legacy-totais-migration.test.mjs` |
| Ficha fornecida e validação de campos | `src/copy-ficha/copy-ficha-structured.mjs`, `copy-ficha-view.mjs` | `tests/copy-ficha-structured.test.mjs`, `tests/copy-ficha-view.test.mjs` |
| Ficha: apresentação e rascunho | `src/copy-ficha/copy-ficha-template.mjs`, `copy-ficha-draft.mjs` | `tests/ficha-presell-workflow.test.mjs` |
| Oferta: respostas e edição/cópia do quadro | `src/copy-ficha/copy-ficha-questions.mjs`, `copy-ficha-questions-view.mjs` | `tests/copy-ficha-questions.test.mjs`, `tests/copy-ficha-questions-view.test.mjs` |
| Ficha: validação antes da criação e chamada da API | `src/copy-ficha/copy-ficha-workflow.mjs`, `src/presell/presell-service.mjs`, `presell-report.mjs` | `tests/ficha-presell-workflow.test.mjs` |
| IndexedDB compartilhado: schema e abertura | `src/storage/hub-database.js`, `hub-database.mjs` | `tests/hub-database.test.mjs` e testes dos storages afetados |
| Produção e proteção contra sobrescrita | `src/presell/`, `presell-engine/` | `tests/presell-template-identifiers.test.mjs`, `tests/standalone-runtime.test.mjs` |
| Modelo e importação MCC: status operacional, confirmação de pausa e corte do diário | `src/database.js` | `tests/mcc-campaign-status.test.mjs`, `tests/database.test.mjs`, `tests/preparador-d0.test.mjs` |
| Preparador MCC: página, parser, receptores e integração | `src/preparador-MCC/index.html` | `tests/preparador-build.test.mjs`, `tests/preparador-d0.test.mjs`, `tests/preparador-d1.test.mjs`, `tests/mcc-grid-production.test.mjs` |
| Extensão MCC: apresentação de bloqueios D0/D−1 | `extensions/mcc-d0-bridge/capture-status-view.mjs`, `popup.js`, `popup.html` | `tests/mcc-extension-popup.test.mjs`, `tests/mcc-grid-production.test.mjs` |
| Hot Offers MS: parser/comparação da coleta | `src/curadoria/hot-offers-ms/hot-offers-ms-domain.mjs` | `tests/hot-offers-ms-domain.test.mjs` |
| Hot Offers MS: prévia, modal e confirmação visual | `src/curadoria/hot-offers-ms/hot-offers-ms-view.mjs`, `hot-offers-ms-page.mjs` | `tests/hot-offers-ms-ui.test.mjs`, `tests/hot-offers-ms-storage.test.mjs` |

`dist/index.html`, `dist/preparador-MCC/index.html` e os demais módulos publicados pelo build são gerados; não faça a mesma alteração manual em fonte e saída. Edite o arquivo correspondente em `src/` e gere novamente. Cópias históricas não são fontes do build.

## Contratos atuais que os testes devem preservar

- Na extensão MCC, erros estruturados atravessam o service worker até o popup. Duplicidade de nomes deve ter destaque vermelho e lista dos nomes; não apresentar como captura incompleta quando todas as linhas foram lidas e a única divergência é a quantidade de nomes únicos. Paginação parcial, contagem divergente, virtualização, campos/data inválidos continuam bloqueantes e aparecem separadamente. Não enviar capturas rejeitadas nem alterar a base. Toda mudança na extensão incrementa pelo menos o patch de `manifest.json` e exige recarregamento em `chrome://extensions`.

### Padrões visuais de Curadoria definidos pelo usuário

- Nas telas da sessão Curadoria, use no eyebrow verde o prefixo **Curadoria · [fonte]** (por exemplo, `Curadoria · SpyHero`, `Curadoria · GuruMedia` e `Curadoria · MediaScalers`); deixe o nome/objetivo da tela no `<h1>` e o subtítulo abaixo, sem repetir o título no eyebrow. Padronize o cabeçalho com o E-commerce GM e a Hot Offers MS: área principal com `24px 28px 52px` de padding (em telas até 1100px, `18px`), cabeçalho alinhado no início com `18px` de gap e `16px` de margem inferior, eyebrow verde `#42e7c0` a `.72rem`, `line-height: normal` e espaçamento de letras `.14em`, título a `1.2rem` com margem `5px 0 3px`. Aplique via `data-hub-sidebar-active` em `src/sidebar-component.css` para preservar o mesmo recuo superior/lateral e escala tipográfica entre telas. O título principal da Hot Offers MS usa fonte efetiva de **1.2rem**, igual ao E-commerce GM; esse tamanho também é o padrão para novas telas de Curadoria.
- A sequência das abas analíticas compartilhadas com E-commerce GM é **Google Trends → Glimpse → Google Imagens → Histórico**. Uma tela pode conservar antes delas uma aba específica como Resumo quando ela contém ações próprias; não remover ou ocultar esse conteúdo para igualar a navegação.
- Na Hot Offers MS, mantenha os filtros em uma única linha, com tipografia compacta igual à E-commerce GM; se necessário, a faixa deve rolar horizontalmente. Os filtros de países e pagamento máximo foram removidos dessa tela.
- Não exiba o selo **HOT** ao lado do nome do produto na tabela da Hot Offers MS.
- Ao reaproveitar esses padrões em novas telas de Curadoria, mantenha os recursos próprios da tela e use essa sequência comum para os controles compartilhados.

- O menu compartilhado usa a tipografia padronizada e somente uma entrada **Ficha e Presell**. `?view=presell` continua abrindo `?view=copy`, com `copyFichaNav` ativo; `presellNav` não é mais um item de navegação. Os elementos legados permanecem ocultos, mas não há mais camadas de wrappers para fechar as outras telas.
- Ficha e Presell mantém **Gerar perguntas e respostas** e o quadro de oito respostas editáveis com cópia independente. O renderizador `copy-ficha-questions-view.mjs` é somente apresentação; gerar/copiar não cria Presell nem modifica o texto estruturado ou salva o rascunho. A criação valida o texto estruturado (três ou quatro FAQs) antes de solicitar produção; falhas identificam o campo pendente. Anúncios e download JSON continuam removidos. O servidor mantém assets e proteção contra sobrescrita.
- Arquivos finais de Presell são criados pela produção, não exigidos na validação prévia.
- Zero observado, valor ausente e inválido são distintos. Nomes MCC completos e chaves campanha/data não podem mudar numa refatoração de interface.
- Nenhum teste deve limpar ou modificar IndexedDB, `data-local/` ou dados históricos reais. Fixtures devem ser sintéticas e isoladas em memória ou em pasta temporária.

## Padrão de separação incremental

Para uma tela extraída, mantenha regras puras em `*-domain.mjs`, DOM/eventos em `*-view.mjs`, estilos em CSS e um adaptador pequeno no painel para fornecer os dados já consolidados. O domínio não deve importar DOM, armazenamento ou servidor. Evite criar um framework novo ou misturar a extração com mudanças de regra de negócio.

Testes de domínio verificam resultados com dados sintéticos. Testes de integração verificam conexão, build e contratos de interface; não devem exigir que funções continuem fisicamente no HTML após uma extração. Antes e depois, compare filtros, seleção, ordenação, métricas e navegação no navegador.

## Piloto: Mapa por Conta (passo 2)

- `accounts-domain.mjs`: estado inicial, filtros, agrupamento produto/conta, KPIs, faixas/cobertura, seleção, ordenação e URL segura de domínio. Funções puras; não escrevem dados.
- `accounts-view.mjs`: markup, renderizadores pequenos por quadro e eventos locais. `mount({root, getSnapshot, format})` retorna `render()`. Os três filtros de situação compartilham um estado; o padrão é Ativas. Conta e situação definem as colunas de CPA; Produto limita somente as linhas.
- `accounts.css`: estilos existentes da tela, incluindo compactação, seleção e responsividade.
- `accountReportRows()` no painel conserva a consolidação histórica/D0, vendas e identificação de produto/conta/domínio. `accountReportSnapshot()` acrescenta identidade/data, CPA e dias sem impressão usando os parsers existentes. Este adaptador é somente leitura, não é um segundo banco.
- `renderAccountReport()` carrega o módulo uma vez, fornece o snapshot atual em cada renderização e atualiza o indicador de rolagem compartilhado. Rota e menu continuam no registro existente. A barra de rolagem continua no painel porque também atende a análise de CPA.
- Para mudar uma regra visual da tela, comece no módulo. Não volte a adicionar wrappers de `renderAccountReport` ou listeners de seus filtros ao HTML principal. Uma mudança de cálculo histórico deve ser tratada como outra tarefa, com testes e aprovação próprios.

Verificação recomendada: `node --test tests/accounts-domain.test.mjs tests/accounts-view.test.mjs tests/accounts-adapter.test.mjs tests/account-cpa-coverage.test.mjs`, build e suíte completa. No navegador, confira Ativas/Pausadas/Todas, conta/produto, seleção, ordenação, link de domínio, tamanho compacto e ida/volta pelo menu.

`tests/accounts-adapter.test.mjs` cobre também a seleção da análise CPA, que antes chamava o helper inline do Mapa. `cpaSelect()` agora conserva a implementação de seleção em seu próprio limite; não pode depender de um renderizador removido de outra tela. Os outros testes desse adaptador verificam histórico/D0 sem dupla contagem, ajustes provisórios e identidade/domínio sem escrita.

## Navegação centralizada (passo 3)

- `view-registry.js` continua como fonte dos IDs, rotas e títulos. `navigation-controller.js` controla somente a interface: seção visível, item ativo, grupo lateral, título, URL e classes do corpo. Não importa domínios nem acessa bancos.
- O painel fornece `entries` com renderizadores existentes. As funções `show*` são adaptadores pequenos para chamadas já usadas por importação, restauração e seleção de campanha; não devem ser redefinidas nem encadeadas com wrappers.
- Para incluir uma tela principal, registre seus metadados, configure seu item no menu e acrescente o adaptador em `entries`. Não copie listas de telas a esconder ou bindings de navegação para o renderizador.
- Renderizadores assíncronos recebem `isCurrent()`: confira antes de montar após um `await` e antes de atualizar o título por callbacks. Uma abertura antiga não deve recuperar o foco visual depois que o usuário já mudou de tela.
- O Diário conserva nome exato, ID e fonte da campanha no estado; não cria identidade por nome nem grava seleção no banco. Sua URL é `/`. Atualizações usam `replaceState`, como antes, sem criar uma entrada no histórico a cada renderização.
- O Controle Macro reinicia no mês atual ao ser aberto pelo menu, mas uma atualização da base enquanto a tela está aberta preserva o mês selecionado. `onMenu` separa essas duas ações.
- Faturamento, Controle de gastos, Meu Tempo e Ficha e Presell mantêm seus próprios módulos, callbacks e persistência. Esta etapa não migra dados nem modifica cálculos.

Verificação: `node --test tests/navigation-controller.test.mjs tests/view-registry.test.mjs`, build e suíte completa. Os testes de navegação cobrem todas as 144 combinações de troca entre as 12 telas/estados, alias antigo, atualização, histórico, seleção de campanha e carregamento atrasado, com DOM e base sintéticos em memória. Confira também as rotas reais no servidor existente, sem salvar ou importar dados para o teste.

## Telas extraídas (passos 4, 5 e 6)

As três telas usam módulos pequenos sem framework novo. Cada `view.js` recebe o contêiner `root`, dados/callbacks e formatadores; seus seletores ficam restritos à própria tela. `mount()` é chamado uma vez e retorna `render()`, para atualizar a mesma interface sem duplicar eventos. A navegação permanece no controlador do passo 3.

O HTML de cada tela fica no seu `template.html`. O build incorpora esse arquivo na seção correspondente do painel, preservando IDs e estrutura. Edite esse template, não a cópia em `dist/index.html`. Os scripts próprios são carregados antes do adaptador principal; ao alterá-los, atualize a versão na referência do painel.

### Controle Macro — passo 4

- `domain.js` conserva os cálculos e a precedência histórica e agrega o detalhamento de vendas por produto. Conversões MCC são atribuídas ao produto da campanha; vendas provisórias usam o produto do lançamento/campanha. Valores da planilha são atribuídos pelo MCC só quando a contagem oficial coincide; anotações explícitas já registradas são preservadas. Sem evidência de produto, a tela identifica a venda como não identificada.
- `view.js` recebe somente as linhas consolidadas por `getRows()` e seu estado visual `macroUi`: mês, escopo e métrica do gráfico. Contém KPIs, tabela, SVGs, tooltips e eventos dos controles.
- O painel mantém `refreshControlMacroCache()`/`macroAllRows()`, a importação com prévia/confirmação e sua persistência. O input encaminha ao callback existente; montar/renderizar a tela não importa arquivos.
- O menu reinicia o mês atual; refresh da base não altera o mês selecionado. Gráficos mantêm lacunas, cobertura, ROI ponderado e separação entre vendas oficiais e provisórias. Em Cliques no consolidado mensal, cada mês compara o total observado com a média aritmética dos totais mensais observados no período; zero é um total válido, meses sem cliques observados são excluídos do cálculo, e o mês parcial corrente entra com os dados disponíveis. A série de média não aparece na visão dia a dia. A coluna Observações também mostra quantidade, produto e valor observados por venda; registros históricos agregados sem detalhe não são distribuídos entre produtos.

### Análise de CPA — passo 5

- `domain.js` contém estado visual inicial, filtros, resumo ponderado por faixa, seleção da faixa e contagem de produtos únicos. Não lê DOM ou banco.
- `view.js` contém selects, datas, tabelas, gráficos e eventos. Não há mais wrapper que redefine `renderCpaReport`.
- O painel mantém os parsers compartilhados de título/CPA desejado e `cpaPeriodTotals()`/`cpaReportRows({mode,start,end})`, que leem as projeções/indexes existentes. O adaptador recebe o período e o escopo explicitamente, sem ler campos DOM.
- `cpa.css` conserva os estilos da tela, inclusive as regras de rolagem e responsividade. A barra de rolagem compartilhada continua no painel, pois também atende Mapa por Conta.

### Produtos Testados — passo 6

- `domain.js` recebe campanhas, catálogo normalizado, índices de diário/ajustes e snapshots MCC atuais. Agrupa somente famílias confirmadas, calcula faturamento, vendas e lucro sem sobreposição histórica e ordena sem modificar as entradas. **Vendas** soma conversões legadas observadas e conversões diárias por campanha; snapshots D−1/D0 substituem o valor do mesmo dia (D−1 prevalece se houver conflito). Vendas provisórias ainda não conciliadas entram por data apenas no excedente à contagem MCC, sem duplicar lançamentos já refletidos em conversões. **Lucro total** é total faturado menos investimento; investimento soma `investment_brl`, diário da coluna O e snapshots D−1/D0 em BRL, respeitando precedência e `end_date`. Lucro permanece ausente, não zero, se não houver faturamento e investimento observados para cada campanha relacionada.
- `view.js` exibe linhas/contadores, ordena cabeçalhos e aplica preferências de colunas, incluindo Vendas e Lucro total. A chave `painel-produtos-testados-colunas-v1` permanece igual; são preferências de apresentação, não dados operacionais.
- O painel mantém o cache das projeções, os parsers compartilhados e as gravações no catálogo. A view solicita renomear/ocultar/restaurar por callbacks explícitos; renderização não chama essas ações. Exclusão permanente continua usando a confirmação e o backup existentes, sem alterar o fluxo.
- Campanhas, nomes MCC, IDs e diários não são fundidos nem renomeados pela consolidação de apresentação.

Antes de atualizar essas telas, rode seus testes e `tests/extracted-views-build.test.mjs`, depois build e suíte completa. Dados dos testes são sintéticos em memória. No navegador, confira as rotas `/?view=macro`, `/?view=cpa` e `/?view=tested`, navegação entre telas, meses/gráficos, filtros/período/seleção, ordenação e preferências, sem editar ou importar dados reais.

## Visão Geral e Diário — passo 7

- `overview/view.js` recebe `getSnapshot()`, formatadores, estado visual e callbacks. Contém tabela, KPIs D−1/D0, alertas, filtros e eventos locais. `overview-domain.js` conserva os cálculos anteriores e acrescenta ordenação sem mutação e visibilidade por situação. Não acessa DOM ou armazenamento.
- `overviewRowsForMode()` no painel mantém a projeção e o cache financeiro existentes. `overviewSnapshot()` acrescenta somente metadados visuais: ID estável, pausa, política e métricas diárias. KPIs continuam somando todas as campanhas, inclusive pausadas; o filtro muda somente a tabela. Vendas provisórias e limites de teste mantêm a precedência anterior. O tooltip distingue a pausa explícita (`Campanha pausada na data X`) da ausência sem confirmação (`Última aparição em X`).
- `product-diary/domain.js` contém datas, colunas, linhas virtuais de vendas provisórias e recorte inclusivo por data de pausa confirmada. Essas linhas virtuais são apenas de exibição: não criam registros no Diário nem conversões oficiais. `view.js` contém formatação, tabela nativa e resumo legado, em ramos separados; na data da confirmação, a coluna Observações informa a pausa.
- `src/database.js` é a fonte da confirmação operacional: D0 explícito prevalece; quando D0 não contém a campanha/estado, um estado pausado explícito em D−1 confirma a pausa. A confirmação usa o campo aditivo `pausa_confirmada_em` no registro existente (sem migração/schema novo). Ausência continua sendo inferência operacional e nunca preenche esse campo. Enquanto confirmada e sem reativação posterior, linhas MCC posteriores não são acrescentadas e o Diário as oculta sem apagar dados já persistidos. Uma observação explícita posterior de campanha ativa limpa o corte e permite retomar o diário.
- `productDiarySnapshot()` conserva leitura pelo ID estável, fontes manifesto/base/legado e fallbacks existentes. Resumos legados não produzem séries diárias nem recebem ajustes de vendas manuais. Zero observado e ausência permanecem distintos.
- Em telas desktop, a navegação para o Diário ativa `product-diary-mode`: o quadro ocupa o espaço restante da primeira dobra e a rolagem vertical permanece apenas na tabela (ou no resumo legado). Em larguras até 980px, mantém-se o layout responsivo existente, sem altura fixa no painel.
- Os templates e CSS são fontes canônicas nas respectivas pastas. O build incorpora os templates e publica os scripts antes do painel. `renderTotals()` e `renderProduct()` apenas montam uma vez e atualizam; não recrie wrappers ou bindings no HTML principal.
- As views não abrem banco, importam, salvam ou migram dados. O link de ROI solicita o callback existente somente após clique explícito. Título e navegação do Diário também usam callbacks, preservando nome exato, fonte e ID.

Verificação: `node --test tests/overview-view.test.mjs tests/product-diary-view.test.mjs tests/overview-diary-adapters.test.mjs tests/product-diary-ui.test.mjs tests/mcc-campaign-status.test.mjs`, build e suíte completa. Os testes usam dados sintéticos em memória e cobrem cálculos por período, cache sem mutação, filtros/ordenação, alertas, seleção por ID, zero/ausência, pausa confirmada em D0/D−1, última aparição sem confirmação, encerramento do diário sem apagar histórico e legado separado. No navegador existente, confira Consolidado/D−1/D0, situações, ordenação, abertura de campanha e ida/volta entre Diário e Histórico, sem editar dados reais.

## Preparador MCC no build — passo 8

- `src/preparador-MCC/index.html` passa a ser a fonte canônica. O arquivo foi transferido integralmente, sem alterar HTML, CSS, scripts, parser, validações, persistência ou receptores da extensão.
- `build.mjs` cria o diretório de saída e copia somente essa página para `dist/preparador-MCC/index.html`. Não usa nem publica cópias históricas como entradas; os arquivos antigos existentes não foram excluídos nesta etapa.
- A URL continua `http://127.0.0.1:8765/preparador-MCC/`. Links para recursos compartilhados, imports relativos e contratos `__hubReceiveMccD0Grid`/`__hubReceiveMccD1Grid` permanecem iguais. Não é necessário mudar ou reinstalar a extensão por esta transferência.
- A etapa não modifica schema, chave da base, taxa, campanhas ou registros. Captura prepara a prévia; somente o clique explícito em Atualizar base continua autorizando a aplicação.

Verificação: `node build.mjs` e `node --test`. `tests/preparador-build.test.mjs` compara fonte/saída byte a byte e executa o build em pasta temporária sem base pessoal: saída inicialmente ausente, reconstrução da página e propagação da fonte, sem publicar cópias históricas. Os testes de D0/D−1, numeração, captura e paridade com a extensão continuam exercitando o artefato servido. Na validação visual, abra a rota existente sem capturar/importar dados nem clicar em Atualizar base.

## Banco compartilhado — passo 9

- `src/storage/hub-database.js` é a única declaração de nome, versão 5, stores e índices. A ponte `hub-database.mjs` permite reutilizar a implementação nas views ES module; páginas clássicas carregam o mesmo script antes dos adaptadores.
- Painel, Preparador, Faturamento e Controle de gastos delegam somente abertura/upgrade. Transações atômicas de campanhas/eventos/Faturamento, backup/restauração e consultas pessoais por índice permanecem em seus locais anteriores, sem alteração das regras.
- O upgrade continua aditivo; nunca recria stores existentes, altera chaves ou executa writes de domínio ao abrir. Bloqueio avisa para fechar abas antigas; uma conexão tardia de um pedido rejeitado é fechada.
- Bancos de Meu Tempo e Curadoria não foram unificados. A infraestrutura não conhece suas bases.
- Faça backup prévio de base/Faturamento/Controle de gastos e do catálogo pelo botão próprio. Os arquivos privados ficam fora do Git; o catálogo conserva seu formato e importação existentes.

Verificação: `tests/hub-database.test.mjs` cobre abertura, erros/bloqueios, esquema completo por qualquer consumidor, upgrades antigos e preservação de registros sintéticos. Rode também os testes de banco, MCC, Faturamento e Controle de gastos e a suíte completa. Não use a base real para testar restauração ou aborto.

## Ficha e Presell — passo 10

- `copy-ficha-view.mjs`: DOM, eventos e atualização de campos; não chama outra view nem contém o template inteiro.
- `copy-ficha-template.mjs`: somente apresentação, com o mesmo markup/IDs/layout e placeholder escapado.
- `copy-ficha-questions.mjs`: respostas com base no Ctrl+A e campos revisados; `copy-ficha-questions-view.mjs`: quadro editável e cópia das respostas atuais. A geração é independente da ficha/produção e não grava o rascunho nem modifica o texto estruturado. Preserve os botões **Gerar perguntas e respostas** e **Copiar perguntas e respostas**.
- `copy-ficha-draft.mjs`: mesma chave `copy-ficha-draft-v1`, propriedades legadas preservadas; texto estruturado permanece somente na sessão. Não altere essa chave para uma refatoração.
- `copy-ficha-workflow.mjs`: parser/validação antes de qualquer confirmação/produção; aceita três ou quatro FAQs sem reescrever textos nem recalcular a oferta.
- `presell-service.mjs`: valida JSON, confirma e chama a API local. Não exige os arquivos finais antes da produção. O motor/validador do servidor não foi alterado e continua bloqueando assets inválidos e sobrescrita.
- `presell-report.mjs`: relatório escapado. `presell-view.mjs` conserva exports compatíveis para consumidores legados, sem duplicar implementação.

Verificação: `tests/ficha-presell-workflow.test.mjs`, `tests/copy-ficha-questions.test.mjs`, `tests/copy-ficha-questions-view.test.mjs`, testes de parser/view, build e suíte completa. Fixtures sintéticas cobrem bloqueio antes da API, três/quatro FAQs, cancelamento, erros do servidor, payload, rascunhos, edição/cópia das oito respostas e independência da criação. A inspeção no navegador não cria Presell, limpa coleta ou modifica dados reais.

## Sequência concluída

Os passos 1–10 foram implementados incrementalmente. Mudanças futuras devem seguir os limites de responsabilidade acima; não há migração de dados associada à refatoração.

## Referência do passo 1

Em 01/10/2026, a suíte inicial tinha 98 testes, com quatro falhas de expectativas antigas: helper de sitelinks removido, ação separada de gerar ficha removida e duas execuções do teste que exigia `presellNav`. As verificações foram alinhadas ao comportamento atual, sem reintroduzir recursos removidos ou mudar dados.

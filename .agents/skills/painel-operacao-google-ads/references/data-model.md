# Modelo e persistência

## Base de campanhas

O IndexedDB compartilhado `painel-campanhas` está na versão 5:

- `bases`, chave `atual`: base `base_campanhas_v1` sem duplicar fisicamente o Event Log;
- `catalogos`, chave `atual`: aliases, ocultações e datas oficiais dos Produtos Testados;
- `events`, chave `event_id`: objetos de telemetria imutáveis, acrescentados com `add`.

A migração v3 acrescentou `events`; a migração v4 acrescentou stores do Faturamento; a migração v5 acrescenta stores próprias do Controle de gastos. As migrações são aditivas: preservam as stores existentes e não as recriam nem apagam.

O objeto normalizado de base tem `campanhas`, `diario`, `campos_operacionais`, `importacoes`, `snapshots_campanhas`, `vendas_provisorias`, `manifesto_atual` e `event_log`. `event_log` é a visão em memória/exportação que une os eventos da store `events` e eventuais eventos de backups antigos. Persistência de campanha grava as demais propriedades em `bases` e mescla eventos novos à store dedicada sem atualizar ou remover IDs existentes.

### Histórico legado consolidado — migração única de `totais`

Não é uma store ou base nova: a migração v1 reutiliza `bases/atual` e acrescenta `legacy_totais_migration: {version, source, applied_at, report}` à base. Campanhas novas da carga usam `registro_origem: 'legacy_totais'`, `status: 'historico'`, nome completo em `nome_mcc`/`nome_exibicao` e `legacy_totais` com `schema`, `origin`, número histórico, `end_date`, `account_legacy`, métricas e valores derivados. Campanhas nativas inequívocas mantêm sua identidade/status e recebem apenas `legacy_totais`; seu histórico diário, MCC, D0/D−1, vendas e Event Log não são substituídos. Registros nativos sem marcador explícito continuam sendo considerados de origem `native` por compatibilidade.

O resumo guarda `investment_brl`, `clicks`, `conversions` e `commission_brl` como `{value, state}`: zero observado é `0/observed`; célula vazia é `null/missing`; marcador textual não numérico é `null/unknown`. Conta antiga é texto literal, sem conversão automática para `conta_sufixo`. Data ausente fica `null`. Lucro é derivado somente quando investimento e comissão são observados; ROI somente quando a comissão e um investimento maior que zero são observados. O ROI da planilha, que é fórmula, não é outra fonte de verdade. Lucro não é inferido a partir de comissão ausente, ainda que uma fórmula antiga na planilha mostre um número.

`src/legacy-totais-migration.mjs` valida o payload local, detecta nomes exatos duplicados, conta/nome conflitante, colisões e divergências nativas antes de modificar a cópia da base. Se qualquer associação ficar ambígua, não grava a migração nem seu marcador. Correspondência usa `nome_mcc` literal; conta só desempata quando o texto cru da conta coincide literalmente com metadado operacional disponível, sem reduzir ID a sufixo. O relatório v1 guarda linhas analisadas, campanhas válidas/criadas/já existentes, vínculos, duplicidades evitadas, ambiguidades, datas ausentes, linha(s) de resumo ignorada(s), divergências e totais por valores observados. O marcador torna reload/build idempotentes. O resumo legado só é mostrado ao abrir a campanha legada na seção Histórico; o renderizador da tabela diária permanece sem datas artificiais. `Produtos Testados` usa o agrupamento atual sobre a mesma coleção `campanhas`; sua coluna **Total faturado** agrega por produto a comissão histórica observada por campanha. Para evitar dupla contagem, só acrescenta diário e ajustes de vendas provisórias em datas estritamente posteriores ao `end_date` do resumo. Se houver comissão observada sem data final, usa essa comissão e não adiciona valores diários/provisórios sem período comprovadamente posterior; quando não houver comissão histórica observada, usa o diário e os ajustes provisórios disponíveis. Zero observado permanece válido; `missing`/`unknown` não é tratado como zero. Essa regra afeta apenas Produtos Testados: não altera dados diários/MCC nem o resumo da campanha na seção Histórico.

Na mesma listagem, a coluna **Vendas** agrega, para todas as campanhas relacionadas, conversões históricas com estado `observed`, valores diários MCC da coluna F e snapshots D−1/D0 das campanhas atuais. Um snapshot substitui o dado diário da própria data em vez de ser somado a ele; se houver D−1 e D0 para a mesma data, D−1 prevalece. Para evitar sobreposição com o resumo `legacy_totais`, dados diários/snapshots e vendas provisórias só entram em datas posteriores ao `end_date`; quando conversões históricas observadas não têm data final, preserva-se apenas o total histórico. Vendas provisórias não conciliadas são adicionadas somente no excedente sobre conversões observadas na mesma campanha/data. Zero observado é exibido como zero; sem fonte observada para o produto, a coluna fica sem valor (`—`). A consolidação é somente de apresentação e não altera base ou Diário de campanha.

A coluna **Lucro total** agrega, para todas as campanhas relacionadas, o investimento legado observado (`investment_brl`), o investimento diário da coluna O e os snapshots MCC D−1/D0 convertidos para BRL conforme a moeda. Snapshots substituem o diário da própria data; D−1 prevalece em conflito. Para evitar sobreposição, diário/snapshots só entram depois do `end_date` quando há investimento histórico observado; sem data final, preserva-se só o resumo legado. O lucro é **Total faturado − investimento total** e fica sem valor (`—`) se faltar qualquer um dos totais em ao menos uma campanha relacionada; zero observado permanece válido. A coluna é apenas uma derivação de apresentação e não grava nem altera os dados de origem.

O payload é o arquivo privado `data-local/legacy-totais-migration-v1.json`, ignorado pelo Git e copiado para `dist/` apenas durante o build local quando existe. Não versionar o XLSX nem o JSON de campanhas. Após a migração, `legacy_totais` viaja no backup normal da base JSON; `CampaignDatabase.normalize`/`mergeEventLogs` preservam propriedades aditivas. O runtime não contém parser de Excel nem mantém dependência da planilha.

`controle_macro_historico` é um campo aditivo opcional na base existente (não uma nova store/schema). Guarda os dias importados da planilha de controle macro, com data, investimento, faturamento, cliques, vendas e observação. A agregação em `src/control-macro/domain.js` combina esse histórico com `diario` por métrica:

- Quando existe uma linha histórica para a data, os valores não vazios da planilha prevalecem para investimento, faturamento, cliques e vendas. MCC nunca substitui investimento ou faturamento dessa linha.
- A partir de `2026-09-13` (inclusive), MCC/D−1 preenche cliques e vendas somente quando o respectivo campo histórico está ausente (`null`). Zero explícito na planilha é válido e não deve ser substituído. Antes dessa data, lacunas históricas de cliques/vendas continuam ausentes.
- Se não existe uma linha histórica para a data, os dados MCC agregados podem formar a linha do dia. Ausência de valor não é convertida em zero.
- `salesAdjustmentMap()` mantém vendas e comissão provisórias separadas das métricas oficiais; pendências não se tornam conversões oficiais. Para exibição no Controle Macro, fornece também os lançamentos provisórios pendentes com produto/valor, somente em memória. Conversões oficiais usam campanha MCC → identidade de produto do catálogo; o agregado histórico da planilha não possui detalhe por produto e só recebe atribuição MCC quando a contagem oficial diária coincide. Anotações históricas explícitas são preservadas; sem outra evidência, manter a venda como produto não identificado. Nada disso altera o schema nem cria transações oficiais.
- De `2026-06-10` a `2026-06-24`, inclusive, a tela mantém os dias sem dados com a observação de operação fora do ar por suspensões. Dias com vendas positivas recebem destaque verde suave; o destaque de suspensão vermelho suave tem precedência visual se ambos coincidirem.

O Preparador MCC grava a base `atual` no mesmo IndexedDB `painel-campanhas` e emite `BroadcastChannel('painel-campanhas')` com `type:'base-updated'`. O painel recarrega a base, recompõe o agregado do Controle Macro e renderiza novamente; portanto, uma importação D−1 atualiza a tela sem uma importação separada do histórico. Ao abrir ou recarregar o painel, a base local também é restaurada e os agregados são recalculados. Se o aviso de atualização automática falhar, a tela pode ser recarregada; não reimporte para tentar forçar a atualização.

### Política da fonte operacional daqui em diante

- Não solicitar nem importar novamente a planilha para a atualização diária do Controle Macro. Usar as cargas MCC D0 (parcial) e D−1 (fechamento do dia anterior) como fonte operacional dos novos dados.
- Preservar `controle_macro_historico` já importado como histórico legado; não apagá-lo ou migrá-lo automaticamente.
- **Limite importante:** o código atual ainda aplica a regra de precedência histórica acima se existir linha da planilha para a mesma data. A política futura de usar MCC como fonte em datas sobrepostas ainda não altera esse código. Se for necessário substituir valores históricos existentes por MCC, isso exige uma alteração de regra de negócio aprovada e testada; não presumir que uma nova carga MCC sobrescreveu a planilha.

## Diário A–Q

O módulo é apresentado na interface como **Diário de campanha**: uma seleção abre o diário de uma campanha específica, não um diário consolidado de produto. O vínculo de produto é uma relação um-para-muitos na visão de Produtos Testados: a mesma família/identidade de produto pode listar várias campanhas relacionadas, e seus registros diários permanecem separados pela chave de campanha. Preserve nomes MCC completos e `campanha_id`; não funde métricas de campanhas só porque pertencem ao mesmo produto.

Em **Produtos Testados**, a consolidação de apresentação reconhece uma série somente quando existem pelo menos duas iterações numéricas distintas com a mesma base, inclusive nomes no formato `Produto 1° [MS]`, `Produto 2° [MS]`. A coluna de produto usa a base (`Produto`) e as métricas agregáveis da tela somam as campanhas relacionadas, respeitando a precedência histórica da comissão descrita acima. O sufixo ordinal e um marcador final entre colchetes são tratados como identificação da iteração para esta listagem; a regra não altera `nome_mcc`, `campanha_id`, status, diário, MCC ou outras telas. Uma única campanha numerada sem outra iteração correspondente mantém o nome original, evitando remover uma numeração potencialmente parte do nome real do produto.

| Campo | Conteúdo |
|---|---|
| A | Data (serial Excel e rótulo) |
| B/C | Impressões / cliques Google |
| D/E | Cliques plataforma / avanço de pre-sell |
| F/G/H | Conversões / CTR / checkout |
| I/J | Custo médio USD / BRL |
| K/L | Parcela de impressões em primeira posição / parte superior |
| M/N | Orçamento diário / estratégia de lance e CPA desejado |
| O/P | Investimento BRL / valor de conversão BRL |
| Q | Observações/status normalizado |

Agregações financeiras usam F, O e P. Preserve zeros confirmados e estados ausente/inválido.

O registro da campanha pode incluir `pausa_confirmada_em`, uma propriedade aditiva do objeto armazenado na base existente. Ela só é preenchida por estado operacional pausado explícito da MCC: D0 prevalece; se D0 estiver ausente ou sem estado operacional, o estado pausado explícito D−1 confirma a pausa. Ausência em coleta ativa continua sendo `status_origem: 'ausencia_na_coleta'` e não preenche a confirmação. Uma observação ativa explícita posterior remove essa marca e reabre a série. No Diário, a linha da confirmação é inclusiva; linhas MCC posteriores não entram enquanto a pausa confirmada continuar. Dados históricos persistidos permanecem intactos, com a view limitando o que exibe. A Observabilidade/tooltip deve diferenciar a data confirmada da simples última aparição.

## Event Log

O objeto de evento guarda ID estável, timestamp, tipo, `source`, IDs de produto/teste/conta/campanha/iteração, GEO explícito, nome/ordem observada, `snapshot` e `metadata`. Os snapshots guardam os campos MCC como `{valor, estado}` e os campos operacionais disponíveis; CPA real/ROI derivados só aparecem quando os dados de entrada permitem cálculo. Veja [observabilidade-decisoria](../../observabilidade-decisoria/SKILL.md) para regras semânticas.

Importações devem unir eventos por `event_id`. IDs são idempotentes e writes são append-only; não use `put` para stores de evento. Carregamento de backup une o Event Log importado ao já persistido. Não há eventos retroativos ao migrar bases antigas.

## Bancos isolados

- Meu Tempo: `painel-meu-tempo`, não misturar com campanhas.
- Lista de Gerente: `radar-lista-gerente`.
- E-commerce GM: `radar-top-performance`.
- Glimpse: `radar-glimpse`, compartilhado por `productKey`.
- Radar SpyHero: `radar-curadoria`.

## Faturamento — domínio financeiro independente

O Faturamento usa stores próprias (`billing_sales`, `billing_movements`, `billing_audit`, `billing_meta`) no IndexedDB compartilhado `painel-campanhas`, atualmente schema versão 5. O schema é declarado uma única vez em `src/storage/hub-database.js`; painel, Preparador e módulos financeiros delegam a abertura a essa infraestrutura. Não misture vendas/comissões com `vendas_provisorias`, `diario`, `controle_macro_historico` ou Event Log operacional. Regras de negócio, seed local versionado, índices, backups e cálculos estão documentados em [billing.md](billing.md).

## Controle de gastos — domínio pessoal independente

As regras de orçamento, reserva, competência e apresentação ficam em [Controle de gastos pessoais](../../controle-gastos-pessoal/SKILL.md) e [regras de domínio](../../controle-gastos-pessoal/references/regras-de-dominio.md). Esta seção permanece como referência do schema e da persistência.

`/?view=personal-finance` é a tela Controle de gastos, no grupo Pessoal. Ela usa o mesmo IndexedDB local `painel-campanhas`, mas mantém domínio e stores próprios, separados do Faturamento, do Controle Macro e da operação MCC:

- `personal_finance_groups`, chave `group_id`;
- `personal_finance_categories`, chave `category_id`, índice por grupo e ordem;
- `personal_finance_months`, chave `month_key` (`AAAA-MM`);
- `personal_finance_entries`, chave `entry_id`, índices por mês, categoria e par mês/categoria;
- `personal_finance_debts`, chave `snapshot_id`, índices por mês e item;
- `personal_finance_funds`, chave `snapshot_id`, índices por mês, item e tipo (`available`/`reserve`).

A versão 5 cria essas stores de modo aditivo na infraestrutura única `src/storage/hub-database.js`, utilizada pela tela principal, Preparador MCC, Faturamento e Controle de gastos. Nenhum schema novo ou migração de dados foi introduzido pela extração. Não rebaixar a versão nem excluir stores ao migrar.

O mês corrente é o período inicial. Entradas mensais guardam cópias dos nomes, grupo e moeda vigentes naquele mês, além de planejado e realizado. `actual_amount: null` significa sem lançamento; `actual_amount: 0` é zero observado. Criar um mês copia apenas o planejado anterior ou usa os padrões vigentes das categorias, nunca os realizados. Dívidas em aberto, disponibilidade e reservas são copiadas como ponto inicial do snapshot mensal, sem modificar o mês de origem; uma dívida marcada paga deixa de ser carregada para meses novos.

BRL e USD são dimensões independentes: somários, realizado, dívida, saldo e posição líquida são calculados separadamente. Não converter nem combinar moedas. Alterar/inativar categorias e grupos não reescreve snapshots antigos; um novo mês usa a configuração atual. A tela consulta somente os registros do mês escolhido por índice; leitura integral das stores ocorre apenas no backup explícito.

No resumo global da reserva, o **saldo futuro líquido** soma `planejado - realizado` por linha planejada dentro do escopo atual/futuro. Portanto, uma linha acima do planejado reduz o saldo líquido e pode gerar valor negativo; itens sem planejamento continuam fora. A **diferença da reserva** é `reserva global - saldo futuro líquido`, com BRL e USD independentes. Não usar soma absoluta de saldos/excedentes, pois isso faria o gasto acima do plano diminuir indevidamente a diferença apresentada.

O backup completo JSON inclui `personal_finance`. Restauração valida a estrutura e pede confirmação quando substituir dados locais existentes. Backup antigo sem essa propriedade continua válido e preserva integralmente as stores pessoais atuais. O domínio não importa a imagem de referência, não se conecta a bancos/cartões e não se integra ao Faturamento ou à MCC.

Valide versões e stores antes de alterar qualquer banco local.

## Observabilidade da Curadoria — domínio separado

O banco IndexedDB `radar-curadoria-observability` (versão 1) não é o banco operacional nem os bancos das listas. Stores:

- `events`, chave `eventId`: sumários de ações salvas, com IDs de produto/oferta e origem;
- `event_details`, chave `detailId`: payload da avaliação individual, lido somente ao expandir o evento;
- `pretest_snapshots`, chave `snapshotId`: snapshot imutável `snapshot_decisao` criado na transição para “Subir campanha”;
- `correlations`, chave `correlationId`: ligação pendente/confirmada/revisada entre um snapshot e identidade(s) operacional(is), com trilha de correção.

Índices previstos para paginação e filtros: eventos por timestamp+ID, productKey+timestamp, nome normalizado+timestamp, origem+timestamp, tipo+timestamp e decisão+timestamp; snapshots por data/produto/origem/tipo; correlações por estado/produto/origem. A busca por nome usa `productNameKey` (normalização apenas para localizar; não confirma identidades). Writes comuns fazem lookup por ID e adicionam apenas o evento/detalhe novo na transação; a criação do snapshot/correlação ocorre atomicamente no bundle da decisão. Não use `getAll()` em caminhos de gravação ou abertura da tela.

`/?view=curation-observability` carrega 30 eventos por página (até 600 chaves examinadas por solicitação quando filtros são esparsos). Sumários e contagem são consultados primeiro; `event_details` e `pretest_snapshots` só são buscados ao expandir. Análise Glimpse mantém referência imutável ao registro em `radar-glimpse/analyses` em vez de copiar texto bruto. A projeção do snapshot guarda só a avaliação de Trends atual, última avaliação de Imagens por país e indicadores compactos de Glimpse; refinamentos/eventos anteriores ficam na timeline, não são reprocessados no ato da decisão.

A captura acontece depois de salvar no banco original e é iniciada no próximo turno de tarefa; não deve segurar a confirmação visual do salvamento. `assessmentId`, `analysisId` e identidade da transição tornam o write idempotente via consulta por chave, sem varredura histórica. Se a captura falhar, mantenha intactos os registros originais e registre o erro sem apagar ou sobrescrever histórico. A exportação JSON pode percorrer stores inteiras somente após ação explícita; restauração mescla registros e nunca substitui IDs existentes. O Event Log de `painel-campanhas` segue sendo exclusivamente da Observabilidade Decisória Operacional.

Uma correlação nasce pendente, com `offerId + origem` preservados como contexto. Nome normalizado gera somente candidatos do Event Log operacional; `product_id`, `test_id`, contas e campanhas só se associam após confirmação humana. Correção ou invalidação atualiza apenas `correlations.history`, não o snapshot nem o Event Log operacional. O índice de candidatos no MVP é construído somente quando o usuário pede a busca; essa operação sob demanda é o ponto mais sujeito a custo O(N) conforme o Event Log crescer.

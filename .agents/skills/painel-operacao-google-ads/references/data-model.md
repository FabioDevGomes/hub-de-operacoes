# Modelo e persistência

## Base de campanhas

O IndexedDB compartilhado `painel-campanhas` está na versão 5:

- `bases`, chave `atual`: base `base_campanhas_v1` sem duplicar fisicamente o Event Log;
- `catalogos`, chave `atual`: aliases, ocultações e datas oficiais dos Produtos Testados;
- `events`, chave `event_id`: objetos de telemetria imutáveis, acrescentados com `add`.

O botão **Baixar backup completo JSON** cria um único arquivo local com os dados da base, os bundles de Faturamento e Controle de gastos e um snapshot do catálogo no campo opcional `catalogo_produtos`. Esse campo usa o schema `catalogo_produtos_v1`; ele só existe no arquivo exportado e não incorpora o catálogo à entidade normalizada de campanhas ou à store `bases`. Ao carregar um backup que o contém, valide-o e grave base, catálogo e bundles incluídos na mesma transação IndexedDB. Um backup antigo sem `catalogo_produtos` deve continuar carregando normalmente e preservar o catálogo local; campos legados `produtos_aliases`/`produtos_ocultos` ainda podem ser migrados. Não há mais exportação independente do catálogo; `Carregar catálogo` permanece para arquivos separados já existentes.

A migração v3 acrescentou `events`; a migração v4 acrescentou stores do Faturamento; a migração v5 acrescenta stores próprias do Controle de gastos. As migrações são aditivas: preservam as stores existentes e não as recriam nem apagam.

O objeto normalizado de base tem `mccs`, `campanhas`, `diario`, `campos_operacionais`, `importacoes`, `snapshots_campanhas`, `vendas_provisorias`, `manifesto_atual` e `event_log`. `mccs` é um catálogo aditivo dentro da base existente, indexado pelo ID completo da conta de administrador; cada campanha relacionada guarda esse valor em `mcc_id`, separado do `conta_id` da conta-cliente. O registro do catálogo guarda `id`, nome MCC visível e nomes anteriores quando há renomeação. Telas devem resolver o rótulo de `campanha.mcc_id` pelo catálogo compartilhado, sem inferir MCC pelo prefixo/ID da conta-cliente ou pelo nome de campanha. `event_log` é a visão em memória/exportação que une os eventos da store `events` e eventuais eventos de backups antigos. Persistência de campanha grava as demais propriedades em `bases` e mescla eventos novos à store dedicada sem atualizar ou remover IDs existentes.

A extensão identifica o contexto pelo cabeçalho visível da conta administradora e encaminha `managerAccountId` + `managerAccountName`. O manifesto usa `identificacao_mcc: {id, nome}` e associa cada campanha por `mcc_id`/`mcc_nome`; a importação mantém no banco `mccs[]` e `campanhas[].mcc_id`. O ID é a chave técnica estável, e o nome da MCC — atualmente **MCC e-com** e **MCC Nutra** — é o rótulo a mostrar ao usuário. D0/D−1 só podem ser combinados se os IDs da MCC forem iguais. Capturas D0 locais são agrupadas por MCC; registros antigos sem essa origem ficam no grupo “MCC não identificada · histórico anterior”, sem atribuição presumida. Não requer nova store nem incremento do schema IndexedDB; `normalize` inicializa `mccs` em bases legadas e o backup da base carrega o catálogo.

Na importação de várias MCCs com IDs completos, `manifesto_atual` é uma projeção consolidada das últimas capturas por conta. O campo aditivo `escopo_contas` registra os IDs conservados e cada entrada pode ter `datas_coleta`, as datas em que sua própria conta é autoritativa. A atualização só reavalia campanhas das contas recebidas; ausência numa MCC não pausa campanhas de outra MCC nem desativa suas vendas automáticas. Campanhas ausentes dentro da conta recebida recebem retratos `presente:false`, sem apagar o Diário. Retratos das demais contas conservam as datas e os valores originais. Visão Geral, CPA, Produtos Testados e Controle Macro aplicam as substituições por campanha/data, sem remover contribuições de outras contas. Não há nova store nem alteração de schema; normalize e backup preservam os campos aditivos.

O ajuste de ROI mínimo da Visão Geral é por campanha e permanece no campo aditivo `campanhas[].roi_minimo_pct` da base existente. O diálogo calcula o limite máximo e o percentual um a partir do outro usando a receita da mesma projeção; ao confirmar, grava somente o percentual e recalcula limite/saldo na apresentação. Não há alteração de schema ou store. Percentual negativo é permitido somente acima de −100%, para manter válida a fórmula `limite = receita / (1 + ROI/100)`.

### ROI no momento do registro de venda manual

Cada novo lançamento rápido recebe `vendas_provisorias[].roi_no_registro` (version 1) antes do salvamento atômico da base e do espelho de Faturamento. A fotografia guarda ID da campanha, instante do registro, data/hora/valor originais da venda, investimento e receita acumulados em BRL, taxa operacional USD/BRL, última data MCC da campanha e ROI percentual. Não requer store nem migração de schema. O backup normal da base preserva a propriedade aditiva.

`src/overview/sale-roi-domain.js` calcula `(receita acumulada - investimento acumulado) / investimento acumulado * 100`, com a venda recém-lançada incluída uma vez. Usa as substituições MCC autoritativas de `OverviewDomain` e a cobertura de vendas manuais de `CampaignDatabase.salesAdjustmentMap`, reconciliadas em uma cópia de apresentação contra D0/D−1, inclusive quando o Diário estiver defasado. O pareamento MCC é agregado/FIFO, não evidência de uma transação individual. Investimento ausente/zero ou receita indisponível produzem `roi_percent:null` e motivo, nunca zero artificial.

A fotografia não é recalculada ao importar MCC, confirmar D−1, recarregar ou editar o lançamento; o Diário identifica correções e mantém os dados originais usados. Se o vínculo mudar de campanha, a fotografia original permanece armazenada, mas não é mostrada como ROI da nova campanha. Registros antigos não são preenchidos retroativamente. As colunas da Visão Geral usam as duas primeiras vendas manuais não canceladas em ordem de data/hora da venda (registro e ID desempatarão); vendas antigas sem fotografia mantêm sua posição e exibem `—`. Trata-se de vendas manuais registradas, não de uma identificação de transações individuais de todo o histórico agregado MCC. O Diário mostra todas, inclusive conciliadas e terceira venda em diante, em quadro próprio separado de A–Q e do recorte da pausa.

Preferências de colunas pertencem à view: `localStorage['hub:overview:visible-columns:v1']`. Ocultar uma coluna não altera dados/cálculos, períodos ou filtros; Campanha permanece obrigatória. Colunas identificadas por chave mantêm largura, alinhamento e ordenação ao ocultar as anteriores. A preferência é independente do backup financeiro.

### Histórico legado consolidado — migração única de `totais`

Não é uma store ou base nova: a migração v1 reutiliza `bases/atual` e acrescenta `legacy_totais_migration: {version, source, applied_at, report}` à base. Campanhas novas da carga usam `registro_origem: 'legacy_totais'`, `status: 'historico'`, nome completo em `nome_mcc`/`nome_exibicao` e `legacy_totais` com `schema`, `origin`, número histórico, `end_date`, `account_legacy`, métricas e valores derivados. Campanhas nativas inequívocas mantêm sua identidade/status e recebem apenas `legacy_totais`; seu histórico diário, MCC, D0/D−1, vendas e Event Log não são substituídos. Registros nativos sem marcador explícito continuam sendo considerados de origem `native` por compatibilidade.

O resumo guarda `investment_brl`, `clicks`, `conversions` e `commission_brl` como `{value, state}`: zero observado é `0/observed`; célula vazia é `null/missing`; marcador textual não numérico é `null/unknown`. Conta antiga é texto literal, sem conversão automática para `conta_sufixo`. Data ausente fica `null`. Lucro é derivado somente quando investimento e comissão são observados; ROI somente quando a comissão e um investimento maior que zero são observados. O ROI da planilha, que é fórmula, não é outra fonte de verdade. Lucro não é inferido a partir de comissão ausente, ainda que uma fórmula antiga na planilha mostre um número.

`src/legacy-totais-migration.mjs` valida o payload local, detecta nomes exatos duplicados, conta/nome conflitante, colisões e divergências nativas antes de modificar a cópia da base. Se qualquer associação ficar ambígua, não grava a migração nem seu marcador. Correspondência usa `nome_mcc` literal; conta só desempata quando o texto cru da conta coincide literalmente com metadado operacional disponível, sem reduzir ID a sufixo. O relatório v1 guarda linhas analisadas, campanhas válidas/criadas/já existentes, vínculos, duplicidades evitadas, ambiguidades, datas ausentes, linha(s) de resumo ignorada(s), divergências e totais por valores observados. O marcador torna reload/build idempotentes. O resumo legado só é mostrado ao abrir a campanha legada na seção Histórico; o renderizador da tabela diária permanece sem datas artificiais. `Produtos Testados` usa o agrupamento atual sobre a mesma coleção `campanhas`; sua coluna **Total faturado** agrega por produto a comissão histórica observada por campanha. Para evitar dupla contagem, só acrescenta diário e ajustes de vendas provisórias em datas estritamente posteriores ao `end_date` do resumo. Se houver comissão observada sem data final, usa essa comissão e não adiciona valores diários/provisórios sem período comprovadamente posterior; quando não houver comissão histórica observada, usa o diário e os ajustes provisórios disponíveis. Zero observado permanece válido; `missing`/`unknown` não é tratado como zero. Essa regra afeta apenas Produtos Testados: não altera dados diários/MCC nem o resumo da campanha na seção Histórico.

Na mesma listagem, a coluna **Vendas** agrega, para todas as campanhas relacionadas, conversões históricas com estado `observed`, valores diários MCC da coluna F e snapshots D−1/D0 das campanhas atuais. Um snapshot substitui o dado diário da própria data em vez de ser somado a ele; se houver D−1 e D0 para a mesma data, D−1 prevalece. Para evitar sobreposição com o resumo `legacy_totais`, dados diários/snapshots e vendas provisórias só entram em datas posteriores ao `end_date`; quando conversões históricas observadas não têm data final, preserva-se apenas o total histórico. Vendas provisórias não conciliadas são adicionadas somente no excedente sobre conversões observadas na mesma campanha/data. Zero observado é exibido como zero; sem fonte observada para o produto, a coluna fica sem valor (`—`). A consolidação é somente de apresentação e não altera base ou Diário de campanha.

A coluna **Lucro total** agrega, para todas as campanhas relacionadas, o investimento legado observado (`investment_brl`), o investimento diário da coluna O e os snapshots MCC D−1/D0 convertidos para BRL conforme a moeda. Snapshots substituem o diário da própria data; D−1 prevalece em conflito. Para evitar sobreposição, diário/snapshots só entram depois do `end_date` quando há investimento histórico observado; sem data final, preserva-se só o resumo legado. O lucro é **Total faturado − investimento total** e fica sem valor (`—`) se faltar qualquer um dos totais em ao menos uma campanha relacionada; zero observado permanece válido. A coluna é apenas uma derivação de apresentação e não grava nem altera os dados de origem.

Payloads de recuperação são privados em `data-local/`, ignorados pelo Git, e nunca são entradas do build nem carregados na inicialização. Não versionar o XLSX nem o JSON de campanhas. `legacy_totais` já persistido viaja no backup normal da base JSON; `CampaignDatabase.normalize`/`mergeEventLogs` preservam propriedades aditivas e o runtime mantém seus resumos/relatórios. A restauração de dados depende de ação explícita do usuário.

`controle_macro_historico` é um campo aditivo opcional na base existente (não uma nova store/schema). Guarda os dias importados da planilha de controle macro, com data, investimento, faturamento, cliques, vendas e observação. A agregação em `src/control-macro/domain.js` combina esse histórico com `diario` por métrica:

- Nas datas exatas D0/D−1 do manifesto atual persistido, a captura mais recente prevalece para investimento, faturamento, cliques e vendas, inclusive valores menores ou zero. O adaptador fornece essas datas explicitamente ao domínio; o histórico da planilha permanece armazenado, mas não volta como fallback nessas datas.
- Fora das datas da captura atual, quando existe uma linha histórica para a data, os valores não vazios da planilha prevalecem para investimento, faturamento, cliques e vendas.
- A partir de `2026-09-13` (inclusive), MCC/D−1 preenche cliques e vendas somente quando o respectivo campo histórico está ausente (`null`). Zero explícito na planilha é válido e não deve ser substituído. Antes dessa data, lacunas históricas de cliques/vendas continuam ausentes.
- Se não existe uma linha histórica para a data, os dados MCC agregados podem formar a linha do dia. Ausência de valor não é convertida em zero.
- `salesAdjustmentMap()` mantém vendas e comissão provisórias separadas das métricas oficiais; pendências não se tornam conversões oficiais. Para exibição no Controle Macro, fornece também os lançamentos provisórios pendentes com produto/valor, somente em memória. Nessa projeção, linhas autoritativas MCC D0/D−1 substituem os dados diários cobertos antes de reconciliar os ajustes, para que uma captura recém-confirmada não continue rotulada como provisória quando o Diário ainda está defasado; campos de conversão ausentes não são tratados como zero. Isso é somente visual e nunca regrava a venda ou o Diário. Conversões oficiais usam campanha MCC → identidade de produto do catálogo; o agregado histórico da planilha não possui detalhe por produto e só recebe atribuição MCC quando a contagem oficial diária coincide. Anotações históricas explícitas são preservadas; sem outra evidência, manter a venda como produto não identificado. Nada disso altera o schema nem cria transações oficiais.
- Conversões MCC D−1 e D0 positivas fracionárias (por exemplo, `0,98`) contam como uma conversão reconhecida para evitar duplicidade. Só D−1 altera o estado oficial da venda manual para conciliada; D0 mantém o estado provisório. O aviso de valor real na Visão Geral abre uma lista compacta para confirmar cada valor em reais. A confirmação fica ligada à assinatura exata da evidência (campanha, data, período, contagem e comissão MCC parcial); se essa evidência mudar, o aviso volta. Quando há venda manual vinculada, ela recebe o valor confirmado; sem venda vinculada, um ajuste aditivo na base guarda o valor real sem inventar transação. Em ambos os casos, os totais derivados substituem a comissão parcial pelo valor real, e o agregado MCC no Faturamento reflete BRL sem marcar recebimento como pago. A mesma evidência reaplicada preserva a confirmação. Contagem não pareada não recebe atribuição presumida, e não há nova store, migração ou alteração da base ao renderizar.
- Na Visão Geral, o lucro D0 usa a comissão observada somada ao `commissionAdjustment` provisório da mesma campanha e data D0, menos o investimento observado. O ajuste é apenas para a projeção diária: não converte a venda provisória em conversão oficial nem grava dados ao renderizar.
- De `2026-06-10` a `2026-06-24`, inclusive, a tela mantém os dias sem dados com a observação de operação fora do ar por suspensões. Dias com vendas positivas recebem destaque verde suave; o destaque de suspensão vermelho suave tem precedência visual se ambos coincidirem.

O Preparador MCC grava a base `atual` no mesmo IndexedDB `painel-campanhas` e emite `BroadcastChannel('painel-campanhas')` com `type:'base-updated'`. O painel recarrega a base, recompõe o agregado do Controle Macro e renderiza novamente; portanto, uma importação D−1 atualiza a tela sem uma importação separada do histórico. Ao abrir ou recarregar o painel, a base local também é restaurada e os agregados são recalculados. Se o aviso de atualização automática falhar, a tela pode ser recarregada; não reimporte para tentar forçar a atualização.

### Política da fonte operacional daqui em diante

- Não solicitar nem importar novamente a planilha para a atualização diária do Controle Macro. Usar as cargas MCC D0 (parcial) e D−1 (fechamento do dia anterior) como fonte operacional dos novos dados.
- Preservar `controle_macro_historico` já importado como histórico legado; não apagá-lo ou migrá-lo automaticamente.
- A substituição nas datas atuais foi autorizada: usar a última captura persistida também quando os números diminuírem. Nas demais datas, manter a precedência histórica acima; não estender o recorte nem apagar a planilha.

### Projeção da captura atual para cálculos financeiros

`OverviewDomain.authoritativeMccSnapshots` normaliza D0/D−1 do manifesto persistido, moeda e datas. `replaceAuthoritativeDates` substitui as contribuições das datas atuais em totais acumulados, preservando dias anteriores e observações ausentes. O mapa diário de `campaignTotalsMap` mantém campos ausentes como `null`, não zero. Visão Geral, Mapa por Conta, análise CPA, Controle Macro e Produtos Testados recebem essa mesma fotografia; lucro, ROI, CPA, limites e saldo de teste são derivados dos valores corrigidos. A comissão e o investimento em BRL usam a taxa operacional vigente quando a MCC informa USD.

Em manifestos consolidados, um período só gera snapshot autoritativo quando sua data pertence a `campanha.datas_coleta`. Um placeholder de D−1 não recebido por uma MCC não pode herdar a data global do D−1 recebido por outra MCC e ocultar o Diário. Nesse caso, a Visão Geral consulta o registro da mesma data no Diário, sem buscar dias anteriores, alterar a base ou substituir zero/ausência de um período efetivamente capturado. Regressão: `tests/overview-d1-mcc-scope.test.mjs`.

Campanhas sem métricas no retrato atual não contribuem com linhas antigas do Diário nessas datas, exceto quando uma captura D0 da extensão é explicitamente filtrada para campanhas ativas e há uma observação D0 anterior da mesma campanha, MCC e data. Nesse caso, os valores anteriores são preservados como `retida_no_dia:true`, enquanto `presente:false` continua registrando ausência na captura atual; os últimos valores observados contribuem nos totais da data, sem serem reaplicados em dias seguintes. `captura_D_zero` identifica a origem/filtro, e `cobertura_D_zero_por_mcc` mantém a cobertura por gerente entre importações da mesma base. A Visão Geral não rotula o total como parcial e não fabrica dados que nunca foram observados. Ausência não confirma ausência de vendas, pausa ou zero, nem exclui o histórico. Zero explicitamente informado continua observado. D−1 tem prioridade se dois períodos apontarem a mesma data. Vendas provisórias manuais continuam como ajustes separados, sem fabricação de conversões ou recebimentos. Em Produtos Testados, a proteção de sobreposição com `legacy_totais.end_date` continua independente por métrica.

Faturamento permanece um domínio de vendas/comissões, não um demonstrativo de custo dos anúncios. Seus totais e gráfico consultam os agregados MCC atualizados no banco; não se subtrai investimento publicitário de vendas ou de movimentos de Caixa. Ver [billing.md](billing.md) para proteção de pagamentos e sincronização.

## Diário A–Q

O módulo é apresentado na interface como **Diário de campanha**: uma seleção abre o diário de uma campanha específica, não um diário consolidado de produto. O vínculo de produto é uma relação um-para-muitos na visão de Produtos Testados: a mesma família/identidade de produto pode listar várias campanhas relacionadas, e seus registros diários permanecem separados pela chave de campanha. Preserve nomes MCC completos e `campanha_id`; não funde métricas de campanhas só porque pertencem ao mesmo produto.

Se uma campanha ativa mudar somente o percentual CPA no título MCC, `CampaignDatabase.campaignCpaChangeCandidates` só preserva o ID existente quando a estratégia estiver marcada como CPA nos manifestos antigo e atual, o título for idêntico exceto por esse percentual, o título antigo estiver no manifesto anterior e não aparecer na captura atual, e a conta completa coincidir entre os dois manifestos e a campanha. A importação mantém as linhas anteriores, associa a nova data ao mesmo ID e grava o novo rótulo CPA na coluna N. Mudanças ambíguas ou em outros trechos do nome continuam como identidades separadas; a mudança de CPA não deve fabricar métricas para datas sem captura.

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
- Hot Offers MS: `radar-hot-offers-ms`.
- Top Offers CB: `radar-clickbank-top-offers`.
- Glimpse: `radar-glimpse`, compartilhado por `productKey`.
- Radar SpyHero: `radar-curadoria`.

A página compartilhada de Glimpse analisa e persiste automaticamente cada nova colagem como snapshot sanitizado em `radar-glimpse`; o `analysisId` mantém o salvamento por **Concluir** idempotente. A referência na Observabilidade da Curadoria é iniciada em segundo plano apenas após a gravação original. A regra vale para Lista de Gerente, E-commerce GM, Hot Offers MS, Top Offers CB e SmartAdv, sem unificar os bancos próprios dessas telas.

`radar-clickbank-top-offers` schema v2 retains the original `captures` store and additively creates `offerMetadata`, `trends`, and `images`, all analysis stores keyed by `offerKey`. Manual countries stay separate from source captures because the ClickBank Marketplace paste contains no GEO. The screen's full v2 JSON backup includes all four stores; merge restore preserves local conflicts and accepts v1 capture-only backups.

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

O mês corrente é o período inicial. Entradas mensais guardam cópias dos nomes, grupo e moeda vigentes naquele mês, além de planejado e realizado. `actual_amount: null` significa sem lançamento; `actual_amount: 0` é zero observado. A linha **Cartão Nubank** mantém o mesmo formato visual de Planejado/Realizado das demais: `card_debt_amount` é projetado como o total da fatura em Planejado, `actual_amount` registra o valor pago em Realizado e o saldo em aberto é `max(0, fatura - pagamento)`. Em registros antigos sem `card_debt_amount`, a interface lê o valor legado planejado (ou realizado se não houver planejado) como fatura, sem regravar ou apagar o histórico; ao editar, grava o campo aditivo no objeto existente. O agregado de despesas e a linha não duplicam esse saldo: a dívida em aberto é somada separadamente uma vez no saldo global. Criar um mês copia apenas o planejado anterior ou usa os padrões vigentes das categorias, nunca os realizados; para o Cartão Nubank, carrega somente o saldo da fatura ainda em aberto e inicia o pagamento do novo mês em branco. Dívidas em aberto, disponibilidade e reservas são copiadas como ponto inicial do snapshot mensal, sem modificar o mês de origem; uma dívida marcada paga deixa de ser carregada para meses novos.

O quadro global da reserva no topo é um componente compartilhado pelas visões Mensal e Consolidado. Mantenha os cartões e as orientações globais idênticos entre as duas; uma alteração em informação global deve ser feita no renderizador comum, sem cópias específicas por visão.

BRL e USD são dimensões independentes: somários, realizado, dívida, saldo e posição líquida são calculados separadamente. Não converter nem combinar moedas. Alterar/inativar categorias e grupos não reescreve snapshots antigos; um novo mês usa a configuração atual. A tela consulta somente os registros do mês escolhido por índice; leitura integral das stores ocorre apenas no backup explícito.

No resumo global, **gastos realizados** após o primeiro aporte reduzem a reserva; o **planejamento em aberto** considera apenas linhas atuais/futuras ainda no escopo e usa `max(planejado - realizado, 0)`. Assim, realizado de R$ 400 em plano de R$ 300 reduz a diferença em R$ 400, não em R$ 300 nem R$ 100. A dívida atual do Cartão Nubank é apurada separadamente pelo snapshot mais recente e descontada uma vez; os valores planejado/realizado legados desse cartão não entram nos agregados de despesas. A fórmula exibida é `saldo disponível = reserva global - gastos realizados - planejamento em aberto - dívida atual Nubank`, com BRL e USD independentes. O saldo não deve receber crédito por estouro de orçamento.

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

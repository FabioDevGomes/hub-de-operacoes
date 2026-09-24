# Modelo e persistência

## Base de campanhas

O IndexedDB compartilhado `painel-campanhas` está na versão 3:

- `bases`, chave `atual`: base `base_campanhas_v1` sem duplicar fisicamente o Event Log;
- `catalogos`, chave `atual`: aliases, ocultações e datas oficiais dos Produtos Testados;
- `events`, chave `event_id`: objetos de telemetria imutáveis, acrescentados com `add`.

A migração para a versão 3 só acrescenta `events` em `onupgradeneeded`; não apaga nem recria stores existentes.

O objeto normalizado de base tem `campanhas`, `diario`, `campos_operacionais`, `importacoes`, `snapshots_campanhas`, `vendas_provisorias`, `manifesto_atual` e `event_log`. `event_log` é a visão em memória/exportação que une os eventos da store `events` e eventuais eventos de backups antigos. Persistência de campanha grava as demais propriedades em `bases` e mescla eventos novos à store dedicada sem atualizar ou remover IDs existentes.

`controle_macro_historico` é um campo aditivo opcional na base existente (não uma nova store/schema). Guarda os dias importados da planilha de controle macro, com data, investimento, faturamento, cliques, vendas e observação. A agregação em `src/control-macro/domain.js` combina esse histórico com `diario` por métrica:

- Quando existe uma linha histórica para a data, os valores não vazios da planilha prevalecem para investimento, faturamento, cliques e vendas. MCC nunca substitui investimento ou faturamento dessa linha.
- A partir de `2026-09-13` (inclusive), MCC/D−1 preenche cliques e vendas somente quando o respectivo campo histórico está ausente (`null`). Zero explícito na planilha é válido e não deve ser substituído. Antes dessa data, lacunas históricas de cliques/vendas continuam ausentes.
- Se não existe uma linha histórica para a data, os dados MCC agregados podem formar a linha do dia. Ausência de valor não é convertida em zero.
- `salesAdjustmentMap()` mantém vendas e comissão provisórias separadas das métricas oficiais; pendências não se tornam conversões oficiais.
- De `2026-06-10` a `2026-06-24`, inclusive, a tela mantém os dias sem dados com a observação de operação fora do ar por suspensões. Dias com vendas positivas recebem destaque verde suave; o destaque de suspensão vermelho suave tem precedência visual se ambos coincidirem.

O Preparador MCC grava a base `atual` no mesmo IndexedDB `painel-campanhas` e emite `BroadcastChannel('painel-campanhas')` com `type:'base-updated'`. O painel recarrega a base, recompõe o agregado do Controle Macro e renderiza novamente; portanto, uma importação D−1 atualiza a tela sem uma importação separada do histórico. Ao abrir ou recarregar o painel, a base local também é restaurada e os agregados são recalculados. Se o aviso de atualização automática falhar, a tela pode ser recarregada; não reimporte para tentar forçar a atualização.

### Política da fonte operacional daqui em diante

- Não solicitar nem importar novamente a planilha para a atualização diária do Controle Macro. Usar as cargas MCC D0 (parcial) e D−1 (fechamento do dia anterior) como fonte operacional dos novos dados.
- Preservar `controle_macro_historico` já importado como histórico legado; não apagá-lo ou migrá-lo automaticamente.
- **Limite importante:** o código atual ainda aplica a regra de precedência histórica acima se existir linha da planilha para a mesma data. A política futura de usar MCC como fonte em datas sobrepostas ainda não altera esse código. Se for necessário substituir valores históricos existentes por MCC, isso exige uma alteração de regra de negócio aprovada e testada; não presumir que uma nova carga MCC sobrescreveu a planilha.

## Diário A–Q

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

## Event Log

O objeto de evento guarda ID estável, timestamp, tipo, `source`, IDs de produto/teste/conta/campanha/iteração, GEO explícito, nome/ordem observada, `snapshot` e `metadata`. Os snapshots guardam os campos MCC como `{valor, estado}` e os campos operacionais disponíveis; CPA real/ROI derivados só aparecem quando os dados de entrada permitem cálculo. Veja [observabilidade-decisoria](../../observabilidade-decisoria/SKILL.md) para regras semânticas.

Importações devem unir eventos por `event_id`. IDs são idempotentes e writes são append-only; não use `put` para stores de evento. Carregamento de backup une o Event Log importado ao já persistido. Não há eventos retroativos ao migrar bases antigas.

## Bancos isolados

- Meu Tempo: `painel-meu-tempo`, não misturar com campanhas.
- Lista de Gerente: `radar-lista-gerente`.
- E-commerce GM: `radar-top-performance`.
- Glimpse: `radar-glimpse`, compartilhado por `productKey`.
- Radar SpyHero: `radar-curadoria`.

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

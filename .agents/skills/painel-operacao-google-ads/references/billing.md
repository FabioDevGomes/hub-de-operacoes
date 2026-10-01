# Faturamento

## Escopo e semântica

`/?view=billing` é um módulo de vendas/comissões recebidas, separado das métricas de anúncios e do Controle Macro. Uma venda registra o valor potencial/comercial; recebimentos e reembolsos são movimentos financeiros com data efetiva própria. A existência de uma venda não significa que o dinheiro entrou. Há integrações autorizadas para lançamentos manuais vinculados e para totais de conversão MCC agregados por campanha/data. Isso não funde os domínios nem transforma conversão MCC em pagamento.

## Lançamento manual e confirmação MCC

- O registro manual criado pelo fluxo rápido (`CampaignDatabase.addProvisionalSale`) recebe `billing_sale_id` determinístico, derivado da chave de duplicidade, e os metadados de campanha, produto, data, plataforma, conta e valor.
- O lançamento espelhado entra em `billing_sales` com `confirmation_status: 'manual'` e `payment_status: 'pending'`. A tabela de Competência mostra “Lançamento manual” em coluna própria.
- Ao importar um manifesto que contém D−1, `reconcileProvisionalSales` concilia por `campanha_id + data + quantidade oficial de conversões`, ordenando lançamentos manuais pela hora de registro. As mudanças retornadas em `reconciledSales` atualizam o espelho financeiro na mesma transação, incluindo registros legados cujo `billing_sale_id` pode ser reconstruído do ID local `sale_<hash>`; o Faturamento passa a mostrar “Confirmada · MCC D−1” e guarda `confirmation_source`/`confirmed_at` com auditoria.
- A gravação da base MCC e a atualização dos espelhos financeiros usam a mesma transação IndexedDB no Preparador. O salvamento inicial da venda manual também grava os dois domínios em uma transação. Reimportações não duplicam registro nem auditoria se a confirmação não mudou.
- Confirmação significa somente que o D−1 confirmou uma conversão. Não mudar `payment_status`, não criar movimento de recebimento e não marcar “Paga” sem evidência de recebimento da plataforma.
- D0 não confirma vendas. A reconciliação oficial atual seleciona as primeiras N vendas manuais do grupo campanha/data, pois a MCC fornece totais agregados e não um identificador de transação. Quando houver várias vendas no mesmo grupo, a associação individual é uma aproximação FIFO, não uma prova de qual identificador foi convertido; preservar isso como risco residual.
- A migração de lançamentos manuais legados é limitada às datas D0/D−1 do manifesto atual e usa a chave idempotente `mcc-manual-sale-backfill:current-period-v2`; não backfillar indiscriminadamente todo o histórico financeiro, que pode já conter a mesma venda importada por outra fonte. Para IDs legados `sale_<hash>`, o vínculo determinístico é `manual-sale:cmp_<hash>`; não se cria uma nova conversão se o D−1 já estiver coberto pelo lançamento manual. Nas atualizações seguintes, o Preparador envia somente os IDs de lançamentos conciliados, evitando varrer o histórico completo a cada importação. Vendas criadas pelo formulário próprio do Faturamento ficam manuais, mas só o fluxo rápido do Hub possui chave de campanha para confirmação automática.
- `CampaignDatabase.importManifest` também gera `mccBillingSales` incrementalmente a partir de conversões explicitamente disponíveis no manifesto. Usa um ID determinístico por `campanha_id + data`; D0 cria o registro agregado provisório, e o D−1 seguinte atualiza o mesmo ID como confirmado. Assim, os registros de ontem confirmado e de hoje provisório coexistem sem duplicar o fechamento diário.
- O Faturamento relê a base persistida ao abrir a tela e, ao receber `base-updated` do Preparador em outra aba, sincroniza as métricas MCC antes de redesenhar. A migração histórica do Diário é idempotente, registrada em `billing_meta` (`mcc-diary-backfill:v1`) e executada uma vez; depois dela, a sincronização limitada ao retrato atual combina (a) métricas explícitas D0/D−1 do manifesto e (b) linhas do Diário somente nas datas exatas de D0/D−1 do manifesto atual. O fallback por data exige conversão positiva e usa o total/valor que já consta na célula do Diário; não usa a data do nome da campanha, nem transforma zero em venda. Isso cobre ausência de tags de período ou de métrica por campanha sem varrer/regravar o histórico inteiro. Um agregado D0 existente pode ser promovido por D−1, sem substituir registros MCC já confirmados nem seus dados de pagamento; `payment_status` continua preservado.
- Uma linha MCC é um agregado por campanha/data, nunca uma transação inventada por conversão. A coluna `Conversões` informa a quantidade, inclusive valor fracionário, e os KPIs contam a quantidade agregada. `valor_conversao` só é gravado na moeda original quando ela é explicitamente BRL ou USD; não converter nem assumir uma moeda desconhecida. O valor reportado pela MCC não é evidência de pagamento.
- Se já houver lançamento manual não cancelado para a mesma campanha/data, ele cobre uma conversão do total MCC. O agregado guarda somente a quantidade residual. Quando há esse vínculo, o valor MCC agregado não é repartido entre vendas individuais e fica ausente na linha residual, evitando dupla contagem financeira. Se todo o total já estiver coberto por lançamentos manuais, o agregado anterior fica inativo com estado `represented_by_manual`. Um novo lançamento manual criado depois de D0 reduz o agregado estável na mesma transação e invalida seu total monetário não separável.
- Se D−1 corrigir a contagem para zero, um agregado provisório existente fica inativo e marcado `not_confirmed`; se não houver conversão prévia, não é criada uma linha zero. Reimportar a mesma captura é idempotente. Conflitos em conversões ou valor de conversão não são espelhados sem confirmação de sobrescrita.
- Linhas `mcc_conversion_aggregate` não permitem edição/cancelamento direto, pois a fonte é a MCC; permanecem disponíveis histórico e movimentos explícitos de recebimento/reembolso. `payment_status` é preservado nas reimportações e não é alterado por confirmação D−1.

As moedas BRL e USD são dimensões independentes: não somar, converter ou preencher uma moeda a partir da outra. Destino bancário/conta financeira não faz parte do MVP. A tela alterna entre:

- **Competência:** vendas agrupadas pela data da venda; recebimentos/refundos vinculados pertencem ao contexto da venda.
- **Caixa:** somente movimentos com data efetiva no período. Venda sem pagamento datado não entra no caixa.

O status `unknown`/indefinido não equivale a pendente. “Pago” sem data continua pago, mas não cria movimento de caixa. Um recebimento parcial gera `partially_paid`; soma dos recebimentos completos leva a `paid`. Reembolsos são movimentos separados e não apagam/cancelam a venda. Cancelar venda a desativa com motivo e trilha, sem exclusão física.

## Persistência e auditoria

O IndexedDB `painel-campanhas` usa a versão 5 por migração **aditiva** declarada uma única vez em `src/storage/hub-database.js`; os consumidores delegam sua abertura à infraestrutura comum. A v4 acrescentou as stores do Faturamento abaixo; a v5 acrescenta somente as stores independentes de Controle de gastos (`personal_finance_*`), descritas em [data-model.md](data-model.md). Stores do Faturamento:

- `billing_sales`, chave `sale_id`, índices para data, status e dimensões de filtro;
- `billing_movements`, chave `movement_id`, índices para data efetiva, venda e tipo;
- `billing_audit`, chave `audit_id`, append-only;
- `billing_meta`, chave `key`, guarda versão do seed instalado.

Não mudar de versão apagando/recriando stores. Não varrer stores financeiras inteiras em cada gravação: consultas normais usam índices e intervalos; leituras agregadas ficam limitadas ao intervalo selecionado. `getAll` integral é permitido somente em backup/exportação explicitamente acionado.

Correções de valores/status de pagamento e mudanças no estado de confirmação devem gerar auditoria com antes/depois. Movimentos de recebimento/refund são registros independentes, cada um com data efetiva, valor/moeda, origem e notas. Não alterar/apagar o histórico de auditoria. `confirmation_status` (manual/provisional/confirmed/not_confirmed/represented_by_manual) e `payment_status` (pending/paid/partially_paid/unknown) são eixos diferentes.

## Histórico privado e seed de recuperação

O histórico de Faturamento vive somente nas stores locais do IndexedDB. Não existe seed financeiro em `src/` ou `dist/`, e abrir a tela nunca importa uma carga empacotada. Uma instalação ou navegador novo começa sem lançamentos financeiros.

O script offline `scripts/generate-billing-seed.py` permanece apenas como ferramenta privada de recuperação/migração. Sua saída deve ficar em `data-local/` (ignorado pelo Git) ou fora do repositório; o script bloqueia destinos dentro de `src/` e `dist/`. Não colocar a planilha original, JSON gerado, caminho absoluto, nome de usuário ou outros dados de ambiente no Git. `planSeedImport` e a chave histórica em `billing_meta` continuam legíveis por compatibilidade com bancos locais que receberam a migração antiga, mas o runtime não procura nem instala seed automaticamente.

## Backup e compatibilidade

Backup completo explícito inclui o bundle `billing` e pode incluir outros domínios locais independentes, como `personal_finance`. Um backup legado sem `billing` deve preservar as stores de Faturamento existentes; sem `personal_finance`, deve preservar as stores pessoais. Restauração que inclua `billing` deve validar os dados, avisar sobre substituição e aplicar o bundle de forma atômica com as demais partes compatíveis. Não alterar sem necessidade os dados base/MCC. O Preparador MCC compartilha o IndexedDB: mantenha nele apenas a declaração/migração de schema necessária, sem código ou regras de negócio do Faturamento ou do Controle de gastos.

## Interface e validação

A view fica em `src/billing/billing-view.mjs` e o domínio puro em `src/billing/billing-domain.mjs`; persistência em `src/billing/billing-storage.mjs`; estilos em `src/billing/billing.css` e `src/billing/billing-shell.css`. Use a classe `billing-page` no `body` para regras de escopo da página; não reutilize `billing-mode`, que pertence exclusivamente ao seletor Competência/Caixa. A tela não oferece importação XLSX. Mantenha o mês atual como período inicial, controles explícitos Competência/Caixa, filtros, dimensões, agregações e paginação.

Ao alterar:

1. Teste domínio, storage/backup e seed com `tests/billing-domain.test.mjs`, `tests/billing-storage.test.mjs` e `tests/billing-seed.test.mjs`.
2. Para mudanças na sincronização MCC, rode também `tests/database.test.mjs`, `tests/preparador-d0.test.mjs` e `tests/billing-view.test.mjs`; cubra D0→D−1, repetição idempotente, contagem agregada, moeda original, zero no D−1 e sobreposição com venda manual.
3. Execute `node build.mjs` e toda a suíte `tests/*.test.mjs`.
4. Faça inspeção visual da rota em uma origem IndexedDB isolada; verifique a navegação do menu, filtros, modos, tabela e diálogo de cadastro sem escrever no perfil real.
5. Revise `git status --short` para não incluir planilhas originais, base local, credenciais ou alterações alheias.

Risco de crescimento: agregações de intervalos muito longos carregam o conjunto correspondente à consulta indexada para compor os totais. Se o volume real tornar isso perceptível, medir primeiro antes de criar agregados pré-computados.

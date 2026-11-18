# Especificação técnica — avaliação de pausas pelo servidor a partir dos snapshots do Hub

**Estado (2026-11-16):** Fase 1, pacote base da Fase 2A, correção de disponibilidade e drenagem de backlog publicados pelo usuário. O SQL mostrou 20 snapshots avaliados em lotes de 5, 10 e 5 nas rodadas de 20:55, 21:00 e 21:05; todos com `candidate_count = 0`. A fila observada foi drenada. O contrato da Fase 2B está definido em [google-ads-auto-pause-phase-2b-data-contract.md](google-ads-auto-pause-phase-2b-data-contract.md). O Cron continua em prévia, sem `--execute`.

## 1. Objetivo

Fazer o servidor avaliar as regras de pausa quando receber uma captura D0 completa já produzida pelo fluxo atual do Hub. A avaliação deixa de depender do render da Visão Geral e dos timers JavaScript da tela; o worker do servidor decide quais campanhas são candidatas e registra os jobs na fila.

O Hub continua sendo o produtor das capturas Google Ads nesta etapa. O servidor não faz consultas de métricas próprias ao Google Ads e não cria snapshots quando o Hub/computador está desligado. Assim, o servidor fica independente da tela e do foco do Hub **depois que uma captura completa foi entregue**, mas ainda depende do Hub aberto para produzir e transmitir novas capturas.

## 2. Problema atual e limite do piloto

1. O Hub salva as capturas D0 completas em sua base local.
2. A seleção de candidatas hoje roda no fluxo da Visão Geral, quando a avaliação automática local é disparada.
3. `publish_evaluation` recebe campanhas já escolhidas pelo Hub; não contém os dados de todas as campanhas necessários para o servidor recalcular as regras.
4. O Cron de cinco minutos só processa jobs existentes. Ele não cria candidatas a partir das capturas.

Consequentemente, se a captura for salva enquanto a execução JavaScript da avaliação no Hub estiver atrasada, a criação do job também atrasa. O novo gatilho deve ser a **persistência de uma captura D0 completa**, e o cálculo deve ocorrer no servidor.

## 3. Fluxo proposto

1. A rotina atual conclui e persiste uma captura D0 no Hub.
2. Um adaptador fora da view da Visão Geral publica a captura concluída ao endpoint autenticado. A política continua sendo sincronizada pelo caminho já existente do Hub; esta etapa de ingestão não força uma sincronização de configuração nova. O disparo vem do término da captura, mesmo quando a Visão Geral não está selecionada.
3. O endpoint valida versão, identidade, integridade e completude. Capturas repetidas com o mesmo ID e hash são idempotentes; o mesmo ID com conteúdo diferente é conflito. A revisão de política permanece no contrato separado de sincronização e será registrada junto da avaliação na Fase 2.
4. O endpoint persiste a captura como `received` ou `blocked_incomplete`. Não avalia nem pausa dentro da requisição HTTP.
5. Na próxima rodada do Cron, o worker diagnostica snapshots completos já recebidos. Não espera outro intervalo de captura para registrar o diagnóstico. A política de atraso fica separada e pode ser usada em futura detecção de snapshot ausente/fallback de captura no servidor.
6. O avaliador grava um resultado por captura/regra e cria jobs somente para candidatas elegíveis. A criação do job abre a janela de revisão: o servidor define `cancel_until = job_created_at + confirmationSeconds`, e o Hub mostra o modal existente com esse prazo.
7. Em prévia, o worker avalia e registra motivos/contadores sem chamar a API do Google Ads. `--execute` permanece desligado durante a validação.

**Ponto de corte do gatilho:** o envio deve ser chamado pelo caminho de conclusão/persistência da captura automática, não por `renderTotals()`, pela abertura da Visão Geral, pela abertura do modal de pausa ou por uma pausa local confirmada.

## 4. Contrato de captura proposto

Operações autenticadas `begin_snapshot_upload`, `put_snapshot_part` e `finalize_snapshot_upload` no endpoint privado existente. A versão atual do envelope é `schema_version: 1`; o JSON normalizado é enviado em partes e só fica disponível como snapshot persistido após a conferência do tamanho e SHA-256 finais. A implementação aceita snapshots de até 8 MiB, com partes de 640 KiB, e não copia respostas brutas desnecessárias da Google Ads API.

### Envelope

- `schema_version` e `snapshot_id` estável;
- `period_type: D0`, `completed_at_utc` e horário de recebimento;
- revisão da política sincronizada pelo contrato de configuração atual; a Fase 1 não grava revisão junto ao payload de captura;
- lista completa das contas esperadas na captura;
- indicador de completude da consulta e da configuração por conta;
- identificação da origem e hash do conteúdo para idempotência.

### Conta

- `manager_customer_id`, `customer_id`, moeda e fuso horário;
- `query_complete` e `configuration_complete`;
- campanhas retornadas e informação explícita sobre se a lista foi completa.

### Campanha

- `campaign_id`, nome, status observado e identidade de produto usada pelo Hub;
- impressões, cliques, investimento/custo e demais métricas consumidas pelas regras;
- data inicial e sua origem, quando usada por `campaign_age`;
- cobertura/observação de cada métrica. `null` ou sem cobertura significa dado ausente, nunca zero.

### Venda e finanças

- proteção GuruMedia: estado `available`, `incomplete` ou `unavailable`, datas da fonte e IDs MCC/conta/campanha já atribuídos;
- para regras financeiras, totais de comissão por campanha/data, moeda e conversão usada, com cobertura explícita;
- sem IDs de venda, GCLID, dados de comprador ou vendas manuais.

A fonte de ClickBank e sua atribuição exata continuam fora desta especificação operacional até o outro agente concluir a definição. Enquanto uma fonte necessária estiver incompleta, a regra que depende dela não pode tratar ausência como zero nem liberar pausa.

### Exceções por campanha configuradas no Diário

O Hub já possui a configuração de exceções de pausa automática no Diário de campanha. O contrato atual a sincroniza com o servidor como `campaignExceptions`, associando a exceção pela identidade completa `managerCustomerId` (MCC) + `customerId` (conta) + `campaignId` e pelos códigos das regras em `excludedRules`. Essa exceção por regra é distinta da proteção por venda: uma impede regras selecionadas para uma campanha; a outra protege campanhas com venda registrada.

- A avaliação server-side deve receber a revisão atual da política e aplicar as exceções antes de criar uma candidata/job. Uma regra marcada como excluída para aquela identidade não gera job.
- O worker deve conferir novamente a política/exceção imediatamente antes da tentativa de pausa. Se a exceção for adicionada enquanto houver jobs pendentes, os jobs correspondentes à campanha e às regras excluídas são encerrados como `skipped`/excluídos e não podem pausar.
- Remover uma exceção não reativa jobs antigos. A campanha só pode voltar à fila após uma avaliação D0 posterior, com a configuração atual sincronizada.
- Se a configuração estiver ausente, desatualizada, sem identidade exata ou com conflito de revisão, a avaliação não deve ignorar a exceção presumindo que a campanha está liberada; deve bloquear a regra/candidata e registrar o motivo.
- A interface do Diário continua sendo a fonte de edição. O servidor usa a última versão sincronizada; alterações ainda não enviadas pelo Hub não podem ser consideradas pelo worker.

## 5. Regras e dependências de dados

O avaliador deve preservar os critérios atuais do Hub; não deve criar uma regra “parecida” com semântica diferente. A matriz abaixo define o mínimo que precisa chegar ao servidor:

| Regra atual | Dados necessários no servidor | Condição de bloqueio |
|---|---|---|
| `reference_competitor` | Impressões e cliques D0 por campanha/data, status, produto, mínimos, regra de desempate e histórico dentro da retenção. | Conta/captura incompleta, grupo de produto ambíguo, métricas ausentes ou proteção de venda inconclusiva. |
| `campaign_zero_impressions` | Histórico diário completo por campanha e status ENABLED nas leituras correspondentes. | Dia ausente/incompleto não conta como zero. |
| `product_performance` | Cliques/impressões na janela configurada, agrupamento de produto e configuração de red dot/mínimos. | Cobertura insuficiente ou qualquer métrica exigida ausente. |
| `campaign_age` | Data inicial, origem da data, status, impressões acumuladas e teto configurado. | Data sem fonte reconhecida, campanha sem vínculo ou total sem observação. |
| `clicks_without_sale` | Cliques acumulados e cobertura completa das fontes de venda aplicáveis ao período. | Atribuição/consulta de venda indisponível, inclusive ClickBank enquanto a associação não estiver definida. |
| `negative_remaining` | `remainingValue` numérico calculado pelo Hub para a campanha, configuração da regra, identidade e exceções explícitas. | Valor/identidade ausente ou inválido, regra desabilitada ou exceção explícita. Venda não veta esta regra; o servidor não recalcula o saldo nem exige cobertura financeira por fonte. |

Os critérios numéricos e exceções seguem a última política sincronizada do Hub. Para `negative_remaining`, o snapshot transmite o `Valor restante` já calculado pela Visão geral; proteções por venda não vetam a regra quando esse valor é negativo. O servidor não precisa receber o histórico financeiro para refazer o cálculo.

## 6. Completude e comportamento seguro

- Só uma captura D0 completa para todas as contas esperadas pode produzir jobs.
- Capturas parciais podem ser registradas para diagnóstico, mas não entram em avaliação que possa gerar pausa.
- Uma campanha omitida em consulta incompleta não é interpretada como inexistente, zero ou pausada.
- Métrica desconhecida, associação de produto ambígua, política ausente/revision mismatch ou venda necessária indisponível bloqueia apenas a regra afetada; bloqueia todas as regras quando a integridade global da captura estiver comprometida.
- Atributos de campanha devem ser associados pela identidade completa MCC + conta + campaign ID. Nome isolado não é chave.
- Exceções de pausa do Diário devem ser aplicadas na avaliação e novamente antes da mutação, usando a identidade MCC + conta + campaign ID e os códigos de regra sincronizados.
- As campanhas protegidas por venda GuruMedia devem ser sincronizadas com a captura ou com um contrato de venda versionado equivalente; o worker não consulta IndexedDB.
- Revisão de política usada na avaliação e na decisão fica registrada. Mudança de regras/exceções antes da execução invalida ou reavalia o job com a política atual, nunca executa silenciosamente com uma política antiga.

## 7. Agendamento, atraso e cancelamento

- O Cron atual de cinco minutos diagnostica um payload completo a partir de seu recebimento (`evaluation_due_at = received_at_utc`), com até uma rodada adicional do Cron de latência. A Fase 2A não gera candidatas.
- O atraso `snapshotIntervalMinutes + additionalDelayMinutes` não deve ser usado como maturação de um payload que já chegou completo. No desenho híbrido futuro, essa janela serve para dar ao Hub oportunidade de entregar o snapshot esperado antes de o servidor iniciar sua própria captura se detectar ausência. Esse fallback ainda não está implementado.
- A disponibilidade de jobs já enfileirados continua seguindo a política sincronizada existente; essa regra operacional é separada do diagnóstico de snapshots e não comprova que um snapshot posterior chegou.
- Na futura avaliação fiel, `evaluation_due_at` da candidata deverá ser definido no momento em que ela for efetivamente avaliada/enfileirada; não é um prazo adicional depois que o timer do modal termina.
- **Decisão do usuário:** manter o modal de pausa automática com timer. O servidor calcula e persiste `cancel_until` ao criar o job; o Hub exibe o modal com a contagem regressiva e permite cancelar a pausa antes do prazo.
- A contagem visual do modal é apenas uma apresentação do prazo autoritativo do servidor. F5, reabrir o Hub ou deixar a aba em segundo plano não reinicia nem estende `cancel_until`.
- Se o usuário cancelar antes do prazo, o servidor marca o job como cancelado e não pausa aquela candidata. Se o prazo expirar sem cancelamento, o servidor executa a pausa, após revalidar status/permissão pela API conforme o fluxo existente. A expiração do timer não pede aprovação adicional.
- Para que o servidor cumpra o prazo mesmo sem o modal aberto, a execução não pode depender de confirmação da interface. O job fica disponível para execução quando `cancel_until` vence; nesse momento, o worker revalida status/permissão e tenta pausar.
- Quando o Hub estiver aberto, deve receber/consultar novas candidatas e abrir o modal para revisão. Se o Hub estiver fechado ou não puder apresentar o modal, o servidor ainda executa ao expirar o prazo; o Hub mostra o resultado/estado atualizado quando voltar a conectar. A garantia de revisão visual depende de o Hub estar aberto e conectado durante a janela.

## 8. Armazenamento, retenção e carga

O schema atual guarda metadados/hash de avaliação, política e jobs, mas não armazena o conteúdo completo das capturas. Para reter histórico e calcular regras ao longo dos dias, será necessária persistência aditiva no banco `u572283517_track` — por exemplo, payload normalizado versionado por `snapshot_id` ligado ao registro de captura existente. Não há proposta de limpar ou sobrescrever tabelas operacionais existentes.

- A retenção acompanha o limite de snapshots configurado no Hub e não remove snapshots necessários a jobs pendentes/em processamento.
- Repetir entrega do mesmo conteúdo não duplica snapshot nem job.
- Antes de fechar o tamanho do payload, medir uma captura real representativa de forma local e sem expor contas/dados na documentação. O endpoint atual limita JSON a 1 MiB; se o pacote completo exceder esse teto, usar envio em partes com hash final e só marcar como completo depois de todas as partes, ou aprovar explicitamente um limite maior.
- A avaliação não faz chamadas de métricas ao Google Ads. Em modo de execução, o worker continua usando as chamadas atuais de status, permissão, pausa e confirmação.

## 9. Modo de validação e transição

### Sombra/preview

- O servidor avalia snapshots recebidos e grava candidatas/motivos no modo de prévia.
- O Cron permanece sem `--execute`; nenhuma campanha muda de status.
- O Hub local pode continuar executando as regras atuais durante a comparação, mas o resultado servidor não pode ser confundido com uma pausa local.
- O painel deve mostrar por captura: recebida, incompleta, aguardando avaliação, avaliada, bloqueada e quantidade de candidatas por regra, com motivo de bloqueio/ignorada. As candidatas também devem alimentar o modal já existente, preservando a ação de cancelar e o timer; no modo de prévia, a expiração registra o resultado, mas não pausa campanhas.
- Comparar resultado servidor e Hub no mesmo `snapshot_id`, regra e revisão; divergência fica visível e bloqueia o corte para execução.

### Corte futuro

Somente após comparação aprovada e autorização explícita, transferir a propriedade de execução regra a regra. Para cada regra transferida, desligar a execução local correspondente antes de habilitar `--execute` no servidor, evitando pausa duplicada. A migração de avaliador não ativa por si só a execução real.

## 10. Critérios de aceite para a primeira implementação

1. Uma captura automática D0 completa salva no Hub é publicada sem abrir/selecionar a Visão Geral e sem esperar o evento local de pausa.
2. A entrega inclui todas as campanhas necessárias à avaliação, não só candidatas formadas no Hub.
3. Reenvio idempotente e falha de rede recuperam a entrega sem duplicar snapshots/jobs.
4. Uma captura incompleta, política divergente ou dado financeiro/venda incompleto não gera job elegível.
5. O Cron em prévia avalia uma captura entregue mesmo que a Visão Geral esteja fechada e mostra estados e motivos por regra.
6. A execução de prévia não chama endpoints de mutação/status do Google Ads nem altera campanhas.
7. O servidor reproduz as regras cobertas pelo contrato atual usando os mesmos dados e política; os testes de comparação documentam diferenças antes de liberar qualquer execução.
8. Um job já criado pode completar cancelamento/espera com o Hub fechado; nenhum snapshot novo é inventado se o Hub/computador estiver desligado.
9. Uma captura só gera candidata depois de `evaluation_due_at`; nesse momento, no modo de execução, a candidata server-side abre o modal existente quando o Hub está conectado e começa a janela de cancelamento.
10. Cancelar antes de `cancel_until` impede a pausa; expirar sem cancelamento permite ao worker pausar após revalidar status/permissão. F5 ou segundo plano não reiniciam o prazo.
11. Se o Hub estiver fechado durante toda a janela, o worker ainda executa ao expirar `cancel_until`, e o resultado aparece no Hub ao reconectar.
12. Uma exceção do Diário para MCC/conta/campanha e regra impede a criação de job e também bloqueia job pendente antes da pausa; sua remoção só vale para uma avaliação D0 posterior, nunca reativa job encerrado.

## 11. Fora de escopo desta etapa

- Capturas próprias do servidor quando não chega snapshot do Hub; isso exige consulta de métricas via API Google Ads e uma decisão separada de cota/fallback.
- Reativar/desativar ou excluir regras do Hub; o Hub continua sendo a fonte da configuração sincronizada.
- Alterar Cron para `--execute`, executar SQL ou publicar qualquer arquivo.
- Resolver a atribuição ClickBank, incluída como dependência externa e tratada pelo outro agente.

## 12. Decisões propostas para revisão

1. **Aceitar o limite de autonomia:** o servidor fica independente do foco/da view, mas precisa receber capturas do Hub; sem Hub/computador em execução, não há novos dados nesta etapa. **Recomendação: sim.**
2. **Gatilho de publicação:** conclusão/persistência da captura no serviço de atualização automática, antes de qualquer avaliação da View. **Recomendação: sim.**
3. **Retenção:** usar o limite atual configurado no Hub e preservar registros com job pendente. **Recomendação: sim.**
4. **Primeira captura após ativação:** guardar como baseline e não criar jobs até chegar captura seguinte, evitando decisões a partir de uma série ainda não consolidada. **Aplicável à avaliação da Fase 2; ainda não implementada.**
5. **Modal e timer:** manter o modal atual; prazo persistido pelo servidor; cancelamento dentro do prazo impede a pausa e expiração sem cancelamento autoriza execução automática pelo servidor. O timer não reinicia no F5/segundo plano; Hub fechado não suspende o prazo. **Decidido pelo usuário.**
6. **Exceções do Diário:** usar as exceções já sincronizadas em `campaignExceptions`, chaveadas por MCC + conta + campaign ID e código de regra; revalidar antes da pausa; inclusão invalida jobs afetados e remoção só permite nova avaliação D0. **Comportamento já documentado no contrato local do worker; precisa ser preservado no novo avaliador.**
7. **`negative_remaining`:** usar somente o `remainingValue` calculado pela Visão geral do Hub. Valor negativo atende à regra mesmo com venda associada; não somar faturamento no servidor nem impor cobertura de fontes financeiras. **Decisão do usuário: seguir o valor restante do Hub.**
8. **Capacidade/tamanho:** **decidido na Fase 1:** schema 1, até 8 MiB por snapshot, partes de 640 KiB, hash por parte e hash final. Um snapshot acima do limite não é enviado; interface para alertar esse bloqueio fica pendente.

## 13. Componentes entregues e pendentes

- **Entregues localmente na Fase 1:** `src/google-ads/google-ads-capture-storage.mjs`, `src/google-ads/google-ads-auto-pause-server-service.mjs`, endpoint privado e migração SQL descritos no pacote de ingestão.
- **Pendentes da Fase 2:** worker/evaluator para ler snapshots completos, aplicar política e exceções, gerar resultados sombra e registrar motivos.
- **Pendentes das fases seguintes:** apresentação das candidatas no modal, leitura do cancelamento/prazo server-side, sincronização de resultados na interface e corte controlado da execução.
- O endpoint público wrapper e o Cron não foram alterados nesta fase.

## 14. Fase 1 implementada localmente

- O Hub inicia o envio após a transação IndexedDB confirmar uma captura automática D0; o envio roda em segundo plano e não segura o retorno da captura.
- São enviados somente snapshots D0 automáticos, escopo `ALL`, com lista de contas consistente e cada conta com consulta e configuração completas. Capturas parciais, manuais, D−1 e `ENABLED` ficam de fora.
- O endpoint valida forma e identidade, recebe partes idempotentes, compara hashes por parte e do conteúdo total, persiste o JSON completo e aplica a retenção sincronizada do Hub. Uploads incompletos expiram após 24 horas.
- IDs já confirmados localmente são ignorados. Snapshots retidos sem confirmação são tentados novamente na próxima captura automática; o servidor continua idempotente se a confirmação local falhar.
- O endpoint não avalia regras, não cria jobs, não chama a Google Ads API e não pausa campanhas. A experiência de pausa local e o worker/Cron não foram alterados.
- O pacote de deploy é [google-ads-auto-pause-snapshot-ingestion-2026-11-16](deploy/staging/google-ads-auto-pause-snapshot-ingestion-2026-11-16/README.md). A implantação e a conferência do banco dependem do usuário.

**Fase 1 operacionalmente concluída em 2026-11-16:** o usuário confirmou no phpMyAdmin uma linha correspondente à captura D0 atual: concluída em 19:44:15.303 UTC, recebida em 19:44:57.285 UTC, 12 contas e 397 campanhas. O print comprova persistência e contagens; não comprova por si só teste de reenvio idempotente ou retenção.

## Fase 2A — trilha de diagnóstico sombra

**Correção de prazo e drenagem do backlog confirmadas.** Como o endpoint só grava um payload depois de validar a captura completa e seu hash, a avaliação sombra fica elegível no recebimento. O worker agora processa até 10 snapshots não avaliados por rodada, em ordem cronológica e um JSON de cada vez. O SQL do usuário confirmou a drenagem dos 20 snapshots retidos em três rodadas. O worker mantém o atraso adicional separado: ele continua valendo para a disponibilidade dos jobs existentes e poderá ser usado no futuro para detectar snapshot ausente antes de uma captura própria do servidor. A rotina não cria jobs, não chama serviços Google Ads e não muda campanhas.

O payload v1 atual comprova dados gerais da conta/campanha e métricas observadas, mas omite fatos necessários para reproduzir com segurança as regras: chave de produto, data de início, série diária longa, comissão/faturamento do Diário e cobertura completa das fontes de venda. A implementação registra as regras habilitadas como `blocked` com códigos específicos e zero candidatas. Isso valida maturação, leitura de política e persistência do diagnóstico, mas **não** constitui comparação de elegibilidade Hub × servidor.

Pacote base: [google-ads-auto-pause-shadow-evaluation-2026-11-16](deploy/staging/google-ads-auto-pause-shadow-evaluation-2026-11-16/README.md). Correção da disponibilidade imediata: [google-ads-auto-pause-shadow-readiness-fix-2026-11-16](deploy/staging/google-ads-auto-pause-shadow-readiness-fix-2026-11-16/README.md).

**Próxima etapa:** Fase 2B — enriquecer o contrato Hub→servidor com os insumos mínimos e implementar avaliações regra a regra, preservando o bloqueio seguro quando faltar cobertura. ClickBank e financeiros seguem bloqueados até as fontes serem definidas.

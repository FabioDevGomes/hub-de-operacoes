# Fase 2B — contrato de dados para avaliação fiel das regras

**Data:** 2026-11-16  
**Estado:** `campaign_age`, `campaign_zero_impressions` e `negative_remaining` implementadas localmente em modo sombra; deploy incremental de `negative_remaining` preparado em pacote próprio. Publicação e paridade real pendentes. As outras regras continuam bloqueadas.  
**Modo de segurança:** avaliação futura em sombra, sem jobs reais, chamadas à API do Google Ads ou pausas.

## Objetivo e limites

O servidor deve decidir elegibilidade a partir de uma captura D0 completa e da política sincronizada, sem depender do ciclo de render da Visão Geral. O Hub pode preparar e transmitir fatos já disponíveis localmente; o servidor aplica os critérios, exclusões e limites. A transmissão não deve criar chamadas adicionais à Google Ads API.

O contrato v1 transporta métricas atuais, status e identidade MCC/conta/campanha, mas não todos os fatos necessários para reproduzir as regras. Os campos a seguir são uma definição de contrato, não uma afirmação de que já estejam implementados.

## Regra de integridade

Cada campo de decisão deve trazer a evidência exigida pela própria regra. Ausência, `null`, origem não reconhecida, conflito de identidade ou histórico incompleto bloqueia a regra afetada; nunca se converte em zero, “sem venda” ou campanha inexistente. Para `negative_remaining`, o dado necessário é o `remainingValue` numérico já calculado pelo Hub e a identidade da campanha; não adicionar requisitos de cobertura financeira por fonte. A chave de campanha é sempre `(managerCustomerId, customerId, campaignId)`. IDs internos do Hub são auxiliares e não substituem essa chave no servidor.

## Inputs a acrescentar ao payload

O Hub envia `schema_version: 2` para as regras de idade/zeros e `schema_version: 3` quando também inclui `remainingValue` por campanha. O endpoint mantém v1/v2 e valida v3 com `evaluationInputs.version: 2`; esse campo é copiado do resultado `overviewSnapshot()` após a gravação da captura. Preserva o envelope de upload, partes, hash, idempotência e limite total. Não envia comprador, e-mail, GCLID nem registro individual de venda.

### Fatos por campanha

| Campo proposto | Conteúdo | Origem local existente | Bloqueio / observação |
|---|---|---|---|
| `product_key` e `product_identity_status` | Chave canônica do produto e estado `mapped`/`ambiguous`/`missing` | Identidade de produto da linha do Hub (`row.productKey`), conciliada pelo `campaignInternalId` | Não derivar só do nome da campanha; grupos ambíguos bloqueiam regras por produto. |
| `startDate` e `startDateSource` | Data ISO e origem (`confirmed` ou `identity`) | `data_inicio_confirmada`, com fallback para a data extraída do nome segundo a identidade atual do Hub e ano inferido, quando disponível | Data ausente, inválida ou futura bloqueia `campaign_age`. |
| `excludedAsHistorical` | Bloqueia campanhas históricas ou sem correspondência na base local | Identidade local da campanha (`status`, `apiSnapshotOnly`) | Replica a exclusão local de linhas históricas e evita incluir campanhas desconhecidas do snapshot. |
| `ageReferenceDate` | Data de referência ISO da conta no snapshot | `account.date` da própria captura D0 | Se ausente ou inválida, bloqueia `campaign_age`; mantém o resultado determinístico para reenvios. |
| `zeroImpressionStreakDays` e `zeroImpressionReferenceDate` | Número de dias consecutivos explicitamente observados como zero e último dia da sequência | `CampaignDatabase.consecutiveZeroImpressionDays` com Diário e métrica D0 do snapshot | Lacunas não contam como zero; a referência precisa coincidir com a data D0 da conta. Não reconstruir a sequência longa a partir da retenção curta do servidor. |
| `lifetimeImpressions` e `lifetimeImpressionsObservedCount` | Total consolidado de impressões e número de observações válidas | `CampaignDatabase.campaignTotalsMap` (`id:<campaignInternalId>`) | Só aplicável com total observado e contagem maior que zero; ausência bloqueia `campaign_age`. |
| `sale_protection` | Estado de cobertura e fontes consideradas; conjunto de campanhas protegidas pela fonte | `GuruMediaSaleProtection` já sincronizada, enriquecida com intervalo/cobertura da leitura | `available` precisa significar cobertura completa do período; `incomplete`/`unavailable` bloqueia regra que depende de ausência de venda. ClickBank segue sem associação resolvida. Vendas manuais ficam fora do escopo desta entrega, conforme decisão do usuário. |
| `remainingValue` | Valor numérico já calculado pelo Hub na linha da Visão geral para esta campanha | `row.remainingValue` produzido pelo caminho atual de `overviewSnapshot()` | Schema 3. Para `negative_remaining`, o servidor compara apenas `< 0`; não recalcula a fórmula nem cria exigências financeiras adicionais. Valor ausente/inválido ou identidade divergente é falha técnica de avaliação, não nova regra de negócio. |
| `saleProtected` | Indicador booleano de venda associada à campanha conforme o Hub | `row.hasDiarySale` na mesma tabela da Visão Geral enriquecida | Schema 3 preserva o campo para o contrato e regras que dependem de venda. `negative_remaining` não o usa como veto: segue somente o `remainingValue` calculado pelo Hub, inclusive quando há venda. |

### Histórico de métricas para regras por produto

`product_performance` e `reference_competitor` dependem de várias capturas D0 por campanha. Cada amostra deve registrar data de relatório da conta, horário da captura, impressões/cliques observados, status e identidade do produto; por métrica, distinguir valor observado de indisponível. O avaliador deve replicar a consolidação diária do Hub, detectar recuo/lacuna e usar apenas a janela e os mínimos da política sincronizada.

O servidor já retém payloads de snapshots segundo a política sincronizada, mas isso não garante por si só uma série completa. Antes de habilitar a regra, verificar que há amostras suficientes para toda a janela de 24 horas, sem perda por retenção, e que as datas de relatório formam sequência válida. Se faltar qualquer amostra exigida, registrar bloqueio por produto.

Para `campaign_zero_impressions`, a série longa do Diário do Hub não deve ser substituída pela retenção curta de payloads do servidor. O campo de sequência e a cobertura diária acima permitem avaliar a sequência sem duplicar dezenas de dias de métricas no servidor.

## Matriz de decisão

| Regra | Situação com v1 | Inputs mínimos v2 | Pode sair do bloqueio quando |
|---|---|---|---|
| `negative_remaining` | Bloqueada até transportar o valor existente do Hub | `remaining_value`, configuração sincronizada da regra e identidade da campanha | Avaliar o mesmo valor da Visão geral: negativo = candidato; zero/positivo = não candidato. Aplicar somente configurações, exceções e proteções já existentes no Hub. |
| `product_performance` | Bloqueada | `product_key`, histórico D0 de impressões/cliques na janela, status, política e cobertura | Série da janela íntegra e identidade de produto inequívoca. |
| `reference_competitor` | Bloqueada | Mesmos dados históricos por produto, mínimos da referência/concorrente, limite de pausas e proteção de venda | Regras de desempate, integridade da janela e cobertura de venda equivalentes às do Hub. |
| `campaign_age` | Bloqueada | Data de início/origem, impressões acumuladas observadas, status e vínculo | Data e total acumulado com fonte validada para cada candidata. |
| `campaign_zero_impressions` | Bloqueada | Sequência e cobertura diária, status e vínculo | Todos os dias da sequência cobertos; lacunas bloqueiam. |
| `clicks_without_sale` | Bloqueada | Cliques acumulados/observados e cobertura completa das fontes de venda incluídas | GuruMedia completa e atribuição ClickBank definida; fonte incompleta mantém bloqueio. |

As exceções por campanha do Diário e a revisão da política continuam vindo do contrato sincronizado. O avaliador deve aplicá-las por identidade completa e registrar a revisão usada. A proteção por venda é verificação separada e não substitui a exceção por regra.

## Ordem de implementação segura

1. **Contrato v2 e validação:** definir schema estrito, limites, proveniência e compatibilidade; manter v1 apenas para diagnóstico, sem elegibilidade.
2. **Regras sem vendas/financeiro:** incluir produto, início e fatos cobertos; implementar primeiro `campaign_age` e `campaign_zero_impressions` em sombra, bloqueando qualquer lacuna.
3. **Regras por produto:** usar histórico D0 dentro da janela; implementar `product_performance` e `reference_competitor`; comparar resultados com o Hub no mesmo snapshot.
4. **GuruMedia e regra sem venda:** fechar semântica de cobertura temporal; habilitar `clicks_without_sale` somente para campanhas cuja fonte esteja coberta. ClickBank segue bloqueador até o mapeamento ser resolvido.
5. **Saldo negativo:** transportar `remainingValue` calculado pelo Hub e avaliar `< 0` em sombra. Não criar cálculo financeiro paralelo, novas regras de cobertura de venda nem somas de fontes que o Hub não inclua.
6. **Saída da sombra:** comparar resultados por captura/regra, explicar divergências, e só depois propor criação de jobs. Esta fase não liga `--execute` nem desativa as pausas locais do Hub.

## Proteções de volume e compatibilidade

- Não fazer chamadas extras de métricas à Google Ads API.
- Não duplicar diário bruto nem detalhes pessoais de venda no servidor.
- Preservar o limite de 8 MiB. Se a extensão exceder esse limite, não truncar silenciosamente: registrar erro de contrato e bloquear avaliação.
- Enviar fatos enxutos por campanha e, quando necessário, apenas a janela de amostras usada pela regra; respeitar a retenção vigente.
- Um payload v2 só pode ser elegível se a política, a captura completa e a cobertura de cada regra forem consistentes.

## Implementação local da etapa 2B

O serviço do Hub anexa `evaluationInputs` calculados a partir da base já carregada, sem consultar a Google Ads API. Mantém um cache local por ID de snapshot para que reenvios usem os mesmos fatos e hash. O endpoint PHP valida cada fato e sua associação exata com `(managerCustomerId, customerId, campaignId)`, aceitando schema v1 antigo e schema v2 novo. O worker aplica `campaign_age` (idade estritamente maior que o limite e impressões observadas até o teto) e `campaign_zero_impressions` (sequência maior ou igual ao limite), respeita exceções sincronizadas e registra candidatas apenas em `result_json`/`candidate_count`.

O modo continua sendo somente sombra: não cria jobs, não chama API e não pausa. As quatro regras ainda dependentes de dados de produto, vendas ou financeiro permanecem bloqueadas. Os snapshots v1 antigos não viram v2 retroativamente; a validação exige nova captura completa após a publicação do Hub atualizado.

## Resultado desta definição

A lacuna não é o Cron: o Cron lê os snapshots recebidos em modo sombra. O que falta é transportar fatos suficientes para que o servidor reproduza cada regra sem inventar dados. O v1 não pode produzir decisão de elegibilidade fiel. Contadores do diagnóstico não liberam regras.

### Pendências externas

- Definição de atribuição ClickBank por campanha, conduzida em paralelo pelo usuário/agente indicado.
- Confirmação em snapshot novo de que o `remainingValue` existente no Hub chega associado à campanha correta e produz o mesmo resultado sombra.
- Confirmar a cobertura temporal do feed GuruMedia usado para proteção por venda.

# Especificação — snapshots da primeira regra até a fila do servidor

**Estado:** proposta para aprovação; nenhum código, banco, configuração, Cron ou servidor foi alterado nesta etapa.  
**Regra inicial:** `campaign_zero_impressions`.  
**Dependência:** snapshots completos D0 produzidos pelo Hub; esta etapa não implementa captura própria no servidor.

**Limite de escopo:** o botão de transferência e o handoff da autoridade Hub→servidor estão sendo implementados por outra agente e não fazem parte desta especificação. O fluxo de jobs definido aqui deve consumir o contrato de autoridade dessa implementação, sem criar um segundo botão, estado de corte ou mecanismo concorrente.

## 1. Evidência e situação atual

No resultado SQL enviado pelo usuário para o snapshot `2026-11-17T17:17:14.926Z:aabhu1lz`:

- o snapshot schema v2 foi recebido e avaliado automaticamente;
- `snapshot_valid = true`;
- `campaign_zero_impressions` ficou `evaluated`, sem motivos de bloqueio e com zero candidatas;
- `campaign_age` ficou `partially_blocked`, com 135 campanhas sem impressões acumuladas observadas;
- o total foi zero candidatas.

Isso confirma ingestão e avaliação em sombra. Não confirma criação de jobs ou pausa. No código local, o avaliador grava o resultado em `result_json` e `candidate_count`; o fluxo ainda não transforma essas candidatas em jobs.

## 2. Objetivo e limite

Permitir que o servidor transforme candidatas da regra `campaign_zero_impressions` em intenções persistentes na fila existente. A criação de jobs só pode ocorrer quando o contrato de autoridade do servidor indicar que essa regra já pertence ao servidor. O botão, o processo de transferência e a mudança de autoridade são tratados fora deste escopo.

Esta etapa não liga a execução real por si só. Não muda o limite de dias, não ativa outras regras, não faz consultas métricas adicionais ao Google Ads e não cria snapshots quando o Hub estiver desligado.

## 3. Regra de elegibilidade

Uma candidata só pode originar job se todos os pontos abaixo forem verdadeiros:

1. A captura é D0 schema v2, globalmente completa e validada pelo endpoint, incluindo todas as contas esperadas. Captura inválida, parcial ou com conflito de identidade não gera job.
2. A revisão da política usada na avaliação está registrada, é a revisão válida para a regra e mantém `campaign_zero_impressions` habilitada.
3. O resultado dessa regra contém explicitamente a campanha em `candidates`; a campanha estava `ENABLED`, tem identidade MCC + conta + campaign ID válida, e a sequência observada atende ao limite configurado na data D0 correspondente.
4. Exceções do Diário foram aplicadas pela identidade exata. Campanha histórica, sem vínculo válido, sem sequência observada ou com lacuna não vira candidata.
5. A proteção de venda GuruMedia permanece obrigatória: cobertura indisponível/incompleta bloqueia o job; campanha protegida por venda não entra na fila. A regra de zero impressões não depende de faturamento nem de atribuição ClickBank.

Não é necessário que as seis regras estejam prontas. Um bloqueio em outra regra não bloqueia uma candidata explícita e válida de zero impressões. Se houver bloqueios em outras campanhas da mesma regra, somente as campanhas listadas como candidatas podem avançar; dados desconhecidos nunca são convertidos em zero.

## 4. Criação do job e idempotência

- A criação é feita pelo worker do servidor, a partir da avaliação armazenada; não por uma chamada extra do Hub baseada em decisão local.
- O contexto do job guarda a regra, streak observada, data de referência, limite usado, revisão da política e vínculo ao snapshot fonte. Não copia o snapshot inteiro.
- Reprocessar a mesma avaliação não cria outro job. A chave inclui o snapshot fonte e a identidade completa da campanha.
- No máximo um job `pending`/`processing` pode existir por regra e campanha. Um snapshot posterior que mantenha a candidata confirma o job existente; não cria uma segunda execução concorrente. Antes da pausa, o worker revalida a candidata contra a avaliação completa mais recente.
- Se uma avaliação posterior deixar de confirmar a candidata, o job pendente termina como ignorado, sem chamada de pausa. Exceção, proteção por venda, regra desabilitada ou campanha já pausada também impedem a execução.
- Um cancelamento encerra o job atual. Uma captura posterior pode ser reavaliada; o comportamento de reapresentar uma campanha cancelada será explicitado no modal e não deve recriar jobs continuamente para a mesma condição sem uma nova avaliação D0.

### Compatibilidade da fila atual

A fila existente exige `product_key`, tem unicidade por snapshot/produto/regra/campanha e a interface cancela por produto. `campaign_zero_impressions` é por campanha e o contrato v2 atual não fornece chave de produto. Não se deve exigir mapeamento de produto para esta regra nem usar o nome da campanha como chave.

Proposta: usar uma chave interna de agrupamento por campanha, derivada de MCC + conta + campaign ID, mantendo `campaign_name` como rótulo apresentado. O modal deve rotular o item como campanha e cancelar somente esse item/campanha. A chave interna não é exibida como nome de produto. A implementação precisa confirmar que o endpoint de cancelamento e a chave de unicidade preservam esse escopo.

Há também duas famílias de snapshots no banco: payloads completos (`snapshot_payloads`/avaliações sombra) e metadados antigos da fila (`google_ads_auto_pause_snapshots`). Antes de codificar, o job precisa de uma ligação explícita e retida ao payload/avaliação fonte. A ligação não pode depender de `campaign_name` nem sobrescrever hash de um snapshot legado. A mudança de banco, se necessária, será aditiva e terá SQL próprio para aprovação/publicação.

## 5. Prazos, cancelamento e revalidação

`available_at` e `cancel_until` são prazos diferentes, persistidos em UTC pelo servidor. O modal apenas exibe esses valores; F5 ou reabertura não os reinicia. O worker só age quando ambos os prazos permitem e depois de revalidar política, exceção, proteção GuruMedia, conta, status `ENABLED` e candidata mais recente.

Para evitar a divergência histórica entre atraso de execução e janela de cancelamento, esta proposta recomenda `cancel_until = server_created_at + confirmationSeconds` — hoje, 210 segundos — usando o relógio UTC do servidor. A interface exibe o tempo restante e não o reinicia. `available_at` continua sendo calculado separadamente com a configuração vigente; o worker só pode agir depois de ambos os prazos. Se o Hub estiver fechado, a janela continua correndo e o servidor age após os prazos, conforme a autoridade já aprovada. A fórmula final de `available_at` será registrada separadamente no código. Este é um ponto para aprovação antes da implementação.

## 6. Integração com o contrato de autoridade

O botão, a confirmação do usuário, a reconciliação dos jobs existentes e a transição de autoridade são responsabilidade da outra implementação. Esta especificação não define endpoints nem estados próprios para esses passos.

Requisitos de integração para o fluxo snapshot→job:

- consultar a fonte autoritativa definida pela outra implementação e só criar jobs ativos se `campaign_zero_impressions` estiver sob autoridade do servidor;
- se a autoridade estiver em `hub`, `handoff_pending`, indisponível ou inconsistente, não inserir job executável;
- manter o estado de autoridade fora da política sincronizada pelo Hub, conforme o contrato comum, para que `sync_config` não reverta o corte;
- não copiar nem reclassificar jobs pendentes existentes neste escopo. O fluxo de handoff externo decide como reconciliá-los;
- não alterar o executor local do Hub nem o comportamento das outras cinco regras.

## 7. Etapas de entrega e aceite

1. **Preparação local:** adicionar a ponte avaliação→job em modo inerte; sem autoridade do servidor confirmada, nenhuma candidata vira job executável.
2. **Validação sombra:** a amostra atual deve continuar resultando em zero jobs, pois tem zero candidatas. Uma candidata de fixture/simulação deve provar a criação idempotente, o cancelamento do item certo e a revalidação sem chamada à API de pausa.
3. **Comparação:** quando surgir candidata real em sombra, comparar identidade, limite e motivo com a avaliação local do Hub para a mesma captura. Ainda sem pausa real.
4. **Integração:** conectar a ponte ao contrato de autoridade e handoff produzido pela outra agente. Os outros cinco códigos de regra continuam fora desta entrega.
5. **Execução:** somente depois de a autoridade do servidor estar confirmada pelo contrato compartilhado. O worker precisa respeitar autoridade por regra, cancelamento e revalidação antes da chamada de pausa.

Critérios de aceite: nenhum job para a amostra atual; um job, no máximo, para cada candidata elegível; nenhum duplicado em retry ou snapshots sucessivos com job ativo; item cancelado não executa; pendência não confirmada é encerrada; outras regras e o executor Hub não mudam; falha de autoridade ou cobertura resulta em bloqueio seguro.

## 8. Decisões restantes para esta especificação

1. Aprovar a chave interna de agrupamento/cancelamento por campanha sem exigir produto.
2. Confirmar a janela de 210 segundos ancorada na criação server-side do job e a regra de disponibilidade que a acompanha.
3. Aprovar uma migração SQL aditiva se a ligação do job ao payload fonte exigir novas colunas/tabela.

## Referências locais

- [Contrato de dados da Fase 2B](google-ads-auto-pause-phase-2b-data-contract.md)
- [Especificação de avaliação por snapshots](google-ads-auto-pause-snapshot-evaluation-spec.md)
- [Roteiro de pausas automáticas no servidor](google-ads-auto-pause-server-roadmap.md)
- [Worker de pausas automáticas](tools/google-ads-auto-pause-worker.php)
- [Serviço da fila](tools/google-ads-auto-pause-service.php)

# Especificação da próxima etapa — validação de `negative_remaining`

**Data:** 2026-11-17  
**Etapa:** alinhar avaliação sombra e guarda de execução de `negative_remaining` com o comportamento do Hub  
**Status:** regra esclarecida pelo usuário; ajuste local concluído; publicação e validação pós-publicação pendentes

## 1. Escopo desta etapa

Esta etapa destrava e valida a regra existente `negative_remaining` no servidor, ainda em modo sombra. O servidor deve refletir o valor **Valor restante** calculado pelo Hub e aplicar somente o critério já existente: `remainingValue < 0`.

O resultado schema 3 consultado em 2026-11-17 foi `evaluated`, sem bloqueios e com zero candidatas. Ele confirma que a regra foi processada, mas não permite validar o caso de saldo negativo nem a decisão sobre campanhas com venda.

## 2. Ajuste técnico especificado

Aplicar um delta mínimo no caminho de **avaliação sombra e validação de jobs** do worker para `negative_remaining`:

1. Para `negative_remaining`, não exigir `guruMediaSaleProtection.status = available` nem excluir a campanha por `saleProtected=true` ou por correspondência na lista sincronizada.
2. Na validação de job real, aplicar a mesma distinção: esses vetos de venda permanecem para as outras regras, mas não bloqueiam um job `negative_remaining`.
3. Preservar exceções explícitas configuradas para `negative_remaining`, sua habilitação, revisão da política e validações existentes de identidade e `remainingValue` numérico finito.
4. Para dados ausentes ou inválidos, registrar `not_evaluable`; nunca converter ausência em zero nem em candidatura.
5. Não alterar a comparação de negócio: valor negativo é candidato; zero ou positivo não é.

O delta deve ser aplicado sobre a versão final do worker que contenha a implementação da chave global atualmente em andamento. A alteração dessa chave, sua API, o schema de autoridade, a migração e a interface ficam fora desta especificação e devem permanecer intactos. Não publicar um worker antigo ou um pacote que os sobrescreva.

## 3. Limites e efeitos proibidos nesta etapa

- Manter a avaliação em modo sombra.
- Não criar jobs reais, chamar a Google Ads API, pausar campanhas, enviar e-mails nem alterar autoridade.
- Não usar Cron com `--execute`.
- Não alterar SQL/schema, configuração, Cron ou código do Hub.
- Não somar vendas do Faturamento ao saldo nem introduzir limiares, janelas financeiras, cobertura de fontes ou novas proteções comerciais.
- Não publicar até o worker combinado ter sido revisado contra a versão final da chave global e o pacote indicar precisamente o arquivo entregue.

## 4. Plano de validação

Após publicar o worker combinado e aguardar uma nova avaliação schema 3:

1. Consultar a avaliação mais recente e verificar que `gurumedia_protection_unavailable` deixou de bloquear globalmente `negative_remaining`.
2. Conferir `remaining_value`, estado e motivo técnico por campanha em `campaign_results`.
3. Comparar cada valor recebido com o **Valor restante** correspondente na Visão geral do Hub, usando a mesma identidade `(managerCustomerId, customerId, campaignId)`.
4. Confirmar os resultados: negativo → `candidate`, inclusive com venda; zero/positivo → `not_candidate`; exceção explícita da regra → `not_candidate`; identidade/valor inválido → `not_evaluable`.
5. Se o snapshot real não contiver valor negativo, registrar que a paridade de valores foi verificada, mas que o caso negativo não ocorreu nos dados observados. Validar a fronteira `< 0` com fixture isolada, fora do banco e das contas reais.
6. Confirmar que a avaliação não criou jobs e não executou efeitos externos.

## 5. Critérios para concluir a etapa

A etapa fica concluída quando:

- venda não veta a candidatura nem a validação de job de `negative_remaining`, enquanto os vetos de venda das demais regras permanecem;
- os valores e identidades comparados coincidem com a Visão geral;
- os estados de candidaturas seguem o critério `< 0` e as exceções explícitas já configuradas;
- o comportamento continua sem jobs nem pausas reais;
- a revisão do pacote confirma que o código da chave global foi preservado sem alteração de escopo.

Se não houver campanha negativa no snapshot observado, isso não impede verificar os casos zero e positivo, mas a ocorrência real de uma candidatura negativa continuará pendente até surgir uma campanha com `Valor restante < 0`.

## 6. Relação com as especificações existentes

- [Integração do ajuste ao worker compartilhado](google-ads-auto-pause-negative-remaining-worker-integration-spec.md)
- [Contrato completo da regra em modo sombra](google-ads-auto-pause-negative-remaining-spec.md)
- [Auditoria e evidência operacional](google-ads-auto-pause-negative-remaining-audit.md)
- O roteiro mais amplo de fases do servidor permanece em [google-ads-auto-pause-server-roadmap.md](google-ads-auto-pause-server-roadmap.md); esta especificação não cobre o corte de autoridade nem a autonomia do servidor sem snapshots do Hub.

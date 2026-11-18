# Fase 2A — diagnóstico de avaliação em modo sombra

**Estado:** implementação local, ainda não publicada. Pré-requisitos: serviço de ingestão da Fase 1 e tabela `google_ads_auto_pause_snapshot_payloads` ativos; Cron do worker existente continua sem `--execute`.

Esta entrega faz o worker selecionar snapshots D0 maduros (`concluído + intervalo configurado + atraso adicional`) e registrar um diagnóstico por snapshot. O resultado é vinculado à revisão da política e informa quais regras estão desativadas ou bloqueadas por falta de insumos.

Os diagnósticos acompanham a retenção dos snapshots: quando o endpoint remover um payload antigo conforme o limite já configurado, o banco remove em cascata somente o diagnóstico derivado daquele payload.

**Limite deliberado:** o payload v1 recebido hoje não contém identidade de produto confiável, início da campanha, série diária longa, totais financeiros do Diário nem cobertura completa das fontes de venda. Portanto, regras habilitadas ficam como `blocked` com motivo específico e `candidate_count = 0`. O avaliador não aproxima critérios, não cria jobs, não chama a API do Google Ads e não altera campanhas. Essa etapa valida o agendamento e a trilha de diagnóstico; não é ainda uma comparação de candidatas Hub × servidor.

## Arquivos desta atualização

| Arquivo local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-worker.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-worker.php` |
| `database/google-ads-auto-pause-shadow-evaluation.sql` | Executar no banco `u572283517_track` |

O endpoint privado da Fase 1 não muda. Não altere o wrapper, o comando do Cron nem `tracking-config.php`.

## Publicação

1. Faça backup privado do worker instalado e backup do banco `u572283517_track`.
2. Execute o SQL aditivo abaixo no banco indicado. Ele cria somente `google_ads_auto_pause_shadow_evaluations`.
3. Substitua apenas `google-ads-auto-pause-worker.php` no destino `private-tools`.
4. Mantenha o Cron existente a cada cinco minutos, sem `--execute`. A próxima rodada avalia os snapshots que já tenham ultrapassado o prazo de maturação.

## Conferência

No phpMyAdmin, consulte os últimos diagnósticos:

```sql
SELECT source_snapshot_id, policy_revision, completed_at_utc,
       evaluation_due_at_utc, evaluated_at_utc, snapshot_state,
       enabled_rule_count, blocked_rule_count, candidate_count,
       result_json
FROM google_ads_auto_pause_shadow_evaluations
ORDER BY evaluated_at_utc DESC
LIMIT 20;
```

Esperado nesta subfase: snapshots maduros aparecem uma vez; regras desligadas têm `state=disabled`; regras ligadas têm `state=blocked` e motivo de insumo ausente; `candidate_count` permanece zero. A saída do Cron também informa quantos snapshots foram avaliados e quantas regras ficaram bloqueadas.

## Próxima parte da Fase 2

Antes de calcular candidatas, ampliar o contrato Hub→servidor com os fatos de campanha, histórico e venda necessários às regras. O desenvolvimento deve preservar ausência como ausência; regra sem cobertura suficiente permanece bloqueada. A atribuição ClickBank segue fora até sua definição separada.

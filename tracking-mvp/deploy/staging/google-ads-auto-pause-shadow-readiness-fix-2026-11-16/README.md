# Fase 2A — correção da disponibilidade do diagnóstico sombra

**Estado:** pacote local, ainda não publicado. Este pacote corrige o worker da Fase 2A já instalado. Não inclui SQL porque reutiliza `google_ads_auto_pause_shadow_evaluations`, criada no deploy anterior.

O endpoint só armazena o payload depois de validar a captura completa, a identidade e o hash. Por isso, o diagnóstico sombra fica elegível no recebimento e é gravado pelo próximo Cron. O worker processa um snapshot não avaliado por rodada, em ordem cronológica; se houver acúmulo de capturas retidas, as mais antigas serão processadas primeiro, uma por rodada.

O intervalo de captura do Hub e `additionalDelayMinutes` deixam de ser aplicados à disponibilidade do diagnóstico sombra. Eles continuam separados e não são removidos da política: o atraso adicional ainda influencia a disponibilidade dos jobs existentes e poderá ser usado no futuro para detectar ausência de snapshot antes de uma captura própria do servidor.

Esta correção não gera candidatas nem jobs, não consulta a API Google Ads e não pausa campanhas. Regras habilitadas permanecem bloqueadas por falta dos insumos que não existem no payload v1. O Cron deve continuar sem `--execute`.

## Arquivo para publicação

| Arquivo local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-worker.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-worker.php` |

## Publicação

1. Faça backup do worker atualmente instalado.
2. Substitua somente `google-ads-auto-pause-worker.php` no destino indicado.
3. Não execute SQL nesta atualização; a tabela de diagnósticos já pertence ao pacote da Fase 2A.
4. Não altere o Cron, o endpoint de ingestão, `tracking-config.php` ou a configuração de atraso no Hub.

## Conferência

Após a próxima rodada do Cron, confira os diagnósticos no phpMyAdmin:

```sql
SELECT source_snapshot_id, policy_revision, completed_at_utc,
       evaluation_due_at_utc, evaluated_at_utc, snapshot_state,
       enabled_rule_count, blocked_rule_count, candidate_count,
       result_json
FROM google_ads_auto_pause_shadow_evaluations
ORDER BY evaluated_at_utc DESC
LIMIT 20;
```

`evaluation_due_at_utc` deverá corresponder ao recebimento do payload; `evaluated_at_utc` será igual ou posterior, conforme a próxima rodada do Cron e a posição do snapshot na fila de capturas ainda não avaliadas. `candidate_count` deve continuar em zero.

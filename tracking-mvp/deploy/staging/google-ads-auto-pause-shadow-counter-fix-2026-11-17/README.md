# Fase 2B — corrigir contador de bloqueios por snapshot

**Estado:** pacote preparado localmente; ainda não enviado à Hostinger. O Cron deve permanecer em prévia, sem `--execute`.

## Correção

O worker processa até 10 snapshots pendentes por execução. O contador de regras bloqueadas era inicializado uma vez antes do lote e reutilizado ao gravar cada snapshot. Assim, o segundo resultado podia registrar 10 quando cada snapshot tinha 5 regras bloqueadas. Agora o resultado de cada snapshot usa seu próprio contador; o total do ciclo continua acumulado separadamente apenas para o resumo do worker.

A alteração não recalcula nem modifica avaliações já gravadas. Ela corrige as próximas avaliações processadas após a publicação.

## Arquivo para publicação

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Faça backup privado do worker atual e substitua somente este arquivo:

1. `google-ads-auto-pause-worker.php`

Não há SQL nesta etapa. Não altere o wrapper público, o Cron, `tracking-config.php`, tokens ou configurações.

## Validação após publicação

Mantenha o Cron no modo de prévia. Aguarde pelo menos duas novas capturas v2 serem avaliadas na mesma execução do worker e consulte:

```sql
SELECT p.source_snapshot_id, p.schema_version, p.received_at_utc,
       e.evaluated_at_utc, e.enabled_rule_count, e.blocked_rule_count,
       JSON_EXTRACT(e.result_json, '$.blocked_rule_count') AS json_blocked_rule_count,
       e.candidate_count, e.snapshot_state
FROM google_ads_auto_pause_snapshot_payloads p
JOIN google_ads_auto_pause_shadow_evaluations e ON e.snapshot_id = p.snapshot_id
WHERE p.schema_version = 2
ORDER BY p.received_at_utc DESC
LIMIT 10;
```

Para cada captura nova, `blocked_rule_count` deve corresponder ao contador dentro de `result_json` e ao número de regras em estado `blocked` ou `partially_blocked`. O contador deve ser individual por snapshot, não crescer conforme a posição no lote. As avaliações continuam em sombra e não pausam campanhas.

## Estado da publicação

Arquivo preparado localmente. Nenhum upload foi feito e nenhum SQL foi executado.

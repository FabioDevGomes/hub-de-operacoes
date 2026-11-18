# Ajuste do gate de proteção na avaliação sombra — `negative_remaining`

**Estado:** pacote local preparado; ainda não enviado ao servidor.  
**Base:** worker do pacote `google-ads-auto-pause-schema3-cutover-2026-11-17`, informado pelo usuário como publicado junto da migração de corte e dos PHPs.  
**Delta:** remove apenas o gate de status global GuruMedia da avaliação sombra schema 3 de `negative_remaining`.

## Escopo

Schema 3 já leva `saleProtected` por campanha, calculado pelo Hub. A avaliação continua excluindo campanhas protegidas por esse campo e pela lista sincronizada quando houver correspondência. Regra habilitada, exceções, identidade, validação de `remainingValue` finito e critério único `remainingValue < 0` permanecem intactos.

O gate global GuruMedia no caminho de validação/execução de jobs reais permanece no worker. Também ficam intactos o lease do Hub, a verificação da autoridade, o marco do corte e o filtro que impede reivindicar snapshots anteriores ao corte. A alteração não cria jobs, não consulta a Google Ads API e não executa pausas.

## Arquivo do servidor

Destino no servidor: `/home/u572283517/domains/travenzo.shop/private-tools`

A pasta `hostinger-private-tools/` contém somente o arquivo abaixo:

- `google-ads-auto-pause-worker.php`

Antes de substituir, faça backup privado do worker atualmente publicado. Envie apenas este arquivo para o destino indicado.

## SQL, Hub e configuração

Este pacote não contém nem exige SQL, mudança do serviço PHP, atualização do Hub, configuração ou alteração do Cron. Para gerar novas capturas schema 3, o Hub local precisa estar atualizado para v1.378.0, conforme o pacote-base. Mantenha o worker em prévia, sem `--execute`.

## Validação após o envio

Após o arquivo ser enviado e surgir nova avaliação schema 3, consulte os últimos resultados no banco `u572283517_track`:

```sql
SELECT p.source_snapshot_id,
       p.schema_version,
       p.received_at_utc,
       e.evaluated_at_utc,
       e.snapshot_state,
       e.candidate_count,
       JSON_UNQUOTE(JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.state')) AS regra_estado,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.blocked_reasons') AS bloqueios,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.candidates') AS candidatas,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.campaign_results') AS resultados_por_campanha
FROM google_ads_auto_pause_snapshot_payloads p
JOIN google_ads_auto_pause_shadow_evaluations e ON e.snapshot_id = p.snapshot_id
WHERE p.schema_version = 3
ORDER BY p.received_at_utc DESC
LIMIT 5;
```

Confirme que `gurumedia_protection_unavailable` deixou de bloquear a avaliação sombra. Compare os valores por identidade com **Valor restante** no Hub; negativo deve ser candidato sombra, zero/positivo não candidato, e campanhas protegidas/vetadas permanecem fora. A consulta é somente leitura. Esta etapa não altera autoridade nem autoriza pausas reais.

## Reversão

Se houver regressão, restaure o backup privado do worker anterior. Não altere o SQL de corte, a autoridade nem as avaliações/snapshots armazenados.

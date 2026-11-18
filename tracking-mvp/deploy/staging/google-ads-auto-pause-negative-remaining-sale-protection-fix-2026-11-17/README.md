# Correção do bloqueio global em `negative_remaining`

**Estado:** pacote local preparado; ainda não enviado ao servidor.  
**Escopo:** remover do worker a exigência de status global `guruMediaSaleProtection=available` para avaliar `negative_remaining` em schema 3. O snapshot já traz o booleano `saleProtected` por campanha.

## Evidência que motivou a correção

A avaliação do snapshot `2026-11-17T20:18:18.513Z:krinpsd3` registrou `gurumedia_protection_unavailable: 133` em `rules.negative_remaining.blocked_reasons` e zero candidatos. O bloqueio impediu a comparação do saldo apesar de o contrato schema 3 validar `saleProtected` por campanha.

## Arquivo do servidor

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Enviar somente o arquivo presente em `hostinger-private-tools/`:

- `google-ads-auto-pause-worker.php`

O arquivo substitui o worker existente. Antes, faça backup privado dele no destino.

## Comportamento preservado

- `saleProtected=true` exclui a campanha da candidatura.
- A lista de campanhas protegidas da política sincronizada continua excluindo correspondências quando houver.
- A regra habilitada, exceções, validação de identidade e `remainingValue` numérico finito permanecem como estão.
- A decisão de negócio continua sendo apenas `remainingValue < 0`.
- O worker permanece em modo sombra: não cria jobs, não chama a Google Ads API e não pausa campanhas.

A indisponibilidade do status global da lista não bloqueia schema 3, que já fornece a proteção de venda por campanha validada pelo serviço.

## Sequência

1. Faça backup privado de `google-ads-auto-pause-worker.php` no destino indicado.
2. Envie o arquivo deste pacote para o mesmo diretório privado, substituindo o worker existente.
3. Não altere o Hub local, SQL, configuração ou Cron nesta etapa. Mantenha o Cron sem `--execute`.
4. Aguarde a próxima captura schema 3 e avaliação sombra antes de comparar `remainingValue` e os estados por campanha.

## Consulta pós-publicação (somente leitura)

```sql
SELECT p.source_snapshot_id,
       p.schema_version,
       p.received_at_utc,
       e.evaluated_at_utc,
       JSON_UNQUOTE(JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.state')) AS regra_estado,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.blocked_reasons') AS bloqueios,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.candidates') AS candidatos,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.campaign_results') AS resultados_por_campanha
FROM google_ads_auto_pause_snapshot_payloads p
JOIN google_ads_auto_pause_shadow_evaluations e ON e.snapshot_id = p.snapshot_id
WHERE p.schema_version = 3
ORDER BY p.received_at_utc DESC
LIMIT 5;
```

Após publicar, a ausência de `gurumedia_protection_unavailable` confirma que essa barreira saiu. A paridade só é aceita depois de comparar os valores e as decisões por campanha com a coluna Valor restante do Hub, incluindo campanhas protegidas por venda. Essa verificação não ativa pausas.

## SQL, Hub e configuração

Não há migração SQL, atualização do Hub nem mudança de configuração ou Cron neste pacote.

## Reversão

Se houver falha, restaure do backup privado o worker substituído. Não altere o schema nem apague avaliações ou snapshots.

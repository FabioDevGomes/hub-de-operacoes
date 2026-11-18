# Fase 2A — drenagem do backlog de avaliações sombra

**Estado:** publicado pelo usuário e confirmado no SQL em 2026-11-16. Atualização somente do worker; nenhuma migração SQL.  
**Motivo:** a consulta SQL enviada pelo usuário mostra avaliações em intervalos de cinco minutos para snapshots recebidos juntos. O worker processava apenas um snapshot não avaliado por rodada, em ordem cronológica; assim, capturas novas ficavam atrás de payloads antigos acumulados.

## Alteração

O worker passa a registrar até 10 avaliações sombra por rodada do Cron. Ele continua escolhendo os snapshots mais antigos primeiro, mantendo a ordem cronológica necessária para construir séries históricas em etapas futuras. A busca é repetida após cada inserção, sem carregar todos os JSONs do lote de uma vez.

Esta mudança:

- não cria jobs de pausa;
- não chama a API do Google Ads;
- não altera regras, política, retenção nem o Cron;
- não precisa de SQL;
- mantém o Cron em prévia, sem `--execute`.

## Arquivo para publicação

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

| Arquivo local | Nome de destino |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-worker.php` | `google-ads-auto-pause-worker.php` |

## Publicação manual

1. Faça backup do worker atualmente instalado.
2. Substitua somente `google-ads-auto-pause-worker.php` no destino acima.
3. Não execute SQL e não altere o comando/frequência do Cron.
4. Mantenha o Cron sem `--execute`.

## Conferência após a próxima rodada

Use a consulta abaixo para comparar os horários e a captura mais recente. O esperado é que o worker registre até 10 snapshots ainda não avaliados na mesma rodada; quando houver menos de 10, deve registrar todos os restantes.

```sql
SELECT source_snapshot_id, completed_at_utc, evaluation_due_at_utc,
       evaluated_at_utc, snapshot_state, enabled_rule_count,
       blocked_rule_count, candidate_count
FROM google_ads_auto_pause_shadow_evaluations
ORDER BY evaluated_at_utc DESC
LIMIT 20;
```

Confirme que `candidate_count` continua em zero e que aparecem snapshots recentes em `evaluated_at_utc`. O resultado não valida elegibilidade das regras; a Fase 2B continua pendente.

## Resultado informado pelo usuário

Em 2026-11-16, o usuário mostrou os 20 snapshots retidos como avaliados. O lote foi processado nas rodadas das 20:55 (5), 21:00 (10) e 21:05 (5); todos ficaram com `candidate_count = 0`. A fila observada foi drenada. As regras permanecem bloqueadas por falta dos inputs v2, sem geração de jobs ou pausas.

# Snapshot schema 3 e corte de autoridade — pausas automáticas

**Estado:** pacote local preparado; ainda não publicado e o SQL ainda não foi executado. O pacote agrega os dois incrementos recentes sem editar pacotes anteriores: a avaliação sombra `negative_remaining` com proteção de venda do Hub (schema 3) e o marco temporal para o futuro corte de autoridade.

## Escopo e segurança

- O serviço aceita snapshots schema 1, 2 e 3. Schema 3 carrega `remainingValue` e `saleProtected` já calculados pelo Hub.
- O worker avalia `negative_remaining` em modo sombra: saldo estritamente negativo é candidato; zero/positivo não é. Vendas protegidas não viram candidatas. Valores/identidades ausentes não viram zero.
- A transferência para `server` continua bloqueada sem avaliação, quando a avaliação mais recente está em `shadow`, quando regras estão bloqueadas, há job em processamento ou lease do Hub ativo.
- Se no futuro a transferência for aprovada e todos os critérios estiverem prontos, jobs pendentes ligados a snapshots anteriores ao corte serão marcados `skipped`/`pre_cutover_superseded`, sem apagar as linhas. O horário do corte é guardado em `server_started_at_utc`; o worker não reivindica snapshots anteriores.
- O clique da transferência não pausa campanhas. Esta entrega não autoriza execução real. Preserve o Cron em prévia e não use `--execute`.
- A captura e o envio contínuos de snapshots pelo Hub são mantidos.

## Pré-requisito

A migração anterior da chave de autoridade já deve existir: tabela `google_ads_auto_pause_authority` com linha `authority_id=1` e autoridade `hub`. Este pacote não recria essa tabela nem altera a autoridade.

## Arquivos do servidor

Destino: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local dos PHPs:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-auto-pause-schema3-cutover-2026-11-17\hostinger-private-tools
```

Arquivos a enviar, substituindo apenas os dois correspondentes:

1. `google-ads-auto-pause-worker.php`
2. `google-ads-auto-pause-service.php`

## SQL — executar antes de enviar os PHPs

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-auto-pause-schema3-cutover-2026-11-17\database
```

Execute `google-ads-auto-pause-cutover-watermark.sql` no banco `u572283517_track`. A alteração só acrescenta `server_started_at_utc DATETIME(3) NULL` à tabela de autoridade; é idempotente e não troca a autoridade. Se a tabela de autoridade não existir, pare e instale primeiro a migração base aprovada. Faça backup do banco e dos PHPs privados antes da alteração.

## Sequência recomendada

1. Confirme que a autoridade base existe e está em `hub`; faça os backups.
2. Execute o SQL aditivo acima.
3. Envie `google-ads-auto-pause-worker.php` e depois `google-ads-auto-pause-service.php` ao destino privado.
4. Atualize o Hub local para **v1.378.0**, usando o artefato completo gerado em `painel-operacao/dist` conforme o fluxo de atualização local. Isso ativa o envio de schema 3; não basta trocar só o arquivo HTML se a instalação não atualiza os módulos `dist/google-ads/` e `dist/overview/`.
5. Mantenha o worker em prévia, sem `--execute`. Aguarde uma captura D0 completa schema 3 e confira a avaliação `negative_remaining` por consulta somente leitura.
6. Não transfira a autoridade nesta fase. Enquanto o servidor avaliar em `shadow`, o preflight deve manter `authority=hub` e `ready=false`.

## Conferência somente leitura

```sql
SELECT p.source_snapshot_id,
       p.schema_version,
       p.received_at_utc,
       e.evaluated_at_utc,
       e.snapshot_state,
       e.candidate_count,
       JSON_UNQUOTE(JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.state')) AS negative_remaining_state,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.candidates') AS candidates,
       JSON_EXTRACT(e.result_json, '$.rules.negative_remaining.campaign_results') AS campaign_results
FROM google_ads_auto_pause_snapshot_payloads p
LEFT JOIN google_ads_auto_pause_shadow_evaluations e ON e.snapshot_id = p.snapshot_id
WHERE p.schema_version = 3
ORDER BY p.received_at_utc DESC
LIMIT 5;
```

Compare os valores enviados com a coluna **Valor restante** da Visão geral e confira casos negativos, zero/positivos, venda protegida, exceção e dados ausentes. Essa consulta não altera o banco.

## Reversão

Se a atualização dos PHPs falhar, restaure os dois backups. Não remova a coluna nova nem os snapshots. Se os PHPs forem revertidos para uma versão que não aceita schema 3, interrompa o envio de novos snapshots schema 3 até reinstalar o pacote compatível. A coluna nullable pode permanecer sem afetar a autoridade `hub`.

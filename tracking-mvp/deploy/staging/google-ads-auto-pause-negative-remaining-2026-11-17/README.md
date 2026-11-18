# `negative_remaining` — avaliação sombra do saldo da Visão geral

**Estado:** pacote local preparado; nenhum arquivo foi enviado ao servidor.
**Escopo:** acrescenta os fatos `remainingValue` e `saleProtected` já calculados pelo Hub ao snapshot schema 3 e avalia a regra existente em sombra.

## Arquivos do servidor

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

A pasta `hostinger-private-tools/` contém somente os dois arquivos abaixo, que substituem os correspondentes existentes:

1. `google-ads-auto-pause-service.php` — aceita schema 3, mantendo schema 1 e 2.
2. `google-ads-auto-pause-worker.php` — avalia `negative_remaining` e grava diagnóstico em `result_json`.

Não há SQL nem alteração de configuração/Cron nesta etapa. Preserve o Cron em modo sombra; não use `--execute`.

## Hub local

A atualização do Hub foi preparada na fonte canônica e no build local:

- o Hub usa as linhas enriquecidas de `overviewTableSnapshot()` após a captura ser salva, com o `remainingValue` já calculado e a marca `hasDiarySale` já usada pela tela;
- não cria fórmula financeira paralela;
- o payload schema 3 inclui valor, proteção de venda e identidade por campanha;
- snapshots schema 1/2 seguem aceitos para histórico e regras anteriores.

Instale a versão local gerada em `dist/index.html` conforme o fluxo habitual do Hub. Isso é separado do upload dos arquivos privados acima.

## Sequência manual

1. Faça backup privado dos dois arquivos atuais no destino.
2. Envie os dois arquivos de `hostinger-private-tools/` para o destino privado indicado.
3. Atualize o Hub local com o artefato `dist/index.html` da versão desta entrega.
4. Mantenha o worker sem `--execute` e aguarde uma nova captura D0 automática completa.
5. Consulte as avaliações recentes usando o SQL de leitura abaixo.
6. Compare o `remainingValue` de cada campanha com a coluna **Valor restante** da Visão geral. Confirme negativos como `candidate`, zero/positivos como `not_candidate`, regra desabilitada/exceção/venda protegida conforme controles existentes e valores ausentes como `not_evaluable`.

## Consulta de conferência (somente leitura)

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

A aceitação de paridade exige comparar os valores enviados com os valores exibidos na Visão geral e observar os casos negativos, zero/positivos, regra desabilitada, exceção e proteção de venda já configuradas. `candidate_count` e `candidates` são somente diagnósticos sombra. Esta entrega não cria jobs, não chama a Google Ads API, não pausa campanhas e não muda a autoridade entre Hub e servidor.

## Reversão

Se houver falha, restaure os dois PHPs do backup no mesmo destino. Não é necessária migração nem rollback SQL. O payload schema 3 deixará de ser aceito pela versão antiga do endpoint; por isso, ao reverter os PHPs, pare o upload de novos snapshots schema 3 até reinstalar o pacote atualizado. Snapshots existentes não devem ser apagados.


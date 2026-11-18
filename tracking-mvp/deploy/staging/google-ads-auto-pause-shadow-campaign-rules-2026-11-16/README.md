# Fase 2B — duas regras de pausa em avaliação sombra

**Estado:** arquivos locais, ainda não enviados à Hostinger. O Cron deve permanecer em prévia, sem `--execute`.

Esta etapa acrescenta ao snapshot Hub schema v2 fatos necessários para avaliar em sombra:

- `campaign_age`: início da campanha, data de referência, impressões acumuladas observadas e cobertura;
- `campaign_zero_impressions`: sequência de zeros consecutivos calculada pelo Hub com o Diário e o D0 atual.

O Hub usa os dados já gravados/carregados localmente. Não há consulta adicional à Google Ads API. O endpoint aceita payloads v1 históricos e valida a estrutura/identidade dos fatos v2. O worker aplica as duas regras habilitadas, respeita exceções sincronizadas do Diário e registra as candidatas em `result_json` e `candidate_count`.

**Modo sombra:** nenhuma regra cria job; não há chamada à API do Google Ads, pausa, e-mail ou mudança no comportamento das pausas locais do Hub. As outras regras continuam bloqueadas por falta de dados de produto, vendas/ClickBank ou financeiro. Snapshots v1 existentes não são convertidos; será necessária uma nova captura D0 completa depois que o Hub atualizado for carregado.

## Arquivos para publicação

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Envie nesta ordem:

1. `google-ads-auto-pause-service.php` — passa a aceitar e validar schema v2 mantendo v1.
2. `google-ads-auto-pause-worker.php` — avalia as duas regras em sombra.

Não há SQL nesta etapa. Não altere o wrapper público, o Cron, o `tracking-config.php`, nem o token/configuração privada.

## Sequência

1. Faça backup privado dos dois PHPs existentes.
2. Substitua os dois arquivos no diretório de destino, na ordem acima.
3. Atualize/carregue a nova versão local do Hub (o build da distribuição está separado deste pacote).
4. Mantenha o Cron a cada cinco minutos sem `--execute`.
5. Aguarde uma nova captura D0 automática completa; snapshots v1 antigos não validam a nova regra.
6. No phpMyAdmin, consulte os últimos resultados:

```sql
SELECT p.source_snapshot_id, p.schema_version, p.received_at_utc,
       e.evaluated_at_utc, e.snapshot_state, e.enabled_rule_count,
       e.blocked_rule_count, e.candidate_count, e.result_json
FROM google_ads_auto_pause_snapshot_payloads p
LEFT JOIN google_ads_auto_pause_shadow_evaluations e ON e.snapshot_id = p.snapshot_id
ORDER BY p.received_at_utc DESC
LIMIT 10;
```

A nova captura deve ter `schema_version = 2`. Se as regras estiverem habilitadas na política, `result_json.rules.campaign_age` e `campaign_zero_impressions` devem indicar `evaluated` ou `partially_blocked`, com candidatas hipotéticas detalhadas. `candidate_count` pode ser maior que zero: isso representa somente o resultado sombra e **não** significa job criado ou campanha pausada. Se não houver candidata, o valor será zero.

## Limites conhecidos

- O serviço exige que o Hub consiga salvar e confirmar o cache local dos fatos por ID de snapshot para preservar reenvios idempotentes; se o cache local não puder ser gravado, aquele envio é interrompido e pode ser tentado na próxima captura.
- A idade usa a data D0 da conta e replica o critério local estrito (`idade > limite`); dias sem impressões usa `sequência >= limite` e lacunas não contam como zero.
- Campanhas sem vínculo MCC/conta/campanha válido, sem linha local ou identificadas como históricas não entram como candidatas.
- Vendas manuais continuam fora do escopo, ClickBank continua pendente de associação, e os dados de venda/financeiros não são transferidos por este pacote.

## Estado da publicação

O pacote está somente local. Nenhum arquivo foi enviado e nenhum SQL foi executado nesta etapa.

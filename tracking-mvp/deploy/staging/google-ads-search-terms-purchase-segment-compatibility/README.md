# Compatibilidade da consulta de compras por termo

**Status:** pacote preparado localmente; ainda não enviado nem publicado na Hostinger.

## Arquivo e destino

Faça backup do serviço privado atual e substitua somente este arquivo:

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-search-terms-purchase-segment-compatibility\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)

Não há SQL. O wrapper público, credenciais, configuração privada, banco e cron não mudam.

## Correção

O cabeçalho retornado pelo Google Ads foi `queryError.PROHIBITED_SEGMENT_WITH_METRIC_IN_SELECT_OR_WHERE_CLAUSE`, com status `INVALID_ARGUMENT` e HTTP upstream 400. A consulta de compras seleciona `segments.conversion_action_category = 'PURCHASE'`, que não pode ser combinada com o filtro `metrics.impressions > 0`. A correção troca esse filtro por `metrics.all_conversions > 0`, compatível com o segmento de conversão e adequado para retornar apenas linhas com compras atribuídas.

O período, a campanha, o termo, a palavra-chave e a associação de compras ao termo permanecem os mesmos. A consulta continua somente leitura.

## Conferência após publicação

1. Faça backup e substitua somente o PHP privado indicado.
2. No Hub v1.316.4, abra **Operação → Termos de Pesquisa** e repita a consulta para a mesma conta, campanha e período que falharam.
3. Confirme que a conta retorna resposta completa e que a tabela apresenta os termos; quando houver compras atribuídas à categoria `PURCHASE`, confira quantidade e valor.
4. Se ocorrer novo erro, confira `X-Google-Ads-Diagnostic-ID`, `X-Google-Ads-Error-Codes` e `X-Google-Ads-Field-Paths` nos cabeçalhos da resposta.

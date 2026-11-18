# Correção da consulta de sitelinks

O log identificou `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE`: a consulta filtrava por `campaign.id`, mas não incluía esse campo no `SELECT`. A correção adiciona `campaign.id` às consultas de leitura e verificação dos sitelinks.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-sitelink-query-fix\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — substitui o serviço de ações atual. Faça uma cópia de segurança antes de substituir.

Não envie outros arquivos, não altere `tracking-config.php` e não execute SQL. Não é necessário novo build do Hub.

## Depois do deploy

O botão de nova tentativa pode gravar sitelinks se as consultas de leitura passarem. Use-o apenas quando estiver pronto para aplicar aos 12 pendentes; depois confira o resultado no Hub e no Google Ads. O pacote está local e ainda não foi enviado ao servidor.

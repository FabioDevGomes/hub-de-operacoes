# Google Ads — inclui campaign.id na consulta de assets da campanha

Pacote incremental para corrigir `queryError.EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE` na prévia de **Pausar e duplicar como B**. Inclui também as correções anteriores de ordenação e campos de assets v26.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-campaign-asset-select-fix\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-duplication-service.php](hostinger-private-tools/google-ads-campaign-duplication-service.php)  
Arquivo de destino: `google-ads-campaign-duplication-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-duplication-service.php`

Faça backup no servidor e substitua somente esse arquivo. Não há SQL nem alteração de configuração.

## Causa e correção

A API v26 respondeu que `campaign.id` precisava aparecer no `SELECT` da consulta `FROM campaign_asset`. A consulta agora inclui esse campo; os dados de asset e a forma como o Hub monta a cópia permanecem os mesmos.

Referências: [referência GAQL de campaign_asset v26](https://developers.google.com/google-ads/api/fields/v26/campaign_asset) e [estrutura de consultas GAQL](https://developers.google.com/google-ads/api/docs/query/structure).

## Conferência após o envio

Gere novamente a prévia em **Pausar e duplicar como B** e pare na prévia. Confira todos os avisos e valide manualmente as automações de assets da campanha original antes de confirmar qualquer substituição.

O arquivo está local; não foi enviado nem validado no servidor. Nenhuma chamada real à API nem alteração de campanha foi feita durante a preparação.
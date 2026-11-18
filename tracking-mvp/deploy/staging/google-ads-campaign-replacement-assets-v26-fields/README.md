# Google Ads — campos de assets compatíveis com API v26

Pacote incremental para corrigir `queryError.UNRECOGNIZED_FIELD` na prévia de **Pausar e duplicar como B**. Atualiza o mesmo serviço privado e inclui as correções anteriores de automações de assets e ordenação GAQL.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-assets-v26-fields\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-duplication-service.php](hostinger-private-tools/google-ads-campaign-duplication-service.php)  
Arquivo de destino: `google-ads-campaign-duplication-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-duplication-service.php`

Faça backup no servidor e substitua somente esse arquivo. Não há SQL nem alteração de configuração.

## Causa e correção

A consulta usava nomes de campos de versões antigas ou inexistentes na API v26: `promotion_asset.amount_off_micros`, `promotion_asset.order_over_amount_micros`, `callout_asset.language_code` e `structured_snippet_asset.language_code`. O valor promocional agora é lido e copiado pelos campos `money_amount_off` e `orders_over_amount`; callouts e snippets são recriados com os campos disponíveis no esquema v26, sem idioma inexistente nesses tipos.

Referências oficiais: [campos GAQL de Asset v26](https://developers.google.com/google-ads/api/fields/v26/asset), [CalloutAsset v26](https://developers.google.com/google-ads/api/reference/rpc/v26/CalloutAsset), [StructuredSnippetAsset v26](https://developers.google.com/google-ads/api/reference/rpc/v26/StructuredSnippetAsset) e [PromotionAsset v26](https://developers.google.com/google-ads/api/reference/rpc/v26/PromotionAsset).

## Conferência após o envio

Depois de publicar, gere a prévia em **Pausar e duplicar como B** e confira os dados dos assets e os avisos apresentados. Pare na prévia; não confirme a substituição até revisar manualmente as automações de assets da campanha original. A API pode apontar outra incompatibilidade independente, que deverá ser diagnosticada antes de qualquer alteração real.

O arquivo está local; não foi enviado nem validado no servidor. Nenhuma chamada real à API nem alteração de campanha foi feita durante a preparação.
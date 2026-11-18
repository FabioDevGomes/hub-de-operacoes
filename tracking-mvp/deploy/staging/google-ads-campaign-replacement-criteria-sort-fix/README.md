# Google Ads — ordenação dos critérios na prévia da variante B

Pacote incremental para corrigir `queryError.PROHIBITED_FIELD_IN_ORDER_BY_CLAUSE` na prévia de **Pausar e duplicar como B**. Compatível com o Hub local v1.321.2 e com a correção anterior da consulta de automações de assets.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-criteria-sort-fix\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-duplication-service.php](hostinger-private-tools/google-ads-campaign-duplication-service.php)  
Arquivo de destino: `google-ads-campaign-duplication-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-duplication-service.php`

Faça backup no servidor e substitua somente esse arquivo. Não há SQL nem alteração de configuração. O PHP deste pacote já inclui a correção anterior que remove a seleção GAQL inválida de automações de assets.

## Causa e correção

A API v26 marca `campaign_criterion.resource_name`, `shared_criterion.resource_name`, `ad_group_criterion.resource_name`, `campaign_asset.resource_name` e `ad_group_asset.resource_name` como não ordenáveis. A prévia usava alguns desses campos em `ORDER BY`, que fazia a API rejeitar a consulta. Removemos essas ordenações; mantivemos a ordenação pelos IDs de grupo que são suportados. A ordem das linhas não participa da cópia das configurações.

Referências oficiais: [referência GAQL de campaign_criterion](https://developers.google.com/google-ads/api/fields/v26/campaign_criterion), [shared_criterion](https://developers.google.com/google-ads/api/fields/v26/shared_criterion), [ad_group_criterion](https://developers.google.com/google-ads/api/fields/v26/ad_group_criterion), [campaign_asset](https://developers.google.com/google-ads/api/fields/v26/campaign_asset), [ad_group_asset](https://developers.google.com/google-ads/api/fields/v26/ad_group_asset).

## Conferência após o envio

Depois de publicar, abra a ficha de campanha, clique em **Pausar e duplicar como B** e gere a prévia. Confira a advertência de automações de assets e pare na prévia; não confirme a substituição enquanto não revisar manualmente a campanha original. Uma nova validação ainda pode expor outro campo incompatível independente.

O arquivo está local; não foi enviado nem validado no servidor. Nenhuma chamada real à API nem alteração de campanha foi feita durante a preparação.
# Google Ads — consulta GAQL de variante B na API v26

Pacote incremental para corrigir a prévia de **Pausar e duplicar como B**. A interface local passa a exibir v1.320.6 após o build; a alteração funcional deste pacote é somente o serviço privado.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-v26-selectable-fields\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-duplication-service.php](hostinger-private-tools/google-ads-campaign-duplication-service.php)  
Arquivo de destino: `google-ads-campaign-duplication-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-duplication-service.php`

Faça backup no servidor e substitua somente esse arquivo. Não envie README, dispatcher, wrapper público, configuração, credenciais ou arquivos de outro pacote. Não há SQL nem alteração de configuração.

## Causa e correção

A prévia já passava da incompatibilidade antiga com os campos date-only, mas a consulta GAQL então falhava com `queryError.PROHIBITED_FIELD_IN_SELECT_CLAUSE`. Ela selecionava `campaign.maximize_conversions.cpc_bid_ceiling_micros` e `cpc_bid_floor_micros` junto com `FROM campaign`. Esses dois campos existem no modelo RPC de estratégia, mas não estão disponíveis como campos selecionáveis no recurso `campaign` v26. A consulta agora mantém `campaign.maximize_conversions.target_cpa_micros` e remove os campos proibidos.

Para campanhas Search, o Google documenta que os limites de lance de Maximize Conversions não são suportados pelo sistema de lances e são ignorados. O CPA, orçamento, demais configurações e recursos copiados continuam seguindo o fluxo atual.

## Conferência depois da publicação

1. Atualize a página local e confirme que o Hub mostra v1.320.6.
2. Faça backup do serviço atual no destino indicado e envie o arquivo acima para substituí-lo.
3. No Diário da campanha, clique em **Pausar e duplicar como B** e confira a prévia.
4. Para verificar apenas esta correção, pare na prévia: não confirme a substituição. A prévia consulta e valida, mas não cria a campanha B nem pausa a original.

Não houve chamada à Google Ads API, validação de prévia em conta real, criação de campanha ou pausa durante a preparação deste pacote. O arquivo está local; ainda não foi enviado nem validado no servidor.

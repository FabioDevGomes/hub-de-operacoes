# Google Ads — consulta repetida de automações na substituição B

Pacote incremental para corrigir a falha `queryError.PROHIBITED_FIELD_IN_SELECT_CLAUSE` na prévia de **Pausar e duplicar como B**. O Hub local precisa estar na versão **v1.321.2** para exigir o novo campo de segurança e exibir a advertência.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-asset-automation\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-duplication-service.php](hostinger-private-tools/google-ads-campaign-duplication-service.php)  
Arquivo de destino: `google-ads-campaign-duplication-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-duplication-service.php`

Faça backup no servidor e substitua somente esse arquivo. Não envie README, dispatcher, configuração, credenciais ou outros arquivos. Não há SQL nem alteração de configuração.

## Causa e correção

A prévia executava uma consulta GAQL com `campaign.asset_automation_settings.asset_automation_type` e `campaign.asset_automation_settings.asset_automation_status`. `campaign.asset_automation_settings` é um campo repetido; o GAQL proíbe campos repetidos no `SELECT`. O serviço removeu a consulta inválida.

A API não permite ao Hub consultar essas automações por esse caminho, e a campanha nova não as recebe. Na variante B, a confirmação do Hub avisa para verificar manualmente se a campanha original tem automações de assets habilitadas. Se tiver, cancele a substituição. A duplicação em lote continua bloqueada enquanto não for possível verificar esse estado. A consulta GAQL inválida foi removida; uma rejeição posterior de `validateOnly` ainda pode expor outro problema independente.

Referências oficiais: [restrições GAQL para campos repetidos](https://developers.google.com/google-ads/api/docs/query/structure) e [configurações de automação de assets](https://developers.google.com/google-ads/api/docs/assets/asset-automation-settings).

## Conferência após o envio

1. Faça backup e substitua o único arquivo PHP no destino indicado.
2. Atualize o Hub local até mostrar **v1.321.2** e recarregue a ficha da campanha.
3. Clique em **Pausar e duplicar como B**. Leia a advertência de automações de assets e confira manualmente as configurações na campanha original.
4. Se nenhuma estiver habilitada, gere a prévia e pare nela para conferir; não confirme a substituição nesta validação.

O arquivo está local; não foi enviado nem validado no servidor. Nenhuma chamada real à API nem alteração de campanha foi feita durante a preparação.

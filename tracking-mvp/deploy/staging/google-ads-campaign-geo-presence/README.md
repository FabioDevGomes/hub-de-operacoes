# Google Ads — segmentação por presença nas novas campanhas

Pacote incremental do endpoint privado de criação Google Ads. Toda campanha Search nova criada pelo Hub define `campaign.geo_target_type_setting.positive_geo_target_type = PRESENCE`, equivalente à opção **Presença: pessoas que estão nos locais incluídos ou que frequentam a área** do Google Ads. A prévia `validateOnly` usa a mesma operação de criação e retorna o valor configurado. Depois de criar, o serviço consulta a campanha e só confirma a criação se o Google Ads retornar `PRESENCE`.

Esta mudança só atua em campanhas novas criadas por este fluxo. Não atualiza campanhas existentes nem modifica a seleção atual de locais/países. A criação continua pausada. `PRESENCE` restringe a segmentação positiva a pessoas nos locais selecionados ou que os frequentam; deixa de incluir quem apenas demonstrou interesse. Referência: [Location targeting na Google Ads API](https://developers.google.com/google-ads/api/docs/targeting/location-targeting).

## Arquivo a publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-geo-presence\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)  
Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

Antes de substituir, faça backup do arquivo instalado. Envie somente esse PHP para o destino informado. Não exige SQL, mudança de configuração, alteração do wrapper público ou atualização do Hub local. O pacote está preparado localmente e ainda não foi enviado ao servidor.

## Verificação após publicar

1. Confirme que o arquivo foi substituído no destino privado.
2. No Hub, valide uma prévia de campanha nova. A linha da prévia deve confirmar `PRESENCE` e indicar pessoas que estão ou frequentam os locais incluídos. `validateOnly` não cria campanhas.
3. Se criar uma campanha, confirme no resultado que o serviço verificou no Google Ads o status pausado e o tipo geográfico `PRESENCE`.
4. Não use este endpoint para corrigir campanhas existentes; essa ação não faz parte deste pacote.

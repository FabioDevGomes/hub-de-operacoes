# Google Ads — progresso do CSV de segmentação

Pacote incremental da versão 1.185.0. O endpoint privado transmite o CSV em eventos NDJSON, um bloco para o cabeçalho e um bloco por grupo de anúncios concluído. O Hub passa a mostrar os grupos e as linhas já gerados. A lista fixa privada de 918 IDs continua sendo lida no servidor.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-audience-targeting-progress\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — serviço PHP com a operação de CSV por fluxo.

Faça backup do PHP existente e substitua somente esse arquivo. O pacote não inclui novamente `google-ads-audience-targeting-ids.json`; o JSON já instalado precisa permanecer junto ao serviço no mesmo diretório.

Não há SQL, alteração de `trackingConfig.php`, token ou mudança de configuração. O endpoint antigo `audience_targeting_upload_csv` continua disponível para clientes anteriores; o Hub 1.185.0 usa a operação nova `audience_targeting_upload_csv_stream`. A geração só lê a lista privada e os grupos salvos no lote, sem chamar nem consumir cota da Google Ads API.

## Depois do envio

1. Confirme que o PHP foi substituído no destino indicado.
2. Atualize/reabra o Hub local na versão 1.185.0.
3. Em **Segmentação por públicos**, baixe o CSV e confira o contador: ele avança em grupos concluídos, somando 918 linhas por grupo. Ao final, o arquivo deve conter o cabeçalho e `grupos × 918` linhas.

O progresso ao vivo depende de o servidor web encaminhar os blocos sem buffering. O endpoint envia `X-Accel-Buffering: no` e faz `flush()` após cada grupo; se a hospedagem ainda armazenar a resposta inteira, o Hub só receberá o progresso quando o fluxo chegar. O pacote está local e ainda não foi enviado ao servidor.

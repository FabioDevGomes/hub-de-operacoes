# Google Ads — URL dos sitelinks sem barra terminal

Pacote incremental para normalizar a URL final lida do anúncio antes de acrescentar a seção escolhida. URLs como `https://getdentabiome.travenzo.shop/` passam a gerar `https://getdentabiome.travenzo.shop#1`; caminhos, portas e query string são preservados, enquanto barras no fim do caminho são removidas.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local com o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-sitelink-url-normalization\hostinger-private-tools
```

1. `google-ads-campaign-action-service.php` — serviço privado que lê a URL final de cada anúncio e associa a âncora `#1` a `#6` ao destino.

Faça backup do arquivo atual e substitua somente esse PHP no destino indicado. Não envie este README, o wrapper público, a configuração privada, credenciais, nem os arquivos das pastas de outros pacotes.

As dependências já presentes no mesmo diretório — `google-ads-readonly-service.php`, `google-ads-campaign-pause-email-service.php` e `google-ads-campaign-duplication-service.php` — continuam necessárias e não fazem parte deste pacote.

## Comportamento após o envio

A normalização acontece somente quando você usar **Aplicar sitelinks** no Hub: o serviço lê a URL final de cada anúncio, remove as barras no fim do caminho e acrescenta a âncora escolhida (`#1` a `#6`). Importar e salvar a copy no lote continua sendo uma operação local; a API só é chamada pela ação explícita de aplicação.

Pacote preparado localmente; nenhum arquivo foi enviado à Hostinger e nenhuma operação Google Ads foi executada.

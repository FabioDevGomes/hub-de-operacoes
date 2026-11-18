# Google Ads — correção da consulta para atualização de URLs

Corrige consultas GAQL usadas para ler e confirmar URLs de anúncios, palavras-chave e assets de campanha. Os campos filtrados no `WHERE`, incluindo `campaign.id` e status dos anúncios e critérios, agora também aparecem no `SELECT`.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local com o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-destination-url-gaql-fix\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — versão atualizada do serviço privado de ações do Google Ads. Faça backup do arquivo atual e substitua somente esse arquivo no destino indicado.

Não envie outros arquivos, não altere `tracking-config.php` e não execute SQL. O serviço continua usando os helpers e dependências já presentes em `private-tools`; este pacote não os altera. Não é necessário novo build do Hub: a interface local v1.192.6 já contém o botão de atualização de URLs.

## Depois do deploy

1. Confirme no gerenciador de arquivos da Hostinger que o PHP foi substituído no destino acima.
2. Reabra o lote no Hub e confira se as 12 campanhas continuam pendentes.
3. Clique em **Atualizar URLs** e confirme a operação. As consultas agora selecionam os campos usados nos filtros GAQL antes de ler os destinos.
4. Confira o resultado de cada campanha no Hub e valide as URLs no Google Ads.

O pacote está local e ainda não foi enviado ao servidor. Nenhuma campanha foi alterada por esta correção local.

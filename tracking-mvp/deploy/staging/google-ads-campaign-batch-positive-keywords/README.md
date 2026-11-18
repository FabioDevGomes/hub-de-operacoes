# Palavras-chave positivas por lote — staging

Este pacote acrescenta prévia e inclusão de palavras-chave positivas nas campanhas Search de um lote salvo no Hub. Os critérios são criados no nível do grupo de anúncios. A mesma seção da tela serve para lotes criados pelo modo API do Hub ou pelo fluxo CSV, desde que as campanhas estejam salvas/associadas com IDs reais.

## Arquivo deste pacote

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local para upload:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-batch-positive-keywords\hostinger-private-tools
```

Arquivo: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)

Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

O pacote contém uma cópia integral do serviço privado com as operações novas. Ele está preparado localmente e **não foi enviado ao servidor**. Preserve `tracking-config.php`, o wrapper público e os outros serviços privados. O Hub local também precisa estar atualizado/buildado.

## Operações e segurança

- `preview_batch_positive_keywords`: confere somente as campanhas, grupos e termos especificados; mostra combinações já presentes e ausentes e não grava no Google Ads.
- `apply_batch_positive_keywords`: exige confirmação explícita e a assinatura da prévia. Repete as leituras, recusa a gravação se campanha, grupo, status ou critérios tiverem mudado, cria somente critérios ausentes como `ENABLED` no grupo confirmado e lê novamente para confirmar.

Cada campanha precisa ser Search, estar `ENABLED` ou `PAUSED` e ter exatamente um grupo de anúncios identificado no lote. Campanhas com mais de um grupo ou grupo/status divergente são recusadas. Lotes aceitam até 100 campanhas, 100 termos e 10.000 combinações. Termos seguem os limites de 80 caracteres e 10 palavras, com correspondência ampla, de frase ou exata. Grupos e campanhas ativos podem começar a veicular as palavras imediatamente; a interface lista os ativos na confirmação. Uma escrita de resultado incerto não é repetida automaticamente.

## Configuração e cota

Não há arquivo de configuração neste pacote. A inclusão fica bloqueada até o responsável habilitar no `tracking-config.php` privado o novo flag `tracking_google_ads_campaign_batch_positive_keywords_enabled`. Ele está `false` por padrão no código e não é habilitado por este pacote. Também são exigidos a escrita de campanhas, a MCC permitida e a hierarquia/autorização de conta conferida pelo serviço.

A prévia, a revalidação antes do envio e a leitura posterior consomem chamadas de leitura; somente as combinações ausentes geram gravação. A contagem exibida é de operações e não de unidades exatas de cota. Não há SQL, migração, wrapper público, alteração de credenciais ou mudança na configuração nesta entrega.

## Verificações e estado

- O serviço privado passou por verificação de sintaxe PHP local.
- O build local do Hub é executado no repositório `painel-operacao`.
- Não foram feitas chamadas à Google Ads API, alterações em contas ou verificações pós-deploy.
- Estado da publicação: local, ainda não enviado à Hostinger.

Qualquer publicação futura deve seguir o procedimento de backup privado. Mantenha o flag desligado até decidir liberar o recurso.

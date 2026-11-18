# Palavras-chave negativas associadas ao lote — staging

Este pacote acrescenta ao serviço privado Google Ads as operações de prévia e aplicação de palavras-chave negativas para todas as campanhas Search de um lote salvo no Hub. A lista e os resultados pertencem ao lote selecionado no armazenamento local do navegador. O serviço cria critérios negativos individuais no nível da campanha; não cria nem edita listas compartilhadas.

O arquivo PHP de serviço também contém as operações de palavras-chave positivas por lote, adicionadas depois desta entrega e descritas separadamente no [README de palavras-chave positivas](../google-ads-campaign-batch-positive-keywords/README.md). A inclusão positiva tem flag independente e permanece desativada por padrão.

## Arquivo deste pacote

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local para upload:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-negative-keywords-batch\hostinger-private-tools
```

Arquivo: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)

Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

Envie somente esse arquivo para substituir a versão correspondente. Preserve `tracking-config.php`, o wrapper público e os demais serviços privados. O Hub local também precisa estar atualizado/buildado; ele não está incluído nesta pasta. Este pacote está em staging e não foi enviado ao servidor.

## Contrato acrescentado

O endpoint existente `google-ads-campaign-action.php` aceita duas operações novas:

- `preview_batch_negative_keywords`: confere somente as campanhas e os termos enviados pelo lote; retorna campanhas, combinações já presentes, itens ausentes e uma assinatura da prévia. Não grava no Google Ads.
- `apply_batch_negative_keywords`: exige confirmação explícita e a assinatura da prévia. Refaz as leituras e recusa gravar se campanha, status, termo ou critério existente mudou. Cria somente as combinações ausentes, no nível da campanha, e lê novamente para conferir. Uma resposta incerta não é repetida pelo serviço.

As campanhas devem pertencer a uma única MCC permitida e ser Search com status `ENABLED` ou `PAUSED`. Cada lote aceita até 100 campanhas, 100 termos e 10.000 combinações campanha × termo. Cada termo pode ter até 80 caracteres e 10 palavras. A interface avisa quando a confirmação inclui campanhas ativas, pois as negativas podem alterar o tráfego imediatamente.

## Configuração e liberação

Nenhum arquivo de configuração está neste pacote. A prévia e a aplicação permanecem bloqueadas até a liberação explícita das flags no `tracking-config.php` privado. São exigidos os controles já existentes:

- `tracking_google_ads_campaign_writes_enabled` habilitado;
- MCC incluída em `tracking_google_ads_campaign_write_manager_customer_ids`;
- `tracking_google_ads_negative_keywords_enabled` habilitado;
- flag nova `tracking_google_ads_campaign_batch_negative_keywords_enabled` habilitada.

A flag nova é `false` por padrão no código; este pacote não altera a configuração. Não a habilite como parte do upload automático. As flags existentes continuam necessárias e governam operações já presentes. A gravação também depende da autorização e hierarquia de conta conferidas pelo serviço.

## Escopo e cota

A prévia lê campanha e critérios negativos existentes; a aplicação repete as leituras, grava apenas critérios ausentes e faz leitura posterior para confirmar. A quantidade de operações de escrita é no máximo o número de combinações ausentes indicado na confirmação. Leituras e gravações consomem cota Google Ads; a contagem de operações da interface não equivale a unidades exatas de cota. Não há SQL, migração, wrapper público, alteração de credenciais ou arquivo de configuração nesta entrega.

## Verificações e estado

- O serviço de origem passou por verificação de sintaxe PHP local.
- O build local do Hub deve ser executado no repositório `painel-operacao`.
- Não foram feitas chamadas à API Google Ads, gravações em contas ou testes pós-deploy.
- Estado da publicação: local, ainda não enviado à Hostinger.

Antes de substituir o arquivo no servidor, faça o backup privado correspondente pelo procedimento padrão de deploy. Depois do upload, mantenha as flags como estão até decidir liberar o recurso.

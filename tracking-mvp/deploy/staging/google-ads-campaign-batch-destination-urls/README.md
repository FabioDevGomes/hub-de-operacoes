# Google Ads — URLs finais em lote

Pacote incremental para carregar a URL HTTPS publicada na etapa Ficha e Presell e, depois de confirmação, atualizar os destinos finais das campanhas de um lote salvo.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local com o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-batch-destination-urls\hostinger-private-tools
```

1. `google-ads-campaign-action-service.php` — endpoint privado atualizado com a operação `apply_campaign_destination_url`.

Faça backup do arquivo atual e substitua somente esse PHP no destino indicado. Não envie este README, o wrapper público, `trackingConfig.php`, credenciais ou outros arquivos.

O endpoint continua incluindo `google-ads-readonly-service.php`, `google-ads-campaign-pause-email-service.php` e `google-ads-campaign-duplication-service.php`. Esses arquivos precisam permanecer no mesmo diretório; este pacote não os altera. A operação usa a autorização de criação de campanha e a allowlist MCC já configuradas. Não há mudança SQL ou nova configuração.

## Como funciona

Na criação de campanhas, o Hub usa a URL HTTPS por conta do trabalho publicado/confirmado selecionado em **Ficha e Presell**, desde que o produto corresponda. Em lote já salvo, mostra uma URL editável por conta e persiste as alterações nesse lote no navegador. URLs podem ser recarregadas da Pre-Sell selecionada; essa leitura é local e não chama a Google Ads API.

Depois da confirmação explícita, o serviço verifica que os IDs informados pertencem ao mesmo cliente Google Ads e são campanhas Search pausadas ou ativas. Para cada campanha, atualiza os anúncios, palavras-chave com URL própria e assets de URL ligados diretamente à campanha, incluindo sitelinks e promoções. Preserva os modelos/sufixos de acompanhamento e as seções `#1` a `#6` dos sitelinks. Depois, relê os recursos e verifica os resultados.

Assets compartilhados com campanhas fora do lote e assets vinculados no nível da conta não são alterados para evitar mudanças fora do escopo do lote. Nesses casos, o resultado fica marcado como parcial e identifica os recursos preservados. A operação faz consultas e gravações na cota Google Ads. A alteração de URLs pode iniciar revisão editorial e interromper temporariamente a veiculação.

## Conferência após o envio

1. Confira o backup e confirme que o arquivo PHP foi substituído na pasta do servidor indicada.
2. Atualize a distribuição local do Hub para a versão que contém **URLs finais deste lote**.
3. Para campanhas novas, selecione a Pre-Sell publicada correspondente na etapa **Ficha e Presell**; confira a URL por conta na prévia.
4. Para um lote existente, reabra-o, confira a URL de cada conta e ajuste manualmente se necessário.
5. Quando quiser aplicar, confira as contas, URLs e campanhas listadas, clique em **Atualizar URLs** e confirme. O serviço processa uma campanha por vez e salva o resultado no lote; campanhas completas não são reenviadas numa nova tentativa.
6. Confira os resultados parciais, se houver, e valide as URLs dos anúncios, palavras-chave e assets no Google Ads.

O pacote está local. Nenhum arquivo foi enviado ao servidor e nenhuma alteração foi aplicada a campanhas nesta implementação.

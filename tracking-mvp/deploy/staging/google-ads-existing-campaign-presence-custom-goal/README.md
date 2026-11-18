# Confirmar presença e meta personalizada em campanha existente

Pacote incremental local, ainda não publicado. Faça backup privado do arquivo instalado e substitua somente `google-ads-campaign-action-service.php` no diretório `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`. Não há SQL, alteração de configuração nem atualização de endpoint público.

O novo `apply_existing_campaign_delivery_settings` valida identidade, MCC, conta, canal Search e estado `PAUSED`. Consulta a meta da MCC, corrige `positiveGeoTargetType` para `PRESENCE` somente se estiver diferente e aplica `meta personalizada da ação compra` com `Conversão compra off-line (upload)` somente se a configuração de meta ou as metas padrão para lances divergirem. A resposta verifica a campanha pausada e as configurações. Falhas podem deixar uma etapa parcialmente gravada; o Hub devolve e salva o checkpoint para consulta antes de qualquer nova tentativa.

O Hub processa uma campanha por clique após confirmação. Campanhas ativas ou que não sejam Search são recusadas. Quando a configuração já está correta, não são enviadas gravações. A consulta de campanha e as leituras da configuração de meta continuam usando cota; a quantidade efetiva de operações deve ser conferida nos cabeçalhos/resultados da integração durante o primeiro uso. Nenhum teste deste pacote chama uma conta Google Ads real.

## Arquivo a enviar

Em `hostinger-private-tools/`, envie apenas `google-ads-campaign-action-service.php` para o diretório privado indicado no início. Atualize a distribuição local do Hub antes de usar o botão **Presença e meta personalizada**.

## Conferência manual após publicação

1. Abra um lote com uma campanha Search pausada e confira nome, ID e conta.
2. Clique em **Conferir e corrigir** para uma campanha.
3. Confirme em Google Ads que a campanha segue pausada, a inclusão de locais usa **Presença** e a meta personalizada/ação esperada está ativa sem metas padrão para lances.
4. Confira o checkpoint salvo no lote após atualizar a página. Só depois repita nas demais campanhas.

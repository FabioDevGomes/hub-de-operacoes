# Google Ads — localizar campanhas existentes na prévia

Pacote incremental do serviço privado usado pela tela **Criar campanha**. A prévia passa a consultar o nome exato antes de `validateOnly`. Se localizar uma campanha única, devolve ID, status, tipo, compatibilidade de públicos e dados do grupo de anúncios; não cria outra campanha. Mais de uma correspondência continua como conflito.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Esta pasta local contém somente o PHP necessário para esta etapa:

1. `google-ads-campaign-action-service.php` — substitui a versão atual do mesmo serviço privado.

Faça backup do arquivo instalado e substitua somente esse PHP no destino indicado. Não envie o README, wrapper público, SQL, lista de públicos, serviços de e-mail, `tracking-config.php` ou credenciais. O arquivo deve continuar em `private-tools`, fora de `public_html`.

Não há alteração de SQL nem configuração. O serviço relê status e compatibilidade antes de aplicar exclusões/segmentação; a prévia não grava recursos. A interface atualizada é distribuída pelo build local do Hub, separadamente deste pacote.

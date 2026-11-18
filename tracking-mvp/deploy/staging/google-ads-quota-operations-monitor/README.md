# Monitoramento confirmado de operações Google Ads

**Estado:** pacote preparado localmente; ainda não enviado ao servidor.

## Arquivo e destino

- Envie somente `hostinger-private-tools/google-ads-readonly-service.php` para `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`.
- Faça backup do arquivo privado atual antes de substituí-lo.
- Não é necessário atualizar o wrapper público, banco, `tracking-config.php`, credenciais ou cron.

O serviço passa a expor contadores agregados de operações Google Ads nos cabeçalhos da resposta. Uma resposta HTTP recebida do Google, inclusive erro, é confirmada; uma falha de transporte sem resposta fica como não confirmada. As chamadas OAuth não entram no contador. Nenhum dado de conta, campanha, termo, GAQL ou resposta é enviado nesses cabeçalhos.

Depois do envio, a tela local Google Ads API poderá separar as chamadas do Hub das operações confirmadas por este PHP. Endpoints de ações e eventos sem esses cabeçalhos continuam usando a estimativa local.

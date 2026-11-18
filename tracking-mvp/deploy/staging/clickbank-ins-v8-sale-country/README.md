# Staging — país e ação nas vendas ClickBank INS v8

**Estado:** implementação local, ainda não publicada no servidor.

Este pacote é um overlay pequeno para a integração INS v8 já instalada. Ele mantém `transaction_time_utc` como está, passa a guardar somente o código ISO de duas letras do país de cobrança, e inclui a ação de conversão configurada em cada linha de venda no relatório JSON do Hub.

O país vem de `customer.billing.address.country` informado à ClickBank: é o país do endereço de cobrança, não a localização física/IP do comprador. Nenhum nome, e-mail ou endereço é persistido ou devolvido pela API. País ausente ou fora do formato ISO alpha-2 fica `NULL`.

A ação exibida em cada venda é o valor global atual de `tracking_hub_conversion_name`, que também é usado para preparar o CSV. O nome não fica gravado individualmente no evento; a fase posterior poderá tornar essa configuração administrável pelo Hub.

## Publicação manual

1. Faça backup dos três arquivos PHP de mesmo nome no diretório privado atual `private-tools/`, fora de `public_html`.
2. No phpMyAdmin, selecione o banco usado pelo receptor e execute **uma única vez** `database/clickbank-ins-v8-sale-country.sql`. Essa alteração é aditiva e não modifica os registros existentes. Se a coluna `customer_country` já existir, não execute novamente.
3. Envie os três arquivos abaixo para o mesmo `private-tools/` em que já estão o serviço do receptor e o serviço da API, substituindo os arquivos correspondentes somente depois do backup:

| Arquivo deste pacote | Destino |
| --- | --- |
| `hostinger-private-tools/clickbank-ins-v8-lib.php` | `private-tools/clickbank-ins-v8-lib.php` |
| `hostinger-private-tools/clickbank-ins-v8-service.php` | `private-tools/clickbank-ins-v8-service.php` |
| `hostinger-private-tools/clickbank-ins-v8-api-service.php` | `private-tools/clickbank-ins-v8-api-service.php` |

Não envie este pacote para a pasta pública. Não substitua `tracking-config.php`, não altere as URLs de notificação na ClickBank e não execute o SQL original `clickbank-ins-v8.sql` novamente.

## Conferência

- No Hub local, consulte **Vendas INS v8**. A lista mantém **Horário UTC** e passa a exibir **País (cobrança)** e **Ação de conversão**.
- Um `TEST` antigo continuará sem país se foi recebido antes desta migração; isso é esperado. A coluna histórica fica `NULL`, sem tentativa de inferir país.
- Para uma venda afiliada real recebida após o deploy, confirme o país de duas letras e o nome global da ação. A ação deve aparecer somente em linhas `SALE` de afiliado não-test; teste, reembolso e outros eventos mostram `—`.
- A API continua mascarando recibo e GCLID. Não use uma venda real para teste do CSV sem revisar a elegibilidade e evitar reenviar conversões já aceitas.

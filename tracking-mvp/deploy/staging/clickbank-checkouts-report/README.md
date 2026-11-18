# Staging — relatório de checkouts ClickBank por Track

**Status:** implementação local pronta para publicação manual. Ainda não foi enviada à Hostinger. O Hub só preencherá a coluna **Checkouts** depois de publicar os dois arquivos abaixo.

## Arquivos e destinos

Faça backup dos arquivos de mesmo nome, se existirem, e envie somente:

| Arquivo deste pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/clickbank-checkouts-report.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/clickbank-checkouts-report.php` |
| `hostinger-private-tools/clickbank-checkouts-report-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-checkouts-report-service.php` |

O wrapper público procura os serviços em `private-tools/`, fora de `public_html`. A instalação existente precisa manter `clickbank-ins-v8-api-service.php` e `tracking-config.php` nos locais já usados pelas outras APIs. Não publique nenhum serviço privado em `public_html`.

## Como a contagem funciona

- Lê eventos `ORDER_IMPRESSION` e `ORDER_FORM_IMPRESSION` de `clickbank_postback_events`.
- Liga cada checkout ao clique de saída por `extclid` exato. Conta na coluna somente quando há uma única combinação de domínio e produto e ela ainda está cadastrada como Track ClickBank.
- Checkouts sem correspondência ou com mais de uma Track possível são excluídos da coluna e aparecem nos totais de diagnóstico do Hub. A contagem representa aberturas registradas de checkout, não compras.
- A resposta contém apenas totais agregados por domínio/produto; não retorna extclid, click ID, ID do evento, comprador, recibo ou URLs.
- A rota exige o token Bearer do Hub e uma origem permitida no `tracking-config.php`; aceita GET e OPTIONS. O serviço executa somente `SELECT`.
- Não altera o receptor ClickBank, o worker de e-mail, o cron, as tabelas nem a tag das Pre-Sells. **Não execute SQL** e não substitua o `tracking-config.php` ou o serviço compartilhado de autenticação.

## Conferência após publicar

1. Abra o Hub local em **Integrações → Tracking ClickBank**.
2. A coluna começa com `—` até a primeira resposta. Ao abrir a tela, ela consulta checkouts automaticamente junto com vendas; o botão **Atualizar vendas e checkouts** consulta ambos manualmente.
3. Confirme que uma Track com checkout reconhecido mostra a contagem e que a coluna continua separada de **Vendas (SALE)**. Uma resposta de erro de checkout não apaga uma contagem carregada anteriormente.

Os arquivos fonte correspondentes estão em `public/clickbank-checkouts-report.php` e `tools/clickbank-checkouts-report-service.php`.

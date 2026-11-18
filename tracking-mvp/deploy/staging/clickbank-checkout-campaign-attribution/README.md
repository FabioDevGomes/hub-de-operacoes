# Staging — atribuição de checkouts ClickBank à campanha

**Status:** alteração local pronta para publicação manual; não foi enviada à Hostinger. O Hub novo negocia o schema 2 do mesmo endpoint e continua aceitando schema 1. O serviço retorna schema 1 aos clientes que não solicitarem o detalhamento.

## Arquivo e destino

Faça backup do arquivo de mesmo nome, se existir, e envie somente:

| Arquivo deste pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/clickbank-checkouts-report-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-checkouts-report-service.php` |

O wrapper público existente em `/home/u572283517/domains/travenzo.shop/public_html/track/clickbank-checkouts-report.php` e o serviço compartilhado `clickbank-ins-v8-api-service.php` permanecem necessários e não fazem parte deste pacote. Não publique o serviço privado em `public_html`.

## O que muda

- O serviço continua lendo os mesmos checkouts e preserva as contagens existentes por Track.
- Quando o Hub solicita o media type `application/vnd.hub.clickbank-checkouts-v2+json`, a resposta inclui contagens agregadas por Track, campanha e estado de atribuição.
- O ID de campanha vem de `utm_campaign` no evento de clique. O nome é resolvido localmente no Hub por ID Google Ads exato e único.
- Eventos sem ID, com ID inválido/conflitante, ou sem uma única Track cadastrada não são atribuídos a uma campanha por aproximação.
- A resposta contém agregados e IDs de campanha, nunca `extclid`, `click_id`, IDs de evento, comprador, recibo ou URL.
- A rota continua somente leitura; não faz chamadas à Google Ads API, não consome a cota do Google Ads e não altera campanhas.
- Não requer migração SQL, alteração do receptor, do token, do wrapper público ou do `tracking-config.php`.

## Conferência após publicar

1. Abra o Hub local atualizado em **Integrações → Tracking ClickBank**.
2. Aguarde a consulta automática de checkouts ou use **Atualizar vendas e checkouts**.
3. Na coluna **Campanhas · checkouts**, expanda a linha da Track. Campanhas com um ID único aparecem pelo nome do cadastro local; estados sem atribuição segura e seus totais são apresentados separadamente.
4. Checkouts de cliques anteriores à gravação de `utm_campaign` seguem contados na Track, mas aparecem como sem ID de campanha.

O arquivo fonte incluído corresponde a `tracking-mvp/tools/clickbank-checkouts-report-service.php`.

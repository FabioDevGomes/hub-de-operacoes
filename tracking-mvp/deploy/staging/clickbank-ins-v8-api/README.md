# Staging — API ClickBank INS v8 para o Hub

**Status:** implementação local pronta para revisão e publicação manual. Não foi enviada à Hostinger. Ela consulta as vendas que o receptor INS v8 já grava e prepara um CSV somente após ação explícita no Hub.

Este pacote é separado de `deploy/current/` (postback legado), do pacote do receptor `deploy/staging/clickbank-ins-v8/` e da URL da integração externa de tracking. Não substitua o receptor e não altere nem remova a URL da integração externa.

## Arquivos e destinos

Faça backup dos arquivos de mesmo nome, se existirem, e envie somente:

| Arquivo deste pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/clickbank-ins-v8-report.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/clickbank-ins-v8-report.php` |
| `hostinger-public-track/clickbank-ins-v8-csv.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/clickbank-ins-v8-csv.php` |
| `hostinger-public-track/clickbank-ins-v8-sales.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/clickbank-ins-v8-sales.php` |
| `hostinger-private-tools/clickbank-ins-v8-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-api-service.php` |
| `hostinger-private-tools/clickbank-ins-v8-sales-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-sales-api-service.php` |

Os wrappers públicos procuram os serviços somente em `private-tools/` fora de `public_html`. Não envie arquivos de serviço para a pasta pública.

## Configuração e segurança

- As três tabelas `clickbank_ins_v8_*` já devem existir; **não execute SQL** para instalar esta API.
- A API reutiliza do `tracking-config.php` privado as chaves `db_host`, `db_name`, `db_user`, `db_password`, `tracking_hub_api_token` e `tracking_hub_allowed_origins`. `tracking_hub_conversion_name` fica opcional como compatibilidade do GET de CSV para Hubs antigos. O novo Hub envia o nome da ação selecionada no POST autenticado. Na instalação mostrada pelo usuário, o arquivo está em `~/tracking-config.php`, na raiz da conta e fora de `public_html`. Não envie nem substitua `tracking-config.php`.
- O token é aceito apenas como `Authorization: Bearer ...`, com a origem exata do Hub autorizada. Requisições sem Origin autorizado, sem token válido ou fora dos métodos por rota são recusadas. O relatório aceita somente GET; o CSV aceita POST JSON com `conversion_name` (e GET legado para compatibilidade); a nova rota de vendas aceita somente POST JSON paginado.
- `clickbank-ins-v8-sales.php` lê páginas de até 200 transações reais de afiliado com tipo `SALE`, excluindo TEST. Ela associa somente pelo `extclid` exato a eventos `outbound_click` e retorna hostname/produto apenas quando existe um único par distinto. A resposta contém ID interno, horário da transação e de recebimento, comissão total e moeda, estado da associação e, quando único, o par Track. Não inclui recibo, GCLID, extclid ou dados do comprador. O schema 2 é consumido pelo Hub para a atualização local do Faturamento; vendas sem comissão/moeda válidas são informadas e não recebem valor aproximado.
- O cursor usa o ID máximo de um snapshot e o Hub relê o histórico inteiro em cada atualização explícita. Isso revisita vendas antigas para detectar se a associação de clique ficou disponível depois; não depende de `updated_at`, que a tabela não tem.
- O relatório não devolve GCLID ou recibo completos. O CSV autenticado inclui esses campos apenas quando o usuário clica para baixar no Hub.
- O serviço faz somente `SELECT`; não grava tabelas, não cria arquivos no servidor, não marca transações como enviadas e não chama o Google Ads. Não há ajuste no receptor ClickBank.

## Validação após o upload

1. Abra `https://track.travenzo.shop/clickbank-ins-v8-report.php` diretamente. Sem o Origin e token do Hub, uma recusa HTTP é esperada; esse teste não valida autenticação funcional.
2. Abra o Hub local em **Operação → Tracking ClickBank**, informe o token já configurado e use **Consultar vendas INS v8** para o relatório/CSV ou **Atualizar vendas e checkouts** na tabela Tracks. O botão também sincroniza as comissões elegíveis no Faturamento local deste navegador; não envia dados ao Google Ads.
3. Confirme que o Test IPN aparece como `TEST IPN`, com recibo/GCLID mascarados, e está fora do CSV. Enquanto não houver SALE elegível, o botão de baixar permanece desabilitado.
4. Com venda futura elegível, revise tipo, produto(s), comissão total e comissão por item. Só depois clique manualmente em **Baixar CSV para Google Ads**. O arquivo não é enviado automaticamente.

Elegibilidade do CSV v1: `source=clickbank_ins_v8`, papel `AFFILIATE`, evento `SALE`, não teste, recibo/horário/comissão/GCLID válidos, moeda USD, atribuição explícita ou associação exata `extclid`, comissão reconciliada quando há itens e recibo sem duplicidade entre vendas elegíveis. Uma venda com vários itens produz uma linha com a comissão total; os itens continuam detalhados no Hub.

O código-fonte correspondente fica em `public/` e `tools/`. `tests/clickbank-ins-v8-api-deploy-package.test.php` confere que as cópias deste pacote estão sincronizadas e que nenhuma configuração ou migração foi incluída. `tests/clickbank-ins-v8-sales-api.test.php` cobre cursores, vínculo exato, múltiplos cliques na mesma Track, ambiguidade, histórico legado e redução de dados.

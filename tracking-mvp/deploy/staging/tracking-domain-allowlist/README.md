# Staging — cadastro autenticado de domínios de pre-sell

**Escopo:** pacote-base da fase 1 (allowlist dinâmica). O usuário confirmou que cadastrou o domínio pelo Hub. A simplificação do script da pre-sell é uma atualização posterior e está em [`../presell-single-script/README.md`](../presell-single-script/README.md); use aquele pacote no próximo upload, não este README.

## Arquivos e destinos

Faça backup do `collect.php` atual antes de substituí-lo. Envie somente:

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/collect.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/collect.php` |
| `hostinger-public-track/tracking-domains.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/tracking-domains.php` |
| `hostinger-private-tools/tracking-domains-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/tracking-domains-api-service.php` |
| `hostinger-private-tools/tracking-domain-allowlist-lib.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/tracking-domain-allowlist-lib.php` |
| `database/tracking-domain-allowlist.sql` | Executar uma vez no banco do tracking, via phpMyAdmin |

Não envie este README, o exemplo de configuração, nem a pasta do pacote inteira para um único diretório. Preserve `tracking-config.php`; ele já contém as credenciais e a allowlist legada.

## Configuração inicial do token administrativo

1. Na tela **Tracking → Domínios de pre-sell** do Hub local, clique em **Gerar token seguro** e depois **Baixar configuração privada**.
2. Faça upload do arquivo baixado `tracking-domain-admin-config.php` para **a mesma pasta privada onde está o `tracking-config.php`**, sempre fora de `public_html`. Não substitua o arquivo de configuração existente.
3. Digite o mesmo token no campo administrativo do Hub. Ele fica apenas na memória desta aba e não é salvo no `localStorage`, IndexedDB ou nos arquivos do projeto.
4. Não envie o arquivo gerado para a pasta pública, Git, chat ou pacote de deploy. Ele é o segredo administrativo separado do token de consulta de vendas.

A API também verifica a origem do Hub em `tracking_hub_allowed_origins`, no `tracking-config.php` existente. Para o painel local, ela precisa conter exatamente `http://127.0.0.1:8765`. Não copie nem reenvie a configuração inteira.

## Migração e comportamento

O schema inicial da tabela inclui `product_label`, o rótulo legível da Track. Em tabelas já criadas, use a migração idempotente do pacote `../presell-product-identity/database/tracking-product-identity.sql` antes de publicar a API que lê/grava esse campo.

- Confira no phpMyAdmin se `tracking_allowed_domains` ainda não existe; se existir, pare e compare a estrutura antes de executar a migração.
- O SQL cria uma tabela nova, sem alterar as tabelas de eventos, ClickBank ou dados existentes.
- O `collect.php` atualizado continua aceitando os hosts da allowlist antiga. Para os novos, exige que a origem HTTPS e o host de `page_url` coincidam com um registro explícito da nova tabela. `www` é uma entrada separada.
- A API `https://track.travenzo.shop/tracking-domains.php` exige token administrativo e origem local autorizada. `GET` lista somente os domínios desta tabela; `POST` adiciona de forma idempotente. Não há remoção na primeira versão.
- Se a tabela/API/token ainda não estiverem prontos, o Hub informa o erro e não afirma que liberou o domínio. Os domínios legados continuam no coletor.
- O `collect.php` deste diretório permanece sincronizado com a fonte para testes de integridade; para publicar a atualização de `track.js`, coletor e conciliação via `extclid`, use o pacote posterior `presell-single-script` e siga a migração aditiva descrita nele.

## Validação após a publicação manual

1. Confira `php -l` nos dois arquivos públicos e nos dois privados.
2. Execute a migração uma única vez e confirme no phpMyAdmin que a tabela foi criada sem linhas.
3. No Hub local, use a API administrativa para atualizar a lista; a resposta deve mostrar `0 domínio(s)` antes do primeiro cadastro.
4. Cadastre um hostname de teste HTTPS. Se marcar `www`, a lista deve exibir os dois hosts. Cadastre novamente para confirmar idempotência.
5. Teste a pre-sell já hospedada no domínio cadastrado; só então teste um hostname não cadastrado, que deve receber recusa do coletor.

O upload e a execução real da migração permanecem manuais. Esta entrega local não prova que a versão está publicada.

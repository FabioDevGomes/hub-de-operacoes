# Referência técnica — Hostinger / tracking ClickBank → Google Ads

Notas operacionais para consulta em futuras alterações. Caminhos e resultados abaixo foram registrados a partir das capturas e comandos compartilhados na conversa; não representam uma nova inspeção do servidor ao vivo. Nenhuma senha, token, GCLID ou dado de compra é armazenado neste documento.

## Fonte da verdade e publicação manual

**Regra acordada em 21/10/2026:** usar os arquivos locais do projeto como referência e considerar que a versão publicada na Hostinger corresponde ao arquivo local enviado pelo usuário por último. O usuário faz os uploads; não editar arquivos diretamente no servidor nem presumir que uma mudança local já esteja publicada. Essa paridade é uma premissa operacional, não uma verificação remota.

O `tracking-config.php` real é uma exceção: não está no workspace porque contém credenciais; somente o exemplo está disponível localmente. Assim, não se deve afirmar que sua allowlist privada está sincronizada com uma cópia local. A primeira versão local da API administrativa acrescenta novos domínios numa tabela dedicada, mantendo a allowlist legada sem editar ou substituir esse arquivo. A instalação inicial da API/coletor ainda exige upload e migração SQL; depois disso não haverá deploy por domínio. Veja [../PLANO-CADASTRO-DOMINIOS-PRESELL.md](../PLANO-CADASTRO-DOMINIOS-PRESELL.md).

A primeira versão local da API e da atualização do coletor está em `deploy/staging/tracking-domain-allowlist/`; ela ainda não foi enviada ao servidor. O Hub gera `tracking-domain-admin-config.php`, que deve ficar ao lado do `tracking-config.php`, fora de `public_html`. Não substitua nem edite a configuração existente para instalar a allowlist dinâmica.

## Pastas no servidor

| Finalidade | Caminho observado |
| --- | --- |
| Arquivos públicos do tracking | `/home/u572283517/domains/travenzo.shop/public_html/track/` |
| Scripts privados do exportador | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/` |
| Configuração privada | `/home/u572283517/domains/travenzo.shop/tracking-config.php` |

`tracking-config.php` fica fora de `public_html`. Ele contém credenciais e configurações sensíveis: não copiar para `deploy/`, não enviar ao GitHub, não substituir durante o deploy e não colar valores no Hub. A checagem para GitHub encontrou no `tracking-config.example.php` um valor literal no campo `db_password` que não parece placeholder. O valor foi omitido e o arquivo não foi alterado; não publique esse exemplo até substituí-lo por um placeholder. Se esse valor ainda corresponder à senha ativa, troque-a no servidor antes de publicar.

## Ambiente confirmado nas capturas

- PHP-CLI no SSH da Hostinger: PHP 8.2.34, NTS.
- PHP servido por HTTP: PHP 8.3.35. O texto completo do PHP Info enviado pelo usuário confirma `PDO support: enabled`, `PDO drivers: mysql, sqlite`, `PDO Driver for MySQL: enabled` e `OpenSSL support: enabled`. CLI e web podem usar versões diferentes.
- O PHP-CLI local desta sessão está disponível na versão 8.2.34; isso não é a mesma versão do PHP web no servidor.

## Endpoints e autorização

- Relatório JSON: `https://track.travenzo.shop/google-ads-report.php`.
- CSV autenticado: `https://track.travenzo.shop/google-ads-csv.php`.
- O Hub local consultado usa a origem `http://127.0.0.1:8765`; ela precisa estar autorizada na configuração CORS privada do servidor.
- O Hub usa um token de acesso próprio, diferente do token de postback da ClickBank. O valor é configurado em `~/domains/travenzo.shop/tracking-config.php`, chave `tracking_hub_api_token`. A tela do Hub pode lembrá-lo no `localStorage` do navegador local, sem criptografia e fora dos backups JSON do Hub; **Desconectar** remove a cópia. O valor nunca deve aparecer nesta referência, em código público ou em commits.

## Fluxo e limites atuais

1. O script da pre-sell registra a saída para o HopLink e o identificador de clique.
2. As capturas de 16/10/2026 mostram o Custom Postback/Pixel da ClickBank ativo, papel Affiliate, S2S Postback/Custom, Initial Purchase e Test Integration entregue com HTTP 200. Isso é evidência histórica, não confirmação da configuração presente. O código espera macros e um token conforme o README; ele não é um receptor para o payload nativo do INS v8.
3. O exportador atual consulta os eventos do Custom Postback por macros e considera elegíveis apenas compras com clique correspondente e identificador Google válido; registros sem clique ou com identificador fictício/de teste são ignorados. Ele ainda não consulta vendas INS v8.
4. O Hub consulta o relatório e permite revisar/importar um CSV. Ele não grava a base operacional nem envia conversões ao Google Ads; o upload do CSV no Google Ads continua manual.

**Integração diferente:** a captura de tela compartilhada em 15/10/2026 mostra **Vendor Settings → My Site → Advanced Tools → Instant Notification URL** configurada para a integração externa de tracking e marcada `Verified`. Essa URL de INS é independente do Custom Postback do nosso servidor. A decisão atual é manter a URL da integração externa, que continua como remetente ao Google Ads, e futuramente adicionar uma URL INS v8 própria em paralelo, somente depois de implementar e testar um receptor separado. Não substituir a URL da integração externa nem apontar o INS v8 ao endpoint de macros. A configuração atual da conta não foi revalidada ao vivo.

## Auditoria do postback

- O usuário informou que criou `clickbank_postback_attempts` no banco para registrar cada tentativa autenticada, inclusive duplicatas.
- O endpoint atualizado precisa ser enviado para `public_html/track/clickbank-postback.php`; ele preserva a gravação idempotente em `clickbank_postback_events` e responde também com `insert_result` e `audit_logged`.
- Consulta da tabela de auditoria:

```sql
SELECT attempt_id, received_at_utc, diagnostic_id, event_id, event_type,
       insert_result, http_status, has_extclid, matched_click
FROM clickbank_postback_attempts
ORDER BY attempt_id DESC
LIMIT 20;
```

- `inserted` significa novo evento; `duplicate`, evento já existente; `not_inserted`, evento não encontrado após `INSERT IGNORE`; `db_error`, falha de gravação do evento. A tabela não armazena token, URL bruta ou dados do comprador.

O modelo/exportador atual de macros não armazena item/SKU ou título do produto e agrega compras elegíveis. O contrato [INS v8](../CONTRATO-DADOS-VENDAS-INS-V8.md) prevê transações com vários itens, comissão total como valor de conversão e comissão por item no Hub. A estrutura criada no banco foi conferida pelo usuário: 38 colunas, 17 registros de índices e FK `line_items.transaction_id` → `transactions.id` com `RESTRICT` nos dois eventos. A primeira versão do receptor foi enviada pelo usuário; quatro Test IPN foram descriptografados, mas rejeitados como `invalid_payload`/HTTP 400, sem linha de transação. O staging local atualizado contém diagnóstico seguro por campo para substituir os dois arquivos privados. Consulta/CSV v8 e integração ao Hub seguem pendentes. Não inferir produto para registros antigos. O contrato mantém o valor bruto separado da comissão e define um registro CSV por recibo, sem envio automático ao Google Ads.

O PHP local desta sessão não carrega extensões por configuração padrão; as DLLs `openssl` e `pdo_mysql` vieram com o runtime e foram ativadas apenas nos comandos de teste. A descriptografia sintética passou. No PHP web da Hostinger, OpenSSL e PDO MySQL foram confirmados pelo PHP Info. A gravação das tentativas reais foi confirmada; uma transação INS ainda não foi persistida. O usuário informou que configurou `clickbank_ins_v8_secret_key` somente no array do `tracking-config.php` privado; não copiar a chave para este repositório ou pacote.

## Verificações já observadas

- O SSH confirmou `php -l` sem erros para os scripts do exportador e os dois endpoints públicos em testes anteriores.
- O exportador respondeu `Autotestes do exportador aprovados` em uma execução no servidor.
- Uma captura do Hub mostrou quatro postbacks avaliados, zero conversões elegíveis e quatro ignorados: dois sem clique correspondente e dois com GCLID fictício/de teste. Isso valida a leitura do relatório naquela execução, mas não comprova uma compra real nem a correção do PHP-CLI local.
- Houve anteriormente um `private_service_unavailable` por resolução do caminho da biblioteca privada. Os endpoints públicos atuais procuram `google-ads-api-lib.php` em `private-tools`; não mova essa pasta para `public_html` para contornar esse erro.

## Comandos de diagnóstico no SSH

Os comandos abaixo não incluem credenciais. Execute-os apenas para diagnóstico ou após um upload; a rotina normal do usuário continua sendo copiar os arquivos de `deploy/current/` para os dois destinos descritos em `LEIA-ME.md`.

```sh
php -v
php -m | grep -iE 'PDO|pdo_mysql|pdo_sqlite'
php -l /home/u572283517/domains/travenzo.shop/public_html/track/clickbank-postback.php
php -l /home/u572283517/domains/travenzo.shop/tracking-config.php
php -l /home/u572283517/domains/travenzo.shop/public_html/track/google-ads-report.php
php -l /home/u572283517/domains/travenzo.shop/public_html/track/google-ads-csv.php
cd ~/domains/travenzo.shop/domains/travenzo.shop/private-tools
php -l export-google-ads.php
php -l google-ads-api-lib.php
php -l google-ads-export-lib.php
php -l google-ads-export-service.php
php export-google-ads.php --self-test
php export-google-ads.php --conversion-name="Conversão compra off-line (upload)"
```

O último comando gera prévia por padrão; não acrescente `--write` sem revisar a saída e confirmar que quer gravar o CSV no servidor. Não compartilhe a saída se ela contiver identificadores reais de cliques ou compras.

## Preparação segura para GitHub

Esta pasta `tracking-mvp` não foi reconhecida como um repositório Git e não tem `.gitignore`. Há cinco ZIPs antigos no projeto. Antes de publicar, confirme qual repositório será usado, substitua o valor literal identificado em `tracking-config.example.php` por placeholder e crie regras de exclusão para configurações reais, segredos, CSVs/relatórios com dados, arquivos temporários e ZIPs gerados. Stage, commit e push permanecem sob controle do usuário.

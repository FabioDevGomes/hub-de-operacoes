# Staging — receptor ClickBank INS v8

**Estado em 18/10/2026:** o receptor foi instalado pelo usuário. Um Test IPN foi aceito e aparece no banco como `TEST`/`is_test = 1`; a URL própria aparece `Verified`. Confirme **Save Changes** na ClickBank se ainda não foi feito. Este pacote descreve o receptor; não é o pacote de leitura/CSV do Hub, que está separado em `deploy/staging/clickbank-ins-v8-api/`. Não alterar o endpoint de macros nem a URL da integração externa de tracking.

## O que foi confirmado

- Em 18/10/2026, o usuário confirmou no phpMyAdmin as 38 colunas, os 17 registros de índices e a FK `clickbank_ins_v8_line_items.transaction_id` → `clickbank_ins_v8_transactions.id`, com `RESTRICT` para atualização e exclusão.
- O PHP web da Hostinger informado no PHP Info é 8.3.35; `PDO support` está habilitado, `PDO drivers` inclui `mysql`, `pdo_mysql` está habilitado e `OpenSSL support` está `enabled`.
- A auditoria `clickbank_ins_v8_attempts` registrou tentativas anteriores rejeitadas e o usuário depois confirmou a linha `TEST` aceita na tabela de transações. O GET do endpoint retorna 405 por ser somente POST; esse resultado isolado não valida o Test IPN.

## Arquivos deste pacote

| Arquivo | Destino manual na Hostinger |
| --- | --- |
| `hostinger-public-track/clickbank-ins-v8.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/clickbank-ins-v8.php` |
| `hostinger-private-tools/clickbank-ins-v8-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-service.php` |
| `hostinger-private-tools/clickbank-ins-v8-lib.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-lib.php` |

As cópias aqui devem permanecer idênticas às fontes em `public/` e `tools/`; `tests/clickbank-ins-v8-deploy-package.test.php` verifica isso. O pacote intencionalmente não inclui SQL, `tracking-config.php`, tokens, senhas, chave INS, payloads ou dados de venda.

## Configuração privada

O endpoint lê o `tracking-config.php` já existente em `/home/u572283517/domains/travenzo.shop/tracking-config.php`. **Não substitua, mova ou envie esse arquivo.** O usuário informou que acrescentou ao array retornado a chave secreta do INS configurada na ClickBank:

```php
'clickbank_ins_v8_secret_key' => 'INSIRA_A_CHAVE_PRIVADA_DIRETAMENTE_NO_SERVIDOR',
```

Esse trecho é somente uma orientação para mesclar ao array existente — não é um arquivo PHP autônomo para substituir a configuração. Não cole a chave aqui, no Hub, no repositório, em pacotes de deploy ou em logs. As chaves `db_host`, `db_name`, `db_user` e `db_password` já existentes são reutilizadas pelo receptor.

## Estado deste pacote

- Não é necessário reenviar este pacote como parte da integração Hub/CSV; ela usa os endpoints próprios do pacote `clickbank-ins-v8-api/`.
- O arquivo privado `clickbank-ins-v8-service.php` deste diretório permanece sincronizado com a fonte para testes de integridade. Para a atualização que concilia `extclid` preservado pela integração externa, use o pacote posterior `deploy/staging/presell-single-script/` e siga a ordem do README específico.
- Não altere o receptor nem repita Test IPN sem necessidade. Se surgir alteração futura, faça backup e use este pacote apenas após revisar o diff e instruções atualizadas.
- O parser aceita ISO 8601 estendido/básico, fuso com ou sem `:`, `Z` e fração decimal com ponto/vírgula. Sem fuso, preserva o texto e deixa UTC nulo, sem presumir o fuso do servidor; esse evento não será elegível ao CSV até haver horário UTC confiável.
- A transação `TEST` nunca é exportável para o Google Ads; ela serve apenas para conferir recepção e persistência.
- Se ainda não clicou em **Save Changes** na ClickBank, faça isso para ativar notificações futuras. Não substitua nem desligue a URL da integração externa de tracking.
- Não execute o SQL de `clickbank-ins-v8.sql` novamente: as tabelas já existem e sua estrutura foi conferida.
- Não faça upload de CSV nem envie conversões ao Google Ads nesta fase.

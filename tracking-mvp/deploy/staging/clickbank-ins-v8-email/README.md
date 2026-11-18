# Notificações por e-mail: vendas e abertura do checkout ClickBank

**Estado:** extensão preparada localmente; nada foi enviado à Hostinger e nenhuma configuração ClickBank foi alterada.

O worker já usado para avisos INS de teste e vendas `SALE` também enviará alertas de **Order form impression** pelo Custom Postback/Pixels. A ClickBank define esse evento como a visita inicial ao formulário de pedido. Ele **não significa compra ou pagamento**. O postback apenas grava e enfileira; o SMTP continua sendo executado depois pelo worker CLI agendado. Reenvios do mesmo `event_id` não duplicam o aviso.

**Filtro de Track no aviso de checkout:** o worker associa o `extclid` do postback a uma única identidade `outbound_click` (`presell_host` + `product_key`) e exige que o mesmo par ainda exista em `tracking_allowed_domains`, a lista de Tracks cadastradas no Hub. Somente então envia o e-mail. Se o clique não existir, for ambíguo ou pertencer a uma Track removida/não cadastrada, o evento é marcado como ignorado (`last_error_code=checkout_track_not_registered`) e não é tentado de novo pelo Cron. Erros de banco continuam em retentativa. Quando elegível, o assunto é `Checkout ClickBank` e o corpo contém somente o nome cadastrado (ou a chave técnica se não houver rótulo), horário do evento e horário de recebimento em `America/Sao_Paulo`. O identificador de clique não é incluído na mensagem. A associação depende dos campos `product_key`, `presell_host` e `product_label` da migração e API de domínios; veja `../presell-product-identity/README.md`.

### Atualização do filtro de checkout por Track cadastrada

Para aplicar esta regra numa instalação já publicada, faça backup e substitua somente estes dois arquivos privados; não é necessária migração SQL, troca do endpoint público, alteração no Cron nem mudança na tag das Pre-Sells:

| Arquivo neste pacote | Destino no servidor |
| --- | --- |
| `hostinger-private-tools/clickbank-ins-v8-email-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-email-service.php` |
| `hostinger-private-tools/clickbank-ins-v8-email-worker.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-email-worker.php` |

### Se a primeira versão do checkout já foi publicada

O teste revelou que um `ORDER_IMPRESSION` sintético reutilizou um `event_id` já salvo como `PURCHASE`. Para essa instalação, a correção incremental é **somente** executar `database/clickbank-postback-event-type-key.sql` e substituir a cópia pública de `clickbank-postback.php`. O helper público, o serviço/worker privados e a outbox já instalados não precisam ser reenviados. Antes da migração, confira `SHOW INDEX FROM clickbank_postback_events;`: execute-a somente se existir a chave única antiga `uq_clickbank_postback_event_id`; não a repita se `uq_clickbank_postback_event_type` já existir.

## Pré-requisitos

- A integração INS v8 está instalada, com a tabela `clickbank_ins_v8_transactions` e a tabela de fila de e-mails `clickbank_ins_v8_email_outbox` existentes.
- O endpoint atual do Custom Postback/Pixels e a tabela `clickbank_postback_events` já existem.
- O arquivo privado compartilhado `tracking-email-config.php` está instalado e válido, e o Cron existente executa `clickbank-ins-v8-email-worker.php` uma vez por minuto. O worker atualizado também aceita o nome legado `clickbank-email-config.php` enquanto a configuração genérica não existir.
- O PHP do servidor dispõe de PDO MySQL e OpenSSL para conexão SMTP criptografada. O worker usa SMTP com SSL/TLS ou STARTTLS; não faz fallback para `mail()`.

## Publicação manual

1. Faça backup privado dos arquivos atualmente instalados: `clickbank-postback.php` na pasta pública do tracking e `clickbank-ins-v8-email-service.php`/`clickbank-ins-v8-email-worker.php` em `private-tools/`. **Não substitua** `clickbank-ins-v8-service.php`, `clickbank-ins-v8-lib.php`, `tracking-config.php` nem a configuração SMTP.
2. No phpMyAdmin, selecione o banco do postback e ajuste primeiro a deduplicação: confira `SHOW INDEX FROM clickbank_postback_events;` e, se ainda houver a chave única `uq_clickbank_postback_event_id`, execute **uma vez** `database/clickbank-postback-event-type-key.sql`. Essa migração preserva todas as linhas e altera a unicidade para o par `event_id` + `event_type`. Não a repita se `uq_clickbank_postback_event_type` já existir.
3. A tabela `clickbank_postback_email_outbox` já foi encontrada no banco desta instalação, então não execute novamente `database/clickbank-postback-email-outbox.sql`. Em uma instalação onde a tabela ainda não exista, execute esse SQL uma vez. A tabela INS `clickbank_ins_v8_email_outbox` usada pelos avisos de venda não deve ser recriada.
4. Atualize os arquivos em sequência para evitar que o endpoint aponte temporariamente para um helper ausente: primeiro `clickbank-postback-email-lib.php`, depois o serviço de e-mail e o worker privados, e por último `clickbank-postback.php` na pasta HTTPS de `track.travenzo.shop`:

   | Arquivo neste pacote | Destino |
   | --- | --- |
   | `hostinger-public-track/clickbank-postback.php` | pasta pública do tracking `/clickbank-postback.php` |
   | `hostinger-public-track/clickbank-postback-email-lib.php` | pasta pública do tracking `/clickbank-postback-email-lib.php` |
   | `hostinger-private-tools/clickbank-ins-v8-email-service.php` | `private-tools/clickbank-ins-v8-email-service.php` |
   | `hostinger-private-tools/clickbank-ins-v8-email-worker.php` | `private-tools/clickbank-ins-v8-email-worker.php` |

   Faça primeiro o upload da migração; mantenha o serviço/worker privados. Não envie arquivos privados a `public_html` nem mude a URL/token existente do Postback/Pixels.
5. No Custom Postback/Pixels existente da ClickBank, habilite o evento **Order form impression**, mantendo os eventos de compra já selecionados. Não altere a URL, o token nem a integração INS da integração externa. Confirme que a URL já usa as macros `{event_id}` e `{event_type}` (e, se disponível, `{event_time}`); sem `event_type`, o receptor não identifica a abertura.
6. O Cron existente deve continuar chamando `clickbank-ins-v8-email-worker.php` uma vez por minuto; não crie uma segunda tarefa. A saída agora soma vendas e checkouts e continua sem imprimir dados pessoais ou credenciais.

## Como conferir

- Para uma Track cadastrada no Hub, gere um **Order form impression** e aguarde até um minuto pelo Cron; deve chegar `Checkout ClickBank` com o nome da Track e os dois horários. Para uma página sem Track cadastrada, o e-mail deve ser suprimido; a fila marca a linha como `checkout_track_not_registered` sem retentativas.
- Faça também um **Test IPN** separado para confirmar que os avisos INS continuam funcionando; deve chegar `TESTE - Notificação ClickBank`, e o registro continua excluído do CSV.
- Uma venda `SALE` real de afiliado gera aviso com a comissão no assunto (por exemplo, `Venda ClickBank recebida - US$ 137,45`) e no corpo, além de horário UTC, país de cobrança, total bruto e resumo de itens. Esse e-mail pede revisão no Hub; não declara elegibilidade final, não gera CSV e não envia conversões ao Google Ads.
- Reembolsos, cobranças recorrentes, upsells, eventos de vendedor e outros tipos não geram aviso de checkout nesta versão.
- Eventos anteriores não são importados. O primeiro aviso de checkout será posterior à publicação e habilitação do tipo de evento; cada nova impressão pode gerar uma mensagem, inclusive reaberturas.

No phpMyAdmin, confirme o recebimento sem consultar dados de comprador:

```sql
SELECT event_type, COUNT(*) AS quantidade, MAX(received_at_utc) AS ultimo_evento
FROM clickbank_postback_events
WHERE LOWER(event_type) LIKE '%impression%'
GROUP BY event_type;

SELECT notification_kind,
       COUNT(*) AS total,
       SUM(sent_at_utc IS NOT NULL) AS enviados,
       SUM(sent_at_utc IS NULL) AS pendentes
FROM clickbank_postback_email_outbox
GROUP BY notification_kind;
```

## Retentativas e limites

- As filas guardam apenas referências dos eventos, categoria, tentativas, horários e códigos curtos de erro; não guardam destinatário, senha SMTP, payload, GCLID ou `extclid`.
- Falhas tentam novamente após 1 min, 5 min, 15 min, 1 h e, depois, a cada 6 h. As linhas são mantidas para impedir duplicação em reenvios.
- O SMTP tem semântica de **pelo menos uma vez**: se o servidor aceitar a mensagem e a conexão do worker cair antes de gravar `sent_at_utc`, pode chegar um aviso duplicado após a retentativa.
- Falha de SMTP não apaga a fila. O worker registra somente um código de erro não sensível.
- A fila de checkout é separada dos eventos INS e não muda o fluxo de conversões da integração externa para Google Ads.

## Diagnóstico técnico incremental

### Publicar a associação do nome do Track no checkout

1. Faça backup da tabela/código conforme o procedimento normal e confira `tracking_allowed_domains.product_label`. Se não existir, execute a migração atualizada `../presell-product-identity/database/tracking-product-identity.sql`; ela adiciona somente a coluna nula e não reescreve valores existentes.
2. Atualize `tracking-domain-allowlist-lib.php` e `tracking-domains-api-service.php` do pacote `../presell-product-identity/` em `private-tools/`.
3. Substitua o arquivo privado `clickbank-ins-v8-email-service.php` por esta versão do pacote. Não é preciso trocar o endpoint público, as tabelas de outbox, a URL/token do Custom Postback ou a configuração SMTP.
4. Depois de atualizar também o Hub local, re-salve os Tracks já existentes para preencher `product_label`. Novos cadastros já o gravam junto com a chave técnica.

Se a associação de clique não for única, não existir ou não corresponder a uma Track atualmente cadastrada no Hub, o aviso não é enviado e o outbox é marcado como `checkout_track_not_registered`. Problemas de consulta ao banco continuam seguindo o mecanismo normal de retentativas.

Se esta extensão já está publicada e o campo `last_error_code` mostra somente `notification_failed`, substitua **apenas** o arquivo privado `hostinger-private-tools/clickbank-ins-v8-email-service.php` pela cópia atual deste pacote. Não é necessária migração SQL, mudança no endpoint público, troca da configuração SMTP ou criação de outro Cron. Faça backup do arquivo privado antes de substituí-lo.

Na instalação em diagnóstico, `notification_build_failed` revelou uma dependência ausente: o worker CLI tentava usar o classificador do checkout que era carregado pelo endpoint público, mas não pelo worker privado. A versão atual do serviço privado agora contém seu próprio classificador equivalente; publique esta atualização para corrigir essa falha antes da próxima retentativa.

Na próxima tentativa do worker, a fila passa a guardar uma categoria de falha mais específica, sem registrar a mensagem bruta do servidor, endereços, senha ou conteúdo do e-mail. Consulte apenas os campos operacionais:

```sql
SELECT e.event_type, o.notification_kind, o.attempt_count,
       o.last_error_code, o.next_attempt_at_utc, o.sent_at_utc
FROM clickbank_postback_events AS e
JOIN clickbank_postback_email_outbox AS o ON o.postback_event_id = e.id
WHERE e.event_type = 'ORDER_IMPRESSION'
ORDER BY e.received_at_utc DESC
LIMIT 5;
```

Códigos como `smtp_connect_failed`, `smtp_starttls_failed`, `smtp_auth_failed`, `smtp_sender_rejected`, `smtp_recipient_rejected` e `smtp_message_rejected` apontam a etapa que precisa ser investigada. `notification_build_failed`, `outbox_update_failed` e `smtp_unexpected_failure` distinguem falhas locais não classificadas da rejeição normal do SMTP. Os valores armazenados são categorias fixas; detalhes sensíveis do erro nunca são persistidos.

## Testes locais

```powershell
php -l tools/clickbank-ins-v8-service.php
php -l tools/clickbank-ins-v8-email-service.php
php -l tools/clickbank-ins-v8-email-worker.php
php -l public/clickbank-postback.php
php -l public/clickbank-postback-email-lib.php
php tests/clickbank-ins-v8-email.test.php
php tests/clickbank-ins-v8-email-deploy-package.test.php
```

Os testes usam valores sintéticos e não conectam ao SMTP, à ClickBank, ao banco de produção ou ao Google Ads.

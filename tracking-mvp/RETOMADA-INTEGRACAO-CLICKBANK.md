# Retomada — ClickBank: captura de vendas INS v8 e CSV

**Atualizado em:** 22/10/2026
**Objetivo:** continuar a captura própria de vendas futuras e preparar o CSV pelo Hub sem confundir o Custom Postback/Pixels por macros com o INS v8.

## Decisão vigente

- A prioridade é **capturar vendas futuras** pela nossa própria URL de **INS v8**, separada do receptor atual de macros. A URL própria aparece como `Verified` e o Test IPN foi gravado; confirmar **Save Changes** se ainda não foi feito. Não substituir a URL de INS da integração externa de tracking.
- A integração externa permanece como remetente de compras ao Google Ads durante a captura e validação paralelas. Nesta etapa, o nosso servidor/Hub **não envia** conversões ao Ads; o CSV será preparado para revisão e download, sem upload automático.
- O escopo é prospectivo. Não fazer backfill de vendas históricas nem importar registros antigos neste pipeline.
- Capturar transações de qualquer produto, incluindo vários `lineItems`; manter comissão por item e total da comissão. Comissão é o valor de negócio principal; o valor bruto cobrado do comprador fica separado.
- O CSV v1 representa uma venda `SALE` por recibo: `Conversion Value` usa a comissão total `totalAccountAmount`, moeda USD e `Order ID` igual ao recibo. Os detalhes dos itens ficam no Hub; não haverá automaticamente uma ação de conversão por produto.
- A captura do evento **Order form impression** (visita inicial ao formulário de pedido) foi implementada localmente como extensão do Custom Postback/Pixels e do worker de e-mail. Durante o teste, detectou-se que a ClickBank reutilizou um `event_id` sintético já salvo como `PURCHASE`; a deduplicação foi ajustada para usar o par `event_id` + `event_type`. O pacote atualizado inclui uma migração para essa chave e ainda aguarda publicação/migração manual. O evento não significa compra ou pagamento.
- A decisão detalhada de campos, atribuição e elegibilidade está em [CONTRATO-DADOS-VENDAS-INS-V8.md](CONTRATO-DADOS-VENDAS-INS-V8.md), que é a referência funcional mais recente.

## Estado atual — o que existe e o que não existe

- `public/track.js` e `public/collect.php` registram visitas e cliques; links ClickBank explicitamente marcados recebem `extclid`, que pode ser relacionado ao `click_id` próprio.
- `public/clickbank-postback.php` recebe o formato personalizado de **Custom Postback/Pixels** (macros + token), registra eventos em `clickbank_postback_events` e pode auditar tentativas em `clickbank_postback_attempts`. Esse endpoint **não** descriptografa nem recebe o JSON criptografado do INS v8.
- O pacote `deploy/staging/clickbank-ins-v8-email/` adiciona fila e alerta por e-mail para `Order form impression`, sem incluir GCLID/extclid no e-mail e sem alterar o caminho das notificações de venda INS. Aguarda publicação manual e habilitação do evento na integração existente.
- O exportador atual usa `clickbank_postback_events` e o campo de comissão legado `affiliate_earnings`; não lê INS v8 e não possui produto/itens no modelo atual. Não confundir essa saída existente com o CSV futuro definido no contrato v8.
- O usuário executou e conferiu as três tabelas INS v8: 38 colunas, 17 registros de índices e FK esperada com regras `RESTRICT`. O PHP web da Hostinger foi confirmado em 8.3.35 com PDO MySQL e OpenSSL habilitados. O receptor foi instalado; o usuário confirmou uma transação `TEST` com `is_test = 1` no banco, e a URL própria aparece `Verified`. A leitura/CSV v8 está implementada localmente no Hub, no pacote `deploy/staging/clickbank-ins-v8-api/`, ainda não publicado.
- Nas capturas compartilhadas, o INS da integração externa apareceu como `Verified` e o Custom Postback por macros apareceu ativo/testado. Isso descreve o estado observado nas datas das capturas, não uma leitura atual da conta. O usuário relatou que ajustou a configuração da integração externa conforme a orientação da aula; a tela atual não foi revalidada diretamente.

## Identificadores de atribuição

Manter GCLID, `extclid`, `Aff Sub 1`, `commonTrackingParameters.clickId` e TID separados. O GCLID apareceu visualmente em `Aff Sub 1` num relatório de uma venda, mas o valor da captura estava truncado; `Extclid` mostrava um identificador `ftsession_...`, e TID estava vazio naquela exportação. Para o pipeline futuro, seguir a ordem de resolução do contrato: GCLID explícito, associação exata do `extclid` com o clique próprio, e `Aff Sub 1` somente após validar seu valor integral no payload. Sem vínculo confiável, registrar como não atribuível e excluir do CSV elegível.

## Não fazer nesta fase

- Não substituir/remover a URL de INS verificada da integração externa nem interromper o envio dela ao Google Ads.
- Não apontar INS v8 para `clickbank-postback.php`; são protocolos diferentes.
- Na publicação do alerta de checkout, preservar a URL e o token atuais do Custom Postback/Pixels e habilitar apenas **Order form impression** na integração existente. Não substituir a URL INS da integração externa.
- Não enviar vendas/CSV ao Google Ads nem criar conversões de teste. O usuário controlará manualmente quando suspender a integração externa e quando subir arquivo.
- Não usar GCLID fictício, TID ou `ftsession_...` como substitutos do GCLID real; não inferir produto para vendas antigas.

## Próximos passos de implementação

1. **Contrato de dados — concluído:** conferir [CONTRATO-DADOS-VENDAS-INS-V8.md](CONTRATO-DADOS-VENDAS-INS-V8.md). Campos de atribuição e reconciliação de valores serão confirmados com o primeiro payload futuro disponível.
2. **Schema — concluído:** o usuário conferiu no phpMyAdmin as 38 colunas, os 17 registros de índices e a FK `line_items.transaction_id` → `transactions.id`, com `RESTRICT` para update/delete.
3. **Receptor inicial — implementado localmente:** envelope AES-256-CBC, validação v8, allowlist sem PII, deduplicação, múltiplos itens, reconciliação da comissão e associação exata de `extclid`. Testes sintéticos de criptografia/descriptografia e normalização passaram. As DLLs `openssl` e `pdo_mysql` vieram com o runtime local e foram habilitadas apenas nos comandos de teste; não houve conexão real ao MySQL.
4. **Primeiro teste de servidor — concluído:** o Test IPN foi aceito, gravado como `TEST`/`is_test = 1` e a URL própria aparece `Verified`. Não repetir o teste apenas para liberar a tela: a API o manterá excluído do CSV.
5. **Hub e CSV — implementados localmente:** a tela lê somente as tabelas INS v8, detalha produtos múltiplos, mostra comissão/atribuição/reconciliação, mascara recibo e GCLID e exclui testes, tipos fora de SALE, duplicidades, GCLID não resolvido e comissão divergente. A geração/download continua manual e usa comissão total por recibo.
6. **Publicação da API — próximo passo:** usuário faz backup e envia os três arquivos de `deploy/staging/clickbank-ins-v8-api/` para os caminhos do README. Não executar SQL, não substituir os arquivos do receptor, não trocar tokens/config inteira e não mexer na URL da integração externa. Depois, no Hub, consultar INS v8 e confirmar que o Test IPN aparece, mas não fica elegível para CSV.
7. **Ativação futura — confirmar Save Changes:** se ainda não foi clicado, salvar as alterações na ClickBank para ativar notificações futuras pela URL já verificada. Preservar a URL da integração externa.
8. **Cutover manual posterior:** somente quando o usuário decidir interromper a integração externa, revisar o CSV e fazer upload manual. A lógica automática de corte/reenvio e o backfill ficam fora do escopo.
9. **Cadastro de domínios de pre-sell — implementado localmente, aguardando publicação:** pacote em `deploy/staging/tracking-domain-allowlist/`, com API autenticada, allowlist aditiva e integração na tela Tracking do Hub. Após backup, upload manual, migração SQL e provisionamento do token privado, novos hosts podem ser liberados no Hub sem novo deploy. Ver [PLANO-CADASTRO-DOMINIOS-PRESELL.md](PLANO-CADASTRO-DOMINIOS-PRESELL.md) e o README do pacote.
10. **Alertas de checkout — implementação local atualizada, aguardando implantação:** aplicar a migração de chave `event_id` + `event_type` e, se a fila ainda não existir, a migração da outbox; então enviar os quatro PHPs listados no README de `deploy/staging/clickbank-ins-v8-email/`, habilitar `Order form impression` no Custom Postback/Pixels e executar **Test Integration**. Preservar os eventos de compra e as URLs/tokens existentes.
11. **Integração direta do Hub com Google Ads — ideia futura, não implementada:** oferecer conexão OAuth (“Conectar Google Ads”) para o usuário autorizar a conta e o Hub enviar conversões elegíveis da INS v8. Segundo a documentação vigente, novos projetos não precisam de developer token; o acesso à API é configurado no projeto Google Cloud, que precisa ter a API habilitada e acesso para produção (por exemplo, Explorer). A experiência pode seguir o modelo de autorização da integração externa, sem transferir dados nem substituir a integração externa. Antes de qualquer envio real, definir prevenção de duplicidade/cutover, proteger os tokens OAuth no servidor e validar envio, idempotência e auditoria. Manter o CSV manual e a integração externa como estão até decisão explícita do usuário. Referências: [acesso à Google Ads API](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) e [níveis de acesso](https://developers.google.com/google-ads/api/docs/api-policy/access-levels).

## Referências operacionais

- [README.md](README.md) — funcionamento atual do endpoint de macros/exportador legado e separação do fluxo INS v8.
- [deploy/staging/clickbank-ins-v8-api/README.md](deploy/staging/clickbank-ins-v8-api/README.md) — publicação manual da API de leitura/CSV para o Hub.
- [deploy/LEIA-ME.md](deploy/LEIA-ME.md) e [deploy/REFERENCIA-HOSTINGER.md](deploy/REFERENCIA-HOSTINGER.md) — conteúdo do pacote e limites do servidor observados.
- [RELATORIO-CAMPO-GCLID-CLICKBANK.md](RELATORIO-CAMPO-GCLID-CLICKBANK.md) — evidência sobre GCLID, `Aff Sub 1`, `Extclid` e TID.
- [RELATORIO-INVESTIGACAO-DUPLICIDADE-CLICKBANK.md](RELATORIO-INVESTIGACAO-DUPLICIDADE-CLICKBANK.md) — histórico investigativo; decisões posteriores resumidas aqui e no contrato v8 prevalecem para os próximos passos.

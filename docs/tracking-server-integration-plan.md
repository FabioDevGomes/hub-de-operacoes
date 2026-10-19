# Tracking ClickBank — integração Hub e preparo do servidor

## Estado

A tela `/?view=tracking` preserva o leitor de CSV local e a consulta antiga aos postbacks por macros. Foi acrescentada uma trilha distinta para ClickBank **INS v8**: consulta às tabelas `clickbank_ins_v8_*`, apresentação das transações/itens e preparação de CSV em uma ação explícita de download.

O Test IPN foi aceito no receptor instalado e o usuário confirmou uma linha `TEST` com `is_test = 1` no MySQL. A URL própria aparece como `Verified` na ClickBank; ainda é preciso confirmar **Save Changes** caso a ativação não tenha sido salva. A API Hub/CSV v8 está no pacote local `tracking-mvp/deploy/staging/clickbank-ins-v8-api/` e ainda não foi publicada. A Flow Tracking permanece intacta como integração atual de envio ao Google Ads.

## Separação das duas fontes

- **Postback legado / macros:** `google-ads-report.php` e `google-ads-csv.php` consultam `clickbank_postback_events`, não conhecem produto/item e mantêm o comportamento anterior. Os botões antigos continuam disponíveis, identificados como postbacks legados.
- **INS v8:** `clickbank-ins-v8-report.php` e `clickbank-ins-v8-csv.php` consultam somente `clickbank_ins_v8_transactions` e `clickbank_ins_v8_line_items`. Nenhuma consulta usa `clickbank_postback_events` como fallback.
- Ambos usam o token `tracking_hub_api_token`, a lista exata `tracking_hub_allowed_origins` e o nome de ação `tracking_hub_conversion_name` no `tracking-config.php` privado. O token que a tela pode lembrar fica em `localStorage` da origem local, chave `hub:tracking:api-token:v1`; não é criptografado, não entra na IndexedDB ou no backup JSON, e é enviado somente no header `Authorization: Bearer ...`.

## Contrato INS v8 no Hub

O relatório JSON é uma projeção sem PII, limitada a até 5.000 transações no conjunto e 100 transações mais recentes na tabela de prévia. Ele mostra também eventos de teste e não exportáveis para diagnóstico. Recibo e GCLID vêm mascarados; linhas de produto incluem SKU, título, tipo, quantidade, comissão e preço/abatimento quando recebidos.

Uma linha de CSV corresponde a uma transação futura `SALE` por recibo, com `Conversion Value = commission_total` (`totalAccountAmount`), `Conversion Currency = USD` e o horário UTC normalizado. Valores com até quatro casas decimais são preservados. Produtos de uma venda permanecem detalhados na tabela; o CSV usa uma linha pela comissão total, não uma linha por item.

Elegibilidade: origem INS v8, `role=AFFILIATE`, `transaction_type=SALE`, não teste, recibo e horário UTC válidos, comissão numérica, USD, GCLID não fictício com fonte validada (`explicit` ou associação exata `extclid_join`), reconciliação `matched` ou `unavailable`, e recibo único entre vendas elegíveis. Testes, reembolsos/chargebacks/rebill, conflitos ou atribuição não resolvida, comissões divergentes/pendentes, moedas inesperadas e recibos repetidos ficam fora do CSV com motivo visível. Não há backfill nem regra automática para corrigir comissão.

O CSV é produzido em memória no servidor e baixado apenas quando o usuário clica em **Baixar CSV para Google Ads**. Não é escrito no servidor, enviado à API Google Ads, marcado como enviado ou carregado automaticamente. O CSV só deve ser enviado manualmente depois que o usuário decidir interromper a Flow e revisar o arquivo.

## Endpoints e segurança

Os wrappers públicos são instalados em `public_html/track/`; o serviço fica em `private-tools/`, fora de `public_html/`. Os endpoints aceitam apenas GET/OPTIONS, rejeitam query string, exigem HTTPS em uso e token Bearer de 64 hexadecimais, autorizam somente a origem local exata configurada e retornam `Cache-Control: no-store`. O endpoint JSON não devolve GCLID ou recibo completos; somente o download CSV autenticado os contém. O serviço executa somente `SELECT`, não grava arquivos ou registros e não acessa tabelas de tentativas/payload.

Arquivos/caminhos e o procedimento de backup estão em `tracking-mvp/deploy/staging/clickbank-ins-v8-api/README.md`. O pacote é separado de `deploy/current/` e do staging do receptor. Ele não inclui SQL, `tracking-config.php`, tokens, chaves INS ou credenciais. Não é necessária nova migração: as três tabelas v8 já foram criadas e conferidas pelo usuário.

## Validação

- PHP unit tests sintéticos cobrem autorização/CORS, exclusão de TEST, várias linhas de produto, comissão total, precisão de quatro casas, recibo duplicado, divergência, privacidade do relatório, CSV e caminhos público/privado.
- Testes do Hub cobrem os endpoints fixos HTTPS, bearer header, validação estrita do JSON, mascaramento, múltiplos produtos e ausência de download automático.
- Depois de publicar, consultar **vendas INS v8** no Hub e confirmar a linha TEST como diagnóstico não elegível. Sem venda real futura elegível, o download deverá continuar desabilitado. Não inserir dados fictícios nas tabelas reais.
- Se a URL própria ainda não tiver sido ativada, clicar **Save Changes** na ClickBank. Não alterar a URL da Flow.

## Fontes do Hub

`src/tracking/tracking-domain.mjs` valida CSV e relatório v8; `tracking-service.mjs` consome endpoints fixos; `tracking-view.mjs` apresenta os dois modos; `tracking.css` estiliza a tabela de transações/itens; o adaptador permanece em `src/index.template.html`. Persistência local do token fica em `tracking-token-storage.mjs`; nenhum módulo grava a base operacional.

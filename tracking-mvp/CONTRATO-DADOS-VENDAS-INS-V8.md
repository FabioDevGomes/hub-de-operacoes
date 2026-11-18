# Contrato de dados — vendas ClickBank INS v8 → Hub/CSV

**Versão:** 1.0 — 18/10/2026
**Status em 18/10/2026:** schema e receptor INS v8 estão instalados no servidor. O usuário confirmou uma transação `TEST` com `is_test = 1` no banco e a URL própria aparece como `Verified` na ClickBank; ainda precisa confirmar se clicou em **Save Changes** para ativar notificações futuras. A integração de leitura/CSV v8 foi implementada localmente no Hub e está em pacote de deploy separado, ainda não publicado. Nenhuma venda real foi observada, nenhum CSV foi enviado e a integração externa de tracking permanece intacta.
**Referência técnica:** [ClickBank — Instant Notification Service (INS)](https://support.clickbank.com/en/articles/10535147-instant-notification-service-ins)

## 1. Objetivo e escopo

Este documento define os dados que a implementação própria deve capturar para vendas futuras da ClickBank, apresentar no Hub e preparar em CSV para revisão/download manual.

- O servidor próprio receberá notificações por um endpoint **INS v8 separado** do endpoint atual de Custom Postback/Pixels.
- A configuração INS v8 da integração externa permanece intacta. O endpoint próprio será cadastrado como uma URL adicional após estar pronto e testado.
- A integração externa continua sendo a única integração que envia conversões ao Google Ads durante a validação.
- O servidor/Hub **não enviará** conversões ao Google Ads. O Hub somente consulta, mostra, prepara e permite baixar o CSV.
- O escopo começa com eventos recebidos depois da ativação da URL própria. Não haverá backfill de vendas anteriores.
- A captura precisa aceitar qualquer produto ClickBank e transações com múltiplos itens; não pode depender de um nome/SKU específico.
- Dados pessoais do comprador, payload descriptografado bruto, chaves e tokens não serão persistidos nem exibidos no Hub.

## 2. Modelo canônico

Separar o evento/transação da lista de produtos comprados. O payload pode conter vários `lineItems`; cada item deve ser mantido individualmente para permitir relatórios por produto, mesmo quando o CSV representar a transação como uma única conversão.

### Transação/evento

| Campo canônico | Fonte INS v8 | Regra |
|---|---|---|
| `source` | Constante interna | `clickbank_ins_v8` |
| `role` | `role` | Aceitar e registrar `AFFILIATE`; não processar como receita de afiliado eventos de outro papel. |
| `transaction_type` | `transactionType` | Preservar o tipo recebido (`SALE`, reembolso, chargeback, rebill etc.). Não converter eventos não-SALE em vendas. |
| `receipt_id` | `receipt` | Identificador da transação ClickBank; obrigatório para deduplicação e elegibilidade do CSV. |
| `transaction_time_source` | `transactionTime` | Preservar texto ISO 8601 recebido, incluindo offset/fração de segundo quando presente. |
| `transaction_time_utc` | Derivado de `transactionTime` | Converter para UTC sem perder o valor/offset original quando há fuso explícito. Sem fuso, preservar `transaction_time_source`, manter UTC nulo e bloquear exportação em CSV; não presumir o fuso do servidor. |
| `commission_total` | `totalAccountAmount` | **Valor principal da operação**: comissão/valor recebido pela conta afiliada, em USD segundo o protocolo INS. Não confundir com o total pago pelo comprador. |
| `sale_gross_total` | `totalOrderAmount` | Guardar separadamente como referência do total cobrado do comprador; nunca usar como valor da conversão na versão 1 do CSV. |
| `commission_currency` | Unidade de valores INS | Normalizar como `USD`, conforme a documentação INS, que informa que valores monetários são apresentados em USD. Se o payload contradisser isso, marcar para revisão e não exportar automaticamente. |
| `upsell_original_receipt` | `upsellOriginalReceipt`, quando presente | Preservar para relacionar uma transação de upsell à transação que iniciou o fluxo; não mesclar automaticamente transações diferentes. |
| `event_key` | Derivação interna | Gerar chave estável e idempotente a partir dos campos de negócio da notificação (papel, recibo, tipo, horário e itens canônicos). Metadados de entrega/tentativa não alteram a identidade do evento. |

O INS v8 descreve `totalAccountAmount` como o total recebido pela conta e `accountAmount` como o valor recebido por item. O campo `affiliatePayout` é documentado como disponível somente ao vendedor; não será uma dependência para a conta afiliada.

### Itens da transação

Persistir uma coleção ordenada `line_items[]` com, no mínimo:

| Campo canônico | Fonte INS v8 | Regra |
|---|---|---|
| `line_index` | Posição no array | Preservar a ordem original para auditoria; não usar a posição isoladamente como identidade de produto. |
| `product_item_no` | `itemNo` | SKU/código do item ClickBank, se fornecido. |
| `product_title` | `productTitle` | Nome do produto, se fornecido. Não inferir nome quando ausente. |
| `line_item_type` | `lineItemType` | Preservar valores como `ORIGINAL`, `CART`, `BUMP` ou `UPSELL`. |
| `quantity` | `quantity` | Preservar quantidade numérica recebida. |
| `commission_amount` | `accountAmount` | Comissão recebida pela conta afiliada para aquele item, em USD. |
| `product_price` | `productPrice`, quando presente | Guardar separadamente como preço-base do produto; não tratar como comissão. |
| `product_discount` | `productDiscount`, quando presente | Guardar separadamente; não descontar novamente da comissão. |

Se `totalAccountAmount` e a soma dos `accountAmount` estiverem disponíveis, guardar ambos e comparar. Se não baterem, manter os dados para auditoria, sinalizar divergência no Hub e não produzir silenciosamente um valor de conversão.

### Persistência SQL preparada

A migração local [clickbank-ins-v8.sql](clickbank-ins-v8.sql) cria três tabelas novas, sem alterar as tabelas antigas:

- `clickbank_ins_v8_transactions`: uma linha por evento/transação canônica, com chave idempotente (`event_key`), valores e parâmetros de atribuição distintos.
- `clickbank_ins_v8_line_items`: uma linha por item recebido, ligada à transação por `transaction_id` e `line_index`; preserva produto e comissão individual.
- `clickbank_ins_v8_attempts`: auditoria de tentativas, retries e falhas, sem token, URL/cabeçalhos, payload bruto, GCLID ou dados do comprador.

O SQL usa somente `CREATE TABLE IF NOT EXISTS`; não executa `ALTER`, `DROP` ou `DELETE`. Em 18/10/2026, o usuário executou as três instruções no phpMyAdmin e compartilhou a confirmação visual de sucesso. Essa confirmação não substitui a conferência das colunas/índices em `Estrutura` ou `SHOW CREATE TABLE`. A migração não está no pacote de deploy. Tipos e tamanhos finais continuam sujeitos à validação com a primeira notificação v8 real.

### Estado do receptor local

- `public/clickbank-ins-v8.php` é a entrada pública separada; `tools/clickbank-ins-v8-service.php` e `tools/clickbank-ins-v8-lib.php` contêm o processamento privado e a normalização.
- A chave configurada será `clickbank_ins_v8_secret_key`, somente no `tracking-config.php` privado do servidor. Não inserir a chave em arquivos versionados, pacote de deploy, Hub ou logs.
- O código aceita o envelope JSON INS v8, descriptografa AES-256-CBC conforme o exemplo oficial, normaliza allowlist sem persistir o JSON bruto/cliente, associa `extclid` apenas por correspondência exata com clique próprio e mantém `affSub1` separado até validação. Reenvios idempotentes não criam outra venda; se uma tentativa posterior resolver atribuição que antes estava ausente, o registro existente pode ser enriquecido, e fontes conflitantes o deixam em quarentena.
- O processador faz deduplicação idempotente, persiste itens múltiplos e reconcilia `totalAccountAmount` com `accountAmount`. Não cria CSV nem envia conversões.
- Testes locais cobrem criptografia/descriptografia, normalização, atribuição, rejeição segura por campo e regras com payload sintético. O PHP local não carrega extensões por configuração padrão; as DLLs `openssl` e `pdo_mysql` vieram no runtime empacotado e foram ativadas apenas nos comandos de teste. O usuário confirmou no banco uma linha `TEST` com `is_test = 1`; ela valida transporte, descriptografia, normalização e gravação, mas não é venda elegível.
- Próximo passo: publicar a API de leitura/CSV a partir de `deploy/staging/clickbank-ins-v8-api/`, sem substituir o receptor nem alterar a integração externa; depois consultar o Hub e confirmar que o Test IPN aparece para diagnóstico, mas permanece fora do CSV.

## 3. Atribuição do clique

Manter os identificadores em campos distintos; nenhum deles deve ser renomeado ou presumido como outro:

- `gclid`: identificador Google Ads efetivamente resolvido para a venda.
- `extclid`: identificador externo da URL ClickBank. Quando corresponder exatamente a `tracking_events.click_id`, usar a associação para recuperar o GCLID/UTMs do clique próprio.
- `aff_sub1` / `affSub1`: guardar como parâmetro afiliado separado. Há evidência de uma transação em que esse campo continha visualmente o GCLID, mas isso ainda precisa ser confirmado no payload integral de uma venda futura.
- `clickbank_click_id`: `commonTrackingParameters.clickId`; identificador ClickBank de hop/formulário, não é GCLID nem o UUID `click_id` criado pelo rastreador próprio.
- `tracking_id`/TID e valores como `ftsession_...`: preservar apenas se necessários à auditoria; nunca usar como GCLID sem associação explícita validada.

Para resolução do GCLID:

1. Usar o GCLID explícito recebido, se houver.
2. Caso contrário, tentar a associação exata de `extclid` com o clique próprio e obter `tracking_events.gclid`.
3. Se não houver associação, aceitar `affSub1` como GCLID somente após confirmar o valor completo no payload e sua correspondência com o formato/registro observado. Registrar `gclid_source` (`explicit`, `extclid_join` ou `aff_sub1`).
4. Em caso de conflito entre fontes, parâmetro desconhecido ou ausência de GCLID, registrar o evento e mostrá-lo como não atribuível; não fabricar identificador nem incluí-lo no CSV elegível.

`gclid_source` deve indicar `explicit`, `extclid_join`, `aff_sub1`, `unresolved` ou `conflict`; os dois últimos estados não são elegíveis ao CSV.

A observação de GCLID em `Aff Sub 1` não muda automaticamente os parâmetros dos HopLinks. Qualquer padronização de links fica fora deste passo e depende de validação controlada.

## 4. Regra inicial do CSV

- Uma linha de CSV representa **uma transação `SALE` por recibo**; seus itens permanecem detalhados internamente no Hub.
- `Conversion Value` é `commission_total` (`totalAccountAmount`), não `sale_gross_total` nem `product_price`.
- Se houver uma notificação SALE própria para outra transação (por exemplo, um upsell com recibo próprio), ela permanece um evento separado; `upsellOriginalReceipt` serve para relacionamento, não para mesclagem automática.
- `Conversion Currency` será `USD` conforme a unidade monetária informada pela documentação INS.
- `Order ID` será o `receipt_id` da transação. Sem recibo, horário confiável, comissão válida ou GCLID resolvido, a linha não é elegível.
- Incluir apenas eventos futuros `SALE` elegíveis. Reembolso, chargeback, cancelamento, rebill, teste e checkout não são novas vendas no CSV v1. Eles podem ser registrados separadamente para auditoria/relatórios, sem regra de ajuste do Google Ads nesta etapa.
- O nome exato da ação de conversão do Google Ads permanece configuração do exportador e deverá corresponder à ação escolhida pelo usuário antes de qualquer upload manual.
- O CSV padrão não será usado como relatório de produtos: o Hub manterá SKU, título, tipo e comissão por item. A v1 não cria automaticamente uma ação Google Ads diferente por produto.

### Elegibilidade e segurança operacional

Uma linha só pode aparecer na prévia/arquivo quando:

- papel e origem forem `AFFILIATE` e `clickbank_ins_v8`;
- tipo for `SALE`;
- recibo, horário com fuso, comissão e GCLID estiverem válidos;
- a comissão reconciliar com os itens quando esses valores estiverem disponíveis;
- o evento não for um teste do INS nem um reenvio duplicado.

O Hub pode mascarar GCLID/recibo na prévia e mostrar os valores completos apenas no download explícito do CSV. Não haverá chamada à API do Google Ads, upload automático nem estado automático de “enviado”.

## 5. Decisões registradas e pontos para validar na implementação

### Decidido

- Escopo futuro; sem backfill histórico.
- Vários produtos e múltiplos `lineItems` por transação.
- Comissão afiliada como valor de negócio principal e `Conversion Value` do CSV.
- Valor bruto da venda fica armazenado separadamente para conferência.
- Uma conversão no CSV por transação/recibo, preservando o detalhamento por produto no Hub.
- Captura própria em paralelo; URL e envio atual da integração externa não serão alterados nesta implementação.
- Geração e download do CSV pelo Hub; upload no Google Ads continua manual pelo usuário.
- API própria de leitura INS v8; os postbacks legados permanecem em modo separado e não são tratados como vendas INS.
- Migração SQL aditiva em `clickbank-ins-v8.sql`; o usuário executou e conferiu as colunas, índices e FK. O receptor está em `deploy/staging/clickbank-ins-v8/`; a API Hub/CSV, ainda não publicada, está em `deploy/staging/clickbank-ins-v8-api/`.

### Próximas validações antes de habilitar

- Fazer backup e enviar os três arquivos da API do pacote `deploy/staging/clickbank-ins-v8-api/` aos destinos público/privado descritos no README do pacote. Não enviar `tracking-config.php`, não executar SQL e não substituir os arquivos do receptor ou a URL da integração externa.
- Na tela **Tracking ClickBank**, consultar **vendas INS v8**. Confirmar que o Test IPN aparece marcado como teste e continua fora do CSV; não deve haver download disponível sem venda elegível.
- Se ainda não foi feito, clicar em **Save Changes** na ClickBank para ativar a URL própria já verificada e receber as próximas notificações, sem remover a integração externa.

### Validar com o primeiro payload futuro

- O nome/capitalização exatos dos campos de parâmetros afiliados recebidos em `affiliateTrackingParameters`.
- Se `affSub1` contém o GCLID completo e se `extclid` recebido corresponde ao `click_id` próprio.
- Se `totalAccountAmount` reconcilia com a soma de `accountAmount` para pedidos com vários itens.
- A ação de conversão e seu nome exato no `tracking-config.php`, conferindo que corresponde à ação de um futuro upload manual.
- O comportamento de um pedido com múltiplos itens/bumps e de uma transação de upsell com recibo próprio.

Até essas validações, dados sem associação ou com divergência ficam capturados para auditoria, mas fora da exportação elegível; nenhum fallback inventa comissão, produto ou GCLID.

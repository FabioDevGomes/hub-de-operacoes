# Rastreamento MVP — captura de cliques e postback ClickBank

Protótipo independente para capturar visitas e cliques de saída da presell, receber eventos ClickBank por Custom Postback/Pixels e preparar CSV manual para o Google Ads. O receptor legado usa macros e não implementa INS v8; o receptor INS v8 e sua API de leitura/CSV são caminhos separados.

## O que este MVP faz

- Lê GCLID, GBRAID, WBRAID e UTMs da URL de entrada.
- Preserva esses parâmetros durante a navegação na mesma aba, usando sessionStorage.
- Envia eventos page_view e outbound_click para um endpoint PHP.
- Grava os eventos em MySQL/MariaDB, com horário de recebimento em UTC.
- Em HopLinks HTTPS da ClickBank detectados pelo hostname (ou links marcados explicitamente), preserva o `extclid` existente ou acrescenta o identificador próprio do clique.
- Em links HTTPS da GuruMedia no domínio `fasttrack20.com`, envia o identificador do clique do Hub pelo `sub6`; links com domínio personalizado podem ser marcados com `data-track-gurumedia`.
- Recebe eventos selecionados da ClickBank pelo Custom Postback/Pixels (macros), deduplica reenvios por `event_id` e grava `extclid` e dados essenciais sem armazenar dados do comprador.
- Recebe postbacks de venda da GuruMedia em uma trilha separada, deduplica por transação e só registra vendas associadas a uma saída de uma Track cadastrada no Hub.
- Armazena a URL da página sem query string, o domínio de referência e o destino sem parâmetros. Não coleta IP, e-mail, telefone ou user-agent.
- Limita chamadas do navegador por lista de origens autorizadas. Isso reduz chamadas acidentais, mas não é uma proteção completa contra bots.

O `click_id` é criado para cada clique de saída. No fluxo atual de macros, links ClickBank marcados enviam esse valor como `extclid`; quando a macro correspondente é configurada, o Custom Postback pode devolvê-lo para relacionar o evento ao clique e recuperar GCLID/UTMs. Isso não confirma a atribuição no futuro receptor INS v8, cuja associação será validada separadamente.

## Direção vigente — captura de vendas

- A captura de cliques do Hub não depende da integração externa de tracking: se um HopLink não tiver `extclid`, o script gera um UUID e o acrescenta. A integração externa ainda pode ser mantida em paralelo; se ela for desativada, deixam de funcionar os envios de conversão ao Google Ads que dependam dela. Para o Hub continuar recebendo vendas, mantenha seu receptor INS v8 configurado e verificado na ClickBank. A ClickBank documenta um segundo campo de URL INS (`Instant Notification 2`), que pode ser usado para manter dois receptores ativos. Não desligue a integração externa antes de confirmar a entrega ao endpoint do Hub.
- O endpoint de Custom Postback/Pixels descrito abaixo é um receptor de macros legado. **Não aponte INS v8 para ele**: o formato v8 é criptografado e requer um receptor/descriptografia próprios.
- O contrato da captura v8 está em [CONTRATO-DADOS-VENDAS-INS-V8.md](CONTRATO-DADOS-VENDAS-INS-V8.md). O modelo prevê vários produtos por transação e comissão como valor de negócio; no CSV v1, uma linha por recibo usa a comissão total (`totalAccountAmount`).
- O receptor v8 e o armazenamento multi-produto estão instalados na Hostinger. O usuário confirmou um Test IPN armazenado como `TEST`/`is_test = 1`, e a URL própria aparece como `Verified`; confirme **Save Changes** na ClickBank para ativar as próximas notificações. A API de relatório/CSV e a rota paginada de vendas por Track estão implementadas localmente no pacote separado `deploy/staging/clickbank-ins-v8-api/`, ainda não publicado. A rota de vendas é somente leitura, exclui TEST e retorna apenas ID interno, horário, estado de associação e par host/produto quando único; ela não envia conversões ao Google Ads nem substitui a URL da integração externa.
- A captura de abertura do formulário (**Order form impression**) está implementada localmente no pacote `deploy/staging/clickbank-ins-v8-email/`, mas depende de migração, upload manual e habilitação do evento na integração Postback/Pixels. Nada foi enviado à Hostinger nem alterado na conta ClickBank nesta implementação. O evento indica visita inicial ao formulário, não compra ou pagamento.
- A integração Google Ads do Hub tem superfícies distintas: o endpoint de relatório/inventário (`public/google-ads-readonly.php` + `tools/google-ads-readonly-service.php`) é somente leitura; o endpoint `public/google-ads-campaign-action.php` usa o serviço privado `tools/google-ads-campaign-action-service.php` para operações de campanha/recursos protegidas por flags explícitas e allowlist de MCC. O usuário informou que os deploys relacionados foram concluídos, mas o código vivo e as flags da Hostinger não foram verificados nesta revisão. A chave JSON permanece exclusivamente em `private-tools/google-ads-credentials/`, fora deste repositório e de `public_html`.
- Essas operações de campanha não enviam vendas. O Hub também oferece inventário/mapeamento local de ações por MCC e prepara CSV manual para ClickBank. Separadamente, a atualização local de 07/11 implementa o envio controlado de vendas GuruMedia elegíveis pela Data Manager API; publicação, migração e primeira validação ainda precisam ser feitas conforme o README incremental. O postback GuruMedia registra a venda associada à Track, comissão, moeda e horário.

## Arquivos

- `public/collect.php` — recebe e valida eventos do navegador.
- `public/clickbank-postback.php` — endpoint servidor a servidor da ClickBank.
- `public/track.js` — script a incluir na presell.
- `public/test.html` — página de teste para abrir no subdomínio.
- `schema.sql` — tabela de eventos do navegador.
- `clickbank-postback.sql` — migração aditiva para a tabela de eventos ClickBank.
- `clickbank-postback-event-type-key.sql` — migração para deduplicar eventos por `event_id` e `event_type`, permitindo eventos de tipos diferentes com o mesmo ID sintético.
- `clickbank-postback-attempts.sql` — trilha de auditoria aditiva para tentativas autenticadas do postback.
- `clickbank-ins-v8.sql` — migração aditiva para eventos INS v8, itens multi-produto e auditoria; executada pelo usuário e conferida: 38 colunas, 17 registros de índices e FK esperada.
- `public/clickbank-ins-v8.php`, `tools/clickbank-ins-v8-service.php` e `tools/clickbank-ins-v8-lib.php` — fontes do receptor INS v8; cópias de staging isoladas em `deploy/staging/clickbank-ins-v8/`. A atualização atual afeta apenas os dois arquivos privados.
- `public/clickbank-ins-v8-report.php`, `public/clickbank-ins-v8-csv.php`, `public/clickbank-ins-v8-sales.php` e serviços privados de API — relatório/CSV e sincronização paginada de vendas para a tela local; pacote de publicação separado em `deploy/staging/clickbank-ins-v8-api/`.
- `tools/clickbank-ins-v8-email-service.php` e `tools/clickbank-ins-v8-email-worker.php` — fila persistente e envio SMTP posterior via CLI; o aviso de checkout associa o `extclid` a uma única Track e exibe seu nome quando salvo no servidor. Overlay em `deploy/staging/clickbank-ins-v8-email/`; a coluna/rótulo e API de Tracks são preparados pelo pacote `deploy/staging/presell-product-identity/`. O Hub gera a configuração privada, que não faz parte do repositório.
- `public/clickbank-postback-email-lib.php` e a extensão do worker — identificam `Order form impression` no Postback/Pixels e enfileiram um alerta separado de compra; migração e arquivos para publicação manual estão no pacote de e-mail.
- `CONTRATO-DADOS-VENDAS-INS-V8.md` — contrato funcional, estado atual e validações pendentes do receptor/CSV com comissão.
- `RETOMADA-INTEGRACAO-CLICKBANK.md` — estado vigente e próximos passos da captura paralela.
- `tracking-config.example.php` — referência de configuração privada; não enviar à pasta pública.
- `tools/export-google-ads.php` — exportador CLI, somente leitura, para preparar um CSV privado de conversões elegíveis.
- `tools/google-ads-export-lib.php` — validação e formatação dos registros do exportador.
- `tools/google-ads-export-service.php` — consulta compartilhada, somente leitura, usada pelo CLI e pela API.
- `tools/google-ads-api-lib.php` — autenticação, relatório agregado e formatação do CSV para os endpoints do Hub.
- `public/google-ads-report.php` e `public/google-ads-csv.php` — endpoints HTTPS autenticados para leitura do Hub local.
- `tracking-clickbank-extclid.sql` — migração aditiva para guardar o `extclid` de terceiros sem sobrescrevê-lo; pacote de deploy separado em `deploy/staging/presell-single-script/`.
- `tracking-product-identity.sql` — migração incremental que associa eventos ao código de produto e ao hostname da pre-sell e adiciona o rótulo legível `tracking_allowed_domains.product_label`; a classificação `platform` usada para separar ClickBank/GuruMedia fica no pacote incremental `deploy/staging/gurumedia-sales/`.
- `gurumedia-sales.sql`, `public/gurumedia-sales-*.php` e `tools/gurumedia-sales-service.php` — receptor e relatório agregado, preparados no pacote manual `deploy/staging/gurumedia-sales/`; não alteram os endpoints da integração externa ou ClickBank.

### Pacote único do servidor para GuruMedia

Todo o código e SQL versionado para a etapa de vendas e e-mail da GuruMedia está reunido em `deploy/staging/gurumedia-sales/`. Use esse pacote como fonte dos arquivos de deploy; as subpastas `database/`, `hostinger-public-track/` e `hostinger-private-tools/` indicam o destino de cada item. Na atualização corrente, a raiz de `hostinger-private-tools/` contém somente os arquivos privados a copiar; referências ficam no subdiretório permanente `_nao_subir/` e não devem ser publicadas. A configuração privada com token/SMTP fica fora do pacote. Não monte a publicação copiando arquivos avulsos das pastas de fonte `public/` ou `tools/`, nem envie uma pasta que contenha `_nao_subir` inteira para o servidor.

A atualização de classificação por plataforma também fica nesse pacote único: a coluna `tracking_allowed_domains.platform` separa ClickBank e GuruMedia, e o relatório de visitas/cliques consulta somente a plataforma pedida. A migração classifica as linhas existentes inicialmente como ClickBank; edite os domínios GuruMedia em **Configurações globais** depois de publicar a API atualizada. As tags existentes continuam iguais. A migração incremental e a lista exata de arquivos privados estão em `deploy/staging/gurumedia-sales/README.md`.

A resolução informativa de campanha por Google Ads ClickView está em pacote incremental separado: `deploy/staging/gurumedia-clickview-campaign-resolution/README.md`. Ela atualiza somente `gurumedia-sales-service.php`, sem SQL e sem modificar o serviço compartilhado de Google Ads. A consulta é acionada pelo botão manual **Atualizar vendas e cliques** no Hub, com limite de 20 consultas por atualização; não envia conversões ao Google Ads. A exibição diagnóstica do horário UTC do clique e do sufixo mascarado do GCLID está no pacote incremental `deploy/staging/gurumedia-clickview-click-diagnostics/README.md`; também atualiza somente `gurumedia-sales-service.php`, sem SQL, e nunca devolve o identificador completo ao Hub.

O código local também prepara o envio individual e automático de vendas GuruMedia elegíveis pela Data Manager API. Ele exige rota MCC/ação sincronizada, clique único com exatamente um GCLID/GBRAID/WBRAID, horário real da venda e comissão/moeda válidas. A tela valida com `validateOnly`, permite envio manual confirmado e mostra o estado assíncrono; a automação inicia desligada e não faz backfill. O serviço privado usa a allowlist própria `tracking_google_ads_conversion_upload_manager_customer_ids`, separada da permissão de escrita de campanhas. O serviço, o worker já usado pelo Cron, a migration e a instrução de configuração privada estão no README do pacote `deploy/staging/gurumedia-sales/`. Não presuma que os arquivos foram publicados nem que a migration foi executada.

A tela e os módulos do Hub continuam no projeto `painel-operacao`; não entram nesse pacote nem são enviados para a Hostinger. A atualização atual remove o cadastro manual de `offer_id`: o serviço aprende esse valor ao receber uma venda atribuída a um clique único e o Hub apenas o exibe. Não há SQL novo; a migração já foi executada pelo usuário. Para o deploy, a pasta privada raiz contém somente os dois PHPs desta atualização, e os arquivos de referência ficam em `_nao_subir/`. O procedimento único está em [`deploy/staging/gurumedia-sales/README.md`](deploy/staging/gurumedia-sales/README.md).

## Instalação manual na Hostinger

Não envie credenciais pelo chat. Não coloque a configuração privada dentro de public_html.

### Fonte local da verdade e publicação

- Para os arquivos de código e pacotes de deploy, a referência de trabalho é sempre esta cópia local. Consideramos que a versão publicada na Hostinger corresponde ao arquivo local que o usuário enviou por último; não fazemos alterações diretas no servidor nem presumimos uma inspeção ao vivo.
- Mudanças no código só chegam à Hostinger depois do upload manual dos arquivos locais indicados. Depois da instalação inicial da API administrativa, a tela poderá alterar somente os registros da allowlist por uma requisição autenticada; isso não é deploy de código nem permite editar outras configurações.
- Exceção importante: o `tracking-config.php` real contém credenciais e não existe nesta pasta local; há apenas um exemplo. Portanto, não é possível afirmar que esse arquivo privado acompanha o código local. Ele não deve ser copiado para o pacote, compartilhado ou substituído como parte de um deploy comum.
- Hoje a allowlist inicial da coleta (`allowed_origins` e `allowed_page_hosts`) ainda está dentro desse arquivo privado. A futura API guardará novos domínios numa tabela própria do banco, sem reescrever `tracking-config.php`. A tela/API ainda não foram implementadas; o plano prevê um deploy inicial e nenhum deploy por domínio depois disso: [PLANO-CADASTRO-DOMINIOS-PRESELL.md](PLANO-CADASTRO-DOMINIOS-PRESELL.md).

1. No phpMyAdmin, selecione o banco dedicado ao rastreamento e execute schema.sql. Isso cria a tabela tracking_events; não apaga tabelas existentes.
2. Envie os arquivos públicos locais já aprovados para a pasta que o subdomínio track.travenzo.shop aponta. Não copie `public/clickbank-ins-v8.php` diretamente com o restante: o receptor INS deve ser instalado pelo pacote isolado em `deploy/staging/clickbank-ins-v8/`. A API Hub/CSV v8 usa o pacote separado `deploy/staging/clickbank-ins-v8-api/`; publique-o somente após backup e mantenha os arquivos privados em `private-tools/`. Não envie SQL, `tracking-config.example.php` nem configurações privadas à pasta pública.
3. Preserve o `tracking-config.php` existente fora de `public_html`, em `domains/travenzo.shop/tracking-config.php`. A configuração privada não faz parte dos pacotes locais; não a substitua durante o deploy de código.
4. O coletor exige a origem HTTPS exata em `allowed_origins` ou na tabela dinâmica e o hostname correspondente em `allowed_page_hosts` ou na mesma tabela. A API administrativa foi implementada localmente; depois do deploy inicial, novos domínios serão adicionados pelo Hub sem upload de código por domínio.
5. Abra:

    https://track.travenzo.shop/test.html?gclid=TEST-GCLID-123&utm_source=teste&utm_campaign=coleta

    A página deve indicar que a visita foi recebida. Clique em “Registrar clique de saída de teste”; ela informará se o navegador conseguiu enfileirar o evento. A confirmação definitiva é consultar o banco.
6. No phpMyAdmin, consulte os últimos registros:

    SELECT event_type, click_id, visitor_id, gclid, gbraid, wbraid, utm_source, utm_campaign, received_at_utc
    FROM tracking_events
    ORDER BY id DESC
    LIMIT 20;

Uma página vazia ou 404 antes de enviar os arquivos não significa falha no SSL. O GCLID fictício acima testa somente a passagem de dados até o banco; não é um clique nem uma atribuição real do Google Ads.

## Receptor existente — Custom Postback/Pixels por macros

> **Não confundir com o INS v8.** Este endpoint (`clickbank-postback.php`) aceita macros de **Integrations → Postback/Pixels → Custom Postback/Pixel**, com token próprio. É uma integração diferente de **Vendor Settings → My Site → Advanced Tools → Instant Notification URL**. As capturas históricas mostraram o INS da integração externa como `Verified` e o Custom Postback por macros como ativo/testado, mas não confirmam a configuração atual da conta. O receptor não descriptografa nem processa payload INS v8. O endpoint v8 separado está implementado localmente e preparado em staging; a integração externa continua enviando ao Google Ads durante a validação.

O endpoint de macros já existente é separado do INS v8. A extensão local para e-mail de abertura do formulário está em [deploy/staging/clickbank-ins-v8-email/README.md](deploy/staging/clickbank-ins-v8-email/README.md); ainda não foi publicada. Depois da instalação dos arquivos e da migração, será necessário habilitar **Order form impression** na integração Postback/Pixels existente, preservando URL, token, eventos de compra e URL verificada da integração externa.

    https://track.travenzo.shop/clickbank-postback.php

Esse endereço só aceita os parâmetros personalizados/macros descritos no histórico da integração. Se uma investigação futura exigir testar esse Custom Postback, primeiro confira [deploy/LEIA-ME.md](deploy/LEIA-ME.md) para saber qual cópia do endpoint está no pacote local e se ela foi enviada ao servidor. Um teste HTTP 200 confirma recebimento, não é uma venda real nem comprova atribuição ou elegibilidade no CSV.

Para inspecionar as tentativas recentes (incluindo reenvios duplicados), sem exibir o token ou payload bruto:

    SELECT attempt_id, received_at_utc, diagnostic_id, event_id, event_type,
           insert_result, http_status, has_extclid, matched_click
    FROM clickbank_postback_attempts
    ORDER BY attempt_id DESC
    LIMIT 20;

`insert_result = 'inserted'` significa que uma linha nova foi criada em `clickbank_postback_events`; `duplicate` significa que o mesmo par `event_id` + `event_type` já estava registrado; `not_inserted` indica que o `INSERT IGNORE` não criou nem encontrou esse par; `db_error` registra uma falha operacional quando a conexão ainda permite gravar a auditoria. A tabela de auditoria não altera a elegibilidade no CSV.

Para conferir a linha canônica armazenada:

    SELECT event_type, event_id, receipt_id, order_id, extclid,
           affiliate_earnings, total_transaction_amount, order_currency,
           event_time, received_at_utc
    FROM clickbank_postback_events
    ORDER BY id DESC
    LIMIT 20;

Uma linha com `extclid` igual ao `click_id` de um `outbound_click` pode ser associada à captura correspondente em `tracking_events`. O endpoint responde HTTP 200 para reenvios idempotentes e não armazena payload bruto nem dados pessoais do comprador. A auditoria separada registra o resultado da tentativa, inclusive quando o `event_id` já existe, sem alterar a elegibilidade no CSV.

Para conferir a associação entre venda, clique e GCLID:

    SELECT cb.event_type, cb.receipt_id, cb.affiliate_earnings, cb.extclid,
           te.gclid, te.gbraid, te.wbraid, te.utm_source, te.utm_campaign
    FROM clickbank_postback_events AS cb
    LEFT JOIN tracking_events AS te
      ON te.event_type = 'outbound_click' AND te.click_id = cb.extclid
    ORDER BY cb.id DESC
    LIMIT 20;

## Exportar compras para o Google Ads

O exportador prepara um arquivo para revisão e upload manual na MCC. Ele não chama a API do Google Ads e não envia conversões automaticamente.

**Limite importante:** o exportador existente consulta `clickbank_postback_events`, isto é, os eventos do Custom Postback por macros descritos acima. Ele ainda não lê notificações INS v8. Portanto, sua regra atual baseada em `affiliate_earnings` não é a implementação do contrato novo; a futura origem de vendas deverá usar os dados INS v8 e comissão `totalAccountAmount`, mantendo os itens para relatórios por produto. Nesta fase, o objetivo é capturar e preparar o CSV para revisão — não fazer upload enquanto a integração externa continuar como remetente de compra.

### Instalação protegida no Hostinger

1. Ative o acesso SSH/Terminal do Hostinger, se ainda não estiver disponível.
2. Crie `private-tools/` fora de `public_html`. Neste Hostinger, o caminho visto pelo SSH foi `~/domains/travenzo.shop/domains/travenzo.shop/private-tools/`.
3. Envie `tools/export-google-ads.php`, `tools/google-ads-export-lib.php` e `tools/google-ads-export-service.php` para essa pasta privada. Para a integração opcional com o Hub, inclua também `tools/google-ads-api-lib.php`. Não envie esses arquivos para a pasta pública do subdomínio de tracking.
4. Mantenha o `tracking-config.php` privado existente em `~/domains/travenzo.shop/tracking-config.php`; não o copie nem mova. O exportador procura primeiro a configuração ao lado de `private-tools/` e, neste layout aninhado do Hostinger, também no caminho privado já existente três níveis acima.
5. A pasta `private-tools/exports/` será criada pelo comando e também deve permanecer fora de `public_html`.

### Uso

No Terminal/SSH do Hostinger, entre em `private-tools/` e rode primeiro os testes internos:

    php export-google-ads.php --self-test

Depois faça uma prévia, sem criar arquivo:

    php export-google-ads.php --conversion-name="NOME EXATO DA AÇÃO NO GOOGLE ADS"

Use exatamente o nome e a capitalização da ação criada na MCC. A prévia mostra contagens, sem exibir GCLIDs. Por padrão, considera postbacks recebidos nos últimos 90 dias. Se a prévia estiver correta, acrescente `--write` para gravar o CSV:

    php export-google-ads.php --conversion-name="NOME EXATO DA AÇÃO NO GOOGLE ADS" --write

O arquivo vai para `private-tools/exports/` com permissões restritas. Baixe-o pelo Gerenciador de Arquivos do Hostinger e revise-o em local seguro; não o coloque em uma URL pública. **Na fase atual, não faça upload enquanto a integração externa continuar enviando compras ao Google Ads.** Um upload próprio só será feito depois que o usuário decidir interromper a integração externa e revisar a prévia.

O CSV contém os cabeçalhos `Google Click ID`, `Conversion Name`, `Conversion Time`, `Conversion Value`, `Conversion Currency` e `Order ID`. O valor é a comissão do afiliado (`affiliate_earnings`), não o total pago pelo comprador. O horário é convertido para UTC com fuso explícito; `receipt_id` é usado como identificador do pedido quando disponível.

O exportador inclui somente eventos `PURCHASE` ligados por `extclid` a um `outbound_click`, com GCLID não vazio e não reconhecido como fictício, horário válido dentro da janela de 90 dias e comissão/moeda válidas. Ele deduplica pedidos dentro do mesmo CSV e ignora eventos sem associação, GCLID de teste, dados incompletos ou conversão anterior ao clique. Não exporta GBRAID/WBRAID, upsells, reembolsos ou chargebacks.

O comando padrão é somente prévia; `--write` grava o arquivo, mas não o envia. Revise o CSV antes de qualquer upload futuro. Cada nova execução considera novamente o período selecionado; o exportador não mantém um registro dos uploads aceitos pelo Google. Não reenvie linhas já aceitas; embora o `Order ID` ajude o Google a identificar duplicatas, confira o histórico de uploads. Não faça upload dos registros de teste nem use cliques próprios em anúncios para gerar GCLIDs.

### Cadastro de domínios da pre-sell

A primeira fase está implementada localmente e aguarda publicação manual. Consulte [deploy/staging/tracking-domain-allowlist/README.md](deploy/staging/tracking-domain-allowlist/README.md) para o pacote, os destinos separados, a migração aditiva e a configuração do token administrativo. A tabela dinâmica complementa, sem substituir, a allowlist legada. Não há remoção de domínios na primeira versão.

### Conectar o Hub local ao servidor (opcional)

Os endpoints antigos `google-ads-report.php` e `google-ads-csv.php` são somente leitura, consultam o postback legado e não substituem o CLI nem fazem upload para o Google Ads. A venda INS v8 usa endpoints dedicados descritos em `deploy/staging/clickbank-ins-v8-api/README.md`; não use os dados do postback legado como substituto da venda v8.

Os pacotes ZIP antigos foram removidos. Para o deploy sem compactação, copie os arquivos de `deploy/current/hostinger-public-track/` para a pasta pública do tracking e os de `deploy/current/hostinger-private-tools/` para `private-tools/`, conforme [deploy/LEIA-ME.md](deploy/LEIA-ME.md). Não envie esses dois grupos para o mesmo diretório.

1. Envie os quatro PHPs de `deploy/current/hostinger-private-tools/` para uma pasta privada fora de `public_html`. Os endpoints reconhecem `~/domains/<domínio>/private-tools/` e o layout aninhado do Hostinger `~/domains/<domínio>/domains/<domínio>/private-tools/`. Não envie a configuração nem `exports/`.
2. Envie `google-ads-report.php` e `google-ads-csv.php` de `deploy/current/hostinger-public-track/` para a pasta pública HTTPS do subdomínio, ao lado de `clickbank-postback.php`. Os endpoints procuram o serviço somente nos caminhos privados acima e rejeitam qualquer candidato dentro de `public_html`.
3. No `tracking-config.php` privado, adicione estas chaves. Gere o segredo no SSH com `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"` e copie o resultado diretamente para o arquivo privado; não use o token `clickbank_postback_token`:

       'tracking_hub_api_token' => 'COLE_AQUI_O_SEGREDO_DE_64_CARACTERES_HEXADECIMAIS',
       'tracking_hub_allowed_origins' => ['http://127.0.0.1:8765'],
       // Opcional para compatibilidade com versões antigas do Hub: o novo Hub
       // envia a ação selecionada no perfil pelo POST autenticado do endpoint CSV.
       'tracking_hub_conversion_name' => 'Conversão compra off-line (upload)',

   Use o nome exato da ação criada no Google Ads. O token é enviado pelo Hub somente no cabeçalho `Authorization: Bearer ...`, nunca na URL ou em logs. Opcionalmente, a tela pode lembrá-lo no `localStorage` desta origem/navegador, sem criptografia e fora da IndexedDB e dos backups JSON do Hub; **Desconectar** remove a cópia local. Na instalação mostrada pelo usuário, o campo `tracking_hub_api_token` fica no arquivo privado `~/tracking-config.php`, na raiz da conta e fora de `public_html`.
4. No Hub, abra **Tracking → Tracking ClickBank**, informe o token e escolha **Consultar vendas INS v8**. O endpoint JSON devolve totais, motivos de exclusão e uma prévia com GCLID/Order ID mascarados; o GCLID completo só sai pelo download CSV autenticado solicitado explicitamente.
5. Cadastre um perfil para cada conta/MCC, com um rótulo e o nome exato da ação de conversão. Os perfis ficam no `localStorage` desta origem/navegador, fora dos backups do Hub. Selecione o perfil correto antes de **Baixar CSV para Google Ads**; o nome exato da ação vai no POST autenticado, sem depender da configuração global do servidor. O rótulo não é enviado e não seleciona automaticamente a conta no Google Ads: confira a MCC de destino antes do upload manual.

Não é necessária migração SQL nesta etapa. O endpoint usa as mesmas regras e janela de 90 dias do exportador, não grava arquivos em `exports/`, não altera eventos e não marca conversões como enviadas. Exige HTTPS, token separado do postback ClickBank, CORS limitado à origem local exata, GET/OPTIONS para relatório e GET legado/POST JSON para CSV, além de `Cache-Control: no-store`; não aceita tokens em query string. O GET legado do CSV continua usando `tracking_hub_conversion_name` caso um Hub antigo ainda esteja instalado.

Antes de configurar o token, se os testes sintéticos tiverem sido enviados, rode em `private-tools/`:

    php -l export-google-ads.php
    php -l google-ads-export-service.php
    php -l google-ads-api-lib.php
    php tests/google-ads-export.test.php
    php tests/google-ads-api.test.php
    php export-google-ads.php --self-test

Os testes usam apenas dados sintéticos e não conectam ao banco.

Na pasta pública do subdomínio, valide também os wrappers:

    php -l google-ads-report.php
    php -l google-ads-csv.php

O esquema atual do Custom Postback não armazena identificador/nome do produto e o exportador legado agrega compras elegíveis. O receptor INS v8 foi validado por Test IPN e grava eventos/itens no banco; a API Hub/CSV v8 agora está implementada localmente, mas ainda precisa ser publicada e consultada pelo Hub. Não inferir produto nem GCLID de registros históricos incompletos. A v1 do CSV é uma conversão por recibo com comissão total; não cria ação Google Ads distinta por produto.

## Inclusão numa presell

O Hub local agora exibe a tag única em **Tracking → Tracks**, com botão de cópia. Depois de cadastrar/autorizar o hostname HTTPS, cole a tag uma vez no HTML. O script detecta HopLinks HTTPS criptografados pelo subdomínio `*.hop.clickbank.net`; no formato simples `hop.clickbank.net`, exige `affiliate` e `vendor` na query string.

O usuário informou que executou a migração e enviou os arquivos da fase 2; isso não foi validado remotamente nesta sessão. A próxima atualização incremental está em [`deploy/staging/presell-product-identity/`](deploy/staging/presell-product-identity/README.md): depois de backup e inspeção de schema, aplique somente a nova migração de identidade do produto/pre-sell e envie os arquivos listados. Não repita a migração de `clickbank_extclid`.

Links antigos com `data-track-outbound` e `data-track-clickbank` continuam compatíveis, mas não são mais necessários para HopLinks. Se o HopLink já trouxer `extclid` (por exemplo, da integração externa de tracking), o script o preserva e o salva separadamente para conciliar o GCLID; se não trouxer, gera e acrescenta um UUID próprio. `ft_sid`, `tid` e `aff_sub1–5` também não são alterados. Assim, o rastreamento de cliques do Hub não depende da integração externa de tracking. A associação de vendas, porém, requer que a ClickBank envie os eventos INS v8 ao endpoint do Hub; antes de desligar a integração externa, confirme que o endpoint do Hub está ativo e recebendo as notificações necessárias. A captura dos eventos de saída é usada para conciliação; uma tela dedicada para contagem/relatório de cliques continua posterior.

O endpoint do coletor valida a origem HTTPS e o hostname pela tabela dinâmica de domínios, sem precisar enviar arquivo para cada nova pre-sell. A fase 1 de autorização de domínios foi utilizada pelo usuário para cadastrar `metabo.zinvero.shop`; o novo pacote é uma atualização local separada e ainda precisa do upload manual.

## Protocolo de diagnóstico — considerar cache desde o início

Sempre que o resultado observado divergir do esperado após uma implementação, deploy ou teste — mesmo com uma suspeita pequena — inclua cache entre as primeiras hipóteses a verificar. Cache é uma hipótese, não uma conclusão: confirme com a resposta efetivamente entregue ao navegador antes de alterar código ou configuração.

### Roteiro

1. **Identifique o recurso exato.** No DevTools → Network, habilite **Preserve log**, recarregue e selecione o arquivo que contém a implementação observada. Registre URL completa, hostname, status e horário. A página pode estar em um domínio e carregar JavaScript de outro; investigue o cache do hostname do recurso (por exemplo, `track.travenzo.shop/track.js`), não apenas o da presell.
2. **Compare o conteúdo entregue com a versão implantada.** Examine a aba Response/Preview e compare o trecho relevante com o arquivo enviado ao servidor. Um `HIT` significa que houve resposta do cache, mas não prova sozinho que o conteúdo está velho; `Age`, `Last-Modified`, `ETag` e o corpo ajudam a confirmar. Registre também `Cache-Control` e, na Hostinger, `X-Hcdn-Cache-Status` (`HIT`, `MISS`, `DYNAMIC`, `BYPASS` etc.).
3. **Separe as camadas.** `Shift+F5`, janela anônima e **Disable cache** no DevTools ajudam a investigar o cache do navegador. Eles não limpam por si só a CDN nem o cache do servidor. Se o cabeçalho indicar CDN, confira o domínio/subdomínio correto no painel e limpe o cache correspondente quando necessário; investigue também Cache Manager e caches de aplicação/plugin se forem usados.
4. **Escolha a correção menos ampla.** Use Modo de desenvolvimento da CDN temporariamente durante edição e teste, no hostname que serve o recurso. Para operação contínua, prefira uma política de cache adequada ao recurso: prazo curto ou revalidação apenas do arquivo que muda com frequência. `no-store`/Modo de desenvolvimento evita reutilizar cache, mas aumenta as requisições ao servidor e pode reduzir desempenho. Versionar a URL também funciona, mas exige atualizar cada referência; quando muitas presells compartilham um script, considere primeiro uma regra central no servidor para esse arquivo.
5. **Depois de mudar a política de cache, invalide o objeto antigo uma vez e valide de novo.** Confira o cabeçalho e o corpo da nova resposta no Network; só então repita o fluxo funcional da página. Não conclua que o deploy falhou apenas porque a tela parece igual, nem que foi resolvido apenas porque houve um hard refresh.
6. **Feche o diagnóstico com evidências.** Anote hipótese, indicadores observados, camada corrigida e teste que confirmou a versão esperada. Se a resposta já contém o código atual, descarte cache como causa daquele caso e continue investigando outras hipóteses.

### Incidente de referência — `track.js` na Hostinger

Em 23/10/2026, o arquivo local e o upload mais recente já continham a correção, mas a resposta de `https://track.travenzo.shop/track.js` ainda vinha com `X-Hcdn-Cache-Status: HIT`, `Age` elevado, `Cache-Control: public, max-age=604800` e `Last-Modified` anterior ao upload. O cache limpo foi o do subdomínio `track.travenzo.shop`, que serve o JavaScript — não apenas o domínio da presell. Após a limpeza, o conteúdo atualizado passou a funcionar. Esse caso demonstra por que conferir a resposta real e o hostname do recurso deve fazer parte do diagnóstico.

Referências oficiais: [como funciona o cache da Hostinger CDN](https://www.hostinger.com/support/how-hostinger-cdn-caching-works/), [limpeza da CDN](https://www.hostinger.com/support/hostinger-cdn-how-to-clear-the-cache/) e [cabeçalhos de cache no `.htaccess`](https://www.hostinger.com/support/8052370-advanced-cdn-header-management-at-hostinger/).

## Limites e cuidados

- Use primeiro apenas a página test.html e o GCLID fictício; não clique nos próprios anúncios para testar.
- O teste demonstra captura técnica, não prova que todo navegador permitirá o envio nem que uma venda será atribuída.
- Antes de instalar em tráfego real, revisar aviso/consentimento e retenção de identificadores de publicidade aplicáveis ao site e ao público.
- A deduplicação no banco do Custom Postback cobre `event_id`; a INS v8 usa chave canônica. A API consulta somente as tabelas v8, inclui todos os itens para diagnóstico e exclui testes, eventos que não sejam SALE/AFFILIATE, atribuição não resolvida, recibos duplicados e divergências de comissão do CSV. Não há upload automático nem backfill histórico.
- Não publique credenciais, não as coloque em track.js e não envie senhas neste chat.

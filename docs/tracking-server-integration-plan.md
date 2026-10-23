# Tracking ClickBank — integração Hub e preparo do servidor

## Escopo e documentação relacionada

Este documento descreve o fluxo entre a página de pre-sell, ClickBank, os endpoints e o Hub, além das fronteiras de publicação manual. O contrato da implementação local — interface, armazenamento, privacidade e testes — fica em [`docs/maintenance.md`, seção Tracking ClickBank](maintenance.md#tracking-clickbank-no-hub). Mantenha os dois atualizados: altere o contrato local quando mudar a tela ou o comportamento do Hub; altere este plano quando mudar o caminho dos eventos, as APIs, os pacotes do servidor, a operação ou o diagnóstico.

O build do Hub publica somente os arquivos locais em `dist/`; não publica PHP, SQL, configuração privada nem tarefas Cron na hospedagem. Os caminhos `tracking-mvp/deploy/...` citados abaixo são referências aos pacotes preparados para implantação manual, não arquivos contidos neste checkout. Confirmações e capturas sobre a Hostinger registram ações/evidências da época em que foram fornecidas; não são verificação contínua do estado remoto. Nunca inclua tokens, senha SMTP, GCLID completo, recibo ou dados de comprador nesta documentação.

## Mapa ponta a ponta

1. A tag na pre-sell envia eventos de visita e clique de saída ao coletor. O servidor confere domínio, hostname e produto autorizados; os parâmetros do HopLink — inclusive `extclid` — são preservados.
2. A ClickBank envia notificações **INS v8** ao receptor próprio. Transações e itens ficam na trilha `clickbank_ins_v8_*`; o serviço reconcilia o clique por `extclid` quando há igualdade exata e mantém a trilha legada de macros separada.
3. A consulta de eventos INS v8 e o download do CSV são leituras/preparações separadas. O Hub mostra transações e itens para diagnóstico, mas só prepara linhas elegíveis de `SALE` afiliada; o arquivo é baixado por ação explícita.
4. Em paralelo, eventos de teste e vendas afiliadas novas podem gerar referências na outbox de e-mail. O worker CLI usa a configuração SMTP privada e o Cron para enviar avisos; isso não determina elegibilidade para CSV nem envia conversões ao Google Ads.
5. O relatório de cliques consulta totais agregados. O Hub guarda as respostas como snapshots somente locais; mudar filtros ou reabrir o relatório lê o cache sem consultar o servidor.

Essas trilhas têm objetivos e estados distintos: receber/auditar um postback não confirma e-mail, uma notificação não confirma compra elegível, e o CSV baixado não é um upload ao Google Ads. Os detalhes e limites de cada componente aparecem nas seções abaixo.

## Estado

A tela `/?view=tracking` preserva o leitor de CSV local e a consulta antiga aos postbacks por macros. Foi acrescentada uma trilha distinta para ClickBank **INS v8**: consulta às tabelas `clickbank_ins_v8_*`, apresentação das transações/itens e preparação de CSV em uma ação explícita de download.

O Test IPN foi aceito no receptor instalado e o usuário confirmou uma linha `TEST` com `is_test = 1` no MySQL. Depois, o Hub consultou a API INS v8 e exibiu o evento de teste; o usuário também cadastrou `metabo.zinvero.shop` pelo painel. A URL própria aparece como `Verified` na ClickBank; confirme **Save Changes** caso ainda não tenha sido salva. A Flow Tracking permanece intacta como integração atual de envio ao Google Ads.

## Separação das duas fontes

- **Postback legado / macros:** `google-ads-report.php` e `google-ads-csv.php` consultam `clickbank_postback_events`, não conhecem produto/item e mantêm o comportamento anterior. Os botões antigos continuam disponíveis, identificados como postbacks legados.
- **INS v8:** `clickbank-ins-v8-report.php` e `clickbank-ins-v8-csv.php` consultam somente `clickbank_ins_v8_transactions` e `clickbank_ins_v8_line_items`. Nenhuma consulta usa `clickbank_postback_events` como fallback.
- Ambos usam o token `tracking_hub_api_token`, a lista exata `tracking_hub_allowed_origins` e o nome de ação `tracking_hub_conversion_name` no `tracking-config.php` privado. Na instalação mostrada pelo usuário, esse arquivo fica em `~/tracking-config.php`, na raiz da conta Hostinger e fora de `public_html`. O token que a tela pode lembrar fica em `localStorage` da origem local, chave `hub:tracking:api-token:v1`; não é criptografado, não entra na IndexedDB ou no backup JSON, e é enviado somente no header `Authorization: Bearer ...`.

## Contrato INS v8 no Hub

Na seção **Conversões ClickBank → Google Ads**, **Exibir configurações** abre/recolhe juntos os botões de consulta INS v8, consulta de postbacks legados, desconexão, o campo do token da API e o bloco local **Ação de conversão · vendas INS v8**; o painel começa recolhido e essa preferência não é persistida. Os controles de leitura/importação/CSV permanecem visíveis fora do painel. Os detalhes de armazenamento local dos dois tokens, do perfil e da configuração do domínio estão no contrato de manutenção do Hub.

O relatório JSON é uma projeção sem PII, limitada a até 5.000 transações no conjunto e 100 transações mais recentes na tabela de prévia. Ele mostra também eventos de teste e não exportáveis para diagnóstico. Recibo e GCLID vêm mascarados; linhas de produto incluem SKU, título, tipo, quantidade, comissão e preço/abatimento quando recebidos.

Uma linha de CSV corresponde a uma transação futura `SALE` por recibo, com `Conversion Value = commission_total` (`totalAccountAmount`), `Conversion Currency = USD` e o horário UTC normalizado. Valores com até quatro casas decimais são preservados. Produtos de uma venda permanecem detalhados na tabela; o CSV usa uma linha pela comissão total, não uma linha por item.

Elegibilidade: origem INS v8, `role=AFFILIATE`, `transaction_type=SALE`, não teste, recibo e horário UTC válidos, comissão numérica, USD, GCLID não fictício com fonte validada (`explicit` ou associação exata `extclid_join`), reconciliação `matched` ou `unavailable`, e recibo único entre vendas elegíveis. Testes, reembolsos/chargebacks/rebill, conflitos ou atribuição não resolvida, comissões divergentes/pendentes, moedas inesperadas e recibos repetidos ficam fora do CSV com motivo visível. Não há backfill nem regra automática para corrigir comissão.

O CSV é produzido em memória no servidor e baixado apenas quando o usuário clica em **Baixar CSV para Google Ads**. Não é escrito no servidor, enviado à API Google Ads, marcado como enviado ou carregado automaticamente. O CSV só deve ser enviado manualmente depois que o usuário decidir interromper a Flow e revisar o arquivo.

## Endpoints e segurança

Os wrappers públicos são instalados em `public_html/track/`; o serviço fica em `private-tools/`, fora de `public_html/`. Os endpoints de relatório/CSV aceitam apenas GET/OPTIONS, rejeitam query string, exigem HTTPS em uso e token Bearer de 64 hexadecimais, autorizam somente a origem local exata configurada e retornam `Cache-Control: no-store`. O endpoint JSON não devolve GCLID ou recibo completos; somente o download CSV autenticado os contém. O serviço executa somente `SELECT`, não grava arquivos ou registros e não acessa tabelas de tentativas/payload.

Arquivos/caminhos e o procedimento de backup estão em `tracking-mvp/deploy/staging/clickbank-ins-v8-api/README.md`. O pacote é separado de `deploy/current/` e do staging do receptor. Ele não inclui SQL, `tracking-config.php`, tokens, chaves INS ou credenciais. Não é necessária nova migração: as três tabelas v8 já foram criadas e conferidas pelo usuário.

## Cadastro de domínios de pre-sell — fase 1

A tela Tracking tem a seção **Tracks**, que lista os vínculos cadastrados de pre-sell/domínio e produto. A lista chama `https://track.travenzo.shop/tracking-domains.php` por GET/POST, autenticado com um token administrativo diferente do token de consulta/download de vendas. O Hub gera 32 bytes aleatórios criptográficos e baixa `tracking-domain-admin-config.php`; esse arquivo é instalado uma vez na mesma pasta privada do `tracking-config.php`, fora de `public_html`. O token administrativo pode ser lembrado no `localStorage` por uma chave própria, separada do token de vendas, e apagado pelo botão **Esquecer token**. O armazenamento é local, não criptografado e restrito ao perfil/origem do navegador; rotacionar o token exige substituir a configuração privada no servidor. O usuário confirmou o cadastro de `metabo.zinvero.shop` pelo Hub.

O POST autoriza um hostname HTTPS explícito e, opcionalmente, a variante `www`. A tabela aditiva `tracking_allowed_domains` guarda origem e hostname normalizados; o `collect.php` instalado aceita tanto essa tabela quanto a allowlist legada. O endpoint é somente aditivo nesta versão, sem remoção de domínios. A fase 1 foi executada pelo usuário; isso não substitui novas autorizações para outros domínios.

## Script único de pre-sell — fase 2

O Hub mostra uma tag única e oferece **Copiar script**. A mesma tag serve para todos os domínios liberados: o navegador envia a origem HTTPS da pre-sell e o coletor valida o cadastro. O script detecta automaticamente HopLinks HTTPS em `*.hop.clickbank.net` com `affiliate` e `vendor`; os atributos antigos continuam aceitos, mas deixam de ser necessários. O script da Flow deve permanecer instalado.

Na página `metabo.zinvero.shop`, os três HopLinks observados já continham `extclid`, `ft_sid`, `tid` e `aff_sub1–5`. O `extclid` não tem o formato UUID do nosso identificador interno. Por isso, o código preserva o valor da Flow, salva-o separadamente em `tracking_events.clickbank_extclid` e permite que a INS v8 o concilie por igualdade exata; o UUID interno continua distinto. Se o HopLink não tiver `extclid`, o script cria um UUID próprio e o acrescenta. Não altera `ft_sid`, `tid` nem `aff_sub*`.

O usuário informou que concluiu a migração e o upload manual do pacote `tracking-mvp/deploy/staging/presell-single-script/`; as capturas de evento subsequentes confirmam que o script único registra visitas e cliques. Esta fase usa os eventos de saída para conciliar GCLID; o relatório de cliques da fase 3 permanece separado. Não altera o CSV nem envia conversões ao Google Ads.

## Identidade de produto por pre-sell — fase 2.1

O Hub aceita o nome legível do produto com espaços. A tag e a API continuam usando somente a chave técnica normalizada em minúsculas, com sequências de espaços/hífens virando um hífen (por exemplo, `Metabo Drops - Zinvero` → `metabo-drops-zinvero`). Para manter a apresentação original depois de recarregar a lista, o Hub guarda rótulos num mapa de `localStorage` indexado pela chave técnica; é específico deste navegador/origem e não é enviado ao servidor nem incluído na IndexedDB ou backups. Em outro perfil, a chave técnica é o fallback até cadastrar o rótulo nesse Hub.

O Hub gera uma tag para cada hostname selecionado com `data-product-key` e `data-presell-host`; ambos são identificadores públicos, não segredos. Pre-sells do mesmo produto podem compartilhar o mesmo código estável, mas o hostname exato e `page_url` separam domínio e página. O coletor valida o código contra `tracking_allowed_domains.product_key`, compara o hostname da tag com a origem/página e grava `product_key` e `presell_host` em cada evento, com índices para relatórios futuros. Domínios antigos sem chave usam o hostname como fallback; tags antigas sem os atributos continuam funcionando por compatibilidade e recebem a associação canônica do servidor. Se a chave de um domínio mudar, copie e publique novamente a tag correspondente.

O usuário concluiu o upload e a migração incremental `tracking-mvp/deploy/staging/presell-product-identity/`. As capturas de teste mostradas depois registram `metabo-zinvero` e `metabo.zinvero.shop`; um evento `outbound_click` também apareceu com `clickbank_extclid` presente. Isso comprova o funcionamento observado pelo usuário, sem inspeção remota do servidor.

## Vendas por Track — sincronização local

**Implementada no código local; o endpoint ainda aguarda publicação manual na Hostinger.** As capturas de esquema enviadas pelo usuário confirmam os campos necessários: ID de transação, papel/tipo, flag de teste e `extclid` em `clickbank_ins_v8_transactions`; `clickbank_extclid`, `click_id`, `event_type`, `product_key` e `presell_host` em `tracking_events`; e `page_host`/`product_key` na allowlist. O modelo pode usar o par observado no evento de saída e não precisa inferir pelo estado atual da allowlist. Não foi necessário pedir linhas de vendas, tokens, recibos ou credenciais, e **não há nova migração SQL**.

O pacote de API autenticada `tracking-mvp/deploy/staging/clickbank-ins-v8-api/` agora contém `clickbank-ins-v8-sales.php` e seu serviço privado `clickbank-ins-v8-sales-api-service.php`, além dos arquivos da API de relatório/CSV existente. A rota paginada lê somente registros `source=clickbank_ins_v8`, `role=AFFILIATE`, `transaction_type=SALE` e `is_test=0`, em páginas de 200, sob um snapshot estável de ID máximo. Ela seleciona no servidor somente ID, horário, `extclid` e os campos do clique necessários à associação; a resposta não inclui `extclid`, GCLID, recibo, comissão/valor nem dados do comprador. A autorização reutiliza o token Bearer e a origem local já configurada. O serviço faz somente `SELECT` nas tabelas INS e de cliques.

A associação usa somente igualdade exata entre venda `extclid` e clique `clickbank_extclid`; por compatibilidade, UUIDs também podem corresponder a `click_id` legado. Conta-se a venda uma vez por ID estável quando o conjunto de pares distintos `(presell_host, product_key)` é único. Vários cliques do mesmo par não criam ambiguidade; zero pares gera estado `unmatched` e mais de um par gera `ambiguous`, sem atribuição. TEST, rebill, upsell e outros tipos não entram na contagem. Itens da venda não são contabilizados separadamente.

Na seção **Tracks**, a coluna **Vendas (SALE)** lê a contagem do cache dedicado IndexedDB `hub-tracking-sales` v1, carregado sem rede ao abrir a tela. **Atualizar vendas** faz a consulta completa somente após clique; percorre todas as páginas até o snapshot, relendo histórico para encontrar associações que surgiram depois, valida tudo e troca o snapshot local atomicamente. Falha de rede/validação/armazenamento mantém o cache anterior. O limite defensivo atual é 50.000 registros por sincronização. Antes da primeira sincronização, a coluna mostra `—`; após uma sincronização válida, zero é uma contagem real daquele snapshot. O cache preserva o par host/produto visto na venda, então alterações na configuração não remapeiam vendas antigas; combinações que não existem mais na lista aparecem como históricas no resumo.

O cache local guarda apenas ID interno da transação, horário UTC, estado (`matched`, `unmatched`, `ambiguous`) e o par histórico quando único; não guarda token, extclid, GCLID, recibo, valores, dados do comprador ou URLs. Não integra a base operacional nem os backups JSON. A implementação do Hub não publica o pacote no servidor e não comprova a instalação remota. Para ativar a consulta, revise o README do pacote, faça backup dos arquivos de mesmo nome e publique manualmente os três PHPs públicos e os dois serviços privados; nenhum SQL novo é executado. Não altere o receptor INS nem a URL da Flow Tracking.

## Relatório de visitas e cliques — fase 3

Implementado localmente: a tela Tracking restaura os resultados do cache IndexedDB separado `hub-tracking-clicks` v1 ao abrir e ao mudar o período, sem consulta de rede. **Atualizar do servidor** busca explicitamente as datas UTC selecionadas (padrão: últimos 30 dias), grava um novo snapshot imutável e atualiza a projeção local. Períodos sobrepostos escolhem a consulta mais recente por dia, sem somar totais duplicados ou apagar snapshots. Filtros por produto e hostname são locais. A agregação diária conta `page_view`/`outbound_click`; a taxa é a razão entre eventos de saída e eventos de visita, não CTR nem visitantes únicos. A API reutiliza o token de acesso do Hub, valida a origem já autorizada, faz somente `SELECT`, limita o intervalo a 366 dias e a 5.000 combinações, e não seleciona/devolve IDs de visitante, GCLID/extclid ou URLs. O cache contém somente intervalos, horários e totais agregados; não contém token e não integra o backup geral do Hub.

Pacote do endpoint para publicação manual: `tracking-mvp/deploy/staging/tracking-clicks-report/` (dois PHPs, sem SQL e sem configuração privada). A alteração do cache é somente local ao Hub; não publica arquivos nem comprova ou modifica a instalação do endpoint na Hostinger.

## Notificações de venda por e-mail — fase inicial

Preparada localmente, sem publicação ou envio real nesta sessão. Eventos novos marcados como `is_test=1` entram na fila com tipo `test`; vendas `SALE` de afiliado não-test entram com tipo `sale`. O serviço INS apenas grava a referência da notificação na mesma operação de persistência e nunca abre conexão SMTP durante o postback. Se a gravação da fila falhar, a captura/ACK da ClickBank continua; reenvios do mesmo evento tentam preencher a referência idempotente. A tabela `clickbank_ins_v8_email_outbox` guarda somente `transaction_id`, `event_key`, estado/tentativas e códigos de erro não sensíveis.

Um worker PHP protegido para CLI processa até cinco itens por execução e usa lock para impedir execuções concorrentes. O Hub gera `clickbank-email-config.php` na memória da aba: destinatário, remetente e credenciais SMTP não são persistidos em `localStorage`, IndexedDB ou backups e não são enviados por rede pelo Hub. O arquivo baixado contém a senha e deve ser enviado manualmente ao mesmo `private-tools/` do worker, fora de `public_html`. A implantação depende da tabela, do upload dos arquivos, de uma caixa remetente autenticada e de uma tarefa Cron (hPanel PHP, a cada minuto). Os parâmetros SMTP devem ser obtidos no painel do provedor e podem ser substituídos ao migrar o servidor/domínio.

Mensagens de teste têm assunto `TESTE - Notificação ClickBank` e dizem explicitamente que não entram no CSV. Venda real informa data/hora UTC, país de cobrança, total bruto, comissão e até cinco itens; recibo vem mascarado e não há GCLID/extclid, endereço ou e-mail do comprador. O aviso pede revisão no Hub e não representa uma conversão enviada. No aviso de checkout, o worker relaciona o `extclid` do postback a eventos `outbound_click` e inclui o **Nome do Track** (`product_label`) somente quando o identificador aponta para uma única combinação de domínio e produto. Se o rótulo ainda não foi salvo, usa a chave técnica; se não houver correspondência única, mostra **não identificada** e mesmo assim envia o alerta. O `extclid` não é incluído no e-mail. Para alimentar o nome exato, a tabela `tracking_allowed_domains` precisa da coluna anulável `product_label`, a API administrativa precisa gravar/devolver esse campo e Tracks antigos sem rótulo devem ser salvos novamente no Hub após a publicação. O outbox mantém estado para retentativas (1 min, 5 min, 15 min, 1 h, depois a cada 6 h); por ser at-least-once, pode haver duplicata se o SMTP aceitar a mensagem e o worker cair antes de marcar o sucesso. Não há backfill em massa de eventos históricos.

Pacote para upload manual: `tracking-mvp/deploy/staging/clickbank-ins-v8-email/` (SQL aditivo, overlay do serviço e worker CLI; sem configuração SMTP privada). A associação ao Track também requer a migração atualizada `tracking-product-identity.sql` e os serviços da API de domínios do pacote `tracking-mvp/deploy/staging/presell-product-identity/`. Ordem: executar a migração idempotente antes de publicar a API/worker; depois, atualizar esses arquivos privados e re-salvar Tracks existentes para preencher rótulos vazios. O endpoint público do postback, a URL/token da ClickBank, a fila e a configuração SMTP não precisam ser alterados nesta etapa. Nada foi enviado ao servidor automaticamente.

## Diagnóstico de teste e notificações

Uma confirmação verde da ClickBank ou HTTP 200 comprova que a chamada recebeu uma resposta HTTP de sucesso; isoladamente, não comprova que foi criada uma nova transação, um item no outbox, um e-mail ou uma conversão do Google Ads. Em uma resposta observada, `recorded=false` com `insert_result="duplicate"` e `audit_logged=true` significou que o receptor reconheceu/auditou a chamada, mas não registrou um novo evento por duplicidade. Se a chave de idempotência for a mesma, um novo clique em Retry pode repetir essa resposta em vez de criar outro checkout ou e-mail. Confirme a ocorrência no banco antes de concluir que houve novo registro.

Para notificação, confira o evento relacionado e a linha em `clickbank_ins_v8_email_outbox`: `notification_kind`, `attempt_count`, `next_attempt_at_utc`, `sent_at_utc` e `last_error_code` ajudam a distinguir item ainda pendente, próxima tentativa agendada, entrega confirmada e falha reportada pelo worker. Um evento duplicado não equivale a um novo item de notificação; o worker e o Cron tratam a fila separadamente do retorno HTTP da ClickBank. O retorno do worker (“enviadas”, “pendentes com erro”, “selecionadas”) descreve o lote processado naquela execução, não a elegibilidade para CSV nem o estado da integração Google Ads.

O Hub não envia conversões diretamente ao Google Ads: **Baixar CSV** é uma preparação manual, e o upload/validação na conta ou MCC continua sendo uma etapa explícita do usuário. A ideia futura de autorização OAuth/integração direta com Google Ads não está implementada neste fluxo; não confunda a conexão OAuth de outra plataforma, o token do Hub para seus próprios endpoints e credenciais de acesso à API do Google.

## Validação

- PHP unit tests sintéticos cobrem autorização/CORS, exclusão de TEST, várias linhas de produto, comissão total, precisão de quatro casas, recibo duplicado, divergência, privacidade do relatório, CSV e caminhos público/privado.
- Testes do Hub cobrem os endpoints fixos HTTPS, bearer header, validação estrita do JSON, mascaramento, múltiplos produtos e ausência de download automático.
- Os testes das fases 2 e 2.1 cobrem auto-detecção de HopLinks, preservação do `extclid`/parâmetros Flow, produto e hostname da pre-sell, tag sem `crossorigin` e integridade dos pacotes/migrações. Depois do upload, uma nova interação de teste precisa acontecer após a atualização para que o evento de saída exista antes da notificação INS v8; registros antigos não são reprocessados automaticamente.
- Depois de publicar, consultar **vendas INS v8** no Hub e confirmar a linha TEST como diagnóstico não elegível. Sem venda real futura elegível, o download deverá continuar desabilitado. Não inserir dados fictícios nas tabelas reais.
- Se a URL própria ainda não tiver sido ativada, clicar **Save Changes** na ClickBank. Não alterar a URL da Flow.

## Fontes do Hub

`src/tracking/tracking-domain.mjs` valida CSV e relatório v8; `tracking-service.mjs` consome endpoints fixos; `tracking-domain-admin.mjs` valida domínios e fornece a tag de instalação; `tracking-email-config.mjs` valida e gera a configuração SMTP local; `tracking-view.mjs` apresenta os modos e copia a tag; `tracking.css` estiliza a tela; o adaptador permanece em `src/index.template.html`. Persistência local do token fica em `tracking-token-storage.mjs`; nenhum módulo grava a base operacional.

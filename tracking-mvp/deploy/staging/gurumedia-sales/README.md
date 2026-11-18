# GuruMedia — pacote de servidor para vendas e e-mail

Este é o único pacote de publicação da etapa GuruMedia e fica dentro do projeto `tracking-mvp`, em `deploy/staging/gurumedia-sales/`. As subpastas separam o banco, os arquivos públicos e os arquivos privados pelo destino na Hostinger. O código-fonte da tela do Hub continua no projeto `painel-operacao`; não copie fontes ou arquivos de build do Hub para este pacote.

## Atualização incremental atual: envio controlado de vendas GuruMedia ao Google Ads

**Estado:** depois da validação `validateOnly` da venda real, em 07/11/2026, o serviço bloqueou a tentativa localmente antes de chamar o Google porque rejeitava a presença simultânea de tipos diferentes de identificadores. Nenhuma conversão foi enviada nem registrada pelo Google nessa tentativa. A fonte foi corrigida: agora permite enviar todos os IDs capturados (`gclid`, `wbraid`, `gbraid`) juntos, mantendo as proteções contra clique duplicado e valores conflitantes do mesmo tipo. Esta correção está **local e aguarda publicação**. A migração anterior de Faturamento não faz parte desta etapa e não deve ser repetida.

O serviço privado prepara um evento Google Ads pela Data Manager API usando a comissão (`payout_amount`) como valor, a moeda recebida, o horário real `conversion_at_utc`, todos os identificadores de clique Google existentes no clique de saída e uma ação `UPLOAD_CLICKS` / `PURCHASE` selecionada para a MCC. Google Ads permite qualquer combinação de `gclid`, `wbraid` e `gbraid`; quando há mais de um, aplica a precedência `gclid`, `wbraid`, `gbraid`. `sub6`/`click_id` serve somente para localizar o clique do Hub; nunca é enviado como identificador Google. O `transactionId` enviado ao Google é o `sale_key` UUID estável da venda. Nenhum dado pessoal do comprador é enviado.

O servidor bloqueia a venda quando falta horário real, comissão positiva/moeda válida, clique único, ao menos um identificador Google, rota configurada ou MCC permitida. Também bloqueia IDs inválidos e conflitos de valores do mesmo tipo. O mapeamento de MCC/ação é sincronizado pelo Hub para o servidor; cada sincronização desliga o envio automático para revisão. A validação individual usa `validateOnly` e não registra conversão. O envio manual exige uma segunda confirmação e a fila impede reenvio automático de resultados aceitos, rejeitados ou incertos. A resposta aceita pela API ainda é assíncrona: o worker do Cron existente consulta o diagnóstico depois. Nenhuma venda foi enviada ao Google durante a implementação local.

**O envio automático fica desligado por padrão.** Uma venda já existente pode ser validada e enviada individualmente pela tela Tracking GuruMedia; ativar a automação só enfileira vendas novas recebidas depois da ativação, sem backfill. Antes de enviar manualmente ou ativar, confirme que integração externa ou outro emissor não envia a mesma venda à mesma ação, pois este código não desliga os outros emissores nem consegue desfazer uma conversão recebida pelo Google.

### Banco de dados

**Para esta atualização incremental:** o usuário informou que a migração já foi executada. Não execute SQL novamente; a correção muda somente o PHP. As instruções abaixo ficam como referência para uma instalação que ainda não tenha essa configuração.

Selecione no phpMyAdmin o banco do **Tracking MVP / Tracking API**, o mesmo banco da Hostinger que já contém `gurumedia_sales` e `tracking_allowed_domains`. Não selecione o banco local do Hub nem outro banco do site. O nome literal do banco não foi verificado; confirme-o na lista de bancos/configuração da Hostinger antes de executar.

Faça um backup e execute uma vez `database/gurumedia-google-ads-conversions.sql`. Ela cria as tabelas de configuração, rotas e fila de envio; não modifica as vendas existentes. Se alguma dessas tabelas já existir, confira o schema antes de executar.

Na configuração privada existente `tracking-config.php`, acrescente a allowlist separada para envio de conversões. Não reutilize nem altere `tracking_google_ads_campaign_write_manager_customer_ids`, que pertence às operações de campanha. Exemplo para as duas MCCs mostradas e selecionadas no Hub:

```php
'tracking_google_ads_conversion_upload_manager_customer_ids' => [
    '3533796641', // MCC Nutra
    '2231390435', // MCC e-com
],
```

Inclua somente MCCs aprovadas para receber conversões GuruMedia. Se a nova chave estiver ausente ou vazia, o servidor bloqueia sincronização de rotas e envios. Acrescente o trecho ao array existente; não substitua nem publique o arquivo de configuração. A chave da conta de serviço também permanece no servidor e não faz parte deste pacote.

Pasta local que contém o SQL:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-sales\database\
```

Arquivo: [gurumedia-google-ads-conversions.sql](database/gurumedia-google-ads-conversions.sql).

### **Pasta privada**

Pasta do servidor: /home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/.

Para esta correção incremental, envie somente o arquivo abaixo. O SQL já aplicado e o worker/Cron existente não precisam ser publicados novamente. A raiz de `hostinger-private-tools/` contém apenas o arquivo desta publicação; `_nao_subir/` é arquivo de referência e não deve ser enviado.

Arquivo `gurumedia-sales-service.php` — substitui a API privada GuruMedia existente:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-sales\hostinger-private-tools\
```

Link: [gurumedia-sales-service.php](hostinger-private-tools/gurumedia-sales-service.php). Destino: `private-tools/gurumedia-sales-service.php`.

Não há arquivo público nem postback novo para instalar nesta atualização. A integração externa continua sem alteração. A pasta `hostinger-public-track/` não contém arquivo para upload nesta etapa; as versões anteriores de `track.js` estão em `_nao_subir/`.

### Hub local e sequência após o deploy

O Hub não muda nesta correção. A mudança é apenas no serviço privado GuruMedia.

1. Faça backup do PHP privado atual e substitua somente `gurumedia-sales-service.php` pela versão preparada na pasta indicada. Não publique SQL, worker/Cron, `tracking-config.php` ou build do Hub nesta correção.
2. No Hub, atualize as vendas e repita **Validar sem enviar** para a mesma venda real. A validação verifica o pedido sem registrar conversão no Google.
3. Se a validação passar, revise a resposta. O envio real continua como ação separada: antes dele, confirme que integração externa ou outro emissor não enviou a mesma compra para a mesma ação e autorize o envio manual. “API aceitou” significa apenas recebimento assíncrono; o status final é atualizado pelo Cron existente.
4. Deixe o envio automático desligado até revisar a resposta do primeiro envio real e confirmar a regra de emissor único por ação. Se depois decidir ativá-lo, a interface pede confirmação e só vendas novas entram na fila.

Se o primeiro `validateOnly` voltar com erro de permissão, confira no Google Cloud o acesso `Service Usage Consumer` da conta de serviço ao projeto e o acesso dessa conta à MCC/ação. A integração usa o escopo `https://www.googleapis.com/auth/datamanager`; tokens e chaves permanecem no servidor.

## Histórico de atualizações anteriores

As seções seguintes descrevem etapas anteriores do mesmo pacote. Seus arquivos e SQL foram preservados em `_nao_subir/` quando não fazem parte desta entrega. Não use os inventários históricos como lista de upload atual.

### Atualização anterior: captura isolada dos IDs de clique Google

**Histórico:** a atualização de `track.js` descrita abaixo foi preparada em etapa anterior. Nesta atualização de conversões, não se envia `track.js`.

### Captura isolada dos IDs de clique Google — etapa anterior

O `track.js` da etapa anterior foi preservado em `hostinger-public-track/_nao_subir/track.js` e não é enviado nesta entrega. A mudança capturava o conjunto de `gclid`, `gbraid` e `wbraid` da visita, sem alterar a tag da Pre-Sell ou o postback da integração externa. O usuário informou que publicou a atualização; não foi feita leitura ao vivo do servidor.

## Fase 1: contrato estável de vendas para o Faturamento

Esta etapa prepara a API privada para a sincronização idempotente com o Faturamento local. Não altera a tela do Hub, não grava vendas no Faturamento e não envia conversões ao Google Ads; isso fica para fases seguintes.

Cada venda recebe um `sale_key` UUID persistido no banco. Ele permanece igual em consultas futuras, inclusive para vendas já existentes, e não revela o `transaction_id` da GuruMedia nem o `click_id` do Hub. O consumidor local deverá usar `gurumedia:<sale_key>` como identificador de origem ao fazer upsert, nunca acrescentar uma nova linha a cada atualização.

O modo `report_type: "billing_sales"` entrega páginas de até 500 vendas. A primeira chamada envia `start_date`, `end_date`, `report_type` e `page_size`; chamadas seguintes repetem o período e enviam também o `after_sale_key` retornado em `next_cursor`. Continue enquanto `has_more` for `true`. O filtro do período usa `received_at_utc`; para carregar todo o histórico, percorra o intervalo em janelas dentro do limite de datas do serviço e pagine cada janela. Esse modo não trunca silenciosamente os resultados. A resposta informa `total_sales` para a janela completa.

O contrato retorna `conversion_at_utc` (horário real, nulo quando ausente), `received_at_utc`, `billing_at_utc`, `billing_date_source`, Track/produto, pré-venda, oferta, `payout_amount` e `currency`. O valor financeiro é `payout_amount` — a comissão — na moeda `currency`. `billing_at_utc` usa o horário real quando existe; caso contrário, usa o recebimento do postback e marca `billing_date_source` como `received_time_fallback`. A ausência do horário real continua explícita, sem sobrescrever `conversion_at_utc`.

Exemplo da primeira chamada (autenticada como os relatórios atuais):

```json
{
  "start_date": "2026-01-01",
  "end_date": "2026-12-31",
  "report_type": "billing_sales",
  "page_size": 500
}
```

A resposta traz `schema_version: 2`, `date_filter_basis: "received_at_utc"`, `total_sales`, `has_more`, `next_cursor` e `sales`. Cada item contém `sale_key`, `source_platform`, `conversion_at_utc`, `received_at_utc`, `billing_at_utc`, `billing_date_source`, `product_key`, `product_label`, `presell_host`, `offer_id`, `offer_name`, `payout_amount` e `currency`. Para continuar a mesma janela, envie `next_cursor` como `after_sale_key`; o cursor só é válido para o período em que foi emitido.

O relatório usado pela tela Tracking GuruMedia continua no schema v1 e não muda nesta fase.

### Banco de dados

Selecione no phpMyAdmin o banco do **Tracking MVP / Tracking API**, o mesmo que já contém `gurumedia_sales` e `tracking_allowed_domains`. Não use o banco local do Hub nem outro banco do site. O nome exato do banco não foi verificado; se houver dúvida, confirme na lista de bancos da Hostinger antes de executar.

Na etapa anterior, foi executada uma vez `database/_nao_subir/gurumedia-sales-billing-contract.sql`; ela adiciona e preenche `sale_key`. O usuário informou que já a executou; não repita essa migração. Instalações novas usam o schema completo atualizado em `_nao_subir/gurumedia-sales.sql`.

Pasta local que contém o SQL:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-sales\database\
```

### **Pasta privada**

Pasta do servidor: /home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/.

Arquivo a substituir: **gurumedia-sales-service.php**.

Pasta local que contém o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-sales\hostinger-private-tools\
```

Depois de executar a migração, substitua somente esse arquivo. A raiz de `hostinger-private-tools/` contém apenas o PHP necessário nesta publicação; não envie `_nao_subir/`.

### Hub local e escopo desta fase

Não há mudança no Hub nesta fase. O contrato novo ainda não é consumido pela interface. Na Fase 2, os botões **Atualizar vendas** do Tracking ClickBank e **Atualizar vendas e cliques** do Tracking GuruMedia deverão acionar os respectivos upserts locais no Faturamento.

### Conferência após a publicação

O modo atual da tela permanece no schema v1. A futura sincronização do Faturamento usará o schema v2 após ser integrada pelo Hub. Não repita a migração antiga de `conversion_at_utc`, não altere o postback e não copie arquivos públicos ou do Hub para esta atualização.

## Atualização anterior (já publicada): aprendizado automático do ID da oferta

O macro `&offer_id={offer_id}` já está no postback configurado na GuruMedia. Não cadastre nem copie o ID manualmente no Hub. Depois de receber um postback cuja `click_id`/`sub6` corresponda a um único clique de saída de uma Track GuruMedia cadastrada, o servidor grava o `offer_id` nessa Track e o Hub passa a mostrá-lo em **Configurações globais**. O ID aprendido permite identificar callbacks futuros que cheguem sem clique.

Se um postback sem clique chegar antes de o ID ter sido aprendido, ele fica apenas no diagnóstico e não gera alerta; sem correspondência segura não se pode descobrir a Track. A venda com clique único é registrada normalmente, aprende o ID e envia o e-mail normal. Não altere `track.js`, a tag da Pre-Sell, o postback da integração externa ou o Cron.

### Banco de dados

Não há SQL novo nesta atualização. A migração `gurumedia-offer-id-alerts.sql` já foi executada pelo usuário; não a repita.

### **Pasta privada**

Pasta do servidor: /home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/.

Na época desta atualização, foram substituídos `gurumedia-sales-service.php` e `tracking-domain-allowlist-lib.php`; ambos agora ficam arquivados em `_nao_subir/` e não devem ser enviados novamente.

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-sales\hostinger-private-tools\
```

### Hub

Publique o build atualizado do projeto `painel-operacao` para remover o campo de cadastro manual e mostrar o `offer_id` aprendido automaticamente. O postback já configurado não precisa ser copiado de novo.

## Etapa anterior (já implantada): ID da oferta e aviso de venda sem clique

Esta seção registra a implantação original da coluna `offer_id` e da fila de alertas. Para a atualização de conversões, siga somente **Atualização incremental atual: envio controlado de vendas GuruMedia ao Google Ads** no início; não repita a migração nem reenvie os arquivos arquivados.

O postback GuruMedia deve receber `offer_id={offer_id}`. Não é preciso copiar esse ID para o Hub: quando o `click_id`/`sub6` de uma venda corresponder a um único clique de saída de uma Track GuruMedia cadastrada, o serviço aprende e grava o ID nessa Track automaticamente. O Hub mostra o ID aprendido na tabela de Tracks. Se um mesmo ID for aprendido para produtos diferentes, a associação é sinalizada como ambígua.

Quando um postback não encontra exatamente um clique de saída, o servidor continua sem contar a transação como venda atribuída. Ele guarda hash da transação, oferta, payout/moeda, horário e resultado para diagnóstico. Se o ID já tiver sido aprendido por uma venda atribuída a uma Track, um callback sem clique correspondente pode gerar alerta pelo Cron/worker existente. Um callback sem clique que chegue antes de o ID ser aprendido fica somente no diagnóstico: sem associação confiável não é possível identificar a Track e enviar o alerta correto. A mensagem não inclui o ID bruto da transação, o ID do clique nem dados do comprador. Uma venda corretamente associada aprende o ID e continua usando o e-mail normal de venda.

### Banco

No phpMyAdmin da Hostinger, primeiro selecione a base MySQL usada pelo **Tracking MVP / Tracking API** — a mesma que já contém `tracking_allowed_domains` e as tabelas GuruMedia existentes. Não execute esta migração no banco local do Hub nem em outra base do site. O nome exato da base não está fixado neste pacote; se houver dúvida, confirme-o na lista de bancos da Hostinger antes de executar.

Com essa base selecionada, execute uma vez `database/gurumedia-offer-id-alerts.sql`, depois da migração `tracking-platform-classification.sql`. Ela adiciona `tracking_allowed_domains.offer_id`, metadados de callback sem clique e a nova fila de alertas. Não repita `gurumedia-sales.sql` nem a migração de horário de conversão nesta instalação.

### Estado da implantação anterior

A coluna `offer_id`, a auditoria dos postbacks, as filas de e-mail e os cinco serviços desta fase já foram publicados. Esta etapa anterior não requer nova ação: não repita a migração nem envie os arquivos listados na seção atual arquivados sob `_nao_subir/`. Não crie outro Cron e não publique o arquivo `tracking-config.php`.

## Antes de publicar

- Confirme que o coletor e a migração de identidade das Tracks já estão instalados, e que os Tracks aparecem no Hub.
- O relatório depende de `private-tools/tracking-clicks-report-service.php` e do token `tracking_hub_api_token`, que já atendem ao relatório de cliques. O serviço já foi instalado numa etapa anterior; a cópia local de referência está em `hostinger-private-tools/_nao_subir/` e não faz parte desta publicação.
- Os avisos usam a configuração SMTP compartilhada e o Cron de e-mail existentes. Não crie outro Cron. Se o e-mail ClickBank já funciona, mantenha a configuração atual. Tokens, credenciais e arquivos privados gerados pelo Hub não são incluídos neste pacote.
- Faça backup dos arquivos que serão substituídos e do banco correto. Não altere o endpoint nem as configurações da integração externa.

## Etapa anterior (já publicada): captura do horário real da conversão

Esta atualização adiciona o horário do evento GuruMedia, separado do horário em que o postback chegou ao servidor. Ela não envia conversões ao Google Ads e não exige alterações em arquivos públicos, no Hub, na integração externa ou em `tracking-config.php`.

Para esta instalação, a migração do banco já foi executada pelo usuário. Não há operação SQL pendente para esta publicação.

### **Pasta privada**

Pasta do servidor: /home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/.

Arquivo a substituir: `gurumedia-sales-service.php`.

Pasta local do pacote que contém o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-sales\hostinger-private-tools\
```

Substitua somente o serviço privado de GuruMedia. Mantenha-o fora de `public_html`.

### Banco de dados

Para esta instalação, a migração já foi executada. Não a repita. Em outras instalações existentes que ainda não tenham essa coluna, a migração aditiva é executada uma vez no banco que contém `gurumedia_sales`; ela não é um arquivo para upload na Hostinger. Instalações novas usam o schema completo atualizado.

### Ordem e conferência

1. Faça backup do serviço privado atual.
2. No File Browser da Hostinger, abra o destino privado informado e use o envio de arquivo para localizar `gurumedia-sales-service.php` dentro da pasta local indicada acima; substitua a cópia existente.
3. Confira que o serviço foi atualizado e permaneceu fora de `public_html`.

O postback aceita `conversion_time` com fuso explícito ou epoch em segundos/milissegundos e converte o valor para UTC. Ainda é necessário mapear o macro de data/hora de conversão da GuruMedia para esse parâmetro. Se o parâmetro faltar ou for inválido, a venda e o aviso por e-mail continuam sendo registrados, mas o horário real permanece vazio. Não substitua esse dado pelo horário de recebimento.

## Etapa anterior (já implantada): separar ClickBank e GuruMedia

Como a primeira instalação GuruMedia já foi feita, use somente os itens desta seção. A mudança classifica cada domínio/Track na API e separa as métricas; não exige alterar `track.js`, reinstalar as tags ou repetir `gurumedia-sales.sql`.

| Arquivo deste pacote | Destino na Hostinger | Ação |
| --- | --- | --- |
| `database/tracking-platform-classification.sql` | Banco que contém `tracking_allowed_domains` | Executar uma vez; adiciona `platform`, com ClickBank como padrão para os registros existentes |
| `hostinger-private-tools/tracking-domain-allowlist-lib.php` | `private-tools/tracking-domain-allowlist-lib.php` | Substituir; lê e grava a plataforma da Track |
| `hostinger-private-tools/_nao_subir/tracking-domains-api-service.php` | `private-tools/tracking-domains-api-service.php` | API publicada na etapa anterior; não copiar nesta atualização |
| `hostinger-private-tools/_nao_subir/tracking-clicks-report-service.php` | `private-tools/tracking-clicks-report-service.php` | Serviço publicado na etapa anterior; não copiar nesta atualização |
| `hostinger-private-tools/gurumedia-sales-service.php` | `private-tools/gurumedia-sales-service.php` | Substituir; associa o postback GuruMedia somente a Tracks marcadas como GuruMedia |
| `hostinger-private-tools/_nao_subir/clickbank-ins-v8-email-service.php` | `private-tools/clickbank-ins-v8-email-service.php` | Serviço publicado na etapa anterior; não copiar nesta atualização |

Registro histórico da primeira atualização de classificação (já implantada; não é a lista de ações atual): naquela fase, foi preciso fazer backup, executar a migração e publicar cinco arquivos privados. Não repita essa sequência. Depois da publicação, os domínios existentes foram classificados em **Configurações globais**; as Tracks GuruMedia precisaram ser marcadas como **GuruMedia**.

O Hub para de mostrar o cache antigo misturado. Ele permanece armazenado, mas a tela o ignora até uma nova consulta classificada por plataforma. Abra **Tracking GuruMedia** para atualizar visitas e cliques; **Tracking ClickBank** continua exibindo apenas suas próprias métricas.

## Arquivos e destinos — inventário histórico

Esta tabela registra as etapas anteriores e serve apenas como referência. **Não use esta lista para o deploy atual.** A publicação inicial do emissor precisou dos dois PHPs; para a correção incremental atual, envie somente `gurumedia-sales-service.php`, conforme indicado no início deste README.

| Origem neste pacote | Destino | Ação |
| --- | --- | --- |
| `database/gurumedia-sales.sql` | Banco do Tracking | Para instalação nova; cria tabelas aditivas de venda, auditoria e fila de e-mail, incluindo o horário do evento |
| `database/gurumedia-sales-conversion-time.sql` | Banco do Tracking | Migração de referência para instalações existentes que ainda não tenham aplicado a coluna de horário; nesta instalação, o usuário informou que já foi executada |
| `database/gurumedia-offer-id-alerts.sql` | Banco do Tracking | Nova migração desta atualização; adiciona o ID da oferta por Track, os metadados mínimos de callbacks sem clique e a outbox de alerta |
| `hostinger-private-tools/tracking-domain-allowlist-lib.php` | `private-tools/tracking-domain-allowlist-lib.php` | Substituir; preserva o `offer_id` aprendido ao salvar a Track |
| `hostinger-private-tools/_nao_subir/tracking-domains-api-service.php` | `private-tools/tracking-domains-api-service.php` | API publicada na etapa anterior; não copiar nesta atualização |
| `hostinger-private-tools/gurumedia-sales-service.php` | `private-tools/gurumedia-sales-service.php` | Instalar |
| `hostinger-private-tools/_nao_subir/clickbank-ins-v8-email-service.php` | `private-tools/clickbank-ins-v8-email-service.php` | Serviço publicado na etapa anterior; não copiar nesta atualização |
| `hostinger-private-tools/_nao_subir/clickbank-ins-v8-email-worker.php` | `private-tools/clickbank-ins-v8-email-worker.php` | Worker publicado na etapa anterior; não copiar nesta atualização |
| `hostinger-public-track/track.js` | `public_html/track/track.js` | Substituir; as tags nas Pre-Sells permanecem iguais |
| `hostinger-public-track/gurumedia-sales-bootstrap.php` | `public_html/track/gurumedia-sales-bootstrap.php` | Instalar antes dos wrappers |
| `hostinger-public-track/gurumedia-sales-postback.php` | `public_html/track/gurumedia-sales-postback.php` | Instalar |
| `hostinger-public-track/gurumedia-sales-report.php` | `public_html/track/gurumedia-sales-report.php` | Instalar |

Não envie a pasta inteira para um único diretório no servidor. Use somente os itens listados; não publique `tracking-config.php`, tokens ou credenciais.

## Publicação inicial em cinco etapas — histórico

Esta sequência descreve a instalação inicial completa e não deve ser repetida nesta atualização. Para a ação atual, siga somente **Atualização incremental atual: envio controlado de vendas GuruMedia ao Google Ads** no início deste README.

1. **Banco:** selecione a base que contém `tracking_events`. Em instalação nova, execute `database/gurumedia-sales.sql` uma vez. Nesta instalação existente, não repita o schema nem `gurumedia-sales-conversion-time.sql`; execute somente `database/gurumedia-offer-id-alerts.sql`, depois de `tracking-platform-classification.sql`.
2. **Arquivos privados:** na instalação inicial, foram publicados cinco serviços privados. Esse inventário foi arquivado e não é a lista do deploy atual. O Cron continua chamando o mesmo worker.
3. **Arquivos públicos:** substitua `track.js` e publique o bootstrap, o postback e o relatório nos destinos da tabela. O serviço privado de relatório precisa estar instalado antes de testar os wrappers.
4. **Configuração privada:** na tela **Tracking GuruMedia** do Hub, gere/informe o segredo e copie o trecho PHP. Acrescente somente `gurumedia_postback_token` ao array de `tracking-config.php`, fora de `public_html`; não substitua o arquivo. O valor precisa ser igual ao token usado na URL copiada do Hub. Se SMTP ainda não estiver configurado, gere `tracking-email-config.php` em **Configurações globais** e instale-o em `private-tools/`.
5. **GuruMedia:** mantenha o postback ativo com `transaction_id`, `click_id={sub6}`, `offer_name={offer_name}`, `payout_amount={payout_amount}`, `currency={offer_currency}`, `conversion_time={timestamp}` e `offer_id={offer_id}`. A captura mais recente do usuário mostrou os dois últimos macros na URL. O ID aparece automaticamente em **Configurações globais** do Hub após a primeira venda associada a um clique único. Um postback sem clique anterior a esse aprendizado fica apenas no diagnóstico, sem alerta, porque não é possível confirmar a Track. O serviço aceita horário ISO com fuso ou epoch em segundos/milissegundos, converte para UTC e mantém `received_at_utc` separado. Se o horário faltar ou for inválido, a venda e o e-mail continuam, mas o horário do evento fica vazio. Use **Conversions → Global** somente se puder coexistir com a integração externa; se não puder, configure **Specific** para a oferta e mantenha o postback da integração externa intacto.

## Conferência

- Recarregue uma Pre-Sell cadastrada e clique no link da GuruMedia. Confira no DevTools → Network que o link de saída leva o `sub6` atualizado; depois de substituir `track.js`, considere o cache/CDN do arquivo servido. Não é preciso reinstalar a tag nas páginas.
- Use um recurso de teste de postback da GuruMedia, se disponível, ou aguarde uma venda real aprovada. Não conclua uma compra só para testar.
- Consulte **Tracking GuruMedia** no Hub. A venda só aparece se `sub6` corresponder a um clique de saída único de uma Track cadastrada. Reenvios do mesmo `transaction_id` não duplicam a venda. O relatório mostra payout/comissão, não o valor bruto da compra.
- O resumo do relatório informa quantas vendas no período consultado têm horário real de conversão e quantas ainda não têm. Vendas históricas anteriores à migração ficam sem `conversion_at_utc`; não se inventa horário retroativo.
- Uma venda nova associada gera o e-mail normal na próxima execução do Cron existente. Uma venda sem clique único gera alerta somente se `offer_id` corresponder a uma Track GuruMedia cadastrada. IDs não cadastrados não geram alerta; não há e-mail retroativo.

## Comportamento e reversão

Postbacks sem associação recebem resposta para evitar retentativas e não entram nos totais. A auditoria guarda hash do ID da transação, oferta, payout, moeda, horário do evento e resultado, nunca o ID bruto da transação, o ID de clique ou o payload inteiro. Não são armazenados dados pessoais do comprador. As datas do relatório são do recebimento no servidor em UTC.

Para reverter, desative somente o postback novo da GuruMedia e restaure `track.js` e o serviço GuruMedia usando os backups. Reverta o serviço/worker de e-mail somente se também quiser restaurar o comportamento compartilhado anterior de ClickBank. Não apague as tabelas nem os registros. A integração externa permanece como estava.

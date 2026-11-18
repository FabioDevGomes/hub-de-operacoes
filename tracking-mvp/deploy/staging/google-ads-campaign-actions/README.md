# Google Ads Campaign Actions — pacote de staging

> **Deploy incremental de criação de campanha:** use o pacote isolado [`google-ads-campaign-creation`](../google-ads-campaign-creation/README.md). Para essa etapa, envie somente o arquivo listado naquele README. Esta pasta registra a implantação anterior de pausar/ativar e avisos por e-mail; não reenvie seu SQL ou serviços nesta etapa.

> **Motivos atualizados dos e-mails:** a publicação inicial abaixo só identificava pausas por saldo negativo. Para enviar também o motivo correto das regras por desempenho do produto, tempo ativo e dias sem impressões, use o pacote incremental [`google-ads-pause-email-rule-reasons`](../google-ads-pause-email-rule-reasons/README.md); não reexecute o SQL inicial nem reenvie o worker.

Este pacote mantém as operações restritas de pausar (`ENABLED → PAUSED`) e ativar (`PAUSED → ENABLED`) campanhas. Ele também adiciona um aviso por e-mail **somente depois que uma pausa automática por valor restante negativo for confirmada pela API**. O botão de ação manual na coluna não envia o contexto automático; falhas de API, campanhas já pausadas e ativações também não geram aviso. Em 27/10/2026, o usuário informou que já publicou os arquivos e confirmou que pausar/ativar funciona. A criação de campanhas descrita abaixo é uma alteração local nova e ainda não foi publicada. O usuário confirmou que a configuração necessária no `tracking-config.php` já foi executada; esse arquivo não faz parte do deploy e não deve ser reenviado ou editado. O escopo escolhido cobre as contas cliente ativas vinculadas às MCCs Nutra e e-com. As telas enviadas pelo usuário em 27/10/2026 mostram a conta de serviço com nível **Padrão** nas duas MCCs. As operações atuais dependem de `tracking_google_ads_campaign_writes_enabled` como booleano PHP `true` e `tracking_google_ads_campaign_write_manager_customer_ids` com as MCCs autorizadas. A criação exige também o novo flag separado `tracking_google_ads_campaign_creation_enabled`, que fica **desligado por padrão**. Antes de cada habilitação e mutação, o serviço consulta `customer_client` na API e confirma que a conta cliente está ativa e vinculada à MCC enviada. Assim, novas contas cliente ativas vinculadas às MCCs autorizadas entram automaticamente; contas gerente, desativadas ou não vinculadas ficam de fora.

Referência dos parâmetros já configurados no `tracking-config.php` privado: `'tracking_google_ads_campaign_writes_enabled' => true` e `'tracking_google_ads_campaign_write_manager_customer_ids' => ['<ID MCC Nutra>', '<ID MCC e-com>']`. O usuário informa que essa configuração já foi executada. Valores são strings de 10 dígitos, sem hífens. Para autorizar outra MCC no futuro, conceda acesso à conta de serviço e acrescente o ID dela nesta lista. Contas cliente associadas serão verificadas dinamicamente; não preencha uma lista manual de contas cliente.

## Arquivos e destinos de publicação

| Pacote local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-campaign-pause-email-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-pause-email-service.php` |
| `hostinger-private-tools/clickbank-ins-v8-email-worker.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-email-worker.php` |
| `hostinger-private-tools/google-ads-campaign-action-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php` |
| `database/google-ads-campaign-pause-email-outbox.sql` | Banco privado de tracking via phpMyAdmin |

### Arquivos agrupados por destino no servidor

Siga o [formato padrão de apresentação de deploy](../../PADRAO-DEPLOY-SERVIDOR.md). Os arquivos abaixo estão agrupados pelo destino; copie os caminhos das pastas locais e abra os links diretos dos arquivos.

**Destino no servidor — Private Tools:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do serviço:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-actions\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-pause-email-service.php](hostinger-private-tools/google-ads-campaign-pause-email-service.php)

Arquivo de destino: `google-ads-campaign-pause-email-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-pause-email-service.php`

Arquivo local: [clickbank-ins-v8-email-worker.php](hostinger-private-tools/clickbank-ins-v8-email-worker.php)

Arquivo de destino: `clickbank-ins-v8-email-worker.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-email-worker.php`

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)

Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

**Destino no banco:** banco privado de tracking já utilizado pelo worker de e-mail

Pasta local da migração:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-actions\database
```

Arquivo local: [google-ads-campaign-pause-email-outbox.sql](database/google-ads-campaign-pause-email-outbox.sql)

Arquivo de destino: `google-ads-campaign-pause-email-outbox.sql` — execute uma vez no banco privado de tracking pelo phpMyAdmin.

O wrapper público atual continua inalterado; **não envie arquivos a `public_html` neste pacote**.

O serviço privado requer, no mesmo diretório `private-tools`, os arquivos existentes `google-ads-readonly-service.php` e `clickbank-ins-v8-service.php`; o worker também usa `clickbank-ins-v8-email-service.php`. A chave JSON permanece no caminho já instalado `private-tools/google-ads-credentials/service-account.json`. Não copiar serviço privado nem credenciais para `public_html`. O wrapper público só localiza/carrega o serviço privado; ele não contém credenciais.

## Criação de campanha de Pesquisa — etapa local

A nova operação usa o mesmo serviço privado e o mesmo wrapper publicado. O backend aceita somente campanhas de Pesquisa e não recebe GAQL do navegador. `campaign_templates` lista modelos encontrados dinamicamente na conta selecionada, sem ID de campanha ou MCC fixa no código. Para evitar copiar uma estrutura incompleta, só oferece modelos que tenham orçamento diário não compartilhado, lance Manual CPC, um grupo de anúncios padrão ativo com um anúncio responsivo ativo, palavras-chave positivas ativas e segmentação de local suportada. Modelos com critérios ou estrutura que o MVP não copia são omitidos; erros de API não são convertidos em lista vazia. Orçamento, rede, geolocalização, palavras-chave negativas de campanha e configurações de tracking de campanha/grupo/anúncio são herdados do modelo selecionado.

Carregar modelos faz cinco consultas GAQL de leitura por conta selecionada. A tela deve carregá-los quando o usuário abrir o formulário ou trocar de conta e reutilizar o resultado enquanto a seleção não mudar; não deve chamar o serviço em cada renderização ou atualização periódica da Visão Geral. Não há coleta em background nem Cron novo.

`preview_search_campaign` chama `GoogleAdsService.Mutate` com `validateOnly: true`; não cria recursos. `create_search_campaign` exige `confirm: true` e cria orçamento independente, campanha, grupo de anúncios, palavras-chave, anúncio responsivo e recurso de promoção numa transação. A campanha é criada **pausada**; ativá-la continua sendo uma ação separada na Visão Geral. A configuração copiada, o orçamento e as contagens de palavras-chave/localidades aparecem na prévia. Cada solicitação só pode enviar exatamente 10 títulos e 3 descrições; não são aceitos campos extras.

As operações de criação só ficam disponíveis quando o administrador adicionar ao `tracking-config.php` privado:

```php
'tracking_google_ads_campaign_creation_enabled' => true,
```

Esse flag não substitui nem altera `tracking_google_ads_campaign_writes_enabled` ou a lista `tracking_google_ads_campaign_write_manager_customer_ids`. A criação usa a mesma allowlist de MCCs e verifica a hierarquia atual em cada operação, então não é necessário listar contas cliente uma a uma. O flag fica desligado por padrão até a tela do Hub estar pronta e revisada.

Contrato adicional no mesmo endpoint privado:

- `POST {"operation":"creation_capabilities","manager_customer_id":"<MCC>","customer_id":"<conta>"}` consulta se a criação está habilitada para a conta cliente ativa da MCC permitida.
- `POST {"operation":"campaign_templates","manager_customer_id":"<MCC>","customer_id":"<conta>"}` lista os modelos elegíveis encontrados naquela conta.
- `preview_search_campaign` aceita `manager_customer_id`, `customer_id`, `source_campaign_id`, `campaign_name`, `final_url`, `headlines` (10), `descriptions` (3) e `promotion`; valida a estrutura, mas não grava recursos.
- `create_search_campaign` recebe os mesmos campos mais `confirm: true`, cria os recursos e relê a campanha para confirmar que ficou pausada.
- A promoção exige alvo, percentual ou valor de desconto, idioma e um gatilho (código promocional ou valor mínimo do pedido). Valores monetários usam a moeda da conta modelo.

Objeto `promotion` aceito (sem propriedades extras):

```json
{
  "target": "Produto",
  "discount_type": "percent_off",
  "discount_value": "20",
  "trigger_type": "promotion_code",
  "trigger_value": "CODIGO20",
  "language_code": "pt-BR",
  "start_date": null,
  "end_date": null
}
```

Para desconto fixo, use `discount_type: "amount_off"` e `discount_value` como decimal em texto, por exemplo `"12.50"`. Para condição de compra mínima, use `trigger_type: "orders_over_amount"` e `trigger_value` como decimal em texto. Se informar início ou término, informe as duas datas em `YYYY-MM-DD`.

Ainda não há interface de criação no Hub nesta etapa. Não execute `create_search_campaign` manualmente para uma campanha real: o Hub deverá apresentar a prévia e pedir confirmação explícita antes de enviar essa operação. Nenhuma campanha foi criada durante esta implementação.

## Publicação incremental da operação de criação

Para publicar apenas o backend desta etapa, substitua somente `google-ads-campaign-action-service.php` no destino Private Tools listado acima. Faça backup da versão instalada antes de substituir. Não reaplique o SQL do aviso por e-mail, não reenvie o wrapper público e não copie credenciais ou `tracking-config.php`. O novo flag de criação permanece falso/ausente, portanto pausar/ativar continua seguindo a configuração atual; habilite a criação em separado apenas depois da tela do Hub estar integrada e revisada.

## Contrato e salvaguardas

- `creation_capabilities` informa se a criação está habilitada em separado para a conta ativa vinculada à MCC permitida.
- `campaign_templates` lista modelos Search elegíveis dinamicamente na conta; as contas cliente não são cadastradas uma a uma.
- `preview_search_campaign` valida sem mutação. `create_search_campaign` cria a estrutura atomicamente e exige `confirm: true`; apenas a campanha fica pausada, enquanto grupo/anúncio/ativos ficam habilitados para poderem veicular depois que o usuário ativar a campanha.
- A criação tem um flag independente, `tracking_google_ads_campaign_creation_enabled`, que não altera o acesso atual de pausar/ativar. As duas operações usam a mesma allowlist de MCCs e a checagem dinâmica da hierarquia.
- `POST {"operation":"capabilities","manager_customer_id":"<ID MCC>","customer_id":"<ID conta cliente>"}` retorna se as operações estão habilitadas para a conta cliente atualmente vinculada à MCC autorizada. Exige o mesmo token Bearer e origem permitida usados pelo proxy Google Ads existente.
- `POST {"operation":"pause_campaign","manager_customer_id":"<ID MCC ou null>","customer_id":"<ID conta>","campaign_id":"<ID campanha>","expected_status":"ENABLED","confirm":true}` pausa somente campanha ativa.
- `POST {"operation":"enable_campaign","manager_customer_id":"<ID MCC ou null>","customer_id":"<ID conta>","campaign_id":"<ID campanha>","expected_status":"PAUSED","confirm":true}` ativa somente campanha pausada.
- As duas operações aceitam apenas os campos especificados e IDs validados; não aceitam GAQL do navegador.
- O servidor monta GAQL fixa para reler ID, nome e status da campanha e usa o MCC indicado no cabeçalho `login-customer-id`.
- A única propriedade alterada é `campaign.status`; cada pedido muda o status apenas na transição declarada. O servidor relê o estado antes da mutação e depois para verificar o resultado.
- Se a campanha já estiver no status de destino, o serviço responde com sucesso verificado sem outra mutação. Estados diferentes do esperado são recusados. Se não confirmar o status após a chamada, retorna falha explícita; não converte erro em sucesso.
- A resposta `capabilities` anuncia `pause_campaign` e `enable_campaign` somente quando o flag booleano estiver habilitado, a MCC estiver na allowlist e a API confirmar que o `customer_id` é uma conta cliente anunciante ativa vinculada àquela MCC. Sem flag, responde `campaign_writes_disabled`; em uma chamada direta para MCC não autorizada ou conta sem vínculo ativo, responde `campaign_account_not_allowed`. Escrita fica bloqueada por padrão e o limite é a hierarquia de cada MCC explicitamente permitida.
- Ativar campanha muda o status para ativo, mas não garante veiculação. Orçamento, políticas e outros requisitos do Google Ads continuam se aplicando.
- Erros, CORS, autenticação da conta de serviço, cabeçalhos sem cache e transporte Google reutilizam os auxiliares do `google-ads-readonly-service.php`.
- A pausa automática identifica explicitamente `notification_context: "automatic_negative_remaining"`; o serviço só enfileira o aviso quando a própria operação mudou o status e releu `PAUSED` com sucesso. A mensagem usa a configuração privada `tracking-email-config.php` e portanto o mesmo remetente/destinatário já configurados. Não inclui valor negativo, payout ou dado de comprador.
- O worker de e-mail existente processa a fila nova usando o SMTP, backoff e Cron já existentes. A entrega é assíncrona (a próxima execução do Cron, normalmente dentro de um minuto); não crie outro Cron nem altere a configuração SMTP.
- Se a inserção na fila falhar após a API confirmar a pausa, a pausa continua confirmada e o serviço informa `email_notification_status: "queue_failed"`; a resposta não finge que a mutação falhou. A tabela guarda a deduplicação e o estado de entrega; falhas SMTP são tentadas novamente pelo worker.

## Registro do deploy anterior — pausa automática e e-mail

Em 27/10/2026, o usuário informou que executou a migração SQL e publicou os três arquivos privados do fluxo de pausa automática/e-mail; também confirmou que pausar e ativar campanhas funcionam. Não repita a migração SQL, não recrie Cron e não reenvie os arquivos de e-mail para esta mudança. A tela local precisa transmitir `notification_context: "automatic_negative_remaining"` para que uma futura pausa automática confirmada enfileire o aviso. A entrega depende do Cron já existente; ainda não há confirmação de um evento real de pausa/e-mail.

# Inventário e rotas de ações de conversão por MCC

**Estado atualizado em 07/11/2026:** a consulta `conversion_actions` e a seleção local por MCC existem. O Hub também contém sincronização das rotas selecionadas para o serviço privado, onde a lista autorizada de MCCs é validada. As capturas fornecidas mostram as ações de e-com e Nutra selecionadas; o usuário confirmou que estão corretas. A implementação Data Manager/GuruMedia está no código local; não inspecionei nem confirmei o deploy atual na Hostinger.

**Limite:** consultar ações é somente leitura. O mapeamento é salvo no navegador e a sincronização envia configuração de rota ao serviço privado; nenhuma dessas operações cria/edita ações no Google Ads ou, por si só, envia conversões. O envio está em fluxo separado, com validação e controle por venda.

## Objetivo

O Hub consulta as ações existentes em cada MCC e permite associar uma ação ao contexto dessa MCC. A sincronização configura no serviço privado a rota MCC → ação aprovada para o emissor GuruMedia. A consulta/sincronização não cria/edita ações e não altera a integração da integração externa.

As telas fornecidas pelo usuário indicam estes nomes para a associação inicial:

| MCC | Ação mostrada na interface Google Ads | Valor que precisa ser lido pela API |
| --- | --- | --- |
| MCC e-com | `pixel MCC com meta` | ID e `resource_name` exatos, além do status e tipo |
| MCC Nutra | `Conversão compra off-line (upload)` | ID e `resource_name` exatos, além do status e tipo |

Os nomes servem para conferência visual; uma associação futura deve persistir o `resource_name` retornado pelo Google, não depender apenas do texto do nome. O formato oficial do recurso é `customers/{customer_id}/conversionActions/{conversion_action_id}`. O Google documenta consultas de inventário pelo recurso `conversion_action` usando `GoogleAdsService.SearchStream` ou Search. [Referência dos campos](https://developers.google.com/google-ads/api/fields/v26/conversion_action) · [Relatórios de ações de conversão](https://developers.google.com/google-ads/api/docs/conversions/reporting).

## Implementação no Tracking MVP e no Hub

O wrapper público `google-ads-readonly.php` encaminha operações autenticadas ao serviço privado. A operação `conversion_actions` é implementada em `tracking-mvp/tools/google-ads-readonly-service.php`. No Hub, `src/google-ads/google-ads-service.mjs` consulta a operação; a tela usa o resultado para oferecer a seleção por MCC, e o storage local mantém o `resource_name` escolhido neste navegador.

### Fontes e artefatos de referência

1. Serviço privado de consulta: `tracking-mvp/tools/google-ads-readonly-service.php`.
2. Cópia de deploy dessa época: `tracking-mvp/deploy/staging/google-ads-api-readonly/hostinger-private-tools/google-ads-readonly-service.php`.
3. Cliente Hub: `painel-operacao/src/google-ads/google-ads-service.mjs`.
4. Tela e persistência do mapeamento: `painel-operacao/src/tracking/tracking-global-settings-view.mjs` e `painel-operacao/src/tracking/tracking-gurumedia-conversion-actions-storage.mjs`.

O wrapper público, a chave JSON da conta de serviço, SQL, cron, `track.js`, Pre-Sells e configurações da integração externa não fazem parte do mapeamento local. As credenciais devem permanecer privadas no servidor.

### Contrato recomendado da operação

Pedido ao endpoint existente:

```json
{
  "operation": "conversion_actions",
  "manager_customer_id": "2231390435",
  "customer_id": "2231390435"
}
```

Os dois IDs devem ser strings numéricas de dez dígitos, sem hífens. Nas duas associações mostradas, as ações pertencem à MCC: o `customer_id` pesquisado é a MCC que contém a ação e `manager_customer_id` identifica o contexto de login. Se a consulta do recurso `customer` indicar outro `google_ads_conversion_customer`, a chamada deve usar esse customer como alvo e conservar a MCC apropriada em `login-customer-id`. O Google especifica que a chamada a um cliente através de uma MCC usa o cabeçalho `login-customer-id`; para conversões compartilhadas, a busca/gerência da ação usa o customer de conversão. [Autorização e cabeçalhos](https://developers.google.com/google-ads/api/rest/auth) · [Customer de conversão](https://developers.google.com/google-ads/api/docs/conversions/getting-started).

No proxy, não aceite GAQL fornecido pelo navegador. Monte uma consulta fixa, limitada ao recurso `conversion_action`, por exemplo:

```sql
SELECT
  conversion_action.id,
  conversion_action.resource_name,
  conversion_action.name,
  conversion_action.status,
  conversion_action.type,
  conversion_action.category,
  conversion_action.origin,
  conversion_action.owner_customer,
  conversion_action.primary_for_goal,
  conversion_action.include_in_conversions_metric,
  conversion_action.value_settings.default_currency_code
FROM conversion_action
WHERE conversion_action.status != 'REMOVED'
ORDER BY conversion_action.name
LIMIT 501
```

Definir limite máximo (por exemplo, 500 itens); se a consulta retornar mais do que o limite, responder erro explícito em vez de truncar silenciosamente. Não ocultar `HIDDEN`: retornar o status para o Hub exibir e impedir seleção quando não utilizável. O formato final de conversão JSON (camelCase da API para snake_case do contrato local) deve ser consistente com o resto do proxy.

Resposta recomendada:

```json
{
  "ok": true,
  "schema_version": 1,
  "manager_customer_id": "2231390435",
  "customer_id": "2231390435",
  "generated_at_utc": "2026-10-26T12:00:00Z",
  "actions": [
    {
      "id": "123456789",
      "resource_name": "customers/2231390435/conversionActions/123456789",
      "name": "pixel MCC com meta",
      "status": "ENABLED",
      "type": "UPLOAD_CLICKS",
      "category": "PURCHASE",
      "origin": "WEBSITE",
      "owner_customer": "customers/2231390435",
      "primary_for_goal": true,
      "include_in_conversions_metric": true,
      "default_currency_code": "USD"
    }
  ]
}
```

Retornar só os campos necessários à escolha e auditoria; não retornar dados de campanhas, pessoas, cliques, compradores ou credenciais. Validar `manager_customer_id`/`customer_id`, rejeitar campos extras, não aceitar parâmetros de data e manter a autenticação/CORS do endpoint. Um `403` deve continuar distinguindo falha de acesso de lista vazia; jamais converter erro em lista vazia.

## Registro de publicação

O usuário informou que publicou os arquivos e suas capturas mostram o Hub carregando o inventário. A pasta de origem histórica do serviço privado foi:

`/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Essa localização é referência de histórico, não uma instrução para novo deploy. A seleção visível no Hub é evidência de que o fluxo de consulta funcionou no momento da captura; não é inspeção direta do arquivo PHP atual no servidor.

## O que esta implementação não faz

O Hub mostra a ação selecionada por MCC e usa o `resource_name` como identificador estável, com rótulos para conferência. A tela não altera metas/campanhas no Google Ads e não envia uma venda ao escolher ou sincronizar uma ação.

O serviço privado local já contém um emissor Data Manager separado: valida elegibilidade, faz `validateOnly`, permite envio manual e controla uma fila idempotente; a opção automática começa desligada. Em 07/11/2026, uma validação autorizada da venda real foi bloqueada pelo código local antes da chamada Google porque exigia apenas um tipo de identificador. A correção local agora admite os IDs capturados em combinação, conforme a orientação do Google, e aguarda publicação do único PHP alterado. A seleção do catálogo não autoriza uma venda. Não se deve duplicar envio da integração externa/nativo para a mesma ação; `sub6` sozinho não fornece GCLID/GBRAID/WBRAID. A operação em produção só fica confirmada após nova validação sem envio e diagnóstico aceito depois de um envio real autorizado.

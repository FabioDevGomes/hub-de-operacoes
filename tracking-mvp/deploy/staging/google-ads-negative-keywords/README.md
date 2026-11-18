# Google Ads product negative keywords — pacote de staging

Este pacote prepara a coluna **Avaliação IA** e a ação manual **Negativar** da tela **Integrações → Termos de Pesquisa**. A análise por IA acontece fora do Hub: o Hub copia um contrato JSON com os dados da consulta e importa a resposta colada, sem chamar modelo ou API de IA.

A ação de negativas abre com escopo restrito à campanha que originou a linha da consulta de termos. A tela mostra o nome dessa campanha e os últimos quatro dígitos da conta como seleção padrão. O operador pode marcar **Incluir todas as campanhas Search ativas do produto nesta MCC** antes de gerar a prévia; essa opção inclui somente campanhas Search com status `ENABLED` do mesmo produto em todas as contas ativas da MCC permitida. Campanhas pausadas são excluídas tanto da prévia quanto da aplicação. O operador escolhe ampla, frase ou exata, confere a conta/campanha/status/resultado e confirma explicitamente o escopo mostrado. O serviço faz nova leitura no mesmo escopo antes de gravar, rejeita prévia alterada, não muda status de campanha e relê os critérios após cada mutação. Resposta sem confirmação não é repetida automaticamente.

## Arquivo do pacote

**Destino privado:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)

Arquivo de origem: `tools/google-ads-campaign-action-service.php`

Se e quando for publicar, substitua somente `google-ads-campaign-action-service.php` no diretório privado. Preserve o wrapper público, configuração privada, credenciais e os serviços compartilhados já instalados. Este pacote local ainda não foi enviado ao servidor.

## Ativação protegida

A prévia e a escrita de negativas só ficam disponíveis quando todas estas condições estiverem satisfeitas no `tracking-config.php` privado:

```php
// Preserve a allowlist de MCCs já configurada e habilite o flag geral de gravação existente.
// A nova capacidade permanece desligada por padrão:
// 'tracking_google_ads_negative_keywords_enabled' => true,
```

Não habilite o novo flag até revisar e publicar o serviço e conferir a conta/MCC autorizada. `tracking_google_ads_campaign_writes_enabled` e `tracking_google_ads_campaign_write_manager_customer_ids` continuam obrigatórios. A flag nova não habilita criação, pausa ou ativação de campanhas.

## Contrato privado acrescentado

Endpoint existente: `google-ads-campaign-action.php`.

- `preview_product_negative_keyword`: recebe `manager_customer_id`, `source_customer_id`, `source_campaign_id`, `source_campaign_name`, `term`, `match_type`, `scope` (`SOURCE_CAMPAIGN` ou `PRODUCT`) e `operation`. O escopo `SOURCE_CAMPAIGN` é o padrão da tela e consulta somente a campanha de origem; `PRODUCT` consulta as campanhas do produto na MCC. Retorna `schema_version: 2`, o escopo, produto, campanha, status e `already_present` por campanha; não grava.
- `apply_product_negative_keyword`: recebe os mesmos campos, `scope`, `expected_campaigns` copiados da prévia e `confirm: true`. O serviço busca novamente o mesmo escopo e somente prossegue se todos os itens (inclusive status e negativas existentes) ainda coincidirem. Retorna `schema_version: 2`, escopo, contagens e resultados por campanha: `created_verified`, `already_present`, `write_unverified` ou `failed`.

Limites: até 100 campanhas no escopo `PRODUCT`, até 80 caracteres e 10 palavras por termo. O serviço falha sem escrita se não puder completar a leitura necessária. O contrato agora exige `scope`; publique o PHP atualizado antes de usar esta versão da tela.

## Verificação após eventual deploy

1. Confirme que somente o PHP indicado foi substituído e que permanece fora de `public_html`.
2. Mantenha `tracking_google_ads_negative_keywords_enabled` desligado e valide primeiro que outras operações existentes do endpoint continuam funcionando.
3. Revise a allowlist da MCC e habilite o novo flag somente quando decidir liberar a operação.
4. Em **Termos de Pesquisa**, pré-visualize uma negativa de teste e confira a lista completa antes de confirmar. Confira o resultado de cada campanha na API/Google Ads; jamais repita uma operação marcada como **sem confirmação** sem uma nova leitura da plataforma.

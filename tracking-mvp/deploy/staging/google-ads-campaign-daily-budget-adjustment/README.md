# Ajuste de orçamento diário no Diário de campanha

Pacote incremental para habilitar os botões **Orçamento +5%** e **Orçamento −5%** na tela local do Diário de campanha. O clique aplica a alteração real imediatamente na Google Ads API; a tela mostra a média diária atual e o valor previsto antes da ação.

## Arquivo e destino

| Arquivo local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-campaign-action-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php` |

### Arquivo agrupado pelo destino

**Destino no servidor — Private Tools:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do serviço:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-daily-budget-adjustment\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)

Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

## Publicação manual

1. Faça um backup privado do endpoint atual e confirme que a cópia está completa.
2. Envie somente o arquivo indicado para `private-tools`, substituindo o endpoint existente.
3. Não execute SQL, não envie wrapper público e não altere configuração, credenciais, Cron ou flags.
4. Atualize também o Hub local para a versão que contém os botões. A mudança local sozinha não habilita o endpoint remoto.

O endpoint reutiliza a flag e a allowlist de MCC existentes. Não há configuração ou migração nova. O controle só permite campanhas `ENABLED`/`PAUSED` com orçamento `DAILY`, explicitamente não compartilhado e referenciado por uma única campanha. Antes de atualizar, o serviço confirma o vínculo MCC/conta e relê moeda, campanha, status, recurso, período, valor e referência do orçamento. A operação altera apenas `amount_micros` do orçamento existente, faz uma nova leitura e responde sucesso somente se confirmar o valor esperado. Configuração incerta, compartilhada, defasada ou não diária é recusada.

## Observação sobre gasto

O orçamento diário do Google Ads é uma média, não um limite fixo para cada dia. A plataforma pode gastar até duas vezes a média diária em um dia, respeitando em geral o limite mensal de 30,4 vezes o orçamento diário. Mudanças de orçamento podem afetar o ritmo de entrega e overdelivery. Consulte a [visão geral de orçamentos](https://developers.google.com/google-ads/api/docs/campaigns/budgets/overview) e a orientação de [atribuição/alteração de orçamentos existentes](https://developers.google.com/google-ads/api/docs/campaigns/budgets/assign-budgets).

Estado deste pacote: arquivos locais, ainda não publicados. Não valide a publicação clicando num botão de ajuste a menos que queira aplicar aquela mudança ao orçamento real da campanha.

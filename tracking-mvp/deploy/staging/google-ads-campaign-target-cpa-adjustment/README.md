# Ajuste direto de CPA desejado por campanha

Pacote incremental para permitir ao Hub aumentar ou diminuir o CPA direto de uma campanha Search pela Google Ads API. Cada clique aplica 2 pontos percentuais da comissão total, convertida para a moeda da conta, e altera somente o alvo direto da estratégia.

## Arquivo e destino

| Arquivo local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-campaign-action-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php` |

### Arquivo agrupado pelo destino

**Destino no servidor — Private Tools:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do serviço:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-target-cpa-adjustment\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)

Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

## Publicação

1. Faça backup privado do endpoint atual antes de substituí-lo.
2. Envie somente o arquivo indicado para `private-tools`.
3. Não reaplique SQL, não envie wrapper público e não altere `tracking-config.php`.

O backend usa a configuração de escrita já existente (`tracking_google_ads_campaign_writes_enabled` e a allowlist de MCCs). Não há flag, permissão ou migração SQL nova neste pacote. A publicação ainda depende do Hub local atualizado para exibir os botões.

## Salvaguardas

- Cada clique exige confirmação explícita no próprio botão e revalida no servidor o vínculo ativo à MCC permitida.
- Só aceita campanha Search `ENABLED` ou `PAUSED`, com estratégia direta `TARGET_CPA` ou `MAXIMIZE_CONVERSIONS`, sem estratégia de portfólio e com alvo configurado.
- O servidor relê a moeda da conta, a campanha e o CPA atual, confere a comissão declarada no nome da campanha e falha se o retrato local estiver desatualizado.
- Converte a comissão entre USD e BRL usando a taxa enviada pelo Hub; outras moedas ficam fora.
- Atualiza somente `target_cpa.target_cpa_micros` ou `maximize_conversions.target_cpa_micros`, conforme a estratégia; relê o alvo após a mutação.
- Em condições normais, cada clique faz cinco chamadas Google Ads: valida vínculo, lê moeda e campanha, muta o alvo e relê a campanha. Não há consulta automática ao abrir a tela.
- A alteração local não modifica campanhas do Google Ads. Estado do pacote: local, ainda não publicado.


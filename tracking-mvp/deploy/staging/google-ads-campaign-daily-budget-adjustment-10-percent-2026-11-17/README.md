# Ajuste de orçamento diário em 10%

Pacote incremental para habilitar os controles de aumento e redução de 10% no Diário de campanha. Mantém compatibilidade com os controles existentes de 5%: chamadas antigas ou sem percentual continuam sendo interpretadas como 5%.

## Pré-requisito

O usuário confirmou que a implantação anterior de confirmação após divergência de orçamento já foi publicada. Este pacote estende esse endpoint para aceitar `percentage: 10`; os controles de 10% do Hub dependem da publicação deste pacote. Até essa publicação, os controles de 5% continuam compatíveis com o endpoint anterior.

## Arquivo e destino

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Envie somente:

- `hostinger-private-tools/google-ads-campaign-action-service.php` → `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

## Procedimento manual

1. Faça backup privado do endpoint atual.
2. Substitua somente `google-ads-campaign-action-service.php` pelo arquivo preparado neste pacote.
3. Não publique wrapper, SQL, credenciais ou configuração. Nenhuma alteração de banco é necessária.
4. Depois da publicação, use o Hub local atualizado para testar os controles de 10% em uma campanha elegível.

O endpoint valida o percentual como inteiro `5` ou `10`, mantém validações de MCC, campanha, moeda, status, orçamento diário exclusivo e `reference_count = 1`, relê o estado antes da mutação e confirma o valor final após alterar somente `campaign_budget.amount_micros`.

Estado: pacote local preparado; publicação manual futura pelo usuário.

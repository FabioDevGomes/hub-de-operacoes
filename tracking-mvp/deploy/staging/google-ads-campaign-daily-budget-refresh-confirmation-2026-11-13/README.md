# Confirmação após divergência do orçamento diário

Atualização incremental do endpoint de ações privadas do Google Ads. Quando o orçamento atual lido do Google Ads divergir do valor enviado pela tela, o endpoint devolve o orçamento atual, sem executar mutação. O Hub recalcula a prévia e exige um segundo clique explícito; nessa chamada, o endpoint relê e compara tudo novamente antes de alterar o valor.

## Arquivo e destino

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local pronta para upload:

`C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-daily-budget-refresh-confirmation-2026-11-13\hostinger-private-tools`

Envie somente:

- `google-ads-campaign-action-service.php` → `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

## Procedimento manual

1. Faça um backup privado do endpoint atual.
2. Substitua somente o arquivo acima pelo arquivo preparado neste pacote.
3. Não publique wrapper, SQL, credenciais ou configuração; nenhuma flag nova é necessária.
4. A publicação ainda é manual. Este pacote local não confirma que o servidor foi atualizado.

O endpoint continua validando MCC permitida, campanha, moeda, status, orçamento diário exclusivo e `reference_count = 1`. Uma leitura sem correspondência nunca altera orçamento. Após a confirmação explícita do usuário, a API ainda relê o estado antes da mutação e verifica o valor final.

Estado: o usuário confirmou em 17/11/2026 que esta implantação anterior foi publicada. O servidor não foi consultado diretamente nesta sessão.

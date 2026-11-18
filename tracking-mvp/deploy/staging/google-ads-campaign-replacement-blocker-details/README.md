# Google Ads — detalha os bloqueios da prévia da variante B

Pacote incremental para a substituição **Pausar e duplicar como B**. O Hub local precisa estar na versão **1.321.3** para apresentar a lista de motivos.

Este pacote corrige a localização do tratamento da lista de bloqueios. Se você publicou o arquivo fornecido anteriormente nesta conversa, substitua-o novamente pelo arquivo abaixo.

## Arquivo para publicação

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-blocker-details\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-duplication-service.php](hostinger-private-tools/google-ads-campaign-duplication-service.php)  
Arquivo de destino: `google-ads-campaign-duplication-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-duplication-service.php`

Faça backup do arquivo atual no servidor e substitua somente esse arquivo. Não envie o README, a pasta inteira, configuração ou credenciais. Não há SQL nem alteração de configuração.

## O que muda

A prévia usa a mesma conta da campanha original como origem e destino. Quando encontra bloqueios locais de compatibilidade, o serviço passa a retornar os motivos sanitizados em vez de apenas o erro genérico `campaign_duplication_unsupported`. O Hub apresenta esses motivos e identifica explicitamente que a variante seria criada na mesma conta.

Uma prévia bloqueada não cria plano, não executa `validateOnly` de mutação e não altera campanhas. Os bloqueios continuam ativos; este pacote melhora o diagnóstico e não força a cópia de recursos ainda não suportados.

## Conferência após o envio

1. Faça backup e substitua somente o arquivo listado acima.
2. Confirme que o Hub local mostra **v1.321.3** e recarregue a tela.
3. Na ficha da campanha, clique em **Pausar e duplicar como B**. Se a prévia ainda bloquear, leia e compartilhe os motivos exibidos; pare nessa etapa.

O arquivo está local; não foi enviado nem validado no servidor. Nenhuma ação de campanha foi executada durante a preparação.

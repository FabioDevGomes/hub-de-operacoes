# Texto do e-mail da pausa por campanha de referência

Pacote incremental para corrigir a descrição do motivo `minimum_product_performance`. A regra agora escolhe uma concorrente pelo teto absoluto configurado de impressões; ela não exige que a concorrente tenha menos impressões que a referência. O e-mail passa a dizer “concorrente elegível pelo teto absoluto de impressões configurado”.

O contexto enviado pelo Hub, a validação do serviço, o registro do motivo e o fluxo de e-mail permanecem iguais.

## Arquivo para publicação

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-minimum-product-performance-pause-email-wording\hostinger-private-tools
```

1. [google-ads-campaign-pause-email-service.php](hostinger-private-tools/google-ads-campaign-pause-email-service.php) — substitui o helper privado para mostrar o motivo atualizado.

Faça backup do arquivo atual e substitua somente esse PHP. Não exige SQL nem mudanças em credenciais, configurações, endpoint público, serviço de ações, cron ou SMTP. O pacote está apenas local; nada foi enviado nem validado no servidor.

## Verificação após publicação

Uma pausa futura por `minimum_product_performance` deve exibir o motivo atualizado. Não pause uma campanha real apenas para testar o texto.

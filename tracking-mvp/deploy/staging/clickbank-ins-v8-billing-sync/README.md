# ClickBank INS v8 — atualização para Faturamento local

Este pacote incremental prepara o endpoint de vendas para a Fase 2. Ele passa a retornar comissão, moeda e horário de recebimento nas páginas do INS v8 (schema 2). O serviço continua somente leitura e não envia conversões ao Google Ads.

Não execute SQL. A tabela já contém `commission_total`, `commission_currency` e `received_at_utc`. Não substitua o receptor, os wrappers públicos, `tracking-config.php` ou outros serviços.

## **Pasta privada**

Pasta do servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/`.

Arquivo a substituir: `clickbank-ins-v8-sales-api-service.php`.

Pasta local que contém somente o arquivo para subir:
```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\clickbank-ins-v8-billing-sync\hostinger-private-tools\
```

Faça backup do arquivo de mesmo nome e envie somente esse arquivo para a pasta privada indicada. A pasta pública não deve receber este serviço.

Após a publicação, **Tracking ClickBank → Atualizar vendas e checkouts** também alimentará o Faturamento local deste navegador. Nenhuma venda será enviada automaticamente ao Google Ads. Até a Fase 3, uma venda individual pode coexistir com um agregado MCC.
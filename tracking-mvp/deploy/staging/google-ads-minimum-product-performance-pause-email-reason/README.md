# Motivo de e-mail da regra por campanha de referência

Pacote incremental para reconhecer o novo motivo de pausa automática `minimum_product_performance` no helper privado de e-mail. O aviso informa que a campanha concorrente tinha poucas impressões diante da referência do mesmo produto.

O Hub local envia o contexto `automatic_minimum_product_performance`; o helper grava `minimum_product_performance` na coluna `pause_reason` existente e traduz o texto do e-mail. A coluna já pertence à implantação anterior de motivos de e-mail.

## Arquivo para publicação

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-minimum-product-performance-pause-email-reason\hostinger-private-tools
```

1. [google-ads-campaign-pause-email-service.php](hostinger-private-tools/google-ads-campaign-pause-email-service.php) — substitui o helper privado para aceitar e descrever o novo motivo.

Faça backup do arquivo existente e substitua somente esse arquivo. Não é necessário executar SQL nem publicar o serviço de ações, wrapper público, worker de e-mail, `tracking-config.php` ou configurações SMTP. O remetente, destinatário, Cron e fluxo de entrega permanecem iguais.

**Publique este helper antes de ativar a nova regra no Hub.** O endpoint de ações já instalado valida o contexto da notificação por meio deste helper; até a atualização, ele não reconhecerá `automatic_minimum_product_performance` e rejeitará a solicitação de pausa.

## Hub local

O Hub também precisa da atualização local que envia o contexto novo. Atualize os arquivos em `dist` gerados no repositório do Hub e recarregue a página. A publicação deste PHP no servidor não atualiza o Hub local.

## Verificação

O PHP foi copiado do helper-fonte do Tracking MVP. Depois do deploy, uma futura pausa confirmada por esta regra deverá aparecer na fila com `pause_reason = minimum_product_performance`; confira o motivo no e-mail recebido. Não pause campanha real apenas para validar o deploy.

Este pacote está apenas local; nada foi enviado nem validado no servidor.

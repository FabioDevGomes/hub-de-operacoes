# Motivo do e-mail da regra de referência e concorrente

Pacote incremental para a regra substituta da pausa automática por campanha de referência e concorrente. O Hub envia o contexto `automatic_reference_competitor`; o serviço privado grava `reference_competitor` na fila e exibe o motivo “concorrente elegível mais próxima em impressões da campanha de referência”.

## Arquivo para publicação

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-reference-competitor-pause-email-reason\hostinger-private-tools
```

1. [google-ads-campaign-pause-email-service.php](hostinger-private-tools/google-ads-campaign-pause-email-service.php) — aceita o novo contexto, guarda o motivo e monta o texto correto do e-mail.

Faça backup do helper atual e substitua somente esse arquivo. Não exige SQL nem mudança no endpoint público, serviço de ações, worker, Cron, SMTP ou credenciais. Publique este arquivo antes de ativar a nova regra no Hub; o helper atual ainda não reconhece o novo contexto.

O pacote está apenas local. Nenhum arquivo foi enviado ou validado no servidor.

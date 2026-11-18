# Correção da simulação da fila de pausas automáticas

**Estado:** atualização local, ainda não enviada à Hostinger. Corrige a inserção do job de simulação no PDO MySQL.

A inserção agora usa marcadores PDO distintos para `available_at_utc` e `cancel_until_utc`, mantendo ambos com o mesmo horário atual. Isso evita a reutilização de um placeholder nomeado com prepared statements nativos.

## Arquivo para a Hostinger

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-auto-pause-server-simulation-fix-2026-11-16\hostinger-private-tools
```

Arquivo: `google-ads-auto-pause-service.php` — substitui somente `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php`.

Faça backup do PHP atual antes de substituir.

## Sem mudanças adicionais

- Não execute SQL.
- Não altere o worker nem o Cron.
- Mantenha o Cron sem `--execute`.
- A simulação permanece protegida: o worker marca `queue_simulation` como `simulation_processed` antes de qualquer chamada à API do Google Ads.

## Validar após publicar

No Hub local, clique **Enviar simulação**. A resposta deve deixar de mostrar `server_error` e indicar que o teste foi enviado. Na rodada seguinte do Cron, a interface deve mostrar que a simulação foi processada pelo worker, sem campanha consultada ou pausada.

**Estado:** pacote local, não enviado nem validado na Hostinger.

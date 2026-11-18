# Pausas automáticas — atraso adicional configurável

**Estado:** pacote local, ainda não enviado ao servidor. O Cron permanece em prévia, sem `--execute`.

Esta entrega permite configurar no Hub o atraso adicional entre a captura D0 e a disponibilidade dos jobs para o worker. O Hub sincroniza `additionalDelayMinutes` junto com a política. O servidor calcula `available_at_utc` como `completed_at_utc + snapshotIntervalMinutes + additionalDelayMinutes`. O padrão no Hub é 15 minutos; são aceitos valores inteiros de 0 a 1440 minutos. Exemplo: captura a cada 60 minutos e atraso adicional de 15 minutos deixam o job disponível após 75 minutos.

Para manter compatibilidade durante a atualização, políticas enviadas por uma versão anterior do Hub que ainda não contenha esse campo são interpretadas com o padrão de 15 minutos.

## Arquivo para a Hostinger

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-auto-pause-server-delay-config-2026-11-16\hostinger-private-tools
```

Arquivo: `google-ads-auto-pause-service.php` — destino `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php`.

## Publicação e ativação

1. Faça backup do PHP atual no destino indicado.
2. Envie somente `google-ads-auto-pause-service.php` para substituir o arquivo correspondente.
3. Não execute SQL. Não altere o worker nem o Cron; mantenha o Cron sem `--execute` durante a validação.
4. O código do Hub foi compilado localmente em `painel-operacao/dist`; não é um arquivo de upload para a Hostinger. Atualize/abra a versão local do Hub que contém esse build.
5. No Hub, abra **Pausas automáticas**, defina os minutos adicionais e clique em **Aplicar atraso**. O Hub salvará o valor localmente e tentará sincronizar a política; a mensagem do campo informa se o servidor confirmou a sincronização.
6. Confirme que a fila informa o horário de disponibilidade esperado. O Cron continua apenas em prévia e não pausa campanhas.

Este pacote contém apenas o PHP preparado. A publicação não foi feita pelo Codex e só deve ser considerada concluída depois do upload e da confirmação no Hub.

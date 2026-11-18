# Pausas automáticas no servidor — worker CLI

**Estado:** pacote local, ainda não enviado. Pré-requisito: conforme informado pelo usuário, o endpoint e a tabela do pacote `google-ads-auto-pause-server-pilot` já foram publicados e o SQL já foi executado. Essa confirmação não foi verificada diretamente no Hostinger.

## Arquivos desta atualização

| Arquivo local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php` |
| `hostinger-private-tools/google-ads-auto-pause-worker.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-worker.php` |

O serviço substitui a versão publicada do endpoint e invalida pedidos ainda pendentes quando a revisão dos critérios muda. O worker é CLI-only; uma chamada HTTP responde 404. Ele reutiliza os serviços existentes de Google Ads e e-mail, as credenciais atuais e as três tabelas já criadas. **Não há SQL novo.**

## Proteções de execução

- Usa uma trava MySQL nomeada para evitar duas instâncias concorrentes.
- Processa até 5 itens por rodada e só tenta executar após `available_at_utc` e o fim de `cancel_until_utc`.
- Se já houver uma captura completa mais recente que a captura que criou o pedido, exige que ela confirme a mesma campanha, produto e regra ainda elegíveis. Se ainda não chegou outra captura, o worker pode seguir com o pedido já enfileirado depois dos prazos configurados, inclusive com o Hub fechado.
- Lê novamente os critérios vigentes; itens pendentes são invalidados quando a política é alterada.
- Reutiliza a verificação existente de escrita habilitada, MCC permitido, conta filha ativa, estado `ENABLED`, mutação limitada a `status` e confirmação final `PAUSED`.
- Só enfileira o e-mail depois de uma transição confirmada. Falhas temporárias retornam à fila com intervalo de nova tentativa de 5 minutos; falhas permanentes são encerradas como ignoradas/falhadas.
- Uma execução sem argumentos é somente prévia: confere configuração e elegibilidade dos itens vencidos, mas não chama a API do Google Ads nem pausa. `--execute` habilita a execução real.

O worker não acessa a API do Google Ads quando não há itens vencidos. Cada campanha executada exige a validação atual da conta e a leitura/mutação/verificação de status. O lote pequeno limita a quantidade de chamadas por rodada.

## Publicação manual

1. Faça backup privado do `google-ads-auto-pause-service.php` atual.
2. Envie os dois arquivos desta atualização para o mesmo diretório `private-tools`, preservando os nomes. Não reenvie o endpoint público, não execute SQL e não altere o Cron existente.
3. Antes de ativar o agendamento, cadastre uma tarefa Cron temporária de prévia com:

```text
/usr/bin/php /home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-worker.php
```

Confira a saída (itens “prontos” ou “que seriam ignorados”) e remova essa tarefa temporária. Ela não deve chamar a API do Google Ads nem pausar campanhas.

4. Cadastre uma **nova** tarefa Cron, sem substituir a existente, para executar a cada 5 minutos:

```text
/usr/bin/php /home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-worker.php --execute
```

O intervalo de 5 minutos só determina quando a fila vencida será processada; a regra continua aguardando `intervalo do snapshot + 15 minutos` e a janela de cancelamento configurada no Hub.

## Dependências e limites conhecidos

- O worker precisa encontrar `tracking-config.php`, `google-ads-credentials/service-account.json` e os serviços já publicados no diretório privado atual.
- O Hub só envia candidatas sem venda registrada no Diário naquele momento. Se uma avaliação completa posterior for enviada antes da execução, ela também precisa manter a candidata; caso contrário, o pedido antigo é ignorado. O worker não lê diretamente a base local do navegador.
- A publicação do Hub local é independente desta entrega. A política e as avaliações precisam estar sincronizadas pelo Hub, conforme a versão que já foi preparada localmente.

## Reversão

Para parar a execução, desative/remova somente a nova tarefa Cron. Para restaurar o endpoint, recoloque o backup privado do serviço. Os dados das tabelas permanecem; não remova nem limpe a migração.

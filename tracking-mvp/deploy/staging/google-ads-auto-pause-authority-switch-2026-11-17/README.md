# Chave de autoridade das pausas automáticas

**Estado:** pacote local, ainda não enviado à Hostinger. A autoridade inicial continua no Hub. O corte para o servidor permanece bloqueado enquanto as avaliações snapshot estiverem em modo sombra, sem criação de jobs.

## O que muda

- Uma linha central no banco registra `hub` ou `server`; a migração cria essa linha com `hub`.
- O worker só pode reivindicar jobs reais quando a autoridade for `server`. A simulação sem campanha continua disponível nos dois modos.
- Antes de executar uma pausa local, o Hub adquire um lease curto e o renova antes de cada mutação. Enquanto houver lease ativo, o servidor não pode assumir.
- A mudança de autoridade é atômica e bloqueia jobs pendentes/em processamento. O retorno ao Hub também exige fila real sem itens ativos.
- O Hub continua capturando e enviando snapshots em qualquer modo.
- A API não permite ativar `server` até a última avaliação informar modo `server`, zero regras bloqueadas e fila sem jobs ativos. Hoje a avaliação indica `shadow`, então a solicitação será recusada e a autoridade ficará `hub`.
- Falha de conexão, ausência da migração ou resposta inválida bloqueia a pausa local; o Hub não presume que ainda é o executor autorizado.

## Arquivos para publicação

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Envie nesta ordem, substituindo somente estes arquivos:

1. `hostinger-private-tools/google-ads-auto-pause-worker.php` — instala a trava no worker antes de inicializar a tabela de autoridade.
2. Execute a migração `database/google-ads-auto-pause-authority.sql` no banco `u572283517_track`. Ela cria a autoridade padrão `hub`; é idempotente e não altera tabelas existentes.
3. `hostinger-private-tools/google-ads-auto-pause-service.php` — adiciona leitura/troca da autoridade e leases autenticados.

Não altere wrapper público, Cron, tokens, `tracking-config.php` ou outras configurações. Faça backup privado dos dois PHPs e do banco antes da publicação/migração. Se a tabela não puder ser criada, não publique/ative a nova versão do Hub; o worker novo falha fechado sem executar campanhas.

## Atualização do Hub local

Depois de publicar os dois PHPs e confirmar a migração, atualize o Hub local para v1.374.0. O Hub agora exige confirmação do endpoint para executar pausas locais. Antes dessa ordem, a nova versão local interrompe pausas quando não consegue confirmar a autoridade — comportamento intencional para evitar execução duplicada.

## Conferência

1. Com o Cron em prévia, consulte o preflight no Hub. Deve retornar autoridade `hub`, `ready=false`, `transfer_supported=false` e o bloqueio `snapshot_evaluator_does_not_create_jobs`.
2. A simulação deve continuar sendo processada sem consultar ou pausar campanhas.
3. O clique em **Trocar autoridade das pausas** não deve ativar o servidor enquanto essa condição permanecer. Deve manter `hub` e informar o bloqueio.
4. Confirme no banco que `google_ads_auto_pause_authority.authority='hub'`.
5. Não use `--execute` nem tente uma pausa real nesta etapa.

## Estado da publicação

Os três artefatos estão somente locais. Nenhum arquivo foi enviado, nenhuma migração foi executada e a autoridade do servidor não foi alterada.

# Preflight do corte de pausas para o servidor

**Estado:** código local preparado; ainda não enviado à Hostinger. O botão no Hub consulta o bloqueio atual e não transfere jobs nem altera quem executa pausas.

## Arquivos e destino

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Envie somente:

- `hostinger-private-tools/google-ads-auto-pause-service.php` → substituir `google-ads-auto-pause-service.php`.

Não há SQL nesta etapa. O endpoint usa as tabelas de snapshots, avaliações e jobs instaladas nas fases anteriores. Não altere o worker, wrapper público, Cron, credenciais ou configuração privada.

## Comportamento

O novo comando autenticado `cutover_preflight` é somente leitura. Retorna autoridade atual (`hub`), última avaliação shadow, contagens de jobs pendentes/em processamento/aplicados/falhos e bloqueios. A resposta é explicitamente `ready=false` e `transfer_supported=false`; inclui o bloqueio `snapshot_evaluator_does_not_create_jobs`. Se ainda não houver avaliação, também informa esse estado. Jobs em processamento adicionam outro bloqueio.

O botão **Transferir pausas automáticas para o servidor** consulta essa resposta e mostra os bloqueios no modal. Apesar do rótulo solicitado, nesta entrega o clique não transfere, não cria nem cancela jobs, não muda autoridade e não chama a API do Google Ads. O Hub continua responsável pelas pausas locais. A migração executável depende de outra etapa que fará o avaliador criar jobs e implementará handoff idempotente.

## Ordem

1. Faça backup privado do PHP atual.
2. Envie o arquivo acima, substituindo somente esse serviço.
3. Atualize o Hub local para a versão desta entrega.
4. Abra o modal de pausas automáticas e clique no botão; a tela deve reportar que não transferiu e explicar que o avaliador shadow ainda não cria jobs.

Não execute SQL nem altere Cron/configuração. O deploy fica pendente até o usuário enviar o arquivo; o código local não prova publicação.

# Corte temporal da autoridade de pausas automáticas

**Estado:** pacote local preparado; ainda não publicado. Nenhuma migração foi executada nesta etapa. O código local e este pacote preservam a autoridade existente, que permanece `hub` até uma transferência aprovada e pronta.

## O que muda

- A transferência para `server` continua bloqueada se não houver avaliação, se a avaliação mais recente estiver em `shadow`, se houver regras bloqueadas, job em processamento ou lease ativo do Hub.
- Jobs reais pendentes vinculados a snapshots recebidos antes do corte são atualizados na mesma transação que muda a autoridade: `state='skipped'`, `result_code='pre_cutover_superseded'`. As linhas permanecem no histórico.
- O instante UTC do corte é persistido em `google_ads_auto_pause_authority.server_started_at_utc`.
- O worker só pode reivindicar jobs reais cujo snapshot tenha sido recebido no servidor no instante do corte ou depois. Jobs antigos que apareçam após a transação também são encerrados como `skipped`.
- Uma tentativa bloqueada não muda autoridade nem jobs. O retorno ao Hub mantém o bloqueio atual para fila pendente/em processamento.
- A etapa de transferência não pausa campanhas por si. Uma pausa continua dependendo de avaliação pronta, job elegível, atraso/prazo e configuração de execução existentes.
- Captura e envio de snapshots pelo Hub continuam ativos.

## Arquivos para publicação

Destino no servidor: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Envie nesta ordem, substituindo somente os dois arquivos listados:

1. `hostinger-private-tools/google-ads-auto-pause-worker.php` — inclui o filtro temporal e preserva o processamento seguro da simulação.
2. Execute `database/google-ads-auto-pause-cutover-watermark.sql` no banco `u572283517_track`. A migração apenas acrescenta uma coluna nullable e é idempotente.
3. `hostinger-private-tools/google-ads-auto-pause-service.php` — atualiza o preflight e o corte atômico.

Não altere wrapper público, Cron, tokens nem `tracking-config.php`. Faça backup dos dois PHPs privados e do banco antes da publicação/migração. Se o SQL falhar, interrompa a publicação dos PHPs novos; o worker antigo deve continuar em uso. O novo worker precisa da coluna criada antes de ser instalado.

## Atualização do Hub local

Depois de publicar os dois PHPs e confirmar a migração, atualize o Hub local para v1.375.0. A nova interface pede confirmação explícita quando há jobs pendentes e informa que serão encerrados no histórico se a troca for concluída.

## Conferência

1. Antes da transferência, consulte o preflight: enquanto a avaliação estiver em `shadow` ou houver regras bloqueadas, deve continuar `authority=hub`, `ready=false` e sem mudança na fila.
2. Quando houver prontidão, a transferência com pendências deve pedir confirmação. Cancelar não envia a operação de troca.
3. Ao concluir a transferência, confira que o endpoint reportou `superseded_pending_count`, a autoridade passou para `server`, e `server_started_at_utc` foi gravado.
4. Os jobs encerrados devem permanecer no histórico com `state='skipped'` e `result_code='pre_cutover_superseded'`.
5. Uma simulação continua segura. Nenhuma tentativa de pausa real deve ser usada para validar este deploy.

## Estado da publicação

Os artefatos estão somente locais. Nenhum arquivo foi enviado, nenhuma migração foi executada e nenhuma autoridade foi alterada nesta etapa.

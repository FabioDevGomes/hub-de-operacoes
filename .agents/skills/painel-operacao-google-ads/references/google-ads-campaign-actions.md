# Google Ads: ações de campanha e aviso de pausa automática

Use esta referência ao alterar ou diagnosticar a pausa automática, ações manuais de status ou os avisos de e-mail associados. A documentação operacional do servidor e a lista exata de deploy ficam no [README Google Ads Campaign Actions](../../../../../../voc-meu-analista-de-dados-e/tracking-mvp/deploy/staging/google-ads-campaign-actions/README.md); o comportamento da Visão Geral está em [docs/maintenance.md](../../../../docs/maintenance.md#google-ads--pausa-automática-por-saldo-negativo).

## Comportamento e limites

- Após uma pausa automática confirmada, se a última leitura ainda disser `ENABLED` e for anterior à confirmação, a Visão Geral mostra **Aguardando nova leitura da API** sob o status. É um aviso de defasagem do retrato exibido, não uma indicação de que a pausa falhou; uma captura posterior atualiza a situação.
- A regra automática é uma preferência local do perfil do navegador. Ela só executa enquanto o Hub está aberto na Visão Geral e ocorre uma atualização completa de dados que aciona a avaliação. Não é um job de servidor e não continua avaliando campanhas com o Hub fechado.
- Uma candidata precisa ter `valor restante < 0`, status `ENABLED` na observação disponível e vínculo MCC/conta/campanha seguro. Em cada execução, o Hub consulta permissões e configuração uma vez por par MCC/conta e reutiliza preflights bem-sucedidos para as campanhas daquela conta; falhas não são mantidas em cache. A configuração compartilhada só reduz leituras repetidas: o serviço privado revalida o vínculo e relê o status imediatamente antes de cada mutação, depois confirma o resultado. Campanhas pausadas não são reativadas pela regra.
- O fluxo automático envia `notification_context: automatic_negative_remaining`. O serviço privado só grava uma notificação quando a mutação realmente mudou a campanha e a releitura confirmou `PAUSED` (`changed: true`). Campanha já pausada, falha ou recusa da API não gera aviso. O botão manual da coluna não envia esse contexto.
- A falha ao gravar a fila de e-mail não desfaz uma pausa já confirmada. A resposta indica `email_notification_status: queue_failed`, e a Visão Geral deve separar esse caso de falha da pausa.
- A fila `google_ads_campaign_pause_email_outbox` guarda somente referências da campanha e estado de entrega; não armazena credenciais SMTP, valor restante, comissão/payout ou dados de comprador.
- O worker CLI de e-mail já existente processa essa fila usando o mesmo arquivo privado `tracking-email-config.php`, remetente, destinatário, SMTP, backoff e Cron já configurados para os avisos do sistema. O e-mail é assíncrono e costuma sair na próxima execução do Cron. Não criar outro Cron nem copiar configuração/segredos para o Hub ou `public_html`.

## Publicação e estado inicial

O deploy é composto pela migração SQL aditiva e pelos três PHP privados enumerados no README do pacote. Ordem: fazer backup do banco e dos dois arquivos privados substituídos; verificar se a tabela existe (se existir, conferir schema/índices e não executar às cegas); criar a tabela se estiver ausente; publicar helper, worker e serviço de ações, nessa ordem. O wrapper público, `tracking-config.php` e a configuração SMTP não fazem parte da publicação. Apresente os arquivos agrupados por destino conforme `deploy/PADRAO-DEPLOY-SERVIDOR.md`.

**Estado registrado em 27/10/2026:** o usuário informou que executou a migração e publicou os três PHP privados. Isso é relato do usuário, não verificação ao vivo do servidor. Depois, informou que ativou a pausa automática e uma campanha foi pausada. Isso confirma a ocorrência reportada pelo usuário, mas não confirma por si só a chegada do e-mail; não alegar que o fluxo de e-mail foi validado sem evidência da mensagem ou da fila.

O contexto de e-mail e o estado de enfileiramento foram introduzidos no Hub local v1.97.0; consulte `VERSION` para a versão local atual. Desde v1.98.0, uma transição automática real confirmada (`changed: true`, `PAUSED`) também grava somente a identidade MCC/conta/campanha e o horário no `localStorage` deste perfil (`hub:google-ads:auto-pause-applied:v1`). Desde v1.99.0, a confirmação também é gravada como evento aditivo em `observacoes_diario[].eventos`; o Diário mostra **Pausa automática aplicada** com data e horário. O selo ao lado do nome na Visão Geral agora também considera esses eventos persistidos, mesmo se a marca temporária do `localStorage` tiver sido removida. Não deduza pausas anteriores pelo status, política ou saldo; o Hub precisa distinguir pausa automática de manual. Se o usuário confirmar uma pausa anterior, **Registrar pausa anterior** no Diário cria um evento somente com a data declarada, sem chamar a API e sem inventar horário. O modal **Pausas automáticas** lista eventos com instante UTC em ordem do mais recente, regra quando registrada e horário local; entradas que guardam somente data são excluídas. Eventos antigos sem a regra mostram motivo não registrado. Para investigar um horário, use o evento do Diário como prova de transição automática; diferença textual de qualificação/status em captura da API não prova por si só uma pausa. Após o usuário atualizar/recarregar o Hub local, primeiro confira o estado e a lista no modal **Pausas automáticas**. Se a regra estiver ativa, uma atualização pode pausar imediatamente campanhas que cumpram os critérios; não clicar em **Ativar** ou **Verificar agora** sem intenção de executar a regra.

## Conferir o primeiro evento real

Depois que uma pausa automática ocorrer, confira no e-mail o remetente/destinatário já configurados. Para consultar apenas o estado operacional da fila no phpMyAdmin, sem ler configuração ou credenciais:

```sql
SELECT id, customer_id, campaign_id, confirmed_at_utc,
       attempt_count, last_error_code, sent_at_utc
FROM google_ads_campaign_pause_email_outbox
ORDER BY id DESC
LIMIT 10;
```

Uma tabela vazia antes da primeira pausa é esperado. `sent_at_utc` preenchido indica que o worker marcou a entrega; `sent_at_utc` vazio com tentativas/erro indica que a fila está aguardando retry. Se houver pausa confirmada e a notificação não aparecer na fila, confira a mensagem de resultado da Visão Geral (`queue_failed`) e os logs operacionais do worker, sem copiar segredos ou conteúdo SMTP para a conversa.

Fontes da integração no Hub: `src/overview/view.js` coordena a avaliação; `src/google-ads/google-ads-campaign-actions-service.mjs` envia o contexto somente pelo fluxo automático; `src/index.template.html` fornece os dados e carrega o módulo sob demanda. O endpoint/worker e o SQL implantáveis permanecem no projeto Tracking MVP, conforme o README acima.

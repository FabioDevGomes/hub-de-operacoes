# Motivos corretos nos e-mails de pausa automática

Pacote incremental para fazer cada aviso usar o motivo da regra que realmente pausou a campanha: valor restante negativo, desempenho do mesmo produto, tempo ativo acima do limite ou dias consecutivos sem impressões. A fila grava o código da regra junto do evento já confirmado pela API.

Os textos do campo **Motivo** serão: “valor restante negativo”; “critério de desempenho entre campanhas ativas do mesmo produto”; “tempo ativo acima do limite configurado”; ou “limite de dias consecutivos sem impressões atingido”.

## 1. Migração do banco

**Banco:** o banco privado de tracking que já contém `google_ads_campaign_pause_email_outbox`.

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-pause-email-rule-reasons\database
```

Arquivo: [google-ads-pause-email-reason-column.sql](database/google-ads-pause-email-reason-column.sql)

Antes, faça backup do banco. No phpMyAdmin, selecione o banco privado de tracking e confira se a tabela base existe. A migração verifica a coluna `pause_reason`: se estiver ausente, adiciona-a com o motivo legado `negative_remaining`, preservando a fila existente; se já estiver presente, não altera o schema. Se ela existir, confira que o tipo é `VARCHAR(40)`, collation `ascii_bin` e default `negative_remaining`; se a estrutura diferir, pare e compare o schema antes de substituir os PHP. Se a tabela não existir ou o banco selecionado não for o de tracking, pare e confira a instalação anterior antes de executar.

## 2. Serviços PHP privados

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local dos dois arquivos:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-pause-email-rule-reasons\hostinger-private-tools
```

1. [google-ads-campaign-pause-email-service.php](hostinger-private-tools/google-ads-campaign-pause-email-service.php) — traduz e grava o motivo da regra na fila, e monta o texto do e-mail.
2. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — aceita os quatro contextos automáticos e encaminha o motivo somente após a pausa ser confirmada pela Google Ads API.

Faça backup dos dois serviços instalados. Depois da migração, envie primeiro o serviço de e-mail e em seguida o serviço de ações. Substitua somente esses arquivos.

## Mantido como está

O worker de e-mail existente continua consumindo a fila e usando o mesmo remetente, destinatário, SMTP e Cron. Não envie wrapper público, serviço somente leitura, `tracking-config.php`, configuração SMTP ou credenciais. Não há mudança de destinatário nem nova chamada de envio. O e-mail continua sendo criado apenas para uma transição automática efetiva confirmada como `PAUSED`; ações manuais, campanhas já pausadas e falhas não geram aviso.

## Hub local

O build do Hub também precisa ser atualizado para mandar o contexto real da regra. Essa alteração é distribuída na pasta `dist` local do Hub, não no servidor Hostinger. Após o build, atualize a página local do Hub.

## Conferência depois da publicação

1. Confirme que `pause_reason` existe na tabela do banco privado.
2. Confirme que os dois PHP foram substituídos no destino indicado.
3. Em uma pausa automática futura confirmada, confira a linha na fila e o e-mail recebido. `pause_reason` deve ser um destes códigos: `negative_remaining`, `product_performance`, `campaign_age` ou `campaign_zero_impressions`.
4. O texto do e-mail deve refletir esse código. Não é necessário disparar uma campanha de teste real para fazer o deploy.

Este pacote está preparado localmente; nada foi enviado nem validado no servidor.

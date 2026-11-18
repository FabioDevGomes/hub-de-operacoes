# Motivo de pausa por limite de cliques sem venda

Pacote incremental para que a fila de avisos e o e-mail identifiquem a nova regra automática de campanhas que alcançam o limite de cliques configurado sem uma venda ativa no Diário.

O contexto `automatic_clicks_without_sale` é gravado como `clicks_without_sale`, exibido no e-mail como “limite configurado de cliques sem venda atingido”. O código cabe na coluna `pause_reason` existente (`VARCHAR(40)`); este pacote não altera banco de dados nem dispara e-mails.

## Substituição local preparada

Arquivo de origem atualizado: `tools/google-ads-campaign-pause-email-service.php`.

O arquivo espelhado nesta pasta é o serviço privado completo para substituição após revisão. O fluxo do serviço de ações valida o contexto por meio do mapeamento do serviço de e-mail, portanto não requer uma alteração separada.

**Destino de deploy, quando você decidir publicar:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-pause-email-service.php`.

Nada foi enviado ao servidor. A regra no Hub usa limite de 0 a 99 cliques acumulados observados localmente, fica desativada até ativação explícita e protege campanhas com qualquer venda ativa no Diário, incluindo provisórias.

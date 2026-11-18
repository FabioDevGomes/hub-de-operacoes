# `negative_remaining` não é bloqueada por venda

**Estado:** pacote preparado localmente; ainda não publicado.  
**Regra alinhada:** uma venda não veta `negative_remaining`; a decisão segue o `Valor restante` calculado pelo Hub.  
**Base:** worker local consolidado, com o schema 3, chave de autoridade, lease e corte.  
**Pacote anterior:** este pacote substitui o arquivo do pacote `google-ads-auto-pause-negative-remaining-evaluation-gate-fix-2026-11-17` para esta regra.

## Mudança

- Na avaliação sombra, `remainingValue < 0` é candidata mesmo com `saleProtected=true`, campanha presente na lista de vendas ou status global GuruMedia indisponível.
- Na validação de job real, esses vetos de venda também não bloqueiam `negative_remaining`.
- Regra desabilitada, exceções explícitas de `negative_remaining`, identidade inválida e valor ausente/inválido continuam respeitados.
- Proteções de venda continuam valendo para as outras regras.
- A avaliação continua em sombra e não cria jobs. Este pacote não muda autoridade, chave global, schema, serviço, Hub, SQL, Cron ou configuração.
- Se um job real `negative_remaining` já for autorizado e processado pelo worker, venda deixa de ser veto para ele. As demais validações do job e as exceções explícitas continuam valendo.

## Arquivo para publicação

Destino no servidor: `/home/u572283517/domains/travenzo.shop/private-tools`

A pasta `hostinger-private-tools/` contém somente:

- `google-ads-auto-pause-worker.php`

Faça backup privado do worker publicado antes de substituí-lo. Envie somente esse arquivo para o destino indicado.

## SQL, Hub e Cron

Não há SQL nem mudança no Hub, serviço PHP, configuração ou Cron. Mantenha o modo atual do worker; este pacote não autoriza ativar a execução real nem alterar a autoridade.

## Validação após publicação

Depois do upload, aguarde uma avaliação schema 3 e consulte os campos `rules.negative_remaining` e `campaign_results`. Compare as campanhas com o snapshot original pela identidade `(managerCustomerId, customerId, campaignId)` e confirme:

- `remainingValue < 0` → `candidate`, com ou sem venda, exceto quando houver exceção explícita da regra;
- `remainingValue >= 0` → `not_candidate`;
- identidade/valor inválido → `not_evaluable`;
- as outras regras continuam bloqueando campanhas protegidas por venda conforme a política;
- nenhuma avaliação sombra criou jobs ou executou chamadas/pausas.

A confirmação de uma campanha real com valor negativo continua dependendo de surgir esse valor em um snapshot. Não use campanha real para forçar o cenário.

## Reversão

Restaure o backup privado do worker anterior. Não reverta schema, autoridade ou dados de avaliações.

# Proteção de vendas GuruMedia no worker de pausas automáticas

**Estado:** pacote local, ainda não enviado à Hostinger. O Cron continua em prévia, sem `--execute`; esta entrega não pausa campanhas.

O Hub inclui na política sincronizada as identidades MCC/conta/campanha que já foram atribuídas a vendas GuruMedia no relatório local. O serviço mantém essas identidades na configuração existente do servidor. Antes de considerar um job pronto, o worker verifica a política mais recente e ignora campanhas com venda. Se a atribuição estiver indisponível, incompleta, ambígua ou truncada, a avaliação não é considerada segura para pausa.

O envio contém apenas IDs de campanhas, sem IDs de venda, GCLID ou dados de compradores. Não há consulta adicional à Google Ads API nem migração SQL. A proteção começa com as campanhas presentes no período do primeiro relatório GuruMedia completo sincronizado; campanhas históricas fora desse período entram quando forem incluídas em um relatório completo posterior.

O servidor mantém até 5.000 identidades protegidas. Se esse limite for excedido, ele suspende todas as pausas do worker por segurança, até uma correção manual da configuração.

## Arquivos para a Hostinger

Envie ambos os arquivos abaixo para:

`/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

1. `google-ads-auto-pause-service.php`
2. `google-ads-auto-pause-worker.php`

Faça backup privado dos dois PHPs atuais antes de substituí-los. Não altere `tracking-config.php`, o banco, SQL ou tarefas Cron.

## Validação

1. Deixe o Cron existente sem `--execute`.
2. Atualize o Hub local para a versão desta entrega e abra a Visão Geral; uma captura D0 completa sincroniza a política e a lista GuruMedia disponível.
3. Aguarde a próxima rodada do worker em prévia e confira **Ver resultado**. A saída deve contabilizar os jobs protegidos como “que seriam ignorados”; o código detalhado fica no `result_code` do job no banco.
4. A prévia não chama a API do Google Ads, não altera status de campanhas e não envia notificações de pausa.

## Reversão

Restaure os backups privados dos dois PHPs. A política guardada no banco não requer limpeza nem SQL. O Cron deve continuar sem `--execute` até uma autorização separada para ativar pausas reais no servidor.

**Publicação:** arquivos locais, ainda não enviados nem validados na Hostinger.

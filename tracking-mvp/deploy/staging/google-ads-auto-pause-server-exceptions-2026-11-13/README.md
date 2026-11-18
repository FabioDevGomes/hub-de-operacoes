# Exceções de pausa automática no worker do servidor

**Estado:** arquivos preparados localmente; ainda não enviados à Hostinger. Esta atualização depende da versão Hub **1.348.0** para sincronizar uma exceção no momento em que ela é salva.

## Arquivos desta atualização

| Arquivo local | Destino Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php` |
| `hostinger-private-tools/google-ads-auto-pause-worker.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-worker.php` |

## O que muda

- O Hub envia a exceção ao salvar no Diário, usando o vínculo confirmado MCC/conta/campanha e os códigos das regras desmarcadas.
- A configuração completa enviada pelo Hub também contém as exceções que tenham identidade de API salva. Isso permite reconstruir a lista depois de recarregar o Hub.
- Ao adicionar uma exceção, o endpoint encerra como `skipped` os jobs pendentes daquela campanha e regra. O worker volta a conferir a exceção da configuração atual imediatamente antes de cada pausa.
- Ao remover uma exceção, nenhum job antigo é reativado; a campanha só volta à fila após uma avaliação D0 posterior.
- O serviço antigo que não conhecia `campaignExceptions` continua sendo aceito durante a atualização, tratando o campo ausente como lista vazia.

Não há SQL novo nem tabela nova. A lista fica no JSON de configuração que já existe em `google_ads_auto_pause_config`. Não é preciso criar outro Cron: o worker mantém o agendamento já configurado.

## Publicação manual

1. Faça backup privado dos dois arquivos atuais em `private-tools`.
2. Atualize o Hub local para a versão 1.348.0 antes de editar exceções no Diário.
3. Envie primeiro `google-ads-auto-pause-service.php` e depois `google-ads-auto-pause-worker.php` para o destino privado indicado, substituindo os arquivos existentes. Não execute SQL.
4. Mantenha o Cron do worker existente. Se ainda não houver Cron do worker, siga a configuração do README `google-ads-auto-pause-server-worker-2026-11-13`.
5. Após atualizar, salve uma exceção em uma campanha vinculada. A resposta do Hub deve confirmar sincronização; o endpoint registra a atualização na configuração. Uma remoção de exceção passa a valer na próxima avaliação D0.

## Reversão

Restaure os dois backups privados para seus caminhos originais. Não remova nem altere dados no banco. A versão local do Hub continuará tentando usar o endpoint novo; para voltar ao comportamento anterior no Hub, restaure também o código local correspondente.

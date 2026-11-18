# Concluir configuração da meta compartilhada

Pacote local não publicado. Faça backup privado do arquivo instalado e substitua somente `google-ads-campaign-action-service.php` em `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`. Não há SQL nem alteração de configuração.

Após atualizar o Hub, consulte as campanhas pendentes. Se uma campanha pausada já tiver a meta personalizada e a ação esperadas, mas também tiver metas padrão ativas para lances, o Hub oferecerá concluir a configuração daquela campanha mediante confirmação explícita. O serviço aplica a meta e desativa metas padrão ativas para lances, consulta novamente a configuração e confirma o estado pausado. Trata uma campanha por clique; erros após a alteração podem representar aplicação parcial e exigem nova consulta antes de repetir. Testado localmente com respostas sintéticas; a operação real ainda não foi validada.

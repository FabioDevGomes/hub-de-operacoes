# Simulação segura da fila de pausas automáticas

**Estado:** pacote local, ainda não enviado à Hostinger. O Cron deve permanecer em prévia, sem `--execute`.

## O que esta entrega valida

O botão **Enviar simulação**, no quadro **Fila de pausas automáticas do servidor** do Hub, cria um job técnico reservado. O item percorre o endpoint privado, o banco MySQL, o worker e a consulta de resultado no Hub. O Hub guarda o identificador do último teste no navegador e consulta o estado enquanto o quadro estiver aberto.

O worker reconhece `rule_code=queue_simulation` antes de qualquer validação de campanha. Ele encerra esse job como `skipped` com `result_code=simulation_processed`, inclusive quando o processo é invocado com `--execute`. A simulação não representa campanha real, não chama a API do Google Ads, não pausa campanha e não gera e-mail de pausa.

Ela confirma o caminho técnico da fila e o recebimento pelo worker. Não valida elegibilidade real de campanha, acesso/permissão no Google Ads, notificações de pausa concluída, nem o atraso configurado para avaliações reais. O teste fica disponível para o próximo Cron; com a configuração atual a expectativa é até 5 minutos, desde que o Cron esteja ativo.

## Arquivos para a Hostinger

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Envie os dois arquivos abaixo para esse mesmo diretório, preservando os nomes.

1. `google-ads-auto-pause-service.php`
2. `google-ads-auto-pause-worker.php`

O serviço registra e consulta o teste sem misturá-lo à fila normal; o worker reconhece e conclui o job reservado. Faça backup dos arquivos existentes antes de substituí-los.

## Mudanças que não fazem parte deste pacote

- **SQL:** nenhuma migração. A simulação reutiliza o schema já instalado, incluindo `rule_code`, `result_code` e os estados existentes.
- **Cron:** nenhuma alteração. Mantenha o Cron existente sem `--execute` enquanto o servidor estiver em modo de prévia. A simulação é protegida mesmo com essa opção, mas outros jobs reais poderiam executar caso o Cron fosse alterado para execução.
- **Configuração/credenciais:** nenhuma mudança.
- **Hub:** a interface e os serviços locais foram alterados e compilados em `C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\dist`. Esses arquivos são para a instalação local do Hub, não para a Hostinger.

## Publicação e validação manual

1. Faça cópias de segurança privadas dos dois PHP atuais.
2. Envie apenas os dois arquivos desta pasta para o diretório `private-tools` informado acima. Não execute SQL e não altere o Cron.
3. Atualize/reabra o Hub local com o build que contém a simulação.
4. Abra **Pausas automáticas** e clique **Enviar simulação**.
5. A interface mostrará que o teste aguarda o worker. O Hub consulta o estado periodicamente enquanto o quadro permanecer aberto; **Verificar resultado** também permite consulta manual.
6. Após uma rodada do Cron, o Hub deve informar **“Simulação processada pelo worker. Nenhuma campanha foi consultada ou pausada.”** A saída do Cron deve incluir a quantidade de simulações processadas.

Se a mensagem mostrar erro de endpoint/operação, confirme o upload do serviço e do worker. Se continuar aguardando após o Cron, confira a saída do Cron e a conectividade do worker com banco; não altere o Cron para `--execute` para tentar resolver.

## Estado

Esta entrega está **local e não publicada**. O upload e a validação na Hostinger dependem da ação do usuário. Nenhum arquivo foi enviado ao servidor por esta implementação.


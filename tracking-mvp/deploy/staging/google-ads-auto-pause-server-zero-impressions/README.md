# Piloto de pausas automáticas — ampliar regras na fila

**Estado:** pacote local, ainda não enviado ao servidor. O Cron permanece em prévia, sem `--execute`.

O Hub envia jobs para `product_performance`, `campaign_age` e `clicks_without_sale`, além das regras já cobertas. A política sincronizada leva as configurações atuais do Hub e agora inclui o atraso adicional configurável antes de uma avaliação ficar disponível na fila. O servidor soma esse atraso ao intervalo entre capturas definido no Hub (padrão: 15 minutos; permitido: 0 a 1440). Por exemplo, intervalo de captura de 60 minutos + 15 minutos adicionais = job disponível 75 minutos após o snapshot.

## Arquivo para a Hostinger

| Pasta local | Destino |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php` |

## Publicação

1. Faça backup do arquivo PHP privado atual.
2. Envie o arquivo acima para substituir o serviço no destino indicado.
3. Não execute SQL. O worker e o Cron permanecem iguais; mantenha o Cron sem `--execute` durante a validação. O novo atraso passa a valer após o Hub salvar e sincronizar a política.
4. O Hub local atualizado deve publicar uma avaliação D0 completa. Jobs só serão enviados para regras habilitadas, campanhas vinculadas e elegíveis, sem venda no Diário nem exceção.
5. Confira `Ver resultado` do Cron após os prazos de snapshot/cancelamento. A saída em prévia mostra os jobs elegíveis sem pausar campanhas.

A publicação PHP ainda não foi feita pelo Codex. O `dist` do Hub foi gerado localmente.

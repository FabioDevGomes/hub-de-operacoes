# Janela de datas para revisão automática D−1

Pacote incremental baseado no serviço privado de diagnóstico que já foi publicado. A alteração mantém o diagnóstico sanitizado e os recursos existentes, permitindo à operação `sao_paulo_day_report` consultar datas D−1 fechadas dentro da janela de recuperação do Hub.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-d1-review-date-window\hostinger-private-tools
```

1. [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php) — faça backup do arquivo existente e substitua somente este PHP privado.

**Arquivo de destino:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Não substitua o wrapper público, credenciais, `tracking-config.php`, logs existentes ou outros serviços. Não há SQL, alteração de Hub, cron ou configuração para esta correção.

## O que muda

O serviço passa a aceitar datas fechadas de São Paulo dentro das 13 datas D−1 recentes que o Hub pode recuperar. Datas futuras ou fora da janela continuam sendo recusadas. A validação acontece antes da autenticação Google Ads e das consultas `SearchStream`.

O restante do serviço foi preservado a partir do pacote de diagnóstico publicado, incluindo o log sanitizado de erros. O pacote local não publica arquivos automaticamente.

## Conferência após a publicação

O Hub mantém as datas de revisão pendentes e tenta novamente automaticamente, com intervalo de uma hora quando a tentativa falha. Depois de substituir o PHP, aguarde a próxima tentativa agendada e confira se o cartão de falha foi sucedido por uma revisão D−1 completa. Uma falha HTTP 400 persistente indica que o endpoint ainda está executando uma versão que rejeita datas anteriores a ontem; confira o caminho do arquivo no HPanel antes de repetir qualquer ação.

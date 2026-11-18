# Extrair erro do envelope SearchStream

Atualização incremental do diagnóstico da Google Ads API. O log identificou que a falha ocorre na consulta de `campaign_asset`, mas a versão anterior procurava o campo `error` apenas no objeto externo. Esta versão também examina os itens do array JSON usado pelas respostas `searchStream` e registra um resumo sanitizado.

Ela não altera a consulta nem a gravação de sitelinks.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-searchstream-error-envelope\hostinger-private-tools
```

1. [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php) — substitui a versão atual do serviço. Faça backup antes de substituir.

Não envie outros arquivos, não altere `tracking-config.php` e não execute SQL. O arquivo de log existente deve permanecer no diretório.

## Depois do deploy

O botão de nova tentativa ainda pode aplicar sitelinks caso as consultas passem; use-o apenas quando estiver pronto para aplicar às campanhas pendentes. Se o `campaign_asset` continuar falhando, o log atualizado deverá mostrar o erro extraído do array. Se não houver erro aninhado, registrará o formato da resposta e as chaves do primeiro bloco para indicar o que veio.

O pacote ainda está local e não foi enviado ao servidor. Instruções gerais: `deploy/PADRAO-DEPLOY-SERVIDOR.md`.

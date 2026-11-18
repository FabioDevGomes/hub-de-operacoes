# Log privado para diagnóstico da Google Ads API

Pacote incremental para salvar os metadados sanitizados de cada erro da Google Ads API em um arquivo privado ao lado do serviço. Isso permite consultar o diagnóstico mesmo quando o hPanel não disponibiliza a pasta `.logs`.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-diagnostic-file-log\hostinger-private-tools
```

1. [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php) — mantém os cabeçalhos e o registro PHP atuais e também grava os diagnósticos sanitizados no arquivo privado abaixo.

Antes de substituir, faça backup do arquivo existente. Substitua somente `google-ads-readonly-service.php`; o endpoint de ações já carrega esse serviço e não precisa ser reenviado.

## Arquivo de diagnóstico gerado pelo serviço

Após a próxima resposta de erro da Google Ads API, o serviço criará automaticamente:

`/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-api-diagnostics.jsonl`

Cada linha contém somente horário UTC, ID de diagnóstico, etapa, status HTTP, códigos e caminhos de campos quando fornecidos pelo Google, ID de requisição, operação e indicador de retentativa. Não grava o corpo integral da resposta, credenciais, copy ou payload da campanha. O arquivo é limitado a aproximadamente 256 KiB; ao atingir esse tamanho, começa um novo ciclo de log.

O arquivo não precisa ser criado nem enviado manualmente. Ele só aparecerá depois que o serviço registrar um diagnóstico. Se o PHP não puder gravar na pasta privada, a chamada Google Ads continua normalmente e o Hub continua recebendo os cabeçalhos de diagnóstico.

## Depois do deploy

1. Não é necessário atualizar ou gerar build do Hub, executar SQL ou alterar `tracking-config.php`.
2. Faça uma única nova tentativa em **Tentar novamente nos pendentes** somente quando estiver pronto para reaplicar os sitelinks às campanhas pendentes. Essa é uma ação real na API, não uma consulta de diagnóstico.
3. No Gerenciador de Arquivos, abra o diretório privado acima e o arquivo `google-ads-api-diagnostics.jsonl`. Localize o ID novo exibido pelo Hub e compartilhe somente a linha correspondente.

O pacote está local e ainda não foi enviado ao servidor.

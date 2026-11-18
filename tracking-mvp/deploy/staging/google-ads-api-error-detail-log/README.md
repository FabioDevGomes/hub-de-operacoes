# Diagnóstico detalhado de erros da Google Ads API

Pacote incremental para identificar por que a leitura `searchStream` está retornando HTTP 400 ao preparar os sitelinks. Ele melhora somente o registro privado do erro; não altera as consultas nem a operação de gravação.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-api-error-detail-log\hostinger-private-tools
```

1. [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php) — substitui a versão de diagnóstico anterior. Faça uma cópia de segurança do arquivo atual antes de substituí-lo.

Não envie outros arquivos, não altere `tracking-config.php` e não execute SQL.

## Dados registrados

Após uma resposta de erro da API, a linha acrescentada a `google-ads-api-diagnostics.jsonl` poderá incluir o código e status do Google, resumo sanitizado da mensagem, chaves estruturais da resposta, códigos e caminhos de erro, e o recurso GAQL (`ad_group_ad` ou `campaign_asset`). URLs, e-mails, IDs longos e valores livres entre aspas são removidos ou mascarados. O corpo integral da resposta, a consulta e a copy da campanha não são gravados.

O arquivo de log anterior permanece no diretório privado e é reutilizado. Não o apague nem o substitua.

## Depois do deploy

1. Não é necessário atualizar o Hub, criar build, executar SQL ou alterar configurações.
2. O Hub ainda mostra as 12 campanhas pendentes. O botão de nova tentativa executa novamente as chamadas para essas campanhas. Use-o somente quando estiver pronto para aplicar os sitelinks: se as leituras passarem, o fluxo pode avançar para a gravação real.
3. Se o erro persistir, abra `google-ads-api-diagnostics.jsonl` no mesmo diretório privado e compartilhe as linhas novas correspondentes aos IDs mostrados pelo Hub. Se a tentativa concluir com sucesso, confira no Hub o resultado do lote.

Na tentativa anterior, o log mostrou que o erro ocorreu em `googleAds:searchStream`, antes da gravação dos sitelinks. Esta atualização ainda está local e não foi enviada ao servidor.

# Correção do filtro de campanha em Termos de Pesquisa

**Status:** correção local preparada; ainda não enviada ao servidor.

## Arquivo e destino

Faça backup do serviço privado atual e substitua somente este arquivo:

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-search-terms-response-scope-fix\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)  
Arquivo de destino: `google-ads-readonly-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

O wrapper público, credenciais, `tracking-config.php`, banco e cron não mudam. Não há SQL. Mantenha o serviço em `private-tools`, fora de `public_html`.

## Correção incluída

Em consultas de todas as campanhas, o PHP reutilizava `$campaignId` para armazenar o ID da campanha de cada linha. Ao montar a resposta, isso fazia `campaign_id_filter` informar o ID da última campanha retornada, embora a consulta não tivesse filtro. O Hub rejeitava os resultados completos como fora do escopo.

A correção separa o ID da campanha da linha em `$rowCampaignId` e preserva `$campaignId` como o filtro solicitado. A opção **Todas as campanhas** continua sem cláusula de campanha; consultas de campanha específica continuam confirmando o ID escolhido.

## Validação após publicação

1. Confirme o backup do serviço privado e substitua somente o arquivo indicado.
2. No Hub local v1.105.9 ou mais recente, consulte uma conta com **Todas as campanhas**.
3. Confirme que a consulta completa é aceita e que os resultados incluem campanhas Search da conta.
4. Selecione uma campanha e confirme que a consulta continua limitada ao ID escolhido.

As consultas continuam somente leitura; nenhuma campanha ou base do Hub é alterada por este serviço.

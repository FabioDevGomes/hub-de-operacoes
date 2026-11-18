# Compras por termo de pesquisa Google Ads

**Status:** pacote preparado localmente; ainda não enviado nem publicado na Hostinger.

## Arquivo e destino

Faça backup do serviço privado atual e substitua somente este arquivo:

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-search-terms-purchase-metrics\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)

O wrapper público, credenciais, configuração privada, banco e cron não mudam. Não há SQL. Mantenha o PHP em `private-tools`, fora de `public_html`.

## Alteração

- A operação `search_terms` aceita o flag opcional `include_purchase_metrics: true`; chamadas sem esse flag conservam a resposta atual.
- Quando solicitado, o serviço faz uma consulta GAQL adicional em `search_term_view`, limitada a campanhas Search, datas e filtro de campanha originais, com a categoria de conversão `PURCHASE`.
- O serviço soma `metrics.all_conversions` e `metrics.all_conversions_value` por data, campanha, grupo de anúncios, termo pesquisado, palavra-chave e correspondências e associa os valores às linhas da consulta original.
- A resposta com as métricas adicionais usa `schema_version: 2` e confirma `purchase_metrics_complete: true`. Se alguma consulta exceder o limite ou falhar, a operação falha por inteiro; não devolve compras parciais.
- A quantidade pode ser fracionária conforme a atribuição do Google Ads. O valor usa a moeda da conta e pode refletir ajustes de valor enviados ao Ads.

## Conferência após publicação

1. Faça backup e substitua somente o PHP privado indicado.
2. No Hub local v1.316.0, abra **Operação → Termos de Pesquisa**, marque uma conta e consulte um período curto.
3. Confira as colunas **Compras** e **Valor de compras** no agrupamento por período; compare com **Por dia e termo** para verificar a associação de data e termo.
4. Confira o pacote **Copiar pacote para IA**: os campos de compra devem acompanhar o termo e a moeda da conta.
5. Abra **Snapshots da Operação** e confirme que o relatório mantém o formato anterior, sem solicitar as métricas extras.

Até publicar este arquivo, a tela local atualizada solicitará métricas que o serviço instalado ainda não reconhece; por isso, a consulta nova de termos só ficará disponível depois da atualização do serviço privado.

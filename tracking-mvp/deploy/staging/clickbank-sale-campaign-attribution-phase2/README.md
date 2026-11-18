# Staging — candidato de campanha por venda ClickBank (Fase 2)

**Status:** preparado localmente para revisão; não enviado nem validado no servidor. O Hub consumidor ainda precisa ser confirmado como compatível com schema 4 antes do upload.

## Arquivo e destino

Faça backup do serviço atual e envie somente este arquivo:

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/clickbank-ins-v8-sales-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-sales-api-service.php` |

Pasta de destino: `private-tools`, fora de `public_html`. O wrapper público `clickbank-ins-v8-sales.php` e o receptor INS não mudam.

## O que muda

- A rota paginada mantém somente SALEs de afiliado não teste. Liga `extclid` por igualdade exata a eventos `outbound_click`; UUIDs legados também podem corresponder exatamente ao `click_id` próprio.
- O serviço expõe um diagnóstico reduzido da ligação e um `click_campaign_candidate`, derivado somente de `utm_campaign` numérico nos cliques correspondentes. Vários cliques com o mesmo ID continuam um candidato; IDs diferentes, dados ausentes ou conflitantes não são resolvidos por nome.
- O candidato é apenas um ID observado no clique; esta fatia não associa conta cliente nem MCC/manager customer ID e não declara uma identidade completa da campanha.
- A resposta usa schema 4 e inclui `click_link_diagnostic` e `click_campaign_candidate`. O Hub precisa aceitar schema 4 antes da publicação; essa compatibilidade não foi verificada neste pacote.
- O serviço não retorna GCLID/GBRAID/WBRAID, `extclid`, recibo ou dados do comprador.
- O serviço continua somente leitura e não chama Google Ads API, não grava a base, não envia conversões e não altera campanhas.

## Dependências

- Sem SQL, configuração, token novo ou alteração no receptor.
- O serviço depende do `clickbank-ins-v8-api-service.php` já instalado em `private-tools`.
- Sem compatibilidade do Hub consumidor com schema 4, não publique este arquivo. Essa confirmação pertence à próxima fatia do Hub.

## Validação manual após eventual publicação

1. Faça backup privado do serviço atual e substitua apenas o arquivo listado.
2. Use **Atualizar vendas** no Hub local atualizado.
3. Confirme no Hub que a resposta foi aceita e que dados financeiros, status da ligação e candidato continuam carregando.
4. A associação da identidade completa (manager/MCC, conta cliente e campaign ID), a exibição da venda e qualquer ação de campanha ficam fora desta fatia. Não execute pausas nem envie conversões.

Fonte canônica: `tools/clickbank-ins-v8-sales-api-service.php`.

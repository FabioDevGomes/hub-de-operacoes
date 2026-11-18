# Staging — isolamento da atribuição em novos cliques ClickBank

**Estado:** pacote preparado localmente; ainda não publicado. O pacote contém somente o rastreador público atualizado. Não altera o receptor INS, a API privada de vendas, o banco, a tag instalada na Pre-Sell nem as configurações da integração externa.

## Mudança

Quando a URL da página contém qualquer parâmetro de atribuição reconhecido (`gclid`, `gbraid`, `wbraid` ou `utm_*`), o rastreador inicia um novo snapshot de atribuição usando somente os valores dessa URL. Valores ausentes não são herdados do snapshot anterior na sessão. Parâmetros repetidos são descartados como ambíguos, em vez de escolher o primeiro valor.

Uma navegação para outra página sem parâmetros de atribuição continua usando o snapshot existente da sessão, permitindo que a atribuição chegue ao clique do HopLink. O rastreador continua preservando um `extclid` já presente no HopLink ou gerando um identificador próprio quando não há nenhum. O evento `outbound_click` continua carregando o `extclid` e os dados de atribuição capturados.

## Arquivo e destino

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/track.js` | `/home/u572283517/domains/travenzo.shop/public_html/track/track.js` |

Não há migração SQL, publicação privada ou alteração de configuração nesta entrega. Não envie outros arquivos dos pacotes históricos.

## Publicação manual

1. Faça uma cópia de segurança do `track.js` que está atualmente no destino.
2. Substitua somente esse arquivo pelo arquivo listado acima.
3. Recarregue a Pre-Sell para buscar o script atualizado. Não é necessário colar outra tag.

## Validação prevista

- Com `utm_campaign=CAMPAIGN-A` e um identificador Google, o clique de saída deve levar os valores da visita atual.
- Depois de salvar `CAMPAIGN-A` na sessão, uma nova URL com identificador Google e sem `utm_campaign` não deve enviar `CAMPAIGN-A` no clique seguinte.
- Uma navegação interna sem novos parâmetros de atribuição deve manter o snapshot atual.
- Parâmetros `utm_campaign` repetidos não devem produzir um valor de campanha candidato.
- Um HopLink com `extclid` existente deve mantê-lo; sem `extclid`, o script deve continuar criando e acrescentando um identificador.

Use somente fixtures isoladas para validar os casos sem uma venda real. Não faça clique em anúncio ativo. Um teste da tag publicada pode gravar um evento sintético no banco de tracking; combine essa etapa com uma sessão de QA, não com dados de vendas reais.

Este pacote local não comprova publicação na Hostinger. A associação final ainda depende de uma venda INS `SALE` não-test, do `extclid` exato no evento de saída e de o Hub resolver o ID da campanha para uma única identidade local completa.

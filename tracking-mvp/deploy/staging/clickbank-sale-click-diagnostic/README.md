# Staging — diagnóstico do vínculo venda → clique ClickBank

**Status:** preparado localmente para revisão; não enviado nem validado no servidor.

## Arquivo e destino

Faça backup do serviço privado atual e substitua somente este arquivo:

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/clickbank-ins-v8-sales-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-sales-api-service.php` |

Não substitua o wrapper público nem o receptor INS.

## O que muda

- A resposta de cada venda elegível acrescenta `click_link_diagnostic.status`.
- Estados: `extclid_missing`, `extclid_unusable`, `exact_click_not_found`, `click_missing_track_metadata`, `click_matches_multiple_tracks` e `track_matched`.
- O diagnóstico não inclui `extclid`, GCLID/GBRAID/WBRAID, recibo, dados de comprador, valores ou URLs.
- A associação à Track e o candidato de campanha permanecem campos separados. Um candidato continua sem significar identidade de campanha confirmada.
- O serviço continua somente leitura e não chama Google Ads API, não envia conversões e não altera campanhas.

## Dependências

- Sem migração SQL, configuração ou token novos.
- Requer o Hub atualizado para interpretar schema 4. Schemas 1–3 continuam aceitos e aparecem como “diagnóstico não disponível nesta resposta da API”.
- A resposta é recalculada na sincronização. O serviço não persiste um segundo diagnóstico nem altera dados existentes.

## Validação manual após publicação

1. Faça backup do arquivo privado atual e substitua somente o serviço listado acima.
2. Abra Tracking no Hub atualizado e escolha **Atualizar vendas**.
3. Expanda **Diagnóstico por venda**; confira as causas do vínculo ausente e que a tela continua separando Track, candidato de campanha e resolução local.
4. Confirme que registros históricos são reavaliados quando o vínculo extclid/clique ainda estiver disponível. Se o clique não está armazenado ou não compartilha o extclid, o Hub informa a limitação; não deduz a campanha pelo nome do produto.

Nenhuma pausa, edição de campanha, consulta adicional à Google Ads API ou envio de conversão é realizado por esta validação.

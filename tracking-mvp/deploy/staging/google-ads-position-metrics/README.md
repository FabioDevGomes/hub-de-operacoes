# Google Ads API — métricas de posição no Diário

**Versão do Hub:** 1.307.0  
**Estado:** arquivos preparados localmente; nada foi enviado ao servidor.

## O que muda

- Colunas do Diário: “% 1ª posição” passa a usar `absolute_top_impression_percentage`; “% parte superior” passa a usar `top_impression_percentage`.
- “Parc. impr. pesquisa” mostra `<10%` quando a API retorna o marcador do Google para valores abaixo de 10%, sem converter o marcador em 9,99%, 0,99% ou zero.
- O fechamento D−1 agrega as taxas horárias por média ponderada por impressões. Se faltar uma taxa em qualquer hora com impressões, o valor diário fica indisponível em vez de ser inferido.
- As métricas foram acrescentadas às consultas já existentes. Esta mudança não adiciona chamadas/consultas à API nem consumo adicional de operações de cota.

Os snapshots antigos não contêm as duas taxas de posição e não serão preenchidos retroativamente. Os valores aparecem nas novas capturas após atualizar o serviço e o Hub. Não foi feita consulta à conta nem alteração de dados operacionais.

## Arquivo deste pacote

| Arquivo local | Destino no servidor |
| --- | --- |
| `hostinger-private-tools/google-ads-readonly-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php` |

Não há SQL, wrapper público, configuração, credencial ou Cron neste pacote.

## Publicação manual

1. Faça backup do serviço PHP existente no destino indicado.
2. Envie apenas o arquivo listado acima, substituindo o PHP privado.
3. Atualize/recarregue o Hub local para usar a interface e o processamento da versão 1.307.0.

Não substitua o wrapper público, não altere credenciais, `tracking-config.php`, banco ou Cron. O serviço e o Hub devem estar atualizados para que o fluxo D−1 leia e mostre as novas métricas.


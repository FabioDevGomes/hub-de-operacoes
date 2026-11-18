# Google Ads — envio de recursos de imagem por lote

Esta etapa acrescenta a operação `upload_campaign_image_asset` ao serviço privado já usado pela tela **Criar campanha Google Ads**. O Hub valida PNG/JPG, tamanho e dimensões, cria ou reutiliza o recurso de imagem na conta, associa-o às campanhas Search do lote e relê os vínculos antes de confirmar o resultado.

## Arquivo para publicar

| Arquivo local | Destino no servidor |
| --- | --- |
| `hostinger-private-tools/google-ads-campaign-action-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php` |

Envie somente este PHP para esta etapa.

## Ordem

1. No File Manager da Hostinger, faça uma cópia de segurança do PHP atualmente instalado, mantendo o mesmo caminho original.
2. Substitua o arquivo indicado pelo conteúdo da pasta `hostinger-private-tools` deste pacote.
3. Confira que o arquivo no servidor tem o nome esperado. O Hub local desta entrega foi reconstruído como v1.195.0.

## SQL e configuração

- SQL: não há.
- Configuração ou credenciais: não altere.
- Wrapper público: não faz parte desta etapa; ele já inclui o serviço privado existente.
- Permissão: a operação usa o flag atual `tracking_google_ads_campaign_creation_enabled` e a allowlist de MCCs. Não habilite nem altere esses valores neste deploy.

## Comportamento e resposta de verificação

O upload só ocorre após a confirmação explícita no Hub e não muda o status das campanhas. A API pode retornar `AssetLinkError.CUSTOMER_NOT_VERIFIED`; o Hub registra esse retorno como exigência de verificação, sem concluir que imagens estão proibidas. Erros genéricos não são gravados como “não permite imagem”. Os bytes não ficam salvos nos lotes locais.

## Estado da publicação

Pacote preparado localmente. Nenhum arquivo foi enviado ou validado na Hostinger e nenhuma conta Google Ads foi alterada durante a implementação.

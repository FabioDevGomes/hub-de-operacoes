# CSV de segmentação positiva em lote por MCC

Este pacote atualiza o serviço privado para gerar um CSV de upload em massa usando a lista privada fixa dos 918 públicos e os IDs das campanhas e grupos do lote salvo no Hub. A geração do arquivo não consulta nem grava dados na Google Ads API.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

**Pasta local para localizar o arquivo:**

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-audience-targeting-bulk-upload\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — substitui o serviço privado atual. Faça uma cópia de segurança antes de substituir.

O JSON `google-ads-audience-targeting-ids.json` já implantado deve continuar ao lado desse PHP; não precisa ser reenviado. Não envie o README, wrapper público, configuração, credenciais, SQL ou outros workers.

## Uso do CSV

- Na tela Criar campanha, abra o lote salvo e use **Planilha de segmentação positiva**. O Hub gera um arquivo por MCC e só inclui os grupos com IDs válidos salvos no lote.
- Uma MCC com 12 grupos recebe 11.016 linhas (918 por grupo). Se um lote tiver mais de uma MCC, cada arquivo contém apenas os grupos daquela MCC.
- Importe o arquivo no painel da MCC, escolha a opção de várias contas e revise o processamento. O Google Ads processa todo o arquivo; acima de 1.000 linhas, a prévia da interface mostra somente as primeiras 1.000.
- Depois de importar, abra os públicos de cada grupo e escolha **Segmentação (Targeting)**, não **Observação**. Em campanhas Search, públicos novos usam **Observação** como padrão; a planilha inclui os públicos no grupo, mas não altera esse modo.

Este arquivo de serviço já contém as ações anteriores de criação, segmentação via API, exclusões e sitelinks. A atualização do Hub local é independente e deve ser distribuída a partir do build do repositório do Hub. O pacote está preparado para deploy manual e ainda não foi publicado.

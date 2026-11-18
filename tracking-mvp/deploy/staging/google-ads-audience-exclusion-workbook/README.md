# Google Ads — planilha de exclusões por conta

Pacote incremental para baixar, por conta de um lote salvo no Hub, um arquivo Excel no formato oficial de exclusões de público. O serviço devolve a lista fixa de 13 públicos somente após autenticar o token do Hub e conferir que a MCC está autorizada. A operação monta o catálogo sem chamar a Google Ads API.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-audience-exclusion-workbook\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — acrescenta a operação protegida `audience_exclusion_upload_catalog`.

Faça backup do serviço atual e substitua somente esse arquivo. Não envie o README, wrapper público, configuração/token, serviços incluídos pelo endpoint, JSON de 918 públicos ou outros arquivos. Não há SQL, nova configuração nem mudança de permissões MCC.

O endpoint atualizado mantém as operações já existentes e continua dependendo dos arquivos incluídos junto a ele, como `google-ads-readonly-service.php`, `google-ads-campaign-pause-email-service.php` e `google-ads-campaign-duplication-service.php`. Eles precisam permanecer no mesmo diretório; este pacote não os substitui.

## Como usar e conferir

1. Atualize a distribuição local do Hub para a versão que mostra **Planilha Excel de exclusões** ao reabrir um lote.
2. Abra o lote salvo. Em cada conta, clique **Baixar Excel**. O arquivo inclui todas as campanhas do lote naquela conta e 13 linhas por campanha, no nível da campanha.
3. Confira as colunas e contagens. Os 13 públicos usam IDs oficiais registrados no catálogo (`92931`, `80422`, `80538`, `80529`, `80528`, `80517`, `80535`, `80542`, `80544`, `80543`, `80279`, `80520` e `80532`). Os IDs são armazenados como texto na planilha.
4. Importe manualmente o `.xlsx` em uploads em massa no Google Ads. O download não aplica exclusões, não altera o lote e não consome cota da Google Ads API.

O pacote está local e ainda não foi enviado ao servidor. A atualização do serviço privado é manual; não execute SQL ou atualize configuração/token para esta etapa.

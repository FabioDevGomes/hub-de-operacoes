# Google Ads — declarar “não contém publicidade política da UE” em lote

Pacote incremental para a ação **Aplicar “Não contém publicidade política da UE”** em campanhas Search salvas no Hub. O serviço consulta o estado atual por conta, grava somente campanhas divergentes e confirma a leitura após a alteração. O estado `PAUSED` ou `ENABLED` é preservado.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local com o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-eu-political-declaration-batch\hostinger-private-tools
```

1. `google-ads-campaign-action-service.php` — endpoint privado atualizado com a operação em lote da declaração.

Faça backup do arquivo atual e substitua somente esse PHP no destino indicado. Não envie este README, o wrapper público, `trackingConfig.php`, credenciais, SQL ou outros arquivos.

O endpoint continua incluindo os serviços privados e auxiliares já existentes. Eles devem permanecer no mesmo diretório; este pacote não os altera. A operação usa a configuração e a allowlist de MCC existentes. Não exige SQL nem nova configuração.

## Como funciona

O Hub agrupa as campanhas Search pendentes por conta. Após confirmação explícita, o serviço autentica e consulta os IDs e nomes exatos, status, tipo e declaração atual. Se alguma campanha da conta não passar na conferência prévia, nenhuma campanha divergente daquela conta é alterada. Caso contrário, uma única mutação por conta envia somente `containsEuPoliticalAdvertising=DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING` para as campanhas que precisam da correção; outra consulta confirma o resultado. Campanhas ativas e pausadas são aceitas, sem mudar seu status. Campanhas de outros tipos ficam de fora.

O lote local guarda o resultado por campanha e as operações de cota reportadas pelo serviço. Em nova tentativa, o servidor relê o estado e ignora campanhas já corretas. A declaração precisa refletir a atividade real da campanha; esta interface oferece somente a opção “não contém”. O modelo CSV online não tem coluna documentada para essa declaração, por isso a ação é feita pela API.

## Conferência após o envio

1. Confira o backup e substitua o arquivo PHP na pasta do servidor acima.
2. Atualize/recarregue o Hub local com a versão que contém o botão da declaração.
3. Abra o lote, confira as campanhas e clique em **Aplicar “Não contém publicidade política da UE”**. O Hub pede confirmação antes de iniciar as consultas e alterações.
4. Confira os resultados por campanha no Hub e, se necessário, tente novamente as pendentes. A operação não ativa nem pausa campanhas.

O pacote está local; nenhum arquivo foi enviado ao servidor e nenhuma operação Google Ads foi executada durante a implementação.

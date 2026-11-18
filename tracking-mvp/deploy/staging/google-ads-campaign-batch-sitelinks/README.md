# Google Ads — sitelinks em lote

Pacote incremental para vincular sitelinks a campanhas que já estão salvas em um lote no Hub. A interface local precisa estar atualizada para mostrar **Sitelinks deste lote**.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local com o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-batch-sitelinks\hostinger-private-tools
```

1. `google-ads-campaign-action-service.php` — endpoint privado atualizado com a operação de aplicar sitelinks e confirmar a leitura dos vínculos.

Faça backup do arquivo atual e substitua somente esse PHP no destino indicado. Não envie este README, o wrapper público, `trackingConfig.php`, credenciais, SQL, serviços de e-mail ou outros arquivos.

O endpoint continua incluindo `google-ads-readonly-service.php`, `google-ads-campaign-pause-email-service.php` e `google-ads-campaign-duplication-service.php`. Esses arquivos precisam continuar presentes no mesmo diretório; este pacote não os altera. A operação usa o flag de criação de campanha e a allowlist MCC já configurados. Não há mudança SQL ou nova configuração.

## Como funciona

O usuário reabre um lote salvo no mesmo navegador/perfil, seleciona até seis sitelinks da copy do Gemini e atribui uma seção exclusiva `#1` a `#6`. A seleção fica vinculada ao lote nesse navegador. Depois da confirmação, o Hub processa cada campanha do lote em sequência. O serviço lê a URL final do anúncio de cada campanha para manter a Pre-Sell daquela conta, consulta sitelinks existentes, cria os que faltarem e reativa vínculos pausados. Ao final, relê os recursos e só registra sucesso quando todos os sitelinks esperados estão ativos.

A ação aceita campanhas Search pausadas ou ativas. Para as ativas, os sitelinks podem aparecer nos anúncios após a revisão do Google Ads. Cada campanha pode exigir consultas e gravações na cota da API; uma nova tentativa envia apenas campanhas pendentes e não duplica vínculos iguais já ativos. O título aceita até 25 caracteres. As duas descrições são opcionais, mas devem ser preenchidas juntas, com até 35 caracteres cada.

## Conferência após o envio

1. Confira o backup e confirme que o arquivo PHP foi substituído na pasta do servidor acima.
2. Atualize a distribuição local do Hub para a versão que contém **Sitelinks deste lote**.
3. Reabra o lote desejado. Importe a copy do Gemini, confira/edite os sitelinks, escolha suas seções e salve no lote. Essa etapa é local e não consulta nem altera o Google Ads.
4. Quando quiser aplicar os links, confira a lista e as campanhas, clique em **Aplicar a campanhas do lote** e confirme. O serviço registra o resultado por campanha; se houver falhas, tente novamente somente as pendentes.
5. Confira no Google Ads as campanhas ativas ou pausadas e aguarde a avaliação dos recursos.

O pacote está local; nenhum arquivo foi enviado ao servidor e nenhuma operação Google Ads foi executada nesta implementação.

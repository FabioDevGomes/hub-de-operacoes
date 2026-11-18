# Google Ads — serviço consolidado de ações de campanha

Pacote único para substituir o endpoint privado de ações por uma cópia consolidada da fonte atual. Ele reúne os recursos existentes de campanhas e os ajustes incrementais de CPA, orçamento diário e palavras-chave positivas, evitando substituir o endpoint por uma cópia de staging que contenha apenas parte das operações.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-actions-consolidated-2026-11-09\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)  
Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

## Recursos reunidos

- Ajuste do CPA desejado em passos de 2 ou 4 pontos percentuais da comissão, com leitura e confirmação pelo Google Ads. Chamadas antigas sem o campo de passo continuam usando 2 pontos.
- Ajuste do orçamento diário em passos de 5%, com validação de moeda, orçamento exclusivo diário e confirmação posterior.
- Prévia e inclusão de palavras-chave positivas em grupos de anúncios, com confirmação explícita.
- Prévia e inclusão de palavras-chave negativas, por campanha e por lote.
- Criação e duplicação de campanhas Search, status pausar/ativar, metas e configurações de entrega.
- Segmentação e exclusões de públicos, sitelinks, URLs finais, imagens e declarações de publicidade política da UE.

O arquivo é a cópia integral de `tracking-mvp/tools/google-ads-campaign-action-service.php`, que contém os handlers de CPA, orçamento e palavras-chave positivas no mesmo dispatcher. O pacote também preserva as demais operações da fonte atual.

## Publicação e dependências

1. Faça um backup privado do serviço atualmente instalado e confirme que a cópia está completa.
2. Envie **somente** `google-ads-campaign-action-service.php` desta pasta e substitua o arquivo de mesmo nome no destino acima.
3. Não envie pacotes antigos de CPA, orçamento ou palavras-chave por cima deste endpoint: cada um é uma fotografia incremental e pode remover operações presentes nos outros.

O serviço usa os arquivos já instalados em `private-tools`: `google-ads-readonly-service.php`, `google-ads-campaign-pause-email-service.php` e `google-ads-campaign-duplication-service.php`. Preserve-os. Este pacote não contém wrapper público, `tracking-config.php`, credenciais nem outros serviços.

## Configuração e alterações em contas

- Não há SQL, migração ou arquivo de configuração neste pacote.
- Preserve no `tracking-config.php` privado as configurações de escrita e allowlist de MCC já existentes.
- Palavras-chave positivas também exigem `tracking_google_ads_campaign_batch_positive_keywords_enabled` igual a `true`. Este pacote não altera esse flag.
- CPA e orçamento usam a autorização geral de escrita e a MCC permitida; o flag de palavras-chave positivas não os controla.
- Publicar o endpoint não altera campanhas. Os botões de CPA e orçamento aplicam mudanças reais quando acionados; a inclusão de palavras-chave exige prévia e confirmação. Termos adicionados a campanhas ativas podem começar a veicular.

Não é necessário enviar o build do Hub à Hostinger. A interface do Hub é local; este pacote atualiza apenas o serviço privado do servidor.

## Verificação e estado

- O arquivo preparado deve ser idêntico à fonte consolidada indicada acima; compare os hashes SHA-256 antes do upload se copiar ou mover o pacote.
- A publicação permanece manual. Estado atual: preparado localmente, ainda não enviado nem validado na Hostinger.
- Após o upload, uma consulta pela interface pode confirmar o reconhecimento das operações sem alterar campanhas; para confirmar execução, use somente uma ação real revisada, pois CPA, orçamento e aplicação de palavras-chave escrevem no Google Ads.

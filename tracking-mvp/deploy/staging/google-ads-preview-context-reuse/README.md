# Reuso de consultas na prévia de campanhas Google Ads

Pacote local, ainda não publicado. Ele compartilha consultas de preparação entre as prévias de uma mesma execução: autorização e configuração por conta filha; meta e ação por conta de conversão/MCC; moeda e destinos por conta/configuração. Cada campanha ainda recebe sua própria busca por nome e sua própria validação `validateOnly`, com checkpoint local individual.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-preview-context-reuse\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)  
Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

Faça backup privado do arquivo instalado e substitua somente esse PHP. Não há SQL nem alteração de configuração. A pasta de upload contém somente o endpoint necessário. A interface do Hub é local e já foi regenerada pelo build; não deve ser enviada à Hostinger.

## Verificação depois do envio

1. Confirme que o PHP foi substituído no destino indicado.
2. Recarregue o Hub local e valide um lote pequeno. A tela deve mostrar quantas contas e quantas contas de conversão/MCC foram preparadas antes de iniciar as prévias individuais.
3. A preparação consulta apenas a configuração selecionada e não cria campanhas. Cada linha ainda executa sua busca de nome e `validateOnly` própria.
4. A criação efetiva continua fazendo checagens atuais e não usa o contexto temporário da prévia.

O PHP passou em `php -l`; a interface e o executor passaram em `node --check`, e `node build.mjs` concluiu. Não houve chamada à API do Google Ads nem validação em conta real. Portanto, o comportamento ao vivo ainda precisa ser confirmado depois do upload.

# Staging — origem do tráfego no relatório GuruMedia

**Status:** alteração local preparada para publicação manual. Ainda não foi enviada nem validada na Hostinger.

## Arquivo e destino

Faça backup do arquivo atual e substitua somente:

| Arquivo deste pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/tracking-clicks-report-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/tracking-clicks-report-service.php` |

O wrapper público existente `tracking-clicks-report.php` permanece igual e carrega este serviço privado.

## Como a origem é classificada

- `Google Ads` quando a visita traz GCLID, GBRAID ou WBRAID. Os identificadores não são incluídos na resposta.
- `UTM: fonte / meio` quando há `utm_source` (o meio aparece quando está preenchido).
- `Referência: domínio` quando há um referenciador externo; somente o domínio é exibido.
- `Sem origem identificada` quando nenhum desses sinais está presente.

O agrupamento GuruMedia passa a considerar também essa classificação. Totais continuam somando os mesmos eventos `page_view` e `outbound_click`; não há migração SQL. O serviço continua somente leitura. Para ClickBank, o agrupamento e a tela permanecem como antes.

Os eventos existentes podem ser classificados usando os campos de origem já gravados em `tracking_events`. A instalação do Hub local deve estar na versão 1.361.1 ou superior para aceitar e mostrar o novo campo.

## Publicação

1. Faça backup do serviço privado atual.
2. Envie o arquivo da pasta `hostinger-private-tools` ao destino listado acima.
3. Recarregue o Hub atualizado e execute novamente a consulta de visitas e cliques GuruMedia.
4. Confirme que a nova coluna mostra as classificações e que os totais do resumo continuam coerentes.

Não há SQL, configuração de credenciais, alteração de `track.js` nem mudança de URL. O pacote permanece local até o envio manual.

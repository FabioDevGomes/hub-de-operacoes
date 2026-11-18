# Staging — script único para pre-sell

**Estado:** implementação local pronta para revisão e upload manual. Ainda não publicada. Este pacote simplifica a instalação da pre-sell, preserva o `extclid` existente da integração externa de tracking e também funciona sem ela.

## Arquivos e destinos

Faça backup dos dois arquivos públicos e do serviço privado antes de substituir. No phpMyAdmin, confira antes se a coluna e o índice desta migração ainda não existem.

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `database/tracking-clickbank-extclid.sql` | Executar uma vez no banco dedicado de tracking |
| `hostinger-public-track/collect.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/collect.php` |
| `hostinger-public-track/track.js` | `/home/u572283517/domains/travenzo.shop/public_html/track/track.js` |
| `hostinger-private-tools/clickbank-ins-v8-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-service.php` |

O pacote não inclui `tracking-config.php`, tokens, chave INS, payloads, logs ou dados de vendas. Mantenha a configuração privada existente como está.

## Ordem da instalação

1. Faça backup do `collect.php`, `track.js` e `clickbank-ins-v8-service.php` atuais.
2. No phpMyAdmin, confirme que `tracking_events.clickbank_extclid` e `idx_tracking_events_clickbank_extclid` ainda não existem. Se algum existir, pare e compare a estrutura antes de qualquer alteração.
3. Execute `tracking-clickbank-extclid.sql` uma única vez. A migração só adiciona uma coluna e um índice; não remove nem reescreve registros existentes.
4. Envie os três arquivos para os destinos da tabela.
5. No Hub local, abra **Tracking → Tracks**, autorize o hostname HTTPS e copie a tag única.
6. Na pre-sell, cole a tag uma única vez. Se ainda usa integração externa de tracking, ela pode permanecer instalada, mas não é requisito para o Hub capturar cliques. Os HopLinks criptografados (`codigo.hop.clickbank.net`) são detectados pelo hostname mesmo sem `affiliate`/`vendor` legíveis; o formato simples no host `hop.clickbank.net` ainda precisa desses dois parâmetros. Não são necessários `data-track-outbound` nem `data-track-clickbank` para esses HopLinks.

## Compatibilidade e atribuição

- Se o HopLink já tiver `extclid` (por exemplo, criado pela integração externa de tracking), o script não o substitui. Ele registra esse valor separado do UUID interno e o receptor INS v8 pode conciliá-lo ao evento de clique.
- Se o HopLink não tiver `extclid`, o script cria um UUID próprio e o acrescenta, mantendo os demais parâmetros. Portanto, remover a integração externa de tracking não impede o Hub de gerar o identificador usado na conciliação das vendas INS v8.
- `ft_sid`, `tid`, `aff_sub1` a `aff_sub5` e os outros parâmetros já existentes são preservados.
- Links que já usam os atributos antigos continuam sendo aceitos; removê-los é opcional.
- O script detecta HopLinks HTTPS criptografados em `*.hop.clickbank.net` pelo hostname; para `hop.clickbank.net` sem subdomínio, exige `affiliate` e `vendor`. Outros links não marcados não são rastreados.
- O coletor verifica a origem HTTPS registrada na tabela `tracking_allowed_domains`; cadastrar outro domínio continua sendo uma ação no Hub, sem novo upload de código.
- Esta versão armazena os eventos de saída necessários para conciliar o GCLID com a INS v8. A tela de contagem/relatório de cliques continua como trabalho posterior; não há envio ao Google Ads.

## Validação local e após upload

Antes do upload, rode o teste JavaScript de HopLinks e os testes PHP do coletor/INS v8. Depois do upload, use uma sessão de teste, não um clique de anúncio, e confira que o navegador não reporta erro CORS/HTTP e que o Hub deixa de classificar a atribuição INS como não resolvida quando os identificadores coincidem. Um Test IPN que não carregue o mesmo `extclid` de um clique real não valida a conciliação.

Não altere nem substitua a URL verificada da integração externa de tracking. Esta entrega local não prova que os arquivos foram publicados; a Hostinger só muda após o upload manual.

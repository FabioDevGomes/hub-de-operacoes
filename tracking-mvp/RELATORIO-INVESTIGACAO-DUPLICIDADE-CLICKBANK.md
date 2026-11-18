# Relatório da investigação: integração externa de tracking, vendas duplicadas e plano de implementação

**Data:** 18/10/2026
**Escopo:** consolidar a investigação feita nesta conversa e registrar as decisões atuais para captura própria de vendas em paralelo e preparação manual de CSV.
**Limite importante:** este relatório usa as capturas de tela fornecidas, as verificações locais do repositório e a documentação oficial citada ao final. Não houve acesso ao código interno da integração externa de tracking nem confirmação, por identificador de transação, de que duas conversões distintas foram efetivamente contabilizadas pelo Google Ads.

> **Atualização de decisão — 18/10/2026:** este relatório preserva evidências e hipóteses históricas; para os próximos passos, prevalecem [CONTRATO-DADOS-VENDAS-INS-V8.md](CONTRATO-DADOS-VENDAS-INS-V8.md) e [RETOMADA-INTEGRACAO-CLICKBANK.md](RETOMADA-INTEGRACAO-CLICKBANK.md). A prioridade deixou de ser estabilizar o checkout: é capturar **vendas futuras** por um receptor INS v8 próprio e separado, guardar vários produtos e comissão, e preparar o CSV no Hub sem enviá-lo. A integração externa permanece intacta e continua remetendo compras ao Ads. A troca da integração externa e o upload serão decisões manuais do usuário; não haverá backfill.

## 1. Conclusão executiva

A duplicidade observada na integração externa é real como **duas linhas/eventos exibidos na interface**, mas ainda não está provado que sejam duas vendas independentes ou dois envios efetivos ao Google Ads. As duas linhas mostradas tinham o mesmo horário, o mesmo Click ID e o mesmo valor; uma não exibia produto e aparecia como “Somada na venda” com referência à venda, enquanto a outra exibia o produto e aparecia como “Enviada”. Isso pode ser compatível com duas fontes de evento sobrepostas, mas também pode ser uma linha agregada/associada à venda junto de um único envio. É preciso reconciliar pelo ID do pedido/recibo e pelo histórico de envios.

A hipótese prioritária é sobreposição de **fontes de compra** na configuração da ClickBank/integração externa: o postback Custom Postback/Pixels estava configurado para eventos de compra/upsell ao mesmo tempo que havia um Instant Notification Service (INS) v8 verificado. A documentação da ClickBank alerta que o mesmo evento recebido por mecanismos diferentes pode gerar duplicidade. Isso não prova que foi a causa neste caso. A instrução da aula da integração externa, conforme relatada pelo usuário, esclarece que a configuração pretendida é outra: Postback/Pixels apenas para **Initial Order Form Impression** (checkout), e compra/venda pelo **INS v8**.

Para o servidor próprio, mantém-se a separação de protocolos: o receptor de macros Postback/Pixels existente não é um receptor INS v8 e não deve ser reutilizado como se fosse. A captura do checkout foi adiada; a implementação atual prioriza um receptor INS v8 separado para vendas futuras, em paralelo à integração externa.

O servidor já tem uma base útil: captura de visitas/cliques, preservação de `extclid`, receptor customizado de eventos por macros e exportação manual de CSV para eventos elegíveis do esquema atual. Ainda não há implementação local do processamento INS v8, armazenamento multi-produto ou integração desses novos registros ao Hub/CSV. O exportador existente não faz upload ao Google Ads e não deve ser tratado como o pipeline v8 final. O CSV novo usará a comissão (`totalAccountAmount`) como valor e manterá os itens para análise por produto.

**Recomendação operacional:** não desligar a integração externa como fonte de compra do Google Ads até o pipeline próprio estar implementado e validado de ponta a ponta. Primeiro construir e testar o receptor INS v8 em paralelo, sem enviar conversões de teste ao Ads; depois reconciliar eventos reais e só então planejar a troca, garantindo que apenas uma fonte envie cada compra.

## 2. Evidências observadas

| Evidência | O que foi observado | O que permite concluir |
|---|---|---|
| Teste do navegador | A chamada a `collect.php` retornou HTTP 200 e `{ok:true, recorded:true}`. O payload exibido era um `page_view` e continha GCLID de teste. | A página conseguiu carregar o script e enviar um evento de navegação ao endpoint. Isso não comprova a captura de uma venda nem atribuição real do Google Ads. |
| Linhas da integração externa | Duas linhas de ClickBank, ambas em 16/10/2026 às 22:40, com o mesmo Click ID e o mesmo valor exibido. Uma linha sem produto estava marcada como “Somada na venda” e apontava para uma venda; outra mostrava o título do produto e “Enviada”. | Existem dois registros visíveis relacionados à mesma compra/identificação, mas a tela isolada não prova dois envios de conversão ao Ads. |
| ClickBank Sales Analytics | No período mostrado (12–18 de outubro), a linha da conta/produto indicava uma venda inicial e US$ 188,54 de ganhos bruto/líquido. | A plataforma ClickBank mostrava uma venda inicial nesse recorte. É uma boa referência de reconciliação, mas precisa ser comparada com a mesma data, fuso e transação. |
| Google Ads | A ação “pixel MCC com meta” aparecia ativa, como ação principal de compra, com origem “Importar de cliques”, contagem “Todas as conversões” e janela de clique de 90 dias. O painel de detalhes da integração externa mostrava uma conversão automática enviada com HTTP 200. A captura da campanha mostrava 1,00 conversão e valor de conversão de US$ 377,08. | Houve ao menos um envio aceito pela API/integração segundo a tela da integração externa. O valor de US$ 377,08 é exatamente o dobro de US$ 188,54, um sinal que merece investigação, mas não prova que duas vendas foram contabilizadas: os recortes, datas, moeda, atribuição e outros eventos precisam ser conciliados. |
| Configuração ClickBank/integração externa | As capturas mostravam um endpoint INS v8 da integração externa marcado como Verified e uma configuração Postback/Pixels Custom ativa. Numa captura do postback, Initial Purchase e Upsell Purchase estavam selecionados; Initial Order Form Impression estava desmarcado. | Havia potencial sobreposição de fontes de compra naquela configuração capturada. A captura não demonstra qual versão estava ativa no instante de cada evento nem o tratamento interno da integração externa. |
| Aula da integração externa, conforme relato do usuário | A instrução da aula é marcar somente Initial Order Form Impression no Postback/Pixels; as duas opções de compra ficam desmarcadas, porque a compra é recebida pelo INS v8. O usuário informou que restaurou a configuração da integração externa conforme a aula. | Esta é a configuração pretendida para a integração externa segundo a fonte de treinamento do usuário. Não foi revalidada diretamente na conta depois da alteração. |
| Data Manager do Google Ads | A área antiga de “Uploads” encaminha novas importações à Central de Dados. Na Central de Dados havia opções de arquivo, Google Drive, HTTPS e SFTP. | A importação por arquivo não desapareceu; a interface migrou o fluxo para o Data Manager. Ainda falta testar a conexão/mapeamento com o arquivo produzido pelo nosso servidor. |

## 3. Fatos, hipóteses e questões em aberto

### Fatos observados ou confirmados localmente

- A ClickBank mostrava uma venda inicial no período capturado, de US$ 188,54 de ganhos para a conta selecionada.
- A integração externa apresentava duas linhas visualmente relacionadas, com o mesmo horário, Click ID e valor; uma linha não tinha título de produto e a outra tinha.
- A ação de compra do Google Ads estava configurada como ação principal e com contagem “Todas as conversões”. Essa configuração pode contar mais de uma conversão atribuída ao mesmo clique quando eventos distintos são enviados; por si só, não duplica um único evento idempotente.
- O tracking próprio já recebe eventos do navegador, relaciona cliques com `extclid` e possui um endpoint personalizado de Postback/Pixels.
- O exportador local é somente de leitura/geração de arquivo: não chama a API do Google Ads e não faz upload automático.
- A exportação atual seleciona apenas eventos `PURCHASE`, exige correspondência com clique/GCLID real e aplica validações e deduplicação de lote por Order ID.

### Hipótese principal — plausível, não comprovada

Na captura inicial, Initial Purchase/Upsell Purchase pelo Postback/Pixels e INS v8 estavam ambos configurados. Se a integração externa recebeu a mesma compra pelos dois caminhos e tratou ambos como conversão, isso explica registros sobrepostos e potencial duplicidade. A própria ClickBank alerta para risco de duplicação quando o mesmo evento passa por métodos distintos. O modelo recomendado na aula da integração externa — checkout no Postback/Pixels e compra no INS v8 — elimina a sobreposição de tipos de evento, desde que as opções e o tratamento estejam corretos.

### O que ainda não sabemos

1. Se as duas linhas da integração externa correspondem a dois callbacks, a um callback e uma linha agregada, ou a outras etapas internas do produto.
2. Se duas requisições de conversão foram realmente enviadas ao Google Ads para a mesma venda. O estado “Enviada” em uma linha e “Somada na venda” na outra não basta para afirmar isso.
3. Se os US$ 377,08 no Google Ads se referem à mesma transação e ao mesmo período/fuso da venda de US$ 188,54 da ClickBank.
4. Como o INS v8 da ClickBank entrega ao receptor próprio o identificador de clique externo usado para relacionar a venda ao `extclid` do nosso site. Não podemos confundir o `clickId` próprio da ClickBank com o UUID de `extclid` gerado pelo nosso tracking.
5. Se o formato atual de seis colunas do CSV será aceito/mapeado sem ajustes na configuração de importação atual desta conta.

Para fechar a causa da duplicidade, a evidência ideal é comparar, para o mesmo recibo/Order ID: eventos recebidos pela integração externa e seus tipos/fontes, histórico de tentativas/envios ao Google Ads, e o relatório de conversões do Ads com o mesmo fuso/período. Não é necessário expor nome, e-mail, IP ou outros dados pessoais para fazer essa conciliação.

## 4. O que o servidor próprio já faz

### Captura de navegação e clique

`public/track.js` captura `page_view` e `outbound_click`, lê GCLID/GBRAID/WBRAID e UTMs, gera um UUID para o clique e acrescenta esse valor ao parâmetro `extclid` apenas em links ClickBank identificados para rastreamento. O armazenamento em sessão evita recriar o identificador em cada interação da mesma sessão.

`public/collect.php` recebe os eventos do navegador e os grava em `tracking_events`. A implementação evita guardar IP, e-mail, telefone e user-agent. O teste HTTP 200 visto no browser comprovou o transporte do evento de página, não a configuração ClickBank nem o fluxo de compra.

### Postback/Pixels atual

`public/clickbank-postback.php` é um endpoint para as macros do Custom Postback/Pixels. Ele espera o token próprio configurado e dados como `event_id`, `event_type`, valor/moeda e `extclid`; persiste o evento e tenta associá-lo ao clique. O `event_id` tem restrição única e o caminho registra o resultado de cada tentativa (`inserted`, `duplicate`, `not_inserted` ou `db_error`) sem guardar o token, a URL completa, o payload bruto ou dados do comprador.

Esse endpoint **não** implementa o protocolo INS v8. O INS v8 envia payload JSON criptografado e requer descriptografia com chave e IV, validação do evento e leitura dos campos específicos da versão. Apontar o INS v8 para o endpoint atual sem um novo receptor/adaptador adequado não é uma migração segura.

O schema local de Postback/Pixels salva IDs/tipos de evento, recibo/pedido, `extclid`, valores/ganhos e moeda, mas ainda não salva um identificador/título do produto nem distingue claramente a origem da integração em cada registro. Esses campos fazem falta para diagnosticar e reportar a diferença de produto que apareceu na integração externa.

### Exportação Google Ads

O exportador em `tools/` gera o formato legado de importação de conversões de cliques, com colunas para GCLID, nome da conversão, horário, valor, moeda e Order ID. Ele filtra para compra, exige associação entre `extclid` e um clique que tenha GCLID real, valida horário/valor/moeda e limita a janela configurada. GCLIDs sintéticos de teste, eventos sem clique correspondente e duplicatas no lote são excluídos.

O exportador descrito aqui é o legado: ele usa `affiliate_earnings` dos registros de macros. A decisão para o pipeline futuro já está definida: usar `totalAccountAmount` do INS v8 como comissão/Conversion Value e preservar o total bruto em campo separado. O novo receptor e a fonte v8 para o CSV ainda precisam ser implementados; não confundir o campo legado com o contrato novo.

> **Atualização da decisão sobre valor:** a dúvida no parágrafo acima era da investigação inicial e foi resolvida depois. Para o pipeline próprio INS v8, a comissão (`totalAccountAmount`) é o valor da conversão; `affiliate_earnings` é somente o campo do exportador legado de macros. O checkout foi adiado e a captura v8 ainda não está implementada.

## 5. Direção vigente — captura paralela, sem cutover nesta fase

### Capturar e registrar vendas sem envio ao Ads

1. **Venda — INS v8:** receber vendas futuras em URL própria separada, descriptografar, validar e registrar transação e todos os itens. Comissão total de afiliado é o valor de negócio; o valor bruto permanece apenas para conferência. Reembolsos, chargebacks e outros tipos não viram novas vendas no CSV v1.
2. **CSV/Hub:** gerar uma linha por transação `SALE`/recibo elegível, com comissão (`totalAccountAmount`) como Conversion Value, USD e recibo como Order ID. Não enviar pela API nem fazer upload automático.
3. **integração externa e Postback/Pixels:** manter a integração externa ativa como remetente ao Ads. A configuração específica de checkout por Postback/Pixels não será trabalhada nesta fase; as opções atuais não devem ser alteradas sem confirmação da conta.

### Guardas de confiabilidade necessárias antes da troca

- Implementar receptor INS v8 separado, conforme documentação vigente, com descriptografia, validação de assinatura/autenticidade conforme o protocolo, tolerância a retries e resposta adequada à ClickBank.
- Definir e testar a chave de junção da venda com o clique: descobrir o campo exato que preserva o tracking externo (`extclid`/tracking code). Não usar o `clickId` interno da ClickBank como substituto sem prova de que representa o UUID externo.
- Persistir tipo e origem do evento, event ID, recibo/Order ID, IDs/títulos de produto (como `itemNo`/`productTitle`), moeda, comissão total (`totalAccountAmount`), comissão por item (`accountAmount`), valor bruto separado e horário da transação. Segredos não devem ir para CSV, logs ou documentação compartilhada.
- Deduplicar por identidade do evento/transação e tipo de evento, não só por GCLID. Preservar eventos legítimos separados, como compra inicial e upsell, conforme a decisão de negócio; prevenir retries repetidos sem apagar a trilha de auditoria.
- Separar venda inicial, upsell, reembolso e chargeback no modelo de dados. Não transformar checkout ou notificação de reembolso em uma nova compra.
- Fazer reconciliação por Order ID/receipt e produto contra ClickBank. Incluir o produto nos relatórios internos para que uma venda sem título não fique indistinguível de uma venda completa.
- Antes de qualquer upload manual futuro, gerar prévia de CSV e validar o mapeamento de colunas/ação no Data Manager. O valor está definido como comissão de afiliado, não o valor bruto da venda.

### Migração sem janela de duplicação

Manter a integração externa como remetente de compra ao Google Ads durante toda esta fase. O novo receptor pode ser validado em paralelo sem enviar conversões ao Ads. Quando o usuário decidir migrar, ele desativará manualmente a integração externa antes de subir o CSV próprio; não haverá cutover automático. O evento de checkout fica fora desta fase.

## 6. CSV e interface atual do Google Ads

As telas examinadas mostram que o item antigo “Uploads” passou a direcionar conexões de dados para o **Data Manager / Central de Dados**. A documentação oficial confirma que fontes de arquivo continuam suportadas e que arquivos locais podem ser usados no fluxo de upload/conexão. Portanto, não devemos abandonar a exportação CSV apenas porque a tela antiga mudou.

Por outro lado, ainda não foi validado que o arquivo atual do projeto possa ser conectado/importado diretamente, com todos os cabeçalhos, fuso, nome da conversão e identificador exigidos por esta configuração de conta. A implementação do exportador não deve ser considerada final até fazer uma validação sem envio de conversões reais: conferir o template/esquema exigido no Data Manager, mapear as colunas, confirmar se a conversão de destino aceita importação de clique e verificar a prévia/diagnóstico da conexão. Não foram enviados dados nem feitas alterações na conta durante a investigação.

## 7. Plano de ação priorizado

1. **Contrato de dados — concluído:** [CONTRATO-DADOS-VENDAS-INS-V8.md](CONTRATO-DADOS-VENDAS-INS-V8.md) define comissão, multi-produto, atribuição e CSV v1.
2. **Schema aditivo:** criar modelo para venda e múltiplos itens sem tocar nas tabelas antigas nem persistir payload bruto/dados pessoais.
3. **Receptor INS v8 separado:** implementar descriptografia, validação, autenticação, idempotência e auditoria conforme o protocolo.
4. **Testar com payload controlado:** retries, duplicatas, multi-item, comissão, conflito/ausência de identificadores; sem enviar conversões ao Google Ads.
5. **Integrar ao Hub/CSV:** listar transações e itens, indicar elegibilidade e gerar prévia/arquivo de comissão; validar o mapeamento do Data Manager sem upload de venda real.
6. **Capturar vendas futuras em paralelo e reconciliar:** comparar recibo, itens e comissão com a ClickBank e verificar a atribuição, mantendo a integração externa como remetente.
7. **Cutover/upload manual somente por decisão do usuário:** desativar a integração externa antes do upload próprio; sem automatizar reenvio ou backfill.

## 8. Estado da documentação local e verificações

O `README.md`, `RETOMADA-INTEGRACAO-CLICKBANK.md`, `deploy/LEIA-ME.md` e `deploy/REFERENCIA-HOSTINGER.md` foram alinhados em 18/10/2026 com a decisão vigente. O relatório continua sendo evidência histórica da investigação de duplicidade; para o contrato funcional e os próximos passos, prevalecem o contrato INS v8 e a retomada atualizada. A migração SQL `clickbank-ins-v8.sql` está preparada localmente, mas ainda não foi executada; receptor e integração v8 seguem pendentes. Nenhuma alteração foi feita no servidor ou na configuração da ClickBank.

Verificações locais executadas antes deste relatório:

- `php tests/google-ads-export.test.php` — aprovado.
- `php tests/google-ads-api.test.php` — aprovado.
- `node --test tests/clickbank-link.test.mjs` — aprovado (2 testes).
- `php -l` em `public/clickbank-postback.php` e `public/collect.php` — aprovado.
- `php tests/google-ads-public-path.test.php` — falhou porque o teste referencia um caminho antigo/inexistente em `phase2-packages/google-ads-api-public-phase2/`; a cópia atual está em `deploy/current/hostinger-public-track/`. Isso aponta para teste de caminho desatualizado, não demonstra falha dos arquivos atuais em produção.

As cópias do endpoint Postback/Pixels e da biblioteca de exportação no pacote local `deploy/current` coincidem com suas fontes, mas a documentação de deploy ainda informa que a versão mais recente do endpoint precisa de upload manual para Hostinger. Logo, não se deve assumir que o endpoint publicado contém toda a versão local mais nova. Não foi feito deploy durante esta investigação.

## 9. Referências

- [ClickBank — Postback/Pixels Integration Guide](https://support.clickbank.com/en/articles/10535373-postback-pixels-integration-guide) — eventos e macros disponíveis no Postback/Pixels.
- [ClickBank — Transitioning to the Updated Postback Pixel Technology](https://support.clickbank.com/en/articles/10535372-transitioning-to-the-updated-postback-pixel-technology) — coexistência dos métodos e risco de receber o mesmo evento por caminhos diferentes.
- [ClickBank — Instant Notification Service (INS)](https://support.clickbank.com/en/articles/10535147-instant-notification-service-ins) — protocolo INS v8 e estrutura do payload com dados de produto.
- [Google Ads — Importar conversões de cliques de arquivos](https://support.google.com/google-ads/answer/7014069?hl=pt-BR) — fluxo de importação de conversões offline.
- [Google Ads Data Manager — Google Drive](https://support.google.com/google-ads-data-manager/answer/16768724?hl=en) — conexão baseada em arquivos/Drive.
- [Google Ads Data Manager — conectar uma fonte de dados](https://support.google.com/google-ads-data-manager/answer/15746160?hl=en) — tipos de fonte e fluxo do Data Manager.

## 10. Arquivos locais relevantes

- `public/track.js` — coleta no navegador e marcação de clique ClickBank.
- `public/collect.php` — recepção de eventos de navegação/clique.
- `public/clickbank-postback.php` — receptor atual para macros Custom Postback/Pixels; não é o receptor INS v8.
- `clickbank-postback.sql` e `clickbank-postback-attempts.sql` — tabelas de eventos e auditoria.
- `tools/google-ads-export-lib.php`, `tools/google-ads-export-service.php` e `tools/export-google-ads.php` — geração/validação do CSV de compras.
- `deploy/LEIA-ME.md` — estado e instruções do pacote de deploy local.

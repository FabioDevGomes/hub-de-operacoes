# Staging — identificação de Track por pre-sell

**Estado:** implementação local pronta; ainda não publicada. Este pacote complementa o script único da fase 2. A tag copiada pelo Hub não usa `crossorigin` e fica vinculada a um código técnico estável, ao nome legível da Track e ao hostname exato da pre-sell; o coletor valida e salva identidade técnica/hostname em cada evento e a API privada guarda também o rótulo legível na allowlist. O rastreador preserva `extclid` existente ou gera um UUID próprio quando não há um.

## Antes de instalar

Este é um pacote incremental. Pressupõe que você já executou a migração `tracking-clickbank-extclid.sql` e instalou os arquivos da fase 2. **Não execute novamente a migração anterior.** Faça backup de `collect.php`, `track.js`, `tracking-domains.php`, `tracking-domains-api-service.php` e `tracking-domain-allowlist-lib.php`.

No phpMyAdmin, confira os tipos das colunas `tracking_allowed_domains.product_key`, `tracking_allowed_domains.product_label`, `tracking_events.product_key`, `tracking_events.presell_host` e os índices `idx_tracking_events_product_key` e `idx_tracking_events_presell_host`. A migração verifica `information_schema` e ignora colunas/índices que já existem; se algum campo existente tiver outro tipo/collation ou índice incompatível, pare para comparar o schema antes de continuar. `product_label` é anulável e não altera linhas antigas.

## Arquivos e destinos

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `database/tracking-product-identity.sql` | Executar uma vez no banco dedicado de tracking |
| `hostinger-public-track/collect.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/collect.php` |
| `hostinger-public-track/track.js` | `/home/u572283517/domains/travenzo.shop/public_html/track/track.js` |
| `hostinger-public-track/tracking-domains.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/tracking-domains.php` |
| `hostinger-private-tools/tracking-domains-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/tracking-domains-api-service.php` |
| `hostinger-private-tools/tracking-domain-allowlist-lib.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/tracking-domain-allowlist-lib.php` |

Não substitua `tracking-config.php`, a configuração do token administrativo ou o serviço INS v8. O pacote não contém segredos.

## Ordem

1. Confirme o backup e a ausência das colunas/índices descritos acima.
2. Execute a nova migração SQL uma vez. Ela só adiciona colunas anuláveis e índices ausentes; não atualiza nem remove dados existentes e ignora os que já existirem.
3. Envie os cinco arquivos da tabela para seus destinos. O coletor usa o hostname como código temporário para domínios antigos sem associação, até você salvar um código explícito no Hub.
4. Atualize/reinicie o Hub local e abra **Tracking → Tracks**. Informe o domínio e um código estável de produto, como `metabo-drops`; reenviar um domínio já cadastrado atualiza somente sua associação de produto.
5. Carregue a lista, selecione o domínio e copie a tag mostrada. Ela contém `data-product-key` e `data-presell-host`, não contém token e não usa `crossorigin`. Cole a tag uma vez na pre-sell. A integração externa de tracking pode continuar instalada; o rastreamento de cliques do Hub não depende dela.
6. Para outra pre-sell do mesmo produto, use o mesmo código de produto; o hostname diferencia as páginas. Outro produto deve usar outro código. Cada evento salva `product_key`, `presell_host` e `page_url`; o nome legível (`product_label`) é persistido por domínio para aparecer na lista do Hub e em avisos de checkout associados.

### Rótulo do Track para e-mail de checkout

O pacote da API atualiza o servidor para aceitar e devolver `product_label`, mantendo `product_key` inalterado para tag e associação. Após publicar a migração e os dois serviços privados, salve novamente cada Track existente pelo Hub com o domínio e o nome legível exatos; essa operação preenche os rótulos nulos, sem alterar eventos históricos. Tracks novas já salvam os dois campos juntos.

O worker de checkout associa somente por `extclid` a um único par `presell_host` + `product_key` e exige que o mesmo par esteja cadastrado atualmente em `tracking_allowed_domains`. Quando elegível, usa `product_label` ou a chave técnica se o rótulo estiver vazio. Se a associação estiver ausente, ambígua ou não cadastrada, não envia e-mail e encerra a linha da fila com `checkout_track_not_registered`. Ele nunca escolhe uma Track arbitrariamente nem inclui o identificador de clique no e-mail. O pacote do worker atualizado é `../clickbank-ins-v8-email/`.

O servidor confere se o código da tag corresponde ao código salvo para o domínio e se `data-presell-host` corresponde ao host real da página. Tags antigas sem esses atributos continuam funcionando por compatibilidade; o coletor deriva o host do evento e associa o produto pelo domínio autorizado. Se o código mudar, copie e publique novamente a tag para manter o alinhamento.

HopLinks HTTPS criptografados em `*.hop.clickbank.net` são detectados pelo hostname, sem depender de parâmetros legíveis `affiliate`/`vendor`. O formato simples no host `hop.clickbank.net` requer ambos. Se houver um `extclid`, o Hub o preserva; se não houver, gera e acrescenta o UUID próprio. Os demais parâmetros existentes, inclusive `ft_sid`, `tid` e `aff_sub1–5`, são mantidos. A remoção da integração externa não impede o Hub de capturar cliques, mas a associação das vendas depende de a ClickBank continuar enviando INS v8 ao endpoint ativo do Hub; confirme essa entrega antes de desligar a integração externa. Se a URL INS atual ainda for a da integração externa, a ClickBank documenta um segundo campo `Instant Notification 2` para configurar outro receptor sem substituir o primeiro. Desativar a integração externa também interromperá os envios ao Google Ads que dependam dela; o Hub não envia conversões automaticamente.

## Validação

Rode os testes do código ClickBank e da API de domínios, os testes de integridade dos pacotes de implantação, `php -l` nos arquivos PHP alterados e a suíte/build do Hub. Após publicar, faça uma visita e um clique de teste, confirme resposta sem erro CORS/HTTP e confira `product_key`, `presell_host` e `page_url` em `tracking_events`. Esta fase não cria ainda a tela de contagem/relatório de cliques nem envia dados ao Google Ads.

# Inventário de palavras-chave de campanha — Fases 1 e 2

Fase 1 prepara a operação privada de leitura. A Fase 2 conecta o Diário do Hub a essa operação com um botão de consulta manual. O fluxo recebe somente MCC, conta cliente e ID da campanha; não aceita GAQL fornecida pelo navegador e não executa mutações.

## Fase 1 — serviço privado

Substitui somente o serviço privado existente:

- `hostinger-private-tools/google-ads-campaign-action-service.php`
- Destino: `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

O arquivo depende dos serviços privados já instalados `google-ads-readonly-service.php`, `google-ads-campaign-pause-email-service.php` e `google-ads-campaign-duplication-service.php`. Não envie outros arquivos, credenciais, configuração privada, SQL ou arquivos para `public_html` nesta fase.

## Contrato

`POST` para o endpoint privado atual, usando a mesma autorização Bearer e origem permitida:

```json
{
  "operation": "read_campaign_keyword_inventory",
  "manager_customer_id": "1234567890",
  "customer_id": "1234567891",
  "campaign_id": "987654321"
}
```

A MCC precisa estar na allowlist já configurada, e a conta cliente precisa estar ativa e vinculada a ela. A campanha deve existir e ser do tipo Search. A resposta contém identidade/status da campanha, palavras-chave positivas de grupos de anúncios e negativas dos grupos e da própria campanha, incluindo correspondência, status, escopo, grupo quando aplicável e horário UTC da leitura. Critérios `REMOVED` são excluídos; critérios pausados são retornados com o status `PAUSED`.

Esta fase cobre critérios explícitos em campanha/grupo. Palavras de listas negativas compartilhadas não são expandidas nesta operação.

## Cota e publicação

Cada leitura válida faz quatro consultas `SearchStream`: valida vínculo da conta à MCC, confirma a campanha Search e lê os dois conjuntos de critérios. O medidor de cota existente acompanha essas operações. A operação não cria, altera ou remove recursos Google Ads.

O pacote está local e ainda não foi publicado. Para habilitar a consulta, publique primeiro a Fase 1: faça backup do serviço privado atual e substitua somente o arquivo listado acima. Nenhuma migração SQL é necessária.

## Fase 2 — interface do Hub

**Status:** implementação local concluída e build gerado em `dist/`; não foi enviada/publicada. Atualize os arquivos do Hub nos mesmos caminhos relativos da pasta servida pela instalação local:

| Arquivo local | Destino relativo no Hub |
| --- | --- |
| `dist/index.html` | `index.html` |
| `dist/version.txt` | `version.txt` |
| `dist/product-diary/view.js` | `product-diary/view.js` |
| `dist/product-diary/product-diary.css` | `product-diary/product-diary.css` |
| `dist/google-ads/google-ads-campaign-actions-service.mjs` | `google-ads/google-ads-campaign-actions-service.mjs` |

A pasta `dist/` completa também pode ser usada conforme o procedimento habitual de atualização do Hub. O botão **Atualizar no Google Ads** só funcionará depois que o serviço da Fase 1 estiver publicado. O Hub mantém a resposta somente em memória e apresenta a lista local de novo ao reabrir o Diário; nenhum inventário é gravado no banco do navegador.

Testes locais: `tests/google-ads-campaign-keyword-inventory-client.test.mjs` e `tests/product-diary-view.test.mjs`. Sem migração SQL, mudança de schema ou arquivo privado adicional na Fase 2.

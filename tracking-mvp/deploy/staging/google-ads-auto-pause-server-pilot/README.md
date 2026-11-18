# Piloto de pausas automáticas no servidor — endpoints

**Estado:** pacote local de staging, não publicado. Este recorte prepara o canal autenticado Hub → servidor e o armazenamento pequeno dos pedidos de avaliação. Ainda não executa pausas no servidor: a integração do Hub e o worker de Cron são etapas seguintes.

## Arquivos do pacote

| Arquivo | Destino Hostinger |
| --- | --- |
| `hostinger-public-track/google-ads-auto-pause.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/google-ads-auto-pause.php` |
| `hostinger-private-tools/google-ads-auto-pause-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php` |
| `database/google-ads-auto-pause-server.sql` | Executar uma vez no banco `u572283517_track`, somente após revisar este pacote |

O endpoint público só carrega o serviço privado fora de `public_html`. O serviço reutiliza os arquivos já instalados `google-ads-readonly-service.php`, `google-ads-campaign-action-service.php`, `google-ads-campaign-pause-email-service.php` e `clickbank-ins-v8-service.php`; credenciais não são incluídas nem alteradas.

## Contrato HTTP

URL prevista: `https://track.travenzo.shop/google-ads-auto-pause.php`.

- Aceita `POST` e `OPTIONS`, exige `Origin` na allowlist existente e `Authorization: Bearer <tracking_hub_api_token>` pelo mesmo mecanismo do endpoint Google Ads já usado pelo Hub.
- O JSON é limitado a 1 MiB; respostas são `no-store`. Operações e propriedades desconhecidas são rejeitadas.
- `sync_config` grava a revisão atual da configuração do Hub. Formato v1:

```json
{
  "operation": "sync_config",
  "revision": "UUID",
  "policy": {
    "version": 1,
    "snapshotIntervalMinutes": 120,
    "confirmationSeconds": 210,
    "maxRetainedSnapshots": 60,
    "rules": {
      "negative_remaining": {"enabled": true},
      "reference_competitor": {
        "enabled": true,
        "referenceImpressions": 100,
        "referenceClicks": 1,
        "competitorMinImpressions": 0,
        "maxPausesPerProductPerSnapshot": 1
      }
    }
  }
}
```

- `publish_evaluation` recebe `snapshot_id`, `completed_at_utc`, `revision` e `jobs`. O Hub continua responsável por comparar snapshots, selecionar referência/concorrente e aplicar a proteção de venda do Diário. Para evitar guardar dados redundantes, o servidor persiste apenas hash da avaliação, IDs, regra, contexto mínimo da candidata e datas; não persiste o JSON bruto dos snapshots.
- Cada `jobs[]` tem exatamente `rule_code` (`negative_remaining` ou `reference_competitor`), `product_key`, `manager_customer_id`, `customer_id`, `campaign_id`, `campaign_name`, `has_diary_sale: false` e `reason_context` (objeto limitado a 12 KB). O Hub aplica os limites da regra; o banco aceita campanhas distintas do mesmo produto quando uma regra permite mais de uma.
- O instante elegível para o worker é `completed_at_utc + snapshotIntervalMinutes + 15 minutos`. O cancelamento termina em `completed_at_utc + confirmationSeconds`; o endpoint não aceita cancelamento depois desse prazo.
- `pending` lista os pedidos pendentes para o Hub apresentar o aviso/contador. `cancel_product` recebe `snapshot_id` e `product_key` e cancela o pedido enquanto a janela de cancelamento estiver aberta.
- Repetir uma captura com o mesmo ID e avaliação é idempotente. Reutilizar o ID para avaliação diferente retorna conflito. O servidor rejeita campanha/MCC fora da allowlist já existente.

## Banco e retenção

O SQL é aditivo e usa InnoDB. Cria somente três tabelas para configuração, metadados/hash de avaliação e fila de pedidos; não altera nem limpa as tabelas existentes. A inserção remove capturas e pedidos terminais mais antigos que o limite sincronizado, preservando sempre pedidos `pending`/`processing`. Nenhum snapshot bruto é copiado ao MySQL. A migração ainda não foi executada.

## Etapas que faltam para habilitar

1. Integrar o Hub para sincronizar a política salva e publicar a avaliação de cada captura D0 completa; ler pedidos pendentes e enviar cancelamentos.
2. Implementar o worker CLI com trava contra concorrência, processamento de pedidos vencidos, conferência final de status/allowlist, mutação limitada a `status`, releitura confirmatória e fila de e-mail com o motivo correto.
3. Revisar este pacote e só então publicar wrapper/serviço, executar a migração aditiva e cadastrar a nova tarefa Cron, sem substituir o Cron existente.

Nenhuma etapa acima foi executada na Hostinger nesta entrega. Os endpoints preparados não pausam campanhas até a integração do Hub e o worker serem publicados e configurados.

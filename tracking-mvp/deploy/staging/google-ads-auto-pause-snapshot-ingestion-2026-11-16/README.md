# Fase 1 — receber snapshots completos do Hub

**Estado:** arquivos preparados localmente; ainda não enviados à Hostinger nem executados no banco.

Esta entrega acrescenta o recebimento autenticado e o armazenamento idempotente de snapshots D0 automáticos completos. O servidor valida escopo, identidade, campos, tamanho e SHA-256; recebe o corpo em partes para respeitar o limite HTTP atual e mantém somente a retenção configurada no Hub. Partes incompletas são removidas após 24 horas.

O Hub dispara o envio depois de concluir a gravação IndexedDB, em segundo plano, sem aguardar a rede para concluir a captura. A lista de snapshots locais não confirmados é reavaliada na próxima captura automática. Capturas manuais, D−1, consultas parciais e escopo `ENABLED` não são enviadas.

**Limites desta fase:** o servidor apenas armazena o payload; não avalia regras, não cria jobs, não chama a Google Ads API e não pausa campanhas. O Hub continua com o comportamento de pausa atual. Vendas e totais financeiros não são transferidos por este contrato; as fontes necessárias às regras continuam pendentes para a fase de avaliação.

## Arquivos e destinos

| Arquivo | Destino / ação |
| --- | --- |
| `hostinger-private-tools/google-ads-auto-pause-service.php` | Substituir `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-auto-pause-service.php` |
| `database/google-ads-auto-pause-snapshot-ingestion.sql` | Executar no banco `u572283517_track` depois de conferir backup e tabelas |

Não alterar o wrapper público, o worker, o Cron, credenciais ou a configuração existente. O endpoint e a autenticação continuam usando o wrapper e os helpers já instalados.

## Ordem de publicação

1. Fazer backup do serviço PHP atualmente instalado e do banco `u572283517_track`.
2. Conferir se as três tabelas `google_ads_auto_pause_snapshot_uploads`, `google_ads_auto_pause_snapshot_upload_parts` e `google_ads_auto_pause_snapshot_payloads` ainda não existem ou se coincidem com este SQL.
3. Executar o SQL aditivo no banco `u572283517_track`.
4. Enviar o PHP para o destino indicado, substituindo somente esse serviço.
5. Atualizar o Hub local para a versão que acompanha esta entrega. A transferência só começa após a próxima captura automática D0 completa.

O SQL usa `CREATE TABLE IF NOT EXISTS`; não limpa nem modifica tabelas antigas. Se uma tabela já existir com estrutura diferente, pare e compare antes de executar. A migração não tem rollback destrutivo documentado; preserve as tabelas e dados após a publicação.

## Conferência após publicação

- No Hub, aguardar uma captura automática D0 completa e conferir no phpMyAdmin se entrou uma linha correspondente em `google_ads_auto_pause_snapshot_payloads`.
- Confirmar `schema_version = 1`, hash SHA-256 com 64 caracteres, tamanho positivo e contagens iguais às do payload entregue.
- A mesma captura reenviada deve manter uma única linha. Snapshots fora da retenção configurada são removidos pelo endpoint ao finalizar novo recebimento.
- Não usar a presença da linha como evidência de avaliação ou pausa: nesta fase, o worker não lê essas tabelas.

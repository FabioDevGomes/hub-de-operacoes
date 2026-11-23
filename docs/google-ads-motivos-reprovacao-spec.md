# Motivos de reprovação nos snapshots

## Objetivo e escopo

Consultar os tópicos de política dos anúncios quando o inventário da campanha indicar anúncios reprovados. Mostrar os motivos na tela Snapshots da Operação e preservar as consultas na base central, compartilhada pelos navegadores que usam a mesma instância. A consulta é somente leitura.

## Seleção e cota

- Identidade: MCC, conta e campanha completas; manter também grupo e anúncio para cada motivo.
- Consultar na primeira detecção, quando a reprovação retorna após deixar de ser observada e quando a última tentativa tiver pelo menos 24 horas. A falha e a resposta sem detalhes também respeitam o intervalo, para evitar tentativas contínuas.
- Agrupar campanhas elegíveis da mesma conta em uma consulta `ad_group_ad`, selecionando IDs, aprovação e `policy_summary.policy_topic_entries`. Validar o escopo e a completude. Dividir consultas quando necessário e registrar as operações efetivamente realizadas.
- Abrir a tela e navegar no histórico não consulta a API. Falha na consulta de política não invalida a captura normal de métricas.

## Dados e histórico

- Persistir de forma aditiva na base central: identidade, snapshot de origem, data da tentativa, situação (completa, sem detalhes ou falha), última consulta confirmada, tópicos e códigos por anúncio. Preservar resultados anteriores e usar controle de revisão para acessos concorrentes.
- O snapshot registra uma referência ao resultado conhecido na captura e a data da consulta original. Nunca alterar retroativamente snapshots existentes. O histórico que hoje está no IndexedDB não é presumido como migrado.
- Exibir vários motivos distintos, sem atribuir a todos os anúncios um motivo observado em apenas um. Traduzir códigos conhecidos, inclusive `DESTINATION_NOT_WORKING`; exibir códigos desconhecidos sem inventar tradução.
- Se o motivo mudar enquanto o estado geral permanece reprovado, registrar a alteração no novo snapshot. Destacar primeira identificação ou mudança. Se houver falha, manter a última leitura confirmada com data e sinalizar a falha. Distinguir ausência de detalhes informada pelo Google de falha da consulta.

## Implementação e aceite

1. Serviço privado: operação validada, somente leitura, que consulta anúncios por conta e IDs de campanha, com resposta completa e limitada.
2. Hub: seleção por transição e intervalo, agrupamento por conta, isolamento de falhas e vínculo ao snapshot; armazenamento central com concorrência segura.
3. Tela: motivo detalhado e data da consulta, incluindo estados vazio, falha e resultado anterior.
4. Testar dados sintéticos: múltiplos anúncios e motivos, múltiplas campanhas por conta, resultados vazios e incompletos, falhas, repetição em menos de 24 horas, mudança de motivo, resolução e recorrência, concorrência e preservação de snapshots anteriores. Validar posteriormente a resposta real de `DESTINATION_NOT_WORKING`.
5. Preparar pacote do serviço privado segundo `tracking-mvp/deploy/PADRAO-DEPLOY-SERVIDOR.md`. A publicação no servidor não é parte da implementação local.

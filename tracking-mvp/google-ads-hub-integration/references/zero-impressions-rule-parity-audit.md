# Auditoria de paridade — regra `campaign_zero_impressions`

**Escopo:** comparação somente de leitura entre o cálculo e a avaliação de dias consecutivos sem impressões no Hub e no worker do servidor. Não cobre o botão de transferência, corte de autoridade, criação de jobs nem publicação.

## Resultado

O desenho atual mantém o Hub como fonte do histórico diário: o Hub calcula a sequência de dias e envia esse número e sua data de referência no snapshot. O servidor não tenta reconstruir o histórico a partir de suas tabelas; ele valida os campos recebidos e aplica a regra em modo shadow.

Nos caminhos inspecionados, a regra coincide quanto ao cálculo da sequência, ao limite inclusivo e às exclusões de campanhas históricas. A elegibilidade operacional no servidor é mais restrita ao exigir campanha habilitada, mapeamento válido e identidade de conta/campanha válida. Isso corresponde à proteção do Hub para efetuar uma pausa, que exige vínculo seguro; a lista local de candidatas ainda pode mostrar itens sem vínculo como “sem vínculo seguro — ignorada”.

## Evidência no código local

- `painel-operacao/src/database.js:1100`: `consecutiveZeroImpressionDays` usa os valores diários numéricos, substitui a data de referência pelo valor D0 informado e conta para trás enquanto cada data consecutiva existe e tem exatamente zero impressões. Uma lacuna, um valor diferente de zero ou a falta do próprio D0 encerra a sequência; sem D0 válido, retorna `null`.
- `painel-operacao/src/google-ads/google-ads-auto-pause-server-service.mjs:40-75`: ao montar `evaluationInputs`, o Hub calcula a sequência usando o `campaignInternalId`, a data D0 da conta e as impressões do snapshot atual. Envia `zeroImpressionStreakDays` e `zeroImpressionReferenceDate`; se não conseguir calcular uma sequência inteira não negativa, envia `null`. Também marca `excludedAsHistorical` quando o cadastro local não deve participar dessa regra.
- `painel-operacao/src/overview/view.js:477`: a avaliação local exige campanha `ENABLED`, ignora registros históricos, exige uma sequência inteira não negativa e considera candidata quando a sequência é maior ou igual ao limite configurado. O limite usado vem de `autoPauseZeroImpressionSettings.days`.
- `painel-operacao/src/overview/view.js:487` e `painel-operacao/src/google-ads/google-ads-auto-pause-server-service.mjs:172`: a política enviada ao servidor recebe o mesmo valor `autoPauseZeroImpressionSettings.days`; o normalizador da política limita o valor a inteiro entre 1 e 3650, com padrão 35.
- `tracking-mvp/tools/google-ads-auto-pause-worker.php` (trecho `hub_auto_pause_worker_evaluate_received_snapshots`): aceita snapshots D0/ALL completos, exige contas com consulta e configuração completas, ignora campanhas históricas marcadas, bloqueia falta de input ou divergência entre a data da sequência e a data da conta, exige campanha habilitada e identidade mapeada válida, e considera candidata quando `streak >= thresholdDays`. O padrão também é 35 dias.
- A avaliação salva `mode: shadow`; essa avaliação não é, por si só, uma chamada à Google Ads API para pausar campanha.

## Evidência operacional fornecida

Nas capturas recentes do phpMyAdmin, aparecem snapshots `schema_version = 2`, `snapshot_valid = true`, avaliações `partially_blocked` por bloqueios em outras regras e `candidate_count = 0`. A captura detalhada também mostra a regra de impressões sem candidatas. Isso confirma que o servidor está processando os snapshots recebidos; ainda não demonstra o caminho positivo de uma campanha elegível, pois não há um exemplo visível com candidata nessa regra.

## O que falta para fechar a validação empírica

Quando surgir um snapshot válido com pelo menos uma campanha habilitada, mapeada e com sequência acima do limite, comparar para o mesmo `source_snapshot_id`:

1. `zeroImpressionStreakDays` e `zeroImpressionReferenceDate` enviados pelo Hub;
2. configuração de limite enviada na política;
3. `candidate_count`, identidade da campanha e `thresholdDays` gravados em `result_json` pelo worker.

Se não surgir candidata, uma amostra com sequência abaixo do limite também permite confirmar a decisão negativa, mas não prova o caminho positivo. A auditoria não recomenda alterar o limiar nem assumir que os snapshots atuais cobrem esse cenário.

## Próximo trabalho independente

Manter uma consulta comparativa somente de leitura para um snapshot escolhido e registrar os campos acima. Esse acompanhamento não exige o botão de transferência e não muda quem tem autoridade para pausar. Qualquer mudança de regra ou no fluxo de transferência permanece fora deste documento.

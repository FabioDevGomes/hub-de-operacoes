# Sinal Automático da Curadoria

O cálculo está centralizado em `src/curadoria/automatic-signal-domain.mjs` (regra `1.0.0`). A UI compartilhada que monta o badge e o tooltip está em `automatic-signal-ui.mjs`. As listagens Lista de Gerente e E-commerce GM exibem a coluna ao lado da Decisão Manual, que continua independente.

## Dados considerados

| Pilar | Mapeamento da regra 1.0.0 |
| --- | --- |
| Google Trends | `up`/Em alta e `stable`/Estável = favorável; `down`/Em queda e `low_volume`/Volume baixo = cautela; `no_data`/Sem dados e `inconclusive`/Inconclusivo = insuficiente. |
| Google Imagens | `dominant`/Dominante = favorável; `mixed`/Mista e `scarce`/Escassa = cautela; `absent`/Ausente = desfavorável; `ambiguous`/Ambígua e `inconclusive`/Inconclusiva = insuficiente. Se o dado salvo tiver `refinementOf`, esse contexto é preservado. |
| Glimpse | `strong`/Forte = favorável; `medium`/Médio = cautela; `limited`/Dados limitados = insuficiente. O volume mensal existente é exibido no tooltip. “Sem análise” não participa da cobertura. |

Uma avaliação explicitamente salva como `Sem dados` conta como pilar avaliado; pilar sem avaliação não conta. Portanto, cobertura descreve avaliações disponíveis (0/3 a 3/3), não quantidade de resultados positivos.

## Agregação

- 0 pilares disponíveis → **Sem dados**.
- 1 pilar → **Inconclusivo**, mesmo que favorável ou desfavorável.
- 2 ou 3, todos favoráveis → **Positivo** (a cobertura permanece visível, por exemplo `Positivo · 2/3`).
- Há pelo menos um favorável e outro resultado → **Misto**.
- Sem favoráveis e com pelo menos um desfavorável → **Fraco**.
- Somente cautela e/ou evidência insuficiente → **Inconclusivo**.

A coluna apresenta resultado e cobertura; o tooltip lista Trends, Imagens, Glimpse, volume mensal e refinamento quando disponível. O cálculo consome índices dos dados atuais já carregados. As listagens atualizam seus índices após salvar Trends/Imagens e recarregam ao retornar da análise Glimpse; não fazem leitura de históricos por linha durante a renderização.

## Snapshot de decisão

Na transição manual para `Subir campanha`, `snapshot_decisao` congela `automatic_signal`, `automatic_signal_coverage`, `automatic_signal_version`, `automatic_signal_captured_at` e `automatic_signal_components`. Mudanças futuras nos pilares ou na regra não alteram snapshots existentes; não há preenchimento retroativo.

O sinal automático não altera nem recomenda uma decisão manual. Não usa ofertas/badges, SpyHero, performance operacional ou pontuação numérica.

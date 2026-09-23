# Importação MCC e Preparador

## Caminhos de importação

- Visão Geral/Excel e upload de manifesto usam `CampaignDatabase.importManifest()` em `src/database.js`.
- Preparador MCC é editado em `dist/preparador-MCC/index.html`, lê e grava o mesmo `painel-campanhas` e chama `/database.js` compartilhado.
- Ambos devem chamar o mesmo domínio; use `source` explícito (`hub_manifest_upload`, `hub_excel_sync`, `preparador_mcc`) para identificar origem dos eventos.
- O Preparador incrementa sua versão IndexedDB junto com a versão principal e deve ler eventos antes de importar e persistir eventos sem sobrescrita.

## Campos e estados

- D−1 contém métrica fechada; D0, métrica parcial.
- Chave de campanha é o nome MCC completo e exato; linha diária usa `campanha_id + data`.
- `Status da campanha` / `Estado da campanha` alimentam `estado_campanha` (estado operacional).
- `Status` / `Status de qualificação` alimentam `status_qualificacao`; não usar isso como estado de campanha.
- CPA desejado, impressões, cliques, conversões, valor de conversão, custo, custo médio, partes de impressão, orçamento, estratégia, moeda e conta mantêm propriedades próprias com `{valor, estado}`.
- GEO só é preservado se a fonte trouxer um campo explicitamente mapeado para alvo geográfico; não deduzir países pelo nome da oferta/campanha.
- Estado `ausente`, zero confirmado e `invalido` permanecem distintos.

## Comportamento seguro

- A lista MCC pode omitir campanhas pausadas; ausência pode alimentar o snapshot operacional existente, mas não gera evento de estado explícito, de entrega interrompida ou de suspensão de conta.
- Não registrar início de entrega sem um valor anterior do mesmo dia mostrando impressões e cliques zero, custo ausente ou zero válido, e sinal positivo atual. Um custo inválido não conta como zero.
- Uma alteração explícita de `estado_campanha` pode gerar `campaign_status_changed`; mudança de qualificação sozinha não.
- Não sobrescrever conflitos financeiros silenciosamente fora do fluxo de confirmação já existente.
- Após build, validar importação em memória ou teste. Não aplicar manifesto sintético nem importar CSV real para a base ativa.

## Reflexo no Controle Macro

- Política operacional acordada: não pedir nova importação da planilha para atualizações diárias; usar MCC D0 como parcial e D−1 como fechamento do dia anterior. Preservar o histórico da planilha já gravado.
- O Preparador grava D−1 no mesmo IndexedDB `painel-campanhas`, store `bases`, chave `atual`, e publica `BroadcastChannel('painel-campanhas')` com `type:'base-updated'` após persistir.
- Com o Controle Macro aberto em outra aba da mesma origem, o painel recebe o evento, restaura a base e recalcula os totais diários. Ao abrir/recarregar o painel, a base persistida também é restaurada e agregada. Não é necessária uma segunda importação do histórico da planilha.
- No Controle Macro, a planilha histórica continua prevalecendo campo a campo. Desde `2026-09-13`, MCC/D−1 só preenche cliques ou vendas ausentes na planilha; não substitui investimento, faturamento nem zeros explícitos. Antes dessa data, esses campos continuam conforme a planilha. Veja [Modelo e persistência](data-model.md) para as regras completas e o tratamento de suspensões/vendas.
- A regra anterior descreve o comportamento atual para datas já presentes no histórico legado. Em caso de sobreposição, não afirmar que MCC substituiu a planilha até essa precedência ser alterada no código; a orientação operacional, por si só, não muda a persistência existente.
- Se a tela não atualizar após a confirmação de sucesso, recarregue-a antes de repetir a importação. A atualização automática falhar não significa que se deva importar o mesmo arquivo novamente.

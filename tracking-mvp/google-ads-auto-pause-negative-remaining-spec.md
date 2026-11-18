# Especificação técnica — `negative_remaining` em modo sombra

**Estado:** implementação local preparada em modo sombra; publicação e paridade com snapshot real pendentes  
**Escopo:** avaliar no servidor a regra existente `negative_remaining`, em modo sombra  
**Fonte consultada:** cálculo da Visão geral no template local do Hub, contrato 2B e auditoria desta regra

## 1. Regra que já existe no Hub

O servidor deve espelhar o resultado que o Hub já apresenta na coluna **Valor restante**. O critério da regra é somente:

- `remainingValue < 0`: a campanha atende ao critério de saldo negativo;
- `remainingValue >= 0`: a campanha não atende a esse critério;
- valor ausente ou não numérico: o snapshot não permite avaliar esta regra.

O Hub já calcula `remainingValue` na linha da Visão geral, por meio de `overviewSnapshot()` e do caminho de cálculo usado por essa tela. A captura enviada ao servidor deve transportar esse valor calculado para a campanha. O servidor não deve criar outra fórmula financeira nem reinterpretar comissão, investimento, payout, ROI, câmbio, vendas ou a coluna legada P.

O número exibido na Visão geral é a referência. Se o cálculo existente no Hub mudar, o valor enviado pelo Hub acompanha a alteração; não se cria uma segunda implementação para manter em paralelo.

## 2. Vendas, saldo e proteções existentes

O `negative_remaining` usa o `Valor restante` exatamente como o Hub o produz hoje. Vendas só afetam o saldo na medida em que já estejam incluídas nesse cálculo do Hub. A especificação não soma diretamente `billing_sales`, não importa valores de GuruMedia/ClickBank para uma fórmula nova e não altera o saldo por fora.

Para esta regra, uma venda não é veto nem exceção: se o `remainingValue` calculado pelo Hub for negativo, a campanha atende ao critério mesmo quando `saleProtected=true` ou aparece na lista sincronizada de campanhas com venda. Vendas só afetam a decisão na medida em que já estejam refletidas no `Valor restante` calculado pelo Hub. O servidor não soma vendas novamente. A avaliação continua respeitando `negative_remaining.enabled`, a revisão da política, as exceções explícitas configuradas para esta regra, a identidade e a validade do valor. Proteções de venda seguem aplicáveis às outras regras que dependem delas.

Uma validação técnica de identidade da campanha e de disponibilidade do valor é necessária para associar o valor correto ao snapshot. Se essa associação ou o valor falhar, o resultado será **não avaliável por falha de dados**, sem transformar isso em um novo critério de negócio.

## 3. Fluxo técnico mínimo

1. O Hub calcula `remainingValue` pelo caminho já usado pela Visão geral.
2. O snapshot inclui `remainingValue` numérico (ou `null`) e `saleProtected` booleano por campanha, associados à chave existente `(managerCustomerId, customerId, campaignId)`. `saleProtected` continua no contrato schema 3, mas não veta `negative_remaining`.
3. O servidor valida que a identidade corresponde, que o valor é finito ou `null`, e que a proteção é booleana. Não recalcula saldo nem vendas.
4. O worker aplica o critério estrito `< 0` e respeita a configuração, as exceções explícitas existentes, a identidade e a validade do valor. Venda e indisponibilidade da lista de proteção não vetam `negative_remaining`; continuam protegendo as outras regras conforme a política.
5. Em sombra, registra o resultado por campanha no diagnóstico da avaliação ligada ao snapshot.

Não é necessário transportar linhas de venda, dados pessoais, uma reconstrução detalhada de fontes, outra cotação de câmbio ou todos os parâmetros internos usados pelo Hub para produzir o valor. A própria coluna já agrega o resultado do cálculo vigente.

## 4. Diagnóstico e segurança da etapa

O diagnóstico deve permitir identificar, por campanha:

- o `remaining_value` recebido;
- o estado: `candidate`, `not_candidate` ou `not_evaluable`;
- a causa técnica quando o valor ou a identidade não puderem ser avaliados;
- a revisão da política do Hub usada, incluindo configuração, proteções e exceções existentes.

Em modo sombra, o worker apenas persiste o diagnóstico da regra. Não cria jobs, não chama a Google Ads API, não pausa campanhas, não envia e-mails e não muda a autoridade Hub/servidor.

Snapshots antigos sem o campo podem continuar no histórico, mas ficam `not_evaluable` para esta regra; o servidor não reconstrói retroativamente valores nem trata ausência como zero.

## 5. Verificações de paridade

A validação desta regra cobre somente:

1. Hub e servidor recebem a mesma identidade de campanha e o mesmo `remainingValue`.
2. Valores negativos, zero e positivos produzem respectivamente candidato, não candidato e não candidato.
3. Regra desabilitada e exceção explícita da regra seguem a política já sincronizada; venda não veta esta regra.
4. Campo ausente/inválido ou identidade divergente produz `not_evaluable`, nunca candidato.
5. O worker mantém o comportamento de sombra, sem qualquer efeito de execução.

Não é objetivo desta especificação auditar separadamente cada origem de venda, reproduzir todos os ramos financeiros, impor cobertura MCC/ClickBank ou resolver reconciliação de faturamento. Esses assuntos só entram no escopo se alterarem primeiro a regra ou o cálculo existente no próprio Hub e forem aprovados como mudança separada.

## 6. Fases desta entrega

1. **Regra e fonte:** usar o `Valor restante` já calculado pelo Hub e registrar a semântica acima.
2. **Contrato mínimo:** schema 3 inclui `remainingValue` numérico (ou `null`) por campanha, mantendo schema 1/2 para compatibilidade histórica.
3. **Avaliação sombra:** aplica apenas `< 0`, respeitando regra habilitada, exceções explícitas e mapeamento. Venda não veta `negative_remaining`. Não cria jobs nem executa pausas.
4. **Paridade:** ainda pendente após publicação; comparar o valor recebido e a decisão em snapshots reais, incluindo negativos com e sem venda, zero, positivos, regra desabilitada e exceções.

Esta trilha continua em sombra e não cria jobs nem executa pausas. A ativação/criação de jobs reais e qualquer transferência de autoridade permanecem fora deste escopo e exigem etapa própria; o worker, porém, não deve vetar por venda um job `negative_remaining` que venha a ser autorizado.

## Próxima etapa detalhada

A validação de paridade está bloqueada por uma exigência global de disponibilidade da proteção GuruMedia observada na avaliação schema 3 mais recente. O delta mínimo e o plano de validação estão especificados em [Fase 4 — validação de `negative_remaining`](google-ads-auto-pause-negative-remaining-phase-4-spec.md). Esse pacote deve ser integrado à versão final compartilhada do worker sem alterar a chave global de autoridade.

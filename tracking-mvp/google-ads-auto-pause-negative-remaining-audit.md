# Auditoria da regra `negative_remaining`

**Data:** 2026-11-17  
**Fase:** 1 — auditoria da regra  
**Estado:** regra implementada localmente em modo sombra; uma avaliação schema 3 real foi observada e revelou um bloqueio global de proteção que diverge da especificação. Correção local preparada; nova avaliação e paridade pendentes após publicação.  
**Base consultada:** `tracking-mvp/.phase2-hub-stage/src/index.template.html`, `src/billing/billing-domain.mjs`, `docs/maintenance.md`, a referência local `billing.md`, o contrato 2B e o worker PHP.

## Achados confirmados no caminho de cálculo atual

1. O template da Visão geral cria `remainingValue` para cada linha e `overviewTableSnapshot()` reutiliza `overviewSnapshot({includeCards:false})`. Assim, o snapshot de tabela já parte do mesmo resultado calculado para a Visão geral.
2. No caminho atual do Hub, o cálculo desse valor usa os totais consolidados com fallback D0, ajustes existentes de venda, parâmetros de campanha e da configuração de limite de teste; quando o orçamento não é calculado, há fallback para a coluna P. Esses são detalhes internos do cálculo do Hub, não novos critérios a serem reimplementados pelo servidor.
3. A regra observada trata somente saldo estritamente negativo como candidato; zero e valores positivos não são candidatos.
4. `overview-domain.js` não está presente no conjunto `.phase2-hub-stage` deste checkout. Como a decisão aprovada é transportar o resultado calculado pelo Hub, revisar internamente toda a fórmula não é pré-requisito para uma cópia fiel do mesmo `remainingValue`.

## Faturamento GuruMedia/ClickBank e duplicidade

O template carrega `billing_sales` e cria `overviewBillingRevenueByCampaign` usando `BillingDomain.aggregateBillingRevenueByCampaign`. Essa agregação é associada a `campaign_id`, separada por período, informa `complete`, quantidade de registros e valores ausentes; converte para BRL com a taxa recebida e exclui linhas inativas. No trecho revisado, porém, esse mapa de faturamento não é passado à chamada de `deriveTestBudget`. A chamada recebe `allTimeTotals.commission`, calculado do consolidado da campanha e dos ajustes acima.

Conclusão: **não há evidência no caminho revisado de que as comissões GuruMedia ou ClickBank importadas em `billing_sales` alterem diretamente o `remainingValue` atual**. A documentação do Hub também diz que:

- a importação GuruMedia cobre os últimos 366 dias;
- o Faturamento separa essas vendas dos agregados de conversão MCC;
- vendas importadas podem coexistir com agregados MCC e inflar totais até a fase de conciliação, sem pareamento automático por data/valor.

Essa incerteza não autoriza o servidor a somar vendas importadas ao saldo nem a criar novos bloqueios comerciais para esta regra. O servidor deve usar o `remainingValue` calculado pelo Hub e respeitar, separadamente, as proteções e exceções já existentes na política sincronizada. Se uma futura alteração no Hub mudar quais vendas entram no cálculo ou nas proteções, o servidor acompanha a saída/configuração aprovada do Hub; não deduz novas fontes.

## Matriz provisória de origem e tratamento

| Dado | Evidência no Hub | Consequência para servidor |
|---|---|---|
| `remainingValue` | Resultado numérico já calculado pelo Hub para a linha da campanha | Copiar para o snapshot. O servidor não transporta nem reimplementa seus componentes financeiros. |
| Configuração e proteções da regra | Política, exceções e proteções já sincronizadas do Hub | Reutilizar sem ampliar critérios ou criar novos limiares. |
| Valor/identidade indisponível | Falha técnica de captura ou associação | Registrar como não avaliável; nunca converter ausência em zero ou candidato. |

## Implementação preparada

1. O Hub calcula o mapa de `remainingValue` a partir de `overviewSnapshot()` depois que a captura automática foi salva.
2. Schema 3 leva `remainingValue` e o indicador `saleProtected` por campanha, ligado à identidade existente. Schema 1 e 2 continuam aceitos para histórico e regras anteriores.
3. O worker registra por campanha o valor e estado `candidate`, `not_candidate` ou `not_evaluable`; o critério de saldo é somente `< 0`.
4. Regra desabilitada, exceção explícita, campanha histórica e falha de identidade seguem os controles existentes. Venda não veta `negative_remaining`.
5. A validação com dados reais permanece pendente até o usuário publicar os arquivos e surgir uma nova captura schema 3.

## Decisão técnica registrada

Não expandir `negative_remaining` para outros cenários. Seu único critério de negócio é `remainingValue < 0`, calculado pelo Hub. Regra habilitada, exceções e proteções continuam sendo as configurações existentes do Hub. O servidor recebe o valor pronto e faz a avaliação sombra; validação de identidade e valor finito é integridade técnica do payload, não nova regra de pausa.

Não foram criados jobs, chamadas à API do Google Ads, e-mails ou pausas. A alteração local não equivale à publicação no servidor.

## Evidência operacional e correção do gate global — 2026-11-17

Na avaliação do snapshot `2026-11-17T20:18:18.513Z:krinpsd3`, recebido às 20:20:44 UTC e avaliado às 20:25:02 UTC, a regra `negative_remaining` ficou `partially_blocked`: `blocked_reasons` registrou `gurumedia_protection_unavailable: 133` e a lista de candidatos ficou vazia. O worker já exige e valida `saleProtected` como booleano por campanha em schema 3, mas também exigia que o status global da lista GuruMedia fosse `available`. Essa segunda exigência impediu a comparação do `remainingValue` em todas as 133 campanhas.

A correção inicial removeu o bloqueio global apenas da avaliação sombra. Na revisão seguinte, o usuário esclareceu que venda também não deve ser veto quando `remainingValue < 0`. O ajuste local atual remove para `negative_remaining` os vetos por `saleProtected`, pela lista individual sincronizada e pela indisponibilidade global, tanto na avaliação sombra quanto na validação de job. As outras regras mantêm suas proteções de venda. Exceções explícitas configuradas para `negative_remaining`, habilitação da regra, identidade e validação do valor continuam aplicáveis. A avaliação segue em sombra e não cria jobs nem pausa campanhas.


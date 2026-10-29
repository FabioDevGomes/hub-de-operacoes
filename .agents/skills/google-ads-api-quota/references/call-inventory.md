# Inventário das chamadas Google Ads API do Hub

**Revisado em:** 2026-10-28  
**Escopo:** código local do Hub e os dois serviços PHP-fonte que chamam diretamente `googleads.googleapis.com`; não mede o tráfego real nem confirma, por si só, o conteúdo instalado na Hostinger. A varredura do checkout local encontrou esses dois serviços como os caminhos diretos da Google Ads API.

## Como contar

O navegador envia POSTs autenticados ao proxy privado. O proxy gera um access token de conta de serviço via OAuth e então chama a Google Ads API v26. No código atual, cada POST ao proxy troca um JWT por access token; essa chamada de autenticação aumenta latência/rede, mas não é uma operação Google Ads da cota diária.

Para a cota Google Ads:

- Cada `Search` ou `SearchStream` é **1 operação**, mesmo que retorne milhares de linhas ou vários chunks.
- Cada recurso/elemento dentro de uma chamada mutate é **1 operação**. Não conte somente um mutate HTTP como uma operação.
- `customers:listAccessibleCustomers` e outras requisições que não são Search nem mutate contam como **1 operação** cada.
- Rejeições `GoogleAdsFailure` que chegam ao Google Ads podem contar. Falhas de rede que nunca alcançam o serviço Google não contam.
- A janela de “por dia” do nível Explorer é móvel de 24 horas, não um reset garantido à meia-noite.

Confira os limites atuais no projeto, pois o nível pode mudar. A documentação oficial consultada em 2026-10-28 informa, para tráfego de produção: Explorer até 2.880 operações em 24 horas; Basic até 15.000; Standard sem limite diário de operações, ainda sujeito a limites de taxa/serviço. O nível Explorer também limita funcionalidades específicas. [Acesso e limites](https://developers.google.com/google-ads/api/docs/api-policy/access-levels), [regras de contagem e cotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas), [rate sheet](https://developers.google.com/google-ads/api/docs/api-policy/rate-sheet).

## Caminho de transporte

| Camada | Código | Efeito |
|---|---|---|
| Cliente HTTP comum | `src/google-ads/google-ads-http-client.mjs` | POST com Bearer do Hub, CORS, `cache: no-store`, timeout de 45 s; não implementa retry automático. |
| Serviço de consulta | `src/google-ads/google-ads-service.mjs` | `https://track.travenzo.shop/google-ads-readonly.php`. |
| Serviço de ações/criação | `src/google-ads/google-ads-campaign-actions-service.mjs`, `src/google-ads/google-ads-campaign-creation-service.mjs` | `https://track.travenzo.shop/google-ads-campaign-action.php`. |
| Consulta Google Ads | Checkout irmão `voc-meu-analista-de-dados-e/tracking-mvp/tools/google-ads-readonly-service.php` | Autenticação OAuth em cada POST e helper `hub_google_ads_search()` via `googleAds:searchStream`. |
| Ações e criação | Checkout irmão `voc-meu-analista-de-dados-e/tracking-mvp/tools/google-ads-campaign-action-service.php` | Reutiliza OAuth/GAQL do PHP de consulta e envia mutate quando a operação autorizada exige alteração. |

No cliente há um POST do Hub por operação; esse número **não** é a cota Google Ads. Um POST de relatório pode resultar em três `SearchStream`s. A resposta pública `google-ads-readonly.php` é um wrapper e não é uma consulta Google Ads adicional.

## Operações de leitura

O custo abaixo é por uma chamada bem-sucedida do endpoint, salvo quando a linha diz que varia. Uma resposta opcional que falha ainda pode gastar uma operação se a solicitação chegou ao Google Ads.

| Operação enviada pelo Hub | Chamadas Google Ads dentro do PHP | Custo típico | Uso encontrado no Hub |
|---|---|---:|---|
| `accounts` | 1 `customers:listAccessibleCustomers`; para cada customer acessível, 1 consulta de detalhes; se essa consulta falhar, há uma tentativa alternativa com `login-customer-id`; para cada raiz que é MCC, 1 consulta `customer_client`. | `1 + detalhes por raiz + fallback que ocorrer + 1 por MCC`. | Botão para atualizar MCCs/contas nas telas Google Ads API, termos de pesquisa e criação. A rotina automática lê o diretório em cache e não repete esta descoberta. |
| `conversion_actions` | Uma consulta fixa ao recurso `conversion_action`. | 1 | Seleção de ação de conversão por MCC na tela Tracking GuruMedia. Apenas leitura. |
| `campaign_config` | Inventário de campanhas + moeda/fuso da conta; se alguma campanha usar estratégia de portfólio, também consulta `accessible_bidding_strategy`. | 2; condicionalmente 3 | Captura/prévia e atualização automática; também preflight da pausa automática na Visão Geral. |
| `report` | Consulta principal de métricas + consulta de parcela de impressão + consulta de moeda/fuso. | 3 no caminho completo | Relatório agregado por conta/período na tela Google Ads API. |
| `daily_report` | Métricas por campanha/data + parcelas de impressão por data + moeda/fuso. | 3 no caminho completo | Prévia, comparação, captura manual e captura D0 automática. |
| `sao_paulo_day_report` | Moeda/fuso + métricas segmentadas por hora para formar o dia civil de São Paulo. | 2 | Prévia/fechamento de ontem e D−1 automática. Filtro `ENABLED` muda a consulta, não acrescenta outra. |
| `search_term_campaigns` | Uma lista de campanhas Search. | 1 | Montagem sob demanda do seletor de campanha em termos de pesquisa. |
| `search_terms` | Uma consulta de `search_term_view`, com intervalo e filtro de campanha opcional. | 1 | Consulta explícita de termos de pesquisa. |

`report` e `daily_report` sempre tentam as consultas complementares depois da consulta principal. Se o relatório principal falhar, o fluxo para após essa falha; se uma métrica complementar for recusada, a função pode conservar o relatório, mas a requisição recusada ainda pode contar. Um `SearchStream` não deve ser multiplicado pelo número de campanhas retornadas.

### Descoberta de contas

A consulta `accounts` pode custar mais que um único request: ela percorre cada identidade acessível, tenta obter detalhes e expande cada MCC. O navegador salva o resultado em `hub.google-ads-account-directory:v1`; a rotina automática reutiliza esse diretório. Atualize a lista quando houver mudança de acesso ou estrutura das MCCs, não a cada rodada de métricas.

## Ações, criação e mutações

Todas essas operações usam o endpoint `google-ads-campaign-action.php`. Os controles de escrita no PHP e a lista de MCCs permitidas podem impedir uma ação antes de chamar o Google Ads.

| Operação | Chamadas de leitura Google Ads | Mutação Google Ads | Situação no Hub |
|---|---:|---:|---|
| `capabilities` | 1 consulta da hierarquia se a escrita estiver habilitada e a MCC for permitida; caso contrário, 0. | 0 | Usada para exibir/validar ações de campanha e como preflight da pausa automática. |
| `pause_campaign` / `enable_campaign` | 2 consultas para confirmar vínculo da conta e reler a campanha. Se a mudança for aceita, acrescenta 1 consulta de verificação. | 0 se já estiver no estado de destino; 1 operação mutate se realmente mudar. | Botões da coluna Ação e pausa automática. O servidor revalida o status para evitar mudança baseada em leitura velha. |
| `preview_search_campaign` | 4: vínculo na MCC, moeda, resolução de países e nome duplicado. | Envia a lista de `mutateOperations` com `validateOnly`; não altera a conta. Conte o custo de forma conservadora pelo número de itens enviados, não como zero. | Prévia explicitamente acionada na criação assistida. |
| `create_search_campaign` | As mesmas 4 consultas, mais 1 releitura para verificar a campanha criada. | 1 operação por item enviado: `7 + países + palavras-chave negativas + palavras-chave positivas`. | Criação só depois de confirmação; a campanha nasce pausada. |
| `apply_audience_targeting` / `apply_configured_audience_targeting` | 4 consultas-base: vínculo, grupo/campanha alvo, catálogo de interesses e catálogo de listas; adiciona consulta(s) condicional(is) para detectar itens existentes e verificar resultado. | Uma operação por critério novo; pode haver uma operação adicional de configuração de targeting. Sem operação pendente, não há mutate. | Ações explícitas da tela de criação assistida. |
| `apply_audience_exclusions` | 3 consultas-base: vínculo, campanha alvo e catálogo; mais consulta(s) para critérios já presentes/verificação quando houver interesses resolvidos. | Uma operação por exclusão nova ou reativada. Sem alteração pendente, não há mutate. | Ação explícita da tela de criação assistida. |
| `creation_capabilities` | 1 consulta de hierarquia se criação estiver habilitada e MCC permitida; caso contrário, 0. | 0 | Ramo existente no PHP; não foi encontrado chamador no código atual do Hub. |
| `campaign_templates` | 2 no caminho sem campanha candidata; pode chegar a 6 conforme candidatos sobrevivem à leitura de grupos, anúncios, critérios e palavras-chave. | 0 | Ramo existente no PHP; não foi encontrado chamador no código atual do Hub. |

Uma pausa automática real, conforme o código da Visão Geral, usa por conta e por execução um preflight `capabilities` (1 consulta) e `campaign_config` (2–3 consultas); respostas bem-sucedidas são reutilizadas para as demais candidatas daquela conta, e falhas não são mantidas em cache. Cada campanha que chega à mudança ainda gera no serviço privado 2 consultas de segurança (vínculo MCC/conta e status atual), 1 mutate operation e 1 consulta de verificação do estado final. Portanto, para `P` pausas efetivas na mesma conta, estime **3–4 + 3P SearchStream e P mutate operations**. Exemplo: três pausas, 12–13 SearchStream + 3 mutate operations; repetir o preflight por candidata teria custado 18–21 SearchStream. A configuração compartilhada é somente um atalho de leitura dentro da execução: o servidor mantém as verificações imediatamente antes e depois de cada escrita.

O mutate de criação envia `7 + países + palavras negativas + palavras positivas` itens porque orçamento, campanha, grupo, anúncio, asset de promoção e vínculo do asset são operações individuais, além dos critérios de localização e palavras-chave. `validateOnly` evita aplicar a mudança, mas continua sendo uma chamada de validação à API; não contabilize a prévia como gratuita ao estimar carga. A referência oficial explica `validate_only` e a contagem por item: [validação mutate](https://developers.google.com/google-ads/api/docs/concepts/api-structure), [rate sheet](https://developers.google.com/google-ads/api/docs/api-policy/rate-sheet).

## Captura agendada: principal consumo recorrente

O agendador `src/google-ads/google-ads-auto-update.mjs` roda enquanto o Hub estiver aberto, usa no máximo 2 contas em paralelo e consulta o diretório em cache:

- D0: por conta, `daily_report` (3 consultas no caminho completo) + `campaign_config` (2–3) = **5–6 operações por conta e ciclo**.
- D−1: por conta, `sao_paulo_day_report` (2) + `campaign_config` (2–3) = **4–5 operações por conta e fechamento**.
- O intervalo D0 pode ser 30, 40, 50 minutos ou 1, 2, 4, 6, 12 ou 24 horas; o padrão continua sendo 1 hora. D−1 roda após 06:00 em São Paulo e, quando falha, tenta novamente de hora em hora até completar. Ao retornar após dias com o Hub fechado, recupera datas pendentes em ordem, uma por lote, com cinco minutos entre lotes concluídos, dentro da janela local de 14 dias (13 datas fechadas, pois hoje não é D−1).
- Cada dia D−1 recuperado repete as mesmas 4–5 operações por conta. Um backlog de `B` datas acrescenta `A × B × (4–5)` operações ao período de recuperação, além de D0 e de retries por falhas; essa carga ocorre no projeto quando a consulta chega ao Google Ads.

Fórmula conservadora para um dia com `A` contas e intervalo D0 `I` horas, sem falhas nem ação automática:

`A × (24 ÷ I) × (5–6) + A × (4–5)`

Exemplo matemático com 9 contas e D0 de 1 hora: aproximadamente **1.116–1.341 operações/dia**, antes de prévias manuais, diretório, termos, pausa automática, erros que chegaram ao Google Ads ou uso de outras ferramentas no mesmo projeto. Isso equivale a cerca de 39–47% de 2.880, se o projeto ainda estiver no nível Explorer. É só uma estimativa derivada do código, não leitura de uso real.

Para as novas opções de frequência, estimativa teórica com 9 contas e navegador aberto continuamente por 24 horas, incluindo um fechamento D−1 bem-sucedido por conta:

| Intervalo D0 | Ciclos D0/dia | Operações estimadas/dia | Parcela de 2.880 (Explorer) |
|---|---:|---:|---:|
| 30 min | 48 | 2.196–2.637 | 76–92% |
| 40 min | 36 | 1.656–1.989 | 58–69% |
| 50 min | ~29 | 1.332–1.611 | 46–56% |

Faixas calculadas pela fórmula acima; o agendador agenda a próxima captura depois que a atual termina, então o número real de ciclos tende a ser um pouco menor. Não inclui consultas manuais, contas além das nove usadas no exemplo, retries de falha, outras ferramentas/profiles no mesmo projeto ou consumo real. Em Explorer, 30 minutos deixa pouca margem para esses usos; 40 e 50 minutos reduzem a pressão progressivamente. Em Basic, o limite diário de operações é 15.000; em Standard não há limite diário, mas ambos seguem sujeitos a limites de taxa/serviço. Consulte a métrica móvel de 24 horas do projeto antes de concluir o nível ou a folga real.

## Padrão de falha e telemetria

- O cliente comum tem timeout de 45 s, mapeia 429 para `google_ads_quota_exceeded` e não faz retry automático.
- O agendador D−1 tenta novamente na hora seguinte se o fechamento falhar. Repetições manuais também geram novas operações quando a solicitação chega ao Google Ads.
- Não foi encontrado contador persistente de operações nem latência por operação no proxy. O código local permite estimar, mas não responder quanto o projeto consumiu de fato.
- Para um diagnóstico real, compare as métricas/quota da Google Ads API no Google Cloud com o intervalo móvel de 24 h e registre os horários de captura. Se implementar telemetria, conte a operação específica e o resultado HTTP de forma agregada; não armazene tokens, GAQL completo, ID/nome de cliente ou payload.

## Prioridades para reduzir carga sem perder dados

1. **Frequência:** se a regra de pausa não exigir reação horária, aumentar o intervalo D0 reduz o consumo recorrente quase na mesma proporção, mas atrasa status, saldo e reação automática. Não altere o padrão sem alinhar essa consequência.
2. **Diretório:** continuar reutilizando o cache MCC/contas; não chamar `accounts` em cada captura.
3. **Pausa automática:** agrupar capability/configuration preflight por conta dentro da mesma avaliação é o maior alvo observado. A mutação deve continuar relendo o estado da campanha no servidor; nunca confiar só no status guardado no navegador.
4. **Consultas complementares:** avaliar se metadados/parcelas podem ser reutilizados da mesma resposta ou diretório sem mudar a semântica. Não remova campos necessários só para diminuir o número de operações.
5. **Concorrência e repetição:** manter limite global coerente, evitar duas execuções concorrentes e introduzir backoff seletivo para 429/5xx se o fluxo vier a fazer retry. Não repetir automaticamente 4xx de autenticação/permissão.
6. **Janela de 24 h:** usar dados históricos já persistidos conforme a decisão do usuário. O snapshot conta/data atual é substituído pela próxima captura da mesma data; para janela móvel, preservar snapshots das chamadas já existentes no armazenamento local, sem uma consulta extra à API.

## Fontes de código

- Cliente e operações de leitura: `src/google-ads/google-ads-http-client.mjs`, `src/google-ads/google-ads-service.mjs`.
- Atualização agendada e uso do diretório: `src/google-ads/google-ads-auto-update.mjs`, `src/google-ads/google-ads-accounts-cache.mjs`.
- Chamadores de tela: `src/google-ads/google-ads-view.mjs`, `src/google-ads/google-ads-search-terms-view.mjs`, `src/google-ads/google-ads-search-terms-controller.mjs`, `src/tracking/tracking-gurumedia-view.mjs`, `src/google-ads/google-ads-campaign-creation-view.mjs`.
- Pausa e preflight na Visão Geral: `src/overview/view.js`, `src/index.template.html`.
- Serviço privado de leitura no checkout irmão: `voc-meu-analista-de-dados-e/tracking-mvp/tools/google-ads-readonly-service.php` (sob a pasta comum `Documents/Codex/2026-08-23`).
- Serviço privado de ação/criação no checkout irmão: `voc-meu-analista-de-dados-e/tracking-mvp/tools/google-ads-campaign-action-service.php` (sob a pasta comum `Documents/Codex/2026-08-23`).


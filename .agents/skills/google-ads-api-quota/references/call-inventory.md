# Inventário das chamadas Google Ads API do Hub

**Revisado em:** 2026-11-03  
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
| Consulta Google Ads | Projeto integrado `tracking-mvp/tools/google-ads-readonly-service.php` | Autenticação OAuth em cada POST e helper `hub_google_ads_search()` via `googleAds:searchStream`. |
| Ações e criação | Projeto integrado `tracking-mvp/tools/google-ads-campaign-action-service.php` | Reutiliza OAuth/GAQL do PHP de consulta e envia mutate quando a operação autorizada exige alteração. |

No cliente há um POST do Hub por operação; esse número **não** é a cota Google Ads. Um POST de relatório pode resultar em três `SearchStream`s. A resposta pública `google-ads-readonly.php` é um wrapper e não é uma consulta Google Ads adicional.

## Operações de leitura

O custo abaixo é por uma chamada bem-sucedida do endpoint, salvo quando a linha diz que varia. Uma resposta opcional que falha ainda pode gastar uma operação se a solicitação chegou ao Google Ads.

| Operação enviada pelo Hub | Chamadas Google Ads dentro do PHP | Custo típico | Uso encontrado no Hub |
|---|---|---:|---|
| `accounts` | 1 `customers:listAccessibleCustomers`; para cada customer acessível, 1 consulta de detalhes; se essa consulta falhar, há uma tentativa alternativa com `login-customer-id`; para cada raiz que é MCC, 1 consulta `customer_client`. | `1 + detalhes por raiz + fallback que ocorrer + 1 por MCC`. | Botão para atualizar MCCs/contas na tela Snapshots da Operação, em Termos de Pesquisa e na tela de criação. A rotina automática lê o diretório em cache e não repete esta descoberta. |
| `conversion_actions` | Uma consulta fixa ao recurso `conversion_action`. | 1 | Seleção de ação de conversão por MCC em **Integrações → Configurações globais**. Apenas leitura. |
| `campaign_config` | Inventário de campanhas + moeda/fuso da conta; se alguma campanha usar estratégia de portfólio, também consulta `accessible_bidding_strategy`. | 2; condicionalmente 3. Na captura D0 automática com contexto assinado válido, elimina a busca de moeda/fuso. | Captura/prévia e atualização automática; também preflight da pausa automática na Visão Geral. |
| `report` | Consulta principal de métricas + consulta de parcela de impressão + consulta de moeda/fuso. | 3 no caminho completo | Relatório agregado por conta/período na tela Snapshots da Operação. |
| `daily_report` | Métricas por campanha/data + parcelas de impressão por data + moeda/fuso. | 3 no caminho completo; 2 na captura D0 automática com contexto assinado válido. | Prévia, comparação, captura manual e captura D0 automática. |
| `sao_paulo_day_report` | Moeda/fuso + métricas segmentadas por hora para formar o dia civil de São Paulo. | 2 | Prévia/fechamento de ontem e D−1 automática. Filtro `ENABLED` muda a consulta, não acrescenta outra. |
| `search_term_campaigns` | Uma lista de campanhas Search. | 1 | Montagem sob demanda do seletor de campanha em termos de pesquisa. |
| `search_terms` | Uma consulta de `search_term_view`, com intervalo e filtro de campanha opcional. | 1 | Consulta explícita de termos de pesquisa; com o PHP somente leitura instrumentado, a resposta confirma a quantidade real de chamadas enviadas à Google Ads API. O atalho **Termos · ontem + hoje** no histórico também faz uma chamada para a conta/campanha selecionada. Só há uma consulta de contas antes disso se o usuário precisar atualizar um diretório local sem o vínculo exato. |
| `geographic_report` | Uma consulta `user_location_view` por conta; se vierem países, uma segunda consulta `geo_target_constant` resolve nomes/códigos. | 1–2 por conta/dia | Rotina automática após 20h (São Paulo), somente no modo API com Atualização automática ativada e Hub aberto. Cada chamada consulta a janela de até 14 datas fechadas de uma vez; não dispara por snapshot ou por clique. Os relatórios ficam salvos localmente e outras telas podem reutilizá-los sem nova chamada. |

`report` e `daily_report` sempre tentam as consultas complementares depois da consulta principal. Se o relatório principal falhar, o fluxo para após essa falha; se uma métrica complementar for recusada, a função pode conservar o relatório, mas a requisição recusada ainda pode contar. Um `SearchStream` não deve ser multiplicado pelo número de campanhas retornadas.

### Descoberta de contas

A consulta `accounts` pode custar mais que um único request: ela percorre cada identidade acessível, tenta obter detalhes e expande cada MCC. O navegador salva o resultado em `hub.google-ads-account-directory:v1`; a rotina automática reutiliza esse diretório. Atualize a lista quando houver mudança de acesso ou estrutura das MCCs, não a cada rodada de métricas.

## Ações, criação e mutações

Todas essas operações usam o endpoint `google-ads-campaign-action.php`. Os controles de escrita no PHP e a lista de MCCs permitidas podem impedir uma ação antes de chamar o Google Ads.

| Operação | Chamadas de leitura Google Ads | Mutação Google Ads | Situação no Hub |
|---|---:|---:|---|
| `capabilities` | 1 consulta da hierarquia se a escrita estiver habilitada e a MCC for permitida; caso contrário, 0. | 0 | Usada para exibir/validar ações de campanha e como preflight da pausa automática. |
| `pause_campaign` / `enable_campaign` | 2 consultas para confirmar vínculo da conta e reler a campanha. Se a mudança for aceita, acrescenta 1 consulta de verificação. | 0 se já estiver no estado de destino; 1 operação mutate se realmente mudar. | Botões da coluna Ação e pausa automática. O servidor revalida o status para evitar mudança baseada em leitura velha. |
| `prepare_search_campaign_preview_contexts` | Consultas compartilhadas por conta/geo e conversão/MCC. Com a lista de nomes, acrescenta `ceil(n/40)` `SearchStream`s por conta, onde `n` é a quantidade de nomes distintos daquela conta. | 0 | Prepara contextos assinados e, no PHP atualizado, agrupa a leitura de nomes usada pela prévia. O serviço legado rejeita o campo opcional antes de consultar o Google e o Hub volta ao modo individual. |
| `preview_search_campaign` | 0 leituras extras quando recebe os contextos assinados de conta/geo e nome; sem o token agrupado, faz 1 busca de nome. Sem contexto compartilhado, o caminho antigo pode fazer até 4 leituras (vínculo, moeda, países e nome). Campanha existente acrescenta 1 consulta de grupo de anúncios. | Para nome livre, envia os itens `mutateOperations` com `validateOnly`; não altera a conta. Conte cada item enviado como operação, não como zero. Campanha existente não recebe `validateOnly`. | Prévia explicitamente acionada na criação assistida; a consulta de nome do lote ocorre na preparação compartilhada. |
| `create_search_campaign` | As mesmas 4 consultas, mais 1 releitura para verificar a campanha criada. | 1 operação por item enviado: `7 + países + palavras-chave negativas + palavras-chave positivas`. | Criação só depois de confirmação; a campanha nasce pausada. |
| `apply_audience_targeting` / `apply_configured_audience_targeting` | 4 consultas-base: vínculo, grupo/campanha alvo, catálogo de interesses e catálogo de listas; adiciona consulta(s) condicional(is) para detectar itens existentes e verificar resultado. | Uma operação por critério novo; pode haver uma operação adicional de configuração de targeting. Sem operação pendente, não há mutate. | Ações explícitas da tela de criação assistida. |
| `apply_audience_exclusions` | 3 consultas-base: vínculo, campanha alvo e catálogo; mais consulta(s) para critérios já presentes/verificação quando houver interesses resolvidos. | Uma operação por exclusão nova ou reativada. Sem alteração pendente, não há mutate. | Ação explícita da tela de criação assistida. |
| `apply_existing_campaign_eu_political_advertising_declaration_batch` | Por conta: 1 consulta de hierarquia + 1 consulta agrupada das campanhas. Se houver divergências, acrescenta 1 consulta agrupada para verificar. | Uma operação `CampaignService.MutateCampaigns` por campanha divergente. Nenhuma mutação para campanhas já declaradas como não políticas. | Ação explícita do lote salvo; uma solicitação privada por conta, com progresso/checkpoints e cota agregada salvos no lote. |
| `creation_capabilities` | 1 consulta de hierarquia se criação estiver habilitada e MCC permitida; caso contrário, 0. | 0 | Ramo existente no PHP; não foi encontrado chamador no código atual do Hub. |
| `campaign_templates` | 2 no caminho sem campanha candidata; pode chegar a 6 conforme candidatos sobrevivem à leitura de grupos, anúncios, critérios e palavras-chave. | 0 | Ramo existente no PHP; não foi encontrado chamador no código atual do Hub. |

Uma pausa automática real, conforme o código da Visão Geral, usa por conta e por execução um preflight `capabilities` (1 consulta) e `campaign_config` (2–3 consultas); respostas bem-sucedidas são reutilizadas para as demais candidatas daquela conta, e falhas não são mantidas em cache. Cada campanha que chega à mudança ainda gera no serviço privado 2 consultas de segurança (vínculo MCC/conta e status atual), 1 mutate operation e 1 consulta de verificação do estado final. Portanto, para `P` pausas efetivas na mesma conta, estime **3–4 + 3P SearchStream e P mutate operations**. Exemplo: três pausas, 12–13 SearchStream + 3 mutate operations; repetir o preflight por candidata teria custado 18–21 SearchStream. A configuração compartilhada é somente um atalho de leitura dentro da execução: o servidor mantém as verificações imediatamente antes e depois de cada escrita.

O mutate de criação envia `7 + países + palavras negativas + palavras positivas` itens porque orçamento, campanha, grupo, anúncio, asset de promoção e vínculo do asset são operações individuais, além dos critérios de localização e palavras-chave. `validateOnly` evita aplicar a mudança, mas continua sendo uma chamada de validação à API; não contabilize a prévia como gratuita ao estimar carga. A referência oficial explica `validate_only` e a contagem por item: [validação mutate](https://developers.google.com/google-ads/api/docs/concepts/api-structure), [rate sheet](https://developers.google.com/google-ads/api/docs/api-policy/rate-sheet).

### Prévia de campanha em lote

Com o serviço privado atualizado, a consulta de nome usa uma busca por conta para cada bloco de até 40 nomes distintos. Para uma conta com `n` nomes, isso troca `n` pesquisas individuais por `ceil(n/40)`; a economia é `n - ceil(n/40)` operações SearchStream. Exemplo: 20 nomes distribuídos por cinco contas (quatro por conta) passam de 20 para 5 buscas, economia estimada de 15 operações. `validateOnly` permanece por campanha livre, e a criação confirmada faz uma leitura de nome nova para evitar duplicidade. O Hub exibe quantas buscas agrupadas foram executadas. Esse cálculo é derivado do código, não é uma leitura de uso real do projeto.

## Contexto de metadados assinado nas capturas D0

O diretório local já contém moeda e fuso obtidos na descoberta de contas. Na captura automática D0, o Hub envia um contexto opaco assinado pelo serviço privado; o servidor o aceita somente para a mesma MCC/conta, com assinatura válida, validade de 24 horas e data igual ao dia atual no fuso assinado. O serviço emite/renova o token após uma consulta ao Google Ads quando ele está ausente ou expirado. O Hub o guarda no registro local da conta sem alterar os timestamps do diretório.

Com token válido, `daily_report` e `campaign_config` deixam de fazer cada um sua busca redundante de moeda/fuso: economia de até 2 operações por conta/ciclo. Com D0 a cada 2 horas, a estimativa é cerca de 22 operações economizadas por conta em uma janela de 24 horas: 11 ciclos reutilizam o token, e o ciclo seguinte consulta e renova os metadados. Se o serviço privado antigo recusar o payload opcional, o cliente repete uma vez no formato antigo, sem aplicar mutação. Capturas D−1, prévias e consultas manuais não usam esse contexto. A emissão, o consumo e a expiração não fazem chamadas adicionais além das leituras que já existiam. Isso é uma estimativa derivada do código, não uma medição de uso real.

## Captura agendada: principal consumo recorrente

O agendador `src/google-ads/google-ads-auto-update.mjs` roda enquanto o Hub estiver aberto, usa no máximo 2 contas em paralelo e consulta o diretório em cache:

- D0: por conta, `daily_report` (2 consultas com contexto assinado válido; 3 na primeira leitura ou se o token vencer) + `campaign_config` (1–2 com contexto válido; 2–3 sem contexto) = **3–4 operações por conta e ciclo** com cache aquecido, ou 5–6 na renovação/fallback.
- D−1: por conta, `sao_paulo_day_report` (2) + `campaign_config` (2–3) = **4–5 operações por conta e fechamento**.
- Inclusão/alteração operacional no diretório: se a rodada normal ainda não venceu, o catch-up consulta somente as contas novas/alteradas; uma conta nova custa aproximadamente 5–6 operações D0 e, se o fechamento D−1 do mesmo dia já ocorreu, 4–5 operações D−1. O próximo horário D0 configurado é preservado. Se a rodada normal já venceu ou a cobertura restante está velha, é feito um único ciclo completo, sem uma chamada extra apenas para a mudança do diretório.
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
- Os cartões de falha automáticos preservam apenas metadados sanitizados do erro (códigos, status e IDs de diagnóstico), quando recebidos; isso não é um contador.
- `src/google-ads/google-ads-http-client.mjs` registra POSTs do Hub e contadores v2 dos PHPs em `hub:google-ads:quota-telemetry:v2`. O histórico v1 fica intacto na chave antiga e não é mesclado, porque os números anteriores eram chamadas HTTP, não unidades de cota.
- `google-ads-readonly-service.php` e `google-ads-campaign-action-service.php` contam chamadas Google Ads, respostas e operações estimadas. Search/SearchStream vale uma operação; cada item em `operations`/`mutateOperations` vale uma operação. Respostas HTTP do Google, inclusive erros, entram como estimativa; falha de transporte sem resposta fica indeterminada; OAuth é excluído. A validação temporária direta também é contada.
- A tela separa POSTs do Hub, chamadas HTTP Ads e operações de cota estimadas. Endpoints sem cabeçalho v2 usam o catálogo de estimativas ou exibem custo variável indeterminado. Os contadores locais não provam consumo do projeto e não substituem a métrica do Google Cloud.
- A referência Explorer (2.880), Basic (15.000) ou Standard (sem limite diário) é apenas comparação local. Nunca armazene tokens, GAQL completo, IDs/nome de cliente/campanha, payload ou resposta bruta na telemetria.

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
- Serviço privado de leitura no projeto integrado: `tracking-mvp/tools/google-ads-readonly-service.php` (relativo à raiz do Hub).
- Serviço privado de ação/criação no projeto integrado: `tracking-mvp/tools/google-ads-campaign-action-service.php` (relativo à raiz do Hub).


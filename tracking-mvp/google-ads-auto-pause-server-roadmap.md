# Roteiro de pausas automáticas no servidor

**Atualizado em:** 2026-11-16  
**Status (16/11/2026):** Fase 1 de ingestão confirmada operacionalmente pelo usuário. Fase 2A, correção de disponibilidade imediata e drenagem em lote foram publicadas e confirmadas. A Fase 2B (duas regras independentes de venda/financeiro) foi implementada localmente em sombra; pacote ainda não entregue/publicado. O Cron permanece em prévia, sem `--execute`; o avaliador sombra não cria jobs, não chama API nem pausa. O Hub mantém as pausas locais atuais.

## Comparação com o desenho anterior

O plano fornecido pelo usuário já previa, em conjunto, (1) enviar snapshots completos do Hub ao servidor, (2) avaliar as regras no servidor e (3) no Cron, consultar a API quando não houvesse captura completa recente, com referência ao intervalo configurado mais um atraso adicional. Esse atraso agora é configurável no Hub, com padrão de 15 minutos. Portanto, a contingência não é uma ideia nova. O ponto que precisava ficar explícito é que, ao detectar a ausência de captura do Hub, o servidor deve criar uma captura própria e avaliá-la, em vez de somente processar a fila.

O piloto implementado tomou um recorte menor: o Hub avalia e envia à fila somente candidatos já selecionados; o servidor processa a fila. Ele não recebe o JSON completo de snapshots nem gera avaliações novas quando o Hub deixa de publicar. A auditoria do código local confirma ainda que o Hub não apenas enfileira: depois de publicar a avaliação, também chama o executor local anterior.

## Fase 0 — auditoria técnica local

**Status: parcial.** Foram identificados os endpoints privados existentes, o armazenamento MySQL, os serviços de leitura/ação de Google Ads, o worker e o Cron. O desenho e os pacotes reutilizam autenticação e serviços existentes. Não há evidência de uma auditoria completa dos dados financeiros do Diário, da política de venda autoritativa no servidor ou do critério de captura completa/atrasada.

## Fase 1 — sincronizar configurações e capturas

**Implementada e confirmada operacionalmente em 2026-11-16.** O usuário mostrou a linha do banco para o snapshot `2026-11-16T19:44:15.303Z:z8fkq0kn`: conclusão 19:44:15.303 UTC, recebimento 19:44:57.285 UTC, 12 contas e 397 campanhas. Pacote de origem: [google-ads-auto-pause-snapshot-ingestion-2026-11-16](deploy/staging/google-ads-auto-pause-snapshot-ingestion-2026-11-16/README.md).

- **T1.1 payloads versionados — parcial.** O contrato de captura completa agora usa `schema_version: 1`, ID/horário, tamanho, hash e partes numeradas; o payload inclui contas, campanhas, status, moeda, fuso e métricas observadas. A revisão de política ainda é sincronizada separadamente e não fica associada ao snapshot até a Fase 2. Vendas e totais financeiros para avaliação também não são enviados nesta etapa.
- **T1.2 configurações do Hub — implementada para o piloto, com validação operacional parcial.** Política, critérios das seis regras, intervalo, retenção, duração do aviso, atraso adicional e exceções têm caminho de sincronização com o servidor. A configuração de 14 minutos mostrada pelo usuário foi aplicada/sincronizada segundo o Hub. Isso não significa que o servidor avalie as regras por conta própria.
- **T1.3 vendas e dados financeiros — não implementada no servidor.** O Hub só publica candidatos com `has_diary_sale: false`; o worker não lê o Diário/IndexedDB. Também não recebe o conjunto de dados para recalcular saldo negativo.
- **T1.4 receber e armazenar snapshots completos — implementada e confirmada.** O Hub envia captura automática D0 completa em partes autenticadas após a gravação local. O endpoint confere completude, identidade, limites e SHA-256 antes de gravar o payload; reenvio é idempotente e a retenção acompanha a política do Hub. A linha mostrada pelo usuário confirmou o recebimento de uma captura atual com 12 contas/397 campanhas.

## Fase 2 — avaliação das regras no servidor

**Status: parcial — Fase 2A publicada e drenagem do backlog confirmada; Fase 2B implementada localmente para `campaign_age` e `campaign_zero_impressions`, sem deploy.** O worker registra a revisão da política, exceções, candidatas hipotéticas e bloqueios por campanha. O Hub prepara os fatos usando a base local e os envia como schema v2, sem consultar métricas novamente. O endpoint aceita v1 histórico e valida fatos v2. O avaliador não cria jobs, não consulta a API nem pausa. As regras dependentes de vendas/produto/financeiro permanecem bloqueadas. Contrato: [google-ads-auto-pause-phase-2b-data-contract.md](google-ads-auto-pause-phase-2b-data-contract.md). Pacote de deploy da etapa: [google-ads-auto-pause-shadow-campaign-rules-2026-11-16](deploy/staging/google-ads-auto-pause-shadow-campaign-rules-2026-11-16/README.md).

## Fase 3 — agendar e executar pausas

- **T3.1 worker/Cron — parcial e em prévia.** O Cron informado pelo usuário roda a cada cinco minutos, sem `--execute`. A simulação sintética foi processada com sucesso; o worker não verificou nem pausou campanha. O worker não verifica se falta uma captura completa do Hub para então criar um snapshot próprio. O `intervalo do snapshot + atraso adicional configurado no Hub` define quando um job real enfileirado pode ficar disponível; não é detector de captura atrasada nem disparador de avaliação independente.
- **T3.2 intenções persistentes — implementada.** Jobs são persistidos com identidade da avaliação/campanha, regra, motivo/contexto, prazos e estado; há idempotência e trava contra workers concorrentes.
- **T3.3 revalidar e pausar — implementada no worker.** Antes da pausa, o servidor confere status, conta/permissões e allowlist, altera somente o status, confirma `PAUSED` e aplica tentativas limitadas em falhas temporárias.
- **T3.4 cancelamento — implementada no fluxo do piloto.** O Hub pode cancelar o produto/avaliação durante a janela; se o Hub fechar, o prazo continua no servidor.

## Fase 4 — interface do Hub

- **T4.1 fila, contador, cancelamento, atraso configurável e estado da simulação — presentes no Hub.** O caminho de enqueue/status da simulação foi confirmado pelo usuário como processado pelo worker. O painel ainda lista apenas jobs reais pendentes, por isso o teste aparece com zero campanhas na fila normal.
- **T4.2 histórico e indicadores — parcial/não comprovada ponta a ponta.** O worker persiste estados e prepara notificação após pausa confirmada, mas a sincronização de todos os resultados, motivos e contadores de pausas do Hub ainda precisa ser validada; o usuário já relatou divergências nesses indicadores.
- **T4.3 estado da sincronização — parcial/não comprovado visualmente.** O contrato usa revisão de política, mas não há confirmação aqui de que o Hub sempre mostre a revisão aplicada e falhas de sincronização.

## Fase 5 — validar e publicar o piloto

**Status: simulação de fila aprovada; piloto de pausa real e autonomia ainda não aceitos.** O usuário informou que publicou os arquivos, executou o SQL anteriormente e mantém o Cron a cada cinco minutos em prévia. Após a correção do PDO, o Hub mostrou “Simulação processada pelo worker. Nenhuma campanha foi consultada ou pausada.” Isso valida o percurso sintético Hub → endpoint → banco → worker → retorno ao Hub; não valida uma campanha real, chamada de status/permissão Google Ads, pausa, e-mail ou proteção de venda durante a espera.

**Validação técnica sem campanha real — concluída em 2026-11-16:** o Hub envia um job reservado `queue_simulation`, omitido da fila normal de campanhas. O worker o marca como `skipped/simulation_processed` antes de qualquer verificação ou chamada à API do Google Ads, inclusive quando iniciado com `--execute`. O usuário confirmou no Hub o estado processado. Isso valida o percurso sintético de fila, mas não valida elegibilidade, autorização Google Ads, pausa real, e-mail, regras ou atraso de campanhas reais.

**Auditoria local do executor — 16/11/2026:** o Hub publica candidatos das seis regras (`negative_remaining`, `reference_competitor`, `campaign_zero_impressions`, `product_performance`, `campaign_age`, `clicks_without_sale`) e depois ainda chama `runAutomaticPauseBeforeServerQueue`, que pode executar a pausa local. A publicação ocorre em avaliações automáticas normais, quando a regra está habilitada e a chamada não é `force` nem `manual`; o payload contém candidatas vinculadas, exclui as que têm venda ativa no Diário e as que têm exceção. Portanto, o Hub não apenas enfileira e o servidor não é hoje o executor exclusivo. O Cron está em prévia conforme a configuração informada pelo usuário; a simulação confirmou o worker, mas não executou uma pausa de campanha. A auditoria inspecionou fontes locais e usa a confirmação/prints do usuário para o estado publicado; não acessou diretamente a instalação viva da Hostinger.

## Próximas entregas para seguir o desenho original

**Corte para o servidor — preflight local implementado em 2026-11-17:** o modal de pausas automáticas ganhou a ação “Transferir pausas automáticas para o servidor”, que consulta a prontidão e mostra a última avaliação e contagens da fila. Nesta etapa ela é somente diagnóstica: o endpoint retorna `ready=false` e `transfer_supported=false`, não cria sessão de migração, não altera autoridade e não executa campanhas. O bloqueio é intencional porque a avaliação snapshot ainda está em `shadow` e não cria jobs. Pacote do endpoint: [google-ads-auto-pause-cutover-preflight-2026-11-17](deploy/staging/google-ads-auto-pause-cutover-preflight-2026-11-17/README.md). A transferência real só poderá ser implementada após o worker converter candidatas snapshot em jobs, a reconciliação dos itens pendentes e o handoff idempotente de autoridade.

**Chave global de autoridade — publicada conforme informado pelo usuário:** estado central, lease do executor local, trava do worker e corte foram publicados; a autoridade de execução continua dependendo da prontidão validada. O usuário informou que falta confirmar a atualização local do Hub para v1.378.0 e validar uma captura D0 completa schema 3. O pacote de referência está em [google-ads-auto-pause-schema3-cutover-2026-11-17](deploy/staging/google-ads-auto-pause-schema3-cutover-2026-11-17/README.md); o estado remoto é baseado no relato do usuário, sem leitura direta do servidor.

**`negative_remaining` sem veto de venda — 2026-11-17:** após esclarecimento do usuário, o worker local segue somente o `remainingValue` calculado pela Visão geral para decidir a regra `< 0`, mesmo com venda associada. O delta remove vetos por `saleProtected`, lista sincronizada e indisponibilidade global tanto na avaliação sombra quanto na validação de jobs desta regra. Exceções explícitas continuam válidas; outras regras mantêm os vetos de venda. A chave de autoridade, lease e corte foram preservados. Pacote incremental: [negative-remaining-sale-neutral-2026-11-17](deploy/staging/google-ads-auto-pause-negative-remaining-sale-neutral-2026-11-17/README.md). Publicação e validação pós-publicação pendentes.

**Especificações:** [avaliação de pausas pelo servidor a partir dos snapshots do Hub](google-ads-auto-pause-snapshot-evaluation-spec.md) e [contrato de dados da Fase 2B](google-ads-auto-pause-phase-2b-data-contract.md). A Fase 1 está confirmada. A primeira parte da Fase 2B está pronta localmente para duas regras. Ainda falta publicar Hub e endpoints, aguardar snapshot v2 e comparar os resultados sombra com a avaliação local.

### Pendências

1. **Fase 1 operacional — concluída:** snapshot atual confirmado no banco após deploy e migração.
2. **Fase 2A — diagnóstico sombra:** publicado; os 20 snapshots mostrados no SQL foram avaliados nas rodadas de 20:55, 21:00 e 21:05, e todos ficaram com `candidate_count = 0`. A fila observada foi drenada.
3. **Fase 2B — duas primeiras regras em sombra:** implementação local de `campaign_age` e `campaign_zero_impressions` concluída; falta publicar o pacote do servidor e atualizar o Hub local. Depois, aguardar nova captura D0 schema v2 e comparar candidata por regra. Regras por produto, ClickBank/vendas e finanças continuam pendentes. Nenhuma pausa real nesta fase.
4. **Fase 3 — revisão e temporização:** entregar candidatas do servidor ao modal atual; persistir cancelamento e prazo no servidor. Ao expirar o timer, o servidor será o executor conforme decidido pelo usuário. O Cron continua em prévia enquanto se valida.
5. **Fase 4 — retorno ao Hub:** sincronizar resultados reais do worker, motivos, notificações, histórico e estado da política.
6. **Fase 5 — corte controlado:** depois de comparação e autorização explícita, desligar a regra local transferida e habilitar execução correspondente no servidor, evitando pausa duplicada.
7. **Autonomia sem Hub/computador:** evolução separada. O servidor precisaria produzir seus próprios snapshots e consultar a API Google Ads, com impacto de cota e dependências de venda; não faz parte das fases atuais.

**Limite atual:** a Fase 1 somente entrega e armazena snapshots enquanto o Hub executa a captura. Ela não desloca a avaliação local e não muda quem executa as pausas atuais.

**Dependência crítica:** para operar com o Hub/computador desligado, o servidor precisa ter uma fonte confiável e atual dos dados de venda que protegem campanhas. O worker atual não acessa o IndexedDB local. Também deve usar a última política/exceções sincronizadas e sinalizar que alterações feitas no Hub ainda não enviadas não chegaram ao servidor.

## Fontes locais

- `deploy/staging/google-ads-auto-pause-server-pilot/README.md` — contrato e armazenamento da avaliação atual.
- `deploy/staging/google-ads-auto-pause-server-worker-2026-11-13/README.md` — worker, fila, temporização e revalidação.
- `deploy/staging/google-ads-auto-pause-server-exceptions-2026-11-13/README.md` — sincronização de exceções.

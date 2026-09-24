---
name: observabilidade-decisoria
description: Evoluir ou investigar o Event Log, snapshots e fatos observáveis do Hub de Operações. Use quando a tarefa tratar da trilha de evidências operacionais; não use para análises estratégicas sem mudança de telemetria.
---

# Observabilidade Decisória Operacional

Esta skill cobre exclusivamente fatos posteriores à entrada do produto em operação (testes, contas, campanhas/iterações, CPA, GEO, entrega, impressões, cliques, investimento, conversões e ROI). Não use o Event Log operacional para salvar decisões pré-teste ou sinais de curadoria.

## Modelo do MVP

O Event Log é append-only. Uma atualização MCC bem-sucedida pode acrescentar fatos e snapshots; reimportar a mesma fonte não cria eventos repetidos. Cada evento leva ID estável, timestamp, tipo, fonte, identidade disponível, GEO explícito, snapshot e metadados de proveniência.

- **Produto**: identidade normalizada do nome de produto quando identificável sem adivinhar.
- **Teste**: produto + conta. IDs de conta usam somente os quatro dígitos iniciais validados pelo modelo atual.
- **Campanha/iteração**: campanha MCC exata e respectivo ID persistido; variações numeradas são iterações distintas do teste.
- **GEO**: atributo copiado somente de dado geográfico explícito da fonte; não inferir da lista de países da oferta ou do texto de campanha.
- **Snapshot**: campos brutos MCC com valor/estado e dados operacionais disponíveis no momento do evento. CPA/ROI derivados somente quando os operandos forem válidos.

Identidade de produto baseada em sufixo numérico pode ser ambígua. Nessa situação, deixe `product_id` e `test_id` nulos, preserve campanha/iteração e registre a confiança em `metadata`; não agrupe campanhas com base em palpite.

## Eventos do MVP

- `test_iteration_created`: primeira observação da campanha/iteração no fluxo de evidência.
- `campaign_status_changed`: alteração entre dois estados operacionais explícitos da MCC.
- `campaign_delivery_started`: a campanha tem no histórico ao menos uma observação explícita sem entrega (impressões e cliques zero; custo ausente ou zero válido), não tem sinal positivo anterior e a atualização atual apresenta pela primeira vez um valor positivo datado de impressões, cliques ou custo. Uma coleta inicial positiva, sem zero anterior observado, não comprova início de entrega.
- `account_first_seen` e `account_first_used`: primeira evidência de conta identificável através de campanha.

O sistema não recebe evidência explícita suficiente para `account_suspension_detected`; não invente esse evento. Ausência da campanha numa coleta, zero isolado, reprovação/qualificação, falha do pixel ou ausência de linhas não comprova fim de entrega, pausa explícita ou suspensão de conta. Não emita `campaign_delivery_stopped` com o feed atual.

Estado operacional (`estado_campanha`) é separado da qualificação (`status_qualificacao`). Alterar “Eligible/Disapproved” não é transição de estado operacional. Preserve os campos de origem e proveniência separados.

## Persistência

A store `events` do IndexedDB compartilhado usa `event_id` e é independente da store `bases`. Versão 3 é uma migração aditiva. Escreva eventos novos com `add`, nunca atualize/apague eventos; reimportação verifica IDs existentes. `event_log` normalizado é a união para leitura e exportação. Legado recebe coleção vazia sem telemetria retroativa; backups não devem apagar eventos locais já registrados.

Importações do painel e Preparador MCC compartilham `CampaignDatabase.importManifest()`. Configure uma origem (`source`) distinta para cada caminho.

## Separação da Observabilidade da Curadoria

A Observabilidade da Curadoria é um domínio independente, com stores próprias em `radar-curadoria-observability`. Ela responde “o que eu sabia sobre este produto antes do teste?” e guarda origem da oferta, Trends, Imagens, Glimpse, refinamentos, decisões e `snapshot_decisao`. O módulo não grava nem altera `painel-campanhas.events`/`event_log`.

Use identificadores e referências para conectar os domínios, sem incorporar os payloads/históricos uns nos outros. Uma correlação é criada pendente ao congelar a decisão de subir campanha; ofertas e identidades operacionais podem ser associadas depois por ação manual. Correspondência por nome normalizado é apenas uma sugestão. Toda correção fica no histórico de `correlations` e nunca reescreve o Event Log ou o snapshot da Curadoria. Para implementação dessa view, stores, paginação, desempenho e testes, siga `../painel-operacao-google-ads/references/data-model.md` e `../painel-operacao-google-ads/references/engineering-workflow.md` do Hub.

## Interface e testes

A view principal vive em `src/index.template.html` e usa metadados `observability` de `src/view-registry.js`. A lista é uma leitura cronológica, com filtros por produto/teste, conta, campanha e tipo, e snapshot expansível; não é um painel de pontuação, recomendação ou inferência causal.

Após mudança, execute `node build.mjs`, `tests/observability.test.mjs`, `tests/view-registry.test.mjs`, `tests/preparador-d0.test.mjs` e toda `tests/*.test.mjs`. Cubra idempotência, snapshots, conta/teste/iteração, eventos explícitos, mudanças só de qualificação, dados ausentes/inválidos e ausência de inferências. Faça validação visual de leitura no navegador sem inserir fixture no IndexedDB real.

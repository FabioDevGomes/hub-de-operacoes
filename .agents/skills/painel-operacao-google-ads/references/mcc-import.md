# Importação MCC e Preparador

## Caminhos de importação

- Visão Geral/Excel e upload de manifesto usam `CampaignDatabase.importManifest()` em `src/database.js`.
- Preparador MCC é editado em `src/preparador-MCC/index.html`; `node build.mjs` publica a página em `dist/preparador-MCC/index.html`. A rota `/preparador-MCC/`, o banco `painel-campanhas` e `/database.js` compartilhado permanecem iguais.
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
- Registrar início de entrega apenas quando o histórico anterior da campanha contém ao menos uma observação explícita sem entrega (impressões e cliques zero; custo ausente ou zero válido), não contém nenhum sinal positivo anterior e a atualização atual traz um sinal positivo datado de impressões, cliques ou custo em D−1/D0. Um custo inválido não comprova zero; uma primeira coleta positiva, sem zero anterior observado, não comprova início.
- Uma alteração explícita de `estado_campanha` pode gerar `campaign_status_changed`; mudança de qualificação sozinha não.
- Não sobrescrever conflitos financeiros silenciosamente fora do fluxo de confirmação já existente.
- Após build, validar importação em memória ou teste. Não aplicar manifesto sintético nem importar CSV real para a base ativa.

## Numeração atual versus histórico

- `CampaignDatabase.campaignNumberReuseIssues(base, manifesto)` bloqueia apenas quando a coleta D−1/D0 recebida contém mais de um nome exato distinto com a mesma numeração de produto. A verificação ocorre na prévia e novamente imediatamente antes da escrita; o erro mostra os nomes atuais envolvidos.
- Um nome diferente apenas em campanhas persistidas, snapshots ou manifesto anterior não prova duplicidade na MCC atual. `campaignNumberHistoryWarnings` retorna essas divergências como avisos não bloqueantes, com `incomingNames` e `historicalNames`; a prévia identifica claramente coleta atual e histórico.
- Reimportar um nome exato já conhecido não deve ser bloqueado pelo nome de outra campanha histórica, independentemente de estar ativa, pausada ou histórica. Comparação é insensível a caixa, sem associação por nome reduzido.
- Nomes exatos diferentes continuam com IDs e diários separados. Não renomear, mesclar nem remover registros para resolver um aviso histórico; uma renumeração aparente não comprova que é a mesma campanha.
- Correções apenas da data continuam no fluxo existente de confirmação explícita, preservando ID e aliases confirmados. Avisos históricos não substituem essa confirmação.
- O fallback de prévia no Preparador deve manter a distinção entre erro atual e aviso histórico. Gravações continuam exigindo o domínio central; não habilitar importação por um fallback sem observabilidade.
- Regressões: `node tests/mcc-numbering.test.mjs`, `node tests/database.test.mjs`, `node tests/preparador-d0.test.mjs` e `node tests/preparador-d1.test.mjs`. Cobrir duplicidade real em base vazia, reimportação com colisão antiga, snapshots antigos, renumeração sem fusão de histórico, botão habilitado para aviso e bloqueio defensivo antes de gravar.

## Reflexo no Controle Macro

- Política operacional acordada: não pedir nova importação da planilha para atualizações diárias; usar MCC D0 como parcial e D−1 como fechamento do dia anterior. Preservar o histórico da planilha já gravado.
- O Preparador grava D−1 no mesmo IndexedDB `painel-campanhas`, store `bases`, chave `atual`, e publica `BroadcastChannel('painel-campanhas')` com `type:'base-updated'` após persistir.
- Com o Controle Macro aberto em outra aba da mesma origem, o painel recebe o evento, restaura a base e recalcula os totais diários. Ao abrir/recarregar o painel, a base persistida também é restaurada e agregada. Não é necessária uma segunda importação do histórico da planilha.
- No Controle Macro, a planilha histórica continua prevalecendo campo a campo. Desde `2026-09-13`, MCC/D−1 só preenche cliques ou vendas ausentes na planilha; não substitui investimento, faturamento nem zeros explícitos. Antes dessa data, esses campos continuam conforme a planilha. Veja [Modelo e persistência](data-model.md) para as regras completas e o tratamento de suspensões/vendas.
- A regra anterior descreve o comportamento atual para datas já presentes no histórico legado. Em caso de sobreposição, não afirmar que MCC substituiu a planilha até essa precedência ser alterada no código; a orientação operacional, por si só, não muda a persistência existente.
- Se a tela não atualizar após a confirmação de sucesso, recarregue-a antes de repetir a importação. A atualização automática falhar não significa que se deva importar o mesmo arquivo novamente.

## Extensão local de captura e encaminhamento D0/D−1

`extensions/mcc-d0-bridge/` contém uma extensão Chrome local, opcional e não publicada. A captura direta oferece D0 e D−1, lendo a grade semântica já renderizada e entregando a captura validada à prévia do Preparador. O encaminhamento do CSV original D0 e os fluxos manuais de CSV D0/D−1, colagem e arrastar/soltar continuam disponíveis como fallback.

Na captura direta, cabeçalhos semânticos são associados às células da respectiva linha, preferindo o identificador `essfield` compartilhado por cabeçalho e célula quando presente. O nome de campanha vem do texto exato do `<a>` na célula `essfield=name`; na MCC real esse link pode não ter `href` e a célula pode conter texto extra de edição. A extensão bloqueia se não conseguir identificar a grade/associação, se faltar cabeçalho obrigatório, se a data não for uma única data explícita, se moeda/conta não puderem ser lidas, ou se paginação/contagem, virtualização aparente, truncamento ou nomes duplicados não confirmarem a lista completa. A captura não rola nem pagina a MCC. Valores `0` são preservados como zero; `—` e células vazias são preservados como ausência, nunca convertidos em zero. Não infere GEO, estado de campanha, CPA nem valor de conversão quando não há campo explícito confiável.

A captura estrutural D0 usa o contrato estável `mcc-d0-grid-v1` e o receptor `window.__hubReceiveMccD0Grid`. D−1 usa o contrato aditivo `mcc-d1-grid-v1` (`periodRole: 'd1'`) e `window.__hubReceiveMccD1Grid`; ambos convergem para o mesmo leitor, adaptador em memória, `parseSource`, validação, `manifesto_mcc_v2`, persistência e observabilidade existentes. A origem técnica é `mcc_chrome_extension`. Nenhum receptor invoca `applyManifestToPanel`; só o clique manual em **Atualizar base** grava a base. Não há parser de negócio nem escrita na extensão.

O papel D−1 é validado contra uma única data explícita do controle da MCC, igual a ontem no fuso operacional fixo `America/Sao_Paulo`. Não converta “ontem” em data quando a MCC só exibir texto relativo. A grade precisa passar de novo a validação integral de cabeçalhos, linhas únicas, contagem/paginação, conta/moeda, valores e zero × ausência; D−1 não pressupõe o mesmo total que D0. Se D0 já estiver carregado, ou quando for carregado depois, ambos precisam ter uma data cada e D0 deve ser exatamente o dia seguinte a D−1. D−1 isolado fica no slot `d1` aguardando D0 e nunca gera manifesto aplicável ou gravação.

### Versão estável atual da captura direta

A versão validada corrige dois pontos independentes:

1. **Associação das células MCC:** cabeçalhos e células são ligados pelo `essfield` da grade. O nome da campanha é lido do `<a>` dentro de `essfield=name`, mesmo quando o link não tem `href`; não use o texto completo da célula, pois ele pode incluir o controle “settings”. A conta também é lida do link da própria célula, sem concatenar o ID exibido ao lado. `primary_status` identifica qualificação e é distinto do `status` operacional. Linhas auxiliares sem link de campanha ficam fora da contagem.
2. **Entrega ao Preparador:** `chrome.scripting.executeScript` usa `world: 'MAIN'` ao invocar os adaptadores D0/D−1. O padrão `ISOLATED` do Chrome compartilha o DOM, mas tem outro `window` JavaScript; portanto não enxerga os receptores definidos pelo HTML do Preparador. O transporte continua limitado à URL local do Preparador; a verificação de origem e caminho permanece em `bridge.mjs`. O encaminhamento CSV legado permanece no mundo isolado.

O leitor não rola a página MCC. Antes da captura, o usuário deve rolar a grade manualmente até o final, para que todas as campanhas estejam materializadas; a validação continua bloqueando uma lista parcial. Depois de alterar os arquivos da extensão, recarregue-a em `chrome://extensions`; o Hub servido também precisa estar atualizado. A captura aceita prepara só a prévia e nunca grava até **Atualizar base**.

Esta é a versão estável a preservar. Em mudanças futuras, execute primeiro `node tests/mcc-grid-production.test.mjs` (inclui o cenário de `<a>` sem `href`, associação por `essfield`, exclusão de resumos e prova de chamada no mundo `MAIN`) e depois toda a suíte com `node --test`. Só substitua esta versão após confirmar a prévia no Preparador; não teste a gravação na base ativa sem autorização explícita.

O arquivo CSV original continua sendo fallback. A extensão não usa Google Ads API, OAuth, cookies, tokens, endpoints privados, chamadas de rede da MCC ou automação de exportação. Para instalação e uso, consulte `extensions/mcc-d0-bridge/README.md`.

### Como a investigação fechou a captura estrutural

A investigação comparou o texto livre da página, o HTML/nomes estruturados observáveis e a árvore semântica da grade. O texto de `document.body.innerText` não associa com segurança valores numéricos/monetários aos cabeçalhos; por isso não reutilizar diagnóstico posicional nem ordem de tokens para métricas. O caminho produtivo usa exclusivamente cabeçalhos e células da grade renderizada/acessível. A existência de nomes internos como `stats.impressions` não basta: só usar um valor depois que a associação linha → campanha e cabeçalho → célula estiver demonstrada estruturalmente. A extensão não lê estado privado do runtime, não intercepta chamadas de rede e não replica endpoints.

O leitor `extensions/mcc-d0-bridge/mcc-grid-reader.mjs` procura uma única grade semântica candidata por roles ARIA/HTML e cabeçalhos reconhecidos; empate entre grades é erro. Mapeia cabeçalhos por aliases normalizados. Na grade real, o `essfield` dos cabeçalhos identifica a célula correspondente em cada linha, mesmo com coluna extra de seleção; exige exatamente uma célula por campo. O campo `primary_status` é o status de qualificação, distinto do ícone operacional `status`. O nome da campanha é extraído do único `<a>` da célula `name`, mesmo sem `href`; a conta vem do link da célula de conta, sem incorporar o ID adicional, e a qualificação usa a primeira linha da célula. Linhas de total/rascunho sem link de campanha não entram na contagem. Quando `essfield` não existe, permanece o fallback por deslocamento calculado por linha; links em outras colunas não criam candidatos concorrentes. Se o alinhamento deslocado e outro link plausível na posição direta da Campanha coexistirem, a captura é bloqueada. O texto visível é preferido, com `textContent` como fallback. Não usar classes CSS obfuscadas.

Completude exige paginação explícita começando em 1 e terminando no total, total igual às linhas capturadas e campanhas únicas, além de ausência de sinais de virtualização/truncamento conhecidos. Isso é um critério de segurança da fotografia, não prova matemática de que a página nunca use lazy loading: se os registros não estiverem materializados numa única grade completa, o fluxo deve falhar e o CSV manual permanece fallback. A extensão não rola nem pagina a MCC. A data vem apenas de um controle de período com uma única data explícita; não usar “hoje” do computador, prefixo de nome da campanha ou datas múltiplas. Localidade vem do documento e é usada para validar/separar números. Código/símbolo de moeda precisa identificar uma moeda única por linha; `$` isolado é insuficiente.

### Contrato e sequência de execução

1. O popup envia `CAPTURE_AND_FORWARD_MCC_D0` ou `CAPTURE_AND_FORWARD_MCC_D1` ao service worker. Ambos exigem uma aba ativa `https://ads.google.com/`, usam o mesmo leitor após clique explícito e validam completude/campos antes da entrega.
2. `mcc-grid-domain.mjs` emite `mcc-d0-grid-v1` ou `mcc-d1-grid-v1`; D0 mantém o contrato estável sem novos campos, D−1 inclui `periodRole:'d1'` e exige a data esperada no fuso `America/Sao_Paulo`. O payload contém só metadados e registros estruturados, nunca HTML bruto, cookies, token ou estado de sessão.
3. O service worker abre/cria a aba local do Preparador em segundo plano, injeta o adaptador correspondente com `world: 'MAIN'`, entrega por `bridge.mjs` e só foca a aba depois do ACK do receptor correto. Assim erros continuam visíveis no popup; sucesso deixa o usuário no Preparador.
4. O Preparador valida versão, quantidade, paginação, campos, data, moeda/conta e nomes únicos. A adaptação D−1 cria a mesma representação tabular em memória e chama `parseSource(...,'d1')`. D−1 sozinho instala no slot `d1`, informa que aguarda D0 e não gera manifesto aplicável. Com os dois slots, datas únicas e consecutivas são obrigatórias antes do manifesto e prévia.
5. `installParsedSource` atualiza somente o estado em memória. A validação da numeração consulta a base em leitura; a ação mutável continua restrita ao botão **Atualizar base**, que usa o mesmo `applyManifestToPanel`.

Ao aplicar um manifesto, `CampaignDatabase.importManifest` devolve `reconciledSales` (lançamentos manuais cujo estado mudou) e `mccBillingSales` (atualizações agregadas extraídas apenas dos campos de conversão presentes). O Preparador passa ambas ao módulo compartilhado `../billing/billing-storage.mjs`; `writePanelBase` grava base, Event Log e Faturamento na mesma transação IndexedDB. O upload de manifesto no Hub também envia os agregados ao `persistLocalBase`. O início manual persiste a base, o lançamento e o ajuste de um agregado D0 coincidente na mesma transação.

Para as linhas manuais, D−1 altera somente `confirmation_status` de `manual` para `confirmed` (visível como “Confirmada · MCC D−1”), mais origem/data e auditoria. `reconcileProvisionalSales` mantém o pareamento por `campanha_id + data`, usando FIFO quando há várias vendas manuais, porque a MCC não entrega ID de transação.

Para agregados, usa-se `mcc-conversion:${campaign_id}:${date}` como ID estável: D0 aparece como “Provisória · MCC D0”, D−1 atualiza essa mesma linha para “Confirmada · MCC D−1”, e o D0 do dia atual fica em outra data/linha. A tabela mostra `conversion_count` sem fabricar IDs/transações individuais. Valores de conversão são preservados somente na moeda MCC explicitamente BRL ou USD, sem conversão. Se existirem lançamentos manuais da campanha/data, as quantidades correspondentes são abatidas do agregado; o valor agregado residual fica ausente porque não há decomposição segura. A escrita é incremental e idempotente por ID, com auditoria apenas quando campos mudam; conflitos de F/P bloqueiam o espelhamento até haver confirmação de sobrescrita.

Tanto uma conversão confirmada como uma provisória da MCC continuam com `payment_status:'pending'`; confirmação da conversão não significa pagamento. Não criar movimento de recebimento automaticamente. Um D−1 com zero desativa o agregado D0 anterior e marca `not_confirmed`, mas não cria uma venda zero nova. Ver [Faturamento](billing.md) para semântica e limites.

Ao manter o fluxo, não criar parser de negócio na extensão e não chamar persistência diretamente do service worker. Se a grade for rejeitada, mostrar a causa e deixar disponível o caminho CSV, sem limpar/substituir silenciosamente outro D0 que já esteja carregado.

### Ordenação da prévia

A tabela permite ordenação visual por campanha, conta, status, impressões, cliques, conversões, impr. primeira posição, impr. parte superior e custo. A ordenação parte sem preferência (preserva a ordem de entrada), alterna crescente/decrescente a cada clique, compara métricas pelo valor numérico e mantém ausentes/inválidos no fim em ambas as direções. Ela não modifica manifesto, registros, banco ou observabilidade. A posição primeira agora tem sua própria coluna de prévia.

Implementação em `sortPreviewRows`/`renderPreviewTable` no Preparador: comparar `{valor, estado}` já interpretado pelo manifesto (números, moeda e percentual não devem ser comparados pela string formatada), usar índice original como desempate estável e manter ausência/inválido no fim mesmo em ordem decrescente. O estado inicial é sem ordenação e é reiniciado quando uma nova fonte é instalada; nunca persistir a ordenação.

### Testes

- `node tests/mcc-grid-production.test.mjs`: associação estrutural por `essfield`, link de campanha sem `href`, extração da conta/status, exclusão de resumos, paginação/completude, data explícita D0/D−1, fuso operacional, locale numérico, moeda, zero × ausência, execução no mundo `MAIN`, ausência de autoaplicação e ordenação visual.
- `node tests/preparador-d1.test.mjs` e `node tests/preparador-d0.test.mjs`: data D−1 esperada, consecutividade, espera de D0, prévia sem autoaplicação e não regressão do receptor D0.
- `node tests/mcc-grid-experiment.test.mjs`: compatibilidade da leitura/diagnóstico local da grade.
- `node tests/mcc-extension-parity.test.mjs`: não regressão/paridade do transporte CSV legado.

### Diagnóstico local de leitura/comparação da grade MCC (não produtivo)

- Além da ação produtiva de captura D0, o popup mantém um modo separado para ler a aba ativa `https://ads.google.com/` e comparar uma fotografia da grade com um CSV D0 que o usuário seleciona. Esse modo diagnóstico não encaminha o CSV nem a captura ao Preparador, não gera manifesto e não grava base/observabilidade.
- A leitura usa `activeTab` concedida pela ação explícita do usuário, `scripting` já existente e seletores semânticos ARIA/HTML (`grid`, `table`, `row`, `columnheader`, `cell`/`gridcell`, `tr`/`th`/`td`). Grades ambíguas ou incompatíveis falham de forma segura. Não adicionar permissões amplas nem seletores CSS obfuscados.
- `mcc-grid-domain.mjs` contém o esquema estrutural compartilhado e as validações de captura; o modo de comparação permanece diagnóstico, sem enviar sua saída ao Preparador.
- O leitor não rola nem pagina a MCC. `aria-rowcount`, índices ARIA e a contagem aparente do rodapé ajudam a sinalizar capturas parciais, mas ausência de detecção não prova ausência de virtualização/lazy loading. Shadow roots fechados e dados que não foram materializados ficam fora do alcance.
- O inventário do parser D0 é de 18 campos, com 13 obrigatórios (ver `sourceDescriptor()` em `src/preparador-MCC/index.html`). Data do relatório só é aceita de um controle de período que exponha explicitamente um único dia. A moeda é aceita somente por código/símbolo que a identifique sem ambiguidade; não se usa `$` isolado, título de campanha ou GEO para inferi-la.
- Comparação local mede campanha, conta, cabeçalhos e campos reconhecidos; diferencia `ausente` de zero e sinaliza campanhas/cabeçalhos duplicados. Data por campanha permanece não comparável se a grade não possuir coluna de data.
- Testes: `node tests/mcc-grid-experiment.test.mjs` (normalização, mapeamento, campos ausentes, duplicidades, virtualização aparente, ausente × zero, comparação e falha segura), `node tests/mcc-grid-production.test.mjs` (captura direta e prévia), e `node tests/mcc-extension-parity.test.mjs` (não regressão do fluxo de transporte CSV).

### Experimento de captura pelo texto renderizado

- O botão **Testar captura por texto** é paralelo ao experimento da grade e usa somente `document.body.innerText` da aba ativa da MCC. A extensão não seleciona texto, não lê clipboard, não navega, não altera filtros e não solicita permissões extras.
- Antes de uma captura textual completa, role manualmente a página da MCC até o final para carregar/verificar a lista. O leitor não rola nem pagina por conta própria; essa orientação também aparece no popup.
- O texto bruto existe apenas durante a chamada da aba ao service worker, que o transforma em contagens e campos reconhecidos. Não encaminhar esse conteúdo ao Preparador, não persistir, não gerar manifesto e não atualizar base/observabilidade.
- Campanha, par conta/ID, orçamento marcado `/dia`, qualificação (incluindo `qualificada`/`qualificado`), moeda com símbolo explícito e estratégia identificável podem ser recuperados por estrutura textual. Métricas continuam sem mapeamento confirmado até a sequência por campanha ser validada.
- Só declarar captura completa quando contagem extraída, quantidade declarada na página e faixa/total de paginação concordarem. A comparação CSV deve usar o mesmo escopo e período, e reportar campos/campanhas incomparáveis sem alterar o pipeline.
- Rode `node tests/mcc-text-experiment.test.mjs`; fixtures devem ser sintéticas e não devem incluir cópia real da MCC. A validação real é uma ação manual do usuário no popup com CSV exportado por ele. Não faça coleta automática na MCC nem classifique a técnica suficiente para produção sem comparar os mesmos campos no CSV.

### Experimento textual MCC (separado e não produtivo)

- A extensão também oferece `Testar captura por texto`, usando `document.body.innerText` apenas após ação explícita na aba ativa `https://ads.google.com/`. Não simula Ctrl+A/Ctrl+C, não seleciona texto, não pede permissão de clipboard, não envia ao Preparador, não cria manifesto e não persiste dados. O texto bruto é analisado em memória no service worker; o popup recebe apenas a prévia estruturada.
- Parser fica isolado em `extensions/mcc-d0-bridge/mcc-text-domain.mjs`; não modificar nem substituir `parseSource` de produção com esta técnica. A comparação opcional continua local contra CSV escolhido manualmente.
- Blocos são delimitados por títulos de campanha que começam com data e ` - `, pelo título seguinte e por marcadores de resumo/rodapé. Marcar completude apenas quando contagem detectada, total declarado e paginação inteira coincidem; faixa menor que o total é parcial, qualquer discordância é inconsistente.
- Texto MCC fornecido para análise apresentou 60 campanhas únicas, total declarado 60 e paginação `1 - 60 de 60`. Nele são recuperáveis em contexto os nomes de campanha, par conta/ID, orçamento `/dia`, qualificação, estratégia e moeda quando o símbolo do orçamento é explícito. Cabeçalho de métricas não aparece nos blocos; números, valores e percentuais sem rótulos não devem ser mapeados por posição. Campanha titulada com data não fornece data de relatório; não inferir GEO, status de estado individual nem CPA pelo valor/sufixo do nome.
- Diferenciar zeros numéricos, monetários e percentuais de traços como observações sem rótulo; não os atribuir a campo nem inferir que ausência de linha/célula equivale a zero. Campo vazio não pode ser associado com segurança no texto plano. Na amostra real, blocos com 30–32 linhas e 14 sequências de tipos confirmam que métricas não devem ser mapeadas pela posição.
- A amostra real serve somente como evidência de análise e não deve ser gravada em fixtures. Testes devem usar conteúdo sintético/anônimo: `node tests/mcc-text-experiment.test.mjs`. Uma classificação final de viabilidade exige captura local da MCC e CSV D0 do mesmo escopo, período, filtros e página; até essa comparação, não afirmar paridade de métricas.
- Ao comparar, nomes de campanha duplicados devem ser reportados e excluídos do pareamento campo a campo, a menos que exista chave de linha/account que permita associação unívoca. Não escolher a primeira linha silenciosamente.
- No comparador exclusivamente textual, tokens placeholder de campanha (`-`, `--`, en/em dash) são ignorados sem alterar o parser compartilhado do experimento da grade. Variantes textuais conhecidas de gênero em status de qualificação e do artigo opcional em “Maximizar conversões” são contadas como equivalências normalizadas; divergências reais são agregadas por campo, enquanto a interface apresenta apenas uma amostra limitada de detalhes. Isso não modifica o parser D0 de produção nem concede paridade às métricas não rotuladas.
- O comparador textual expõe um diagnóstico posicional experimental: cabeçalhos reconhecidos e tokens numéricos/monetários/percentuais/traços por campanha são confrontados localmente com os valores do CSV. Mesmo uma coincidência integral é evidência somente para aquele recorte, não altera os campos extraídos nem o fluxo D0; confirme em capturas/CSV adicionais antes de tratar a ordem como estável. Se o melhor alinhamento não for único ou tiver cobertura parcial, mantenha o campo ambíguo.

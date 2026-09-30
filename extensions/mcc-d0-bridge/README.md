# Extensão local — captura MCC D0/D−1

Extensão Chrome Manifest V3 para capturar estruturalmente a grade MCC já carregada e preparar a prévia de D0/D−1 no Preparador local. O fluxo de encaminhar o CSV original continua disponível como fallback. A extensão não atualiza a base: a confirmação final continua sendo o botão **Atualizar base** no Preparador.

## Instalação local

1. Inicie o Hub e confirme que `http://127.0.0.1:8765/preparador-MCC/` está acessível.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione esta pasta `extensions/mcc-d0-bridge`.
5. Opcionalmente, fixe **Hub MCC D0** na barra de extensões.

Não é necessário compactar, publicar ou instalar pela Chrome Web Store.

## Atualização da extensão

Toda atualização desta extensão deve incrementar pelo menos o patch de `version` no `manifest.json` (por exemplo, `1.2.0` → `1.2.1`). Após atualizar os arquivos, recarregue **Hub MCC D0** em `chrome://extensions` e confira a nova versão. Recarregar somente as páginas do Hub não atualiza o código da extensão.

## Captura direta de D0

1. Abra na MCC a visão de campanhas, selecione um único dia D0 explícito e aguarde a grade completa carregar. Deixe visíveis as colunas obrigatórias: campanha, conta, status de qualificação, impressões, cliques, conversões, custo médio, impr. primeira posição, impr. parte superior, orçamento, estratégia de lance e custo.
2. Clique no ícone da extensão e em **Capturar D0 da MCC**. Uma ação captura, valida, abre/foca o Preparador e entrega os dados.
3. A extensão associa semanticamente cabeçalhos e células e lê o número completo da conta na mesma célula do nome. Só envia quando paginação/contagem indicam a lista completa, as campanhas são únicas, a associação linha/campanha é estrutural e os campos obrigatórios são legíveis. Se a MCC estiver incompleta, ambígua, truncada/virtualizada, sem data única explícita, sem número completo da conta ou sem moeda identificável, a captura é bloqueada.
4. O Preparador adapta a captura ao parser D0 existente, roda as validações usuais e deixa a prévia pronta para revisão. Confira os dados e alertas.
5. A base permanece inalterada até você clicar manualmente em **Atualizar base**.

## Captura direta de D−1

1. Na MCC, selecione uma única data explícita correspondente a ontem no fuso `America/Sao_Paulo`; texto relativo como “Yesterday” sem a data resolvida não é aceito.
2. Role manualmente a grade até o final para que todas as campanhas estejam materializadas e clique em **Capturar D−1 da MCC**. A extensão não rola nem pagina automaticamente.
3. A captura usa o mesmo leitor semântico e os mesmos campos obrigatórios de D0, mas envia o contrato `mcc-d1-grid-v2`. Data errada, intervalo, grade incompleta, cabeçalho ausente, nome duplicado, número completo da conta ilegível ou moeda ambígua bloqueiam a entrega.
4. O Preparador instala os dados no slot D−1 existente. Se D0 ainda não estiver carregado, mostra “D−1 recebido e validado. Aguardando D0 para gerar a prévia.” Não é criado manifesto aplicável nem gravação isolada.
5. Quando D0 estiver carregado, o Preparador exige uma única data em cada período e que D0 seja o dia imediatamente seguinte a D−1. Nomes, contas, moedas e percentuais seguem as validações normais do manifesto `manifesto_mcc_v2`.
6. Revise a prévia combinada. A base continua inalterada até clicar manualmente em **Atualizar base**.

Valores `0` são mantidos como zero confirmado; `—` e células vazias são ausência e não se convertem em zero. A moeda só é inferida de código/símbolo explícito e inequívoco (`$` isolado é insuficiente). GEO, estado individual, CPA e valor de conversão não são inventados quando não estão disponíveis com segurança. A extensão não rola nem pagina a MCC.

## Fluxo existente: encaminhar CSV D0

1. Exporte manualmente o relatório D0 da MCC como CSV.
2. Clique no ícone da extensão, selecione esse arquivo e escolha **Enviar ao Preparador MCC**.
3. A extensão abre ou ativa o Preparador MCC local e entrega o conteúdo ao campo de arquivo de D0.
4. Aguarde a leitura, validação e prévia feitas pelo Hub. Revise os alertas e a numeração das campanhas.
5. Só confirme a gravação clicando manualmente em **Atualizar base** no Preparador.

O fluxo manual do Preparador — colar, arrastar ou selecionar arquivo diretamente — continua disponível como fallback para D0 e D−1. A extensão ainda mantém o encaminhamento de arquivo CSV original para D0; o CSV D−1 pode ser carregado no slot D−1 do Preparador.

## Diagnóstico separado: leitura/comparação da grade MCC

1. Abra a página da conta/MCC e deixe visível a grade e o período/filtros que deseja inspecionar.
2. Abra o popup da extensão e clique em **Testar leitura da MCC**. A leitura atua somente na aba ativa e captura o que já está materializado no DOM; ela não rola a tela nem aciona paginação.
3. Confira contagem aparente, viewport, paginação, cabeçalhos, campos D0 encontrados/ausentes, amostra e limitações.
4. Escolha o CSV D0 exportado manualmente da mesma tela, período, filtros e colunas; clique em **Comparar prévia com CSV**.
5. A comparação fica no popup/local do navegador. Ela mostra campanhas só de um lado, nomes duplicados, campos comparáveis, divergências e diferenças entre ausente e zero.

Esse modo diagnóstico não chama `FORWARD_D0_CSV`, não abre o Preparador, não gera manifesto, não grava IndexedDB e não importa dados. A ação produtiva **Capturar D0 da MCC** é separada desse comparador. Para comparar corretamente, mantenha iguais conta/escopo MCC, período, filtros e conjunto de colunas.

## Experimento separado: captura pelo texto renderizado

1. Na página da MCC, role manualmente até o final para carregar/verificar a lista completa; depois clique em **Testar captura por texto** no popup. A extensão não rola nem pagina a MCC.
2. O leitor usa somente `document.body.innerText` da aba ativa. Não seleciona conteúdo, não lê o clipboard, não pede permissão nova, não navega nem altera filtros.
3. Confira campanhas detectadas, contagem declarada e paginação. A completude só é confirmada quando os três totais coincidem; trechos parciais ou inconsistentes ficam sinalizados.
4. Escolha o CSV exportado manualmente do mesmo escopo e período e clique em **Comparar prévia com CSV**. A comparação permanece local no popup. O comparador textual ignora tokens placeholder de campanha (como `--`), normaliza apenas variantes conhecidas de gênero na qualificação e artigo na estratégia “Maximizar conversões”, e mostra totais de divergência por campo junto com uma amostra limitada de detalhes.
5. A seção **Diagnóstico posicional de métricas** confronta a ordem dos cabeçalhos com sequências de tokens da captura e os valores do CSV. É apenas uma hipótese de alinhamento local: não promove campos ao parser, não alimenta a importação e precisa ser validada em capturas/CSV adicionais antes de qualquer conclusão de paridade.
6. Nomes de campanha, conta, orçamento diário explicitamente rotulado pelo formato `/dia`, qualificação (inclusive variantes de gênero), moeda explícita e estratégia de lance podem ser recuperados por posição/formato. Valores numéricos, monetários e percentuais sem rótulo não são ainda atribuídos ao parser de campos.

O texto bruto não é salvo nem enviado ao Preparador/Hub; ele só passa momentaneamente da aba ao service worker para produzir a prévia estruturada. A captura não gera manifesto, não atualiza a base nem altera a observabilidade. A comparação com CSV é necessária antes de classificar a abordagem como suficiente para substituir qualquer fluxo.

## Experimento separado: captura pelo texto renderizado

O botão **Testar captura por texto** lê `document.body.innerText` da aba ativa `https://ads.google.com/` após ação explícita no popup. Não simula Ctrl+A/Ctrl+C, não seleciona texto e não lê clipboard. O conteúdo bruto passa momentaneamente da aba ao service worker para análise em memória; não vai ao popup, não é armazenado e não é transmitido. A opção é independente da leitura da grade e do envio CSV ao Preparador.

Na amostra MCC real anexada pelo usuário, o parser encontrou 60 nomes distintos, o total declarado de 60 e a paginação `1 - 60 de 60` (completude consistente). Os blocos começam em uma linha de campanha com prefixo de data e ` - `; terminam antes do próximo bloco ou de linhas de resumo/rodapé. Depois de remover linhas vazias, os blocos variam entre 30, 31 e 32 linhas e formam 14 sequências de tipos distintas; vários índices variam por textos auxiliares/diagnósticos, então não se mapeiam métricas pela posição. Os campos contextuais observados por bloco foram nome da campanha, par conta/ID, orçamento terminado em `/dia`, qualificação e estratégia. O texto não trouxe cabeçalhos mapeáveis das métricas; por isso números, valores monetários e percentuais ficam sem associação. Zero numérico, zero monetário, zero percentual e traço são contados separadamente, mas células vazias e a coluna a que cada token pertence não podem ser recuperadas pelo texto plano. O sufixo monetário no nome da campanha não é usado como CPA.

Resultado provisório de campos da amostra: nome da campanha = explícito; conta/ID, orçamento, moeda explícita no orçamento, qualificação e estratégia = recuperáveis por contexto; data de relatório, GEO e estado individual da campanha = ausentes; métricas de impressões, cliques, conversões, valor de conversão, custo médio, custo, CPA desejado e parcelas de impressão/topo = ambíguas. Isso é uma análise de viabilidade, não paridade com CSV: a classificação A/B/C final exige a captura real por `innerText` e comparação com CSV exportado da mesma configuração.

Para o teste manual: abra na MCC a mesma conta/escopo, período, filtros e página usada na exportação; clique **Testar captura por texto** e confira contagem declarada, detectada e paginação. Depois exporte o CSV D0 dessa mesma visão, selecione-o no campo de comparação e clique **Comparar prévia com CSV**. Verifique campanhas exclusivas/duplicadas, campos comparáveis e divergências. Não use o botão de encaminhar CSV para validar o experimento textual e não clique em **Atualizar base** por causa dele; essa captura não altera o fluxo D0.

O texto não permite uma comparação campo a campo de métricas que estejam sem rótulo. A tela deve informar esses campos como ausentes/ambíguos, sem presumir ordem fixa, sem mapear `—` para zero e sem inferir a data do relatório pelo prefixo do nome da campanha. Nomes duplicados entre campanhas são sinalizados e excluídos da comparação campo a campo, em vez de escolher uma linha arbitrariamente. Fixtures automatizadas são sintéticas e sanitizadas; o texto real não é versionado.

## Estrutura real observada e estratégia

Na inspeção da interface ativa do Google Ads, a árvore de acessibilidade apresentou uma tabela semântica com linhas e células, cabeçalho de Campanha e colunas de métricas; o rodapé indicava 1–60 de 60 registros. Isso confirma uma estrutura acessível equivalente a `table`/`row`/`cell`, mas não prova que o DOM bruto não virtualiza elementos fora da renderização atual, nem revela shadow roots fechados. A extensão faz uma nova verificação em execução, usando `[role="grid"]`, `[role="table"]`, `table`, `row`, `columnheader`, `cell`/`gridcell` e fallback semântico `tr`/`th`/`td`; não depende de classes CSS obfuscadas. Se encontrar grades ambíguas ou DOM inesperado, falha sem capturar outra área.

O leitor registra contagem do DOM e viewport, paginação aparente, `aria-rowcount`/`aria-rowindex`, colunas ocultas, discrepância entre `innerText` e `textContent`, contêineres roláveis e shadow root aberto associado. Na estrutura observada, `essfield=primary_status` identifica a coluna textual Status, que pode mostrar qualificação, Pausada, Removida ou outros estados. Esse vínculo confirma a coluna sem restringir seus valores a campanhas qualificadas. `essfield=status` identifica o estado operacional: os rótulos acessíveis dos ícones Ativado/Pausado/Removido alimentam `campaign_state`, mesmo com cabeçalho sem texto. Quando essa coluna está presente mas algum estado é ilegível, a captura é bloqueada. Sem confirmação estrutural, um cabeçalho genérico `Status` permanece ambíguo. A ausência de um sinal de virtualização é apenas “não detectado”; lazy loading ou conteúdo omitido sem total/ARIA correspondente não pode ser descartado por uma fotografia sem rolar a página.

O parser D0 atual consome 18 campos (`data`, `campanha`, `conta`, `target_geo`, `campaign_state`, `status`, `currency`, `impressions`, `clicks`, `conversions`, `conversion_value`, `avg_cost`, `abs_top_share`, `top_share`, `budget`, `bid_strategy`, `target_cpa`, `cost`). Os 13 campos obrigatórios definidos pelo Preparador são campanha, conta, status, moeda, impressões, cliques, conversões, custo médio, percentuais de primeira posição e parte superior, orçamento, estratégia de lance e custo. A captura produtiva exige cabeçalho mapeável para as métricas; não infere GEO/estado/CPA/valor de conversão. A data vem exclusivamente de um controle de período MCC que exponha uma única data. A moeda vem de código ou símbolo explícito e inequívoco na linha; não se deduz de campanha nem se aceita `$` isolado.

## Ponte e dados

No caminho CSV, o popup lê os bytes do arquivo escolhido para transportá-los sem alterar o conteúdo, e o service worker abre/ativa a rota local específica do Preparador. Um script isolado reconstrói um `File` com o mesmo nome e bytes e o atribui ao campo existente do slot D0. No caminho de grade, o service worker envia somente a captura validada e chama `window.__hubReceiveMccD0Grid` ou `window.__hubReceiveMccD1Grid`, sempre em `world: 'MAIN'`: o mundo `ISOLATED` padrão compartilha o DOM, mas não vê as funções registradas em `window` pela página. O adaptador cria uma representação tabular em memória e usa `parseSource` com o papel D0/D−1 existente. Parser, validação, manifesto, identidade, IndexedDB e observabilidade permanecem exclusivamente no Hub. Nenhum dos caminhos grava até o usuário acionar `Atualizar base`.

Os contratos `mcc-d0-grid-v2` e `mcc-d1-grid-v2` exigem `account_id` no formato `000-000-0000` em cada campanha. O nome visível da conta permanece em `account`. D−1 inclui `periodRole: 'd1'` e valida a data esperada no fuso `America/Sao_Paulo`. Se D0 já estiver no Preparador, a data D0 deve ser exatamente o dia seguinte; a mesma verificação é aplicada ao carregar D0 depois de D−1. Para usar a captura direta após atualizar o projeto, recarregue a extensão em `chrome://extensions`. O fluxo manual de CSV continua disponível.

Ao aplicar uma nova captura, o Hub usa o número completo como identidade da conta. Campanhas históricas que guardam apenas o prefixo são vinculadas a esse número quando o prefixo aponta para um único ID observado e não há conflito com o domínio histórico. Linhas diárias permanecem associadas à mesma campanha; vendas vinculadas recebem o ID completo sem alteração de valores. Prefixos ambíguos continuam sem vínculo automático. O texto colado de uma página MCC serve para diagnosticar o formato, mas não é importado como captura estrutural.

## Permissões

- `scripting`: ler o DOM semântico da aba ativa após ação explícita e encaminhar CSV/captura ao Preparador local.
- `activeTab`: permissão temporária apenas para a aba ativa após ação explícita no popup, usada para captura e diagnóstico local na MCC.
- Host `http://127.0.0.1:8765/preparador-MCC/*`: localizar/abrir e injetar somente na rota local do Preparador.
- Não há permissão permanente para `ads.google.com`; a leitura da página ativa usa apenas a concessão temporária `activeTab`.
- Não solicita permissão permanente para todos os sites, histórico, downloads, clipboard ou APIs da MCC/Google Ads. A leitura só tenta executar após validar a URL ativa em `https://ads.google.com/`.

## Limites conhecidos

- Depende do Hub local estar ativo exatamente na porta `8765`.
- O Chrome não permite a extensão gravar a base diretamente; a confirmação final continua no Preparador.
- A captura estrutural exige data única explícita no controle da MCC; períodos relativos, multidiários ou não reconhecidos são bloqueados, nunca substituídos pela data local do computador.
- D−1 só é aceito se a data explícita corresponder a ontem no fuso `America/Sao_Paulo`; se D0 também estiver no Preparador, as datas precisam ser consecutivas. D−1 isolado fica aguardando D0 e nunca atualiza a base.
- O Preparador precisa estar disponível em `http://127.0.0.1:8765/preparador-MCC/` na mesma janela do Chrome para foco/entrega confiáveis.
- A grade precisa expor cabeçalhos/células semânticos e todas as campanhas no DOM. Conteúdo que não esteja materializado é bloqueado em vez de tratado como completo.
- Arquivos muito grandes podem atingir limites de mensageria/injeção do Chrome; os CSVs usuais da MCC são o cenário do MVP.

## Teste de paridade

Execute `node tests/mcc-extension-parity.test.mjs`. O teste compara, sem IndexedDB ou dados reais, o resultado do decodificador/parser atuais quando recebem o mesmo CSV pelo fluxo de seleção manual e pela reconstrução de bytes usada pela extensão.

Para captura estrutural D0/D−1, prévia, data operacional, zero × ausência, bloqueios de completude, ponte e ordenação execute `node tests/mcc-grid-production.test.mjs` e `node tests/preparador-d1.test.mjs`; a não regressão D0 do Preparador está em `node tests/preparador-d0.test.mjs`. Para o diagnóstico da grade execute `node tests/mcc-grid-experiment.test.mjs`; para a captura textual execute `node tests/mcc-text-experiment.test.mjs`. Os testes usam fixtures sintéticas e não escrevem na base real. O teste de paridade CSV legado continua em `node tests/mcc-extension-parity.test.mjs`.

## Ordenação da prévia

Clique no cabeçalho para ordenar. O primeiro clique é crescente, o segundo decrescente; indicador e `aria-sort` refletem a direção. Métricas, custos e percentuais são ordenados numericamente; ausentes/inválidos permanecem no fim em ambos os sentidos. A ordenação não altera nem persiste a ordem do manifesto/base.

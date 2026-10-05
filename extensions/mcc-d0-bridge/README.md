# Extensão local — captura MCC D0/D−1

Extensão Chrome Manifest V3 para rolar a grade MCC até o final e capturar D0/D−1 para preparar uma prévia no Preparador local. O popup oferece uma ação discreta de rolagem e os botões **Capturar D0 da MCC** e **Capturar D−1 da MCC**. A tela do Preparador recebe somente as capturas estruturadas da extensão; não há campos de colagem nem seleção de arquivos.

A extensão não grava a base. A confirmação final continua sendo o botão **Atualizar base** no Preparador.

## Instalação local

1. Inicie o Hub e confirme que `http://127.0.0.1:8765/preparador-MCC/` está acessível.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione `extensions/mcc-d0-bridge`.
5. Opcionalmente, fixe **Hub MCC D0** na barra de extensões.

Não é necessário compactar, publicar ou instalar pela Chrome Web Store.

## Atualização da extensão

Versão atual: `1.2.7`. Toda atualização deve incrementar pelo menos o patch de `version` no `manifest.json`. Após atualizar os arquivos, recarregue **Hub MCC D0** em `chrome://extensions` e confira a nova versão. Recarregar somente as páginas do Hub não atualiza o código da extensão.

Erros de nomes duplicados aparecem em um quadro vermelho com o título **Captura bloqueada: campanha duplicada**, a lista dos nomes envolvidos e a orientação para corrigir a duplicidade na MCC. Se todas as linhas foram capturadas e a única divergência é a repetição de nomes, não aparece o aviso genérico de captura incompleta. Outros bloqueios reais são mostrados separadamente; as validações e a exigência de confirmação para gravar a base permanecem.

## Captura direta de D0

1. Abra na MCC a visão de campanhas, selecione um único dia D0 explícito e deixe visíveis as colunas obrigatórias: campanha, conta, status de qualificação, impressões, cliques, conversões, custo médio, impr. primeira posição, impr. parte superior, orçamento, estratégia de lance e custo.
2. Clique no ícone da extensão e, se a grade ainda não estiver no final, use **Rolar MCC até o final**. Aguarde a confirmação; a extensão rola a área da grade/página e espera o carregamento terminar, sem ler campanhas nem enviar dados.
3. Clique em **Capturar D0 da MCC**.
4. A extensão associa semanticamente cabeçalhos e células e lê o número completo da conta na mesma célula do nome. Só envia quando paginação/contagem indicam a lista completa, as campanhas são únicas, a associação linha/campanha é estrutural e os campos obrigatórios são legíveis. Se a MCC estiver incompleta, ambígua, truncada/virtualizada, sem data única explícita, sem número completo da conta ou sem moeda identificável, a captura é bloqueada.
5. O Preparador conserva o instante `capturedAt` lido pela extensão para identificar quando essa captura foi feita. Revise a aba da captura e suas diferenças antes da prévia.
6. O Preparador valida os dados e deixa a prévia pronta para revisão. Confira os dados e alertas.
7. A base permanece inalterada até você clicar manualmente em **Atualizar base**.

## Captura direta de D−1

1. Na MCC, selecione uma única data explícita correspondente a ontem no fuso `America/Sao_Paulo`; texto relativo como “Yesterday” sem a data resolvida não é aceito.
2. Use **Rolar MCC até o final** para que todas as campanhas estejam materializadas; aguarde a confirmação e clique em **Capturar D−1 da MCC**. A rolagem não lê nem encaminha dados.
3. A captura usa o mesmo leitor semântico e os mesmos campos obrigatórios de D0, mas envia o contrato `mcc-d1-grid-v3`. Data errada, intervalo, grade incompleta, cabeçalho ausente, nome duplicado, número completo da conta ilegível, identidade da MCC ausente ou moeda ambígua bloqueiam a entrega.
4. O Preparador instala os dados no slot D−1 existente. Se D0 ainda não estiver carregado, mostra “D−1 recebido e validado. Aguardando D0 para gerar a prévia.” Não é criado manifesto aplicável nem gravação isolada.
5. Quando D0 estiver carregado, o Preparador exige uma única data em cada período e que D0 seja o dia imediatamente seguinte a D−1. Nomes, contas, moedas e percentuais seguem as validações normais do manifesto `manifesto_mcc_v2`.
6. Revise a prévia combinada. A base continua inalterada até clicar manualmente em **Atualizar base**.

Valores `0` são mantidos como zero confirmado; `—` e células vazias são ausência e não se convertem em zero. A moeda só é inferida de código/símbolo explícito e inequívoco (`$` isolado é insuficiente). GEO, estado individual, CPA e valor de conversão não são inventados quando não estão disponíveis com segurança.

## Recebimento no Preparador

Os quadros D0 e D−1 exibem o estado e o resumo da captura estruturada enviada pela extensão. Cada D0 aceito também aparece em uma aba com horário de Brasília e diferenças daquela captura (impressões, cliques, custo e pausa explícita). Esse resumo fica no `localStorage` da origem canônica do Preparador, separado da base; permanece após **Limpar tudo** e ao reabrir a tela. Abas anteriores são somente leitura, e só a captura atual validada habilita **Atualizar base**. A entrada manual por colagem, arraste ou seleção de arquivo foi removida. O receptor `window.__hubReceiveMccD0Grid`/`window.__hubReceiveMccD1Grid` continua sendo o único caminho de entrada da extensão; ele prepara a prévia, mas não grava a base.

## Integração e permissões

- `scripting`: ler o DOM semântico da aba MCC após ação explícita e encaminhar uma captura validada ao Preparador local.
- `activeTab`: acesso temporário à aba ativa após ação explícita no popup.
- A rolagem automática usa o mesmo acesso temporário para alterar somente a posição da área rolável da grade/página da MCC; não extrai conteúdo, não navega e não pede permissões extras.
- Host `http://127.0.0.1:8765/preparador-MCC/*`: restrito à rota local do Preparador.
- Não há permissão permanente para `ads.google.com`, histórico, clipboard ou todos os sites.

Na captura direta, o service worker envia somente os dados validados e chama `window.__hubReceiveMccD0Grid` ou `window.__hubReceiveMccD1Grid` em `world: 'MAIN'`. Parser, validação, manifesto, identidade, IndexedDB e observabilidade permanecem exclusivamente no Hub.

Ao aplicar uma nova captura, o Hub usa o número completo como identidade da conta. Prefixos ambíguos continuam sem vínculo automático. D−1 precisa corresponder a ontem no fuso `America/Sao_Paulo`; quando D0 também estiver carregado, as datas devem ser consecutivas. D−1 isolado aguarda D0 e nunca atualiza a base.

## Testes

Execute `node tests/mcc-extension-popup.test.mjs` e `node tests/mcc-page-scroll.test.mjs` para verificar opções, rolagem e versão. Para captura estrutural D0/D−1, prévia, data operacional, zero × ausência e bloqueios de completude execute `node tests/mcc-grid-production.test.mjs`, `node tests/preparador-d1.test.mjs` e `node tests/preparador-d0.test.mjs`. Os testes usam fixtures sintéticas e não escrevem na base real.

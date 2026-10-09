# Extensão local — captura MCC D0/D−1

Extensão Chrome Manifest V3 para rolar a grade MCC até o final e capturar D0/D−1 para preparar uma prévia no Preparador local. O popup oferece uma ação discreta de rolagem e os botões **Capturar D0 da MCC** e **Capturar D−1 da MCC**. A tela do Preparador recebe somente as capturas estruturadas da extensão; não há campos de colagem nem seleção de arquivos.

A extensão não grava a base. A confirmação final continua sendo o botão **Atualizar base** no Preparador.

A versão 1.2.23 corrige a faixa das páginas posteriores do Marketplace ClickBank: não presume que `offset` na URL seja uma quantidade de produtos pulados. Confirma a página pelo controle selecionado e pelas posições globais visíveis, mantendo as validações de completude. Recarregue a extensão em `chrome://extensions` para usar a correção.

A versão 1.2.22 acrescentou a captura da coluna opcional **Parc. de impr. da rede de pesquisa** quando visível e identificada sem ambiguidade. O Diário mostra essa participação após “% parte sup.”, separada das parcelas de posição. Deixe essa coluna visível na MCC nas novas capturas D0/D−1. Limites como “< 10%” são conservados, não convertidos em 10% exatos; dados antigos não são preenchidos retroativamente.

## Instalação local

1. Inicie o Hub e confirme que `http://127.0.0.1:8765/preparador-MCC/` está acessível.
2. Abra `chrome://extensions` no Chrome.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e selecione `extensions/mcc-d0-bridge`.
5. Opcionalmente, fixe **Hub MCC D0** na barra de extensões.

Não é necessário compactar, publicar ou instalar pela Chrome Web Store.

## Atualização da extensão

Versão atual: `1.2.23`. Toda atualização deve incrementar pelo menos o patch de `version` no `manifest.json`. Após atualizar os arquivos, recarregue **Hub MCC D0** em `chrome://extensions` e confira a nova versão. Recarregar somente as páginas do Hub não atualiza o código da extensão. A versão 1.2.11 acrescentou acesso exclusivamente à rota local Top Offers CB; aceite essa permissão caso o Chrome a solicite. A leitura da DTC usa `activeTab` somente após o clique, sem permissão permanente para `orders.clickbank.net`. Confirme que a extensão carregada usa esta pasta, não uma cópia antiga.

No popup, as três ações ClickBank compartilham uma grade de duas colunas com intervalo de 8px e botões compactos de altura mínima de 33px. A captura de países da DTC ocupa uma coluna, logo abaixo das duas ações do Marketplace. A orientação detalhada fica neste README; mensagens de resultado continuam disponíveis, mas não reservam espaço quando vazias.

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

Você pode capturar somente D−1, sem capturar D0 primeiro. Se o Preparador tiver um D0 antigo/incompatível aberto, ele fica preservado **Fora da prévia**, e o novo D−1 gera sua própria prévia. Com D0 compatível, a combinação normal continua; para usar só D−1, clique em **Usar apenas D−1** no Preparador. O botão passa a **Incluir D0 na prévia**, que só combina novamente se data/MCC forem compatíveis. Capturar um novo D0 compatível também volta ao modo combinado. Nada é aplicado até **Atualizar base**. Este ajuste é do Hub: recarregue a página do Preparador; não requer atualizar a extensão.

1. Na MCC, selecione uma única data explícita correspondente a ontem no fuso `America/Sao_Paulo`; texto relativo como “Yesterday” sem a data resolvida não é aceito.
2. Use **Rolar MCC até o final** para que todas as campanhas estejam materializadas; aguarde a confirmação e clique em **Capturar D−1 da MCC**. A rolagem não lê nem encaminha dados.
3. A captura usa o mesmo leitor semântico e os mesmos campos obrigatórios de D0, mas envia o contrato `mcc-d1-grid-v3`. Data errada, intervalo, grade incompleta, cabeçalho ausente, nome duplicado, número completo da conta ilegível, identidade da MCC ausente ou moeda ambígua bloqueiam a entrega.
4. O Preparador instala os dados no slot D−1 existente e gera a prévia mesmo sem D0. A base só é atualizada após validação e clique explícito em “Atualizar base”. Se D0 for carregado depois, a prévia passa a combinar os dois períodos.
5. Quando D0 estiver carregado, o Preparador exige uma única data em cada período e que D0 seja o dia imediatamente seguinte a D−1. Nomes, contas, moedas e percentuais seguem as validações normais do manifesto `manifesto_mcc_v2`.
6. Revise a prévia combinada. A base continua inalterada até clicar manualmente em **Atualizar base**.

Valores `0` são mantidos como zero confirmado; `—` e células vazias são ausência e não se convertem em zero. A moeda só é inferida de código/símbolo explícito e inequívoco (`$` isolado é insuficiente). GEO, estado individual, CPA e valor de conversão não são inventados quando não estão disponíveis com segurança.

## Recebimento no Preparador

Os quadros D0 e D−1 exibem o estado e o resumo da captura estruturada enviada pela extensão. Cada D0 aceito também aparece em uma aba com horário de Brasília e diferenças daquela captura (impressões, cliques, custo e pausa explícita). Esse resumo fica no `localStorage` da origem canônica do Preparador, separado da base; permanece após **Limpar tudo** e ao reabrir a tela. Abas anteriores são somente leitura, e só a captura atual validada habilita **Atualizar base**. A entrada manual por colagem, arraste ou seleção de arquivo foi removida. O receptor `window.__hubReceiveMccD0Grid`/`window.__hubReceiveMccD1Grid` continua sendo o único caminho de entrada da extensão; ele prepara a prévia, mas não grava a base.

## Integração e permissões

- `scripting`: ler o DOM semântico da aba MCC após ação explícita e encaminhar uma captura validada ao Preparador local.
- `activeTab`: acesso temporário à aba ativa após ação explícita no popup. Na ação da DTC, o leitor acessa somente o nome da oferta no resumo e os códigos do grupo “Países Comuns” ou de uma lista simples sem grupos com até 10 países; não lê e-mail, endereço, CEP, cartão ou outros campos do checkout.
- A rolagem automática usa o mesmo acesso temporário para alterar somente a posição da área rolável da grade/página da MCC; não extrai conteúdo, não navega e não pede permissões extras.
- Host `http://127.0.0.1:8765/preparador-MCC/*`: restrito à rota local do Preparador.
- Host `http://127.0.0.1:8765/curadoria/clickbank-top-offers/*`: restrito à página local de prévia ClickBank, sem gravação automática.
- `clipboardWrite`: copiar o TSV dos produtos ClickBank após clique explícito; não lê o clipboard.
- Não há permissão permanente para `ads.google.com`, `accounts.clickbank.com`, histórico, leitura do clipboard ou todos os sites.

Na captura direta, o service worker envia somente os dados validados e chama `window.__hubReceiveMccD0Grid` ou `window.__hubReceiveMccD1Grid` em `world: 'MAIN'`. Parser, validação, manifesto, identidade, IndexedDB e observabilidade permanecem exclusivamente no Hub.

Ao aplicar uma nova captura, o Hub usa o número completo como identidade da conta. Prefixos ambíguos continuam sem vínculo automático. D−1 precisa corresponder a ontem no fuso `America/Sao_Paulo`; quando D0 também estiver carregado, as datas devem ser consecutivas. D−1 ou D0, isoladamente, pode atualizar somente o período recebido depois que a prévia for validada e o usuário clicar em **Atualizar base**.

## Capturar produtos ClickBank

1. Abra o Marketplace em `https://accounts.clickbank.com/master/dashboard/affiliate-marketplace` e aguarde a tabela carregar. Parâmetros antes do `#` e a rota de resultados depois dele são aceitos.
2. Abra o popup da extensão e clique em **Capturar produtos ClickBank**. A leitura tem prazo máximo de 15 segundos; abrir/carregar o Hub e aguardar o receptor pode levar tempo adicional. A aba do Hub só é focada após aceitar a prévia.
3. A extensão amplia a tabela, reúne as linhas da página atual e percorre internamente as duas direções quando há virtualização. Confere a quantidade pelo rodapé de paginação ou pelo total explícito combinado com `resultsPerPage` e a página selecionada/posições globais renderizadas. Não interpreta `offset` como quantidade de produtos pulados: ele pode representar o índice da página. Antes de percorrer horizontalmente, lê Rank; a faixa confirmada permanece estável mesmo quando essa coluna deixa de estar visível. Confere todas as posições consecutivas ao finalizar; faixa incorreta, página ambígua ou mudança de página interrompem o envio. Nunca usa 50/1251 como constantes de contagem.
4. Somente quando a contagem e as nove colunas forem confirmadas, o mesmo botão abre ou reutiliza `http://127.0.0.1:8765/curadoria/clickbank-top-offers/`, preenche **ClickBank — nova captura** e valida a prévia. Não é necessário Ctrl+C/Ctrl+V. A paginação (total/faixa) e o horário real da captura são preservados. Revise e clique explicitamente em **Salvar captura**; a extensão nunca salva nem chama o storage.
5. O popup ainda tenta copiar TSV após o envio, se permanecer aberto, com cabeçalho **Rank, Offer Name, Seller, Avg $, Initial $, Future $, EPC, CVR, Gravity, Offer ID**. O Chrome pode fechar o popup ao focar o Hub; a cópia não é requisito do envio e não é garantida nesse caso. O ID vem apenas do link interno renderizado da oferta; ausente, exporta `—`. Símbolos de fórmula em texto recebem apóstrofo; traços, moedas, percentuais e zeros são preservados. Falha no clipboard não bloqueia a prévia já preenchida. Erros de envio mostram o texto capturado para recuperação manual; capturas parciais nunca são encaminhadas nem copiadas automaticamente.
6. **Restaurar tamanho da tabela** repõe os estilos originais dos elementos alterados. A posição das rolagens já é restaurada ao terminar a captura; o botão pode ser usado depois de fechar e reabrir o popup na mesma aba. Recarregar/navegar a página também descarta as alterações visuais locais.

A captura não troca filtros, ordenação ou página nem consulta endpoints/React. Encaminha somente uma prévia ao Hub, sem gravação. Se já existir texto no diálogo, ele é preservado e o novo envio é recusado: salve ou limpe o rascunho antes de tentar novamente. O receptor aguarda a leitura inicial do histórico para comparar a prévia. Para um novo recorte, use a paginação normal do Marketplace. O worker pode continuar o encaminhamento após fechar o popup; confira a aba do Hub antes de repetir. Cancelar o diálogo não salva a captura.

As páginas posteriores mantêm suas posições globais: com 50 itens por página, a página 2 envia 51–100, a página 3 envia 101–150 e a última pode conter menos itens. Cada clique captura somente a página atual; não percorre outras páginas automaticamente e não declara que ofertas fora desse recorte saíram do ranking. O rodapé explícito continua tendo prioridade. Sem rodapé nem página/posições verificáveis, bloqueia sem adivinhar pela URL.

## Capturar países comuns da DTC

1. Abra o checkout em `https://orders.clickbank.net/` e deixe carregada a lista **Top Offers CB** do Hub em alguma aba. A ficha da oferta não precisa estar aberta.
2. No popup, clique em **Capturar países comuns da DTC**. A ação, iniciada pelo usuário, lê apenas o título exibido depois de **Cart Summary** e as opções de duas letras do grupo **Países Comuns/Common Countries** no seletor de país. Esse grupo tem prioridade. Quando não existe, aceita todos os países de uma lista sem grupos com 1 a 10 códigos válidos distintos. Ignora placeholders como “Selecione o país”, opções desabilitadas, duplicatas e códigos inválidos. Nenhum dado de pagamento ou endereço é consultado.
3. O Hub normaliza o nome do produto e considera a frase completa ou, se o checkout incluir uma variante/pacote após hífen, o nome principal (antes do hífen) no início do título da oferta. Prefixos promocionais conhecidos, como “NEW”, são ignorados. Nomes de uma palavra com pelo menos 6 caracteres, como **FemiCore**, exigem igualdade com o segmento inicial completo da oferta; não casam com **FemiCorePlus**, **FemiCore Max** ou ocorrência no slogan. Frases mantêm o mínimo de 8 caracteres e duas palavras. A gravação só acontece com uma correspondência única; nomes principais curtos ou repetidos entre ofertas continuam bloqueados. A correção dessa associação é do Hub: recarregue Top Offers CB; não exige nova versão da extensão.
4. A lista encontrada é mesclada com os países existentes (sem duplicatas), salva na store isolada `offerMetadata` e exibida na aba Google Trends com a marca **DTC**. A ficha mostra **Lista capturada da DTC** e o horário da captura. A captura original do Marketplace, países manuais existentes e outras lojas/bases não são sobrescritos.
5. A extensão não abre nem foca uma tela do Hub. Ela ignora abas Top Offers antigas sem o marcador do receptor atual; se nenhuma aba compatível estiver aberta, recarregue a extensão `1.2.23` em `chrome://extensions`, atualize a página Top Offers CB e repita o clique. A ficha individual não precisa estar aberta.

Não há uma permissão permanente para o domínio da DTC: `activeTab` só permite leitura após clicar no botão com o checkout na aba ativa. A ação não acessa endpoints nem percorre os campos de pagamento.

O leitor reconhece os seletores exatos `billing.countryCode` e `shipping.countryCode` (por `name` ou `id`) e procura primeiro o grupo **Países Comuns** somente nesses campos. O limite de 10 vale apenas para a lista simples sem `optgroup`: uma lista maior ou grupos não reconhecidos bloqueiam essa alternativa, sem salvar. O formato anterior conserva sua regra e não passa a capturar **Outros países**. Não lê o país selecionado nem outros dados do checkout.

Responsabilidades: `clickbank-domain.mjs` valida Marketplace/define colunas/formata TSV; `clickbank-reader.mjs` faz leitura/expansão reversível/contagem; `clickbank-dtc-reader.mjs` limita a leitura ao título e às opções de país aceitas nos dois formatos; `clickbank-forward.mjs` entrega os dois fluxos exclusivamente à rota local e exige o marcador de compatibilidade do receptor DTC versão 2; `background.js` valida a aba de origem, ignora abas Top Offers antigas sem esse marcador e encaminha países somente a uma lista atualizada já aberta; `clickbank-popup.mjs` e `clickbank-dtc-popup.mjs` apresentam ações e retornos separados. No Hub, `extension-capture.mjs` valida a mensagem, anuncia a versão do receptor e exige correspondência única; `dtc-country-capture.mjs` normaliza identidade e mescla países sem perder dados; o page salva a origem/horário e a view apresenta a indicação. O store existente `offerMetadata` é mantido, sem migração de versão do banco. Nenhuma permissão permanente para domínio externo foi adicionada. MCC e velocidades VSL continuam independentes.

## Velocidade da VSL (1×, 10×, 20× e 30×)

Na aba da oferta, inicie o vídeo, abra a extensão e escolha uma velocidade. O controle procura o vídeo HTML5 principal visível (preferindo um em reprodução), incluindo shadow roots abertos e iframes da mesma origem. Sem vídeo acessível, usa a API pública de um `vturb-smartplayer` visível. Não consulta endpoints, não baixa mídia nem atravessa frames externos/shadow roots fechados. A injeção usa `activeTab` + `scripting`, em `MAIN` para acessar a API pública VTurb; nenhuma permissão foi ampliada.

- **1× e 10×:** reprodução contínua. HTML5 confere `playbackRate` após o ajuste; a API VTurb `speed()` sem getter recebe mensagem de solicitação, não confirmação de velocidade efetiva. O áudio em 10× pode ser silenciado pelo navegador. Não inicia playback por conta própria.
- **20× e 30×:** avanço aproximado por saltos, autorizado pelo usuário em 06/10/2026. O Chromium limita `playbackRate` a 16×, portanto estas opções **não são reprodução contínua** e nunca são reduzidas silenciosamente para 16×. Usam base 1×, saltos a cada 500 ms e áudio temporariamente silenciado. Buffering/seek/restrições do player podem reduzir a velocidade efetiva. VTurb usa `seek()`, `currentTime`, `duration`, `paused`, `volume` e `setVolume()` públicos; sem esses recursos, bloqueia com aviso.
- Pausar o vídeo pausa os saltos. Escolher 1× ou 10× cancela o timer e restaura o estado anterior de áudio (HTML5: `muted`; VTurb: volume público), sem unmute forçado. O fim do vídeo, remoção do player ou falha de seek interrompem o modo. Trocar 20×/30× substitui o timer, não o duplica. Não tenta revelar botões de compra ou interferir em regras de venda.
- O estado vive apenas na aba, em `window.__hubVslPlaybackV1`, e permanece ao fechar o popup. Reabrir consulta o estado sem alterar a mídia. Navegar/recarregar descarta o controle. A velocidade não é sincronizada entre abas nem armazenada na base/localStorage.

Responsabilidades: `vsl-domain.mjs` valida URL/rates; `vsl-controller.mjs` é o controlador autocontido injetado; `vsl-popup.mjs` controla feedback, consulta e cliques; `background.js` restringe à aba ativa e encaminha mensagens independentes de MCC/ClickBank. Não remover botões antigos, enviar capturas ou escrever no Hub durante este fluxo.

Referências: [API pública VTurb](https://smartplayer.vturb.com/en/api/) e [limites HTMLMediaElement no Chromium](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/html/media/html_media_element.h).

## Testes

### Verificação VSL

`node --test tests/vsl-extension.test.mjs tests/mcc-extension-popup.test.mjs tests/clickbank-extension.test.mjs` cobre domínio, função serializada, reprodução nativa, saltos sem extrapolar duração, pausa/seek, troca repetida, cancelamento/áudio, falha de player, frames, popup, consulta concorrente e roteamento, somente em memória. Depois execute build e suíte completa. Para QA visual, use página sintética isolada; nunca importe dados reais ou grave fixtures nas bases do Hub. No Chrome, recarregue a extensão e valide também a oferta real: dependências do site/player e injeção `activeTab` não são substituídas pelos mocks.

### Verificação ClickBank

`node --test tests/clickbank-forward.test.mjs tests/clickbank-dtc-countries.test.mjs` cobre os fluxos ClickBank e DTC com dados sintéticos: extração restrita nos dois formatos, limites de 1/10/11 países na lista simples, exclusão de placeholders, prioridade do grupo comum, correspondência ambígua, mesclagem sem sobrescrita, receiver local e roteamento sem abrir/focar aba. Após recarregar a extensão 1.2.23 em `chrome://extensions` e a página Top Offers CB, use o botão no checkout DTC para salvar países; a instalação real não é substituída pelos mocks.

`node --test tests/clickbank-extension.test.mjs tests/mcc-extension-popup.test.mjs tests/mcc-extension-parity.test.mjs tests/mcc-grid-experiment.test.mjs tests/mcc-text-experiment.test.mjs tests/mcc-page-scroll.test.mjs` cobre virtualização em ambos os eixos, 50 linhas, última página menor, repetição sem duplicação, nove colunas fora de ordem, Offer ID opcional, completude, TSV seguro, erros, bloqueio de concorrência, clipboard negado, restauração exata e preservação do roteamento MCC, em memória. A validação final na conta real deve confirmar os seletores/cabeçalhos do Marketplace e a cópia pelo Chrome após recarregar a extensão; os testes sintéticos não substituem essa conferência.

### Verificação MCC

Execute `node tests/mcc-extension-popup.test.mjs` e `node tests/mcc-page-scroll.test.mjs` para verificar opções, rolagem e versão. Para captura estrutural D0/D−1, prévia, data operacional, zero × ausência e bloqueios de completude execute `node tests/mcc-grid-production.test.mjs`, `node tests/preparador-d1.test.mjs` e `node tests/preparador-d0.test.mjs`. Os testes usam fixtures sintéticas e não escrevem na base real.

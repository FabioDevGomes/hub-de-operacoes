# Extensão Hub 2.0

Extensão local do Chrome, Manifest V3, para ações de ClickBank, controle de velocidade de VSL, captura de assets e atalhos do Hub.

## Recursos

- Velocidade da VSL em 1×, 20×, 30×, 40× e 50×. A partir de 20×, o avanço é aproximado por saltos e fica sem áudio; 1× interrompe os saltos e restaura o áudio.
- Captura de produtos ClickBank, restauração do tamanho da tabela e captura de países comuns da DTC.
- Captura da área visível da aba ativa como Desktop ou Mobile, enviada diretamente ao Asset Studio.
- Importação do favicon declarado pela página ou de `/favicon.ico`, quando está no mesmo domínio e em formato compatível.
- Busca imagens carregadas na página do produto, mostra uma galeria no Asset Studio e permite salvar até duas imagens para uso posterior.
- Os seis atalhos de telas frequentes ativam uma aba do Hub já aberta na tela correspondente, inclusive em outra janela do Chrome. A correspondência da navegação ignora parâmetros auxiliares, inclusive o ID de histórico de Snapshots da Operação. Sem correspondência, abre a tela em uma aba nova na janela de origem; cliques concorrentes para a mesma tela são serializados para evitar abas duplicadas. Se a extensão não estiver disponível, o Hub informa o problema e mantém a tela atual.
- O botão de detalhamento de cada notificação abre o registro correspondente em Snapshots da Operação. Se uma aba Snapshots da Operação já estiver aberta, a extensão seleciona a atualização nela sem recarregar a aplicação; sem uma aba Snapshots da Operação, abre uma aba dedicada. Registros já abertos são ativados. Sem a extensão, o Hub usa uma aba nomeada do navegador.
- Na tela Criar campanha Google Ads, os atalhos **Abrir recursos** nos cartões de destino e no painel de envio de imagens usam favoritos salvos em `contas > pag recursos`. Atalhos **Abrir campanhas** aceitam favoritos salvos diretamente em `contas` ou nessa subpasta. O botão **Abrir lista de contas** nas exportações por MCC usa um favorito da página Contas da MCC salvo nessas mesmas pastas. A Visão Geral também vincula o número da conta ao favorito único de Campanhas cujo título contenha o CID. O Hub associa pelo nome ou CID escrito no título e, com correspondência única, a extensão abre exatamente o URL salvo, preservando os parâmetros. Sem link único, a Visão Geral mantém o número como texto. A navegação usa a sessão atual do Chrome, sem ler ou preencher credenciais, e não chama a Google Ads API.

### Acesso às páginas salvas do Google Ads

1. Abra o popup da extensão e clique em **Autorizar acesso ao Google Ads**. O Chrome pede acesso somente a `ads.google.com`; a permissão é opcional e pode ser revogada em `chrome://extensions`.
2. No popup, clique em **Autorizar leitura de favoritos**. Essa permissão opcional dá à extensão acesso à árvore de favoritos do Chrome. O Hub localiza `contas`, usa links de Contas da MCC e Campanhas salvos diretamente nela e links de Recursos, Contas da MCC e Campanhas em `contas > pag recursos`.
3. Abra **Criar campanha Google Ads** ou **Visão Geral** no Hub. As duas telas sincronizam os favoritos ao abrir e recebem atualizações quando um favorito é adicionado, alterado, movido ou removido enquanto estiverem abertas. Na criação, os títulos devem conter o nome da MCC exibido no Hub ou seu CID para uma associação automática e inequívoca; na Visão Geral, o favorito precisa conter o CID da conta.
4. O Hub mostra **Abrir recursos** nos destinos e no painel de imagens, **Abrir lista de contas** nas linhas de exportação MCC e **Abrir campanhas** onde essa ação já existe, somente quando encontra o favorito único correspondente. Sem correspondência ou com título ambíguo, aparece um aviso amarelo no lugar do link. Ao clicar, o Hub passa à extensão o URL salvo sem modificar seus parâmetros; se o Google Ads abrir **Selecionar uma conta**, a extensão tenta selecionar a MCC pelo ID correspondente. Nenhum filtro é aplicado.

Os links têm aparência de hiperlink, mas os cliques são encaminhados à extensão para evitar deixar o usuário parado no seletor de contas. A extensão reaproveita a sessão existente do Chrome, não contorna autenticação, não lê credenciais e não preenche a tela de login. Se o Google Ads redirecionar para login, conclua a autenticação normalmente no navegador.

## Captura de assets

1. Inicie o Hub local e abra a página do produtor.
2. Para Desktop, deixe a página no enquadramento desejado. Para Mobile, ative o modo responsivo do Chrome com F12 e ajuste a largura/altura antes da captura.
3. Abra a extensão e clique em **Capturar Desktop**, **Capturar Mobile** ou **Importar favicon desta página**.
4. A extensão abre ou ativa o Asset Studio e preenche a prévia escolhida. Não cria uma página intermediária nem substitui a área de transferência.
5. No Asset Studio, selecione a pasta do produto, confira a prévia e clique em **Gerar**. O processamento existente cria `assets/01.png`, `assets/02.png` e `assets/03.png`.

### Imagens do produto

1. Abra a página do produto e clique em **Selecionar imagens do produto** na extensão.
2. A extensão procura imagens carregadas com pelo menos 150 × 150 pixels, percorre no máximo 10.000 elementos de imagem e mostra até 36 opções. Se a mensagem indicar uma varredura parcial, role a página do produto para carregar outras imagens e faça uma nova busca.
3. Se algum domínio de imagem ainda não estiver autorizado, a extensão mostra **Autorizar acesso e abrir galeria**. Clique nesse botão para que o Chrome peça acesso somente aos hosts encontrados. Esse pedido acontece após o clique explícito; se você negar, a galeria não abre e o botão continua disponível para tentar novamente.
4. Depois da autorização (ou imediatamente se os domínios já estiverem permitidos), a galeria abre no Asset Studio. Selecione até duas imagens e informe o nome do produto. Você pode salvá-las ali mesmo ou clicar em **Gerar 01, 02 e 03**; essa geração também salva as imagens selecionadas na pasta `produto/pag01/assets`.
5. Os arquivos são normalizados para PNG/JPG com até 5 MB e recebem os nomes `imagem-produto-01.png|jpg` e `imagem-produto-02.png|jpg`. A numeração é sequencial entre as imagens selecionadas e respeita a ordem em que aparecem na galeria. O Asset Studio mantém o índice `imagens-produto.json` em `produto/.hub/`, fora da página que será hospedada; ele lista a seleção vigente para o Hub. Não é criado um arquivo auxiliar de instruções dentro de `assets`. Um arquivo de imagem anterior com o mesmo nome só é substituído após confirmação. Arquivos antigos não listados no índice são preservados e não fazem parte da seleção atual.

Se houver uma aba antiga do Asset Studio aberta, a extensão procura uma aba com a galeria atualizada ou abre uma nova, preservando a aba antiga.

Esse fluxo apenas captura e salva arquivos localmente; não envia imagens para o Google Ads. A varredura lê imagens `<img>` já carregadas no documento. Fundos CSS e imagens que ainda não foram carregadas não aparecem.

As capturas Desktop e Mobile leem somente a área visível da aba ativa no momento do clique. O modo Mobile usa a emulação que você configurou no F12; a extensão não altera as dimensões do DevTools.

O favicon é procurado primeiro nos links declarados pela página e, depois, no endereço padrão `/favicon.ico`. Por segurança, a importação automática aceita arquivos no mesmo domínio da página ou um favicon embutido. Ícones externos, inacessíveis ou incompatíveis podem ser selecionados manualmente no Asset Studio.

## Instalação local

1. Inicie o Hub e confirme que `http://127.0.0.1:8765/asset-studio/` está acessível.
2. Abra `chrome://extensions` no Chrome e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione `extensions/hub-2.0`.
4. Fixe **Hub 2.0** na barra do navegador, se quiser.

## Acesso solicitado

- `activeTab`: acessa a aba atual somente depois que você aciona a extensão.
- `scripting`: executa ações na aba ativa e entrega a imagem à página local do Asset Studio.
- Acesso ao Google Ads é opcional: ao clicar em **Autorizar acesso ao Google Ads**, a extensão solicita `https://ads.google.com/*` para abrir o link aprovado e, se necessário, escolher a conta no seletor. Não pede acesso às páginas de login.
- Leitura de favoritos é opcional: ao clicar em **Autorizar leitura de favoritos**, a extensão solicita a permissão `bookmarks`. A API dá acesso à árvore de favoritos; o Hub localiza `contas`, lê links da lista de Contas da MCC e de Campanhas salvos diretamente nela e links de Recursos, Contas da MCC e Campanhas em `contas > pag recursos`. As listas ficam separadas no `localStorage` do Hub e não são enviadas a servidor.
- Acesso a imagens externas é opcional: o Chrome pede os domínios exatos encontrados na página somente quando você usa a galeria. A extensão não recebe acesso permanente a todos os sites durante a instalação.
- `clipboardWrite`: mantida para o fluxo de captura ClickBank existente.
- A extensão recebe mensagens somente das páginas do Hub em `http://127.0.0.1:8765/*` e consulta URLs apenas nesse endereço local para encontrar a mesma tela. Ela lê a aba ativa de outro site somente após você clicar num recurso de captura; nunca procura abas de outros sites.

Após atualizar a extensão em `chrome://extensions`, clique em **Recarregar** e atualize as abas do Hub para instalar a ponte de mensagens.

Versão da extensão: `2.7.6`. A versão da extensão é independente da versão do Hub.

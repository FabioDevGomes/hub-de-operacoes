# Extensão Hub 2.0

Extensão local do Chrome, Manifest V3, para ações de ClickBank, controle de velocidade de VSL e captura de assets para o Asset Studio.

## Recursos

- Velocidade da VSL em 1×, 10×, 20× e 30×.
- Captura de produtos ClickBank, restauração do tamanho da tabela e captura de países comuns da DTC.
- Captura da área visível da aba ativa como Desktop ou Mobile, enviada diretamente ao Asset Studio.
- Importação do favicon declarado pela página ou de `/favicon.ico`, quando está no mesmo domínio e em formato compatível.
- Os seis atalhos de telas frequentes ativam uma aba do Hub já aberta na tela correspondente, inclusive em outra janela do Chrome. Sem correspondência, o atalho navega na aba atual.

## Captura de assets

1. Inicie o Hub local e abra a página do produtor.
2. Para Desktop, deixe a página no enquadramento desejado. Para Mobile, ative o modo responsivo do Chrome com F12 e ajuste a largura/altura antes da captura.
3. Abra a extensão e clique em **Capturar Desktop**, **Capturar Mobile** ou **Importar favicon desta página**.
4. A extensão abre ou ativa o Asset Studio e preenche a prévia escolhida. Não cria uma página intermediária nem substitui a área de transferência.
5. No Asset Studio, selecione a pasta do produto, confira a prévia e clique em **Gerar**. O processamento existente cria `assets/01.png`, `assets/02.png` e `assets/03.png`.

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
- `clipboardWrite`: mantida para o fluxo de captura ClickBank existente.
- A extensão recebe mensagens somente das páginas do Hub em `http://127.0.0.1:8765/*` e consulta URLs apenas nesse endereço local para encontrar a mesma tela. Não lê nem procura abas de outros sites.

Após atualizar a extensão em `chrome://extensions`, clique em **Recarregar** e atualize as abas do Hub para instalar a ponte de mensagens.

Versão da extensão: `2.0.5`. A versão da extensão é independente da versão do Hub.

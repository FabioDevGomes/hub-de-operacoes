# Avisos de erro

Este documento registra como os avisos de erro devem permanecer perceptíveis e acessíveis, inclusive quando a pessoa estiver rolando uma tela longa. Atualize-o ao criar ou alterar um padrão compartilhado de avisos; os casos específicos por tela podem ser acrescentados conforme forem revisados.

## Contrato visual e de interação

- Um erro de uma ação em andamento deve aparecer em uma posição fixa da janela, sem depender da posição de rolagem da página ou do painel.
- O aviso flutuante deve trazer o detalhe disponível, ser anunciado por tecnologia assistiva e permitir que o usuário o dispense pelo teclado ou mouse.
- Dispensar o aviso flutuante não apaga a mensagem detalhada no painel, não limpa o estado da operação nem repete/cancela a ação. A mensagem original continua sendo a fonte de detalhes.
- Não ocultar automaticamente um erro que ainda exige atenção. Quando uma nova operação produzir outro erro, o aviso deve ser atualizado.
- O componente flutuante precisa ser removido ao desmontar a tela para não vazar avisos em outras rotas.
- Avisos não fazem chamadas de API, gravação ou retry por si mesmos.

## Integrações → Hostinger

`mountHostingerConnection()` exibe um aviso fixo no canto superior direito sempre que `state.messageType` é `error`. O aviso fica fora do elemento que rola, contém a mensagem detalhada do estado, usa `role="alert"` e botão de dispensar. O erro original permanece no painel Conexão da API. O botão só dispensa a cópia flutuante; uma nova mensagem de erro a exibe novamente. Ao desmontar a tela, o elemento e o listener são removidos. Nenhuma consulta adicional à Hostinger ou ao Google Ads é feita.

Fontes: `src/hostinger/hostinger-connection-view.mjs`, `src/hostinger/hostinger.css` e integração/cache de módulo em `src/index.template.html`.

### Erro ao criar subdomínio já existente

O inventário geral de sites pode não refletir imediatamente todos os subdomínios. Antes do POST de criação, o servidor consulta o inventário específico do domínio principal e da conta; se o endereço exato já estiver cadastrado, reutiliza-o sem tentar criá-lo novamente. Se a Hostinger responder conflito, duplicidade ou erro 5xx, a mesma consulta é repetida até três vezes. Quando o endereço aparece, o Hub informa que ele foi reutilizado e avança para a prévia dos arquivos. Essa confirmação só prova que o subdomínio está cadastrado: a prévia continua necessária para conferir pasta e arquivos. Se a resposta continuar inconclusiva, atualizar **Subdomínios** em Integrações → Hostinger e reanalisar; não apagar arquivos por causa desse aviso. A consulta de conteúdo e a publicação são etapas separadas.

Fonte: `scripts/serve-panel.ps1` (`New-HostingerSubdomain`, `Get-HostingerSubdomainInventoryMatch`) e `src/copy-ficha/copy-ficha-deploy.mjs`.

## Pedido recomendado para revisar os avisos de erro

Para pedir a outro Chat uma revisão mais ampla, use:

> Leia `docs/avisos-de-erros.md` e faça um inventário dos avisos de erro do Hub. Para cada tela, identifique onde o erro aparece, se continua visível durante a rolagem, se é acessível por teclado/leitor de tela e se explica a próxima ação. Primeiro apresente os casos inconsistentes e uma proposta de prioridade; não altere o código até eu escolher o escopo.

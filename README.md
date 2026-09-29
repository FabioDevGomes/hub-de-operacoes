# Base de Dados Local de Campanhas

Painel local, sem servidor externo, para consolidar o histórico do Excel com as atualizações diárias do manifesto MCC.

O Hub inteiro é servido por `scripts/serve-panel.ps1`, usando somente o Windows
PowerShell. A execução não depende do Codex nem de um runtime Python. Todas as
telas existentes em `dist/` usam o mesmo processo local. O motor de Pre-Sell fica
versionado em `presell-engine/`, com as proteções de validação e não sobrescrita.
O endereço permanece fixo em `http://127.0.0.1:8765/`, pois o IndexedDB do
navegador é isolado por origem; trocar a porta faria a base existente parecer vazia.

## Abrir o painel sem o Codex

Dê um duplo clique em `iniciar-painel.cmd`. O iniciador liga o servidor somente no próprio computador e abre o endereço local no navegador. O Codex pode permanecer fechado.

### ZIP executado fora de `C:\Users\<perfil>`

O painel pode iniciar mesmo quando o projeto foi extraído em outro local. A pasta de produtos continua sendo detectada automaticamente no caminho padrão do usuário; para recursos de Pre-Sell em instalações fora desse padrão, crie `data-local\products-root.txt` ao lado de `iniciar-painel.cmd` e informe nele o caminho completo da pasta local de produtos. Essa pasta deve conter `template\presell-cookie-base`. Não informe a pasta `template` diretamente. Sem essa configuração, o painel e as demais telas continuam disponíveis, mas as operações de Pre-Sell que dependem dessa pasta informarão como configurá-la.

## Fluxo

1. **Atualizar base pelo Excel** importa a carga histórica inicial, incluindo abas visíveis e ocultas.
2. **Carregar manifesto** acrescenta D menos um usando `campanha + data` como chave lógica.
3. Registros idênticos não são duplicados.
4. Divergências são apresentadas antes de substituir valores existentes.
5. A base consolidada fica no armazenamento local do navegador.
6. **Baixar base JSON** cria uma cópia portátil para backup.
7. **Produtos testados** consolida campanhas ativas e históricas pelo nome do produto e é atualizado a cada manifesto.
8. **Remover da lista** é reversível: oculta o produto no cadastro sem apagar campanhas ou registros diários.
9. **Excluir ocultos permanentemente** baixa uma cópia de recuperação e, após confirmação, remove da base as campanhas e os registros diários ocultos.
10. O catálogo de produtos é uma segunda base local: guarda nomes personalizados, datas oficiais e itens ocultos sem alterar métricas.
11. **Editar nome** altera apenas o texto exibido; **Baixar catálogo** e **Carregar catálogo** permitem transportar esse cadastro separadamente.

## Estrutura da base

- `campanhas`: nomes da MCC, nomes de exibição e situação ativa/histórica.
- `diario`: métricas por campanha e data.
- `campos_operacionais`: ROI, investimento atual, limite de teste e valor restante.
- `importacoes`: histórico de cargas do Excel e de manifestos.

## Privacidade

O diretório `data-local` e arquivos Excel, CSV, manifestos e bases exportadas são ignorados pelo Git. O repositório deve conter somente o código da ferramenta e sua documentação.

Execute `node build.mjs` sem manifesto para gerar uma distribuição limpa para versionamento. Um manifesto só deve ser informado ao construtor em demonstrações locais que não serão publicadas.

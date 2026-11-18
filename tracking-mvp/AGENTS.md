# Instruções permanentes do tracking-mvp

- Antes de apresentar ou orientar qualquer deploy deste projeto, leia `deploy/PADRAO-DEPLOY-SERVIDOR.md` e o README do pacote específico. O README do pacote define os arquivos, destinos, SQL e ordem exatos da entrega.
- Prepare cada alteração publicável em uma pasta de pacote própria em `deploy/staging/`, sem misturar arquivos de pacotes ou versões anteriores. Preserve os pacotes existentes.
- Apresente os arquivos agrupados pelo diretório de destino no servidor. Mostre o destino uma vez como texto normal; para cada arquivo, informe a pasta local em bloco copiável, um link clicável para o arquivo, o nome e o caminho final no servidor.
- Liste somente os arquivos presentes na pasta de destino do pacote. Separe Hub local, código de servidor, SQL e configuração em etapas distintas e declare claramente o que exige upload ou execução manual.
- Declare o estado real: preparado localmente, enviado pelo usuário ou validado no servidor. Não trate build local como prova de publicação e não altere Hostinger/banco/Cron sem autorização explícita.

## Acesso ao navegador e phpMyAdmin

- Quando uma tarefa deste projeto exigir interagir com o navegador, tente primeiro pelo controle do Chrome e selecione a aba existente do serviço, se estiver aberta.
- Antes de preencher, clicar ou executar SQL, confirme visualmente a página e valide que a URL/host e o banco correspondem ao ambiente pretendido. Não execute se a aba ou URL não puderem ser identificadas com confiança.
- Preserve as outras abas: abra uma nova aba do Chrome quando necessário em vez de substituir uma página ativa sem relação com a tarefa.
- Se o controle do Chrome falhar ou não puder confirmar a URL, pare a interação e informe o motivo; não tente contornar pelo controle genérico do sistema operacional.

# Padrão de deploy manual no servidor

Este procedimento é a checklist comum para instalar atualizações da pasta `deploy/` na Hostinger. Ele não publica nada automaticamente e não substitui o README específico do pacote: **o README do pacote é a fonte para a lista exata de arquivos, destinos, SQL e sequência daquela versão**.

## Organização dos pacotes de entrega

- Coloque cada etapa incremental em uma pasta de pacote própria, separada de outras etapas e de versões anteriores.
- Dentro do pacote, mantenha cada pasta de destino (`hostinger-private-tools`, `hostinger-public-track` etc.) apenas com os arquivos que o usuário precisa enviar naquela etapa. O README fica na raiz do pacote; SQL pode ficar em uma pasta própria, como `database/`.
- Não misture na pasta de upload arquivos já publicados, cópias de segurança, credenciais, configurações privadas ou arquivos sem relação com a etapa atual. Se um endpoint existente for substituído, inclua só a nova versão dele, a menos que o README identifique dependências adicionais que também precisem ser publicadas.
- Antes de apresentar o deploy, confira os nomes reais dentro das pastas de destino e liste exatamente esses arquivos. Não instrua o usuário a enviar uma pasta inteira ou um pacote histórico combinado.

## 1. Identificar a entrega

- Abra o README do pacote em `deploy/current/` ou `deploy/staging/` e confirme que ele corresponde à mudança que será instalada.
- Use somente os arquivos explicitamente listados nesse README. Não envie a pasta `deploy/` inteira, nem misture arquivos de pacotes ou versões diferentes.
- Confira se a mudança exige migração SQL, atualização do Hub local, configuração adicional ou uma etapa manual após o upload.
- A publicação na Hostinger é manual pelo usuário. Uma alteração local não significa que o servidor já foi atualizado.

## Formato padrão para apresentar cada deploy

Toda entrega que exigir publicação deve agrupar os arquivos pelo **diretório de destino no servidor**. Apresente cada diretório de destino uma única vez; dentro dele, liste todos os arquivos que serão enviados, mesmo quando vierem de pastas locais diferentes. Assim, o caminho da pasta local pode ser copiado diretamente sem abrir o Explorer.

Para cada grupo de destino:

1. Mostre o **diretório de destino no servidor como texto normal**, fora de bloco de código.
2. Para cada arquivo, mostre a **pasta local** em bloco de código, sem o nome do arquivo.
3. Inclua o **link clicável para o arquivo local**.
4. Informe o **nome do arquivo** e, se útil para confirmar o destino, o caminho completo em texto normal.

Exemplo:

**Destino no servidor:** `/home/usuario/domains/exemplo/private-tools`

Pasta local do arquivo:

```text
C:\caminho\do\pacote\hostinger-private-tools
```

Arquivo local: [servico.php](staging/exemplo/hostinger-private-tools/servico.php)  
Arquivo de destino: `servico.php` — `/home/usuario/domains/exemplo/private-tools/servico.php`

Se outros arquivos também forem enviados para esse diretório, repita apenas os itens de pasta local, link e nome de arquivo dentro do mesmo grupo. Não repita o destino do servidor.

Ao apresentar a implantação, indique também o README específico do pacote, a ordem dos arquivos quando houver dependências, as alterações separadas de configuração/SQL e o estado real da publicação (por exemplo: “local, ainda não enviado”). Não apresente uma alteração local como se já estivesse publicada. Para um arquivo privado, informe o diretório de destino exato; não repita o aviso genérico “mantenha fora de `public_html`” quando o destino já estiver claramente identificado como `private-tools`. Só mencione a separação público/privado quando o destino estiver ambíguo ou as instruções específicas do pacote exigirem essa distinção.

## 2. Fazer cópias de segurança

Antes de substituir arquivos, copie cada arquivo existente para um backup privado, mantendo registrado seu caminho original. Antes de alterar o banco, faça e confira um backup do banco correto.

- Confirme que os backups estão completos e recuperáveis antes de continuar.
- Não coloque backups, arquivos de configuração reais ou credenciais em `public_html`, no pacote de deploy ou no repositório.
- Preserve `tracking-config.php`, configurações SMTP, tokens, chaves, URLs de integração e tarefas agendadas, salvo instrução específica e autorização explícita para alterá-los.
- Se não for possível confirmar o backup, pare antes de substituir arquivos ou alterar o banco.

## 3. Executar SQL, quando o pacote exigir

1. No phpMyAdmin, selecione o banco indicado pelo README do pacote — por exemplo, o banco dedicado de tracking não deve ser confundido com o banco de postbacks.
2. Confira o schema atual (tabelas, colunas, tipos e índices) com as verificações indicadas no pacote. Não presuma que outro banco ou ambiente tenha o mesmo schema.
3. Execute somente o arquivo SQL listado para essa entrega. Antes de executar, confira se ele é uma migração única, repetível/idempotente ou condicional e siga exatamente essa regra.
4. Se a tabela, coluna ou índice já existir, não repita uma migração não idempotente. Se o nome, tipo, collation ou índice encontrado diferir do esperado, pare e compare o schema antes de prosseguir.
5. Confirme o resultado no phpMyAdmin. Prefira migrações aditivas que preservem as linhas existentes; não execute `DROP`, `TRUNCATE`, exclusões ou substituições de dados sem autorização explícita e específica.

Se o pacote não listar uma migração, não execute SQL por conta própria.

## 4. Enviar os arquivos

- Copie cada arquivo da pasta do pacote para o destino correspondente, preservando a separação entre arquivos públicos e privados.
- Para os pacotes de tracking, os destinos públicos ficam sob `public_html/track/` e os serviços privados ficam em `private-tools/`, fora de `public_html/`; confirme os caminhos exatos no README do pacote.
- Siga a ordem de upload do README quando houver dependências entre arquivos. Em geral, publique primeiro dependências/helpers e por último o endpoint que passa a chamá-los.
- Substitua somente os arquivos listados. Não envie configuração privada, credenciais, pastas inteiras ou arquivos de staging não mencionados.
- Não altere URLs de ClickBank/integração externa, tokens, Cron ou configurações SMTP como parte de um deploy de código, a menos que o pacote descreva essa alteração e ela tenha sido autorizada.

Ao explicar o envio ao usuário, apresente os arquivos agrupados pela pasta de destino no servidor. Mostre a pasta de destino uma vez, como texto normal; em cada arquivo, informe a pasta local sem o nome do arquivo em um bloco copiável, um link clicável para o arquivo local e o nome/caminho do arquivo de destino em texto normal. Se arquivos no mesmo destino vierem de pastas locais diferentes, mantenha-os no mesmo grupo e apresente cada pasta local separadamente. Separe destinos diferentes em grupos próprios e indique a ordem de envio. Essa apresentação não significa que o upload foi feito: registre explicitamente se os arquivos estão locais, enviados ou validados no servidor. Se o destino já for claramente `private-tools`, não acrescente uma advertência redundante sobre `public_html` na mensagem ao usuário.

## 5. Validar a instalação

- Confirme no gerenciador de arquivos que cada destino recebeu o arquivo esperado; não considere o arquivo local como prova de upload.
- Faça os testes pós-deploy indicados pelo pacote: lint, teste de integração, chamada do endpoint ou conferência de schema, conforme aplicável.
- Verifique respostas e logs sem copiar para a conversa tokens, credenciais, payloads completos, GCLID, `extclid` ou dados de compradores.
- Confirme também o comportamento que precisa continuar funcionando (por exemplo, notificações ou integrações anteriores) antes de considerar a implantação concluída.
- Registre a data, pacote/versão, SQL executado ou pulado, arquivos substituídos e resultado dos testes.

## 6. Reverter com segurança

- Se a falha estiver nos arquivos, restaure apenas os arquivos correspondentes dos backups para seus destinos originais e repita os testes.
- Não tente reverter uma migração adicionando `DROP` ou apagando dados. Migrações aditivas normalmente devem permanecer; siga o plano de rollback específico do pacote ou pare para avaliar compatibilidade.
- Se não houver rollback seguro documentado para a alteração de banco, preserve os dados e peça avaliação antes de qualquer operação destrutiva.

## Exemplo desta entrega: nome do Track em avisos de checkout

Para incluir o nome legível do Track na associação e no aviso de checkout, consulte os READMEs específicos: [identidade da pre-sell/Track](staging/presell-product-identity/README.md) e [e-mail INS v8](staging/clickbank-ins-v8-email/README.md). Eles indicam a migração `tracking-product-identity.sql`, os dois serviços privados da API de domínios e o serviço privado de e-mail, com os destinos e a ordem próprios. A instrução de pacote também explica quando pular a migração e quando re-salvar Tracks existentes pelo Hub.

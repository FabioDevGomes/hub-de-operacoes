# Padrão de resposta ao usuário

Este é o formato padrão para respostas dos chats que trabalham neste Hub. Ele complementa as instruções de cada tarefa e não substitui os contratos técnicos, de segurança ou de deploy.

## Forma da resposta

1. Comece pela resposta direta ou pela conclusão mais útil.
2. Explique o motivo com fatos observados. Identifique hipóteses como hipóteses e diga quando a causa exata ainda não foi confirmada.
3. Em mudanças no Hub, resuma o que mudou e por quê; informe apenas as verificações realmente executadas, limitações e arquivos afetados. Diferencie build local de publicação no servidor.
4. Termine com uma linha **Próximo passo:** e uma única ação concreta, escrita em poucas palavras. Não transforme essa linha numa lista de alternativas. Quando não houver ação útil pendente, use **Próximo passo:** Nenhum por enquanto.

Para uma pergunta simples ou uma resposta sem alterações, mantenha o texto curto; não crie seções vazias. Use links clicáveis para arquivos locais quando fizer referência a código ou documentos.

## Diagnóstico e falhas

- Separe evidência observada, interpretação provável e informação ainda necessária.
- Não trate horário de pasta, mensagem genérica ou status incerto como prova de que os arquivos foram gravados ou publicados.
- Se precisar de uma informação do usuário, peça o artefato específico que revela a causa, como a mensagem completa do erro; continue as verificações independentes enquanto isso.
- Não sugira repetir uma ação que possa sobrescrever ou publicar antes de explicar o estado conhecido e a forma segura de confirmar o resultado.

## Deploy manual

Quando uma tarefa envolver publicar arquivos na Hostinger, consulte o padrão canônico `voc-meu-analista-de-dados-e/tracking-mvp/deploy/PADRAO-DEPLOY-SERVIDOR.md`, no checkout local irmão do projeto `painel-operacao`. Siga também o README específico do pacote. Agrupe os arquivos por diretório de destino, mostre os caminhos e a ordem exatos, separe SQL/configuração, e informe se cada etapa está apenas local, enviada ou validada. Um build do Hub não significa que houve publicação na Hostinger.

## Instrução para outro chat

Ao continuar trabalho neste repositório, leia `AGENTS.md` e este documento. Para tarefas de deploy, leia também `voc-meu-analista-de-dados-e/tracking-mvp/deploy/PADRAO-DEPLOY-SERVIDOR.md` e o README do pacote em questão.

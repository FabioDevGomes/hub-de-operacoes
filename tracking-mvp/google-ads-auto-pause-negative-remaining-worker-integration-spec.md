# Especificação de implementação — integração do ajuste no worker

**Data:** 2026-11-17  
**Objetivo:** integrar o ajuste do gate de `negative_remaining` ao worker compartilhado sem introduzir nem sobrescrever mudanças da chave global  
**Status:** correção local concluída em 2026-11-17; pacote incremental sale-neutral preparado; publicação e validação pós-publicação pendentes

## 1. Qual problema este passo resolve

A especificação anterior tratava venda como veto de `negative_remaining`. O usuário esclareceu que a regra é controlada pelo `Valor restante` da Visão geral: valor negativo atende à regra mesmo se houver venda. O worker foi alinhado para não deixar proteção de venda bloquear essa regra, na avaliação sombra nem na validação de job real.

Este passo é uma integração de código no arquivo PHP compartilhado. Não é ativação da pausa no servidor, migração de autoridade nem transferência das pausas do Hub.

## 2. Arquivo-base e integração concorrente

1. Usar como base a versão final do `google-ads-auto-pause-worker.php` que o trabalho paralelo da chave global declarar consolidada.
2. Aplicar nela somente o delta descrito na seção 3. Preservar as alterações existentes da chave, incluindo autoridade, corte, leases, bloqueios de execução e compatibilidade com o serviço/schema correspondentes.
3. Não usar um pacote histórico como fonte integral sem comparar seu conteúdo com essa versão final. Na conferência local de 2026-11-17, o worker do pacote `google-ads-auto-pause-negative-remaining-sale-protection-fix-2026-11-17` tinha o mesmo SHA-256 do arquivo-fonte atual (`F638A90456AD50EAEF3F62A1B87333D30AACDFB0F169EA18B1635C79F7BD59D9`), enquanto o worker do pacote `google-ads-auto-pause-authority-switch-2026-11-17` tinha hash diferente (`932630F502980A08FCF61EDC482996793C6AF699C2A4C7139C4031F6B61DE197`). Esses pacotes representam bases distintas; o hash sozinho não substitui a revisão do arquivo final do trabalho paralelo.
4. Se a versão final do trabalho paralelo ainda não estiver disponível, não gerar nem publicar um arquivo substituto a partir de um pacote antigo. A integração fica aguardando a base correta.

**Base consolidada usada:** o arquivo-fonte local `tools/google-ads-auto-pause-worker.php` tem SHA-256 `F638A90456AD50EAEF3F62A1B87333D30AACDFB0F169EA18B1635C79F7BD59D9` antes deste delta e inclui os caminhos da autoridade, lease e corte. Após o esclarecimento do usuário sobre vendas, o pacote [negative-remaining-sale-neutral](deploy/staging/google-ads-auto-pause-negative-remaining-sale-neutral-2026-11-17/README.md) contém a versão atualizada desse worker. Pacotes anteriores permanecem preservados.

## 3. Delta permitido

Nos caminhos de avaliação sombra e validação de job real para `negative_remaining`:

- não bloquear por status global da lista GuruMedia `unavailable`, `incomplete` ou `capacity_exceeded`;
- não excluir a campanha por `saleProtected=true` nem por correspondência na lista sincronizada de vendas;
- continuar validando `saleProtected` booleano como parte do contrato schema 3, sem usá-lo como veto desta regra;
- preservar regra habilitada, exceções, identidade mapeada, `remainingValue` numérico finito e o critério único `remainingValue < 0`;
- registrar valor e estados por campanha como `candidate`, `not_candidate` ou `not_evaluable`, conforme o contrato vigente.

As exceções explícitas configuradas para `negative_remaining` continuam válidas. Proteções de venda e seu status global permanecem inalterados para as outras regras.

O delta não altera os demais caminhos de avaliação sombra nem cria novas condições de negócio.

## 4. Guardas que devem permanecer

O gate global de proteção GuruMedia no caminho de validação/execução de jobs de outras regras deve permanecer inalterado. Para um job `negative_remaining`, nem a indisponibilidade global nem uma correspondência individual de venda podem vetar a pausa.

Também devem permanecer inalteradas:

- as verificações da chave global de autoridade e do instante de corte no worker;
- a trava/lease do executor local e a condição que impede execução simultânea;
- a revalidação de regra, exceção e estado da campanha antes de uma execução real; a proteção de venda continua na validação das outras regras;
- a simulação técnica de fila e os comportamentos atuais das outras regras.

Não remover os bloqueios de proteção de venda das outras regras. A mudança deve ser limitada ao código `negative_remaining` na avaliação e na validação de job.

## 5. Arquivos e limites da entrega

- Alterar somente o worker consolidado, nos trechos de avaliação sombra e validação de job de `negative_remaining`.
- Não alterar o serviço PHP, o Hub, SQL/schema, configuração, token, wrapper público ou Cron.
- Não criar jobs, chamar a Google Ads API, pausar campanhas ou enviar e-mails.
- Preparar uma pasta de pacote nova e isolada com o worker consolidado e um README que identifique claramente a origem da base, o único delta, as guardas preservadas, o destino privado e a reversão.
- O README não pode descrever o pacote como “somente o ajuste de `negative_remaining`” se o arquivo incluir alterações novas da chave global ainda não publicadas ou aprovadas. Nesse caso, parar a entrega e reconciliar escopo e arquivos com o trabalho paralelo.

## 6. Verificações de revisão antes de publicar

1. Comparar a versão-base consolidada com o resultado e confirmar que o delta se limita aos vetos de venda para `negative_remaining`, na avaliação sombra e validação de job.
2. Confirmar que os vetos de venda no validador de job real permanecem para as outras regras.
3. Confirmar que todas as verificações de autoridade, lease/corte e execução local continuam presentes e inalteradas.
4. Fazer lint do PHP e executar somente verificações locais pertinentes ao worker; não usar credenciais nem chamar a Google Ads API.
5. Conferir o README do pacote contra os arquivos reais da pasta de upload e informar o estado como preparado localmente, sem afirmar que foi publicado.

## 7. Validação operacional posterior

Depois que o usuário publicar o worker consolidado, aguardar uma nova captura schema 3 e seguir a [especificação da Fase 4](google-ads-auto-pause-negative-remaining-phase-4-spec.md): verificar a remoção do bloqueio global em sombra, comparar `remainingValue` com o **Valor restante** do Hub pela identidade da campanha e confirmar que não surgiram jobs nem efeitos externos.

Mesmo após a validação de paridade, a regra permanece em sombra até que uma decisão separada aprove qualquer criação de jobs ou execução real.

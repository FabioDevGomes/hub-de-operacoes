# Ajustes em lote de campanhas Google Ads

## Objetivo

Na Visão Geral, permitir que o usuário aplique futuramente um ajuste de CPA ou
orçamento diário às campanhas de uma única data de início. A primeira entrega
apresenta uma prévia confiável das campanhas e dos valores, sem alterar dados ou
consultar a API para escrever.

## Escopo aprovado

- O controle fica junto à navegação das datas de início.
- Só aparece quando uma data específica está selecionada e há campanhas visíveis.
- A coorte contém as linhas exibidas após aplicar data, filtro de situação e busca.
- A troca entre Consolidado, D−1 e D zero muda as métricas exibidas, mas não a
  coorte de campanhas.
- A primeira versão não tem seleção individual por checkbox.
- A prévia mostra todas as linhas da coorte, separando elegíveis e excluídas e
  explicando por que uma linha não tem prévia.
- O usuário escolhe uma operação por vez, entre os controles existentes:
  CPA ±2%/±4% ou orçamento diário ±5%/±10%.

## Fases

### Fase 1 — Prévia local, sem mutações (implementada)

Adicionar o botão **Ação em lote** para uma data específica. O modal lista a
coorte atual, conta elegibilidade e calcula os valores previstos com os mesmos
domínios de cálculo usados nos ajustes individuais. O CPA exige vínculo de conta
e campanha, campanha Search com estratégia compatível e CPA atual calculável. O
orçamento exige vínculo confirmado, orçamento diário exclusivo e recurso associado
à conta cliente correta. A prévia apenas usa dados já carregados pelo Hub: não
envia comandos de alteração à Google Ads API nem grava no Diário.

### Fase 2 — Execução em lote de CPA (implementada)

Usa o serviço de ajuste já existente, em sequência, com confirmação explícita
antes da execução. O servidor confere por campanha o CPA esperado, a moeda, a
comissão e a elegibilidade da estratégia antes de alterar; cada resultado
confirmado é registrado no Diário. A prévia mostra o estado por campanha e permite
ver confirmações, recusas, erros de registro local e campanhas não executadas.
Uma falha com recusa inequívoca permite seguir às próximas; se a resposta puder
ser incerta, o lote para e identifica as campanhas restantes como não executadas.
Não há repetição automática. O serviço contabiliza as operações da API Google Ads
por campanha.

### Fase 3 — Execução em lote de orçamento

**Concluída localmente em 1.386.0.** A execução é sequencial, requer confirmação
e usa o serviço já empregado pelo ajuste individual. Cada resultado é registrado
no Diário. O serviço valida campanha, orçamento diário exclusivo, conta, moeda e
valor esperado antes de alterar. Se o valor divergir da prévia, o lote pausa e
mostra o orçamento atualizado; o usuário pode confirmar esse novo valor ou
cancelar. Uma segunda divergência durante a confirmação interrompe o lote sem
repetir automaticamente. Falhas inequívocas podem seguir para a próxima campanha;
uma resposta incerta interrompe as próximas solicitações e preserva os resultados
parciais.

### Fase futura — Seleção por checkbox

Permitir escolher um subconjunto das linhas da tabela. A seleção substituirá a
coorte completa da data para a operação, mantendo as verificações individuais e
o resultado por campanha das fases de execução.

## Estado da entrega

Fases 1, 2 e 3 concluídas localmente. A execução real permanece condicionada à
confirmação no modal e à disponibilidade do serviço privado. Seleção por checkbox
continua como fase futura. O ajuste individual de orçamento permanece disponível
no Diário de campanha.

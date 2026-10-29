# Duplicação de campanha Search

## Fluxo na tela

Abra **Criação de ofertas → Duplicar campanha** ou inicie pelo **Mapa por conta**. No Mapa, clique em uma célula com campanhas para escolher a campanha exata que será copiada; clique em células das contas destino, inclusive vazias, para marcá-las. Depois escolha **Configurar duplicação**. A seleção do Mapa é temporária e não altera o alvo verde persistente usado por **Criar campanha**. O formulário reutiliza o cache compartilhado MCC/contas e resolve a origem pelo ID da conta, usando o vínculo MCC atual. Se a origem não estiver no cache, o formulário não escolhe outra MCC por padrão e pede uma atualização ou seleção manual. Abrir a tela ou pré-selecionar contas não consulta Google Ads. Escolher/carregar a origem, analisar recursos, informar uma URL HTTPS por destino, validar e criar continuam ações explícitas. A origem não pode ser escolhida como destino.

Selecione as faixas de 30%, 40%, 50%, 60%, 70% e/ou 80%. O servidor lê a comissão e a moeda do nome da campanha, calcula o CPA por faixa, consulta o maior número encontrado entre a campanha de origem e os destinos escolhidos e avança uma única sequência para o lote. Os nomes antigos não são alterados. A conta de destino precisa usar a mesma moeda da comissão; não há conversão automática. O limite é 24 cópias por prévia.

O aviso visível no formulário registra a próxima etapa planejada para testes A/B: aceitar sufixo `B` (por exemplo, `03`/`03B`) e mapear a variação de 50% por campanha. O sufixo `B` ainda não é aceito nem criado por esta versão.

## O que é copiado

A cópia é da campanha e de recursos diretamente vinculados a ela, sem configurações gerais da conta:

- campanha Search padrão, status inicial pausado, orçamento diário independente, estratégia Maximize Conversions com o CPA selecionado, redes, datas, geolocalização, configurações de público e parâmetros de acompanhamento da campanha;
- grupos Search, status e configuração de restrições de segmentação;
- critérios suportados, incluindo países, idiomas, dispositivos, dados demográficos, interesses legíveis, listas `USER_LIST` compartilhadas e elegíveis no destino (reutiliza somente o vínculo; não lê nem copia membros), palavras-chave positivas e negativas, posicionamentos e tópicos aceitos pela API para a campanha Search;
- anúncios responsivos de pesquisa, títulos, descrições, ordem/pinos, caminhos e status;
- assets de sitelink, frase de destaque, snippet estruturado e promoção, nos níveis de campanha ou grupo.

Cada conta destino usa sua própria URL de Pre-Sell. A URL final de cada anúncio, palavra-chave, sitelink e promoção é substituída pelo endereço informado para aquela conta. Sitelinks só podem ser copiados quando cada URL termina com `#1` até `#6`; a âncora correspondente é mantida ao anexá-la ao novo domínio. O domínio de origem também é substituído quando aparece em templates de acompanhamento, sufixos de URL ou parâmetros personalizados. A verificação pós-criação não confirma sucesso se ainda encontrar o domínio de origem nesses campos. A URL informada não pode conter credenciais nem fragmento.

## Bloqueios de cópia

A inspeção/prévia bloqueia campanhas quando não consegue preservar os recursos com segurança. Não são aceitos rascunhos ou experimentos, orçamento compartilhado ou não diário, estratégias que não sejam Maximize Conversions com CPA, estratégia de lance compartilhada, subtipo diferente de Search padrão, listas compartilhadas diferentes de palavras-chave negativas (as listas negativas são recriadas no destino e ligadas somente à cópia), segmentos `USER_LIST` sem compartilhamento ativo e elegibilidade para Pesquisa na conta destino, rótulos vinculados à campanha, grupos, anúncios ou critérios, personalizadores, conjuntos de assets, metas de conversão definidas para campanha/customizadas, critérios fora da lista suportada, tipo de asset não suportado, recursos incompletos ou sitelinks sem `#1`…`#6`.

Uma campanha que herda metas de conversão no nível do cliente destino continuará herdando os padrões da conta destino. O Hub não copia ações, metas ou configurações gerais de conversão de uma conta para outra. Verifique se a conta destino tem as metas de conversão adequadas à oferta. AI Max, automações de assets e ajustes de lance de campanha/grupo também bloqueiam a cópia até haver suporte fiel; critérios, assets, rótulos e listas compartilhadas não suportados continuam bloqueados em vez de omitidos.

## Validação, criação e repetição

Ao clicar em **Validar duplicações**, o servidor consulta a campanha e seus recursos, confirma o acesso de criação apenas para as contas destino, confere a moeda e executa uma validação `validateOnly` para cada conta×faixa. Para calcular a sequência global do mesmo padrão da campanha, consulta os nomes Search somente na conta de origem e nas contas de destino marcadas (até 21 contas). Essa busca é somente leitura, exige acesso Google Ads a cada conta do escopo e consome uma chamada por conta; se uma delas não puder ser lida, a prévia bloqueia para não reservar um número incorreto. Abrir a tela não consulta a API. A prévia não grava campanhas. A faixa fica reservada por 30 minutos para que prévias concorrentes não recebam os mesmos números; se nenhuma campanha for criada, a reserva expira automaticamente junto com o plano.

Depois de revisar a tabela de nomes, CPA, URL e validação, **Criar cópias pausadas** pede confirmação. Cada campanha e seus recursos são enviados numa operação atômica; as cópias são submetidas uma a uma e nascem pausadas. O servidor relê a campanha para verificar status, nome, CPA, orçamento, contagens dos recursos e URLs finais principais antes de informar sucesso.

A campanha de teste B (sufixo `B`) é uma evolução futura e está anotada na própria tela. A sequência usa o maior número encontrado para o mesmo produto/padrão na conta de origem e nas contas de destino marcadas; não renumera campanhas existentes e não consulta outras contas do diretório. Cada faixa marcada recebe o próximo número global, na ordem das contas na lista e das faixas em ordem crescente.

Falhas confirmadas que podem ser repetidas oferecem **Tentar novamente** somente naquela cópia. Uma resposta incerta não é repetida automaticamente nem recebe esse botão; confira a conta Google Ads antes de criar outra prévia para evitar duplicidade. Uma falha de configuração, nome existente, campanha alterada ou prévia expirada exige corrigir e validar novamente.

As consultas à API acontecem após os cliques de carregar, analisar, validar e criar. Atualizar MCCs/contas também consulta a API, de forma explícita. Abrir a tela e escolher opções locais não faz consulta.

## Implementação e implantação

A interface fica em `src/google-ads/google-ads-campaign-duplication-{view,service,domain}.mjs`; rota e menu ficam nos módulos compartilhados do Hub. O backend fica em `tools/google-ads-campaign-duplication-service.php` e é carregado pelo endpoint privado `google-ads-campaign-action-service.php`. Usa as configurações privadas de autorização de criação já existentes; não inclui SQL, wrapper público ou credenciais. A publicação manual dos dois PHP está no [README do pacote de deploy](../../voc-meu-analista-de-dados-e/tracking-mvp/deploy/staging/google-ads-campaign-duplication/README.md).

O envio das operações de mutação não usa `partialFailure`: a Google Ads API aplica ou rejeita atomicamente o conjunto de recursos daquela cópia. A validação prévia, IDs temporários e a documentação de mutações estão descritos na [documentação oficial da Google Ads API](https://developers.google.com/google-ads/api/docs/mutating/overview).

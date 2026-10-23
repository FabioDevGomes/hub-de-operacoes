# Plano futuro — integração da Google Ads API

## Estado

**Planejado; implementação adiada por decisão do usuário em 22/10/2026.** Este documento registra o levantamento para retomada por qualquer chat com acesso ao repositório canônico. Não é autorização para criar projeto Google Cloud, solicitar acesso, conectar uma conta, ler dados reais, alterar a importação MCC ou gravar na base do Hub. Nenhuma dessas ações foi feita.

## Objetivo

Avaliar e, se a validação confirmar equivalência suficiente, acrescentar uma fonte de leitura da Google Ads API para alimentar métricas do Hub, reduzindo a dependência da captura/importação diária pela interface da MCC. A migração deve ser gradual, sem remover a importação MCC durante o piloto e sem alterar cálculos, históricos, anotações ou dados manuais existentes.

## Cadastro e autorização manual no Google

As instruções do Google mudaram recentemente. **Em 22/10/2026, não seguir tutoriais antigos que mandem solicitar um developer token pela Central de API do Google Ads:** a documentação atual informa que os developer tokens foram descontinuados em 09/09/2026 e que os níveis de acesso agora pertencem ao projeto Google Cloud. A antiga Central de API não é o local para solicitar o acesso novo. Não existe um simples botão “modo desenvolvedor” no Google Ads que, sozinho, libere a integração. Consulte [níveis atuais de acesso](https://developers.google.com/google-ads/api/docs/api-policy/access-levels) e [a transição do developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).

Quando o usuário decidir iniciar, os passos manuais previstos são:

1. Criar um projeto Google Cloud dedicado ao Hub (ou escolher conscientemente um projeto existente) e habilitar nele a **Google Ads API**. A cobrança do projeto Cloud é opcional; a API não tem cobrança própria, embora outros serviços Cloud ativados no projeto possam ter custos.
2. Abrir **Google Ads API Overview** nesse projeto. Habilitar a API concede inicialmente nível **Test**, restrito a contas de teste. Solicitar **Explorer** para consultas em contas de produção; o limite documentado é de 2.880 operações por período móvel de 24 horas, suficiente como ponto de partida esperado para uso pessoal. Não solicitar Basic/Standard sem necessidade comprovada.
3. Configurar o consentimento OAuth em Google Auth Platform: nome do app, contato de suporte, público e escopo `https://www.googleapis.com/auth/adwords`. Para um app de uso próprio, avaliar autenticação de usuário único; a conta autenticada precisa já ter acesso à MCC e às contas-filhas que o Hub deve consultar.
4. Definir o retorno OAuth local no desenho técnico antes de criar o OAuth Client ID. O tipo de cliente e o URI de redirecionamento dependem do callback que o servidor local do Hub implementar; não registrar um URI presumido antes dessa decisão.
5. Avaliar a publicação/verificação OAuth antes de uso contínuo: o escopo Google Ads é restrito. Enquanto um consentimento Externo estiver em **Testing**, tokens de atualização podem expirar em sete dias. A conta também deve cumprir as exigências vigentes de verificação em duas etapas e, quando aplicável, passkey.
6. Conectar a conta pelo próprio Hub somente depois de existir uma implementação segura do fluxo. Nunca enviar client secret, access token, refresh token, arquivo de credenciais ou exportação privada em chat, código-fonte, documentação, IndexedDB ou backup JSON.

Referências oficiais: [configurar projeto e habilitar API](https://developers.google.com/google-ads/api/docs/oauth/cloud-project), [níveis e limites de acesso](https://developers.google.com/google-ads/api/docs/api-policy/access-levels), [OAuth de usuário único/multiusuário](https://developers.google.com/google-ads/api/docs/oauth/user-authentication), [segurança das credenciais e verificação do app](https://developers.google.com/google-ads/api/docs/productionize/secure-credentials), [tokens em Testing](https://developers.google.com/google-ads/api/docs/get-started/common-errors) e [requisitos de segurança OAuth](https://developers.google.com/google-ads/api/docs/oauth/security-requirements).

## Plano técnico proposto

### Fase 1 — preparar autenticação local segura

- Implementar um callback OAuth no serviço local que acompanha o Hub, preservando a origem operacional existente `http://127.0.0.1:8765/`.
- Manter client secret e refresh token fora do JavaScript da página, `localStorage`, IndexedDB e backups. Definir armazenamento local protegido (por exemplo, proteção nativa do Windows ou mecanismo equivalente), fluxo de renovação, desconexão/revogação e mensagens de reautorização.
- Solicitar somente o escopo necessário e manter as chamadas de relatório restritas a operações de leitura (`Search`/`SearchStream`); não implementar endpoints de mutação de campanha.
- Exibir claramente conta Google conectada, MCC selecionada, status/expiração da autorização e erros de acesso, sem expor tokens.

### Fase 2 — consultas em sombra, sem persistência

- Descobrir a hierarquia acessível sob a MCC e consultar contas/campanhas por IDs completos, sem hífens nas chamadas. Usar o ID da MCC gerente como `login-customer-id` quando exigido.
- Ler inventário e status de campanha separadamente do relatório diário; consultar métricas por conta e data com GAQL.
- Executar consultas somente para visualização/diagnóstico, sem gravar na base operacional. Contas de teste podem validar autenticação e formato, mas não contêm métricas reais de veiculação; a comparação de dados exigirá autorização OAuth e consultas de leitura nas contas reais.
- Limitar inicialmente o piloto a alguns dias e contas representativas, incluindo moedas diferentes, campanhas ativas/pausadas, dias sem métricas e casos de conversão.

### Fase 3 — equivalência e contrato de dados

- Criar uma associação estável entre `(customer_id, campaign_id)` da API e o ID interno de campanha do Hub. Não recriar campanhas nem separar históricos por simples mudança de nome; manter o nome completo atual como dado operacional e tratar divergências explicitamente.
- Mapear impressões, cliques, conversões, valor de conversão, custo e custo médio. Converter micros corretamente, respeitar moeda da conta e reaproveitar as regras/cotações USD/BRL já existentes — sem recálculo histórico ou dupla conversão.
- Normalizar parcelas de impressão para o formato do Hub, incluindo o tratamento documentado pela API para valores abaixo do limite de reporte.
- Tratar orçamento, estratégia e CPA desejado como configurações consultadas no momento da coleta, não como valores históricos diários automaticamente reconstruíveis. Geografia pode exigir consultas próprias de critérios/localizações; não assumir equivalência direta com o campo MCC atual.
- Preservar `ausente`, `zero` e `inválido` como estados diferentes. A API pode omitir uma linha diária quando todas as métricas selecionadas são zero; a ausência de linha não prova zero, pausa nem remoção. Usar inventário/status e evidência de conclusão da consulta para reconciliar.
- Respeitar o fuso de cada conta e definir como suas datas se alinham ao calendário operacional do Hub (`America/Sao_Paulo`). Não deslocar D0/D−1 silenciosamente.
- Preservar o contrato MCC: D0 parcial, fechamento D−1, conflitos e confirmações explícitas antes de sobrescrever; reconsultar dias recentes para capturar correções da API.
- Preservar os IDs idempotentes dos agregados de conversão MCC usados por Faturamento. Não criar vendas transacionais a partir de conversões agregadas, nem duplicar vendas provisórias/oficiais.
- Manter separadas as anotações, status manuais de Contas, cadastros, vendas rastreadas, histórico financeiro e demais dados locais que não são métricas de campanha da API.

Limitações para considerar: relatórios diários segmentados da API cobrem até 37 meses; dados diários mais antigos podem não ser reconstruíveis com a mesma granularidade. Status e configurações atuais também não equivalem automaticamente ao histórico diário observado. Ver [métricas zero e disponibilidade histórica](https://developers.google.com/google-ads/api/docs/reporting/zero-metrics) e [datas/fusos](https://developers.google.com/google-ads/api/docs/query/date-ranges).

### Fase 4 — comparação controlada

Comparar API e MCC lado a lado sem escrita: cobertura por conta/campanha/data, IDs e nomes, impressões, cliques, conversões, custo original, moeda, custo convertido, parcelas de impressão, estados, horário/data e diferenças de fechamento D0/D−1. Registrar divergências e sua causa; não corrigir ou sobrescrever dados automaticamente. A saída desta fase deve ser uma decisão informada de prosseguir, ajustar o mapeamento ou manter a MCC como fonte.

Critérios mínimos para avançar:

- nenhuma duplicação nem divisão de histórico;
- equivalência compreendida para métricas e moedas nas datas/contas de teste;
- reconciliação segura de linhas omitidas e dias com zero;
- datas estáveis em contas com fusos relevantes;
- conflitos preservados para decisão explícita;
- autorização OAuth revogável, tokens protegidos e modo de falha compreensível;
- importação MCC disponível como fallback durante o piloto.

### Fase 5 — adoção gradual, somente após aprovação do usuário

Ativar a gravação inicialmente como opção controlada, com sincronização idempotente e registros de execução sem credenciais. Antes de qualquer alteração com risco à base ativa, seguir o procedimento de backup completo previsto pelo Hub. Manter a MCC como fallback durante o período de observação. Só discutir sua retirada depois de validação operacional e pedido/decisão explícita do usuário; este plano não autoriza a remoção.

## Pendências para a retomada

- Confirmar qual projeto Cloud será usado e quem é o proprietário administrativo.
- Confirmar se a conta Google já conectada à MCC tem acesso a todas as contas necessárias e 2SV/passkey configuradas.
- Definir o callback OAuth seguro para o servidor local e a proteção local do refresh token.
- Solicitar Explorer e confirmar a aprovação no Google Cloud; verificar necessidade de publicar/verificar o consentimento OAuth.
- Escolher as contas e datas do piloto e estabelecer uma comparação sem gravação.
- Só então implementar adaptador, interface de conexão e sincronização, com testes em memória e salvaguardas de backup.

## Referências locais do Hub

- `src/preparador-MCC/index.html`: captura, validação, prévia e atualização MCC.
- `src/database.js` e `src/storage/hub-database.js`: modelo/caminho de persistência existentes; preservar stores, identidades, transações e registros.
- `src/overview-domain.js`, `src/overview/cards-domain.js` e `src/control-macro/`: consumidores e contratos diários a rever ao iniciar a implementação.
- `.agents/skills/painel-operacao-google-ads/references/mcc-import.md` e `data-model.md`: contrato MCC, moedas, cobertura, D0/D−1, conflitos e identidade.


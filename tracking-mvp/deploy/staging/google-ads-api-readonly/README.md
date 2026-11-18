# Google Ads API — proxy somente leitura para o Hub

**Status:** o usuário publicou o endpoint inicial e confirmou consultas nas duas MCCs. Esta versão local do serviço privado inclui `campaign_config`, conclusão explícita de `daily_report`, `conversion_actions`, `sao_paulo_day_report`, `search_terms` e `final_url_hosts`. `search_terms` é uma consulta manual somente leitura de campanhas `SEARCH`, limitada a 31 dias e 1.000 linhas por conta; não inclui Performance Max. A publicação das operações `search_terms` e `final_url_hosts` ainda não foi feita nem verificada. O wrapper público não precisa mudar. Este pacote pertence ao backend `Tracking MVP`; a interface permanece no projeto do Hub.

## Arquivos e destinos

Faça cópia de segurança dos arquivos PHP de mesmo nome, se existirem. Envie somente estes dois arquivos de código:

| Arquivo do pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/google-ads-readonly.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/google-ads-readonly.php` |
| `hostinger-private-tools/google-ads-readonly-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php` |

O endpoint público procura o serviço apenas em `private-tools/` e rejeita caminhos que estejam dentro de `public_html`. Não coloque o serviço privado nem o JSON de credencial na pasta pública.

**Atualização de configuração/normalização:** substitua somente `hostinger-private-tools/google-ads-readonly-service.php` no destino privado da tabela, na mesma pasta privada já usada pelos outros serviços. O arquivo público `google-ads-readonly.php` que já está na Hostinger permanece igual. Primeiro use **Prévia normalizada de hoje** no Hub; ela não grava dados nem ativa a fonte operacional.

## Chave privada da conta de serviço

Depois de gerar a chave JSON no projeto Google Cloud `Hub Integration`, envie-a diretamente para:

`/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-credentials/service-account.json`

Crie a subpasta `google-ads-credentials` dentro do `private-tools` já usado pelos outros serviços. A chave é lida pelo PHP e nunca deve ser incluída neste pacote, no projeto local, no Git, no Hub, em backup ou neste chat. Restrinja as permissões do arquivo e da pasta no Gerenciador de Arquivos/SSH. Não edite `tracking-config.php` para guardar a chave.

O proxy reaproveita de `tracking-config.php` somente `tracking_hub_api_token` e `tracking_hub_allowed_origins`; as configurações existentes devem autorizar `http://127.0.0.1:8765`. O segredo da conta de serviço permanece separado do token do Hub.

## O que esta API faz

O payload de `sao_paulo_day_report` pode incluir a propriedade opcional `campaign_status_filter` com o único valor aceito `ENABLED`. Omitida, a consulta mantém o comportamento de todos os status. O filtro é concatenado pelo serviço a partir dessa enumeração fixa (`campaign.status = 'ENABLED'`); GAQL livre do navegador não é aceito. A resposta devolve `campaign_status_filter` para o Hub confirmar o escopo. O serviço não fabrica campanhas de métricas zero: o Hub só pode sintetizar zeros depois de confirmar tanto a consulta de métricas completa quanto o inventário `campaign_config` completo. `ENABLED` é status atual consultado, não status histórico do dia.

- `accounts`: usa `customers:listAccessibleCustomers` para descobrir MCCs diretamente autorizadas e lista contas de anúncios acessíveis sob cada MCC.
- `report`: consulta uma conta selecionada com `GoogleAdsService.SearchStream`, usando `login-customer-id` da MCC quando aplicável.
- `daily_report`: retorna linhas diárias por campanha, limitado a 14 dias/10.000 linhas por conta, com `query_complete: true` somente após consulta concluída sem exceder o limite. Comparação/prévia não gravam; a alimentação explícita no Hub salva somente hoje.
- `search_terms`: recebe exatamente `operation`, `manager_customer_id` (`null` ou ID de 10 dígitos), `customer_id` (ID de 10 dígitos), `date_from` e `date_to`. Consulta a GAQL fixa em `search_term_view`, filtrada para `campaign.advertising_channel_type = 'SEARCH'` e impressões acima de zero; retorna data, MCC/conta (pelo contexto da solicitação), campanha, grupo de anúncios, termo, palavra-chave associada, tipos de correspondência, impressões, cliques, custo e conversões. Aceita no máximo 31 dias e 1.000 linhas por conta; acima do limite falha sem truncar silenciosamente. A resposta informa conclusão da consulta e linhas sem palavra-chave identificada, que não aparecem na tabela da tela. Consultas não são salvas no servidor nem no Hub e não alteram campanhas, métricas operacionais, configurações ou conversões. A API não expõe necessariamente todos os termos: termos de baixo volume podem ser omitidos pelas regras de privacidade do Google.
- `final_url_hosts`: recebe exatamente `operation`, `manager_customer_id` (`null` ou ID de 10 dígitos) e `customer_id` (ID de 10 dígitos). Faz uma única consulta GAQL fixa a `ad_group_ad.ad.final_urls`, limitada a anúncios, grupos e campanhas atualmente `ENABLED`, e retorna apenas os hostnames dos destinos. URLs completas, caminhos, parâmetros de afiliado e templates de tracking não são enviados ao Hub nem guardados. O limite é de 5.000 anúncios por conta; acima dele a consulta falha sem truncar silenciosamente. A operação é somente leitura e não altera campanhas nem as métricas operacionais.
- `sao_paulo_day_report`: recebe exatamente `operation`, `manager_customer_id` (string de 10 dígitos ou `null`), `customer_id` (string de 10 dígitos) e `business_date` (um dia civil fechado recente em São Paulo, dentro da janela automática de recuperação). O servidor aceita até 13 datas D−1 fechadas recentes, rejeita datas futuras e bloqueia consultas fora dessa janela, consulta `segments.date` e `segments.hour` em uma GAQL fixa, converte cada bucket pelo fuso retornado para a conta e soma apenas buckets horários completos entre 00:00 e 24:00 de São Paulo. A resposta tem uma linha agregada por campanha e informa data/fuso de negócio e as datas de origem no fuso da conta. Fusos que não permitem limites exatos por hora ou têm transição de horário de verão dentro do intervalo geram erro explícito; linhas acima do limite geram erro e nunca são truncadas silenciosamente. Esta operação não grava captura no servidor, não altera o fluxo de alimentação diária e não envia conversões. O botão **Alimentar API · Ontem (fuso da conta)** mantém o comportamento de ontem na data local da conta.
- `campaign_config`: retorna inventário atual independente das métricas, status/qualificação/motivos, orçamento diário/total/compartilhado, estratégia e CPA desejado. Resolve portfólios com `accessible_bidding_strategy`, por proprietário e ID. Campo indisponível permanece nulo/sinalizado. Inventário maior que 1.000 campanhas/estratégias falha, sem declarar cobertura completa.
- `conversion_actions`: lista as ações visíveis para o `customer_id` informado. Recebe exatamente `operation`, `manager_customer_id` e `customer_id`; ambos os IDs devem ser strings de 10 dígitos sem hífens. Para listar ações próprias de uma MCC, informe o ID da MCC nos dois campos; se o customer de conversão for diferente, informe o customer que possui as ações em `customer_id` e mantenha a MCC correta em `manager_customer_id` para o cabeçalho `login-customer-id`. Confira `owner_customer` na resposta para confirmar a propriedade. A consulta GAQL é fixa no PHP e retorna `id`, `resource_name`, nome, status, tipo, categoria, origem, proprietário, flags de objetivo/métrica e moeda padrão quando disponível. Os status são preservados como retornados; `HIDDEN` e `REMOVED` não são tratados como ativos. Até 500 ações são aceitas; acima disso a operação falha com `conversion_actions_limit_exceeded`, sem truncar silenciosamente. Uma consulta bem-sucedida sem ações retorna `actions: []`; erros de acesso/API continuam sendo respostas de erro, nunca uma lista vazia substituta.
- Para conferir a listagem das MCCs atuais, os nomes esperados são `pixel MCC com meta` na MCC e-com e `Conversão compra off-line (upload)` na MCC Nutra. São referências visuais apenas: a seleção futura deve guardar o `resource_name` retornado e conferir também `id`, `status` e `owner_customer`.
- Retorna impressões, cliques, CTR, CPC, custo, conversões, CPA, valor de conversão e, se a combinação de campos for aceita, parcelas de impressão na Pesquisa, no topo e no topo absoluto.
- Limita cada consulta a 366 dias e até 1.000 campanhas.
- A prévia diária é separada da consulta agregada e limitada a 14 dias/10.000 linhas; parcelas de impressão por dia são opcionais caso a combinação de campos seja recusada pela API.
- Faz somente consultas de leitura. Não acessa o MySQL, não grava no servidor/Hub, não envia conversões, não altera campanhas, não cria cron e não modifica as Pre-Sells ou o fluxo da integração externa.
- Usa o nível de acesso do projeto Cloud e a API v26. Não envia `developer-token`: o Google descontinuou esses tokens em 09/09/2026 e informa que o cabeçalho passou a ser opcional/ignorado.

O wrapper usa `tracking-config.php` já existente fora de `public_html`, exige o token Bearer do Hub e permite somente a origem local configurada. Respostas são `no-store`. O serviço requer extensões PHP OpenSSL e cURL.

## Publicação e conferência

1. Crie a chave da conta de serviço no Google Cloud e coloque o JSON diretamente na pasta privada indicada acima. Não a abra nem cole seu conteúdo em nenhum código.
2. Envie o serviço PHP para `private-tools` e o wrapper para `public_html/track/`, conforme a tabela.
3. Abra `https://track.travenzo.shop/google-ads-readonly.php` diretamente. Uma resposta de acesso negado por não haver Origin/token é esperada; não use a URL com credencial ou parâmetro secreto.
4. No Hub local, acesse **Integrações → Google Ads API**, carregue MCCs/contas, escolha uma conta e consulte um período curto.
5. Use a prévia normalizada, confira vínculo, status, motivos, orçamento, estratégia, CPA e candidatos financeiros. A prévia não grava nem ativa a fonte API. Para **Ontem**, a prévia consulta o dia civil de São Paulo e apresenta diferenças compactas; a fotografia de configuração continua sendo atual. **Alimentar API · Ontem** usa ontem no fuso de cada conta e grava capturas. Agregados financeiros só são aplicados se a fonte API estiver ativa naquele perfil.

### Publicação das operações `conversion_actions`, `sao_paulo_day_report` e filtro de campanhas ativas

Substitua somente o serviço PHP privado no caminho já usado:

`/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

#### Formato das instruções de publicação

Nas próximas instruções de deploy deste pacote, informar o diretório local completo (sem o nome do arquivo), o nome do arquivo e o destino remoto em blocos de texto copiáveis. Não apresentar somente o caminho relativo do pacote. Para esta publicação:

```text
Pasta local no PC (sem nome do arquivo):
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-api-readonly\hostinger-private-tools

Arquivo:
google-ads-readonly-service.php

Destino na Hostinger:
/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php

Ação:
Faça backup do arquivo existente e substitua somente esse PHP privado.
```

Use o arquivo `hostinger-private-tools/google-ads-readonly-service.php` deste pacote. Não envie `google-ads-readonly-service.php` para `public_html`, não substitua `public_html/track/google-ads-readonly.php` e não altere credenciais, `tracking-config.php`, banco, cron ou integração externa. A interface do Hub que consumirá especificamente `conversion_actions` e salvará o `resource_name` por MCC é uma etapa posterior; esta publicação, por si só, não seleciona nem altera ações e não envia conversões.

Para habilitar **Ver diferenças · somente ativas** no fechamento D−1 do Hub, substitua este mesmo PHP privado pela versão atual do pacote. Depois, o Hub pede `campaign_status_filter: "ENABLED"`, confirma o filtro na resposta e valida que métricas e inventário atual concordam antes de permitir a gravação. O filtro considera campanhas atualmente `ENABLED`; campanhas fora dele mantêm o snapshot existente, e a consulta completa junto do inventário completo é necessária para converter campanhas ativas sem linha em zero. O wrapper público fica inalterado.

Para usar a prévia normalizada de ontem em São Paulo, substitua também este mesmo serviço privado pela versão incluída no pacote. Não substitua nem altere o wrapper público. No Hub, escolha **Ontem** e clique em **Prévia normalizada · Ontem (São Paulo)**; a tabela compacta compara métricas e campos de configuração com a fonte atual sem gravar. O botão **Alimentar API · Ontem (fuso da conta)** continua sendo a ação de gravação e usa o dia local de cada conta.

### Publicação da consulta `search_terms`

Para habilitar a nova consulta manual de termos no Hub, substitua somente o serviço PHP privado na mesma pasta `private-tools` já usada. O código local do Hub e o pacote de deploy ainda não foram publicados por esta alteração.

```text
Pasta local no PC (sem nome do arquivo):
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-api-readonly\hostinger-private-tools

Arquivo:
google-ads-readonly-service.php

Destino na Hostinger:
/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php

Ação:
Faça backup do arquivo existente e substitua somente esse PHP privado.
```

Não altere o wrapper público, credenciais, `tracking-config.php`, banco, cron ou integração externa. A publicação só acrescenta o relatório de leitura; não executa consultas nem grava dados.

### Publicação da operação `final_url_hosts`

Para habilitar a importação dos destinos finais dos anúncios para o cache local do Hub, substitua somente o PHP privado. O wrapper público, credenciais e configuração atual permanecem iguais. O Hub chama esta operação durante a atualização manual ou automática de campanhas quando o cache local da conta está ausente ou tem 24 horas; uma falha no cache não impede a gravação de métricas. A tela Hostinger lê o cache local e não faz consulta adicional ao Google Ads.

```text
Pasta local no PC (sem nome do arquivo):
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-api-readonly\hostinger-private-tools

Arquivo:
google-ads-readonly-service.php

Destino na Hostinger:
/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php

Ação:
Faça backup do arquivo existente e substitua somente esse PHP privado.
```

Após a substituição, a primeira atualização manual/automática elegível consulta cada conta uma vez; depois o Hub reutiliza os hostnames salvos por 24 horas. O cache é local no IndexedDB do Hub e não exige migração SQL, mudança no wrapper, nova credencial ou consulta ao abrir a tela Hostinger. Nenhuma publicação foi executada automaticamente por este agente.

### Conferência do caminho local antes do deploy

O caminho deve ser montado a partir do arquivo desta versão e confirmado no disco antes de enviá-lo ao usuário. Para esta operação, a fonte é `deploy/staging/google-ads-api-readonly/hostinger-private-tools/google-ads-readonly-service.php`; não reutilize caminhos de `deploy/current` nem de outras pastas `google-ads-*`. A conferência mínima é resolver o caminho absoluto, confirmar que o arquivo existe, conferir nome/tamanho e listar a pasta. A instrução ao usuário deve trazer separadamente a pasta, o nome do arquivo, o caminho completo e o destino remoto.

Na captura de 28/10/2026, o Explorador listava `google-ads-campaign-action-service.php` e `google-ads-campaign-duplication-service.php`, que pertencem ao pacote de duplicação, enquanto a navegação para `google-ads-api-readonly` falhou. Isso indica que o Explorador permaneceu na pasta anterior após a tentativa de abrir outro endereço. Para confirmar que a navegação ocorreu, verifique se a pasta mostra `google-ads-readonly-service.php`; se ela continuar mostrando os arquivos de campaign duplication, não copie nenhum deles para este deploy.

O caminho absoluto confirmado para esta cópia é:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-api-readonly\hostinger-private-tools\google-ads-readonly-service.php
```

Não é necessária migração SQL, mudança em `tracking-config.php` (se token/origem já estiverem definidos), ajuste no Cron ou nova instalação do script nas Pre-Sells. Nenhuma publicação é executada automaticamente por este agente.

### Publicação da janela de recuperação D−1

Para que o serviço aceite os dias históricos solicitados pelo Hub, substitua somente o PHP privado abaixo. O wrapper público, credenciais, `tracking-config.php`, banco e cron permanecem inalterados.

```text
Pasta local no PC (sem nome do arquivo):
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-api-readonly\hostinger-private-tools

Arquivo:
google-ads-readonly-service.php

Destino na Hostinger:
/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php

Ação:
Faça backup do arquivo existente e substitua somente esse PHP privado.
```

A alteração permite consultar datas fechadas dentro da janela de 14 dias do Hub, mantendo a validação do fuso, os buckets horários e a cobertura completa atuais. Ela também é necessária para as revisões automáticas de D−1, que podem consultar novamente uma data depois da virada do calendário. O pacote local não publica arquivos automaticamente.

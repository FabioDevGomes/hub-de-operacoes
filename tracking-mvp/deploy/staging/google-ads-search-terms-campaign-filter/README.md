# Filtro de campanha em Termos de Pesquisa Google Ads

**Status:** alteração local preparada, ainda não enviada para a Hostinger. O Hub local oferece um combo de campanhas Search por conta. A seleção de uma campanha envia o ID validado ao serviço; a opção **Todas as campanhas** preserva consultas para todas as contas marcadas. O serviço continua somente leitura.

## Arquivo e destino

Faça backup do serviço privado atual e substitua somente este arquivo:

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-search-terms-campaign-filter\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)  
Arquivo de destino: `google-ads-readonly-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

O wrapper público `google-ads-readonly.php`, credenciais, `tracking-config.php`, banco e cron não mudam. Não é necessário SQL. Mantenha este serviço em `private-tools`, fora de `public_html`.

## Alterações incluídas

- Acrescenta `search_term_campaigns`, uma consulta de leitura que lista somente ID/nome de campanhas Search da conta. O serviço valida conta, MCC, escopo e cobertura completa e falha explicitamente acima de 1.000 campanhas.
- Amplia `search_terms` para aceitar o campo opcional `campaign_id`, sempre validado como ID numérico. Quando informado, a cláusula GAQL filtra por esse ID. Sem o campo, mantém a consulta anterior.
- A resposta confirma `campaign_id_filter`. O Hub valida a confirmação antes de exibir os termos.

## Conferência após a publicação

1. Confira o backup e substitua somente o PHP privado indicado.
2. No Hub local versão 1.104.0, abra **Integrações → Termos de Pesquisa**.
3. Marque uma única conta. O combo **Campanha** carrega a lista Search daquela conta; **Todas as campanhas** vem selecionada por padrão.
4. Escolha uma campanha e consulte um período curto. A tabela deve identificar o nome da campanha e conter somente linhas dela.
5. Marque várias contas e confira que o combo fica indisponível para campanha específica; **Todas as campanhas** continua consultando as contas marcadas.

A tela não grava as consultas na base e este serviço não altera campanhas.

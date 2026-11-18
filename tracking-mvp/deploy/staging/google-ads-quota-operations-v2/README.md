# Telemetria de operações de cota Google Ads v2

Pacote local, ainda não publicado. Separa chamadas HTTP da Google Ads API das unidades estimadas de cota e conta cada item enviado em uma mutação. Inclui os endpoints somente leitura e de ações porque ambos devolvem os cabeçalhos agregados ao Hub.

## Arquivos para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta de upload local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-quota-operations-v2\hostinger-private-tools
```

Substituir somente estes dois arquivos após fazer cópia privada de segurança:

- `google-ads-readonly-service.php`
- `google-ads-campaign-action-service.php`

O pacote não contém credenciais, configuração nem SQL. Não envie os PHPs para `public_html` e não publique o build local no servidor.

## Medição

- Cada chamada Search/SearchStream é contada como uma operação de cota.
- Para paths `:mutate`, conta-se cada item em `operations` ou `mutateOperations`.
- Uma resposta HTTP do Google, inclusive de erro, é informada como estimativa da operação consumida. Erros de transporte sem resposta ficam indeterminados.
- OAuth é excluído. A validação temporária `validateOnly` é contada.
- Os cabeçalhos informam versão v2, requisições HTTP respondidas/indeterminadas e operações estimadas/indeterminadas. Eles não representam uma leitura dos relatórios de uso do Google Cloud.

## Conferência após publicar

Depois de substituir os dois PHPs, abra a tela local Google Ads API e faça uma consulta pequena já necessária ao trabalho. O Hub deverá mostrar separadamente POSTs do Hub, chamadas HTTP Ads e operações estimadas. Confirme o uso total do projeto na métrica móvel do Google Cloud; nenhum teste de API real foi feito nesta entrega.

# Localizações agregadas dos cliques — Google Ads API

**Status:** pacote local de staging; ainda não foi enviado nem validado na Hostinger. A tela do Hub só começará a receber esses relatórios depois que o serviço privado com a operação `geographic_report` for publicado manualmente pelo usuário.

## Arquivo e destino

Faça backup do arquivo atual e substitua somente:

| Arquivo local | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-readonly-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php` |

Não altere o wrapper público `google-ads-readonly.php`, `tracking-config.php`, credenciais, banco de dados, SQL ou tarefas agendadas. Este pacote não inclui nem requer esses arquivos.

## Operação adicionada

`geographic_report` valida MCC, conta e intervalo de até 14 dias fechados. O serviço consulta `user_location_view` para trazer data, campanha, país de localização física agregada, cliques, impressões e custo. Quando há linhas, consulta `geo_target_constant` para resolver nome e código dos países. A resposta só é marcada completa quando todas as linhas e países passam pelas validações; acima de 10.000 linhas, falha sem truncamento.

Esta operação é somente leitura. Não grava no servidor, não altera campanhas nem aciona consultas individuais por clique. A estimativa é de 1 operação Google Ads por conta, mais 1 quando for necessário resolver países. Consultar 14 dias em uma chamada não significa 14 operações.

## Após sua publicação manual

Com o Hub aberto, fonte API selecionada e Atualização automática ativada, o relatório consulta após 20h de São Paulo uma vez por dia e reconsulta os últimos 14 dias fechados de cada conta para incorporar atrasos. Erros ficam como falha; resposta sem linhas não vira zero e os últimos resultados com dados são preservados.

Confirme primeiro que o serviço foi enviado ao destino acima. A interface local e o build do Hub são uma entrega separada; não foram publicados por este pacote.

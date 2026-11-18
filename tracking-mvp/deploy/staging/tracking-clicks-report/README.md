# Staging — relatório agregado de visitas e cliques

**Status:** implementação local pronta para revisão e publicação manual. Não foi enviada à Hostinger. O Hub consulta eventos já recebidos pelo coletor.

## Arquivos e destinos

Faça backup de arquivos de mesmo nome, se existirem, e envie somente:

| Arquivo deste pacote | Destino na Hostinger |
| --- | --- |
| `hostinger-public-track/tracking-clicks-report.php` | `/home/u572283517/domains/travenzo.shop/public_html/track/tracking-clicks-report.php` |
| `hostinger-private-tools/tracking-clicks-report-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/tracking-clicks-report-service.php` |

O wrapper procura o serviço em `private-tools`, fora de `public_html`. Não coloque o arquivo privado na pasta pública.

## Banco, configuração e segurança

- O endpoint lê `tracking_events` e `tracking_allowed_domains`. A versão inicial não exigia migração; para separar ClickBank e GuruMedia numa instalação existente, use a migração `tracking-platform-classification.sql` dentro de `../gurumedia-sales/`.
- Reutiliza `db_host`, `db_name`, `db_user`, `db_password`, `tracking_hub_api_token` e `tracking_hub_allowed_origins` do `tracking-config.php` que o serviço já usa. Não substitua nem envie esse arquivo.
- Só aceita `POST` autenticado pelo token normal do Hub no header `Authorization: Bearer ...`, com a origem exata do Hub. `OPTIONS` atende ao preflight CORS; não aceita query string.
- O intervalo é UTC, inclusivo, com no máximo 366 dias. O POST inclui `platform` (`clickbank` ou `gurumedia`); o endpoint retorna somente eventos de domínios classificados para essa plataforma. A resposta agrupa por data, produto, rótulo e hostname, conta apenas `page_view` e `outbound_click`, e limita a 5.000 combinações. Responde com `schema_version: 2` e ecoa a plataforma solicitada.
- O JSON não seleciona nem devolve `visitor_id`, GCLID, `extclid`, URL da página/destino, IP ou outros identificadores. É leitura `SELECT`; não escreve evento, arquivo, CSV, dado do Hub ou conversão do Google Ads.
- A métrica é contagem de eventos, não visitantes únicos; recargas podem contar como visitas adicionais e a taxa de saída é cliques de saída ÷ visitas, não CTR de visitantes únicos.

## Publicação e validação

1. Para a instalação original, envie os dois arquivos acima. Para separar plataformas numa instalação GuruMedia já existente, use a migração e os serviços listados em `../gurumedia-sales/README.md`.
2. Abra a tela da plataforma no Hub. A classificação pode ser alterada em **Integrações → Configurações globais**; marque cada domínio GuruMedia como GuruMedia.
3. Para validar o registro de `metabo.zinvero.shop`, escolha um período que inclua os eventos de teste. O relatório deve mostrar a chave `metabo-zinvero`, o hostname e contagens positivas de visitas e saída.
4. Um acesso direto à URL do endpoint sem Origin/token deve ser recusado; isso é esperado e não substitui o teste autenticado no Hub.

Este staging não confirma o upload nem a publicação na Hostinger. O pacote não contém credenciais nem configuração privada.

Testes locais sintéticos: `tests/tracking-clicks-report.test.php`, `tests/tracking-clicks-report-public-path.test.php` e `tests/tracking-clicks-report-deploy-package.test.php`.

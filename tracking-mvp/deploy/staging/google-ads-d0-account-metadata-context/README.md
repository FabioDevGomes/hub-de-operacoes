# Contexto de conta assinado nas capturas automáticas D0

Pacote local, ainda não publicado. O serviço reutiliza moeda e fuso já consultados na Google Ads API durante capturas automáticas de hoje (D0), reduzindo consultas repetidas de metadados por conta.

O Hub local correspondente está na versão **1.286.0**. Atualize primeiro o serviço PHP privado e depois use o Hub atualizado. Se o Hub novo encontrar o serviço antigo, ele repete a requisição no formato anterior; a economia só ocorre depois que este PHP for publicado.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta de upload local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-d0-account-metadata-context\hostinger-private-tools
```

Faça backup privado do arquivo atual antes de substituir. Envie somente:

- `google-ads-readonly-service.php` → `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Não há SQL, alteração de configuração ou credenciais neste pacote.

## Como funciona

- O serviço assina os metadados recebidos do Google Ads, vinculando o token à MCC, conta, moeda e fuso; o token expira em 24 horas.
- Nas capturas automáticas D0, o servidor reutiliza os metadados apenas com assinatura válida e quando a data solicitada ainda é o dia atual no fuso assinado.
- Na primeira execução, quando o token expira ou quando a data/fuso não corresponde, o serviço faz a consulta atual e emite um contexto renovado quando aplicável.
- O Hub mantém o token no armazenamento local do navegador, associado à conta. Ele não é enviado à telemetria nem altera relatórios, campanhas ou banco operacional.
- Capturas D−1, prévias, consultas manuais e criação/validação de campanhas mantêm o comportamento existente.
- A redução estimada com o token aquecido é de até duas operações Google Ads por conta em cada ciclo D0. Com intervalo de duas horas, são cerca de 22 operações economizadas por conta em uma janela de 24 horas: 11 ciclos reutilizam o token, e o ciclo seguinte consulta e renova os metadados. É uma estimativa pelo fluxo do código, não uma medição na conta.

O PHP passou por `php -l` localmente. Não foi feita chamada à Google Ads API nem acesso a contas durante esta entrega. Após o envio, não faça uma chamada extra apenas para testar: a próxima captura D0 automática normal já usará o novo fluxo. A publicação continua manual e este pacote permanece local até o envio.

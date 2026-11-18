# Google Ads — correção da auditoria de cobertura de rastreamento

**Status:** pacote preparado localmente; ainda não publicado nem validado no servidor.

## Arquivo e destino

Faça backup do arquivo atual e substitua somente este arquivo:

| Arquivo local | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/google-ads-readonly-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php` |

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-tracking-coverage-gaql-limit-fix-2026-11-09\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)  
Arquivo de destino: `google-ads-readonly-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

## O que corrige

- Corrige as consultas GAQL da auditoria para incluir no `SELECT` os campos de status usados nos filtros `WHERE`. Isso trata o erro `EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE` observado na auditoria.
- Se um recurso exceder 10.000 linhas, limita a amostra processada, identifica no resultado qual recurso excedeu o limite e marca todas as campanhas da conta como **Inconclusivas**. As contagens exibidas ficam explicitamente parciais; nenhuma cobertura completa é inferida.
- Mantém o limite de 20.000 rotas derivadas por campanha: quando excedido, aquela campanha continua inconclusiva.

## Publicação e operação

1. Faça e confira um backup privado do PHP atualmente instalado.
2. Envie somente `google-ads-readonly-service.php` para o destino privado acima, substituindo o arquivo existente.
3. Depois do upload, abra **Integrações → Google Ads API → Snapshots da Operação** e execute **Consultar cobertura** para as contas desejadas.

Não há SQL, migração, alteração de configuração, chamada automática, nem modificação de campanha. A operação permanece sob demanda e somente de leitura. O limite continua em até seis consultas GAQL por conta; a correção não adiciona chamadas. A consulta posterior consome cota como qualquer auditoria explícita.

O Action Service consolidado em `google-ads-campaign-actions-consolidated-2026-11-09` não faz parte deste pacote e não deve ser substituído: este pacote atualiza somente o endpoint somente de leitura. O Hub já renderiza estados `Inconclusivos`; não é necessário enviar uma versão do Hub ao servidor.

## Validação e rollback

Após substituir o arquivo, use o botão da tela para consultar as mesmas contas que falharam. Confirme que as falhas GAQL desapareceram e que contas grandes mostram campanhas com resultado **Inconclusivo** e identificam o recurso limitado, em vez de apresentarem cobertura completa baseada em dados parciais. Essa verificação faz novas consultas e consome cota.

Se o endpoint apresentar erro, restaure apenas o backup do mesmo `google-ads-readonly-service.php` no destino original. A publicação é manual; o arquivo local não confirma o estado do servidor.

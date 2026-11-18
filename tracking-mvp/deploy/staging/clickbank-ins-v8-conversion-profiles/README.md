# Atualização — perfis de ação de conversão no Hub

Esta atualização permite que o Hub escolha a ação de conversão por perfil de conta/MCC ao gerar o CSV INS v8. **Ainda não foi enviada à Hostinger.**

## Arquivo e destino

Envie somente o serviço privado abaixo, depois de fazer uma cópia de segurança do arquivo atual:

| Arquivo local | Destino na Hostinger |
| --- | --- |
| `hostinger-private-tools/clickbank-ins-v8-api-service.php` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/clickbank-ins-v8-api-service.php` |

Não substitua os wrappers públicos nem o `tracking-config.php`. O relatório continua em GET. O CSV do novo Hub usa POST JSON autenticado com `conversion_name`; o GET legado ainda funciona se `tracking_hub_conversion_name` permanecer configurado.

## Banco e configuração

- Nenhum SQL ou alteração de banco é necessário.
- Nenhuma chave nova, token novo ou arquivo de configuração privada é necessário.
- O Hub guarda rótulos de conta/MCC e nomes das ações no `localStorage` da origem local. Somente a ação selecionada é enviada no POST autenticado para gerar o CSV; o rótulo é local.
- Confira manualmente a conta/MCC de destino no Google Ads antes de carregar o CSV. O perfil não escolhe a conta de destino e o Hub não envia conversões automaticamente.

## Verificação local

Execute os testes sintéticos do serviço:

```powershell
php -l tools/clickbank-ins-v8-api-service.php
php tests/clickbank-ins-v8-api.test.php
php tests/clickbank-ins-v8-api-deploy-package.test.php
```

Depois do upload, use o Hub local para consultar o relatório, selecione um perfil salvo e clique em **Baixar CSV para Google Ads**. O clique ao servidor só ocorre após essa ação explícita.

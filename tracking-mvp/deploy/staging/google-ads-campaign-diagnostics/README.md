# Diagnóstico de falhas da Google Ads API

Entrega incremental para registrar falhas da Google Ads API com um identificador local e detalhes técnicos seguros. A interface local correspondente é atualizada no Hub; este pacote contém somente o serviço privado compartilhado.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-diagnostics\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)  
Arquivo de destino: `google-ads-readonly-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Faça backup do arquivo atual e substitua somente esse serviço PHP. O pacote não exige SQL nem mudança de `tracking-config.php`, credenciais, endpoint público, e-mail ou serviço de ações de campanha. A interface do Hub é local e precisa estar na versão correspondente antes de validar.

## O que aparece no diagnóstico

Em falhas de transporte, OAuth ou resposta da Google Ads API, o serviço grava uma linha estruturada no log PHP com ID de diagnóstico, etapa, HTTP do upstream, operação API, status Google, códigos estruturados, caminho do campo, ID da requisição Google, número do erro cURL e indicação de repetição quando disponível. Esses registros não incluem copy, nome de campanha, payload, IDs de conta, tokens ou credenciais. O mesmo ID e o subconjunto técnico seguro são enviados em cabeçalhos CORS para a interface exibir junto à falha.

Os erros HTTP 4xx são classificados como rejeição, exceto falhas específicas de autenticação, permissão e cota. Erros de rede, HTTP 5xx e cota recebem indicação de possível repetição; cota deve ser tentada mais tarde. Uma prévia usa `validateOnly`, portanto repeti-la não cria campanha. Essa indicação não autoriza repetir uma criação quando o resultado for incerto.

## Conferência após publicar

1. Confirme que o único arquivo PHP foi substituído no diretório privado indicado.
2. Atualize o Hub local para a versão do build entregue junto desta mudança.
3. Clique em **Validar prévia**. Se falhar, leia o ID e a etapa exibidos nos detalhes da campanha.
4. Localize o ID no log PHP da Hostinger. Use HTTP, `google_status`, `google_error_codes` e `field_paths` para separar rejeição de configuração, acesso, cota ou indisponibilidade.
5. Não compartilhe linhas de log que contenham outros dados do servidor; o registro da nova versão foi limitado aos campos listados acima.

O arquivo está local e ainda não foi enviado ao servidor.

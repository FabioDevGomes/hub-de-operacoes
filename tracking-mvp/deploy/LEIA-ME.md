# Deploy do servidor — sem ZIP

Esta pasta separa a versão pronta para upload dos arquivos históricos. As fontes originais em `public/` e `tools/` foram preservadas; a pasta `current/` contém cópias.

Para contexto técnico do servidor, ambiente observado, endpoints e comandos de diagnóstico, consulte [REFERENCIA-HOSTINGER.md](REFERENCIA-HOSTINGER.md).

Para um procedimento reutilizável de instalação manual, backup, execução segura de SQL, upload e validação, siga o [padrão de deploy no servidor](PADRAO-DEPLOY-SERVIDOR.md). As instruções do README de cada pacote continuam definindo os arquivos, destinos e migrações exatos daquela entrega.

Para preparar futuras versões consolidadas do endpoint privado de ações do Google Ads, use [prepare-hostinger-package.ps1](prepare-hostinger-package.ps1) com os manifestos em `manifests/`. Rode primeiro `.prepare-hostinger-package.ps1 -ValidateOnly`; isso confere os arquivos canônicos, o inventário de operações protegido e a sintaxe PHP sem criar um pacote. Quando a versão estiver pronta para publicar, rode `.prepare-hostinger-package.ps1`: ele cria uma pasta versionada nova, com README e manifesto na raiz e apenas os arquivos necessários dentro de cada pasta de destino. O gerador preserva pacotes anteriores e não faz upload. Confira manualmente o comentário de versão no servidor após publicar.

## Regra operacional: local primeiro, upload manual

Os arquivos locais deste projeto são a referência para alterações de código. Para o código/pacote publicado, considera-se que a Hostinger corresponde à versão local que o usuário enviou por último; não faremos alterações diretas no servidor nem uma leitura ao vivo como parte do fluxo normal. Código novo só entra em produção após o upload manual do usuário.

Após uma futura instalação inicial da API administrativa, o Hub poderá enviar um domínio por requisição autenticada. Essa operação altera somente uma tabela dedicada de allowlist no banco; não edita arquivos nem publica código. Não haverá novo deploy por domínio.

Essa regra não cobre o `tracking-config.php` privado: o arquivo real não está nesta pasta nem no workspace, pois contém credenciais; existe somente um exemplo. Preserve a configuração privada durante uploads de código. A allowlist legada reside nela; a solução proposta mantém essa lista e acrescenta domínios novos numa tabela própria, sem edição direta do arquivo. A API ainda precisa de um deploy inicial; veja [../PLANO-CADASTRO-DOMINIOS-PRESELL.md](../PLANO-CADASTRO-DOMINIOS-PRESELL.md).

## Versão atual

Envie somente os arquivos abaixo, mantendo cada grupo no destino indicado:

| Pasta nesta entrega | Destino na Hostinger | Arquivos |
| --- | --- | --- |
| `current/hostinger-public-track/` | `/home/u572283517/domains/travenzo.shop/public_html/track/` | `clickbank-postback.php`, `google-ads-report.php`, `google-ads-csv.php` |
| `current/hostinger-private-tools/` | `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/` | `export-google-ads.php`, `google-ads-api-lib.php`, `google-ads-export-lib.php`, `google-ads-export-service.php` |
| `current/database/` | Banco do tracking, via phpMyAdmin | `clickbank-postback-attempts.sql` (somente se a tabela ainda não existir) |

Não envie a pasta `deploy` inteira para uma única pasta do servidor: os dois grupos têm destinos diferentes. Não substitua `tracking-config.php`; ele fica fora desta entrega e mantém banco, tokens e configurações do servidor. Os arquivos indicados para upload devem vir desta cópia local, após revisão; não envie arquivos que não estejam explicitamente listados para a entrega.

## Backup e rollback

Antes de preparar uma nova versão, a versão que está em `current/` deve ser copiada para uma nova pasta em `backups/`. A política é manter as duas versões anteriores mais recentes e remover somente a mais antiga dentro de `backups/` quando já existirem duas anteriores completas.

Há dois snapshots em `backups/`: `2026-10-15-current-currency-map-fix/`, cópia dos seis arquivos de `current/` antes desta atualização, e `2026-10-15-phase2-pre-currency-map-fix/`, o pacote local anterior à correção do mapa de valores por moeda. O segundo veio dos pacotes locais anteriores, não foi baixado da Hostinger. Os hashes confirmaram que o `current/` anterior à atualização era idêntico ao primeiro snapshot, portanto ele já é o rollback desta mudança; os dois snapshots foram preservados.

Também há um rollback pontual do endpoint anterior em `backups/2026-10-16-pre-clickbank-audit/hostinger-public-track/clickbank-postback.php`, preservado do pacote público antigo antes de remover o ZIP. Esse snapshot contém apenas esse arquivo; use-o somente para reverter o endpoint ClickBank.

Ao preparar uma versão futura, primeiro copie `current/` para um novo snapshot datado; depois atualize `current/` e mantenha em `backups/` somente os dois snapshots mais recentes. As fontes em `public/` e `tools/` não são movidas nem apagadas.

Para rollback, use os arquivos daquela versão de backup e copie cada grupo para o mesmo destino correspondente na Hostinger. Não restaure arquivos de configuração, banco de dados ou credenciais por esse procedimento.

## Escopo e validação

- Esta entrega `current/` contém o exportador legado, endpoints de relatório, o endpoint `clickbank-postback.php` e a migração de auditoria. Não inclui Hub local, `tracking-config.php`, tokens ou senhas.
- O pacote `current/` continua sendo apenas do **Custom Postback/Pixels por macros** e do exportador legado. O receptor INS v8 e a API Hub/CSV ficam em pacotes de staging separados. O usuário confirmou um Test IPN gravado como `TEST`/`is_test = 1`, e a URL própria aparece `Verified`; confirme **Save Changes** na ClickBank caso ainda não tenha ativado notificações futuras. A integração externa de tracking não deve ser substituída.
- O PHP web da Hostinger foi confirmado pelo usuário em PHP 8.3.35 com `pdo_mysql` e OpenSSL habilitados. A API Hub/CSV v8 está implementada localmente, mas ainda não foi publicada.
- Faça backup do `clickbank-postback.php` existente antes de substituí-lo. A tabela de auditoria foi informada como já criada; não rode o SQL novamente se ela já existir. O endpoint continua respondendo às notificações, mas o campo `audit_logged` indica se a gravação da auditoria funcionou.
- Após o upload, use **Test Integration** na integração Custom Postback existente. Não mude o INS da integração externa de tracking nem troque tokens. Em HTTP 200, confirme `audit_logged: true`; `insert_result: duplicate` pode ser normal se o teste reutilizar um `event_id` antigo.
- PHP-CLI está disponível localmente (PHP 8.2.34); o lint e os testes locais foram executados. O upload para o servidor ainda não ocorreu, então a gravação real na tabela de auditoria precisa ser confirmada depois do upload e do próximo **Test Integration**.
- O upload para a Hostinger continua manual. Depois do upload, consulte a auditoria pelo SQL documentado no `README.md`.

## Pacote de staging INS v8 — separado de `current/`

O pacote de staging está em [`staging/clickbank-ins-v8/`](staging/clickbank-ins-v8/README.md). Ele contém apenas o endpoint público e os dois arquivos privados do receptor; não inclui `tracking-config.php`, chaves, senhas ou SQL. Para a atualização de diagnóstico, faça backup e substitua somente os dois arquivos privados indicados no README específico; não altere o pacote `current/` nem a URL verificada da integração externa.

## API Hub/CSV para ClickBank INS v8 — pacote separado

O pacote [`staging/clickbank-ins-v8-api/`](staging/clickbank-ins-v8-api/README.md) publica a consulta somente leitura e o download manual do CSV v8. Ele não pertence a `current/`, não inclui migração SQL nem configuração privada e não altera o receptor, a URL da integração externa ou o Custom Postback.

Antes de publicar, faça backup dos nomes correspondentes na raiz pública e em `private-tools/`. Envie os dois wrappers públicos e o serviço privado conforme o README do pacote. A API reutiliza as chaves já existentes `tracking_hub_api_token`, `tracking_hub_allowed_origins` e `tracking_hub_conversion_name`; não troque nem copie a configuração inteira. Depois teste pelo botão **Consultar vendas INS v8** no Hub local, confirme que a linha TEST fica excluída e que não há upload automático.

## Cadastro de domínios de pre-sell — pacote separado

O pacote [`staging/tracking-domain-allowlist/`](staging/tracking-domain-allowlist/README.md) documenta a fase 1 da allowlist dinâmica; o usuário confirmou o cadastro do domínio pelo Hub. Para o coletor da fase 2, use [`staging/presell-single-script/`](staging/presell-single-script/README.md); o usuário informou que executou a migração e enviou esse pacote. A atualização incremental de identidade fica em [`staging/presell-product-identity/`](staging/presell-product-identity/README.md): cada tag associa um código estável de produto ao hostname, e a tag do Hub não usa `crossorigin`. Faça backup, use a migração aditiva nova uma só vez e preserve as configurações privadas e URLs da integração externa/ClickBank.

## Vendas e e-mail GuruMedia — pacote único

Todo o código e SQL versionado dessa etapa ficam juntos em [`staging/gurumedia-sales/`](staging/gurumedia-sales/README.md): migração, endpoints e `track.js` públicos, serviço privado e atualização do worker compartilhado de e-mail. Siga esse README como procedimento único; os subdiretórios separam os destinos, e nenhum arquivo do Hub deve ser copiado para o servidor. A tela do Hub permanece no projeto `painel-operacao`; tokens e credenciais são configurados fora do pacote.

O pacote registra somente vendas associadas a cliques de saída de Tracks cadastradas; checkout fica para outra etapa. Ele mantém o postback da integração externa intacto, usa o Cron e as configurações de e-mail existentes e não envia conversões ao Google Ads. Acrescente apenas a chave do token GuruMedia à configuração privada existente; não publique essa configuração nem a substitua pelo arquivo de exemplo.

Uma atualização incremental do mesmo pacote separa métricas e associações por plataforma: adicione `tracking_allowed_domains.platform`, substitua a API de Tracks, o relatório de cliques, o serviço de postback GuruMedia e o serviço de e-mail de checkout ClickBank. Em seguida edite cada Track GuruMedia existente nas Configurações globais do Hub e marque **GuruMedia**. Use a lista de arquivos e destinos em `staging/gurumedia-sales/README.md`; não repita a migração de vendas nem reinstale as tags.

## Avisos de pausa automática do Google Ads — pacote de staging

O pacote [`staging/google-ads-campaign-actions/`](staging/google-ads-campaign-actions/README.md) acrescenta e-mails somente para pausas automáticas confirmadas pelo Google Ads. Ele reutiliza a fila/worker, SMTP, remetente, destinatário e Cron de e-mail existentes. A implantação requer backup, uma migração SQL aditiva e três arquivos privados; não envie wrapper público, configuração SMTP, `tracking-config.php` ou credenciais. O README específico determina os diretórios e a ordem exata do upload.

Para instruções permanentes que obrigam cada entrega futura a seguir o formato agrupado por destino, consulte o [AGENTS.md do tracking-mvp](../AGENTS.md). A referência normativa e a checklist completa continuam em [PADRAO-DEPLOY-SERVIDOR.md](PADRAO-DEPLOY-SERVIDOR.md).

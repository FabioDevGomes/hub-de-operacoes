# Google Ads — localizar a meta pela ação configurada

Pacote incremental para o fluxo de criação Search via API do Hub. A tela de Configurações globais salva o nome e o resource name da ação por MCC. O endpoint agora encontra a meta personalizada ativa que contém esse resource name, mesmo quando o nome da meta difere de `meta personalizada da ação compra`.

Para usar a seleção salva, a meta encontrada ainda precisa conter somente essa ação, estar ativa, e a ação precisa estar `ENABLED`, do tipo `UPLOAD_CLICKS` e categoria `PURCHASE`. Se nenhuma meta única atender a essas condições, a prévia bloqueia antes de iniciar as validações individuais. Sem ação selecionada para a MCC, permanece o fallback anterior para `meta personalizada da ação compra` e `Conversão compra off-line (upload)`.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-custom-goal-action-match\hostinger-private-tools
```

Envie somente `google-ads-campaign-action-service.php`. Antes de substituir, faça backup do PHP atual no servidor. Não envie README, wrappers públicos, arquivos de configuração ou credenciais. Não há SQL nem alteração de configuração.

Na prévia, a consulta às metas ativas filtra diretamente pela ação configurada; a seleção não acrescenta uma chamada separada para procurar a ação. O endpoint não cria nem modifica metas ou ações da conta. Ao confirmar a criação pelo Hub, ele associa a meta encontrada somente à campanha nova, que permanece pausada, e confere a configuração por leitura posterior.

Este pacote não altera o CSV nem campanhas existentes. Ele substitui somente o endpoint privado já usado pela prévia/criação via API do Hub.

Validação local: `php -l tracking-mvp/tools/google-ads-campaign-action-service.php` e `php tracking-mvp/tests/google-ads-campaign-custom-goal.php`. Nenhuma chamada à Google Ads API foi feita durante esta alteração.

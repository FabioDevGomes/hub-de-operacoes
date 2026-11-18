# Google Ads — ação configurada por MCC na meta personalizada

Pacote local para novas campanhas Search criadas pelo Hub usarem a ação selecionada em **Configurações globais** para a MCC, dentro da meta personalizada `meta personalizada da ação compra`. Se não houver ação salva para a MCC, permanece o fallback `Conversão compra off-line (upload)`.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local com o arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-custom-goal\hostinger-private-tools
```

1. `google-ads-campaign-action-service.php` — endpoint privado atualizado para localizar a conta efetiva de conversão, confirmar que a ação salva para a MCC é a única ação da meta aprovada, aplicá-la às campanhas recém-criadas e confirmar a configuração por leitura posterior.

Faça backup do arquivo atual e substitua somente esse PHP no destino indicado. Não envie este README, o wrapper público, `trackingConfig.php`, credenciais ou outros arquivos. Não há migração SQL nem mudança de configuração.

O endpoint continua incluindo os serviços privados já existentes no mesmo diretório. Este pacote não altera nem substitui essas dependências.

## Comportamento

Na prévia, o serviço consulta a conta de conversão efetiva da conta filha e procura nela a meta personalizada habilitada `meta personalizada da ação compra`. Quando existe uma associação salva para a MCC no navegador, o serviço exige que essa meta contenha somente a ação selecionada, habilitada, do tipo `UPLOAD_CLICKS` e categoria `PURCHASE`. Sem associação, exige a ação padrão `Conversão compra off-line (upload)`. Se a ação não estiver na meta ou houver mais de uma meta compatível, a prévia falha antes das validações individuais e da criação, com erro específico. A seleção local não cria nem altera ações ou metas no Google Ads.

Ao confirmar, a campanha é criada pausada. Em seguida, o serviço associa a meta no nível da campanha, desativa para lances as metas padrão da campanha e relê as configurações. O Hub só considera a criação confirmada quando a leitura comprova a meta e a ação selecionadas e a campanha continua pausada. Campanhas existentes não são alteradas. A ação salva é incluída na mesma consulta de ações já feita para resolver a meta; não foi adicionada outra chamada à Google Ads API para essa seleção.

Se houver falha depois da criação, a campanha permanece pausada e o Hub orienta conferência manual no Google Ads. Como o nome já existirá, o sistema também bloqueia uma tentativa que pudesse criar outra campanha com o mesmo nome. Confira o estado atual da conta antes de qualquer ação.

## Conferência após o envio

1. Faça backup e substitua apenas o arquivo PHP listado acima.
2. Atualize/recarregue a distribuição local do Hub que lê a ação salva para a MCC e valida a meta.
3. Valide uma campanha nova em conta destino que use a conta de conversão configurada. A prévia deve exibir a meta personalizada e a ação escolhida em Configurações globais.
4. Após confirmar a criação, confira no Google Ads, com a campanha ainda pausada, que a meta específica da campanha é a meta personalizada e que a ação listada corresponde à escolha da MCC.
5. Se o Hub informar que não confirmou a meta, procure a campanha pelo nome no Google Ads e confira sua configuração antes de repetir qualquer operação.

Validação local: `php -l tracking-mvp/tools/google-ads-campaign-action-service.php` e `php tracking-mvp/tests/google-ads-campaign-custom-goal.php`.

O pacote está local; nenhum arquivo foi enviado ao servidor e nenhuma conta ou campanha ativa foi alterada por esta implementação.

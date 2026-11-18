# Google Ads — segmentação e exclusões de públicos

Pacote incremental para o serviço privado existente. A inclusão usa a operação `apply_configured_audience_targeting` e a lista fixa de **918 IDs únicos** extraídos das linhas `Add` no nível `Ad Group` da planilha fornecida. Os IDs de campanha/grupo antigos da planilha são ignorados e a lista não é enviada ao navegador. O serviço aplica critérios positivos em modo **Targeting** ao grupo da campanha recém-criada. A exclusão usa `apply_audience_exclusions` e a lista fixa de 13 interesses no nível da campanha. As duas ações exigem uma campanha Search pausada, confirmação explícita e releitura dos critérios; repetir uma operação não duplica critérios existentes.

## Arquivos para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-audience-targeting\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — serviço PHP atualizado.
2. [google-ads-audience-targeting-ids.json](hostinger-private-tools/google-ads-audience-targeting-ids.json) — lista privada fixa de 918 IDs usada pela operação de inclusão.

Faça backup e substitua esses dois arquivos na pasta de destino indicada. Não envie o README, o wrapper público, `tracking-config.php`, credenciais, SQL ou serviços de e-mail.

Não há alteração de SQL, configuração ou flag. A inclusão usa a autorização existente para criação de campanhas; a lista fixa precisa continuar na mesma pasta do serviço. A operação de exclusão permanece independente e usa o mesmo serviço.

## Conferência depois do deploy

1. Confirme que os dois arquivos foram substituídos no destino indicado.
2. Atualize a distribuição local do Hub e abra **Criação de ofertas → Criar campanha Google Ads**. O botão de segmentação não faz consulta ao abrir a tela e só fica habilitado após a campanha nova ser confirmada como pausada.
3. Clique em **Aplicar segmentação (918 públicos)** e confirme a campanha, a conta e o aviso sobre a cota da API. O servidor lê a lista fixa, aplica critérios positivos ao grupo em modo **Targeting** e mantém a campanha pausada.
4. Confira as contagens de IDs enviados, elegíveis na conta, confirmados, já existentes, não reconhecidos, ambíguos e com falha. Cada critério novo pode contar como uma operação de escrita, até 918 nesta lista; se necessário, o serviço também atualiza a configuração Targeting do grupo. Repetir após aplicação parcial reconhece critérios existentes.
5. Para exclusões, use **Aplicar exclusões (13 públicos)** no resultado da campanha. O servidor pesquisa os quatro IDs ausentes pelo nome em português e aliases em inglês, e só aplica resultado único compatível com Pesquisa. IDs e nomes reais retornados ficam visíveis no Hub.

A interface do Hub é construída/distribuída localmente separadamente. O pacote substitui o mesmo serviço usado pela criação de campanhas e pelas ações de pausa/ativação; o serviço precisa ficar junto do JSON de públicos. O pacote está local e ainda não foi publicado.

# Associação de campanhas Search existentes a um lote local

Pacote incremental para recuperar campanhas já criadas, conferir seus IDs e salvá-las como um novo lote no navegador do Hub.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-batch-association\hostinger-private-tools
```

1. `google-ads-campaign-duplication-service.php` — atualiza a operação de leitura `campaign_duplication_list` para conferir IDs selecionados, nome exato, status, Search, configuração de público e grupos de anúncios.

Faça backup do arquivo atual no servidor e substitua somente esse serviço. O endpoint privado `google-ads-campaign-action-service.php` existente precisa já carregar o serviço de duplicação e encaminhar `campaign_duplication_list`; não o substitua por uma cópia antiga. Não há SQL, mudança de configuração, credencial, wrapper público ou outro arquivo neste pacote.

## Comportamento e cota

A nova operação recebe até 100 IDs, consulta novamente as campanhas Search por conta e faz uma consulta separada aos grupos de anúncios. É somente leitura: não cria, pausa, ativa nem edita campanhas. A tela também usa a busca existente de campanhas Search quando o usuário clica **Buscar campanhas**. Cada busca inicial consome uma consulta por conta selecionada; a associação faz duas consultas por conta que tiver campanhas marcadas. Abrir a janela e navegar pelos resultados locais não consulta a API.

O Hub compara o produto exato extraído do padrão de nomenclatura, apresenta nome/conta/ID/status, e só salva o novo lote local depois que a consulta por IDs confirma os registros. Se qualquer campanha tiver mudado ou não puder ser conferida, nenhum lote novo é gravado. Lotes existentes não são substituídos. A associação fica no `localStorage` do navegador/perfil atual e não recupera o rascunho nem a prévia original da criação.

## Conferência após o envio

1. Confirme que o arquivo privado foi substituído no destino indicado; a publicação permanece manual.
2. Atualize a distribuição local do Hub para a versão que apresenta **Associar campanhas existentes**.
3. Abra a janela, revise o produto e as contas da Ficha e Presell, e clique **Buscar campanhas**.
4. Confira cada nome, conta, status e ID. Marque as campanhas desejadas e confirme **Associar selecionadas**.
5. O novo lote aparecerá no seletor de lotes salvos neste navegador. Nenhuma campanha será criada ou alterada nessa etapa.

# Google Ads Campaign Creation — estratégias de lance e CPA desejado

Pacote incremental do backend privado para a tela local Hub. A criação recebe orçamento, estratégia de lance, parâmetros da estratégia, países, palavras-chave, redes, declaração política da UE, rastreamento, anúncios e promoção. O Hub oferece CPA desejado como estratégia padrão, além de maximizar conversões, ROAS desejado, maximizar valor da conversão, maximizar cliques, parcela de impressões desejada e CPC manual. Para campanhas Search padrão, CPA desejado é enviado como `MaximizeConversions` com CPA obrigatório; ROAS desejado como `MaximizeConversionValue` com ROAS obrigatório; maximizar cliques como `TargetSpend` com limite opcional de CPC. Os esquemas restantes também usam o campo padrão correspondente da Google Ads API. O grupo recebe CPC somente no modo CPC manual. Quando o CPA vier do padrão de nomenclatura, o servidor compara a moeda informada pelo Hub com a moeda real da conta e rejeita divergência sem converter. A promoção aceita ocasião opcional, permite ausência de código/pedido mínimo, define a URL final no Asset de promoção e limita o item a 20 caracteres. A prévia valida autorização, moeda, países ativos, lances e duplicidade antes de enviar a operação em `validateOnly`. A confirmação cria a campanha pausada e verifica o status.

## Arquivo a publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-creation\hostinger-private-tools
```

Arquivo local: [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php)  
Arquivo de destino: `google-ads-campaign-action-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-campaign-action-service.php`

Faça backup do arquivo instalado e substitua somente esse serviço PHP. Não envie o README, o wrapper público, SQL, serviços de e-mail, `tracking-config.php` ou credenciais. O serviço deve permanecer em `private-tools`, fora de `public_html`.

Esta pasta de destino contém apenas o arquivo PHP necessário para esta etapa. O pacote é local e ainda não foi publicado no servidor. Não exige SQL nem alteração de `tracking-config.php`; preserva a flag privada de criação já configurada. A interface do Hub é distribuída localmente pelo build e não vai para a Hostinger.

## Verificação após o deploy

1. Confirme que o único PHP foi substituído no destino privado indicado e permaneceu fora de `public_html`.
2. No Hub local, abra **Integrações → Criar campanha**. A abertura e a seleção da conta devem usar a lista MCC/conta em cache e não fazer chamadas de criação.
3. Preencha uma configuração e clique em **Validar prévia**. A resposta deve exibir moeda, orçamento, CPC, países resolvidos, redes, palavras-chave e status inicial pausado. `validateOnly` não cria recursos. “Nenhuma” em ocasião e detalhes deve ser aceita; uma promoção sem código/pedido mínimo deve aparecer na prévia da API. A URL final deve ser aplicada tanto ao anúncio Search quanto ao Asset de promoção.
4. Confira na prévia a estratégia escolhida e seus parâmetros. Estratégias orientadas a conversão precisam de metas/ações e valores de conversão corretamente configurados na conta.
5. Não clique em **Criar campanha pausada** até revisar integralmente a prévia e confirmar que quer publicar a campanha na conta escolhida.

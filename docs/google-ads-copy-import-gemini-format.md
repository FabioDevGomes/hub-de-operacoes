# Formato de copy do Gemini para importar no Hub

O botão **Colar copy do Gemini** tenta ler o clipboard no clique e organiza automaticamente um bloco estruturado no final da resposta. Se o navegador negar a permissão ou o clipboard estiver vazio, o usuário pode colar no campo compacto; a organização é automática quando o marcador final aparece. A resposta humana atual deve permanecer completa e na mesma ordem; o JSON abaixo é um complemento que permite ao Hub separar os itens sem depender de títulos, idioma dos cabeçalhos ou posição dos blocos de código.

## Instrução para acrescentar às regras do Gemini

Acrescente a instrução abaixo às regras existentes, sem remover nem reescrever as seções atuais:

> Preserve toda a resposta atual exatamente no formato e na ordem definidos nas regras anteriores. Depois do último bloco dos detalhes da oferta, acrescente o bloco reservado do Hub abaixo. Esta é a única exceção à regra que proíbe conteúdo depois do bloco dos detalhes da oferta.
>
> O bloco é um complemento, não substitui as categorias copiáveis já produzidas. Copie para o JSON exatamente os mesmos textos principais que já aparecem nos blocos legíveis. Não crie uma segunda variação. Preserve cada tradução para português em `translation_pt`; se a copy principal for em português e não houver tradução, use `null`.
>
> Retorne JSON válido entre os marcadores, sem comentários, vírgulas finais ou texto explicativo dentro deles. Use strings de uma linha. Não invente informação. Se a oferta não tiver promoção, use `null` em `promotion`. Para itens opcionais sem tradução, use `null` em `translation_pt`. Em `occasion`, use `null` quando nenhuma ocasião estiver configurada. Em `trigger_type`, use `none` quando não houver código promocional ou pedido mínimo.
>
> Os campos de sitelinks e demais recursos devem reproduzir as mesmas peças já geradas. Cada sitelink contém um título e exatamente duas descrições. Cada snippet contém o cabeçalho e os valores do conjunto.
>
> Use este formato e os nomes de campo exatamente como estão:
>
> ```text
> [HUB_COPY_IMPORT_V1]
> {
>   "schema": "hub_google_ads_copy_v1",
>   "language_code": "en",
>   "headlines": [
>     {"text": "Main-language headline", "translation_pt": "Tradução de referência", "group": "product"}
>   ],
>   "descriptions": [
>     {"text": "Main-language description", "translation_pt": "Tradução de referência"}
>   ],
>   "callouts": [
>     {"text": "Main-language callout", "translation_pt": "Tradução de referência"}
>   ],
>   "structured_snippets": [
>     {
>       "header": "Types",
>       "header_translation_pt": "Tipos",
>       "values": [
>         {"text": "Confirmed value", "translation_pt": "Valor confirmado traduzido"}
>       ]
>     }
>   ],
>   "sitelinks": [
>     {
>       "title": {"text": "Main-language title", "translation_pt": "Título traduzido"},
>       "descriptions": [
>         {"text": "First description", "translation_pt": "Primeira descrição traduzida"},
>         {"text": "Second description", "translation_pt": "Segunda descrição traduzida"}
>       ]
>     }
>   ],
>   "promotion": {
>     "target": "Product name",
>     "discount_type": "percent_off",
>     "discount_value": "62",
>     "language_code": "en",
>     "occasion": null,
>     "trigger_type": "none",
>     "trigger_value": ""
>   }
> }
> [/HUB_COPY_IMPORT_V1]
> ```

Use o idioma principal real da copy em `language_code`. O exemplo é apenas estrutural: substitua seus textos pelos que já foram gerados para a oferta. A URL final não é incluída aqui porque o Hub a solicita no formulário e a usa tanto no anúncio quanto na promoção.

## O que o Hub aplica hoje

- O usuário seleciona exatamente 10 títulos e 3 descrições; o formulário atual exige esses totais.
- A promoção, quando marcada, preenche produto, desconto, idioma, ocasião e detalhe promocional que existirem no bloco. URL e datas continuam revisadas no formulário.
- Frases de destaque e snippets são mostrados com suas traduções para conferência, mas ainda não são enviados pela criação atual.
- Ao aplicar a copy, até seis sitelinks que respeitam os limites de caracteres são salvos no rascunho atual ou diretamente no lote já aberto. Quando a importação acontece no rascunho, os sitelinks passam automaticamente para o lote ao criar as campanhas. As seções `#1` a `#6` são atribuídas pela ordem da lista e acrescentadas à URL final sem a barra terminal, por exemplo `https://getdentabiome.travenzo.shop#1`. A aplicação às campanhas permanece uma ação separada na seção “Sitelinks deste lote”.
- O Hub não executa código da colagem. Ele procura os marcadores, interpreta apenas JSON válido e mostra textos com `textContent`.
- A seleção e o preenchimento acontecem localmente no navegador. Não consultam Google Ads; a API só é chamada nas etapas já existentes de validar a prévia e criar a campanha.

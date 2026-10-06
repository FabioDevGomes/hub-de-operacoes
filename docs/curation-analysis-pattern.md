# Fichas de análise da Curadoria

E-commerce GM (`src/curadoria/top-performance/`) é a referência de apresentação para Google Trends, Glimpse e Google Imagens. Este guia consolida os contratos existentes em `maintenance.md` e nas referências locais de arquitetura; não unifica bancos ou altera regras de avaliação.

## Componentes e navegação

- Atalhos da listagem abrem diretamente a aba correspondente na ficha, não abaixo da tabela. Reutilize `trends-sheet.css` para shell, abas, estados, sombra, CTAs e candidatas. Hosts sem shell próprio usam `.product-sheet` junto a `.sheet`.
- Conteúdo centralizado em até 1280px, padding de 24px (16px em telas estreitas), cabeçalho único da oferta e abas sem borda externa. Painéis têm fundo, cantos arredondados e separadores internos; campos conservam borda e foco visível.
- Forneça os estilos-base de `.card`, `.control` e `.field-label` no host. Carregar somente os estilos especializados não garante fundo dos cartões nem largura dos campos.
- Preserve fonte e estados compartilhados das colunas, incluindo estado neutro, classificação real e marcadores de candidatas. Não sobrescreva cores por plataforma.
- Avisos de erro/salvamento devem aparecer dentro da ficha aberta, não apenas atrás dela na listagem. Abertura e troca de aba não gravam avaliações.

## Google Trends — seleção do resultado

Na SmartAdv, selecionar países é opcional para salvar o resultado da análise. Sem seleção, guarde `countries: []`; países disponíveis não significam países selecionados e não são atribuídos automaticamente à avaliação. Quando selecionados, preserve os países explícitos e o limite de cinco. Esta exceção não altera a regra dos outros consumidores. Os estados de salvamento ficam junto aos botões de resultado, dentro da ficha. Durante a gravação, desabilite os botões; marque a opção com `selected` e `aria-pressed` somente após sucesso, preservando o resultado anterior em caso de falha. Reabrir a ficha restaura a última avaliação salva e o histórico, sem nova gravação. Mensagens das outras abas também devem ficar visíveis na ficha, não apenas atrás dela na listagem. A persistência permanece própria da SmartAdv.

Regressão isolada: `tests/smartadv-trends-selection.test.mjs` cobre gravação sem país, seleção opcional de país, reabertura e falha de armazenamento.

## Glimpse

Ao colar conteúdo, a análise compartilhada é persistida automaticamente como snapshot; mostre o resultado na própria tela e mantenha **Concluir** como retorno/alternativa para análises manuais ainda não salvas. A mesma regra atende Lista de Gerente, E-commerce GM, Hot Offers MS, Top Offers CB e SmartAdv sem alterar os bancos próprios de cada consumidor.

Incorpore diretamente a página compartilhada `glimpse/` com `embedded=1`, identidade normalizada do produto e origem correta. Não envolva o iframe em outro cartão nem repita título, cabeçalho ou introdução. Preserve People Also Search, indicadores, texto colado e análises salvas no componente original.

Nas fichas da E-commerce GM, Hot Offers MS, Top Offers CB e SmartAdv, mantenha a ação do Glimpse no cabeçalho do host, à esquerda de **Voltar à lista**, com o gradiente azul-claro da ação primária da Visão Geral. O botão de retorno fica sem contorno externo, mas conserva o foco de teclado visível. O controle só aparece na aba Glimpse e envia uma mensagem ao iframe; é o Glimpse compartilhado que salva um rascunho manual pendente. Na Top Offers CB, o rótulo é **Salvar**: após a confirmação da gravação principal, o iframe responde ao host e a ficha permanece aberta com a mensagem pequena verde **Salvo** ao lado. Erros não exibem confirmação, e **Voltar à lista** continua disponível. Os outros hosts conservam **Concluir** e o retorno original. A E-commerce GM usa o mesmo helper de cabeçalho. Na Lista de Gerente independente, **Concluir** fica junto de **Voltar** no cabeçalho interno e usa a mesma cor azul. O `Concluir` do iframe não deve ficar duplicado no rodapé; a ação **Cancelar** permanece disponível.

Valide origem e `contentWindow` antes de aceitar `hub-glimpse-resize` ou `hub-glimpse-close`; o iframe também deve validar origem e `window.parent` para a solicitação `hub-glimpse-finish`. O iframe acompanha a altura informada e a ficha fica no fluxo expandido, evitando que o host corte o conteúdo ou imponha uma segunda rolagem. Preserve o fallback de rolagem e o comportamento da área de colagem definidos no componente compartilhado; não os sobrescreva por plataforma. O retorno do componente volta à aba padrão de cada ficha conforme o contrato do consumidor. Não copie o parser nem o banco compartilhado para outra view.

## Google Imagens

Ordem: painel de validação com orientação sobre as primeiras 20 imagens e termo de pesquisa; um cartão por país; progresso e **Concluir e voltar**; histórico visual.

Cada cartão apresenta país/classificação, CTA azul **Pesquisar imagens**, seis resultados semânticos compartilhados, campo de candidatas negativas e lista com remoção `×` sempre disponível nas fichas de oferta. Enter e remoção persistem imediatamente uma nova avaliação com a classificação atual, preservando histórico. Não mostrar Adicionar, Salvar candidatas ou Cancelar junto ao campo. Sem classificação, solicitar resultado antes de gravar; não inventar status.

Reutilize `image-search-ui.mjs` e `keyword-candidates-ui.mjs`: busca normal sem exclusões, uma busca coletiva que exclui todas as candidatas e preserva país/idioma. **Concluir e voltar** apenas fecha a ficha: avaliações já foram salvas pelas ações explícitas anteriores.

Em telas estreitas, introdução em uma coluna; resultados continuam legíveis com rolagem horizontal local; candidatas quebram linhas e CTA coletivo permanece utilizável. A Lista de Gerente conserva sua exceção documentada de editor compacto e candidatas salvas sem X.

## Particularidades da ClickBank

Top Offers CB usa os mesmos componentes, mas GEO é exclusivamente manual: nunca deduzir país a partir do nome. Nas novas capturas pelo plugin, o Offer ID pode ser extraído do parâmetro `offer` do link de detalhes presente na linha renderizada do Marketplace. Quando validado, ele habilita o atalho **Abrir oferta** abaixo dos países na aba Google Trends e torna clicável a posição `#n` da lista, ambos abrindo a rota interna de detalhes da ClickBank em nova aba. Capturas antigas sem ID continuam sem link; não derive código do título, não altere a identidade `seller + título normalizado` e não reatribua análises/históricos. O campo é opcional e não exige migração do banco. `radar-clickbank-top-offers` mantém países, Trends e Imagens; `radar-glimpse` continua responsável por Glimpse. A aba Histórico conserva ambas as trilhas de avaliações, também visíveis nas suas abas específicas.

## Validação

Rode testes da view/storage, `keyword-candidates-ui`, `glimpse-ui`, `top-performance-ui`, build e suíte completa. Testes sintéticos em memória cobrem abertura direta, retorno, estados por país, candidatas, URLs e histórico. No navegador em `http://127.0.0.1:8765/`, confira os três atalhos, conteúdo do iframe, troca de abas, retorno, foco, erros e adaptação; não importe fixtures nem salve avaliações no perfil real para testar.

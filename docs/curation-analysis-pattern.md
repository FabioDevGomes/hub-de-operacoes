# Fichas de análise da Curadoria

E-commerce GM (`src/curadoria/top-performance/`) é a referência de apresentação para Google Trends e Google Imagens. Para a composição completa do Glimpse, a referência aprovada é a ficha Top Offers CB descrita em [Padrão de referência do Glimpse](#padrão-de-referência-do-glimpse). Este guia consolida os contratos existentes em `maintenance.md` e nas referências locais de arquitetura; não unifica bancos ou altera regras de avaliação.

## Componentes e navegação

- Atalhos da listagem abrem diretamente a aba correspondente na ficha, não abaixo da tabela. Reutilize `trends-sheet.css` para shell, abas, estados, sombra, CTAs e candidatas. Hosts sem shell próprio usam `.product-sheet` junto a `.sheet`.
- Conteúdo centralizado em até 1280px, padding de 24px (16px em telas estreitas), cabeçalho único da oferta e abas sem borda externa. Painéis têm fundo, cantos arredondados e separadores internos; campos conservam borda e foco visível.
- Forneça os estilos-base de `.card`, `.control` e `.field-label` no host. Carregar somente os estilos especializados não garante fundo dos cartões nem largura dos campos.
- Preserve fonte e estados compartilhados das colunas, incluindo estado neutro, classificação real e marcadores de candidatas. Não sobrescreva cores por plataforma.
- Avisos de erro/salvamento devem aparecer dentro da ficha aberta, não apenas atrás dela na listagem. Abertura e troca de aba não gravam avaliações.

## Barra de ficha com abas (preferência global)

Referência de layout aprovada em 07/10/2026: **barra da ficha Top Offers CB**, anterior ao contexto, adotada nas quatro fichas que já usam esse formato (**Top Offers CB, E-commerce GM, Hot Offers MS e Ofertas SmartAdv**). Fonte única: `src/curadoria/analysis-sheet-bar.css?v=3`, com acabamento de Salvar em `src/white-button.css?v=5`. Barra `#0a1627`, raio 11px, padding 5px, gap 10px, sem borda externa e sombra curta; abas à esquerda com seleção `#18304d`; ações à direita com gap 6px, altura mínima 34px, padding `7px 11px` e fonte 1rem. **Salvar** usa a face sólida `#30a3d7`, Arial 700, raio 8px e o mesmo bisel do creme, agora inteiramente em tons de azul (topo claro, base escura). **← Voltar à lista** continua textual/sem contorno. Foco, hover, pressionado, desabilitado, movimento reduzido e quebra responsiva ficam nos componentes compartilhados. Preserve abas próprias, inclusive Resumo da Hot Offers MS; não crie essa barra na Lista de Gerente, Radar ou documento Glimpse independente apenas para copiar o visual.

Quando o usuário pedir para **aplicar o cenário global** a outra ficha com abas, reutilize este contrato de composição:

- Uma barra sticky, da largura do conteúdo, reúne a navegação de abas à esquerda e as ações persistentes à direita. Em todas as abas, manter no mesmo lugar o botão principal **Salvar** e **← Voltar à lista**; a troca de painel não esconde nem recria esses controles.
- O mesmo botão **Salvar** executa a ação de gravação da aba atual. Se aquela aba grava cada ação imediatamente ou é somente leitura, manter o botão no lugar, desativado, com `title` e nome acessível explicando o motivo; não simular ou repetir uma gravação. Confirmações de sucesso ficam junto da ação e só aparecem após resposta positiva do armazenamento.
- A aba Glimpse incorporada usa o botão da barra hospedeira para concluir/salvar o rascunho no iframe, sem botão duplicado no cabeçalho interno. A confirmação **Salvo** aparece imediatamente antes do botão, reservando a posição dele para que não se desloque quando o feedback surgir. Um retorno secundário dentro do painel é removido quando já existe **Voltar à lista** na barra.
- No mobile, os mesmos controles continuam visíveis, podem quebrar para outra linha e preservam a ordem e a rolagem horizontal das abas.
- Preserve o contrato de dados de cada domínio: esta é uma preferência global de layout e consistência, não autorização para alterar persistência, autosalvamento, histórico ou modelo de dados. Reutilize `.sheet-tab-bar`, `.sheet-bar-actions` e o helper compartilhado de iframe quando aplicável; não copie handlers de uma plataforma para outra.

Aplicação atual: **Top Offers CB, Hot Offers MS, E-commerce GM e Ofertas SmartAdv**; a **Lista de Gerente GM** abre o mesmo documento Glimpse independente. Na ClickBank, Salvar atua em Trends/Glimpse. Nas demais fichas, Salvar atua em Glimpse; outras abas conservam suas ações de gravação existentes e deixam Salvar desativado com explicação acessível. Resumo/Salvar decisão da Hot Offers MS permanece intacto.

## Google Trends — seleção do resultado

Na SmartAdv, selecionar países é opcional para salvar o resultado da análise. Sem seleção, guarde `countries: []`; países disponíveis não significam países selecionados e não são atribuídos automaticamente à avaliação. Quando selecionados, preserve os países explícitos e o limite de cinco. Esta exceção não altera a regra dos outros consumidores. Os estados de salvamento ficam junto aos botões de resultado, dentro da ficha. Durante a gravação, desabilite os botões; marque a opção com `selected` e `aria-pressed` somente após sucesso, preservando o resultado anterior em caso de falha. Reabrir a ficha restaura a última avaliação salva e o histórico, sem nova gravação. Mensagens das outras abas também devem ficar visíveis na ficha, não apenas atrás dela na listagem. A persistência permanece própria da SmartAdv.

Regressão isolada: `tests/smartadv-trends-selection.test.mjs` cobre gravação sem país, seleção opcional de país, reabertura e falha de armazenamento.

## Glimpse

### Padrão de referência do Glimpse

Adoção global em 07/10/2026: todos os acessos Glimpse existentes da Curadoria usam a referência, inclusive links antigos sem `presentation`. `tests/glimpse-reference-flow.test.mjs` cobre cinco origens, abertura independente, sucesso sem fechar, deduplicação, vazio, clipboard negado, falha e validação do pai/origem. `tests/glimpse-reference-bar.test.mjs` protege a barra, identidade dos controles e desativação fora de Glimpse. A ausência de dimensão de relevância não pode interromper a renderização nem gerar pontuação artificial. Radar SpyHero não tem Glimpse: esta propagação não cria uma análise nova nele.

Referência aprovada em 07/10/2026: aba **Glimpse** da ficha **Top Offers CB**, com barra antes do título, captura compacta, quatro indicadores e People Also Search. O padrão agora é compartilhado por todos os consumidores Glimpse da Curadoria; não reproduza valores, nomes de ofertas, quantidade de termos ou mensagens de erro da imagem como conteúdo fixo.

#### Composição e posicionamento

1. Barra sticky no topo, antes do contexto da oferta: **Google Trends → Glimpse → Google Imagens → Histórico** à esquerda; **Salvar** e **← Voltar à lista** à direita. Aba ativa com fundo `#18304d`, raio de 8px; barra escura `#0a1627`, raio de 11px, sem borda externa. Não repetir ações no cabeçalho interno do iframe.
2. Contexto logo abaixo: origem em caixa alta/ciano, título da oferta e metadados discretos. Um único contexto por ficha; o `.hero` interno fica oculto no modo incorporado.
3. Cartão **Colar dados do Glimpse / Google Trends**: título e orientação à esquerda, **Nova coleta** no canto superior direito; na linha seguinte, **Colar e analisar** à esquerda e orientação sobre acesso ao clipboard ao lado. Avisos ficam abaixo, dentro do cartão, nunca atrás da ficha.
4. Quatro cartões de mesma largura, na ordem **Volume, Movimento, Geografia, Cobertura**. Rótulo pequeno, valor destacado e nota curta abaixo. Movimento usa a cor do sinal observado; ausência mostra `—`, não zero.
5. **People Also Search**, imediatamente após os indicadores: título/descrição à esquerda, contador à direita e termos em linhas flexíveis. Não truncar termos, não limitar a uma linha nem aplicar negrito às cápsulas.
6. **Sinal Glimpse**: rótulo e resultado na coluna esquerda, justificativas e leitura operacional à direita. Em seguida, **Confiança/Alertas**, dimensões, indicadores detalhados, intenção/geografia, sinais emergentes, Related Trends, dados da coleta e histórico, conforme o componente existente. Não remover os blocos abaixo da imagem.

Shell centralizado até 1280px, com recuo de 24px (16px em telas estreitas). Conteúdo interno incorporado centralizado até 1120px, largura `calc(100% - 28px)` e padding vertical `12px 0 20px`. Os cartões internos usam padding de 12px, raio de 15px e separação vertical de 9px; métricas usam padding de 10px e gap de 7px. O cartão de captura ocupa a largura interna disponível em `wide-offer-embedded`. Não reduzir fonte para encaixar conteúdo nem impor altura fixa à ficha.

#### Tipografia, fundos, bordas e sombras

- Família `Inter, system-ui, sans-serif`, sem dependência nova de fonte externa. Texto principal reutiliza `--hub-primary-text` (`#c3cede`); texto secundário usa `--muted` (`#91a8c3`). Títulos/valores têm destaque, textos auxiliares e termos usam peso regular.
- Títulos internos `1rem`; descrição `.8rem`; rótulos/notas das métricas `.69rem`; valores `1.35rem`; sinal principal `1.5rem`; leitura operacional `.84rem`/linha `1.55`. Termos People Also Search incorporados `.82rem`, peso 400, padding `6px 8px`, raio 9px e gap 6px. Preserve a escala em `rem`, sem estimar pixels a partir do zoom da imagem.
- Fundo da ficha azul-marinho; iframe transparente nos hosts de oferta compatíveis. Cartões usam `rgba(14,29,49,.94)`, sem contorno externo. Campos editáveis, alertas, cápsulas de termos e foco conservam seus contornos próprios; não aplicar `border:0` indiscriminadamente.
- People Also Search reutiliza o fundo em degradê azul escuro, faixa esquerda de 4px `#5ab1ff` e sombra `0 8px 24px rgba(0,0,0,.12)` do componente. Contador arredondado, termos com contorno azul discreto e texto principal global. Não adicionar sombra de botão de tabela aos termos.
- Semântica interna: favorável `--green` (`#42d6a0`), desfavorável `--red` (`#ff7584`), atenção/misto `--amber` (`#ffbf5b`), destaque informativo `--blue` (`#5ab1ff`). Cores refletem dados reais; indicador não vira verde apenas por ter sido salvo.

#### Ações e estados

Ao aplicar o padrão, conferir sempre os quatro itens: **tamanho, fundo, sombra e borda**, além de fonte, foco e posição. Não substituir ações específicas por um reset genérico de botões.

- **Salvar** reutiliza a barra hospedeira e a variante azul do padrão creme documentada acima: face sólida, contorno/bisel azul e sombra curta, sem mudar a altura mínima de 34px ou padding `7px 11px`. `.glimpse-host-finish` conserva integração/estados; não copiar acabamento ou handlers para CSS local.
- **← Voltar à lista** tem apresentação textual, sem fundo/contorno decorativo; continua uma ação de retorno acessível, não um segundo salvamento. Foco visível azul de 2px, afastado 2px, deve permanecer nos controles.
- **Colar e analisar** usa `.button.primary` verde, com largura mínima 180px; **Nova coleta** usa `.button.subtle` escura, padding `7px 10px` e contorno de controle. São ações do cartão, não botões de tabela: conservar seus tamanhos e sua própria aparência, sem impor sombra preta elevada a todos eles.
- Ler clipboard somente após clique explícito. Durante operação, desabilitar a ação e evitar submissões duplicadas. Permissão negada, clipboard vazio ou falha de armazenamento recebem mensagem real; nunca mostrar **Salvo** quando a persistência falhar.
- O sucesso aparece como **Salvo**, pequeno e verde (`.glimpse-host-saved`, `.72rem`, peso 400), imediatamente antes de Salvar, sem deslocar o botão. Confirmar somente após persistência positiva; manter a análise aberta em todas as origens. O autosalvamento da análise colada continua existente; Salvar não duplica um snapshot já persistido.
- A orientação do cartão usa **Salvar** e **Voltar à lista** em todas as origens; não voltar ao texto legado Concluir. Uma mensagem como “Não foi possível abrir o armazenamento local” é estado de falha, não parte permanente do layout.

#### Botão Colar e analisar — captura do Ctrl+C

Este botão faz parte obrigatória do **padrão global Glimpse**, tanto nas fichas incorporadas quanto na Lista de Gerente independente. Ao pedir para reaplicar o padrão, incluir também a captura direta da área de transferência; não recriar um bloco de colagem manual visível nem exigir Ctrl+V.

- **Fluxo do usuário:** copiar o conteúdo da página Glimpse / Google Trends com **Ctrl+C** (após Ctrl+A, quando apropriado) e clicar em **Colar e analisar**. O mesmo clique lê o texto copiado e prepara/renderiza a análise, incluindo métricas e People Also Search quando detectados.
- **Leitura explícita:** usar `navigator.clipboard.readText()` por `readClipboardText` em `src/curadoria/glimpse/clipboard.mjs`. Nunca ler ao abrir a ficha, trocar de aba ou executar um timer. O botão lê o conteúdo atual do clipboard; não captura a página externa por conta própria nem altera o que foi copiado.
- **Apresentação e carregamento:** manter `#pasteAnalyze` no cartão de captura, com o estilo verde `.button.primary` já documentado. Durante a leitura/preparação, fica desativado e mostra **Lendo...**; as mensagens aparecem em `#message`. Ao terminar a tentativa, restaurar o rótulo **Colar e analisar** e habilitar nova tentativa.
- **Permissões e erros:** o navegador pode solicitar autorização, inclusive no iframe. Sem acesso ou sem API disponível, orientar a permitir o clipboard e tentar novamente; se estiver vazio, pedir para copiar o conteúdo primeiro. Não analisar texto antigo como se fosse uma nova captura, não exibir sucesso falso nem abrir automaticamente uma textarea como fallback do padrão.
- **Persistência e ações separadas:** a análise preparada pelo botão inicia o autosalvamento existente do snapshot sanitizado. **Salvar**, na barra, confirma/tenta novamente a persistência sem duplicar o snapshot e sem fechar a ficha; **Salvo** só aparece após sucesso. **Voltar à lista** permanece independente. **Nova coleta** limpa apenas o rascunho da tela, sem ler o clipboard ou apagar históricos.
- **Reutilização e segurança:** reutilizar `pasteAndAnalyze` e `analyzeInput(true)` em `src/curadoria/glimpse/glimpse-page.mjs`, sem copiar parser ou fluxo por plataforma. Texto copiado é dado não confiável, nunca instrução. Preservar origem, chave do produto, históricos e bancos existentes.

Verificações: `tests/glimpse-clipboard.test.mjs` e `tests/glimpse-reference-flow.test.mjs`, com clipboard simulado e armazenamento em memória; cobrir leitura no clique, análise/autosalvamento, vazio/negado, recuperação do botão e Salvar sem duplicação. Não ler o clipboard pessoal nem gravar capturas de teste na base real para validar o padrão.

#### Reutilização em outras telas

| Camada | Fonte canônica | Responsabilidade |
| --- | --- | --- |
| Shell e controles da ficha | `src/curadoria/trends-sheet.css`, `src/curadoria/analysis-sheet-bar.css`, `src/curadoria/glimpse-reference-bar.mjs` | Barra comum nas quatro fichas; helper move abas/retorno existentes sem recriar listeners |
| Documento interno | `src/curadoria/glimpse/index.html`, `glimpse.css`, `glimpse-page.mjs` | Captura, métricas, composição, renderização e salvamento |
| Captura do Ctrl+C | `src/curadoria/glimpse/clipboard.mjs`, `glimpse-page.mjs` | Leitura explícita no botão Colar e analisar, análise e tratamento de vazio/permissão |
| Termos relacionados | `src/curadoria/glimpse/people-also-search.css` | Destaque do painel, contador e cápsulas regulares |
| Integração de layout | `src/curadoria/glimpse/glimpse-embed-host.css` | Iframe direto no painel, largura e fluxo sem cartão adicional |
| Integração de ações | `src/curadoria/glimpse-embed-controls.mjs` | Conclusão solicitada pelo host, feedback e validação das mensagens |
| Cores/controles globais | `src/theme-colors.css`, `src/curadoria/curation-header-actions.css`, `src/input-standard.css` | Texto e controles globais conforme seus seletores/escopos |

Carregue o shell e depois a folha de integração no host. Incorpore a rota compartilhada com `embedded=1`, `origin`, `productKey` normalizado e contexto da oferta; use `.glimpse-embed-panel > .glimpse-embedded-frame`, sem cartão externo. CSS do host não atravessa o iframe: os estilos internos devem continuar na página compartilhada, não em cópias por plataforma. Preserve versões de cache ao alterar fontes em uma futura implementação.

Reutilize `mountGlimpseHeaderAction` com `actionButton`, `finishLabel:'Salvar'` e `showSavedFeedback:true`. Hosts sem barra usam `mountGlimpseReferenceBar` (E-commerce GM e SmartAdv): move abas e Voltar antes do contexto, cria um único Salvar e desativa-o fora de Glimpse sem alterar outros fluxos. O documento compartilhado aplica a referência em todas as origens, sem opt-in obrigatório; links antigos continuam válidos. Lista de Gerente mantém navegação independente com a barra interna Salvar/Voltar, oculta no iframe junto do contexto duplicado. Não criar abas inexistentes.

Validar `event.origin` e `event.source`/`contentWindow` em `hub-glimpse-resize`, `hub-glimpse-save-result` e `hub-glimpse-close`; o iframe valida `window.parent` para `hub-glimpse-finish`. A altura acompanha o conteúdo, sem teto artificial de 480px e sem dupla rolagem permanente. Em largura ≤850px, indicadores passam a duas colunas e sinal/confiança a uma; em ≤560px, indicadores e captura a uma coluna. Abas podem rolar horizontalmente e ações podem quebrar linha, sem sobrepor o contexto ou cortar termos.

Checklist para futuras implementações: ordem/barra/contexto; largura e gaps; quatro itens de botão; fonte e cores; termos regulares; estados vazio/carregando/erro/sucesso; teclado e responsividade; altura do iframe; retorno explícito com restauração de foco; análise existente sem duplicação. Testes: `tests/glimpse-ui.test.mjs`, `tests/glimpse-embed-controls.test.mjs`, `tests/clickbank-analysis-view.test.mjs` e a suíte do novo consumidor. Implementação futura exige build, suíte completa e revisão visual sem salvar fixtures na base real; documentação isolada exige somente conferência de fontes e links.

Na Top Offers CB, quando o iframe responde `hub-glimpse-save-result` com `saved: true`, o host atualiza o snapshot da lista enquanto mantém a ficha aberta. Assim, o badge Glimpse da oferta passa a refletir a análise recém-salva sem exigir fechar e reabrir a ficha; falha ao recarregar a lista não desfaz nem mascara o salvamento confirmado.

Ao colar conteúdo, a análise compartilhada é persistida automaticamente como snapshot. Todas as origens usam **Salvar**, confirmação **Salvo** e retorno explícito; Salvar mantém a análise aberta e não duplica a coleta já persistida. O histórico, identidade e bancos próprios não mudam.

Incorpore diretamente `glimpse/` com `embedded=1`, identidade normalizada e origem correta, sem cartão intermediário nem contexto duplicado. Preserve análises salvas, texto colado e todos os painéis internos. Todas as origens mostram **Colar e analisar**, sem textarea/fallback manual após erro: instrua a permitir o clipboard e tentar novamente. **Nova coleta** só limpa o rascunho local, nunca históricos.

### Padrão visual compartilhado — todos os consumidores Glimpse

As fichas Top Offers CB, Ofertas SmartAdv, E-commerce GM e Hot Offers MS carregam `src/curadoria/glimpse/glimpse-embed-host.css` depois dos estilos locais. O painel `.glimpse-embed-panel` contém diretamente `.glimpse-embedded-frame`, sem cartão intermediário: não impõe contorno, fundo ou teto artificial de altura.

O documento interno reutiliza `glimpse.css`; todos os iframes ativam `wide-offer-embedded` e `reference-presentation`, com fundo transparente e captura na largura disponível. `analysis-sheet-bar.css` é a barra canônica das quatro fichas; não duplique suas regras locais. A folha do host e a do iframe são camadas distintas. A abertura independente usa a mesma densidade e largura interna de 1120px, com barra própria sticky.

Para uma nova ficha, reutilize as duas camadas somente se ela tiver o mesmo contrato de iframe redimensionável e fluxo de abas. Preserve seu callback de retorno, sua persistência e diferenças de clipboard; não replique o parser nem o banco Glimpse.

Todos os acessos Glimpse usam **Salvar** e **Voltar à lista**: confirmação **Salvo** antes do botão e sucesso sem fechar. Resumo/Trends/Imagens/Histórico mantêm recursos e regras próprias; Salvar fica desativado quando não se aplica. Na Lista de Gerente independente, a barra interna antecede o contexto. Não mostrar Cancelar no rodapé.

Valide origem e `contentWindow` antes de aceitar `hub-glimpse-resize` ou `hub-glimpse-close`; o iframe também deve validar origem e `window.parent` para a solicitação `hub-glimpse-finish`. O iframe acompanha a altura informada e a ficha fica no fluxo expandido, evitando que o host corte o conteúdo ou imponha uma segunda rolagem. Preserve o fallback de rolagem e o comportamento da área de colagem definidos no componente compartilhado; não os sobrescreva por plataforma. O retorno do componente volta à aba padrão de cada ficha conforme o contrato do consumidor. Não copie o parser nem o banco compartilhado para outra view.

## Google Imagens

Ordem: painel de validação com orientação sobre as primeiras 20 imagens e termo de pesquisa; um cartão por país; progresso e **Concluir e voltar**; histórico visual.

Cada cartão apresenta país/classificação, CTA azul **Pesquisar imagens**, seis resultados semânticos compartilhados, campo de candidatas negativas e lista com remoção `×` sempre disponível nas fichas de oferta. Enter e remoção persistem imediatamente uma nova avaliação com a classificação atual, preservando histórico. Não mostrar Adicionar, Salvar candidatas ou Cancelar junto ao campo. Sem classificação, solicitar resultado antes de gravar; não inventar status.

Reutilize `image-search-ui.mjs` e `keyword-candidates-ui.mjs`: busca normal sem exclusões, uma busca coletiva que exclui todas as candidatas e preserva país/idioma. **Concluir e voltar** apenas fecha a ficha: avaliações já foram salvas pelas ações explícitas anteriores.

Em telas estreitas, introdução em uma coluna; resultados continuam legíveis com rolagem horizontal local; candidatas quebram linhas e CTA coletivo permanece utilizável. A Lista de Gerente conserva sua exceção documentada de editor compacto e candidatas salvas sem X.

## Particularidades da ClickBank

Na ficha Top Offers CB, a barra fixa de abas e ações é o primeiro elemento interno: já aparece no alto ao abrir a oferta e continua sticky durante a rolagem. O título da oferta vem logo abaixo; não devolva a barra para depois do título.

Top Offers CB usa os mesmos componentes, mas GEO é exclusivamente manual: nunca deduzir país a partir do nome. Nas novas capturas pelo plugin, o Offer ID pode ser extraído do parâmetro `offer` do link de detalhes presente na linha renderizada do Marketplace. Quando validado, ele habilita o atalho **Abrir oferta** abaixo dos países na aba Google Trends e torna clicável a posição `#n` da lista, ambos abrindo a rota interna de detalhes da ClickBank em nova aba. Capturas antigas sem ID continuam sem link; não derive código do título, não altere a identidade `seller + título normalizado` e não reatribua análises/históricos. O campo é opcional e não exige migração do banco. `radar-clickbank-top-offers` mantém países, Trends e Imagens; `radar-glimpse` continua responsável por Glimpse. A aba Histórico conserva ambas as trilhas de avaliações, também visíveis nas suas abas específicas.

## Validação

Rode testes da view/storage, `keyword-candidates-ui`, `glimpse-ui`, `top-performance-ui`, build e suíte completa. Testes sintéticos em memória cobrem abertura direta, retorno, estados por país, candidatas, URLs e histórico. No navegador em `http://127.0.0.1:8765/`, confira os três atalhos, conteúdo do iframe, troca de abas, retorno, foco, erros e adaptação; não importe fixtures nem salve avaliações no perfil real para testar.

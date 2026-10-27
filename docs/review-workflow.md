# Fluxo Review: da oferta à página

Atualizado em 25/10/2026. Este documento consolida as decisões, o escopo implementado no Hub e a relação com o pacote fornecido `review-page-creator` v2.2. A skill zipada permanece referência de design e requisitos; não é instrução para ignorar as decisões do usuário.

## Direção do trabalho

O trabalho é um **sistema para preparar reviews por oferta e montar o HTML final localmente**. O Hub recolhe dados, organiza evidências, sinaliza pendências e gera a página depois da revisão. A saída fica para hospedagem manual; o Hub não publica nem promete indexação.

A referência descreve um caminho de criação de página em três interações principais: coletar e analisar, reunir imagens, depois gerar HTML. No Hub, esse caminho foi aberto em sete passos para tornar as decisões e entradas reutilizáveis. Os sete passos têm formulários funcionais; o passo 7 consome as decisões salvas nos passos anteriores.

## O que está implementado

| Passo | Escopo | Estado |
|---|---|---|
| 1. Materiais da oferta | Rascunho por ID, nome, mercado, idioma, VSL opcional, URL/conteúdo da página, referências e destino. | Implementado |
| 2. Análise dos materiais | Análise assistida, com ou sem VSL, revisão dos dados extraídos e exportação. | Implementado |
| 3. Reviewer, nota e depoimentos | Relato de uso real, critérios editoriais, slots de depoimentos com origem e autorização. | Implementado e auditado contra o modelo |
| 4. Preço, desconto e garantia | Pacotes, totais, frete, desconto validado, garantia e modo de uso transcrito. | Implementado |
| 5. Imagens e URLs | Inventário numerado, resposta por número, arquivos e URLs públicas, Hero, assets fixos e selo condicional. | Implementado |
| 6. Copy e revisão final | Copy baseada nas fontes e na experiência real, organizada pela estrutura de 20 seções, com CTAs, assets, riscos e exportação rastreáveis. | Implementado |
| 7. Página, SEO e entrega | Prévia responsiva, HTML local, metadados, JSON-LD, checagem de fontes, URLs, assets e placeholders. | Implementado |

Os passos por review salvam no armazenamento local do navegador, com histórico aditivo e exportação própria. A base operacional do Hub não é usada. O backup global ainda não inclui os namespaces de Review; mantenha cópias exportadas. Não existe coleta automática de URLs nem publicação.

### Passo 5 — imagens e URLs (v1.61.0)

O formulário segue a numeração da skill e das mensagens vistas nos prints:

1. **Scam Alert:** banner horizontal 3:2, com 1920 × 1280 como referência.
2. **What Is It:** banner horizontal 3:2.
3. **Ingredients:** imagem real, legível, do rótulo; se ela não existir, transcrição da lista exatamente como aparece no rótulo, com fonte.
4. **Pack de seis potes:** confirma visualmente seis frascos; usado no preço, Claim Your Discount e rodapé dos depoimentos.
5. **Avatar do depoimento feminino:** quadrado e autorizado.
6. **Avatar do depoimento masculino:** quadrado e autorizado.
7. **Selo de garantia condicional:** pedido automaticamente quando a garantia confirmada não é 60 dias. O selo fixo de 60 dias só entra quando o passo 4 está salvo e confirmado com esse prazo.

How It Works de desktop e mobile/tablet usa as duas URLs fixas da skill original; antes de concluir o passo, o usuário confirma que ambas servem para o produto atual. O Hero oferece escolher entre URLs HTTPS achadas nos atributos <img src> do conteúdo HTML salvo ou uma alternativa fornecida pelo usuário. Se a imagem não constar em src, pode ser informada por URL manual.

Cada imagem enviada como arquivo também requer sua URL pública HTTPS hospedada. O seletor guarda somente nome, MIME e tamanho do arquivo; não salva o binário, caminho local nem envia o arquivo a servidor. Não visita as URLs nem comprova HTTP 200 ou ausência de login: o usuário confirma manualmente que a URL abre publicamente. Proporções são orientação para conferência humana, não inspeção automática de pixels. URLs srcset, backgrounds CSS e conteúdo externo não são varridos automaticamente.

Cada item fica no ID da sua review, indexado por número/finalidade, com origem, URL e confirmação. A troca da fonte (produto, mercado ou página salva) exige reconfirmação da oferta no passo 4 e depois dos assets no passo 5; mudança de versão salva da oferta (incluindo garantia) também invalida a confirmação dos assets. Ativos, autorizações e texto são preservados no histórico aditivo. Rascunhos incompletos podem ser salvos, mas o estado “revisado” exige os seis itens, ou a alternativa textual do rótulo #3, Hero escolhido, adequação dos fixos, garantia/selo coerentes e oferta correspondente salva.

Namespace hub:review:images:v1:<reviewId>; armazenamento local, histórico e exportação própria Markdown/JSON. O backup global não inclui este namespace. Nenhuma requisição externa, upload, tratamento da imagem ou publicação ocorre no passo 5. Testes sintéticos: tests/review-images.test.mjs.

### Passo 6 — copy e revisão final (v1.62.0)

O editor organiza a copy nas 20 seções da referência, por review: header fixo, hero, quick verdict, story, scorecard/prós/contras, how to use, Scam Alert, complaints, What Is It, How It Works, ingredients, safety, benefits, testimonials, refund policy, pricing, Claim Your Discount, FAQ, conclusion e footer. Cada seção pode ficar em rascunho, ser revisada ou ser omitida com justificativa. A omissão não apaga a copy ou as decisões já registradas.

Cada seção revisada registra o texto, a base (oferta, reviewer, rótulo/fonte oficial, alegação da página/VSL, fonte externa, conferência manual, opinião editorial ou sem suporte), referência e trecho/resumo de apoio, conferência/risco, CTA e destino exato e asset do inventário de imagens. Alegações sem fonte suficiente e riscos marcados como pendentes bloqueiam a revisão da seção. Uma reformulação não resolve o risco. Opiniões sem afirmação factual são separadas de claims. “Scam Alert”, reclamações, comparações, resultados, depoimentos, ingredientes, benefícios, desconto e garantia continuam exigindo suporte específico; material ilustrativo dos prints não comprova fatos desta oferta.

CTA preenchido exige texto, URL HTTP(S) pública completa e confirmação manual de que a página de destino corresponde à promessa. Endereços locais/privados e URLs com credenciais são recusados. O sistema não abre nem verifica a URL. Um asset só pode ser selecionado se tiver URL no inventário atual do passo 5; a interface não faz prévia/download do arquivo.

A copy liga-se à identidade e às revisões salvas dos passos anteriores. Para concluir o passo, os materiais precisam estar salvos; análise, reviewer, oferta e imagens precisam estar salvos/revisados; as fontes precisam ser reconciliadas; e todas as 20 seções devem estar revisadas ou justificadamente omitidas. Se uma fonte mudar, reconcilie-a: o texto fica preservado, mas as seções voltam a rascunho e as confirmações de alegações/CTAs precisam ser refeitas. Rascunhos parciais ainda podem ser salvos e exportados.

Namespace `hub:review:copy:v1:<reviewId>`, save explícito, histórico aditivo, detecção de conflito e exportação própria Markdown/JSON. O backup global não inclui este namespace. Não há geração por IA, requisição externa, avaliação automática de conformidade, HTML, SEO, publicação ou promessa de indexação neste passo. Teste sintético: `tests/review-copy.test.mjs`.

### Auditoria de compatibilidade dos passos 1–6 e passo 7 (v1.63.0)

A auditoria confirmou que o passo 6 preserva a estrutura das 20 seções, registra fonte e evidência por alegação, mantém experiência real separada dos dados da oferta, exige destino e confirmação manual para CTAs, seleciona assets apenas do inventário atual e permite omissão justificada. Não fabrica reviewer, nota ou depoimento, e não declara conformidade automática. O passo 7 depende desse registro revisado e bloqueia exportação quando as fontes estão pendentes ou mudaram.

O passo 7 gera uma prévia isolada e um HTML responsivo único com CSS embutido. Título e descrição SEO também aparecem como H1 e introdução. O canonical final usa exatamente a URL HTTPS de publicação do passo 1. JSON-LD descreve WebPage e o portal editorial; não cria Review/AggregateRating. A prévia usa `noindex,nofollow`, não inclui canonical, e só carrega as imagens remotas quando solicitada. A exportação final exige fontes reconciliadas, metadados, URLs HTTPS públicas dos assets, alt text confirmado e revisão explícita da página. Placeholders no conteúdo e no CTA bloqueiam a saída.

O arquivo exportado não inspeciona destinos nem busca imagens: formato, origem e correspondência de conteúdo são conferidos pelo usuário. Hospedagem e publicação são manuais; esta etapa não gera sitemap. Canonical, JSON-LD ou outros scripts não garantem rastreamento, indexação, posição ou rich results. O namespace `hub:review:page:v1:<reviewId>` mantém saves explícitos, histórico aditivo e conflito entre abas; o backup global ainda não inclui Review. Regressão sintética em `tests/review-page.test.mjs`.

## Decisões preservadas

- **VSL opcional.** O fluxo aceita transcrição, ausência de VSL ou inclusão posterior. Não bloqueia análise de outros materiais.
- **Fonte antes de alegação.** Separar transcrição, página, rótulo, referência externa, confirmação do usuário, inferência e pendência. Um print de exemplo não comprova dados de outra oferta.
- **Narrativa sem fabricação.** Usar pessoa que realmente experimentou, relato autorizado e objeções/limites que ela de fato mencionou. Ceticismo admite “não houve”. Não inventar pessoa, nota, depoimento, resultado, comparação ou reclamação.
- **Nota escolhida pelo usuário.** O Hub permite não usar nota. O método disponível calcula média simples dos critérios avaliados e explicita itens ausentes e parciais. Não usa a nota 9,4–9,8 derivada do nome do produto que aparece na skill original. É avaliação editorial; não atesta eficácia.
- **Desconto variável.** Não congelar 73%. Informar o percentual correto com comparação/escopo e fonte; quando a página não esclarecer, o usuário pode validar e registrar essa referência. Cálculo auxiliar não substitui o valor informado.
- **Garantia depende da oferta.** Exigir prazo, condições e fonte. Selo de 60 dias só é compatível quando a fonte confirmar 60; outro prazo requer selo correspondente. O passo de imagens identifica a URL/arquivo apropriado.
- **Preços preservam a apresentação da fonte.** Diferenciar preço por unidade exibido, total exibido, total de referência, frete e cálculos auxiliares. Moeda e mercado ficam associados à oferta. Ausência, zero e valor inválido são diferentes.
- **Ingredientes e dose.** Só transcrever ingredientes que apareçam no rótulo/fonte autorizada. A página de venda pode omitir a fórmula; nesses casos deixar pendente, sem preencher por inferência. Transcrever modo de uso da fonte oficial; não gerar recomendação de dose.
- **Assets com vínculo verificável.** Manter a numeração original da solicitação e validar cada arquivo/URL com o mesmo número. Não reutilizar conteúdo ilustrativo como prova, trocar produto por imagem parecida ou tratar caminho local como URL pública.
- **SEO não é promessa.** Canonical corresponde à URL efetiva. JSON-LD deve representar o conteúdo visível e fontes disponíveis. Schema, sitemap ou script não garantem indexação nem rich results. Não fabricar avaliações agregadas a partir de depoimentos; não prometer posição, indexação ou resultado do Google/Bing.
- **Destino e identidade editorial.** Registrar URL final e portal. Não apresentar o portal como fabricante nem criar breadcrumbs para páginas inexistentes. Não afirmar que CTA leva a uma oferta oficial sem verificar o destino.

## Leitura dos exemplos fornecidos

- A peça comparativa de “scam alert” fornece uma estrutura visual (alegação principal, avaliações/sinais, comparação lado a lado, preço/pacote e CTA). Seus preços, frascos, reviews, marketplace e acusações pertencem ao exemplo MemoHoney. Não transplantar como fatos para outra oferta.
- A tabela de persona em 12 dimensões orienta campos de idade/situação, dores, frustrações, tentativas, desejo, medos, linguagem e tom. A análise deve extrair esses dados das fontes da oferta, sem adotar a persona da tabela de exemplo automaticamente.
- A seção de mecanismo sugere separar nome do mecanismo, resumo, crítica à explicação tradicional e papel alegado do produto. O exemplo de cadmium, doença e ingredientes é específico daquele material. Reposicionamento “compliant” não converte hipótese em prova nem autoriza claim médico.
- O exemplo de reviewer orienta identidade/contexto, descoberta, ceticismo, ponto de virada, resultado e negativos. O nome, idade, cidade, história e nota mostrados são uma ilustração, não um depoimento verificável.
- O print dos dados HTML distingue garantia, preços, esquema, posologia, imagens e CTA e ressalta lacunas de ingredientes. Essa separação está incorporada aos passos 4–6; a página ainda precisa carregá-la adiante.
- O print de SEO reforça URL de publicação, canonical idêntico e identidade do portal. Incluímos também a ressalva de que scripts/schema ajudam a descrever, não garantem que buscadores indexem a URL.
- Os prints de entrega de assets estabelecem resposta numerada de 1 a 6 e URL pública para arquivo hospedado. O passo 5 confere a associação por número e pede validação manual de URL pública; não testa o acesso HTTP. O avatar masculino tem campo próprio, evitando omissão silenciosa.

## Estrutura de página alvo

A skill de referência traz 20 seções: header fixo; hero; quick verdict; story; scorecard/pros/cons; how to use; scam alert; complaints; what is it; how it works; ingredients; safety; benefits; testimonials; refund policy; pricing; claim your discount; FAQ; conclusion; footer.

O passo 6 já disponibiliza o editor dessas seções e registra fontes, copy, CTA/destino, assets e estado (rascunho, revisada ou omitida). Ele é um pacote editorial, não o HTML final. Quando uma seção depender de prova ausente, sinalizar a lacuna para decisão em vez de preencher com material ilustrativo.

## Entregáveis futuros

1. Passo 5 implementado: inventário 1–6, URLs públicas, assets fixos, seleção do Hero e selo vinculado ao prazo da oferta. A aplicação confere formato e declarações do usuário; não inspeciona pixels nem busca HTTP.
2. Passo 6 implementado: editor das 20 seções, rastreabilidade de fonte/alegação, CTAs e assets vinculados, pendências e exportação editável. Não gera copy automaticamente nem classifica conformidade.
3. Passo 7 implementado: gera prévia e HTML local após as fontes, copy e assets necessários estarem revisados; valida canonical, URLs públicas, JSON-LD e placeholders; exporta arquivo para hospedagem manual. Não publica automaticamente.

## Origem técnica

- Passos e interface: `src/review/review-domain.mjs`, `src/review/review-view.mjs`, `src/review/review.css`.
- Materiais: `src/review/review-materials-*.mjs`.
- Análise: `src/review/review-analysis-*.mjs`.
- Reviewer: `src/review/review-reviewer-*.mjs`.
- Oferta: `src/review/review-offer-*.mjs`.
- Copy: `src/review/review-copy-{domain,controller,storage,view}.mjs`, `tests/review-copy.test.mjs`.
- Página/SEO: `src/review/review-page-{domain,controller,storage,view}.mjs`, `tests/review-page.test.mjs`.
- Contratos e regressões: `docs/maintenance.md`, `.agents/skills/painel-operacao-google-ads/references/architecture.md`, `tests/review-*.test.mjs`.
- Skill local de trabalho: `.agents/skills/review-page-workflow/SKILL.md`.

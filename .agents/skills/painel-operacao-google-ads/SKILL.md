---
name: painel-operacao-google-ads
description: Desenvolver, diagnosticar, testar e manter o Hub local de operações de Google Ads. Para a tela Controle de gastos pessoais, use a skill especializada controle-gastos-pessoal; não use para edição direta das planilhas operacionais ou dúvidas genéricas sobre anúncios.
---

# Engenharia do Hub de Operações

Esta é a fonte canônica do conhecimento técnico específico do repositório. A instalação global do Codex pode espelhar esta skill para uso, mas não é a fonte a editar nem a versão de referência.

## Regras essenciais

- Localize a raiz por `build.mjs`, `src/index.template.html` e `src/database.js`; não dependa de caminhos absolutos da máquina.
- Preserve dados locais reais. Não importe fixtures, limpe IndexedDB ou altere `data-local/` para testar.
- Nomes MCC completos identificam campanhas; a chave diária é `campanha_id + data`. Zero, ausente e inválido são estados diferentes.
- O **Diário de campanha** exibe a série diária de uma campanha por vez. Um produto pode ter várias campanhas relacionadas: preserve cada nome/ID, série diária e métricas de campanha separadamente; a agregação no nível do produto fica em Produtos Testados e não deve fundir os diários. Nesse menu, sequências confirmadas por sufixos numéricos de iteração — inclusive ordinal como `1°` e um marcador final entre colchetes, como `[MS]` — podem ser exibidas como um único produto quando houver mais de um número distinto para a mesma base. Isso só consolida a listagem e os totais do produto; não renomeia nem mescla campanhas na base.
- Em **Produtos Testados**, `Total faturado` soma por campanha a comissão histórica observada de `legacy_totais` e acrescenta diário/ajustes provisórios apenas em datas após o `end_date`, evitando duplicação do período histórico. Se o resumo observado não tiver data final, não acrescente dados sem sobreposição comprovadamente ausente. Sem comissão histórica observada, use o diário e ajustes provisórios disponíveis. Preserve zero versus ausência; essa consolidação não modifica Diário/MCC ou outras telas.
- O manifesto D0 é parcial; D−1 pode fechar o mesmo dia e gerar conflitos financeiros. Não sobrescreva silenciosamente dados conflitantes.
- Não deduza pausa, suspensão, reprovação, GEO ou entrega pela falta de linha ou por um zero isolado. Use somente evidência explícita da fonte e as regras registradas.
- Ao criar uma view principal, use `src/view-registry.js` para rota, título, subtítulo e metadados.
- Use `apply_patch` para edição. Edite fontes canônicas, execute `node build.mjs` e rode toda a suíte.
- Novas implementações devem seguir [Regras para novas implementações e roteiro](../../../docs/maintenance.md#regras-para-novas-implementações). Escolha o responsável antes de editar; preserve recursos/contratos e não acrescente domínio, templates ou listeners de telas extraídas ao HTML principal. Não importe outra view para reutilizar lógica. Atualize mapa e contratos ao modificar a arquitetura.
- Validação visual deve usar o servidor local já aberto e apenas leitura da base existente; nunca introduza dados sintéticos nela.

## Roteamento das referências

- [Arquitetura e telas](references/architecture.md): estrutura, rotas, fontes canônicas e build.
- [Padrão visual reutilizável](references/visual-style.md): tema escuro, navegação compacta, cartões, tabelas, responsividade e adoção gradual do piloto da Visão Geral.
- [Modelo e persistência](references/data-model.md): IndexedDB, schema da base, eventos e snapshots.
- [Importação MCC](references/mcc-import.md): CSV D−1/D0, captura estrutural direta D0 pela extensão, Preparador, ingestão de telemetria e integração com Controle Macro.
- A versão estável da extensão `extensions/mcc-d0-bridge` associa a grade por `essfield` e encaminha a captura ao receptor do Preparador no contexto `MAIN`; a gravação continua dependendo do clique explícito em “Atualizar base”. Os experimentos locais de texto/comparação continuam isolados e somente de leitura. Consulte [Importação MCC](references/mcc-import.md) e a própria documentação da extensão.
- Para rolagem, retorno de Glimpse e destaque de linha/controle nas listas de curadoria, siga o teste específico em [engineering-workflow.md](references/engineering-workflow.md) e use o módulo compartilhado `src/curadoria/list-focus.mjs`.
- Ao alterar ou diagnosticar o Controle Macro, confira também em `references/data-model.md` a precedência por campo entre planilha histórica e MCC, o fallback de D−1 e a atualização automática da tela.
- Para os princípios de domínio e limites do MVP, use a skill [observabilidade-decisoria](../observabilidade-decisoria/SKILL.md).
- A Observabilidade da Curadoria é outro domínio; consulte a seção homônima em [arquitetura](references/architecture.md), [modelo de persistência](references/data-model.md) e [workflow](references/engineering-workflow.md). Não confunda nem misture seus eventos com o Event Log operacional.
- O módulo **Faturamento** é um domínio financeiro separado da MCC e do Controle Macro. Lançamentos manuais podem ser confirmados por D−1; as conversões MCC também entram como agregados por campanha/data (D0 provisório, D−1 confirmado), sem inventar transações e sem marcar recebimento. Consulte [Faturamento](references/billing.md) e [Importação MCC](references/mcc-import.md) antes de alterar esse fluxo, suas stores, cálculos, backups ou interface.
- Para alterar ou diagnosticar a tela pessoal `/?view=personal-finance`, carregue a skill especializada [Controle de gastos pessoais](../controle-gastos-pessoal/SKILL.md). Não misture suas despesas/reservas com Faturamento, MCC ou Controle Macro.
- O item `item-agua` é lançado em Meu Tempo (`/?view=time`). O lembrete recorrente de hidratação pertence a esse fluxo, não ao Realizado do Controle de gastos: veja `src/meu-tempo/water-reminder.mjs` e o início global pelo menu compartilhado em `src/sidebar-component.js`. Dispensar o aviso ou atualizar/navegar para fora da página com o aviso aberto agenda sua reaparição em 20 minutos sem registrar água; um novo lançamento reinicia o intervalo normal.
- A migração histórica única de `totais` reutiliza a base atual: campanhas legadas aparecem em Diário > Histórico com resumo consolidado de investimento e lucro derivado, sem linhas diárias artificiais ou tela/importador XLSX. Contas MCC já existentes são excluídas por sufixo; contas ausentes continuam sem associação e IDs de contas novas são preservados. O módulo é `src/legacy-totais-migration.mjs`; leia [modelo e persistência](references/data-model.md), [arquitetura](references/architecture.md) e o procedimento de validação/backups em [workflow](references/engineering-workflow.md). Payloads pessoais permanecem em `data-local/` (ignorado pelo Git), nunca em código ou testes versionados.
- Para workflow de testes, diagnóstico e segurança, use [engineering-workflow.md](references/engineering-workflow.md).

## Entrega

Resuma causa ou resultado, arquivos afetados, testes e validação visual. Diferencie fato confirmado de hipótese e indique qualquer ação necessária do usuário.

## Ficha e Presell

- O runtime do Gerador de Pre-Sell inicia subprocessos no PowerShell que hospeda o servidor local; prefira detectar o executável do processo atual. Use PSHOME/assembly ou PATH apenas como fallbacks e confirme que o diretório não está vazio antes de chamar Join-Path. Não presuma pwsh no PATH; cubra o contrato em tests/standalone-runtime.test.mjs.
- Em validadores PowerShell, não use PSScriptRoot em valor padrão dentro de param(); resolva caminhos relativos depois do bloco param(), pois o valor pode estar vazio durante a vinculação de parâmetros no Windows PowerShell.
- A tela única `/?view=copy` chama-se **Ficha e Presell**. A interface não gera copy de anúncios nem download de ficha JSON. O botão independente **Gerar perguntas e respostas** preenche oito respostas editáveis usando o Ctrl+A e os campos revisados; **Copiar perguntas e respostas** copia as edições atuais. Preserve esses dois recursos. Eles não produzem arquivos, não alteram o texto estruturado e não gravam o rascunho. O renderizador fica em `copy-ficha-questions-view.mjs`. A ação **Validar ficha e criar Presell** valida o conteúdo estruturado obrigatório em `src/copy-ficha/copy-ficha-structured.mjs` antes de pedir confirmação e chamar `/api/presell/produce`. O produtor local verifica assets, template e ausência de arquivos finais antes de criar; depois da produção, mantenha as validações estruturais e contra a ficha, os relatórios e a proteção contra sobrescrita. Não exija `index.html`, `styles.css` ou `scripts.js` na validação prévia: são os arquivos gerados pela ação. `/?view=presell` é apenas um atalho compatível para a tela unificada. A extração da oferta fica em `src/copy-ficha/copy-ficha-domain.mjs`; a tela e a ação **Analisar oferta** ficam em `src/copy-ficha/copy-ficha-view.mjs`; a confirmação e chamada da API ficam em `src/presell/presell-service.mjs`; `presell-view.mjs` conserva somente os exports compatíveis e a view legada.
- Atualize os parâmetros de versão dos imports em `src/index.template.html` e `src/copy-ficha/copy-ficha-view.mjs` quando alterar módulos carregados no browser.
- O texto copiado de checkouts pode conter formatação Markdown, marcadores de lista, títulos enumerados e palavras adjacentes, por exemplo `Select QuantityBundle and Save!`. Normalize essa apresentação sem descartar conteúdo semântico; cubra o formato exato observado em `tests/copy-ficha-domain.test.mjs`.
- Para opções por quantidade, mantenha separado o preço unitário exibido, o total original exibido e o total promocional calculado. Não trate preço calculado como preço diretamente mostrado na página.
- Campos ausentes, repetidos ou inválidos na ficha estruturada devem continuar apontando o campo correspondente com `aria-invalid` e destaque visual. A ficha fornecida não depende da antiga geração de copy nem das confirmações do Ctrl+A que não sejam metadados obrigatórios.
- Ao ajustar o parser ou a validação visual, rode `node tests/copy-ficha-domain.test.mjs`, `node build.mjs`, `node tests/build.test.mjs` e depois toda a suíte.

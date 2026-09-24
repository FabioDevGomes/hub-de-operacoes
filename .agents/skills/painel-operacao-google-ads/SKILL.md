---
name: painel-operacao-google-ads
description: Desenvolver, diagnosticar, testar e manter este Hub local de operações de Google Ads. Use para alterações ou investigações do painel; não use para edição direta das planilhas operacionais ou dúvidas genéricas sobre anúncios.
---

# Engenharia do Hub de Operações

Esta é a fonte canônica do conhecimento técnico específico do repositório. A instalação global do Codex pode espelhar esta skill para uso, mas não é a fonte a editar nem a versão de referência.

## Regras essenciais

- Localize a raiz por `build.mjs`, `src/index.template.html` e `src/database.js`; não dependa de caminhos absolutos da máquina.
- Preserve dados locais reais. Não importe fixtures, limpe IndexedDB ou altere `data-local/` para testar.
- Nomes MCC completos identificam campanhas; a chave diária é `campanha_id + data`. Zero, ausente e inválido são estados diferentes.
- O manifesto D0 é parcial; D−1 pode fechar o mesmo dia e gerar conflitos financeiros. Não sobrescreva silenciosamente dados conflitantes.
- Não deduza pausa, suspensão, reprovação, GEO ou entrega pela falta de linha ou por um zero isolado. Use somente evidência explícita da fonte e as regras registradas.
- Ao criar uma view principal, use `src/view-registry.js` para rota, título, subtítulo e metadados.
- Use `apply_patch` para edição. Edite fontes canônicas, execute `node build.mjs` e rode toda a suíte.
- Validação visual deve usar o servidor local já aberto e apenas leitura da base existente; nunca introduza dados sintéticos nela.

## Roteamento das referências

- [Arquitetura e telas](references/architecture.md): estrutura, rotas, fontes canônicas e build.
- [Modelo e persistência](references/data-model.md): IndexedDB, schema da base, eventos e snapshots.
- [Importação MCC](references/mcc-import.md): CSV D−1/D0, captura estrutural direta D0 pela extensão, Preparador, ingestão de telemetria e integração com Controle Macro.
- A versão estável da extensão `extensions/mcc-d0-bridge` associa a grade por `essfield` e encaminha a captura ao receptor do Preparador no contexto `MAIN`; a gravação continua dependendo do clique explícito em “Atualizar base”. Os experimentos locais de texto/comparação continuam isolados e somente de leitura. Consulte [Importação MCC](references/mcc-import.md) e a própria documentação da extensão.
- Para rolagem, retorno de Glimpse e destaque de linha/controle nas listas de curadoria, siga o teste específico em [engineering-workflow.md](references/engineering-workflow.md) e use o módulo compartilhado `src/curadoria/list-focus.mjs`.
- Ao alterar ou diagnosticar o Controle Macro, confira também em `references/data-model.md` a precedência por campo entre planilha histórica e MCC, o fallback de D−1 e a atualização automática da tela.
- Para os princípios de domínio e limites do MVP, use a skill [observabilidade-decisoria](../observabilidade-decisoria/SKILL.md).
- A Observabilidade da Curadoria é outro domínio; consulte a seção homônima em [arquitetura](references/architecture.md), [modelo de persistência](references/data-model.md) e [workflow](references/engineering-workflow.md). Não confunda nem misture seus eventos com o Event Log operacional.
- Para workflow de testes, diagnóstico e segurança, use [engineering-workflow.md](references/engineering-workflow.md).

## Entrega

Resuma causa ou resultado, arquivos afetados, testes e validação visual. Diferencie fato confirmado de hipótese e indique qualquer ação necessária do usuário.

## Copy e Ficha

- O runtime do Gerador de Pre-Sell inicia subprocessos no PowerShell que hospeda o servidor local; prefira detectar o executável do processo atual. Use PSHOME/assembly ou PATH apenas como fallbacks e confirme que o diretório não está vazio antes de chamar Join-Path. Não presuma pwsh no PATH; cubra o contrato em tests/standalone-runtime.test.mjs.
- Em validadores PowerShell, não use PSScriptRoot em valor padrão dentro de param(); resolva caminhos relativos depois do bloco param(), pois o valor pode estar vazio durante a vinculação de parâmetros no Windows PowerShell.
- A fonte do parser fica em `src/copy-ficha/copy-ficha-domain.mjs`; a tela e a ação **Analisar e preencher** ficam em `src/copy-ficha/copy-ficha-view.mjs`. Atualize o parâmetro de versão dos imports dinâmicos em `src/index.template.html` e no próprio módulo ao alterar parsing carregado no browser.
- O texto copiado de checkouts pode conter formatação Markdown, marcadores de lista, títulos enumerados e palavras adjacentes, por exemplo `Select QuantityBundle and Save!`. Normalize essa apresentação sem descartar conteúdo semântico; cubra o formato exato observado em `tests/copy-ficha-domain.test.mjs`.
- Para opções por quantidade, mantenha separado o preço unitário exibido, o total original exibido e o total promocional calculado. Não trate preço calculado como preço diretamente mostrado na página.
- Campos que bloqueiam a geração da Copy e Ficha devem ser derivados das mesmas regras de geração, receber `aria-invalid` e o destaque visual pendente deve ser atualizado após análise, edição e tentativa de geração. Inclua todos os dados obrigatórios, confirmações, URLs e preço promocional de pacote.
- Ao ajustar o parser ou a validação visual, rode `node tests/copy-ficha-domain.test.mjs`, `node build.mjs`, `node tests/build.test.mjs` e depois toda a suíte.

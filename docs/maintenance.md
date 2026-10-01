# Manutenção gradual do Hub

## Antes de alterar

1. Leia a skill local `.agents/skills/painel-operacao-google-ads/SKILL.md` e as referências do domínio afetado.
2. Confira `git status --short` e preserve alterações preexistentes. Faça uma mudança de responsabilidade por vez.
3. Edite a fonte canônica, execute `node build.mjs` e depois `node --test` na raiz. Não há instalação de dependências necessária para essa suíte.
4. Para interface, confira a rota no servidor existente `http://127.0.0.1:8765/`. Não mude a origem nem introduza fixtures no perfil real.

## Onde mexer

| Mudança | Fonte | Verificação principal |
| --- | --- | --- |
| Rota, título e item ativo da SPA | `src/view-registry.js` | `tests/view-registry.test.mjs` |
| Menu, grupos e tipografia lateral | `src/sidebar-component.js`, `src/sidebar-component.css` | `tests/sidebar-component.test.mjs`, `tests/sidebar-layout.test.mjs` |
| Integração das telas e projeção da base | `src/index.template.html` | `tests/build.test.mjs` e testes do domínio |
| Mapa por Conta: filtros, agrupamentos e ordenação | `src/accounts/accounts-domain.mjs` | `tests/accounts-domain.test.mjs`, `tests/account-cpa-coverage.test.mjs` |
| Mapa por Conta: quadros, eventos e layout | `src/accounts/accounts-view.mjs`, `accounts.css` | `tests/accounts-view.test.mjs`, `tests/build.test.mjs` |
| Ficha fornecida e validação de campos | `src/copy-ficha/copy-ficha-structured.mjs`, `copy-ficha-view.mjs` | `tests/copy-ficha-structured.test.mjs`, `tests/copy-ficha-view.test.mjs` |
| Produção e proteção contra sobrescrita | `src/presell/`, `presell-engine/` | `tests/presell-template-identifiers.test.mjs`, `tests/standalone-runtime.test.mjs` |
| Persistência e importação MCC | `src/database.js` | `tests/database.test.mjs`, `tests/preparador-d0.test.mjs` |
| Preparador MCC (exceção atual de fonte) | `dist/preparador-MCC/index.html` | `tests/preparador-d0.test.mjs` |

`dist/index.html` e os demais módulos de `dist/` são gerados; não faça a mesma alteração manual em fonte e saída. O Preparador é a exceção acima, até uma etapa futura específica.

## Contratos atuais que os testes devem preservar

- O menu compartilhado usa a tipografia padronizada e somente uma entrada **Ficha e Presell**. `?view=presell` continua abrindo `?view=copy`, com `copyFichaNav` ativo; `presellNav` não é mais um item de navegação. O painel ainda conserva elementos ocultos de compatibilidade para wrappers antigos, até uma etapa futura de roteamento.
- Ficha e Presell não mostra geração de anúncios, perguntas/respostas ou download JSON. A ação única valida o texto estruturado (três ou quatro FAQs) antes de solicitar criação; falhas identificam o campo pendente. O servidor continua responsável pela confirmação, assets e não sobrescrita.
- Arquivos finais de Presell são criados pela produção, não exigidos na validação prévia.
- Zero observado, valor ausente e inválido são distintos. Nomes MCC completos e chaves campanha/data não podem mudar numa refatoração de interface.
- Nenhum teste deve limpar ou modificar IndexedDB, `data-local/` ou dados históricos reais. Fixtures devem ser sintéticas e isoladas em memória ou em pasta temporária.

## Padrão de separação incremental

Para uma tela extraída, mantenha regras puras em `*-domain.mjs`, DOM/eventos em `*-view.mjs`, estilos em CSS e um adaptador pequeno no painel para fornecer os dados já consolidados. O domínio não deve importar DOM, armazenamento ou servidor. Evite criar um framework novo ou misturar a extração com mudanças de regra de negócio.

Testes de domínio verificam resultados com dados sintéticos. Testes de integração verificam conexão, build e contratos de interface; não devem exigir que funções continuem fisicamente no HTML após uma extração. Antes e depois, compare filtros, seleção, ordenação, métricas e navegação no navegador.

## Piloto: Mapa por Conta (passo 2)

- `accounts-domain.mjs`: estado inicial, filtros, agrupamento produto/conta, KPIs, faixas/cobertura, seleção, ordenação e URL segura de domínio. Funções puras; não escrevem dados.
- `accounts-view.mjs`: markup, renderizadores pequenos por quadro e eventos locais. `mount({root, getSnapshot, format})` retorna `render()`. Os três filtros de situação compartilham um estado; o padrão é Ativas. Conta e situação definem as colunas de CPA; Produto limita somente as linhas.
- `accounts.css`: estilos existentes da tela, incluindo compactação, seleção e responsividade.
- `accountReportRows()` no painel conserva a consolidação histórica/D0, vendas e identificação de produto/conta/domínio. `accountReportSnapshot()` acrescenta identidade/data, CPA e dias sem impressão usando os parsers existentes. Este adaptador é somente leitura, não é um segundo banco.
- `renderAccountReport()` carrega o módulo uma vez, fornece o snapshot atual em cada renderização e atualiza o indicador de rolagem compartilhado. Rota e menu continuam no registro existente. A barra de rolagem continua no painel porque também atende a análise de CPA.
- Para mudar uma regra visual da tela, comece no módulo. Não volte a adicionar wrappers de `renderAccountReport` ou listeners de seus filtros ao HTML principal. Uma mudança de cálculo histórico deve ser tratada como outra tarefa, com testes e aprovação próprios.

Verificação recomendada: `node --test tests/accounts-domain.test.mjs tests/accounts-view.test.mjs tests/accounts-adapter.test.mjs tests/account-cpa-coverage.test.mjs`, build e suíte completa. No navegador, confira Ativas/Pausadas/Todas, conta/produto, seleção, ordenação, link de domínio, tamanho compacto e ida/volta pelo menu.

`tests/accounts-adapter.test.mjs` cobre também a seleção da análise CPA, que antes chamava o helper inline do Mapa. `cpaSelect()` agora conserva a implementação de seleção em seu próprio limite; não pode depender de um renderizador removido de outra tela. Os outros testes desse adaptador verificam histórico/D0 sem dupla contagem, ajustes provisórios e identidade/domínio sem escrita.

## Referência do passo 1

Em 01/10/2026, a suíte inicial tinha 98 testes, com quatro falhas de expectativas antigas: helper de sitelinks removido, ação separada de gerar ficha removida e duas execuções do teste que exigia `presellNav`. As verificações foram alinhadas ao comportamento atual, sem reintroduzir recursos removidos ou mudar dados.

# Arquitetura e telas

## Fontes canônicas

- `src/index.template.html`: painel principal, integração das views e interfaces.
- `src/view-registry.js`: IDs estáveis, query, título/subtítulo, IDs de seção/menu e habilitação das telas.
- `src/database.js`: schema compartilhado, importadores MCC/Excel, consolidação e persistência de domínio.
- `dist/preparador-MCC/index.html`: atualmente é a fonte editável do Preparador; o build não o gera.
- `src/curadoria/`: Radar, Lista de Gerente, E-commerce GM e Glimpse.
- `src/control-macro/`: domínio de agregação do Controle Macro e estilos próprios da tela.
- `src/meu-tempo/`, `src/presell/`, `src/asset-studio/`: módulos próprios.
- `dist/index.html` e a maioria de `dist/**`: saída gerada. Edite fontes e rode o build.

## Registro de telas

Uma view principal deve ser registrada em `src/view-registry.js`; mantenha `id`, `query`, `enabled`, `activeView`, IDs de seção/menu, título e subtítulo no registro. Renderizadores obtêm metadados por `PanelViews.definition()`, resolvem entrada por `resolveRoute()` e criam links por `urlFor()`. Não replique esses dados manualmente na navegação se o registro puder fornecê-los. Rotas desconhecidas voltam para Visão Geral.

O registro não é lugar para estado de filtros, dados de domínio, consultas IndexedDB, funções de renderização ou regras de negócio.

## Rotas centrais atuais

- `/`: Visão Geral / Diário do Produto.
- `/?view=tested`: Produtos Testados.
- `/?view=cpa`: Análise por Faixa de CPA.
- `/?view=accounts`: Mapa de Produtos por Conta.
- `/?view=macro`: Controle Macro, com resumo diário da operação.
- `/?view=observability`: Observabilidade Decisória Operacional.
- `/?view=time`: Meu Tempo.
- `/?view=copy`: Copy e Ficha.
- `/?view=presell`: Gerador de Pre-Sell.
- `/preparador-MCC/`: Preparador MCC.
- `/curadoria/`, `/curadoria/gerentes/`, `/curadoria/top-performance/`, `/curadoria/glimpse/`: módulos de curadoria.
- `/asset-studio/`: preparação local de assets.

## Grupos do menu lateral

- Operação: Visão geral, Preparador MCC e Controle Macro.
- Análises: CPA, Mapa por Conta e Observabilidade Decisória.
- Curadoria: Radar SpyHero, Lista de Gerente e E-commerce GM.
- Criação de ofertas: Copy e Ficha, Gerador de Pre-Sell e Asset Studio.
- Pessoal: Meu Tempo.
- Produtos: Produtos Testados e acesso ao Diário do Produto; a lista de campanhas permanece no painel principal.

O Controle Macro é uma tela principal registrada no `src/view-registry.js`. Sua lógica pura fica em `src/control-macro/domain.js`; a interface e persistência são integradas em `src/index.template.html`. A tela navega por meses completos (anterior, posterior e mês atual), abre sempre no mês atual e conserva a navegação manual enquanto permanece aberta. As alterações MCC recalculam as métricas agregadas ao salvar/recarregar a base. O Preparador MCC também publica `base-updated` pelo `BroadcastChannel('painel-campanhas')`, fazendo a tela aberta restaurar a base e recalcular sem nova importação do histórico. O arquivo histórico importado fica como `controle_macro_historico` na base existente, sem nova store ou migração de IndexedDB. A planilha prevalece campo a campo: MCC/D−1 só complementa cliques e vendas ausentes desde 13/09/2026; não substitui investimento, faturamento ou zeros explícitos. Consulte `references/data-model.md` para a regra integral e o tratamento de suspensões e vendas.

Para as próximas atualizações diárias, a política operacional é usar somente MCC D0/D−1, sem nova importação da planilha. O histórico legado permanece. Isso não modifica a precedência existente em datas sobrepostas; veja `references/data-model.md` antes de afirmar que MCC substituiu um valor histórico.

O Controle Macro também apresenta uma evolução com dois escopos: diário do mês selecionado e consolidado mensal desde abril de 2026. `src/control-macro/domain.js` expõe `dailyTrendBuckets()` e `monthlyTrendBuckets()` para preparar séries sem converter dados ausentes em zero; agregados incluem cobertura observada. O ROI mensal deve ser ponderado pela soma de faturamento menos investimento nos dias pareados, dividida pelo investimento pareado, e não por média de percentuais diários. A interface mantém Financeiro, ROI, Cliques e Vendas em visualizações próprias e inclui Desempenho, que agrupa ROI, cliques e vendas num único painel com três faixas alinhadas no mesmo eixo de tempo e escala independente por métrica; o tooltip de vendas informa totais oficiais e provisórios. Preserve lacunas por falta de dados e a cobertura dos pontos nos tooltips. `tests/control-macro.test.mjs` valida os agregados; `tests/build.test.mjs` verifica controles e integração da visualização.

## Build e servidor

Na raiz, `node build.mjs` gera o painel. O uso operacional é `iniciar-painel.cmd`, servido em `http://127.0.0.1:8765/`. Não selecione outra porta automaticamente: o IndexedDB é isolado por origem. O build padrão deve continuar sem manifesto operacional real.

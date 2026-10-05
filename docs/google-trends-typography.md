# Tipografia compartilhada de Google Trends

Padrão definido em 05/10/2026 para aumentar discretamente a legibilidade da ficha SmartAdv e manter a mesma escala em todas as fichas de Google Trends. A composição continua baseada na E-commerce GM; esta alteração não muda cores, dados nem regras de avaliação.

## Escala

Valores em `rem`, respeitando a preferência de fonte do navegador. Equivalências abaixo consideram raiz de 16px.

| Conteúdo | Tamanho | Equivalência |
| --- | --- | --- |
| Texto-base do painel | `.9rem` | 14,4px |
| Rótulos, descrições, campos, botões, candidatas e histórico | `.875rem` | 14px |
| Títulos das seções | `1.125rem` | 18px |
| Etiqueta auxiliar de país manual | `.75rem` | 12px |

Família: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`, sem download obrigatório de fonte. Campos e botões herdam essa família, evitando a fonte padrão diferente dos controles nativos. Entrelinha de 1,45 no conteúdo e 1,35 nos títulos. O cabeçalho da oferta conserva a escala existente de 1,2rem e o eyebrow de .72rem.

## Implementação e escopo

A fonte única é `src/curadoria/trends-typography.css`, importada por `src/curadoria/trends-sheet.css`. Tokens `--trends-font-body`, `--trends-font-detail`, `--trends-font-heading` e `--trends-font-tag` pertencem ao painel, não ao tema global.

Consumidores: SmartAdv, E-commerce GM, Hot Offers MS e Top Offers CB usam `#offerSheet [data-panel="trends"]`; Lista de Gerente usa `#managerTrendsPanel`; Radar SpyHero usa `#trendsSheetPanel`. Navegação e retorno adotam 14px somente enquanto o painel Trends está ativo. Listagens, Google Imagens, Glimpse, importações e demais abas não recebem a nova escala.

Preserve diferenças de cada plataforma: Radar tem colagens/validação, Lista de Gerente tem contexto de produto agrupado e as ofertas mantêm seus países, links e históricos próprios. Não crie recursos nem unifique armazenamento para igualar o visual.

## Responsividade e validação

Botões centralizam texto e ícones e mantêm ao menos 36px de altura; resultados têm 40px e podem quebrar o texto. Campos têm ao menos 38px. Conserve os breakpoints e a rolagem horizontal local dos resultados em telas estreitas, sem encolher a fonte para encaixar sete opções.

Ao alterar a escala, revise os seis consumidores e atualize a versão da folha compartilhada nas seis páginas. O build publica o novo arquivo automaticamente. Execute `tests/curation-trends-typography.test.mjs`, testes das views de Trends, `node build.mjs` e `node --test`. No navegador, compare fontes computadas e alinhamento em desktop/tela estreita, sem gravar candidatas, avaliações ou fixtures no perfil real.

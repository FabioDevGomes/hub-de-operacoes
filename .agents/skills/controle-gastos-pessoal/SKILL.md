---
name: controle-gastos-pessoal
description: Implementar, diagnosticar e manter a tela local de Controle de gastos pessoais do Hub. Use para orçamento, realizado, reserva, dívidas, visões mensal e consolidada, sincronização e persistência; não use para Faturamento ou MCC.
---

# Controle de gastos pessoais

Esta skill cobre a tela `/?view=personal-finance`, um domínio pessoal local distinto da operação de anúncios, do Controle Macro e do Faturamento. Preserve os lançamentos já existentes e diferencie regra da interface, persistência e dado real.

## Fontes e roteamento

- `src/personal-finance/personal-finance-domain.mjs`: cálculos e regras puras.
- `src/personal-finance/personal-finance-storage.mjs`: IndexedDB, snapshots, backup e persistência.
- `src/personal-finance/personal-finance-sync.mjs`: aviso entre abas.
- `src/personal-finance/personal-finance-view.mjs` e `.css`: interface.
- Para toda alteração de comportamento, cálculo ou diagnóstico, leia [regras de domínio](references/regras-de-dominio.md).
- Para stores, versão, backup e migração, leia a seção Controle de gastos em [modelo e persistência](../painel-operacao-google-ads/references/data-model.md).
- Use o [workflow do painel](../painel-operacao-google-ads/references/engineering-workflow.md) para build geral, rota, menu e segurança.

## Procedimento

1. Localize o projeto por `build.mjs`, `src/index.template.html` e `src/database.js`; não crie uma cópia alternativa.
2. Separe diagnóstico de implementação. Para diagnóstico, siga a entrada mensal → persistência → cálculo por item/moeda → agregação global → renderização antes de editar.
3. Edite `src/`, preserve mudanças não relacionadas, rode `node build.mjs` e toda a suíte `tests/*.test.mjs`.
4. Para mudanças visuais ou dependentes do IndexedDB, valide `/?view=personal-finance` em `http://127.0.0.1:8765/`; não troque a origem/porta.
5. Use objetos sintéticos em testes isolados. Não importe planilhas/arquivos pessoais, grave fixtures no perfil ativo, leia/exporte valores financeiros reais ou compartilhe-os sem autorização explícita.
6. A tela abre no mês atual em Consolidado com 8 meses; o mínimo de 8 e o retorno ao mês atual fazem parte do contrato visual testado.

## Limites de domínio

- Não integrar este domínio ao Faturamento, à MCC, ao Controle Macro ou a bancos/cartões externos.
- BRL e USD são saldos independentes; não converter nem somar entre moedas.
- Ausência (`null`) e zero explícito são estados diferentes.
- Marcar uma despesa como paga lança o realizado naquela linha; não debita a disponibilidade global da reserva.

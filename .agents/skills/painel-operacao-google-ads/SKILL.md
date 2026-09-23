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
- [Importação MCC](references/mcc-import.md): CSV D−1/D0, Preparador, ingestão de telemetria e integração com Controle Macro.
- Ao alterar ou diagnosticar o Controle Macro, confira também em `references/data-model.md` a precedência por campo entre planilha histórica e MCC, o fallback de D−1 e a atualização automática da tela.
- Para os princípios de domínio e limites do MVP, use a skill [observabilidade-decisoria](../observabilidade-decisoria/SKILL.md).
- Para workflow de testes, diagnóstico e segurança, use [engineering-workflow.md](references/engineering-workflow.md).

## Entrega

Resuma causa ou resultado, arquivos afetados, testes e validação visual. Diferencie fato confirmado de hipótese e indique qualquer ação necessária do usuário.

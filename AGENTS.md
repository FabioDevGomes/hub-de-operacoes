# Manutenção deste repositório

- Antes de editar, leia `.agents/skills/painel-operacao-google-ads/SKILL.md` (skill canônica local), `docs/maintenance.md` e as referências do domínio afetado. Não use a cópia global desatualizada como fonte de regras do Hub.
- Preserve alterações preexistentes: confira `git status --short`. Não faça uma refatoração de outro domínio junto com uma correção solicitada.
- Edite `src/` e execute `node build.mjs`, depois `node --test`. `dist/preparador-MCC/index.html` é a exceção atual de fonte editável; não migre esse arquivo sem uma tarefa específica.
- Para Mapa por Conta, use `src/accounts/`: domínio puro, DOM/eventos e CSS separados. O HTML principal fornece somente o adaptador de leitura da base existente. Não replique listeners/filtros ou acrescente wrappers de renderização ao painel.
- Rotas/metadados pertencem a `src/view-registry.js`; menu compartilhado e tipografia a `src/sidebar-component.js`/`.css`.
- Não altere IndexedDB, schema, IDs, nomes MCC, dados históricos ou `data-local/` numa refatoração de interface. Zero, ausente e inválido são distintos. Testes usam dados sintéticos em memória ou em diretórios temporários, nunca o perfil real.
- Valide UI no servidor já existente em `http://127.0.0.1:8765/`, sem importar fixtures ou mudar a origem. Nenhum dado privado, seed operacional, credencial ou exportação deve entrar em código, testes ou commits.

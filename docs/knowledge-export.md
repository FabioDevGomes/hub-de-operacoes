# Exportação do pacote de conhecimento

O botão **Exportar conhecimento** da Visão geral monta um ZIP privado para portabilidade das instruções e do conhecimento técnico do Hub. A tela consulta apenas o inventário permitido para mostrar uma prévia; o arquivo ZIP só é gerado depois da confirmação do usuário.

## Conteúdo permitido

- As sete skills pessoais selecionadas em `C:\Users\<perfil>\.codex\skills`, incluindo seus `SKILL.md`, referências e scripts compatíveis.
- As três skills de projeto em `.agents/skills`.
- `AGENTS.md`, `README.md`, `docs/maintenance.md` e este documento.
- Fontes estruturais do banco e persistência: `src/database.js`, os dois módulos compartilhados em `src/storage/` e os arquivos `*-storage.mjs` do projeto.
- Um `README.md` e um `MANIFEST.json` gerados para descrever o pacote.

O escopo das skills é uma lista nominal mantida em `scripts/knowledge-export.ps1`. Arquivos precisam ter extensão permitida; arquivos JSON de origem nunca entram no ZIP. Diretórios ocultos, caches, `.system`, `data-local`, `dist`, `node_modules` e diretórios de build são ignorados. Links simbólicos/reparse points são ignorados; arquivos acima de 5 MiB ou um pacote estimado acima de 50 MiB tornam a exportação indisponível. O `MANIFEST.json` do pacote é gerado pelo exportador e contém apenas nomes e grupos dos arquivos incluídos.

## Exclusões e privacidade

O exportador não abre IndexedDB, não lê os registros de campanhas, vendas, finanças ou diário, e não inclui bancos locais nem backups de dados. Também não inclui histórico Git, artefatos publicados em `dist/`, caches ou credenciais. Os dados operacionais continuam sendo exportados pelo botão **Baixar backup completo JSON**.

O ZIP é construído na memória pelo serviço local; nenhuma cópia temporária do arquivo ou dos registros é gravada. As rotas de prévia e download aceitam apenas `GET` com `Host` loopback esperado e cabeçalho próprio do painel; uma origem explícita diferente é recusada. Não há CORS habilitado para estas rotas.

Skills e documentação podem conter caminhos locais ou detalhes do ambiente. O pacote é privado; antes de compartilhá-lo com outro modelo, serviço ou pessoa, revise os arquivos e adapte scripts e metadados conforme a ferramenta de destino. Arquivos `agents/openai.yaml` são específicos da integração OpenAI.

## Responsabilidades e validação

| Responsabilidade | Fonte |
| --- | --- |
| Lista allowlist, exclusões, limites e geração em memória | `scripts/knowledge-export.ps1` |
| Rotas loopback e proteção das requisições | `scripts/serve-panel.ps1` |
| Prévia, acessibilidade e download | `src/overview/knowledge-export-view.js`, `knowledge-export.css`, `src/index.template.html` |
| Interface da Visão geral | `src/overview/view.js`, `overview.css` |
| Testes | `tests/knowledge-export.test.mjs`, `tests/build.test.mjs`, `tests/overview-view.test.mjs` |

Mudanças de allowlist devem atualizar este documento e o teste de exclusões. Teste com diretórios e arquivos sintéticos; não use nem imprima conteúdo de campanhas ou do banco local. Faça o build e rode `node --test`; a verificação HTTP deve usar o loopback e não acessar rotas que escrevam na base.

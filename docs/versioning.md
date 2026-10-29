# Versionamento do Hub

## Fonte única e apresentação

`VERSION` contém a versão estável MAJOR.MINOR.PATCH do sistema. O marco inicial
`1.0.0` identifica o sistema existente em 09/10/2026; não inventa versões anteriores.
`CHANGELOG.md` registra as entregas, mais recentes primeiro, e o README destaca a
versão atual na página principal do repositório no GitHub.

O build valida a concordância dos três documentos antes de gerar a distribuição.
Todas as páginas completas recebem metadado, CSS e script versionados. Templates
parciais não recebem tags extras. Na interface, o selo fica junto ao título; na aba,
`Hub vX.Y.Z · Nome da tela` preserva o contexto inclusive após navegação, mudança
de campanha ou abertura do Glimpse. Análises em iframe não repetem o selo do host.
O selo é informativo, sem clique, borda ou significado de estado de negócio.

Versão do Hub, versão da extensão MCC, versões de cache dos módulos e schema do
IndexedDB são conceitos separados. Alterar VERSION não migra bancos, não muda
chaves, origem/porta nem altera a extensão. A versão exibida identifica o código
distribuído: não é data de captura, horário de push nem hash de commit.

## Preparar uma entrega

### Regra obrigatória: uma versão por alteração entregue

Todo pedido concluído que altere código, interface, testes, configuração ou
documentação deve aumentar a versão **antes de entregar o resultado ao usuário**,
mesmo para um ajuste pequeno. O incremento mínimo é um `patch`; novas
funcionalidades compatíveis usam `minor`, e incompatibilidades autorizadas usam
`major`. Sempre registre a alteração no CHANGELOG e atualize README e dist.

Não espere o usuário fazer commit/push para avançar a versão. Não junte pedidos
já concluídos em uma versão futura: duas alterações entregues separadamente
recebem duas versões, mesmo sem push entre elas. Exemplo: um ajuste visual em
`1.0.1`, seguido de uma correção documental, passa para `1.0.2`.

Vários arquivos e reparos durante a validação do mesmo pedido não exigem versões
adicionais: conclua o pedido com um único incremento. Builds, capturas MCC,
repetição de push e análises sem edição não geram versões. Alterações somente de
documentação também exigem patch e rebuild dos metadados de apresentação, mas
não autorizam abrir/gravar bancos ou criar testes fictícios de comportamento.

1. Implemente e valide a mudança preservando as alterações paralelas.
2. Avance a versão **obrigatoriamente para cada alteração entregue**, no mínimo
   um patch, não a cada arquivo, build, captura ou push:
   - `patch`: correção ou ajuste compatível, inclusive visual/documental.
   - `minor`: funcionalidade nova compatível.
   - `major`: mudança incompatível, previamente autorizada.
3. Execute, por exemplo:

   ```powershell
   node scripts/set-version.mjs patch "Corrige a apresentação dos indicadores"
   node build.mjs
   node --test --test-skip-pattern='privacy-boundary' --test-concurrency=4
   ```

   O comando também aceita uma versão explícita maior, como `1.1.0`. Exige uma
   descrição e atualiza VERSION, o destaque no README e a entrada do CHANGELOG
   com a data de São Paulo. Não altera Git nem dados locais. Revise o texto
   gerado; não inclua informações privadas no histórico.
4. Confira o selo/título no servidor local e revise os arquivos gerados em dist.
5. Git fica fora do fluxo normal de implementação e validação. Stage, commit,
   tag ou push só devem ocorrer mediante pedido explícito do usuário; este
   procedimento não exige verificações Git.

Enviar novamente o mesmo commit não cria uma versão nova: o conteúdo publicado
continua igual. O README/CHANGELOG só aparecem atualizados no GitHub depois que
o commit com essas alterações for enviado. O build é determinístico quanto à
versão: não a incrementa e não insere timestamps/hash de um checkout ainda sujo.

## Identificação opcional no Git

Depois de revisar e criar o commit da entrega, uma tag anotada `vX.Y.Z` pode
marcar exatamente aquele commit. Exemplo para o marco inicial:

```powershell
git tag -a v1.0.0 -m "Hub v1.0.0"
git push origin v1.0.0
```

Esses comandos são opcionais e manuais; execute somente quando o commit correto
já estiver criado e conferido. Uma tag existente não deve ser movida/reutilizada.
Nenhuma tag, Release ou publicação remota é criada pelo sistema.

## Responsáveis e regressões

- `scripts/system-version.mjs`: SemVer, coerência documental e decoração das páginas no build.
- `scripts/set-version.mjs`: atualização explícita da entrega, sem operações Git.
- `src/system-version.js` / `.css`: título, selo e aviso de atualização compartilhados; “Atualizar somente esta tela” recarrega apenas a aba atual, enquanto “Atualizar todas as telas” propaga a confirmação por `BroadcastChannel` e `localStorage` para recarregar abas abertas e abas suspensas ao voltarem ao foco.
- `build.mjs`: validação antecipada e publicação em todas as páginas completas.
- `tests/system-version.test.mjs`: versões inválidas/repetidas, divergências,
  incremento, documentação, publicação, navegação sem duplicar prefixo e iframe.

Novas páginas completas devem passar pela mesma publicação no build. Não copie
números de versão para CSS, JS ou HTML fonte. Não remova o destaque ao extrair
ou refatorar uma tela. Falha de coerência documental deve bloquear o build,
nunca ser silenciosamente corrigida por uma leitura/gravação no navegador.

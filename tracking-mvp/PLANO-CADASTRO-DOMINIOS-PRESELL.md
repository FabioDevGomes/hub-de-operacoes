# Plano — cadastro local de domínios de pre-sell

**Estado:** primeira implementação local em 21/10/2026; endpoint, migração e integração inicial com Hub estão no pacote de staging, ainda não publicados nem testados na Hostinger.

## Objetivo

Facilitar a autorização de uma nova pre-sell sem editar manualmente uma configuração privada na Hostinger. Após uma instalação inicial, o Hub envia o domínio a uma API administrativa autenticada no servidor; a API altera apenas dados da allowlist. O usuário não precisará subir arquivos a cada novo domínio.

## Fatos do coletor atual

- `public/track.js` envia eventos ao endpoint já indicado no atributo `data-endpoint`; `data-track-outbound` registra o clique e `data-track-clickbank` acrescenta `extclid` ao HopLink.
- `public/collect.php` valida a origem HTTP `Origin` contra `allowed_origins` e também valida o hostname HTTPS em `page_url` contra `allowed_page_hosts`. A allowlist é exata; não há liberação automática de domínios novos ou subdomínios `www`.
- A configuração privada `tracking-config.php` não está no workspace. Só há um exemplo, e não se deve copiar credenciais ou presumir que esse exemplo reflete o arquivo privado publicado.
- O script pode continuar hospedado em `track.travenzo.shop` e apontar ao mesmo `collect.php`; a pre-sell em outro domínio precisa estar autorizada no coletor e usar HTTPS.

## Experiência desejada no Hub

1. Em **Tracking → Domínios de pre-sell**, informar o domínio HTTPS da página. A tela normaliza o hostname, mostra a origem completa que será liberada e permite adicionar `www` como variante separada, se realmente usada.
2. A validação rejeita URLs com credenciais, caminhos, query/hash inesperados, protocolo HTTP, IPs, curingas e entradas inválidas. Inserir o mesmo domínio novamente é idempotente.
3. Ao salvar, o Hub envia apenas o domínio normalizado ao endpoint HTTPS de administração. A tela não lê nem exibe tokens, senhas, dados de vendas ou o conteúdo de `tracking-config.php`.
4. A API valida autenticação, origem do Hub e o domínio; em seguida faz uma inserção idempotente numa tabela dedicada do banco. Ela não reescreve PHP, JSON de configuração nem arquivos do servidor.
5. O coletor consulta a allowlist legada em `tracking-config.php` junto com os registros da tabela. Assim, os domínios atuais continuam funcionando e o novo fica ativo após a resposta de sucesso da API, sem novo upload.

## API e segurança propostas

A API de cadastro será **remota**, no servidor de tracking, porque precisa persistir a permissão no mesmo ambiente que executa `collect.php`. Não deve alterar `tracking-config.php`: esse arquivo contém credenciais e não existe no workspace. A API grava somente numa tabela dedicada, com schema aditivo. Haverá um deploy inicial dos endpoints e do coletor, além de uma migração SQL; depois, cadastrar outro domínio será apenas uma requisição de dados.

Contrato implementado localmente:

- `GET https://track.travenzo.shop/tracking-domains.php` — lista domínios dinâmicos autorizados, sem dados sensíveis.
- `POST https://track.travenzo.shop/tracking-domains.php` — valida e adiciona um hostname HTTPS e, opcionalmente, `www`; duplicatas são idempotentes.

Autenticação usa um **token administrativo separado** do token de leitura/download do Hub e do token ClickBank. O Hub gera um token criptográfico de 256 bits, baixa `tracking-domain-admin-config.php` e mantém o token somente em memória na aba; o usuário envia esse arquivo para a pasta privada do `tracking-config.php`, fora de `public_html`. A tela transmite o segredo apenas no cabeçalho `Authorization`, sobre HTTPS. CORS restrito à origem local do Hub é uma camada adicional, não substitui o token. A API não retorna configuração privada, conteúdo de credenciais ou dados de vendas. A allowlist não usa wildcard: cada origem e hostname é explícito. A primeira versão é somente aditiva; remoções exigem fluxo separado e confirmação, pois podem interromper uma pre-sell existente.

### Implantação inicial e operação contínua

- **Uma vez:** enviar os arquivos PHP do pacote `deploy/staging/tracking-domain-allowlist/`, fazer backup do `collect.php`, executar a migração SQL aditiva e baixar/subir o arquivo de token administrativo privado. Fazer backup do banco antes da migração.
- **Depois:** no Hub, adicionar o domínio com o token de gestão; o endpoint grava a permissão, e o coletor passa a aceitá-la sem upload nem alteração de arquivos.
- Se o endpoint ainda não estiver instalado/configurado, a tela deve informar que o gerenciamento não está disponível, sem fingir que o domínio foi liberado.

## Critérios de aceite

- O domínio é normalizado para hostname em minúsculas e origens HTTPS sem barra final; `www` só entra quando selecionado explicitamente.
- Domínio repetido é idempotente; entradas malformadas, HTTP, curingas e hosts não permitidos são rejeitados.
- A migração é aditiva: cria somente a nova tabela e não altera ou apaga dados existentes.
- Domínios atuais liberados pela configuração legada continuam aceitos, inclusive durante indisponibilidade da nova tabela; novos cadastros falham com segurança se o banco/API estiver indisponível.
- Um host permitido na tabela passa; host ausente continua recebendo `403 origin_not_allowed` ou erro de evento inválido.
- A interface diferencia **salvo no servidor** de **erro/indisponibilidade**, sem alegar sucesso antes de resposta válida.
- Testes locais cobrem origem/hostname exatos, `www`, entradas malformadas, autenticação separada, métodos permitidos, pacote e resolução do serviço privado. A validação real no servidor ainda depende do upload manual, da migração e de um cadastro de teste.

## Fora do escopo desta proposta

- Alterar automaticamente arquivos de configuração ou fazer deploy de código pela API.
- Colocar `tracking-config.php`, tokens ou credenciais na UI, no manifesto, no artefato de domínio ou em respostas HTTP.
- Alterar a URL ou o protocolo de INS v8 da ClickBank.
- Alterar a semântica dos atributos `data-track-outbound` e `data-track-clickbank`.

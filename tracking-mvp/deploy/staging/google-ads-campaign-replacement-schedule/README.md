# Google Ads — correção da substituição por variante B

Pacote incremental para corrigir a agenda da variante B e conservar o diagnóstico da API na operação **Pausar e duplicar como B**. A interface local do Hub e o serviço privado precisam estar atualizados.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local que contém o arquivo PHP:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-schedule\hostinger-private-tools
```

- `google-ads-campaign-duplication-service.php` — versão atualizada do serviço privado já carregado pelo endpoint de ações publicado anteriormente.

Faça backup desse arquivo no servidor e substitua somente ele. Não envie o endpoint de ações, wrapper público, configurações privadas, credenciais ou outros arquivos. Não há alteração SQL.

## O que muda

- A campanha B começa na data corrente do fuso da conta Google Ads. O fuso vem de `customer.time_zone` na consulta já feita para ler a campanha.
- Uma data final da campanha original só é copiada quando ainda está no futuro. Se já passou ou é hoje, a variante B fica sem data final definida.
- A data de início e a data final, quando preservada, aparecem na confirmação do Hub antes da execução.
- Uma mudança de data local da conta entre prévia e confirmação invalida a prévia, sem enviar a mutação.
- A cópia em lote não muda seu comportamento de agenda.
- O fluxo continua criando a B ativa e pausando a original em uma chamada atômica com `partialFailure: false`.

## Publicação e conferência

1. Faça backup de `google-ads-campaign-duplication-service.php` no destino indicado.
2. Envie o arquivo desta pasta para substituir esse mesmo arquivo no servidor.
3. Atualize o Hub local para a versão que acompanha este pacote.
4. Na ficha da campanha, clique **Pausar e duplicar como B** e revise nome, CPA, orçamento, agenda e recursos na confirmação.
5. A confirmação ainda executa uma mutação real. Só confirme quando estiver pronto para iniciar a variante B e pausar a original.

O pacote está apenas no workspace; não foi enviado nem validado no servidor. Nenhuma consulta ou alteração foi executada em conta Google Ads durante a preparação.

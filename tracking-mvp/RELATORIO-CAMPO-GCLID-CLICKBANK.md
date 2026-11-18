# Relatório complementar — GCLID nos campos de rastreamento da ClickBank

**Data:** 18/10/2026
**Escopo:** registrar as descobertas feitas ao localizar o GCLID de uma venda nos relatórios da integração externa de tracking e da ClickBank, distinguindo-o de `Extclid` e do `Tracking ID` (TID). Este documento complementa `RELATORIO-INVESTIGACAO-DUPLICIDADE-CLICKBANK.md`; não altera a configuração nem o código do servidor da Hostinger.

## Conclusão executiva

O GCLID procurado apareceu no relatório de transações da ClickBank, na coluna **Aff Sub 1**. O campo **Extclid** da mesma investigação continha um valor com prefixo `ftsession_`, que é diferente do GCLID; o **Tracking ID** (TID) apareceu vazio (`-`) no CSV exportado anteriormente. Portanto, esses três campos não devem ser tratados como sinônimos.

O valor de **Aff Sub 1** mostrado na tela da ClickBank tem o mesmo início e a mesma sequência visível do GCLID identificado no detalhe da integração externa de tracking. Como a captura da tabela corta o final do valor e não mostra a referência completa da transação, a confirmação final deve ser feita com o CSV completo e a referência da mesma venda. Não se deve copiar o texto truncado da captura.

## O que foi observado

| Fonte/tela | Campo | Observação | Leitura |
|---|---|---|---|
| Detalhe da venda na integração externa de tracking | `Click ID`, identificado como `gclid` | Mostra o identificador de clique associado à venda. O valor completo foi informado na conversa, mas é omitido aqui. | É a referência de GCLID a comparar. |
| Exportação anterior da ClickBank | `Tracking Id` | Valor `-`; a exportação não tinha uma coluna explícita `GCLID`. | TID ausente nessa exportação; não prova que os demais parâmetros não estejam em outra visualização. |
| Relatório de transações da ClickBank | `Extclid` | Contém um identificador iniciado por `ftsession_`. | É um identificador externo diferente do GCLID apresentado pela integração externa. A origem exata desse valor não foi confirmada apenas pela captura. |
| Relatório de transações da ClickBank, captura posterior | `Aff Sub 1` | Contém uma string longa que começa e prossegue como o GCLID da integração externa; o final fica cortado na tela. | A evidência aponta que o GCLID foi armazenado em `Aff Sub 1` nessa transação. É preciso exportar o valor integral para comparação literal. |

Os identificadores completos, números de recibo/pedido e valores financeiros foram deliberadamente omitidos deste relatório.

## Distinção dos campos

- **GCLID:** identificador gerado pelo Google Ads com a marcação automática e acrescentado à URL de destino após um clique real no anúncio. Não é criado pela ClickBank.
- **Aff Sub 1:** parâmetro de rastreamento de afiliado que, nesta captura, contém uma string que corresponde visualmente ao GCLID da integração externa. Embora tenha funcionado como local de armazenamento para o registro observado, a ClickBank classifica `aff_sub1` como parâmetro para dados não exclusivos.
- **Extclid:** parâmetro da ClickBank destinado a um identificador externo de clique. Na captura analisada, seu valor `ftsession_...` não é o GCLID comparado.
- **Tracking ID / TID:** código de rastreamento do HopLink. No CSV anterior, estava vazio. Não equivale automaticamente a GCLID, `Aff Sub 1` ou `Extclid`.

A documentação da ClickBank descreve `extclid` como identificador externo/parceiro e lista `aff_sub1` entre os parâmetros de dados não exclusivos. Ela também informa que parâmetros únicos são voltados a dados de clique/sessão e ficam disponíveis em relatórios detalhados e integrações. Por isso, a presença do GCLID em `Aff Sub 1` é um fato observado para este registro, mas não deve ser convertida automaticamente em padrão técnico definitivo para alto volume sem validar os limites e o comportamento da conta.

## Como confirmar o valor integral na ClickBank

1. Acesse a conta principal (Master) e abra **Reporting → Transactions**.
2. Selecione a conta afiliada e o período que inclui a venda; aplique o filtro.
3. Na linha correspondente, role horizontalmente até **Aff Sub 1**.
4. Baixe/exporte o relatório para obter o conteúdo integral, pois a célula na captura está visualmente cortada.
5. Compare o texto completo de **Aff Sub 1** com o valor do campo `Click ID (gclid)` na integração externa de tracking, caractere por caractere, confirmando que ambos se referem à mesma transação.

O valor destinado à coluna **Google Click ID/GCLID** de um CSV manual é o GCLID integral, não o valor `ftsession_...` de `Extclid`. O restante do CSV — nome exato da ação de conversão, horário, valor e moeda — precisa ser validado separadamente conforme o modelo de importação da conta Google Ads.

## Impacto na implementação hospedada na Hostinger

- A descoberta não exige alterar `track.js`/`collect.php` nem o receptor atual de macros para começar a especificar a captura de vendas por INS v8.
- A decisão atual é adicionar, no futuro, um **receptor INS v8 separado** para vendas futuras, sem substituir a URL da integração externa. O contrato de dados está em [CONTRATO-DADOS-VENDAS-INS-V8.md](CONTRATO-DADOS-VENDAS-INS-V8.md); ele mantém GCLID, `extclid`, `Aff Sub 1`, `commonTrackingParameters.clickId` e TID distintos e define a associação exata antes de tornar uma venda elegível ao CSV.
- Para esta transação observada, **Aff Sub 1** continua sendo a evidência visual do GCLID, mas a correspondência integral ainda não foi confirmada. Não se deve assumir que `Extclid` ou TID seja GCLID.
- A venda futura será registrada com produtos/itens e comissão, e o CSV usará a comissão. Esses recursos ainda dependem de implementar o receptor v8, persistência e integração ao Hub; os dados deste relatório não alteram retroativamente registros existentes.
- Antes de alterar os parâmetros dos HopLinks ou o contrato técnico do servidor, é necessário verificar como a página/integração externa está preenchendo `Aff Sub 1` e `Extclid`, e validar a exportação integral em um registro correspondente. Nenhum deploy ou alteração na Hostinger foi feito para este relatório.

## Fatos, inferências e pendências

### Fatos observados

- A tabela da ClickBank tem uma coluna **Aff Sub 1** com uma string iniciada por `Cj0KC...` compatível visualmente com o GCLID informado pela integração externa.
- A coluna **Extclid** mostra um valor diferente, iniciado por `ftsession_`.
- A exportação anterior tinha `Tracking Id = -` e não expunha uma coluna explícita `GCLID`.
- O recorte da captura de **Aff Sub 1** não mostra o valor inteiro.

### Inferências

- O dado de GCLID parece ter sido carregado à ClickBank em `Aff Sub 1` nessa transação.
- O valor `ftsession_...` provavelmente é algum identificador de sessão externo; a fonte exata não foi verificada e não é necessária para distingui-lo do GCLID.

### Pendências para fechar a confirmação literal

1. Baixar o relatório da ClickBank e confirmar o valor completo de `Aff Sub 1`.
2. Comparar o valor completo com o campo GCLID da integração externa, vinculando ambos pela mesma referência de transação e data.
3. Para uso futuro em escala, decidir se os parâmetros de link devem ser padronizados para um campo ClickBank destinado a identificador único de clique, sem alterar a configuração atual antes de um teste controlado.

## Referências

- [Google Ads — Definição de marcação automática](https://support.google.com/google-ads/answer/1752125?hl=pt-BR): explica que a marcação automática acrescenta GCLID à URL após o clique.
- [ClickBank — Affiliate Tracking Parameters](https://support.clickbank.com/en/articles/10535262-affiliate-tracking-parameters): descreve `extclid`, os parâmetros `aff_sub*` e a disponibilidade de dados nos relatórios detalhados.
- [ClickBank — Transaction Reporting](https://support.clickbank.com/en/articles/10535320-transaction-reporting-on-clickbank): descreve o relatório de transações, o campo Tracking ID e o download.
- [ClickBank — Tracking Integration: Google Ads](https://support.clickbank.com/en/articles/10535368-tracking-integration-google-ads): documenta o repasse do GCLID para os links ClickBank na integração nativa.

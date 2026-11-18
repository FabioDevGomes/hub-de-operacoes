# Google Ads — compatibilidade de datas da variante B

Pacote incremental para corrigir a prévia de **Pausar e duplicar como B** com a Google Ads API v26. A interface local deve estar na versão Hub v1.320.5 ou posterior.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-v26-date-fields\hostinger-private-tools
```

- `google-ads-campaign-duplication-service.php` — serviço privado atualizado, já carregado pelo endpoint de ações existente.

Faça backup do arquivo atual no servidor e substitua somente esse arquivo. Não envie README, endpoint, wrapper público, configurações privadas, credenciais ou outros arquivos. Não há SQL nem alteração de configuração.

## Correção

O serviço usa a API v26, mas ainda selecionava `campaign.start_date` e `campaign.end_date`. O Google removeu esses campos date-only na v23 e introduziu `campaign.start_date_time` e `campaign.end_date_time`; por isso, a prévia falhava com `queryError.UNRECOGNIZED_FIELD` antes da mutação. O serviço agora lê os campos de data e hora atuais e cria a variante usando `startDateTime`/`endDateTime`.

A variante B continua iniciando hoje no fuso da conta e preservando somente uma data final futura. A cópia do fluxo em lote também usa os campos atuais sem mudar sua regra de agenda. O fluxo ainda exige confirmação explícita para criar a B ativa e pausar a original numa mutação atômica.

## Publicação e conferência

1. Atualize o Hub local para v1.320.5, gerado em `dist/` pelo build do projeto.
2. Faça backup do `google-ads-campaign-duplication-service.php` no destino indicado.
3. Envie o arquivo desta pasta para substituir o mesmo arquivo no servidor.
4. Reabra o Diário da campanha e clique **Pausar e duplicar como B**. A prévia deve concluir a leitura e a validação `validateOnly`; ela não cria nem pausa campanha.
5. Revise a confirmação com atenção. Só confirme se estiver pronto para iniciar a variante B e pausar a original.

Não houve chamada à Google Ads API nem alteração de campanha durante a preparação deste pacote. O pacote está local e ainda não foi enviado ou validado no servidor.

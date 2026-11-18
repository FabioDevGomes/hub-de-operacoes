# Diagnóstico das falhas ao aplicar sitelinks

Pacote incremental para que o navegador possa ler os cabeçalhos técnicos enviados pelo serviço Google Ads. O Hub já exibe esses dados por campanha quando disponíveis; a falha anterior era que o endpoint de ações não os expunha via CORS.

## Arquivos para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-sitelink-diagnostics\hostinger-private-tools
```

1. [google-ads-campaign-action-service.php](hostinger-private-tools/google-ads-campaign-action-service.php) — expõe ao Hub os cabeçalhos de diagnóstico do endpoint de ações.
2. [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php) — registra e retorna o diagnóstico sanitizado da resposta Google: ID, etapa, HTTP upstream, status, códigos, campos e ID da requisição, quando fornecidos.

Faça backup dos dois arquivos PHP existentes e substitua somente esses dois arquivos no destino. Mantenha os demais serviços, credenciais, JSON de públicos e configuração no diretório.

Não há SQL, alteração de `tracking-config.php`, wrapper público ou configuração. A atualização não chama a Google Ads API. Ela não repete nem altera a tentativa de sitelinks.

## Conferência depois do deploy

1. Atualize/reabra o Hub local atual. Não é necessário novo build do Hub: a interface já mostra os detalhes quando recebe os cabeçalhos.
2. Use **Tentar novamente nos pendentes** uma vez.
3. Na falha de cada campanha, confira o ID de diagnóstico, etapa, HTTP/status Google, códigos e campos rejeitados que aparecerem.
4. Se houver ID, localize a linha correspondente no log PHP da Hostinger para o detalhe estruturado.

A ação continua processando os sitelinks pendentes sequencialmente. Uma tentativa com resultado incerto deve ser avaliada pelo diagnóstico antes de novas repetições.

O pacote está local e ainda não foi enviado ao servidor.

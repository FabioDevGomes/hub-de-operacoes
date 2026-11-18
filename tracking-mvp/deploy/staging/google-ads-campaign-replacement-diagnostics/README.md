# Google Ads — diagnóstico da prévia de substituição B

Pacote incremental para expor diagnóstico técnico sanitizado quando a validação de **Pausar e duplicar como B** for rejeitada. O Hub local deve estar na versão **v1.321.1** para apresentar os novos campos.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools`

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\google-ads-campaign-replacement-diagnostics\hostinger-private-tools
```

Arquivo local: [google-ads-readonly-service.php](hostinger-private-tools/google-ads-readonly-service.php)  
Arquivo de destino: `google-ads-readonly-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/google-ads-readonly-service.php`

Faça backup do arquivo atual no servidor e substitua somente esse arquivo. Não envie README, configuração, credenciais ou outros arquivos. Não há SQL nem alteração de configuração.

## O que muda

Em erros do Google Ads, o serviço já registra um resumo sanitizado, códigos, caminhos de campo, versão, operação e recurso GAQL. Este pacote também os expõe em headers CORS para que o Hub v1.321.1 mostre os detalhes disponíveis na mensagem. URLs, emails, IDs longos e respostas/payloads brutos não são exibidos.

Este pacote melhora o diagnóstico; ele não afirma que o campo GAQL rejeitado já foi corrigido. A próxima prévia deve ser usada somente para coletar a causa precisa. Pare na prévia: não confirme a substituição.

## Conferência após o envio

1. Faça backup do arquivo existente e substitua somente `google-ads-readonly-service.php` no destino acima.
2. Confirme que o Hub local mostra **v1.321.1** e recarregue a tela.
3. Na ficha da campanha, clique **Pausar e duplicar como B** para gerar uma nova prévia e copie o diagnóstico sanitizado exibido.
4. Pare na prévia. Ela consulta e valida, mas não cria a variante B nem pausa a campanha original.

O arquivo está local; não foi enviado nem validado no servidor. Nenhuma conta ou campanha foi alterada durante a preparação.

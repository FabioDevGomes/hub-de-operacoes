# GuruMedia: diagnóstico do clique associado à venda

Pacote incremental para exibir, na linha de cada venda, o horário UTC do clique e os seis caracteres finais do GCLID mascarado. O GCLID completo permanece no servidor e não é devolvido ao Hub.

**Estado:** preparado localmente; não enviado ao servidor.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/`

Faça backup do arquivo existente e substitua somente `gurumedia-sales-service.php` pela cópia deste pacote.

Pasta local de upload:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-clickview-click-diagnostics\hostinger-private-tools\
```

Arquivo local: [gurumedia-sales-service.php](hostinger-private-tools/gurumedia-sales-service.php)  
Arquivo de destino: `gurumedia-sales-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/gurumedia-sales-service.php`

## Dependências e escopo

- O serviço `google-ads-readonly-service.php`, `tracking-config.php`, credenciais e banco existentes permanecem no lugar; este pacote não os substitui.
- Não há migração SQL nem mudança de schema.
- Não envie wrappers públicos, arquivos do `public_html`, o worker/Cron ou o conteúdo da raiz do pacote.
- O Hub atualizado para v1.352.0 já contém a coluna e não faz parte do upload da Hostinger.
- Nenhuma venda/conversão é enviada ao Google Ads por esta alteração.

## Instalação e validação

1. Faça e confira um backup privado do `gurumedia-sales-service.php` atual.
2. Envie o arquivo listado acima para o diretório `private-tools` indicado, substituindo somente esse arquivo.
3. Opcionalmente, valide a sintaxe no servidor com `php -l gurumedia-sales-service.php`.
4. No Hub v1.352.0, atualize **Vendas e cliques** para consultar o serviço e conferir o horário UTC e o GCLID mascarado da venda.

A atualização manual também executa a consulta de atribuição ClickView já existente, limitada pelo serviço a até 20 consultas Google Ads por atualização. Só a execute quando estiver pronto para atualizar esse relatório. Se o clique não for único, não tiver GCLID válido ou não tiver horário válido, o diagnóstico continuará indisponível.
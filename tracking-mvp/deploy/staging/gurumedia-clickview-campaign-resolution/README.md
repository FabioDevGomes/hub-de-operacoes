# GuruMedia: identificação de campanha via ClickView

Pacote incremental para mostrar, na tabela de vendas da tela **Tracking GuruMedia**, a campanha Google Ads associada ao clique que gerou a venda. O acionamento fica integrado ao botão manual **Atualizar vendas e cliques**; não cria botão novo.

## Arquivo para publicar

**Destino no servidor:** `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/`

Faça backup da versão existente e substitua somente `gurumedia-sales-service.php` pelo arquivo deste pacote. A pasta de upload contém somente esse arquivo.

Pasta local do arquivo:

```text
C:\Users\Fabio-Vaio\Documents\Codex\2026-08-23\contexto-permanente-trabalho-com-marketing-de\painel-operacao\tracking-mvp\deploy\staging\gurumedia-clickview-campaign-resolution\hostinger-private-tools\
```

Arquivo local: [gurumedia-sales-service.php](hostinger-private-tools/gurumedia-sales-service.php)  
Destino: `private-tools/gurumedia-sales-service.php` — `/home/u572283517/domains/travenzo.shop/domains/travenzo.shop/private-tools/gurumedia-sales-service.php`

## Dependências e ordem

- O arquivo usa o serviço `google-ads-readonly-service.php` já existente no mesmo diretório privado para credenciais, autenticação, transporte de busca e configuração Google Ads. Este pacote não substitui esse serviço, o wrapper público `gurumedia-sales-report.php`, `tracking-config.php` nem arquivos de credenciais.
- Não há migração SQL nem alteração de schema.
- Não publique arquivos de `public_html`, não altere a integração externa, o postback GuruMedia ou o Cron.
- O build do Hub é local e fica no projeto separado `painel-operacao`; não faz parte do upload para a Hostinger.

## Comportamento

1. No clique manual **Atualizar vendas e cliques**, o Hub atualiza o relatório e envia ao serviço privado somente período e mapeamento Track → conta-cliente/MCC obtido do manifesto.
2. O serviço encontra o `click_id` guardado na venda, exige exatamente um evento `outbound_click` e lê o GCLID desse evento no banco do Tracking. GCLID e IDs de clique não são devolvidos ao navegador.
3. A API Google Ads consulta ClickView na conta-cliente correta. Cada consulta limita-se a um dia no fuso local dessa conta; o histórico disponível é de até 90 dias. Para reduzir cota e tempo, há um máximo de 20 chamadas Google Ads por atualização, incluindo consultas de fuso da conta.
4. Se houver uma única campanha compatível, o Hub mostra o nome e o ID. Sem correspondência única, a tabela exibe o diagnóstico (por exemplo, sem GCLID, clique ambíguo, fora da janela, MCC não identificada, limite ou erro).

A atualização automática da tela não consulta ClickView. O resultado é informativo e pode ser guardado no snapshot local junto ao nome/ID da campanha; não envia conversões ao Google Ads, não altera campanhas, não escolhe uma ação de conversão e não muda vendas, postback ou banco. A consulta segue os limites documentados do [Google Ads ClickView](https://developers.google.com/google-ads/api/reference/rpc/v23/ClickView).

## Verificação após o upload

Na tela local do Hub, selecione um período que inclua a venda e clique **Atualizar vendas e cliques**. Confira a coluna **Campanha Google Ads · ClickView** e o resumo da consulta. Uma venda sem GCLID capturado, com MCC ambígua ou cujo clique não esteja no ClickView continuará sem campanha identificada; não é necessário gerar uma venda ou postback artificial para testar.

**Estado:** arquivos preparados localmente; não enviados ao servidor nesta etapa.
